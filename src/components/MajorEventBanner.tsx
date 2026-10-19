'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { eventBannerState } from '@/lib/events/rules';
type Event = { id: string; title: string; starts_at: string; ends_at: string; airports: string[] };
export default function MajorEventBanner({ login = false }: { login?: boolean }) {
  const [events, setEvents] = useState<Event[]>([]); const [now,setNow] = useState(Date.now());
  useEffect(() => {
    let cancelled = false;
    async function update() { if (document.visibilityState === 'hidden') return;
      try { const res = await fetch('/api/evenements/bandeau'); if (!res.ok) return; const data = await res.json(); if (!cancelled) { setEvents(data.events || []); setNow(Date.now()); } } catch { /* Le bandeau n'empêche pas la connexion. */ }
    }
    void update(); const timer = setInterval(update, 60000);
    return () => { cancelled = true; clearInterval(timer); };
  }, []);
  const shown = events.filter(e => eventBannerState(e.starts_at,e.ends_at,true,now));
  if (!shown.length) return null;
  const contents = <>{shown.map(e => <Link key={e.id} href={`/evenements/${e.id}`} className="inline-flex gap-2 items-center px-6 py-2 text-amber-100 hover:underline whitespace-nowrap">
    <strong>{eventBannerState(e.starts_at,e.ends_at,true,now) === 'active' ? 'ÉVÉNEMENT EN COURS' : 'ÉVÉNEMENT À VENIR'}</strong> · {e.title} · {e.airports.join(' / ')} · {new Date(e.starts_at).toLocaleString('fr-FR',{timeZone:'UTC',dateStyle:'short',timeStyle:'short'})} UTC · Réserver / consulter les slots
  </Link>)}</>;
  return <aside aria-label="Événements majeurs" className={`${login ? 'absolute top-0 inset-x-0 z-40' : 'relative'} overflow-hidden border-y border-amber-500/40 bg-slate-950/95 text-sm`}>
    <div className="major-event-ticker flex w-max"><div className="flex">{contents}</div><div className="flex" aria-hidden="true">{shown.map(e => <span key={e.id} className="px-6 py-2 whitespace-nowrap">{e.title} · {e.airports.join(' / ')} · Rendez-vous dans le calendrier pour réserver</span>)}</div></div>
    <style jsx>{` .major-event-ticker { animation: major-event-scroll 35s linear infinite; } aside:hover .major-event-ticker, aside:focus-within .major-event-ticker { animation-play-state: paused; } @keyframes major-event-scroll { from { transform: translateX(0); } to { transform: translateX(-35%); } } @media(prefers-reduced-motion: reduce) { .major-event-ticker { animation:none; width:100%; flex-wrap:wrap; } } `}</style>
  </aside>;
}
