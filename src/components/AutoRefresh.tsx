'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';

/**
 * Appelle router.refresh() périodiquement pour que les données serveur (vols, plans, etc.)
 * se mettent à jour sans recharger la page. Met en pause quand l'onglet n'est pas visible.
 * Au retour sur l'onglet, un refresh immédiat est déclenché.
 */
export default function AutoRefresh({ intervalSeconds = 12 }: { intervalSeconds?: number }) {
  const router = useRouter();

  useEffect(() => {
    const ms = Math.max(5, intervalSeconds) * 1000;
    const id = setInterval(() => {
      if (typeof document !== 'undefined' && document.visibilityState === 'hidden') return;
      router.refresh();
    }, ms);
    const onVisible = () => { if (document.visibilityState === 'visible') router.refresh(); };
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      clearInterval(id);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [router, intervalSeconds]);

  return null;
}
