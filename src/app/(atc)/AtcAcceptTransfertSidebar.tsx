'use client';

import { useRouter } from 'next/navigation';
import { useState, useEffect, useRef, useCallback, useTransition } from 'react';
import { useAtcTheme } from '@/contexts/AtcThemeContext';
import { toast } from 'sonner';
import { ArrowRightLeft, Inbox, PlaneLanding, Radio } from 'lucide-react';

type PlanTransfert = { id: string; numero_vol: string };
type PlanAccepter = { id: string; numero_vol: string; aeroport_depart: string; aeroport_arrivee: string };
type PlanCloture = { id: string; numero_vol: string; aeroport_depart: string; aeroport_arrivee: string };

function playNotificationSound(type: 'transfer' | 'cloture' | 'nouveau' | 'rappel', intensity: number = 1) {
  try {
    const AC = window.AudioContext || (window as unknown as { webkitAudioContext: typeof window.AudioContext }).webkitAudioContext;
    if (!AC) return;
    const ctx = new AC();
    const vol = Math.min(0.9, 0.4 + (intensity * 0.12));

    const beep = (freq: number, start: number, dur: number, v?: number) => {
      const o = ctx.createOscillator();
      const g = ctx.createGain();
      o.connect(g); g.connect(ctx.destination);
      o.frequency.value = freq;
      g.gain.setValueAtTime(v ?? vol, ctx.currentTime + start);
      g.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + start + dur);
      o.start(ctx.currentTime + start);
      o.stop(ctx.currentTime + start + dur);
    };

    switch (type) {
      case 'transfer':
        setTimeout(() => ctx.close(), 100);
        return;
      case 'cloture':
        beep(500, 0, 0.2);
        beep(600, 0.25, 0.2);
        beep(500, 0.5, 0.3);
        setTimeout(() => ctx.close(), 1000);
        break;
      case 'nouveau':
        beep(660, 0, 0.12);
        beep(880, 0.15, 0.12);
        beep(660, 0.3, 0.12);
        beep(880, 0.45, 0.12);
        setTimeout(() => ctx.close(), 800);
        break;
      case 'rappel': {
        const f = 600 + (intensity * 120);
        const n = Math.min(6, 3 + Math.floor(intensity));
        for (let i = 0; i < n; i++) {
          beep(f + (i * 60), i * 0.16, 0.12, vol);
        }
        beep(f + (n * 80), n * 0.16, 0.3, Math.min(1, vol + 0.15));
        setTimeout(() => ctx.close(), (n + 2) * 160 + 400);
        break;
      }
    }
  } catch { /* audio unavailable */ }
}

function getUrgencyLevel(secondsElapsed: number): number {
  if (secondsElapsed < 30) return 0;
  if (secondsElapsed < 60) return 1;
  if (secondsElapsed < 120) return 2;
  if (secondsElapsed < 180) return 3;
  if (secondsElapsed < 300) return 4;
  return 5;
}

function getReminderInterval(urgency: number): number {
  switch (urgency) {
    case 0: return 0;
    case 1: return 60;
    case 2: return 30;
    case 3: return 15;
    case 4: return 10;
    default: return 5;
  }
}

function startTransferAlarm(): () => void {
  let stopped = false;
  let timer: ReturnType<typeof setTimeout> | null = null;
  function playBurst() {
    if (stopped) return;
    try {
      const AC = window.AudioContext || (window as unknown as { webkitAudioContext: typeof window.AudioContext }).webkitAudioContext;
      if (!AC) return;
      const ctx = new AC();
      const times = [0, 0.1, 0.2, 0.3, 0.4];
      const freqs = [880, 1100, 880, 1100, 1320];
      times.forEach((t, i) => {
        const o = ctx.createOscillator();
        const g = ctx.createGain();
        o.connect(g); g.connect(ctx.destination);
        o.frequency.value = freqs[i];
        g.gain.setValueAtTime(0.7, ctx.currentTime + t);
        g.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + t + 0.08);
        o.start(ctx.currentTime + t);
        o.stop(ctx.currentTime + t + 0.08);
      });
      setTimeout(() => ctx.close(), 800);
    } catch { /* audio unavailable */ }
    timer = setTimeout(playBurst, 2000);
  }
  playBurst();
  return () => { stopped = true; if (timer) clearTimeout(timer); };
}

