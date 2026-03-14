'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { toast } from 'sonner';

/**
 * Écoute la suppression de la session ATC en temps réel.
 * Si un admin déconnecte de force ce contrôleur, affiche un toast et rafraîchit.
 */
export default function AtcSessionRealtimeGuard({
  userId,
  enService,
}: {
  userId: string;
  enService: boolean;
}) {
  const router = useRouter();

  useEffect(() => {
    if (!enService || !userId) return;

    const supabase = createClient();
    const channel = supabase
      .channel('atc-session-guard')
      .on(
        'postgres_changes',
        {
          event: 'DELETE',
          schema: 'public',
          table: 'atc_sessions',
          filter: `user_id=eq.${userId}`,
        },
        () => {
          toast.error(
            'Vous avez été déconnecté de force par un administrateur. Pensez à vous mettre hors service pour ne pas bloquer les autres.',
            { duration: 8000 }
          );
          router.refresh();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [userId, enService, router]);

  return null;
}
