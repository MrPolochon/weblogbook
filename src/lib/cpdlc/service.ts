import type { createAdminClient } from '@/lib/supabase/admin';
import { CODES_OACI_VALIDES } from '@/lib/aeroports-ptfs';
import { lookupRadioFrequency } from '@/lib/radio-directory';
import { fetchAtisBot, type BotOverviewResponse } from '@/lib/atis-bot-api';
import { ACTIVE_PLANS, airportCode, clearanceText, coversAirport, CpdlcError, displayText, requiredText, routeStation, stationCode, uuid, validateInit } from './policy';
import type { CpdlcInbox, CpdlcMessage, CpdlcStation } from './types';
import { requestWeather } from './weather';

type Admin = ReturnType<typeof createAdminClient>;
type Plan = { id: string; numero_vol: string; pilote_id: string; copilote_id: string | null; statut: string };
type Row = Omit<CpdlcMessage, 'incoming' | 'acknowledged'> & { sender_user_ids: string[]; client_request_id: string };
type Context = { userId: string; plan: Plan | null; station: CpdlcStation | null; stations: CpdlcStation[]; mode: 'pilot' | 'atc' };
const PLAN_FIELDS = 'id,numero_vol,pilote_id,copilote_id,statut';
function checked(error: { message?: string; code?: string } | null) {
  if (error) {
    console.error('[cpdlc]', error.code, error.message);
    throw new CpdlcError('CPDLC TEMPORARILY UNAVAILABLE', 503);
  }
}
function crew(plan: Plan): string[] { return [...new Set([plan.pilote_id, plan.copilote_id].filter((v): v is string => Boolean(v)))]; }
async function stations(admin: Admin): Promise<CpdlcStation[]> {
  const { data, error } = await admin.from('atc_sessions').select('id,user_id,aeroport,position,started_at'); checked(error);
  return (data ?? []).map(s => ({ session_id: s.id, user_id: s.user_id, code: stationCode(s.aeroport), position: s.position, started_at: s.started_at }));
}
export async function contextFor(admin: Admin, userId: string, planId?: unknown): Promise<Context> {
  const online = await stations(admin);
  if (planId) {
    const { data, error } = await admin.from('plans_vol').select(PLAN_FIELDS).eq('id', uuid(planId)).maybeSingle(); checked(error);
    if (!data || !crew(data).includes(userId) || !ACTIVE_PLANS.includes(data.statut)) throw new CpdlcError('ACTIVE FLIGHT CREW REQUIRED', 403);
    return { userId, plan: data, station: null, stations: online, mode: 'pilot' };
  }
  const station = online.find(s => s.user_id === userId) ?? null;
  if (!station) throw new CpdlcError('ACTIVE ATC SESSION REQUIRED', 403);
  const { data: profile, error } = await admin.from('profiles').select('role,atc').eq('id', userId).maybeSingle(); checked(error);
  if (!(profile?.role === 'admin' || profile?.role === 'atc' || profile?.atc)) throw new CpdlcError('ATC ACCESS REQUIRED', 403);
  return { userId, plan: null, station, stations: online, mode: 'atc' };
}
async function assertCallsign(admin: Admin, plan: Plan, callsign: unknown): Promise<string> {
  const code = stationCode(requiredText(callsign, 'FLT NO', 16));
  if (!/^[A-Z0-9]{2,16}$/.test(code) || code !== stationCode(plan.numero_vol)) throw new CpdlcError('FLT NO DOES NOT MATCH FILED FLIGHT PLAN');
  const { data, error } = await admin.from('plans_vol').select('id,numero_vol').in('statut', ACTIVE_PLANS).ilike('numero_vol', `%${code.split('').join('%')}%`); checked(error);
  if ((data ?? []).filter(p => stationCode(p.numero_vol) === code).length !== 1) throw new CpdlcError('AMBIGUOUS STATION - CHECK FLIGHT NUMBER', 409);
  return code;
}
async function frequencyFallback(admin: Admin, airport: string, target: CpdlcStation | null): Promise<string> {
  if (target) {
    const frequency = await lookupRadioFrequency(admin, target.code, target.position);
    if (frequency) return frequency;
  }
  // Use the network's published local frequency. Never invent a generic UNICOM.
  for (const position of ['AFIS', 'Tower', 'Ground', 'APP', 'Center']) {
    const frequency = await lookupRadioFrequency(admin, airport, position);
    if (frequency) return frequency;
  }
  return 'PUBLISHED ADVISORY FREQUENCY';
}
async function apply(admin: Admin, context: Context, action: string, data: Record<string, unknown>): Promise<string> {
  const { data: id, error } = await admin.rpc('cpdlc_apply', { p_actor: context.userId, p_action: action, p_data: data });
  if (error?.code === 'P0001') throw new CpdlcError(displayText(error.message), 409);
  checked(error); return String(id);
}
function permittedContext(row: Row, context: Context): boolean {
  if (context.plan) return (row.plan_id === context.plan.id || row.recipient_plan_id === context.plan.id)
    && (row.sender_user_ids.includes(context.userId) || row.recipient_user_ids.includes(context.userId));
  return (row.payload.sender_mode === 'atc' && row.sender_user_id === context.userId && row.payload.sender_session_id === context.station?.session_id)
    || (row.payload.recipient_mode === 'atc' && row.recipient_user_ids.includes(context.userId)
      && row.assigned_session_id === context.station?.session_id);
}
async function recipientMessage(admin: Admin, context: Context, id: unknown): Promise<Row> {
  const { data, error } = await admin.from('cpdlc_messages').select('*').eq('id', uuid(id)).maybeSingle(); checked(error);
  if (!data || !data.recipient_user_ids.includes(context.userId) || !permittedContext(data, context)) throw new CpdlcError('MESSAGE NOT AVAILABLE TO THIS STATION', 403);
  return data;
}
async function reconcile(admin: Admin, context: Context) {
  if (!context.stations.length) return;
  const covered = context.station ? [...CODES_OACI_VALIDES].filter(code => coversAirport(context.station!, code)) : [];
  if (context.station && !covered.length) return;
  // Filter current assignments before pagination. A historical timed-out request
  // cannot hide a newer recoverable request, and each poll only scans this flight
  // or this controller's coverage rather than the entire network.
  const onlineIds = context.stations.map(s => s.session_id).join(',');
  let cursor: string | null = null;
  for (;;) {
    let query = admin.from('cpdlc_messages').select('*').in('kind', ['CLEARANCE', 'FREE_TEXT', 'RESPONSE'])
      .in('status', ['SENT', 'STANDBY', 'TIMED_OUT', 'WILCO', 'UNABLE', 'ROGER']).is('recipient_plan_id', null)
      .eq('payload->>recipient_mode', 'atc')
      .or(`assigned_session_id.is.null,assigned_session_id.not.in.(${onlineIds})`);
    if (context.plan) query = query.eq('plan_id', context.plan.id);
    else query = query.in('payload->>airport', covered);
    if (cursor) query = query.gt('id', cursor);
    const { data, error } = await query.order('id').limit(100); checked(error);
    const rows = (data ?? []) as Row[];
    const planIds = [...new Set(rows.map(row => row.plan_id).filter((id): id is string => Boolean(id)))];
    const active = planIds.length ? await admin.from('plans_vol').select('id').in('id', planIds).in('statut', ACTIVE_PLANS) : { data: [], error: null };
    checked(active.error);
    const activeIds = new Set((active.data ?? []).map(plan => plan.id));
    for (const row of rows) {
      if (row.plan_id && !activeIds.has(row.plan_id)) continue;
      const airport = typeof row.payload.airport === 'string' ? row.payload.airport : row.to_station;
      const target = routeStation(context.stations, airport, row.kind === 'CLEARANCE' || ['WILCO', 'UNABLE', 'STANDBY'].includes(String(row.payload.response)));
      if (target) await apply(admin, context, 'assign', { message_id: row.id, expected_session_id: row.assigned_session_id, target_user_id: target.user_id, target_session_id: target.session_id });
    }
    if (rows.length < 100) break;
    cursor = rows[rows.length - 1].id;
  }
}
export async function readInbox(admin: Admin, context: Context): Promise<CpdlcInbox> {
  await reconcile(admin, context);
  // SQL scopes to the authorized flight/session BEFORE taking recent history,
  // and always includes every unread incoming message beyond that history cap.
  const query = async () => {
    const inbox = new Map<string, Row>();
    for (let offset = 0; ; offset += 500) {
      const { data, error } = await admin.rpc('cpdlc_inbox', { p_actor: context.userId, p_plan: context.plan?.id ?? null, p_session: context.station?.session_id ?? null }).range(offset, offset + 499);
      if (error) return { data: null, error };
      const page = (data ?? []) as Row[];
      for (const row of page) inbox.set(row.id, row);
      if (page.length < 500) break;
    }
    return { data: [...inbox.values()], error: null };
  };
  let { data, error } = await query(); checked(error);
  let rows = ((data ?? []) as Row[]).filter(row => permittedContext(row, context));
  const expired = rows.filter(m => m.deadline_at && Date.parse(m.deadline_at) <= Date.now() && ['SENT', 'STANDBY'].includes(m.status));
  if (expired.length) {
    for (const row of expired) await apply(admin, context, 'expire', { message_id: row.id });
    const refreshed = await query(); checked(refreshed.error); rows = ((refreshed.data ?? []) as Row[]).filter(row => permittedContext(row, context));
  }
  const acknowledged = new Set<string>();
  for (let offset = 0; offset < rows.length; offset += 200) {
    const receipts = await admin.from('cpdlc_receipts').select('message_id').eq('user_id', context.userId).in('message_id', rows.slice(offset, offset + 200).map(m => m.id));
    checked(receipts.error);
    for (const receipt of receipts.data ?? []) acknowledged.add(receipt.message_id);
  }
  return { available: true, mode: context.mode, user_id: context.userId, station: context.plan ? stationCode(context.plan.numero_vol) : context.station!.code,
    plan_id: context.plan?.id ?? null, stations: context.stations, messages: rows.map(({ sender_user_ids: _senders, client_request_id: _key, ...row }) => ({ ...row,
      incoming: row.recipient_user_ids.includes(context.userId), acknowledged: acknowledged.has(row.id) })) };
}

