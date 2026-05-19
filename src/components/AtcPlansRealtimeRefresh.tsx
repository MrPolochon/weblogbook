'use client';

import { useEffect, useRef } from 'react';
import { createClient } from '@/lib/supabase/client';

/**
 * Écoute les changements Supabase Realtime sur plans_vol et déclenche
 * un refresh rapide des strips (event `atc-strips-refresh`) sans router.refresh().
 * FlightStripBoardWrapper capte cet event et appelle /api/atc/strips.
 *
 * Un router.refresh() complet n'est plus déclenché ici (trop lent).
 * L'AutoRefresh du layout (60s) assure la resynchronisation complète périodique.
 */
export default function AtcPlansRealtimeRefresh({
  userId,
  enService,
  aeroport,
  position,
}: {
  userId: string;
  enService: boolean;
  aeroport: string | null;
  position: string | null;
}) {
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (!enService || !userId || !aeroport) return;

    const aero = aeroport.trim();
    if (!aero) return;

    const scheduleRefresh = () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
      debounceRef.current = setTimeout(() => {
        debounceRef.current = null;
        // Déclenche un fetch rapide dans FlightStripBoardWrapper (pas de router.refresh)
        window.dispatchEvent(new CustomEvent('atc-strips-refresh'));
      }, 200);
    };

    const supabase = createClient();
    const channel = supabase
      .channel(`atc-plans-refresh-${userId}-${aero}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'plans_vol',
          filter: `current_holder_user_id=eq.${userId}`,
        },
        scheduleRefresh
      )
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'plans_vol',
          filter: `pending_transfer_aeroport=eq.${aero}`,
        },
        (payload) => {
          if (!position) {
            scheduleRefresh();
            return;
          }
          const row = (payload.new as { pending_transfer_position?: string } | null) ?? null;
          const oldRow = (payload.old as { pending_transfer_position?: string } | null) ?? null;
          const pos = row?.pending_transfer_position ?? oldRow?.pending_transfer_position;
          if (pos === position) scheduleRefresh();
        }
      )
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'plans_vol',
          filter: `aeroport_depart=eq.${aero}`,
        },
        scheduleRefresh
      )
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'plans_vol',
          filter: `aeroport_arrivee=eq.${aero}`,
        },
        scheduleRefresh
      )
      .subscribe();

    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
      supabase.removeChannel(channel);
    };
  }, [userId, enService, aeroport, position]);

  return null;
}
