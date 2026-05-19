'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
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
  // État local des strips : initialisé depuis le SSR, mis à jour via API rapide
  const [strips, setStrips] = useState<StripData[]>(allStrips);
  const [activatedPlanIds, setActivatedPlanIds] = useState<Set<string>>(new Set());
  const refreshingRef = useRef(false);

  // Resync depuis SSR si les props changent (router.refresh() ou navigation)
  useEffect(() => {
    setStrips(allStrips);
  }, [allStrips]);

  // Nettoyer les activations locales si un strip disparaît du serveur
  useEffect(() => {
    const valid = new Set(strips.map((s) => s.id));
    setActivatedPlanIds((prev) => {
      let changed = false;
      const next = new Set<string>();
      prev.forEach((id) => {
        if (valid.has(id)) next.add(id);
        else changed = true;
      });
      return changed ? next : prev;
    });
  }, [strips]);

  /**
   * refreshStrips — fetch rapide depuis /api/atc/strips (sans router.refresh).
   * Remplace le router.refresh() complet par un simple appel API côté client.
   * Typiquement ~80-150ms contre ~800-2000ms pour un router.refresh().
   */
  const refreshStrips = useCallback(async () => {
    if (refreshingRef.current) return;
    refreshingRef.current = true;
    try {
      const res = await fetch('/api/atc/strips', { cache: 'no-store' });
      if (!res.ok) return;
      const data = await res.json();
      if (Array.isArray(data.strips)) {
        setStrips(data.strips);
      }
    } catch {
      // Silencieux : le prochain refresh ou le SSR resyncera
    } finally {
      refreshingRef.current = false;
    }
  }, []);

  // Écouter l'événement dispatché par AtcPlansRealtimeRefresh (remplace router.refresh)
  useEffect(() => {
    const handler = () => refreshStrips();
    window.addEventListener('atc-strips-refresh', handler);
    return () => window.removeEventListener('atc-strips-refresh', handler);
  }, [refreshStrips]);

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

  // Filtrer : exclure les plans « à traiter » non encore activés
  const visibleStrips = strips.filter((strip) => {
    const isATraiter = plansATraiter.includes(strip.id);
    const isActivated = activatedPlanIds.has(strip.id);
    if (isATraiter && !isActivated) return false;
    return true;
  });

  // Détection DUPE squawk Mode C
  const squawkModeCCounts = new Map<string, string[]>();
  for (const s of visibleStrips) {
    const code = s.code_transpondeur?.trim();
    const mode = (s.mode_transpondeur || 'C').toUpperCase();
    if (!code || code.length !== 4 || mode === 'S') continue;
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

  return (
    <FlightStripBoard
      strips={stripsWithDupe}
      atcPosition={atcPosition}
      atcAeroport={atcAeroport}
      onlineSessions={onlineSessions}
      onRefresh={refreshStrips}
    />
  );
}
