'use client';

import { useEffect, useState } from 'react';
import { groundIdleClock } from '@/lib/ground/inactivity';
import { radioDesktop } from '@/lib/radio-desktop';

export default function GroundInactivityGuard({ userId, sessionId, children }: {
  userId: string; sessionId: string | null; children: React.ReactNode;
}) {
  const [expired, setExpired] = useState(false);
  const [finished, setFinished] = useState(false);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    setExpired(false); setFinished(false); setFailed(false);
    if (!sessionId) return;
    const key = `ground-duty-activity:${userId}:${sessionId}`;
    // Accessing localStorage itself can throw in a restricted browser.
    const storage = {
      getItem: (name: string) => window.localStorage.getItem(name),
      setItem: (name: string, value: string) => window.localStorage.setItem(name, value),
    };
    const clock = groundIdleClock(storage, key);
    let stopped = false, ending = false, done = false;
    let controller: AbortController | null = null;
    async function check() {
      if (stopped || !clock.check()) return;
      // Unmount the COM immediately, even offline: this closes the microphone and transport.
      setExpired(true);
      if (ending || done) return;
      ending = true;
      controller = new AbortController();
      const timeout = setTimeout(() => controller?.abort(), 15_000);
      try {
        const response = await fetch(`/api/ground/session?sessionId=${encodeURIComponent(sessionId!)}`, {
          method: 'DELETE', signal: controller.signal,
        });
        if (!response.ok) throw new Error('Service cleanup failed');
        done = true;
        if (!stopped) { setFinished(true); setFailed(false); }
      } catch { if (!stopped) setFailed(true); }
      finally { clearTimeout(timeout); ending = false; }
    }
    const activity = (event: Event) => {
      if (!event.isTrusted) return;
      if (!clock.activity()) void check();
    };
    const events = ['pointerdown', 'pointermove', 'keydown', 'wheel', 'touchstart'] as const;
    events.forEach(name => window.addEventListener(name, activity, { passive: true }));
    const wake = () => { void check(); };
    window.addEventListener('focus', wake);
    window.addEventListener('online', wake);
    document.addEventListener('visibilitychange', wake);
    const changed = (event: StorageEvent) => { if (event.key === key) wake(); };
    window.addEventListener('storage', changed);
    const unsubscribe = radioDesktop()?.onPtt(down => { if (down && !clock.activity()) wake(); });
    const timer = setInterval(wake, 15_000);
    wake();
    return () => {
      stopped = true; controller?.abort(); clearInterval(timer); unsubscribe?.();
      events.forEach(name => window.removeEventListener(name, activity));
      window.removeEventListener('focus', wake); window.removeEventListener('online', wake);
      window.removeEventListener('storage', changed); document.removeEventListener('visibilitychange', wake);
    };
  }, [sessionId, userId]);

  if (!sessionId || !expired) return <>{children}</>;
  return <section className="mx-auto my-12 max-w-xl rounded-2xl border border-amber-700/50 bg-slate-950 p-6 text-slate-100" role="status">
    <h1 className="text-xl font-bold">Fin de service pour inactivité</h1>
    <p className="mt-3">Aucune activité détectée depuis une heure. Ta radio est déconnectée.</p>
    <p className="mt-2 text-sm text-slate-300">{finished ? 'Tu es hors service Ground Crew. Ton compte reste connecté.' : failed
      ? 'La fermeture du service attend le retour du réseau. Nouvelle tentative automatique…'
      : 'Fermeture du service Ground Crew…'}</p>
    {finished && <a href="/ground" className="mt-5 inline-block rounded-lg bg-emerald-800 px-4 py-2 font-semibold">Retour à l’espace Ground Crew</a>}
  </section>;
}
