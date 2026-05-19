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
    if (isATraiter && !isActivated) return false;
    return true;
  });

  // Détection des doublons transpondeur Mode C :
  // si deux strips ont le même code_transpondeur ET les deux sont en mode C (pas S),
  // alors les deux sont marqués isDupe = true → le strip affiche l'alerte DUPE glitchée.
  const squawkModeCCounts = new Map<string, string[]>(); // code → [strip.id, ...]
  for (const s of visibleStrips) {
    const code = s.code_transpondeur?.trim();
    const mode = (s.mode_transpondeur || 'C').toUpperCase();
    if (!code || code.length !== 4 || mode === 'S') continue;
    // Ignorer les codes spéciaux (urgences)
    if (code === '7500' || code === '7600' || code === '7700') continue;
    const existing = squawkModeCCounts.get(code) ?? [];
    existing.push(s.id);
    squawkModeCCounts.set(code, existing);
  }
  const dupeIds = new Set<string>();
  squawkModeCCounts.forEach((ids) => {
    if (ids.length >= 2) ids.forEach((id) => dupeIds.add(id));
  });

  const stripsWithDupe = visibleStrips.map((s) => ({
    ...s,
    isDupe: dupeIds.has(s.id),
  }));

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

  return <FlightStripBoard strips={stripsWithDupe} atcPosition={atcPosition} atcAeroport={atcAeroport} onlineSessions={onlineSessions} />;
}
