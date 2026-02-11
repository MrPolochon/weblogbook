'use client';

import { useState, useEffect } from 'react';
import FlightStripBoard from './FlightStripBoard';
import type { StripData } from './FlightStrip';

interface FlightStripBoardWrapperProps {
  allStrips: StripData[];
  plansATraiter: string[]; // IDs des plans à traiter (depose, en_attente)
}

export default function FlightStripBoardWrapper({ allStrips, plansATraiter }: FlightStripBoardWrapperProps) {
  const [activatedPlanIds, setActivatedPlanIds] = useState<Set<string>>(new Set());

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

  return <FlightStripBoard strips={visibleStrips} />;
}
