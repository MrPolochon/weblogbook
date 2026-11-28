'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { ArrowLeft, ArrowRight, Check, ChevronRight, MessageSquare, PhoneOff, Plane, Radio, RefreshCw, Send, Trash2, Volume2, X } from 'lucide-react';
import { useCpdlc } from '@/hooks/useCpdlc';
import { useCpdlcAlarm } from './useCpdlcAlarm';
import type { CpdlcCommand, CpdlcMessage, CpdlcStation } from '@/lib/cpdlc/types';
import { useAtcTheme } from '@/contexts/AtcThemeContext';
import { ATC_NAV_BTN, atcNavIdle, atcNavOpen } from '@/lib/atc-ui';
import { clearanceText, routeStation } from '@/lib/cpdlc/policy';
import { cn } from '@/lib/utils';

type Clearance = NonNullable<Extract<CpdlcCommand, { action: 'respond' }>['clearance']>;
type EnrouteDirective =
  | 'CLEARED CLIMB TO'
  | 'CLEARED DESCEND TO'
  | 'MAINTAIN'
  | 'CLEARED DIRECT TO'
  | 'MAINTAIN SPEED'
  | 'FLY HEADING'
  | 'CONTACT'
  | 'SQUAWK'
  | 'UNABLE'
  | 'STANDBY';

type EnrouteClearance = {
  directive: EnrouteDirective;
  value: string;
  restriction: string;
  text: string;
};

type Editor =
  | 'choice'
  | 'clearance'
  | 'preview'
  | 'enroute'
  | 'enroute_preview'
  | 'aircraft_clearance'
  | 'aircraft_clearance_preview'
  | 'aircraft_handover'
  | 'aircraft_terminate'
  | 'text'
  | 'transfer'
  | 'compose'
  | null;

const upper = (value: string) => value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toUpperCase();
const emptyClearance: Clearance = { destination: '', departure: '', altitude: '', squawk: '', frequency: '', text: '' };
const emptyEnroute: EnrouteClearance = { directive: 'CLEARED CLIMB TO', value: '', restriction: '', text: '' };
const time = (value: string) => new Date(value).toISOString().slice(11, 16) + 'Z';

const isLogonMessage = (message: CpdlcMessage) => upper(message.body).startsWith('LOGON REQUEST');
const isEnrouteRequest = (message: CpdlcMessage) => upper(message.body).startsWith('ATC REQUEST');
const isPositionReport = (message: CpdlcMessage) => upper(message.body).startsWith('POSITION REPORT');
const isHandoverNotice = (message: CpdlcMessage) => upper(message.body).startsWith('HANDOVER INCOMING');

const POSITION_FLOW = ['Delivery', 'Clairance', 'Ground', 'Tower', 'DEP', 'APP', 'Center'];
const STALE_SESSION_MS = 90 * 60 * 1000;

const kindLabel = (message: CpdlcMessage) => {
  if (typeof message.payload.request_type === 'string') return message.payload.request_type + ' REQUEST';
  if (isLogonMessage(message)) return 'LOGON REQUEST';
  if (isHandoverNotice(message)) return 'SECTOR HANDOVER';
  if (isEnrouteRequest(message)) return 'ATC REQUEST';
  if (isPositionReport(message)) return 'POSITION REPORT';
  return message.kind.replace('_', ' ');
};

const stationLabel = (station: { code: string; position: string }) => {
  const code = upper(station.code).trim();
  const pos = upper(station.position).trim();
  return code.includes('_') ? code : `${code}_${pos}`;
};

export function clearancePreview(clearance: Clearance): string {
  return clearanceText(clearance);
}

export function enroutePreview(enroute: EnrouteClearance): string {
  const main = ['UNABLE', 'STANDBY'].includes(enroute.directive)
    ? enroute.directive
    : `${enroute.directive} ${upper(enroute.value).trim()}`.trim();
  const lines = [main];
  if (enroute.restriction.trim()) lines.push(upper(enroute.restriction).trim());
  if (enroute.text.trim()) lines.push(upper(enroute.text).trim());
  return lines.join('\n');
}

