'use client';

import { useEffect, useState } from 'react';

export default function PilotUtcClock() {
  const [now, setNow] = useState<Date | null>(null);
  useEffect(() => {
    const update = () => setNow(new Date());
    update();
    const timer = setInterval(update, 1_000);
    return () => clearInterval(timer);
  }, []);
  return <div className="text-right">
    <p className="text-xs font-medium uppercase tracking-wider text-slate-500">Horloge de référence</p>
    <p className="mt-1 font-mono text-xl font-semibold tabular-nums text-slate-100">
      {now ? now.toLocaleTimeString('fr-FR', { timeZone: 'UTC', hour: '2-digit', minute: '2-digit' }) : '––:––'} <span className="text-sm font-normal text-slate-400">UTC</span>
    </p>
    <p className="mt-1 text-xs text-slate-500">{now ? now.toLocaleDateString('fr-FR', { timeZone: 'UTC', day: '2-digit', month: 'long', year: 'numeric' }) : 'Temps universel coordonné'}</p>
  </div>;
}
