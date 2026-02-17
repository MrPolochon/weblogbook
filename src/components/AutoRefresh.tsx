'use client';

import { useEffect, useTransition, useCallback } from 'react';
import { useRouter } from 'next/navigation';

/**
 * Appelle router.refresh() périodiquement en arrière-plan via startTransition
 * pour que les données serveur se mettent à jour SANS bloquer le UI.
 * Met en pause quand l'onglet n'est pas visible.
 * Au retour sur l'onglet, un refresh immédiat est déclenché.
 */
export default function AutoRefresh({ intervalSeconds = 30 }: { intervalSeconds?: number }) {
  const router = useRouter();
  const [, startTransition] = useTransition();

  const softRefresh = useCallback(() => {
    startTransition(() => {
      router.refresh();
    });
  }, [router, startTransition]);

  useEffect(() => {
    const ms = Math.max(10, intervalSeconds) * 1000;
    const id = setInterval(() => {
      if (typeof document !== 'undefined' && document.visibilityState === 'hidden') return;
      softRefresh();
    }, ms);
    const onVisible = () => {
      if (document.visibilityState === 'visible') softRefresh();
    };
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      clearInterval(id);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [softRefresh, intervalSeconds]);

  return null;
}
