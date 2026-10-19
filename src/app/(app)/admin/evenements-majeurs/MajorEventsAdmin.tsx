'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import type { CalendarEvent } from '@/lib/calendrier/types';
import EventReservations from '@/components/EventReservations';
export default function MajorEventsAdmin() {
  const [events,setEvents] = useState<CalendarEvent[]>([]); const [id,setId] = useState(''); const [error,setError] = useState('');
  useEffect(() => { fetch('/api/calendrier',{cache:'no-store'}).then(async r => { const d = await r.json(); if (!r.ok) throw new Error(d.error); return d; })
    .then(d => { const major = d.events.filter((e: CalendarEvent) => e.is_major); setEvents(major); setId(major[0]?.id || ''); }).catch(e => setError(e.message)); },[]);
  const event = events.find(e => e.id === id);
  return <div className="space-y-5 max-w-6xl mx-auto"><h1 className="text-2xl font-bold">Événements majeurs</h1>
    <p>Manifestes pilotes et ATC, présences, liste d’attente et export. Les réservations libres ne sont jamais remplacées par celles d’un événement.</p>
    <Link href="/app/calendrier" className="text-sky-300 underline">Créer ou configurer un événement majeur dans le calendrier</Link>
    {error && <p role="alert">{error}</p>}
    <label className="block">Événement<select className="input w-full" value={id} onChange={e => setId(e.target.value)}><option value="">Choisir un événement…</option>{events.map(e => <option key={e.id} value={e.id}>{e.title} · {e.starts_at.slice(0,10)}{!e.major?.enabled ? ' · désactivé' : ''}</option>)}</select></label>
    {event && <EventReservations key={event.id} event={event} adminMode/>}
  </div>;
}