export async function executeCommand(admin: Admin, context: Context, body: Record<string, unknown>): Promise<string> {
  const action = body.action;
  if (action === 'ack') {
    const row = await recipientMessage(admin, context, body.message_id);
    return apply(admin, context, 'ack', { message_id: row.id });
  }
  const requestId = uuid(body.client_request_id);
  // Retry existing committed operations before rechecking a now-transferred row.
  const previous = await admin.from('cpdlc_messages').select('id').eq('sender_user_id', context.userId).eq('client_request_id', requestId).maybeSingle(); checked(previous.error);
  if (previous.data) return previous.data.id;
  if (action === 'transfer') {
    if (!context.station) throw new CpdlcError('ATC ONLY', 403);
    const operation = await admin.from('cpdlc_operations').select('message_id').eq('actor_id', context.userId).eq('request_id', requestId).maybeSingle(); checked(operation.error);
    if (operation.data) return operation.data.message_id;
    const row = await recipientMessage(admin, context, body.message_id);
    const target = context.stations.find(s => s.session_id === uuid(body.session_id));
    if (!target) throw new CpdlcError('TARGET STATION OFFLINE', 409);
    if (target.session_id === context.station.session_id) throw new CpdlcError('ALREADY ASSIGNED TO THIS STATION');
    if (!routeStation([target], row.to_station, row.kind === 'CLEARANCE')) throw new CpdlcError('TARGET STATION DOES NOT COVER THIS AIRPORT');
    return apply(admin, context, 'transfer', { message_id: row.id, client_request_id: requestId, target_user_id: target.user_id, target_session_id: target.session_id });
  }
  if (action === 'respond') return respond(admin, context, body, requestId);
  if (!['clearance', 'free_text', 'atis', 'weather'].includes(String(action))) throw new CpdlcError('UNKNOWN ACTION');
  if (action !== 'free_text' && !context.plan) throw new CpdlcError('PILOT STATION REQUIRED', 403);
  const init = action === 'clearance' ? validateInit(body.init) : null;
  const from = context.plan ? await assertCallsign(admin, context.plan, init?.flight_no ?? body.flight_no) : context.station!.code;
  const base = { from_station: from, sender_user_ids: context.plan ? crew(context.plan) : [context.userId], plan_id: context.plan?.id ?? null, client_request_id: requestId };
  if (action === 'atis' || action === 'weather') {
    let text: string; let to: string;
    if (action === 'atis') {
      to = airportCode(body.airport);
      const overview = await fetchAtisBot<BotOverviewResponse>('/webhook/overview', { timeoutMs: 8000 });
      if (overview.error) text = `ATIS SERVICE UNAVAILABLE FOR ${to} - TRY AGAIN LATER`;
      else {
        const active = overview.data?.instances.find(i => i.broadcasting && stationCode(i.airport) === to && i.atis_text);
        text = active?.atis_text ? `ATIS ${to}\n${active.atis_text}` : `NO ATIS AVAILABLE FOR ${to}`;
      }
    } else {
      if (!Array.isArray(body.airports) || body.airports.length < 1 || body.airports.length > 4 || !['METAR', 'TAF'].includes(String(body.wx_type))) throw new CpdlcError('SELECT METAR OR TAF AND ONE TO FOUR AIRPORTS');
      const airports = [...new Set(body.airports.map(airportCode))];
      to = 'WX'; text = await requestWeather(airports, body.wx_type as 'METAR' | 'TAF');
    }
    // Automated responses are addressed to the crew; displayed source is ATS/WX.
    return apply(admin, context, 'send', { ...base, from_station: to, to_station: from, recipient_user_ids: crew(context.plan!), kind: action === 'atis' ? 'ATIS' : 'WX',
      body: displayText(text).slice(0, 12000), response_required: false, payload: { sender_mode: 'system', recipient_mode: 'pilot', automatic: true } });
  }
  const to = init ? init.dep : stationCode(requiredText(body.to, 'DESTINATION STATION', 16));
  const text = init ? `CLEARANCE REQUEST\nFLT NO ${init.flight_no}\nDEP ${init.dep}\nDEST ${init.dest}\nALTN ${init.altn || 'NONE'}\nETE ${init.ete}\nUTC ${init.utc}\nDATE ${init.date}` : requiredText(body.text, 'TEXT');
  if (CODES_OACI_VALIDES.has(to)) {
    const target = routeStation(context.stations, to, Boolean(init));
    const fallback = await frequencyFallback(admin, to, target);
    return apply(admin, context, 'send', { ...base, to_station: to, recipient_user_ids: target ? [target.user_id] : [], assigned_session_id: target?.session_id ?? null,
      kind: init ? 'CLEARANCE' : 'FREE_TEXT', body: text, status: target ? 'SENT' : 'STANDBY', response_required: true,
      deadline_at: new Date(Date.now() + (target ? 300_000 : 30_000)).toISOString(), payload: { sender_mode: context.mode, recipient_mode: 'atc', sender_session_id: context.station?.session_id ?? null, init, airport: to, fallback_frequency: fallback } });
  }
  if (init) throw new CpdlcError('INVALID CLEARANCE AIRPORT');
  if (!/^[A-Z0-9]{2,16}$/.test(to)) throw new CpdlcError('INVALID STATION');
  const { data: plans, error } = await admin.from('plans_vol').select(PLAN_FIELDS).in('statut', ACTIVE_PLANS).ilike('numero_vol', `%${to.split('').join('%')}%`); checked(error);
  const matching = (plans ?? []).filter(p => stationCode(p.numero_vol) === to);
  if (matching.length > 1) throw new CpdlcError('AMBIGUOUS STATION - CHECK FLIGHT NUMBER', 409);
  const target = matching[0];
  if (!target) throw new CpdlcError('STATION NOT AVAILABLE', 404);
  if (target.id === context.plan?.id) throw new CpdlcError('CANNOT SEND TO OWN STATION');
  return apply(admin, context, 'send', { ...base, to_station: to, recipient_user_ids: crew(target), recipient_plan_id: target.id,
    kind: 'FREE_TEXT', body: text, response_required: false, payload: { sender_mode: context.mode, recipient_mode: 'pilot', airport: context.station?.code ?? null, sender_session_id: context.station?.session_id ?? null } });
}

