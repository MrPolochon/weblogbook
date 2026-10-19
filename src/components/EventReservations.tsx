'use client';
import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { AEROPORTS_PTFS } from '@/lib/aeroports-ptfs';
import { ATC_POSITIONS } from '@/lib/atc-positions';
import type { CalendarEvent } from '@/lib/calendrier/types';
import type { Reservation } from '@/lib/events/types';
import { csvCell } from '@/lib/events/rules';

const utc = (s: string) => new Date(s).toLocaleString('fr-FR', { timeZone: 'UTC', dateStyle: 'short', timeStyle: 'short' }) + ' UTC';
const flightStatus = (s: string) => (({depose:'Plan déposé',en_attente:'En attente ATC',accepte:'Plan accepté',en_cours:'En vol',cloture:'Vol terminé',annule:'Vol annulé'} as Record<string,string>)[s] || s);
export default function EventReservations({ event, adminMode = false, atcAirports }: { event?: CalendarEvent; adminMode?: boolean; atcAirports?: { code: string; nom: string }[] }) {
  const config = event?.major;
  const [rows, setRows] = useState<Reservation[]>([]); const [page, setPage] = useState(1); const [count, setCount] = useState(0);
  const [loading, setLoading] = useState(true); const [busy, setBusy] = useState(false); const [error, setError] = useState('');
  const [notice, setNotice] = useState(''); const [loggedIn, setLoggedIn] = useState(false);
  const [usage,setUsage] = useState<{ airport: string; slot_at: string; count: number }[]>([]);
  const [occupied,setOccupied] = useState<{ airport: string; position: string; starts_at: string; ends_at: string; event_id: string | null }[]>([]);
  const [role, setRole] = useState<'pilot' | 'atc'>(event ? 'pilot' : 'atc');
  const [airport, setAirport] = useState(config?.airports[0] || ''); const [position, setPosition] = useState(config?.atc_positions[0] || 'Tower');
  const [movement, setMovement] = useState<'departure' | 'arrival'>('departure'); const [otherAirport, setOtherAirport] = useState('');
  const [slot, setSlot] = useState(event ? new Date(event.starts_at).toISOString() : ''); const [duration, setDuration] = useState(60);
  const [callsign, setCallsign] = useState(''); const [aircraft, setAircraft] = useState(''); const [airline, setAirline] = useState('');
  const [freeStart, setFreeStart] = useState(new Date().toISOString().slice(0, 16));
  const [freeEnd, setFreeEnd] = useState(new Date(Date.now() + 3600000).toISOString().slice(0, 16));
  const [waitlist, setWaitlist] = useState(false); const [review, setReview] = useState(false);
  const [editingId,setEditingId] = useState<string | null>(null);
  const endpoint = `/api/evenements/reservations?${event ? `event_id=${event.id}&` : ''}`;
  const load = useCallback(async () => {
    setLoading(true); setError('');
    try {
      const res = await fetch(`${endpoint}page=${page}`, { cache: 'no-store' }); const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setRows(data.reservations); setCount(data.count); setLoggedIn(data.loggedIn); setUsage(data.usage || []); setOccupied(data.occupied || []);
    } catch (e) { setError(e instanceof Error ? e.message : 'Chargement impossible.'); }
    finally { setLoading(false); }
  }, [endpoint, page]);
  useEffect(() => { void load(); }, [load]);
  const slots = useMemo(() => {
    if (!event?.ends_at || !config) return [];
    const result: string[] = [];
    for (let at = Date.parse(event.starts_at); at + config.slot_minutes * 60000 <= Date.parse(event.ends_at); at += config.slot_minutes * 60000) result.push(new Date(at).toISOString());
    return result;
  }, [event, config]);
  function payload() {
    const start = event ? new Date(slot) : new Date(`${freeStart}:00Z`);
    const end = event ? new Date(start.getTime() + (role === 'pilot' ? config!.slot_minutes : duration) * 60000) : new Date(`${freeEnd}:00Z`);
    return { event_id: event?.id || null, role, airport, position: role === 'atc' ? position : null,
      starts_at: start.toISOString(), ends_at: end.toISOString(), status: waitlist && role === 'pilot' ? 'waitlisted' : 'confirmed',
      ...(role === 'pilot' ? { movement, departure: movement === 'departure' ? airport : otherAirport, arrival: movement === 'arrival' ? airport : otherAirport,
        departure_at: new Date(start.getTime() - (movement === 'arrival' ? duration * 60000 : 0)).toISOString(), duration_minutes: duration, callsign, aircraft, airline } : {}) };
  }
  async function reserve() {
    if (busy) return; setBusy(true); setError(''); setNotice('');
    try {
      const res = await fetch(editingId ? `/api/evenements/reservations/${editingId}` : '/api/evenements/reservations', { method: editingId ? 'PATCH' : 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(editingId ? { action:'modify',data:payload() } : payload()) });
      const data = await res.json(); if (!res.ok) throw new Error(data.error);
      setEditingId(null); setReview(false); setNotice(waitlist ? 'Vous êtes sur la liste d’attente. Aucun slot n’est confirmé pour le moment.' : 'Réservation confirmée. Vous la retrouverez dans le manifeste.'); await load();
    } catch (e) { setError(e instanceof Error ? e.message : 'Réservation impossible.'); } finally { setBusy(false); }
  }
  function edit(r: Reservation) {
    setEditingId(r.id);setRole(r.role);setAirport(r.airport);setPosition(r.position || config?.atc_positions[0] || 'Tower');
    setSlot(new Date(r.starts_at).toISOString());setMovement(r.movement || 'departure');setOtherAirport((r.movement === 'arrival' ? r.departure : r.arrival) || '');
    setDuration(r.role === 'pilot' ? r.duration_minutes || 60 : Math.round((Date.parse(r.ends_at)-Date.parse(r.starts_at))/60000));
    setCallsign(r.callsign || '');setAircraft(r.aircraft || '');setAirline(r.airline || '');setWaitlist(r.status === 'waitlisted');
    setFreeStart(new Date(r.starts_at).toISOString().slice(0,16));setFreeEnd(new Date(r.ends_at).toISOString().slice(0,16));setReview(false);
    document.getElementById('reservation-form')?.scrollIntoView({block:'start'});
  }
  async function action(id: string, action: string) {
    setBusy(true); setError('');
    try { const res = await fetch(`/api/evenements/reservations/${id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action }) });
      const data = await res.json(); if (!res.ok) throw new Error(data.error); await load();
    } catch (e) { setError(e instanceof Error ? e.message : 'Action impossible.'); } finally { setBusy(false); }
  }
  async function exportCsv() {
    setBusy(true); setError('');
    try {
      const all: Reservation[] = [];
      for (let p = 1; ; p++) { const res = await fetch(`${endpoint}page=${p}`, { cache: 'no-store' }); const data = await res.json(); if (!res.ok) throw new Error(data.error);
        all.push(...data.reservations); if (p * 100 >= data.count) break; }
      const csv = [['Rôle','Créneau UTC','Fin UTC','Aéroport','Position','Callsign','Départ','Arrivée','Compagnie','Appareil','État','Présent','Pilote / ATC','Discord'] as unknown[],
        ...all.map(r => [r.role,r.starts_at,r.ends_at,r.airport,r.position,r.callsign,r.departure,r.arrival,r.airline,r.aircraft,r.status,Boolean(r.ready_at),r.identifiant,r.discord])].map(line => line.map(csvCell).join(';')).join('\r\n');
      const url = URL.createObjectURL(new Blob(['\ufeff' + csv], { type: 'text/csv;charset=utf-8' })); const a = document.createElement('a'); a.href = url; a.download = 'manifeste-evenement.csv'; a.click(); URL.revokeObjectURL(url);
    } catch (e) { setError(e instanceof Error ? e.message : 'Export impossible.'); } finally { setBusy(false); }
  }
  const airports = config ? AEROPORTS_PTFS.filter(a => config.airports.includes(a.code)) : atcAirports || AEROPORTS_PTFS;
  const canBook = !adminMode && (!config || (config.enabled && config.bookings_open && Date.parse(event!.ends_at || '') > Date.now()));
  return <div className="space-y-5">
    {error && <p role="alert" className="rounded-lg border border-red-400/40 p-3 text-red-200">{error} <button type="button" className="underline" onClick={() => void load()}>Réessayer</button></p>}
    {notice && <p role="status" className="rounded-lg border border-emerald-400/40 p-3 text-emerald-200">{notice}</p>}
    {canBook && <section className="rounded-xl border border-slate-600 p-4 space-y-3"><h2 className="text-lg font-semibold">{event ? 'Réserver pour cet événement' : 'Réserver une position ATC libre'}</h2>
      {!loggedIn ? <Link className="underline text-sky-300" href="/login">Connectez-vous pour réserver avec votre compte Discord lié.</Link> :
      <form id="reservation-form" className="space-y-3" onSubmit={e => { e.preventDefault(); setError(''); setReview(true); }}>
        {editingId && <p className="text-amber-200">Modification : votre réservation actuelle est conservée si le nouveau créneau est indisponible. <button type="button" className="underline" onClick={() => { setEditingId(null);setReview(false); }}>Abandonner la modification</button></p>}
        <div className="grid sm:grid-cols-2 gap-3">
          {event && <label>Rôle<select className="input w-full" value={role} onChange={e => { setRole(e.target.value as 'pilot'|'atc'); setWaitlist(false); setReview(false); }}><option value="pilot">Pilote</option><option value="atc">Contrôleur ATC</option></select></label>}
          <label>Aéroport<select className="input w-full" required value={airport} onChange={e => { setAirport(e.target.value); setReview(false); }}><option value="">Choisir…</option>{airports.map(a => <option key={a.code} value={a.code}>{a.code} — {a.nom}</option>)}</select></label>
          {event ? <label>Slot (UTC)<select required className="input w-full" value={slot} onChange={e => { setSlot(e.target.value); setReview(false); }}>{slots.map(s => <option key={s} value={s}>{utc(s)}{role === 'pilot' ? ` · ${Math.max(0,(config?.pilot_capacity || 0) - (usage.find(u => u.airport === airport && Date.parse(u.slot_at) === Date.parse(s))?.count || 0))} mouvement(s) libre(s)` : ''}</option>)}</select></label> : <><label>Début UTC<input required className="input w-full" type="datetime-local" value={freeStart} onChange={e => { setFreeStart(e.target.value); setReview(false); }}/></label><label>Fin UTC<input required className="input w-full" type="datetime-local" value={freeEnd} onChange={e => { setFreeEnd(e.target.value); setReview(false); }}/></label></>}
          {role === 'atc' ? <label>Poste<select className="input w-full" value={position} onChange={e => { setPosition(e.target.value); setReview(false); }}>{(config?.atc_positions || ATC_POSITIONS).map(p => <option key={p}>{p}</option>)}</select></label> : <>
            <label>Mouvement<select className="input w-full" value={movement} onChange={e => { setMovement(e.target.value as 'departure'|'arrival'); setReview(false); }}><option value="departure">Départ de l’aéroport choisi</option><option value="arrival">Arrivée à l’aéroport choisi</option></select></label>
            <label>{movement === 'departure' ? 'Destination' : 'Provenance'}<select required className="input w-full" value={otherAirport} onChange={e => { setOtherAirport(e.target.value); setReview(false); }}><option value="">Choisir…</option>{AEROPORTS_PTFS.map(a => <option key={a.code} value={a.code}>{a.code} — {a.nom}</option>)}</select></label>
            <label>Callsign<input required maxLength={30} className="input w-full" value={callsign} onChange={e => { setCallsign(e.target.value.toUpperCase()); setReview(false); }}/></label>
            <label>Compagnie<input maxLength={100} className="input w-full" value={airline} onChange={e => { setAirline(e.target.value); setReview(false); }}/></label>
            <label>Appareil<input required maxLength={100} className="input w-full" value={aircraft} onChange={e => { setAircraft(e.target.value); setReview(false); }}/></label>
          </>}
          {event && <label>{role === 'atc' ? 'Durée de présence ATC' : 'Durée prévue du vol'} (minutes)<input required type="number" min={1} max={role === 'atc' ? Math.min(1440,Math.floor((Date.parse(event.ends_at!)-Date.parse(slot))/60000)) : 1440} className="input w-full" value={duration} onChange={e => { setDuration(Number(e.target.value)); setReview(false); }}/></label>}
        </div>
        {role === 'pilot' && <label className="flex gap-2"><input type="checkbox" checked={waitlist} onChange={e => { setWaitlist(e.target.checked); setReview(false); }}/>M’inscrire en liste d’attente plutôt que confirmer un slot</label>}
        {!review ? <button type="submit" className="btn-primary" disabled={busy}>Vérifier ma réservation</button> : <div className="rounded-lg border border-sky-400/40 p-3 space-y-2"><p>{airport} · {role === 'atc' ? position : callsign} · {event ? utc(slot) : `${freeStart} → ${freeEnd} UTC`}</p>{role === 'pilot' && <p>{movement === 'departure' ? `${airport} → ${otherAirport}` : `${otherAirport} → ${airport}`} · {aircraft} · {duration} min</p>}<button type="button" className="btn-primary" disabled={busy} onClick={() => void reserve()}>{busy ? 'Confirmation…' : waitlist ? 'Confirmer la liste d’attente' : 'Confirmer ma réservation'}</button></div>}
      </form>}
      {event && <p className="text-xs text-slate-400">Capacité : {config?.pilot_capacity} mouvement(s) par aéroport et tranche de {config?.slot_minutes} minutes. Les postes ATC déjà réservés restent protégés.</p>}
    </section>}
    {occupied.length > 0 && <section className="rounded-lg border border-slate-600 p-3 space-y-1"><h2 className="font-semibold">Positions déjà réservées sur la période</h2>{occupied.map((r,i) => <p key={i} className="text-xs text-slate-400">{r.airport} · {r.position} · {utc(r.starts_at)} → {utc(r.ends_at)}{!r.event_id ? ' · réservation libre protégée' : ''}</p>)}</section>}
    <section className="space-y-3"><div className="flex flex-wrap items-center justify-between gap-3"><h2 className="text-lg font-semibold">{event ? 'Manifeste de l’événement' : 'Planning des positions réservées'}</h2><div className="flex gap-3"><button className="underline" disabled={busy || loading} onClick={() => void load()}>Actualiser</button>{adminMode && <button className="btn-secondary" disabled={busy || loading} onClick={() => void exportCsv()}>Exporter le manifeste</button>}</div></div>
      {loading ? <p role="status">Chargement…</p> : rows.length ? <div className="space-y-3">{rows.map(r => <article key={r.id} className="rounded-xl border border-slate-600 p-4 space-y-2">
        <div className="flex flex-wrap gap-2 justify-between"><strong>{r.role === 'atc' ? `${r.airport} · ${r.position}` : `${r.callsign} · ${r.departure} → ${r.arrival}`}</strong><span>{r.status === 'confirmed' ? 'Confirmé' : r.status === 'waitlisted' ? 'Liste d’attente' : r.status === 'cancelled' ? 'Annulé' : 'Absent'}</span></div>
        <p className="text-sm">{utc(r.starts_at)} → {utc(r.ends_at)} · {r.identifiant}{r.mine ? ' · Votre réservation' : ''}{r.ready_at ? ' · Présence confirmée' : ''}</p>
        {r.role === 'pilot' && <p className="text-sm text-slate-400">{r.airline} · {r.aircraft} · {r.plan_status ? flightStatus(r.plan_status) : r.ready_at ? 'Prêt' : 'Présence à confirmer'}</p>}
        {adminMode && r.discord && <p className="text-xs text-slate-400">Discord : {r.discord}</p>}
        <div className="flex flex-wrap gap-3 text-sm">
          {r.mine && r.status === 'confirmed' && !r.ready_at && <button className="underline" disabled={busy} onClick={() => void action(r.id,'ready')}>Je suis prêt</button>}
          {r.mine && r.role === 'pilot' && r.status === 'confirmed' && !r.claimed_at && <Link className="text-sky-300 underline" href={`/logbook/depot-plan-vol?reservation=${r.id}`}>Préremplir mon plan de vol</Link>}
          {r.mine && r.role === 'atc' && r.status === 'confirmed' && Date.parse(r.starts_at) <= Date.now() && Date.parse(r.ends_at) > Date.now() && <Link className="text-sky-300 underline" href={`/atc?reservation=${r.id}`}>Prendre ma position</Link>}
          {r.mine && !adminMode && canBook && ['confirmed','waitlisted'].includes(r.status) && !r.claimed_at && r.event_id === (event?.id || null) && <button className="underline" disabled={busy} onClick={() => edit(r)}>Modifier</button>}
          {(r.mine || adminMode) && ['confirmed','waitlisted'].includes(r.status) && !r.claimed_at && <button className="underline text-red-300" disabled={busy} onClick={() => void action(r.id,'cancel')}>Annuler la réservation</button>}
          {adminMode && r.status === 'waitlisted' && <button className="underline" disabled={busy} onClick={() => void action(r.id,'promote')}>Confirmer si une place est libre</button>}
          {adminMode && r.status === 'confirmed' && !r.claimed_at && <button className="underline" disabled={busy} onClick={() => void action(r.id,'no_show')}>Signaler absent</button>}
        </div>
      </article>)}</div> : <p>Aucune réservation à afficher.</p>}
      <div className="flex gap-3 items-center"><button disabled={page === 1 || loading} className="btn-secondary" onClick={() => setPage(p => p-1)}>Précédent</button><span>Page {page}</span><button disabled={page*100 >= count || loading} className="btn-secondary" onClick={() => setPage(p => p+1)}>Suivant</button></div>
    </section>
  </div>;
}
