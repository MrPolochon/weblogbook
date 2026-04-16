'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState, useEffect, useRef, useCallback, useTransition } from 'react';
import { useAtcTheme } from '@/contexts/AtcThemeContext';
import { toast } from 'sonner';

type PlanTransfert = { id: string; numero_vol: string };
type PlanAccepter = { id: string; numero_vol: string; aeroport_depart: string; aeroport_arrivee: string };
type PlanCloture = { id: string; numero_vol: string; aeroport_depart: string; aeroport_arrivee: string };

// Sons de notification avec intensité variable
function playNotificationSound(type: 'transfer' | 'cloture' | 'nouveau' | 'rappel', intensity: number = 1) {
  try {
    const AC = window.AudioContext || (window as unknown as { webkitAudioContext: typeof window.AudioContext }).webkitAudioContext;
    if (!AC) return;
    const ctx = new AC();
    const vol = Math.min(0.9, 0.4 + (intensity * 0.12));

    function beep(freq: number, start: number, dur: number, v?: number) {
      const o = ctx.createOscillator();
      const g = ctx.createGain();
      o.connect(g); g.connect(ctx.destination);
      o.frequency.value = freq;
      g.gain.setValueAtTime(v ?? vol, ctx.currentTime + start);
      g.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + start + dur);
      o.start(ctx.currentTime + start);
      o.stop(ctx.currentTime + start + dur);
    }

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

// Calcule le niveau d'urgence (0-5) basé sur le temps écoulé en secondes
function getUrgencyLevel(secondsElapsed: number): number {
  if (secondsElapsed < 30) return 0;
  if (secondsElapsed < 60) return 1;
  if (secondsElapsed < 120) return 2;
  if (secondsElapsed < 180) return 3;
  if (secondsElapsed < 300) return 4;
  return 5;
}

// Intervalle de rappel sonore basé sur l'urgence (en secondes)
function getReminderInterval(urgency: number): number {
  switch (urgency) {
    case 0: return 0; // Pas de rappel
    case 1: return 60; // 1 minute
    case 2: return 30; // 30 secondes
    case 3: return 15; // 15 secondes
    case 4: return 10; // 10 secondes
    default: return 5; // 5 secondes (très insistant)
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
  
  // Tracker les plans activés (qui ont été affichés dans les strips)
  const [activatedPlanIds, setActivatedPlanIds] = useState<Set<string>>(new Set());
  
  // Tracker quand chaque élément a été vu pour la première fois
  const firstSeenRef = useRef<Map<string, number>>(new Map());
  const lastReminderRef = useRef<Map<string, number>>(new Map());
  
  // Références pour détecter les nouveaux éléments
  const prevTransfertIds = useRef<Set<string>>(new Set());
  const prevAccepterIds = useRef<Set<string>>(new Set());
  const prevClotureIds = useRef<Set<string>>(new Set());

  // Mettre à jour le temps courant toutes les secondes
  useEffect(() => {
    const interval = setInterval(() => {
      setCurrentTime(Date.now());
    }, 1000);
    return () => clearInterval(interval);
  }, []);

  // Alarme continue pour les transferts : 5 bips rapides toutes les 2s
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
    const currentIds = new Set(plansTransfert.map(p => p.id));
    plansTransfert.forEach(p => {
      if (!prevTransfertIds.current.has(p.id)) {
        firstSeenRef.current.set(p.id, Date.now());
      }
    });
    prevTransfertIds.current = currentIds;
  }, [plansTransfert]);

  useEffect(() => {
    const currentIds = new Set(plansAccepter.map(p => p.id));
    plansAccepter.forEach(p => {
      if (!prevAccepterIds.current.has(p.id)) {
        firstSeenRef.current.set(p.id, Date.now());
        playNotificationSound('nouveau');
      }
    });
    prevAccepterIds.current = currentIds;
  }, [plansAccepter]);

  useEffect(() => {
    const currentIds = new Set(plansCloture.map(p => p.id));
    plansCloture.forEach(p => {
      if (!prevClotureIds.current.has(p.id)) {
        firstSeenRef.current.set(p.id, Date.now());
        playNotificationSound('cloture');
      }
    });
    prevClotureIds.current = currentIds;
  }, [plansCloture]);

  // Calculer l'urgence maximale parmi tous les éléments
  const getMaxUrgency = useCallback(() => {
    let maxUrgency = 0;
    const allItems = [...plansTransfert, ...plansAccepter, ...plansCloture];
    
    allItems.forEach(item => {
      const firstSeen = firstSeenRef.current.get(item.id) || currentTime;
      const elapsed = (currentTime - firstSeen) / 1000;
      const urgency = getUrgencyLevel(elapsed);
      if (urgency > maxUrgency) maxUrgency = urgency;
    });
    
    return maxUrgency;
  }, [plansTransfert, plansAccepter, plansCloture, currentTime]);

  // Jouer les rappels sonores périodiques
  useEffect(() => {
    const allItems = [...plansAccepter, ...plansCloture]; // Pas les transferts (timeout automatique)
    
    allItems.forEach(item => {
      const firstSeen = firstSeenRef.current.get(item.id) || currentTime;
      const elapsed = (currentTime - firstSeen) / 1000;
      const urgency = getUrgencyLevel(elapsed);
      const interval = getReminderInterval(urgency);
      
      if (interval > 0) {
        const lastReminder = lastReminderRef.current.get(item.id) || 0;
        const sinceLastReminder = (currentTime - lastReminder) / 1000;
        
        if (sinceLastReminder >= interval) {
          playNotificationSound('rappel', urgency);
          lastReminderRef.current.set(item.id, currentTime);
        }
      }
    });
  }, [currentTime, plansAccepter, plansCloture]);

  // Nettoyer les références pour les éléments supprimés
  useEffect(() => {
    const currentIds = new Set([
      ...plansTransfert.map(p => p.id),
      ...plansAccepter.map(p => p.id),
      ...plansCloture.map(p => p.id),
    ]);
    
    Array.from(firstSeenRef.current.keys()).forEach(id => {
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

  // Fonction pour activer un plan (le faire apparaître dans les strips)
  function handleActiverPlan(planId: string) {
    // Ajouter aux plans activés localement
    setActivatedPlanIds((prev) => {
      const next = new Set(prev);
      next.add(planId);
      return next;
    });

    // Dispatcher l'événement global pour le FlightStripBoardWrapper
    const event = new CustomEvent('activateStrip', { detail: { planId } });
    window.dispatchEvent(event);
  }

  // Générer les classes CSS dynamiques basées sur l'urgence
  function getItemClass(itemId: string, baseColor: 'orange' | 'red'): string {
    const firstSeen = firstSeenRef.current.get(itemId) || currentTime;
    const elapsed = (currentTime - firstSeen) / 1000;
    const urgency = getUrgencyLevel(elapsed);
    
    // Animation plus rapide avec l'urgence
    const animationDuration = Math.max(0.1, 0.5 - (urgency * 0.08));
    
    // Taille augmente légèrement
    const scale = 1 + (urgency * 0.02);
    
    // Shadow plus intense
    const shadowIntensity = urgency * 4;
    
    const bgColor = baseColor === 'red' ? 'bg-red-500' : 'bg-orange-500';
    const borderColor = baseColor === 'red' ? 'border-red-600' : 'border-orange-600';
    const hoverBg = baseColor === 'red' ? 'hover:bg-red-600' : 'hover:bg-orange-600';
    const hoverBorder = baseColor === 'red' ? 'hover:border-red-700' : 'hover:border-orange-700';
    
    return `w-full text-left truncate text-sm font-bold text-white ${bgColor} border-2 ${borderColor} rounded px-2 py-1.5 ${hoverBg} ${hoverBorder} disabled:opacity-50`
      + ` animate-[blink_${animationDuration}s_ease-in-out_infinite]`
      + ` transform scale-[${scale}]`
      + ` shadow-[0_0_${shadowIntensity}px_${baseColor === 'red' ? 'rgba(239,68,68,0.8)' : 'rgba(249,115,22,0.8)'}]`;
  }

  // Format temps écoulé
  function formatElapsed(itemId: string): string {
    const firstSeen = firstSeenRef.current.get(itemId) || currentTime;
    const elapsed = Math.floor((currentTime - firstSeen) / 1000);
    
    if (elapsed < 60) return `${elapsed}s`;
    const mins = Math.floor(elapsed / 60);
    const secs = elapsed % 60;
    return `${mins}m${secs.toString().padStart(2, '0')}s`;
  }

  // Filtrer les plans encore visibles (non activés)
  const plansAccepterVisibles = plansAccepter.filter(p => !activatedPlanIds.has(p.id));
  
  // Si plus rien à afficher, masquer complètement la sidebar
  if (plansTransfert.length === 0 && plansAccepterVisibles.length === 0) return null;

  const maxUrgency = getMaxUrgency();
  
  // Le sidebar devient plus intense avec l'urgence
  const sidebarBorderWidth = 2 + maxUrgency;
  const sidebarShadow = 12 + (maxUrgency * 8);
  
  const sidebarBg = isDark ? 'bg-orange-950' : 'bg-orange-100';
  const sidebarTitleColor = isDark ? 'text-orange-300' : 'text-orange-900';
  
  return (
    <aside 
      className={`atc-sidebar w-52 flex-shrink-0 ${sidebarBg} py-3 px-2 flex flex-col transition-all duration-300 fixed md:static bottom-0 right-0 z-50 md:z-auto rounded-tl-xl md:rounded-none max-h-[50vh] md:max-h-none overflow-y-auto`}
      style={{
        borderLeft: `${sidebarBorderWidth}px solid rgb(249, 115, 22)`,
        boxShadow: `0 0 ${sidebarShadow}px rgba(249, 115, 22, ${0.3 + (maxUrgency * 0.1)})`,
      }}
    >
      <p className={`text-xs font-bold uppercase tracking-wider ${sidebarTitleColor} px-2 mb-1.5`}>
        À traiter {maxUrgency >= 3 && '⚠️'}
      </p>


      {/* Plans à accepter */}
      {plansAccepterVisibles.length > 0 && (
        <div className="mb-3">
          <p className={`text-[10px] font-semibold ${isDark ? 'text-orange-400' : 'text-orange-800'} px-2 mb-1`}>Plans à traiter</p>
          <ul className="space-y-1">
            {plansAccepterVisibles.map((p) => {
              const urgency = getUrgencyLevel((currentTime - (firstSeenRef.current.get(p.id) || currentTime)) / 1000);
              return (
                <li key={p.id} className="relative">
                  <button
                    type="button"
                    onClick={() => handleActiverPlan(p.id)}
                    className={`block ${getItemClass(p.id, 'orange')}`}
                    title={`${p.numero_vol} ${p.aeroport_depart} → ${p.aeroport_arrivee}`}
                    style={{
                      animation: `blink ${Math.max(0.15, 0.5 - (urgency * 0.08))}s ease-in-out infinite`,
                      transform: `scale(${1 + (urgency * 0.02)})`,
                      boxShadow: `0 0 ${urgency * 6}px rgba(249, 115, 22, 0.8)`,
                    }}
                  >
                    {p.numero_vol} {p.aeroport_depart}→{p.aeroport_arrivee}
                  </button>
                  <span className="absolute -top-1 -right-1 text-[9px] bg-orange-700 text-white px-1 rounded">
                    {formatElapsed(p.id)}
                  </span>
                </li>
              );
            })}
          </ul>
        </div>
      )}

      {/* Transferts */}
      {plansTransfert.length > 0 && (
        <div>
          <p className={`text-[10px] font-semibold px-2 mb-1 ${isDark ? 'text-orange-400' : 'text-orange-800'}`}>Transferts (5 min)</p>
          <ul className="space-y-1">
            {plansTransfert.map((p) => {
              const urgency = getUrgencyLevel((currentTime - (firstSeenRef.current.get(p.id) || currentTime)) / 1000);
              return (
                <li key={p.id} className="relative">
                  <button
                    type="button"
                    onClick={() => handleAcceptTransfert(p.id)}
                    disabled={loadingId !== null}
                    className={getItemClass(p.id, 'orange')}
                    title="Cliquer pour accepter le transfert"
                    style={{
                      animation: `blink ${Math.max(0.2, 0.5 - (urgency * 0.06))}s ease-in-out infinite`,
                      boxShadow: `0 0 ${urgency * 4}px rgba(249, 115, 22, 0.6)`,
                    }}
                  >
                    {loadingId === p.id ? '…' : `↔️ ${p.numero_vol}`}
                  </button>
                  <span className="absolute -top-1 -right-1 text-[9px] bg-orange-700 text-white px-1 rounded">
                    {formatElapsed(p.id)}
                  </span>
                </li>
              );
            })}
          </ul>
        </div>
      )}

      <style jsx>{`
        @keyframes blink {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.3; }
        }
      `}</style>
    </aside>
  );
}
