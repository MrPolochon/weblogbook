import { createAdminClient } from '@/lib/supabase/admin';
import type { CalendarEvent } from '@/lib/calendrier/types';
import type { MajorConfig } from './types';

export const featureMissing = (error: { code?: string } | null) => Boolean(error && ['42P01','PGRST205'].includes(error.code || ''));
export async function attachMajorEvents(events: CalendarEvent[]): Promise<CalendarEvent[]> {
  if (!events.length) return events;
  const { data, error } = await createAdminClient().from('major_event_configs').select('*').in('event_id', events.map(e => e.id));
  if (featureMissing(error)) return events;
  if (error) throw new Error('Chargement des événements majeurs impossible.');
  const map = new Map((data || []).map(c => [c.event_id, c as MajorConfig]));
  return events.map(e => ({ ...e, is_major: map.has(e.id), major: map.get(e.id) }));
}
export async function checkMajorFlight(pilot: string | null, dep: string, arr: string, date: string | null, duration: number, callsign: string) {
  const admin = createAdminClient();
  const { error } = await admin.rpc('check_major_event_flight', { p_pilot: pilot, p_depart: dep, p_arrival: arr,
    p_depart_at: date, p_duration: duration, p_callsign: callsign, p_plan: null });
  if (error?.code === 'PGRST202' || error?.code === '42883') {
    const installed = await admin.from('major_event_configs').select('event_id').eq('enabled', true).limit(1);
    if (featureMissing(installed.error) || (!installed.error && !installed.data?.length)) return null;
    return 'La vérification des slots est indisponible. Réessayez avant de déposer le plan.';
  }
  return error?.message || null;
}
export async function reservedDeparture(user: string, bookingId: unknown, hour: string): Promise<string | null> {
  if (typeof bookingId !== 'string' || !/^[a-f0-9-]{36}$/i.test(bookingId)) return null;
  const { data, error } = await createAdminClient().from('event_reservations').select('departure_at')
    .eq('id',bookingId).eq('user_id',user).eq('role','pilot').eq('status','confirmed').maybeSingle();
  if (error || !data?.departure_at || !/^\d{2}:\d{2}$/.test(hour)) return null;
  const candidate = new Date(`${data.departure_at.slice(0,10)}T${hour}:00Z`);
  if (!Number.isFinite(candidate.getTime())) return null;
  if (candidate.getTime() < Date.parse(data.departure_at) - 12*3600000) candidate.setUTCDate(candidate.getUTCDate()+1);
  return candidate.toISOString();
}

/** Le lien de réservation ne permet pas de déposer un autre vol puis de se dire inscrit. */
export async function validateBookingFlight(user:string,bookingId:string,departure:string,arrival:string,at:string,duration:number,callsign:string):Promise<string|null> {
  const {data,error}=await createAdminClient().from('event_reservations')
    .select('departure,arrival,departure_at,duration_minutes,callsign,claimed_at,major_event_configs(slot_minutes)')
    .eq('id',bookingId).eq('user_id',user).eq('role','pilot').eq('status','confirmed').maybeSingle();
  if(error||!data||data.claimed_at) return 'Cette réservation n’est plus disponible. Revenez au manifeste de l’événement.';
  const config=data.major_event_configs as unknown as {slot_minutes:number}|null;
  const start=Date.parse(data.departure_at),chosen=Date.parse(at);
  if(!config||data.departure!==departure||data.arrival!==arrival||data.duration_minutes!==duration||data.callsign.toUpperCase()!==callsign.trim().toUpperCase()||!Number.isFinite(chosen)||chosen<start||chosen>=start+config.slot_minutes*60000)
    return 'Le plan doit conserver la route, le callsign, la durée et l’horaire du créneau choisi pour confirmer votre inscription.';
  return null;
}
export async function bookingLinkedToPlan(user:string,bookingId:unknown,planId:string):Promise<boolean> {
  if(typeof bookingId!=='string') return false;
  const {data,error}=await createAdminClient().from('event_reservations').select('id').eq('id',bookingId).eq('user_id',user).eq('plan_id',planId).not('claimed_at','is',null).maybeSingle();
  return !error&&Boolean(data);
}