async function respond(admin: Admin, context: Context, body: Record<string, unknown>, requestId: string): Promise<string> {
  const parent = await recipientMessage(admin, context, body.message_id);
  const response = String(body.response);
  const isAtc = context.mode === 'atc';
  if (!['CLEAR', 'REFUSED', 'WILCO', 'UNABLE', 'STANDBY', 'ROGER', 'FREE_TEXT'].includes(response)) throw new CpdlcError('INVALID RESPONSE');
  if (['ATIS', 'WX', 'SYSTEM'].includes(parent.kind)) throw new CpdlcError('INFORMATION MESSAGE - ACK ONLY');
  if (['CLEAR', 'REFUSED'].includes(response) && (!isAtc || parent.kind !== 'CLEARANCE')) throw new CpdlcError('CLEARANCE RESPONSE NOT ALLOWED', 403);
  if (['WILCO', 'UNABLE', 'STANDBY'].includes(response) && (isAtc || parent.kind !== 'RESPONSE' || parent.payload.response !== 'CLEAR')) throw new CpdlcError('OPERATIONAL RESPONSE REQUIRES A CLEARANCE', 403);
  if (!isAtc) {
    const { data, error } = await admin.from('cpdlc_receipts').select('message_id').eq('message_id', parent.id).eq('user_id', context.userId).maybeSingle(); checked(error);
    if (!data) throw new CpdlcError('ACK MESSAGE FIRST', 409);
  }
  const text = response === 'CLEAR' ? clearanceText(body.clearance) : response === 'FREE_TEXT' ? requiredText(body.text, 'TEXT') : response === 'REFUSED' ? 'CLEARANCE REFUSED' : response;
  const targetMode = parent.payload.sender_mode === 'atc' ? 'atc' : 'pilot';
  const routingAirport = typeof parent.payload.airport === 'string' ? parent.payload.airport : targetMode === 'atc' ? parent.from_station : parent.to_station;
  let recipientIds = parent.sender_user_ids;
  let assigned: string | null = null;
  if (targetMode === 'atc') {
    // Replies belong to the original ATS session, never to an unrelated new
    // position occupied by the same person after disconnecting.
    const target = context.stations.find(s => s.session_id === parent.payload.sender_session_id)
      ?? routeStation(context.stations, routingAirport, ['WILCO', 'UNABLE', 'STANDBY'].includes(response));
    recipientIds = target ? [target.user_id] : [];
    assigned = target?.session_id ?? null;
  } else {
    const targetPlanId = parent.plan_id;
    const { data: plan, error } = await admin.from('plans_vol').select(PLAN_FIELDS).eq('id', targetPlanId).maybeSingle(); checked(error);
    if (!plan || !ACTIVE_PLANS.includes(plan.statut)) throw new CpdlcError('FLIGHT STATION NO LONGER ACTIVE', 409);
    recipientIds = crew(plan);
  }
  return apply(admin, context, 'reply', { message_id: parent.id, client_request_id: requestId, from_station: context.plan ? stationCode(context.plan.numero_vol) : context.station!.code,
    to_station: parent.from_station, sender_user_ids: context.plan ? crew(context.plan) : [context.userId], recipient_user_ids: recipientIds,
    plan_id: context.plan?.id ?? parent.plan_id, recipient_plan_id: targetMode === 'pilot' ? parent.plan_id : null, assigned_session_id: assigned,
    kind: 'RESPONSE', body: text, status: response === 'FREE_TEXT' ? 'SENT' : response, response_required: response === 'CLEAR',
    payload: { sender_mode: context.mode, recipient_mode: targetMode, response, airport: routingAirport, sender_session_id: context.station?.session_id ?? null } });
}
