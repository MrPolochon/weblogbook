'use client';

import { useEffect, useRef, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';

/**
 * Rafraîchit le shell ATC (layout + page) quand des plans concernant la session
 * changent en base — complète AutoRefresh (intervalle) et évite le décalage
 * « son / sidebar ok mais tableau pas à jour ».
 *
 * Le filtre Supabase sur UPDATE s'applique au nouvel enregistrement : un plan qui
 * quitte current_holder_user_id = nous ne déclenche pas ce filtre. On s'abonne donc
 * aussi aux lignes dont le départ ou l'arrivée touche l'aéroport de service.
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
  const router = useRouter();
  const [, startTransition] = useTransition();
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (!enService || !userId || !aeroport) return;

    const aero = aeroport.trim();
    if (!aero) return;

    const scheduleRefresh = () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
      debounceRef.current = setTimeout(() => {
        debounceRef.current = null;
        startTransition(() => {
          router.refresh();
        });
      }, 350);
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
  }, [userId, enService, aeroport, position, router, startTransition]);

  return null;
}
