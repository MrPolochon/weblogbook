'use client';

import { useState, useEffect } from 'react';
import FlightStripBoard from './FlightStripBoard';
import type { StripData } from './FlightStrip';

export interface OnlineSession { aeroport: string; position: string; user_id: string }

interface FlightStripBoardWrapperProps {
  allStrips: StripData[];
  plansATraiter: string[];
  atcPosition?: string;
  atcAeroport?: string;
  onlineSessions?: OnlineSession[];
}

export default function FlightStripBoardWrapper({ allStrips, plansATraiter, atcPosition, atcAeroport, onlineSessions }: FlightStripBoardWrapperProps) {
  const [activatedPlanIds, setActivatedPlanIds] = useState<Set<string>>(new Set());

  // Nettoyer les activations locales si le strip n'existe plus côté serveur (évite état fantôme).
  useEffect(() => {
    const valid = new Set(allStrips.map((s) => s.id));
    setActivatedPlanIds((prev) => {
      let changed = false;
      const next = new Set<string>();
      prev.forEach((id) => {
        if (valid.has(id)) next.add(id);
        else changed = true;
      });
      return changed ? next : prev;
    });
  }, [allStrips]);

  // Filtrer les strips : exclure ceux qui sont "à traiter" ET pas encore activés
  const visibleStrips = allStrips.filter((strip) => {
    const isATraiter = plansATraiter.includes(strip.id);
    const isActivated = activatedPlanIds.has(strip.id);
    
    // Si c'est un plan à traiter ET pas encore activé, on le cache
    if (isATraiter && !isActivated) {
      return false;
    }
    
    return true;
  });

  // Écouter les événements d'activation depuis la sidebar
  useEffect(() => {
    const handleActivation = (event: CustomEvent<{ planId: string }>) => {
      setActivatedPlanIds((prev) => {
        const next = new Set(prev);
        next.add(event.detail.planId);
        return next;
      });
    };

    window.addEventListener('activateStrip' as never, handleActivation as never);
    return () => window.removeEventListener('activateStrip' as never, handleActivation as never);
  }, []);

  return <FlightStripBoard strips={visibleStrips} atcPosition={atcPosition} atcAeroport={atcAeroport} onlineSessions={onlineSessions} />;
}