export default function AtcAcceptTransfertSidebar({
  plansTransfert,
  plansAccepter,
  plansCloture,
}: {
  plansTransfert: PlanTransfert[];
  plansAccepter: PlanAccepter[];
  plansCloture: PlanCloture[];
}) {
  const router = useRouter();
  const [, startTransition] = useTransition();
  const { theme } = useAtcTheme();
  const isDark = theme === 'dark';
  const [loadingId, setLoadingId] = useState<string | null>(null);
  const [currentTime, setCurrentTime] = useState(Date.now());
  const [activatedPlanIds, setActivatedPlanIds] = useState<Set<string>>(new Set());

  const firstSeenRef = useRef<Map<string, number>>(new Map());
  const lastReminderRef = useRef<Map<string, number>>(new Map());
  const lastRappelDataRefreshRef = useRef(0);
  const prevTransfertIds = useRef<Set<string>>(new Set());
  const prevAccepterIds = useRef<Set<string>>(new Set());
  const prevClotureIds = useRef<Set<string>>(new Set());

  useEffect(() => {
    const interval = setInterval(() => setCurrentTime(Date.now()), 1000);
    return () => clearInterval(interval);
  }, []);

  const stopAlarmRef = useRef<(() => void) | null>(null);
  useEffect(() => {
    if (plansTransfert.length > 0 && !stopAlarmRef.current) {
      stopAlarmRef.current = startTransferAlarm();
    } else if (plansTransfert.length === 0 && stopAlarmRef.current) {
      stopAlarmRef.current();
      stopAlarmRef.current = null;
    }
    return () => { if (stopAlarmRef.current) { stopAlarmRef.current(); stopAlarmRef.current = null; } };
  }, [plansTransfert.length]);

  useEffect(() => {
    const currentIds = new Set(plansTransfert.map((p) => p.id));
    plansTransfert.forEach((p) => {
      if (!prevTransfertIds.current.has(p.id)) firstSeenRef.current.set(p.id, Date.now());
    });
    prevTransfertIds.current = currentIds;
  }, [plansTransfert]);

  useEffect(() => {
    const currentIds = new Set(plansAccepter.map((p) => p.id));
    plansAccepter.forEach((p) => {
      if (!prevAccepterIds.current.has(p.id)) {
        firstSeenRef.current.set(p.id, Date.now());
        playNotificationSound('nouveau');
      }
    });
    prevAccepterIds.current = currentIds;
  }, [plansAccepter]);

  useEffect(() => {
    const currentIds = new Set(plansCloture.map((p) => p.id));
    plansCloture.forEach((p) => {
      if (!prevClotureIds.current.has(p.id)) {
        firstSeenRef.current.set(p.id, Date.now());
        playNotificationSound('cloture');
      }
    });
    prevClotureIds.current = currentIds;
  }, [plansCloture]);

  const getMaxUrgency = useCallback(() => {
    let maxUrgency = 0;
    const allItems = [...plansTransfert, ...plansAccepter, ...plansCloture];
    allItems.forEach((item) => {
      const firstSeen = firstSeenRef.current.get(item.id) || currentTime;
      const elapsed = (currentTime - firstSeen) / 1000;
      const urgency = getUrgencyLevel(elapsed);
      if (urgency > maxUrgency) maxUrgency = urgency;
    });
    return maxUrgency;
  }, [plansTransfert, plansAccepter, plansCloture, currentTime]);

  useEffect(() => {
    const allItems = [...plansAccepter, ...plansCloture];
    allItems.forEach((item) => {
      const firstSeen = firstSeenRef.current.get(item.id) || currentTime;
      const elapsed = (currentTime - firstSeen) / 1000;
      const urgency = getUrgencyLevel(elapsed);
      const interval = getReminderInterval(urgency);
      if (interval > 0) {
        const lastReminder = lastReminderRef.current.get(item.id) || 0;
        const sinceLastReminder = (currentTime - lastReminder) / 1000;
        if (sinceLastReminder >= interval) {
          const nowMs = Date.now();
          if (nowMs - lastRappelDataRefreshRef.current >= 10_000) {
            lastRappelDataRefreshRef.current = nowMs;
            startTransition(() => router.refresh());
          }
          playNotificationSound('rappel', urgency);
          lastReminderRef.current.set(item.id, currentTime);
        }
      }
    });
  }, [currentTime, plansAccepter, plansCloture, router]);

  useEffect(() => {
    const currentIds = new Set([
      ...plansTransfert.map((p) => p.id),
      ...plansAccepter.map((p) => p.id),
      ...plansCloture.map((p) => p.id),
    ]);
    Array.from(firstSeenRef.current.keys()).forEach((id) => {
      if (!currentIds.has(id)) {
        firstSeenRef.current.delete(id);
        lastReminderRef.current.delete(id);
      }
    });
  }, [plansTransfert, plansAccepter, plansCloture]);

  async function handleAcceptTransfert(planId: string) {
    setLoadingId(planId);
    try {
      const res = await fetch(`/api/plans-vol/${planId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'accepter_transfert' }),
      });
      const d = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(d.error || 'Erreur');
      startTransition(() => router.refresh());
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Erreur');
    } finally {
      setLoadingId(null);
    }
  }

  function handleActiverPlan(planId: string) {
    setActivatedPlanIds((prev) => {
      const next = new Set(prev);
      next.add(planId);
      return next;
    });
    window.dispatchEvent(new CustomEvent('activateStrip', { detail: { planId } }));
  }

  function formatElapsed(itemId: string): string {
    const firstSeen = firstSeenRef.current.get(itemId) || currentTime;
    const elapsed = Math.floor((currentTime - firstSeen) / 1000);
    if (elapsed < 60) return `${elapsed}s`;
    const mins = Math.floor(elapsed / 60);
    const secs = elapsed % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  }

  const plansAccepterVisibles = plansAccepter.filter((p) => !activatedPlanIds.has(p.id));
  if (plansTransfert.length === 0 && plansAccepterVisibles.length === 0 && plansCloture.length === 0) return null;

  const maxUrgency = getMaxUrgency();
  const total = plansTransfert.length + plansAccepterVisibles.length + plansCloture.length;

  const card = (urgent: boolean, tone: 'amber' | 'sky' | 'red') => {
    const tones = {
      amber: isDark ? 'bg-amber-950/80 border-amber-600/60 text-amber-100 hover:bg-amber-900' : 'bg-amber-50 border-amber-300 text-amber-950 hover:bg-amber-100',
      sky: isDark ? 'bg-sky-950/80 border-sky-600/60 text-sky-100 hover:bg-sky-900' : 'bg-sky-50 border-sky-300 text-sky-950 hover:bg-sky-100',
      red: isDark ? 'bg-red-950/80 border-red-600/60 text-red-100 hover:bg-red-900' : 'bg-red-50 border-red-300 text-red-950 hover:bg-red-100',
    };
    return `w-full text-left rounded-lg border px-2.5 py-2 transition-colors ${tones[tone]} ${urgent ? 'atc-inbox-urgent' : ''}`;
  };

  return (
    <aside
      className={`atc-sidebar w-[240px] shrink-0 flex flex-col border-l ${isDark ? 'bg-[#080c14]/95 border-slate-800' : 'bg-white/90 border-slate-300'}`}
    >
      <div className={`px-3 py-2.5 border-b flex items-center justify-between ${isDark ? 'border-slate-800' : 'border-slate-200'}`}>
        <div>
          <p className={`text-[10px] font-black uppercase tracking-[0.18em] ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>Inbox</p>
          <p className={`text-xs font-bold ${maxUrgency >= 3 ? 'text-red-400' : (isDark ? 'text-slate-200' : 'text-slate-800')}`}>
            {total} à traiter{maxUrgency >= 3 ? ' · urgent' : ''}
          </p>
        </div>
        <span className={`flex h-6 min-w-6 items-center justify-center rounded-full text-[11px] font-black ${maxUrgency >= 3 ? 'bg-red-600 text-white' : (isDark ? 'bg-sky-900 text-sky-200' : 'bg-sky-100 text-sky-800')}`}>
          {total}
        </span>
      </div>

      <div className="flex-1 overflow-y-auto p-2 space-y-3">
        {plansAccepterVisibles.length > 0 && (
          <section>
            <p className={`text-[10px] font-black uppercase tracking-wider mb-1.5 flex items-center gap-1.5 ${isDark ? 'text-amber-400' : 'text-amber-700'}`}>
              <Inbox className="h-3 w-3" /> Nouveaux plans
            </p>
            <ul className="space-y-1.5">
              {plansAccepterVisibles.map((p) => {
                const urgency = getUrgencyLevel((currentTime - (firstSeenRef.current.get(p.id) || currentTime)) / 1000);
                return (
                  <li key={p.id}>
                    <button type="button" onClick={() => handleActiverPlan(p.id)} className={card(urgency >= 2, 'amber')} title="Afficher le strip">
                      <div className="flex items-center justify-between gap-2">
                        <span className="font-mono font-black text-sm truncate">{p.numero_vol}</span>
                        <span className="text-[9px] font-bold tabular-nums opacity-70">{formatElapsed(p.id)}</span>
                      </div>
                      <p className="text-[10px] font-semibold opacity-70 mt-0.5">{p.aeroport_depart} → {p.aeroport_arrivee}</p>
                    </button>
                  </li>
                );
              })}
            </ul>
          </section>
        )}

        {plansTransfert.length > 0 && (
          <section>
            <p className={`text-[10px] font-black uppercase tracking-wider mb-1.5 flex items-center gap-1.5 ${isDark ? 'text-sky-400' : 'text-sky-700'}`}>
              <ArrowRightLeft className="h-3 w-3" /> Transferts
            </p>
            <ul className="space-y-1.5">
              {plansTransfert.map((p) => {
                const urgency = getUrgencyLevel((currentTime - (firstSeenRef.current.get(p.id) || currentTime)) / 1000);
                return (
                  <li key={p.id}>
                    <button
                      type="button"
                      onClick={() => handleAcceptTransfert(p.id)}
                      disabled={loadingId !== null}
                      className={card(urgency >= 1, 'sky')}
                      title="Accepter le transfert"
                    >
                      <div className="flex items-center justify-between gap-2">
                        <span className="font-mono font-black text-sm truncate">{loadingId === p.id ? '…' : p.numero_vol}</span>
                        <span className="text-[9px] font-bold tabular-nums opacity-70">{formatElapsed(p.id)}</span>
                      </div>
                      <p className="text-[10px] font-semibold opacity-70 mt-0.5 flex items-center gap-1">
                        <Radio className="h-3 w-3" /> Prendre le contrôle
                      </p>
                    </button>
                  </li>
                );
              })}
            </ul>
          </section>
        )}

        {plansCloture.length > 0 && (
          <section>
            <p className={`text-[10px] font-black uppercase tracking-wider mb-1.5 flex items-center gap-1.5 ${isDark ? 'text-red-400' : 'text-red-700'}`}>
              <PlaneLanding className="h-3 w-3" /> Clôtures
            </p>
            <ul className="space-y-1.5">
              {plansCloture.map((p) => (
                <li key={p.id} className={card(true, 'red')}>
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-mono font-black text-sm truncate">{p.numero_vol}</span>
                    <span className="text-[9px] font-bold tabular-nums opacity-70">{formatElapsed(p.id)}</span>
                  </div>
                  <p className="text-[10px] font-semibold opacity-70 mt-0.5">{p.aeroport_depart} → {p.aeroport_arrivee}</p>
                </li>
              ))}
            </ul>
          </section>
        )}
      </div>
    </aside>
  );
}
