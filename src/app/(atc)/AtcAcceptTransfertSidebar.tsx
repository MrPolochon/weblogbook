'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState, useEffect, useRef, useCallback, useTransition } from 'react';
import { useAtcTheme } from '@/contexts/AtcThemeContext';

type PlanTransfert = { id: string; numero_vol: string };
type PlanAccepter = { id: string; numero_vol: string; aeroport_depart: string; aeroport_arrivee: string };
type PlanCloture = { id: string; numero_vol: string; aeroport_depart: string; aeroport_arrivee: string };

// Sons de notification avec intensité variable
function playNotificationSound(type: 'transfer' | 'cloture' | 'nouveau' | 'rappel', intensity: number = 1) {
  try {
    const AudioContext = window.AudioContext || (window as unknown as { webkitAudioContext: typeof window.AudioContext }).webkitAudioContext;
    if (!AudioContext) return;
    
    const ctx = new AudioContext();
    const oscillator = ctx.createOscillator();
    const gainNode = ctx.createGain();
    
    oscillator.connect(gainNode);
    gainNode.connect(ctx.destination);
    
    // Volume augmente avec l'intensité (max 0.6)
    const baseVolume = Math.min(0.6, 0.2 + (intensity * 0.1));
    
    switch (type) {
      case 'transfer':
        oscillator.frequency.value = 800;
        gainNode.gain.value = baseVolume;
        oscillator.start();
        setTimeout(() => { oscillator.frequency.value = 1000; }, 150);
        setTimeout(() => { oscillator.stop(); ctx.close(); }, 300);
        break;
      case 'cloture':
        oscillator.frequency.value = 400;
        gainNode.gain.value = baseVolume + 0.1;
        oscillator.start();
        setTimeout(() => { oscillator.frequency.value = 500; }, 200);
        setTimeout(() => { oscillator.frequency.value = 400; }, 400);
        setTimeout(() => { oscillator.stop(); ctx.close(); }, 600);
        break;
      case 'nouveau':
        oscillator.frequency.value = 600;
        gainNode.gain.value = baseVolume;
        oscillator.start();
        setTimeout(() => { gainNode.gain.value = 0; }, 100);
        setTimeout(() => { gainNode.gain.value = baseVolume; }, 200);
        setTimeout(() => { gainNode.gain.value = 0; }, 300);
        setTimeout(() => { gainNode.gain.value = baseVolume; }, 400);
        setTimeout(() => { oscillator.stop(); ctx.close(); }, 500);
        break;
      case 'rappel':
        // Son de rappel insistant - devient plus agressif avec l'intensité
        const baseFreq = 500 + (intensity * 100);
        oscillator.frequency.value = baseFreq;
        gainNode.gain.value = baseVolume;
        oscillator.start();
        
        // Plus de bips avec l'intensité
        const beeps = Math.min(5, 2 + Math.floor(intensity));
        for (let i = 0; i < beeps; i++) {
          setTimeout(() => { gainNode.gain.value = 0; }, 100 + (i * 200));
          setTimeout(() => { gainNode.gain.value = baseVolume; oscillator.frequency.value = baseFreq + (i * 50); }, 150 + (i * 200));
        }
        setTimeout(() => { oscillator.stop(); ctx.close(); }, 100 + (beeps * 200));
        break;
    }
  } catch (e) {
    console.warn('Audio not available:', e);
  }
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

  // Enregistrer les nouveaux éléments et jouer le son initial
  useEffect(() => {
    const currentIds = new Set(plansTransfert.map(p => p.id));
    plansTransfert.forEach(p => {
      if (!prevTransfertIds.current.has(p.id)) {
        firstSeenRef.current.set(p.id, Date.now());
        playNotificationSound('transfer');
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
      alert(e instanceof Error ? e.message : 'Erreur');
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
      className={`atc-sidebar w-52 flex-shrink-0 ${sidebarBg} py-3 px-2 hidden md:flex flex-col transition-all duration-300`}
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
          <p className={`text-[10px] font-semibold px-2 mb-1 ${isDark ? 'text-orange-400' : 'text-orange-800'}`}>Transferts (1 min)</p>
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