export default function AtcCpdlcPanel() {
  const { theme } = useAtcTheme();
  const dark = theme === 'dark';
  const { data, error, loading, busy, refresh, act } = useCpdlc();
  const messages = useMemo(() => data?.messages ?? [], [data?.messages]);
  const unread = useMemo(() => messages.filter(message => message.incoming && !message.acknowledged), [messages]);
  const alarm = useCpdlcAlarm(unread.length > 0);
  const [open, setOpen] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [selectedAircraft, setSelectedAircraft] = useState<string | null>(null);
  const [dismissedAt, setDismissedAt] = useState<Record<string, number>>({});
  const [editor, setEditor] = useState<Editor>(null);
  const [clearance, setClearance] = useState<Clearance>(emptyClearance);
  const [enroute, setEnroute] = useState<EnrouteClearance>(emptyEnroute);
  const [replyText, setReplyText] = useState('');
  const [recipient, setRecipient] = useState('');
  const [transferSession, setTransferSession] = useState('');
  const [handoverSessionId, setHandoverSessionId] = useState('');
  const [voiceFrequency, setVoiceFrequency] = useState('');
  const [terminateReason, setTerminateReason] = useState('END OF ATC SERVICE');
  const [actionError, setActionError] = useState('');
  const [filter, setFilter] = useState<'all' | 'unread'>('all');
  const trigger = useRef<HTMLButtonElement>(null);
  const panel = useRef<HTMLElement>(null);
  const content = useRef<HTMLDivElement>(null);
  const inboxScroll = useRef(0);
  const draftMessageId = useRef<string | null>(null);
  const requestId = useRef<string | null>(null);
  const requestContent = useRef<string | null>(null);
  const selected = messages.find(message => message.id === selectedId);
  const selectedRequestPending = Boolean(selected && ['SENT', 'STANDBY', 'TIMED_OUT'].includes(selected.status));
  const selectedRequestAnswered = selected?.kind === 'CLEARANCE' && !selectedRequestPending;
  const transferStations = selected ? (data?.stations ?? []).filter(station => station.user_id !== data?.user_id && routeStation([station], selected.to_station, selected.kind === 'CLEARANCE')) : [];
  const onlineControllers = useMemo(
    () => (data?.stations ?? []).filter(station => station.user_id !== data?.user_id),
    [data?.stations, data?.user_id],
  );
  const myStation = useMemo(
    () => (data?.stations ?? []).find(station => station.user_id === data?.user_id),
    [data?.stations, data?.user_id],
  );
  const visibleMessages = (filter === 'unread' ? unread : messages).slice().sort((a, b) => b.created_at.localeCompare(a.created_at));
  const shell = dark ? 'bg-[#0b1220] text-slate-100 border-slate-700' : 'bg-white text-slate-900 border-slate-300';
  const muted = dark ? 'text-slate-400' : 'text-slate-600';
  const field = cn('w-full rounded-lg border px-3 py-2 text-sm font-mono uppercase focus:outline-none focus:ring-2 focus:ring-sky-500', dark ? 'bg-slate-950 border-slate-700' : 'bg-slate-50 border-slate-300');
  const button = cn('inline-flex min-h-10 items-center justify-center gap-2 rounded-lg border px-3 py-2 text-sm font-semibold disabled:opacity-40', dark ? 'border-slate-700 hover:bg-slate-800' : 'border-slate-300 hover:bg-slate-100');

  const sortedHandoverControllers = useMemo(() => {
    const myBaseIcao = upper(myStation?.code ?? data?.station ?? '').split('_')[0];
    const myPosIdx = myStation ? POSITION_FLOW.indexOf(myStation.position) : -1;

    const scoreStation = (st: CpdlcStation) => {
      const sameAirport = upper(st.code).split('_')[0] === myBaseIcao;
      const stPosIdx = POSITION_FLOW.indexOf(st.position);
      const isNextStep = myPosIdx !== -1 && stPosIdx > myPosIdx;
      const stepDistance = isNextStep ? stPosIdx - myPosIdx : 50 + (stPosIdx === -1 ? 99 : stPosIdx);
      return (sameAirport ? 0 : 100) + stepDistance;
    };

    return [...onlineControllers].sort((a, b) => scoreStation(a) - scoreStation(b));
  }, [onlineControllers, myStation, data?.station]);

  const recommendedHandoverId = useMemo(() => {
    if (!sortedHandoverControllers.length) return '';
    const first = sortedHandoverControllers[0];
    const myBaseIcao = upper(myStation?.code ?? data?.station ?? '').split('_')[0];
    const myPosIdx = myStation ? POSITION_FLOW.indexOf(myStation.position) : -1;
    const firstPosIdx = POSITION_FLOW.indexOf(first.position);
    const isLogicalNext =
      upper(first.code).split('_')[0] === myBaseIcao &&
      (myPosIdx === -1 || firstPosIdx > myPosIdx);
    return isLogicalNext ? first.session_id : '';
  }, [sortedHandoverControllers, myStation, data?.station]);

  const connectedAircraft = useMemo(() => {
    const active = new Map<string, { callsign: string; since: string; lastActivityMs: number; lastMessageId: string }>();
    const chronological = messages.slice().sort((a, b) => a.created_at.localeCompare(b.created_at));
    const now = Date.now();

    for (const msg of chronological) {
      const bodyUpper = upper(msg.body);
      const fromCs = upper(msg.from_station).trim();
      const toCs = upper(msg.to_station).trim();
      const msgTs = Date.parse(msg.created_at) || now;

      if (msg.incoming && (bodyUpper.startsWith('LOGON REQUEST') || bodyUpper.startsWith('LOGON NOTIFICATION'))) {
        active.set(fromCs, { callsign: fromCs, since: msg.created_at, lastActivityMs: msgTs, lastMessageId: msg.id });
      } else if (msg.incoming && bodyUpper.startsWith('HANDOVER INCOMING')) {
        const fltMatch = bodyUpper.match(/FLT\s+([A-Z0-9]+)/);
        const callsign = fltMatch?.[1];
        if (callsign) {
          active.set(callsign, { callsign, since: msg.created_at, lastActivityMs: msgTs, lastMessageId: msg.id });
        }
      } else if (msg.incoming && bodyUpper.startsWith('LOGOFF NOTIFICATION')) {
        active.delete(fromCs);
      } else if (!msg.incoming && (bodyUpper.startsWith('NEXT DATA AUTHORITY') || bodyUpper.startsWith('CPDLC SERVICE TERMINATED'))) {
        if (toCs) active.delete(toCs);
        for (const key of active.keys()) {
          if (toCs.includes(key) || bodyUpper.includes(key)) {
            active.delete(key);
          }
        }
      } else if (msg.incoming && active.has(fromCs)) {
        const current = active.get(fromCs)!;
        active.set(fromCs, { ...current, lastActivityMs: msgTs, lastMessageId: msg.id });
      }
    }

    return [...active.values()].filter(ac => {
      if (now - ac.lastActivityMs > STALE_SESSION_MS) return false;
      const dismissedTs = dismissedAt[ac.callsign];
      if (dismissedTs && ac.lastActivityMs <= dismissedTs) return false;
      return true;
    });
  }, [messages, dismissedAt]);

  useEffect(() => {
    if (!open) return;
    const previous = document.activeElement as HTMLElement | null;
    panel.current?.focus();
    function keydown(event: KeyboardEvent) {
      if (event.key === 'Escape') { event.preventDefault(); setOpen(false); }
      if (event.key !== 'Tab' || !panel.current) return;
      const elements = Array.from(panel.current.querySelectorAll<HTMLElement>('button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [href]')).filter(element => element.getClientRects().length > 0);
      const first = elements[0], last = elements[elements.length - 1];
      if (!first) { event.preventDefault(); return; }
      if (event.shiftKey && (document.activeElement === first || document.activeElement === panel.current)) { event.preventDefault(); last?.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
    }
    document.addEventListener('keydown', keydown);
    return () => { document.removeEventListener('keydown', keydown); if (previous?.isConnected) previous.focus(); };
  }, [open]);

  useEffect(() => {
    if (content.current) content.current.scrollTop = selectedId || selectedAircraft || editor ? 0 : inboxScroll.current;
  }, [selectedId, selectedAircraft, editor]);

  useEffect(() => {
    if (selectedRequestAnswered && ['choice', 'clearance', 'preview', 'transfer'].includes(editor ?? '')) setEditor(null);
  }, [selectedRequestAnswered, editor]);

  function prefillEnrouteFromMessage(message: CpdlcMessage) {
    const body = upper(message.body);
    const levelMatch = body.match(/REQUEST LEVEL\s+([A-Z0-9 ]+)/);
    const directMatch = body.match(/REQUEST DIRECT TO\s+([A-Z0-9]+)/);
    const speedMatch = body.match(/REQUEST SPEED\s+([A-Z0-9.]+)/);
    const hdgMatch = body.match(/REQUEST HEADING\s+([0-9]{1,3})/);
    if (levelMatch) {
      setEnroute({ directive: 'CLEARED CLIMB TO', value: levelMatch[1].trim(), restriction: '', text: '' });
    } else if (directMatch) {
      setEnroute({ directive: 'CLEARED DIRECT TO', value: directMatch[1].trim(), restriction: '', text: '' });
    } else if (speedMatch) {
      setEnroute({ directive: 'MAINTAIN SPEED', value: speedMatch[1].trim(), restriction: '', text: '' });
    } else if (hdgMatch) {
      setEnroute({ directive: 'FLY HEADING', value: hdgMatch[1].trim(), restriction: '', text: '' });
    } else {
      setEnroute(emptyEnroute);
    }
  }

  function openMessage(message: CpdlcMessage) {
    if (!selectedId && !selectedAircraft) inboxScroll.current = content.current?.scrollTop ?? 0;
    if (draftMessageId.current !== message.id) {
      draftMessageId.current = message.id;
      setClearance(emptyClearance);
      prefillEnrouteFromMessage(message);
      setReplyText('');
      setTransferSession('');
    }
    setSelectedAircraft(null);
    setSelectedId(message.id);
    setEditor(null);
    setActionError('');
  }

  function openAircraftPanel(callsign: string) {
    if (!selectedId && !selectedAircraft) inboxScroll.current = content.current?.scrollTop ?? 0;
    setSelectedId(null);
    setSelectedAircraft(callsign);
    setEnroute(emptyEnroute);
    setHandoverSessionId('');
    setReplyText('');
    setEditor(null);
    setActionError('');
  }

  async function submit(command: CpdlcCommand, afterSuccess?: () => void) {
    setActionError('');
    let payload = command;
    if ('client_request_id' in command) {
      const content = JSON.stringify({ ...command, client_request_id: undefined });
      if (content !== requestContent.current) requestId.current = crypto.randomUUID();
      requestContent.current = content;
      payload = { ...command, client_request_id: requestId.current! };
    }
    try {
      await act(payload);
      requestId.current = null;
      requestContent.current = null;
      setEditor(null);
      setReplyText('');
      afterSuccess?.();
    } catch (reason) {
      setActionError(reason instanceof Error ? reason.message : 'MESSAGE NOT SENT. RETRY.');
    }
  }

  async function acceptLogon(message: CpdlcMessage) {
    setActionError('');
    try {
      if (!message.acknowledged) {
        await act({ action: 'ack', message_id: message.id });
      }
      await act({
        action: 'respond',
        message_id: message.id,
        response: 'FREE_TEXT',
        text: `LOGON ACCEPTED - CURRENT ATC ${myStation ? stationLabel(myStation) : data?.station ?? message.to_station}`,
        client_request_id: crypto.randomUUID(),
      });
    } catch (reason) {
      setActionError(reason instanceof Error ? reason.message : 'LOGON ACCEPT FAILED');
    }
  }

  async function transferWithHandover(message: CpdlcMessage) {
    setActionError('');
    const target = transferStations.find(s => s.session_id === transferSession);
    const targetLabel = target ? stationLabel(target) : '';
    const callsign = upper(message.from_station).trim();
    try {
      if (target) {
        await act({
          action: 'respond',
          message_id: message.id,
          response: 'FREE_TEXT',
          text: `NEXT DATA AUTHORITY ${targetLabel}\nHANDOVER TO ${targetLabel} - NOTIFY ${targetLabel}`,
          client_request_id: crypto.randomUUID(),
        });
        await act({
          action: 'free_text',
          to: target.code,
          text: `HANDOVER INCOMING\nFLT ${callsign}\nFROM ${myStation ? stationLabel(myStation) : data?.station ?? 'ATC'}`,
          client_request_id: crypto.randomUUID(),
        }).catch(() => {});
      }
      await submit({
        action: 'transfer',
        message_id: message.id,
        session_id: transferSession,
        client_request_id: requestId.current ?? crypto.randomUUID(),
      }, () => {
        setDismissedAt(prev => ({ ...prev, [callsign]: Date.now() }));
      });
    } catch (reason) {
      setActionError(reason instanceof Error ? reason.message : 'TRANSFER FAILED');
    }
  }

  async function handoverAircraft(callsign: string) {
    setActionError('');
    const targetStation = onlineControllers.find(s => s.session_id === handoverSessionId);
    if (!targetStation) {
      setActionError('SELECT AN ONLINE CONTROLLER FIRST');
      return;
    }
    const targetLabel = stationLabel(targetStation);
    const acEntry = connectedAircraft.find(a => a.callsign === callsign);
    try {
      await act({
        action: 'free_text',
        to: callsign,
        text: `NEXT DATA AUTHORITY ${targetLabel}\nHANDOVER TO ${targetLabel} - NOTIFY ${targetLabel}`,
        client_request_id: crypto.randomUUID(),
      }).catch(() => {});

      await act({
        action: 'free_text',
        to: targetStation.code,
        text: `HANDOVER INCOMING\nFLT ${callsign}\nFROM ${myStation ? stationLabel(myStation) : data?.station ?? 'ATC'}`,
        client_request_id: crypto.randomUUID(),
      }).catch(() => {});

      if (acEntry) {
        const pendingMsg = messages.find(m => m.id === acEntry.lastMessageId && ['SENT', 'STANDBY', 'TIMED_OUT'].includes(m.status));
        if (pendingMsg) {
          await act({
            action: 'transfer',
            message_id: pendingMsg.id,
            session_id: targetStation.session_id,
            client_request_id: crypto.randomUUID(),
          }).catch(() => {});
        }
      }
      setDismissedAt(prev => ({ ...prev, [callsign]: Date.now() }));
      setEditor(null);
      setSelectedAircraft(null);
    } catch (reason) {
      setActionError(reason instanceof Error ? reason.message : 'HANDOVER FAILED');
    }
  }

  async function terminateCpdlcForAircraft(callsign: string) {
    setActionError('');
    const freq = voiceFrequency.replace(',', '.').trim();
    if (!freq) {
      setActionError('VOICE FREQUENCY IS REQUIRED');
      return;
    }
    if (!/^[0-9]{3}\.[0-9]{2,3}$/.test(freq)) {
      setActionError('ENTER VALID VHF FREQUENCY (E.G. 122.800)');
      return;
    }
    const lines = [
      'CPDLC SERVICE TERMINATED',
      `CONTACT ${freq} BY VOICE`,
      terminateReason.trim() ? upper(terminateReason.trim()) : '',
    ].filter(Boolean);

    try {
      await act({
        action: 'free_text',
        to: callsign,
        text: lines.join('\n'),
        client_request_id: crypto.randomUUID(),
      }).catch(() => {});
    } finally {
      setDismissedAt(prev => ({ ...prev, [callsign]: Date.now() + 60_000 }));
      setEditor(null);
      setSelectedAircraft(null);
    }
  }

  function forceClearAircraft(callsign: string) {
    setDismissedAt(prev => ({ ...prev, [callsign]: Date.now() + 60_000 }));
    setEditor(null);
    setSelectedAircraft(null);
    setActionError('');
  }

  function startEditor(next: Editor, presetRecipient = '') {
    requestId.current = crypto.randomUUID(); requestContent.current = null; setActionError(''); setEditor(next);
    if (next === 'compose') {
      if (!selectedId && !selectedAircraft) inboxScroll.current = content.current?.scrollTop ?? 0;
      setRecipient(presetRecipient);
      setReplyText('');
    }
  }

  function statusTone(message: CpdlcMessage) {
    const blinking = message.incoming && !message.acknowledged && ['UNABLE', 'STANDBY'].includes(message.status);
    return cn('border-b border-slate-500/15', blinking && 'animate-pulse motion-reduce:animate-none',
      message.status === 'UNABLE' ? dark ? 'bg-red-950/60 text-red-200' : 'bg-red-100 text-red-900'
        : message.status === 'STANDBY' ? dark ? 'bg-blue-900/50 text-blue-100' : 'bg-blue-100 text-blue-900'
          : (message.status === 'WILCO' || message.status === 'PILOT_RECEIVED') ? dark ? 'bg-emerald-950/50 text-emerald-200' : 'bg-emerald-100 text-emerald-900'
            : selectedId === message.id ? dark ? 'bg-slate-800' : 'bg-slate-100' : '');
  }

  const needsValue = !['UNABLE', 'STANDBY'].includes(enroute.directive);
  const aircraftHistory = selectedAircraft
    ? messages.filter(m => upper(m.from_station).trim() === selectedAircraft || upper(m.to_station).trim() === selectedAircraft).slice().sort((a, b) => b.created_at.localeCompare(a.created_at))
    : [];
  const chosenHandoverStation = onlineControllers.find(s => s.session_id === handoverSessionId);

  const renderEnrouteForm = (onSubmitSuccess: () => void) => (
    <form className="space-y-4 rounded-xl border border-sky-500/30 p-4" onSubmit={event => {
      event.preventDefault();
      if (needsValue && !enroute.value.trim()) {
        setActionError('ENTER THE CLEARANCE VALUE');
        return;
      }
      setActionError('');
      onSubmitSuccess();
    }}>
      <p className="text-xs font-bold uppercase tracking-wider text-sky-400">ENROUTE ATC CLEARANCE</p>
      <label className="block space-y-1 text-xs font-semibold">DIRECTIVE / ACTION
        <select className={field} value={enroute.directive} onChange={event => setEnroute({ ...enroute, directive: event.target.value as EnrouteDirective })}>
          <option value="CLEARED CLIMB TO">CLEARED CLIMB TO</option>
          <option value="CLEARED DESCEND TO">CLEARED DESCEND TO</option>
          <option value="MAINTAIN">MAINTAIN LEVEL / ALTITUDE</option>
          <option value="CLEARED DIRECT TO">CLEARED DIRECT TO</option>
          <option value="MAINTAIN SPEED">MAINTAIN SPEED / MACH</option>
          <option value="FLY HEADING">FLY HEADING</option>
          <option value="CONTACT">CONTACT FREQUENCY</option>
          <option value="SQUAWK">SQUAWK</option>
          <option value="UNABLE">UNABLE</option>
          <option value="STANDBY">STANDBY</option>
        </select>
      </label>
      {needsValue && <label className="block space-y-1 text-xs font-semibold">LEVEL / WAYPOINT / SPEED / HEADING
        <input autoFocus required maxLength={30} className={field} value={enroute.value} onChange={event => setEnroute({ ...enroute, value: upper(event.target.value) })} placeholder="FL350 / MAKEL / 280 KT / 270" />
      </label>}
      <label className="block space-y-1 text-xs font-semibold">RESTRICTION / CONDITION (OPTIONAL)
        <input maxLength={80} className={field} value={enroute.restriction} onChange={event => setEnroute({ ...enroute, restriction: upper(event.target.value) })} placeholder="REPORT REACHING / DUE TRAFFIC" />
      </label>
      <label className="block space-y-1 text-xs font-semibold">ADDITIONAL FREE TEXT (OPTIONAL)
        <textarea className={field} rows={2} maxLength={400} value={enroute.text} onChange={event => setEnroute({ ...enroute, text: upper(event.target.value) })} />
      </label>
      <button type="submit" className={cn(button, 'w-full bg-sky-600 text-white')}>REVIEW CLEARANCE <ArrowRight className="h-4 w-4" /></button>
    </form>
  );

  const dialog = open && typeof document !== 'undefined' ? createPortal(<div className="fixed inset-0 z-[120]">
    <button className="absolute inset-0 bg-black/30" tabIndex={-1} aria-label="Close CPDLC panel" onClick={() => setOpen(false)} />
    <aside ref={panel} tabIndex={-1} role="dialog" aria-modal="true" aria-labelledby="atc-cpdlc-title" className={cn('absolute inset-y-0 right-0 flex w-[540px] max-w-full flex-col border-l shadow-2xl outline-none', shell)}>
      <header className="flex shrink-0 items-center gap-3 border-b border-slate-500/20 p-4">
        <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-sky-500/15 text-sky-500"><MessageSquare className="h-5 w-5" /></div>
        <div className="min-w-0 flex-1"><h2 id="atc-cpdlc-title" className="font-bold tracking-wide">CPDLC <span className={cn('ml-2 text-sm font-mono', muted)}>{myStation ? stationLabel(myStation) : data?.station ?? 'ATC'}</span></h2><p className={cn('text-xs', muted)}>{connectedAircraft.length} LOGGED · {unread.length} UNREAD</p></div>
        <button onClick={() => void refresh()} className={button} title="Refresh messages" aria-label="Refresh messages" disabled={loading}><RefreshCw className={cn('h-4 w-4', loading && 'animate-spin')} /></button>
        <button onClick={() => setOpen(false)} className={button} aria-label="Close CPDLC panel"><X className="h-4 w-4" /></button>
      </header>
      {(error || actionError) && <p role="alert" className="border-b border-red-500/20 bg-red-500/10 px-4 py-3 text-sm text-red-500">{actionError || error}</p>}
      {alarm.blocked && <button className="m-3 flex items-center justify-center gap-2 rounded-lg bg-amber-500 px-3 py-2 text-sm font-semibold text-black" onClick={() => void alarm.enable()}><Volume2 className="h-4 w-4" /> ENABLE MESSAGE SOUND</button>}
      <div ref={content} className="min-h-0 flex-1 overflow-y-auto">
        {editor ? <div className="space-y-4 p-4">
          <button className={button} disabled={busy} onClick={() => { setEditor(null); setActionError(''); }}><ArrowLeft className="h-4 w-4" /> BACK</button>
          <h3 className="font-semibold">
            {editor === 'compose'
              ? `MESSAGE TO ${recipient || 'AIRCRAFT'}`
              : editor === 'transfer' || editor === 'aircraft_handover'
                ? `TRANSFER / HANDOVER ${selectedAircraft || selected?.from_station || ''}`
                : editor === 'aircraft_terminate'
                  ? `END CPDLC — ${selectedAircraft ?? ''}`
                  : editor === 'aircraft_clearance' || editor === 'aircraft_clearance_preview'
                    ? `ORDER TO ${selectedAircraft ?? ''}`
                    : `REPLY TO ${selected?.from_station ?? ''}`}
          </h3>
          {editor === 'choice' && selected && <div className="space-y-4"><p className={cn('text-sm', muted)}>Select the clearance decision. No additional fields are required for refusal.</p><div className="grid grid-cols-2 gap-3"><button className="rounded-xl border border-emerald-500 bg-emerald-500/10 p-5 font-bold text-emerald-500" disabled={busy} onClick={() => setEditor('clearance')}>CLEAR <ChevronRight className="ml-1 inline h-4 w-4" /></button><button className="rounded-xl border border-red-500 bg-red-500/10 p-5 font-bold text-red-500" disabled={busy} onClick={() => void submit({ action: 'respond', message_id: selected.id, response: 'REFUSED', client_request_id: requestId.current ?? crypto.randomUUID() })}>REFUSED</button></div></div>}
          {editor === 'clearance' && <form className="space-y-4" onSubmit={event => {
            event.preventDefault();
            try { clearancePreview(clearance); }
            catch (reason) { setActionError(reason instanceof Error ? reason.message : 'CHECK THE CLEARANCE FIELDS'); return; }
            setActionError(''); setEditor('preview');
          }}>
            <label className="block space-y-1 text-xs font-semibold">CLEARED TO (AIRPORT)<input autoFocus required pattern="[A-Za-z]{4}" maxLength={4} className={field} value={clearance.destination} onChange={event => setClearance({ ...clearance, destination: upper(event.target.value) })} placeholder="IRFD" /></label>
            <label className="block space-y-1 text-xs font-semibold">SID / EXPECT VECTORS / DIRECT FIX<input required maxLength={80} className={field} value={clearance.departure} onChange={event => setClearance({ ...clearance, departure: upper(event.target.value) })} placeholder="EXPECT VECTORS" /></label>
            <label className="block space-y-1 text-xs font-semibold">INITIAL ALTITUDE<input required pattern="([0-9]{1,5} FT|FL[0-9]{3})" maxLength={10} className={field} value={clearance.altitude} onChange={event => setClearance({ ...clearance, altitude: upper(event.target.value) })} placeholder="5000 FT OR FL050" /><span className={muted}>Enter feet followed by FT, or a three-digit flight level.</span></label>
            <div className="grid grid-cols-2 gap-3"><label className="block space-y-1 text-xs font-semibold">SQUAWK<input required inputMode="numeric" pattern="[0-7]{4}" maxLength={4} className={field} value={clearance.squawk} onChange={event => setClearance({ ...clearance, squawk: event.target.value })} placeholder="2000" /></label><label className="block space-y-1 text-xs font-semibold">CONTACT FREQUENCY<input required inputMode="decimal" pattern="[0-9]{3}\.[0-9]{3}" maxLength={7} className={field} value={clearance.frequency} onChange={event => setClearance({ ...clearance, frequency: event.target.value.replace(',', '.') })} placeholder="124.850" /></label></div>
            <label className="block space-y-1 text-xs font-semibold">ADDITIONAL FREE TEXT (OPTIONAL)<textarea className={field} rows={3} maxLength={500} value={clearance.text} onChange={event => setClearance({ ...clearance, text: upper(event.target.value) })} /></label>
            <button type="submit" className={cn(button, 'w-full bg-sky-600 text-white')}>REVIEW MESSAGE <ArrowRight className="h-4 w-4" /></button>
          </form>}
          {editor === 'preview' && selected && <div className="space-y-4"><p className={cn('text-xs', muted)}>CHECK THE CLEARANCE BEFORE SENDING</p><pre className="whitespace-pre-wrap break-words rounded-xl border border-sky-900 bg-[#050e18] p-4 font-mono text-sm leading-relaxed text-cyan-300">{clearancePreview(clearance)}</pre><div className="flex gap-2"><button className={button} disabled={busy} onClick={() => setEditor('clearance')}>EDIT</button><button className={cn(button, 'flex-1 bg-sky-600 text-white')} disabled={busy} onClick={() => void submit({ action: 'respond', message_id: selected.id, response: 'CLEAR', clearance, client_request_id: requestId.current ?? crypto.randomUUID() })}><Send className="h-4 w-4" /> {busy ? 'SENDING…' : 'SEND CLEARANCE'}</button></div></div>}
          {editor === 'enroute' && selected && renderEnrouteForm(() => setEditor('enroute_preview'))}
          {editor === 'enroute_preview' && selected && <div className="space-y-4">
            <p className={cn('text-xs', muted)}>CHECK THE ENROUTE CLEARANCE BEFORE SENDING</p>
            <pre className="whitespace-pre-wrap break-words rounded-xl border border-sky-900 bg-[#050e18] p-4 font-mono text-sm leading-relaxed text-cyan-300">{enroutePreview(enroute)}</pre>
            <div className="flex gap-2">
              <button className={button} disabled={busy} onClick={() => setEditor('enroute')}>EDIT</button>
              <button className={cn(button, 'flex-1 bg-sky-600 text-white')} disabled={busy} onClick={() => void submit({ action: 'respond', message_id: selected.id, response: 'FREE_TEXT', text: enroutePreview(enroute), client_request_id: requestId.current ?? crypto.randomUUID() })}><Send className="h-4 w-4" /> {busy ? 'SENDING…' : 'SEND CLEARANCE'}</button>
            </div>
          </div>}
          {editor === 'aircraft_clearance' && selectedAircraft && renderEnrouteForm(() => setEditor('aircraft_clearance_preview'))}
          {editor === 'aircraft_clearance_preview' && selectedAircraft && <div className="space-y-4">
            <p className={cn('text-xs', muted)}>CHECK THE ORDER BEFORE SENDING TO {selectedAircraft}</p>
            <pre className="whitespace-pre-wrap break-words rounded-xl border border-sky-900 bg-[#050e18] p-4 font-mono text-sm leading-relaxed text-cyan-300">{enroutePreview(enroute)}</pre>
            <div className="flex gap-2">
              <button className={button} disabled={busy} onClick={() => setEditor('aircraft_clearance')}>EDIT</button>
              <button className={cn(button, 'flex-1 bg-sky-600 text-white')} disabled={busy} onClick={() => void submit({ action: 'free_text', to: selectedAircraft, text: enroutePreview(enroute), client_request_id: requestId.current ?? crypto.randomUUID() })}><Send className="h-4 w-4" /> {busy ? 'SENDING…' : 'SEND ORDER'}</button>
            </div>
          </div>}
          {editor === 'aircraft_handover' && selectedAircraft && <form className="space-y-4 rounded-xl border border-amber-500/30 p-4" onSubmit={event => { event.preventDefault(); void handoverAircraft(selectedAircraft); }}>
            <div className="flex items-center justify-between">
              <p className="text-xs font-bold uppercase tracking-wider text-amber-400">SELECT NEXT CONTROLLER — {selectedAircraft}</p>
              <span className={cn('text-[11px] font-mono', muted)}>{sortedHandoverControllers.length} ONLINE</span>
            </div>
            {sortedHandoverControllers.length === 0 ? (
              <p className={cn('rounded-lg border border-slate-500/20 p-4 text-center text-xs', muted)}>NO OTHER ATC CONTROLLER IS CURRENTLY ONLINE.</p>
            ) : (
              <div className="space-y-2" role="radiogroup" aria-label="Online ATC controllers">
                {sortedHandoverControllers.map(station => {
                  const isSelected = handoverSessionId === station.session_id;
                  const isRecommended = recommendedHandoverId === station.session_id;
                  const label = stationLabel(station);
                  return (
                    <button
                      key={station.session_id}
                      type="button"
                      role="radio"
                      aria-checked={isSelected}
                      onClick={() => { setHandoverSessionId(station.session_id); setActionError(''); }}
                      className={cn(
                        'flex w-full items-center justify-between rounded-xl border p-3 text-left transition',
                        isSelected
                          ? 'border-amber-400 bg-amber-500/15 ring-1 ring-amber-400'
                          : dark
                            ? 'border-slate-700 bg-slate-900/60 hover:border-slate-500'
                            : 'border-slate-300 bg-slate-50 hover:border-slate-400',
                      )}
                    >
                      <div className="flex items-center gap-3">
                        <span className={cn('h-2.5 w-2.5 rounded-full', isSelected ? 'bg-amber-400' : 'bg-emerald-400')} />
                        <div>
                          <div className="flex items-center gap-2">
                            <span className="font-mono text-sm font-bold">{label}</span>
                            {isRecommended && (
                              <span className="rounded bg-sky-500/20 px-1.5 py-0.5 font-mono text-[10px] font-bold text-sky-400">
                                NEXT IN SEQUENCE
                              </span>
                            )}
                          </div>
                          <p className={cn('text-[11px]', muted)}>AIRPORT {upper(station.code)} · POSITION {upper(station.position)}</p>
                        </div>
                      </div>
                      {isSelected && <Check className="h-4 w-4 text-amber-400" />}
                    </button>
                  );
                })}
              </div>
            )}
            {chosenHandoverStation && (
              <p className={cn('rounded-lg bg-amber-500/10 px-3 py-2 text-xs text-amber-300')}>
                Confirming handover of <strong>{selectedAircraft}</strong> from <strong>{myStation ? stationLabel(myStation) : data?.station ?? 'ATC'}</strong> to <strong>{stationLabel(chosenHandoverStation)}</strong>.
              </p>
            )}
            <button disabled={busy || !chosenHandoverStation} className={cn(button, 'w-full bg-amber-600 text-white')}>
              <Radio className="h-4 w-4" /> {busy ? 'TRANSFERRING…' : chosenHandoverStation ? `TRANSFER TO ${stationLabel(chosenHandoverStation)}` : 'SELECT A CONTROLLER'}
            </button>
          </form>}
          {editor === 'aircraft_terminate' && selectedAircraft && (() => {
            const cleanFreq = voiceFrequency.replace(',', '.').trim();
            const isValidFreq = /^[0-9]{3}\.[0-9]{2,3}$/.test(cleanFreq);
            return (
              <form className="space-y-4 rounded-xl border border-red-500/30 p-4" onSubmit={event => { event.preventDefault(); void terminateCpdlcForAircraft(selectedAircraft); }}>
                <p className="text-xs font-bold uppercase tracking-wider text-red-400">END CPDLC SERVICE — {selectedAircraft}</p>
                <label className="block space-y-1 text-xs font-semibold">VOICE FREQUENCY TO CONTACT (VHF) *
                  <input
                    autoFocus
                    required
                    inputMode="decimal"
                    pattern="[0-9]{3}\.[0-9]{2,3}"
                    maxLength={7}
                    className={field}
                    value={voiceFrequency}
                    onChange={event => { setVoiceFrequency(event.target.value.replace(',', '.')); setActionError(''); }}
                    placeholder="122.800"
                  />
                  <span className={muted}>Mandatory: enter UNICOM (122.800) or the next sector VHF frequency.</span>
                </label>
                <label className="block space-y-1 text-xs font-semibold">REASON / NOTE (OPTIONAL)
                  <input
                    maxLength={80}
                    className={field}
                    value={terminateReason}
                    onChange={event => setTerminateReason(upper(event.target.value))}
                    placeholder="END OF ATC SERVICE"
                  />
                </label>
                <pre className="whitespace-pre-wrap break-words rounded-xl border border-red-900/50 bg-[#050e18] p-3 font-mono text-xs leading-relaxed text-cyan-300">
                  {`CPDLC SERVICE TERMINATED\nCONTACT ${cleanFreq || '___.___'} BY VOICE${terminateReason.trim() ? `\n${upper(terminateReason.trim())}` : ''}`}
                </pre>
                <button disabled={busy || !isValidFreq} className={cn(button, 'w-full bg-red-600 text-white')}>
                  <PhoneOff className="h-4 w-4" /> {busy ? 'SENDING…' : 'TERMINATE CPDLC & LOGOFF'}
                </button>
              </form>
            );
          })()}
          {(editor === 'text' || editor === 'compose') && <form className="space-y-4" onSubmit={event => { event.preventDefault(); if (editor === 'compose') void submit({ action: 'free_text', to: upper(recipient.trim()), text: replyText, client_request_id: requestId.current ?? crypto.randomUUID() }); else if (selected) void submit({ action: 'respond', message_id: selected.id, response: 'FREE_TEXT', text: replyText, client_request_id: requestId.current ?? crypto.randomUUID() }); }}>
            {editor === 'compose' && <label className="block space-y-1 text-xs font-semibold">TO STATION / AIRCRAFT<input required className={field} value={recipient} maxLength={16} onChange={event => setRecipient(upper(event.target.value))} placeholder="IRFD / DLH324" /></label>}
            <label className="block space-y-1 text-xs font-semibold">MESSAGE<textarea autoFocus required className={field} rows={6} maxLength={1000} value={replyText} onChange={event => setReplyText(upper(event.target.value))} /></label><button disabled={busy || !replyText.trim()} className={cn(button, 'w-full bg-sky-600 text-white')}><Send className="h-4 w-4" /> {busy ? 'SENDING…' : 'SEND MESSAGE'}</button>
          </form>}
          {editor === 'transfer' && selected && <form className="space-y-4" onSubmit={event => { event.preventDefault(); void transferWithHandover(selected); }}><label className="block space-y-1 text-xs font-semibold">ONLINE CONTROLLER<select required className={field} value={transferSession} onChange={event => setTransferSession(event.target.value)}><option value="">SELECT A POSITION</option>{transferStations.map(station => <option key={station.session_id} value={station.session_id}>{stationLabel(station)}</option>)}</select></label><p className={cn('text-sm', muted)}>{transferStations.length ? 'The receiving controller will get the flight and the pilot will be prompted to notify the next controller.' : 'NO OTHER CONTROLLER COVERS THIS AIRPORT.'}</p><button disabled={busy || !transferSession} className={cn(button, 'w-full bg-sky-600 text-white')}>TRANSFER MESSAGE</button></form>}
        </div> : selectedAircraft ? <section className="space-y-4 p-4" aria-label="Logged aircraft actions">
          <button className={button} onClick={() => { setSelectedAircraft(null); setActionError(''); }}><ArrowLeft className="h-4 w-4" /> BACK TO INBOX</button>
          <div className="rounded-xl border border-emerald-500/30 bg-emerald-500/5 p-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Plane className="h-5 w-5 text-emerald-400" />
                <span className="font-mono text-base font-bold">{selectedAircraft}</span>
              </div>
              <span className="rounded-full bg-emerald-500/15 px-2.5 py-0.5 font-mono text-[11px] font-bold text-emerald-400">LOGGED ON</span>
            </div>
            <p className={cn('mt-2 text-xs', muted)}>Select an ATC instruction to send directly to {selectedAircraft}&apos;s DCDU.</p>
            <div className="mt-4 grid grid-cols-2 gap-2">
              <button type="button" disabled={busy || !data?.available} className={cn(button, 'bg-sky-600 text-white')} onClick={() => { setEnroute(emptyEnroute); startEditor('aircraft_clearance'); }}>
                <Send className="h-4 w-4" /> ORDER
              </button>
              <button type="button" disabled={busy || !data?.available} className={cn(button, 'border-amber-500/50 text-amber-400 hover:bg-amber-500/10')} onClick={() => { setHandoverSessionId(recommendedHandoverId); startEditor('aircraft_handover'); }}>
                <Radio className="h-4 w-4" /> TRANSFER
              </button>
              <button type="button" disabled={busy || !data?.available} className={button} onClick={() => startEditor('compose', selectedAircraft)}>
                <MessageSquare className="h-4 w-4" /> FREE TEXT
              </button>
              <button type="button" disabled={busy || !data?.available} className={cn(button, 'border-red-500/50 text-red-400 hover:bg-red-500/10')} onClick={() => { setVoiceFrequency(''); setTerminateReason('END OF ATC SERVICE'); startEditor('aircraft_terminate'); }}>
                <PhoneOff className="h-4 w-4" /> END CPDLC
              </button>
            </div>
            <button type="button" className={cn(button, 'mt-2 w-full border-slate-600/50 text-xs', muted)} onClick={() => forceClearAircraft(selectedAircraft)}>
              <Trash2 className="h-3.5 w-3.5" /> REMOVE STALE FLIGHT FROM LIST
            </button>
          </div>
          <div className="space-y-2">
            <p className={cn('text-xs font-bold uppercase tracking-wider', muted)}>RECENT EXCHANGES WITH {selectedAircraft}</p>
            {aircraftHistory.length === 0 ? (
              <p className={cn('text-xs', muted)}>NO MESSAGES YET.</p>
            ) : aircraftHistory.slice(0, 8).map(item => (
              <button key={item.id} type="button" onClick={() => openMessage(item)} className={cn('block w-full rounded-lg border border-slate-500/20 p-3 text-left text-xs hover:border-sky-500/40', dark ? 'bg-slate-900/60' : 'bg-slate-50')}>
                <div className="flex items-center justify-between font-mono text-[11px]">
                  <span className="font-bold">{item.incoming ? `${item.from_station} → ATC` : `ATC → ${item.to_station}`}</span>
                  <span className={muted}>{time(item.created_at)} · {item.status.replace('_', ' ')}</span>
                </div>
                <pre className="mt-1.5 whitespace-pre-wrap break-words font-mono text-xs text-cyan-300">{upper(item.body)}</pre>
              </button>
            ))}
          </div>
        </section> : selected ? <section className="space-y-4 p-4" aria-label="Selected message">
          <button className={button} onClick={() => { setSelectedId(null); setActionError(''); }}><ArrowLeft className="h-4 w-4" /> BACK TO INBOX</button>
          <div className="rounded-xl border border-slate-500/30 p-4">
            <p className="font-mono text-sm font-bold">{selected.from_station} → {selected.to_station}</p>
            <p className={cn('mt-1 text-xs', muted)}>{time(selected.created_at)} · {kindLabel(selected)} · {selected.status.replace('_', ' ')}{selected.late ? ' · LATE REPLY' : ''}</p>
            <pre className="mt-4 whitespace-pre-wrap break-words rounded-lg bg-[#050e18] p-3 font-mono text-sm leading-relaxed text-cyan-300">{upper(selected.body)}</pre>
          </div>
          {selected.status === 'TIMED_OUT' && <p className="text-xs text-amber-500">TIMED OUT — YOU MAY STILL SEND A LATE REPLY.</p>}
          {selectedRequestAnswered && <p className={cn('text-xs', muted)}>THIS CLEARANCE REQUEST HAS ALREADY BEEN ANSWERED.</p>}
          {selected.incoming && <div className="flex flex-wrap gap-2">
            {isLogonMessage(selected) && <button disabled={busy || !data?.available} className={cn(button, 'bg-emerald-600 text-white')} onClick={() => void acceptLogon(selected)}><Check className="h-4 w-4" /> ACCEPT LOGON</button>}
            {isEnrouteRequest(selected) && <button disabled={busy || !data?.available} className={cn(button, 'bg-sky-600 text-white')} onClick={() => startEditor('enroute')}><Send className="h-4 w-4" /> CLEARANCE REPLY</button>}
            {!selectedRequestAnswered && !['SYSTEM', 'WX', 'ATIS'].includes(selected.kind) && <button disabled={busy || !data?.available} className={cn(button, !isEnrouteRequest(selected) && !isLogonMessage(selected) && 'bg-sky-600 text-white')} onClick={() => startEditor(selected.kind === 'CLEARANCE' ? 'choice' : 'text')}><Send className="h-4 w-4" /> {isEnrouteRequest(selected) ? 'FREE TEXT' : 'REPLY'}</button>}
            {selectedRequestPending && ['CLEARANCE', 'FREE_TEXT'].includes(selected.kind) && <button disabled={busy || !data?.available} className={button} onClick={() => startEditor('transfer')}>TRANSFER</button>}
            {!selected.acknowledged && <button className={button} disabled={busy} onClick={() => void act({ action: 'ack', message_id: selected.id }).catch(reason => setActionError(String(reason)))}><Check className="h-4 w-4" /> ACK</button>}
          </div>}
        </section> : <>
          {connectedAircraft.length > 0 && <div className="border-b border-slate-500/20 px-3 py-2.5 text-xs">
            <div className="mb-1.5 flex items-center justify-between">
              <span className={cn('inline-flex items-center gap-1.5 font-bold uppercase tracking-wider', muted)}><Plane className="h-3.5 w-3.5 text-emerald-400" /> LOGGED AIRCRAFT ({connectedAircraft.length})</span>
              <span className={cn('text-[10px]', muted)}>CLICK FOR ACTIONS</span>
            </div>
            <div className="flex flex-wrap gap-1.5">
              {connectedAircraft.map(ac => (
                <button key={ac.callsign} type="button" disabled={!data?.available || busy} onClick={() => openAircraftPanel(ac.callsign)} className="inline-flex items-center gap-1.5 rounded-lg border border-emerald-500/40 bg-emerald-500/10 px-2.5 py-1 font-mono text-xs font-bold text-emerald-400 hover:bg-emerald-500/20">
                  <span>{ac.callsign}</span>
                  <ChevronRight className="h-3 w-3 opacity-70" />
                </button>
              ))}
            </div>
          </div>}
          <div className="flex flex-wrap items-center gap-2 border-b border-slate-500/20 p-3"><button className={cn(button, filter === 'all' && 'ring-1 ring-sky-500')} onClick={() => setFilter('all')}>ALL</button><button className={cn(button, filter === 'unread' && 'ring-1 ring-sky-500')} onClick={() => setFilter('unread')}>UNREAD ({unread.length})</button><button className={cn(button, 'ml-auto')} disabled={!data?.available || busy} onClick={() => startEditor('compose')}><Send className="h-4 w-4" /> NEW</button></div>
          <table className="w-full table-fixed text-left text-xs"><thead className={cn('border-b border-slate-500/20', muted)}><tr><th className="w-[32%] px-3 py-3">IDENT</th><th className="w-[25%] px-2 py-3">TYPE</th><th className="w-[28%] px-2 py-3">STATUS</th><th className="w-[15%] px-2 py-3"><span className="sr-only">OPEN</span></th></tr></thead><tbody>{visibleMessages.map(message => <tr key={message.id} className={cn(statusTone(message), 'cursor-pointer')} onClick={() => openMessage(message)}><td className="break-words px-3 py-3"><span className="font-mono font-bold">{message.incoming ? message.from_station : message.to_station}</span><span className={cn('mt-1 block text-[10px]', muted)}>{message.incoming ? 'FROM' : 'TO'} · {time(message.created_at)}</span></td><td className="px-2 py-3 font-semibold">{kindLabel(message)}{message.late && <span className="mt-1 block text-[10px] text-amber-500">LATE REPLY</span>}</td><td className="px-2 py-3"><button title={message.incoming && !message.acknowledged ? 'Acknowledge message and send MSG RECEIVED STANDBY' : 'Message acknowledged'} disabled={!message.incoming || message.acknowledged || busy} className="min-h-9 max-w-full break-words rounded-md border border-current/30 px-2 py-1 text-[10px] font-bold disabled:cursor-default" onClick={event => { event.stopPropagation(); void act({ action: 'ack', message_id: message.id }).catch(reason => setActionError(reason instanceof Error ? reason.message : 'ACK FAILED')); }}>{message.status.replace('_', ' ')}{message.incoming && <span className="block">{message.acknowledged ? 'ACK' : 'ACK ▸'}</span>}</button></td><td className="px-1 py-3"><button aria-label={`Open ${kindLabel(message)} ${message.incoming ? 'from' : 'to'} ${message.incoming ? message.from_station : message.to_station}`} className="min-h-10 min-w-10 rounded-lg hover:bg-sky-500/15" onClick={event => { event.stopPropagation(); openMessage(message); }}><ChevronRight className="mx-auto h-4 w-4" /></button></td></tr>)}</tbody></table>
          {!visibleMessages.length && <p className={cn('px-4 py-10 text-center text-sm', muted)}>{loading ? 'LOADING MESSAGES…' : data?.available === false ? 'CPDLC IS NOT AVAILABLE' : 'NO MESSAGES'}</p>}
        </>}
      </div>
      <footer className={cn('shrink-0 border-t border-slate-500/20 px-4 py-2 text-[10px]', muted)}>CLICK LOGGED AIRCRAFT FOR DIRECT ORDERS · ACK DOES NOT GRANT A CLEARANCE</footer>
    </aside>
  </div>, document.body) : null;

  return <><button ref={trigger} type="button" onClick={() => { setOpen(value => !value); void alarm.enable(); }} aria-expanded={open} aria-haspopup="dialog" aria-label={`CPDLC, ${unread.length} unacknowledged messages`} className={cn(ATC_NAV_BTN, 'relative', open ? atcNavOpen(dark) : atcNavIdle(dark))}><MessageSquare className="h-4 w-4" /><span>CPDLC</span>{unread.length > 0 && <span className="flex h-5 min-w-5 items-center justify-center rounded-full bg-amber-500 px-1 text-[10px] font-bold text-black">{unread.length}</span>}{alarm.blocked && unread.length > 0 && <span className="absolute -right-1 -top-1 h-2 w-2 rounded-full bg-red-500" />}</button>{dialog}</>;
}
