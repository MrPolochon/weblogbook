'use client';

import { useEffect, useState, useCallback } from 'react';
import { usePathname, useSearchParams } from 'next/navigation';

/**
 * Barre de progression en haut de page lors de la navigation.
 * Donne un feedback visuel instantané quand on clique sur un lien.
 */
export default function NavigationProgress() {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [isNavigating, setIsNavigating] = useState(false);
  const [progress, setProgress] = useState(0);

  const finishNavigation = useCallback(() => {
    setProgress(100);
    const timeout = setTimeout(() => {
      setIsNavigating(false);
      setProgress(0);
    }, 300);
    return () => clearTimeout(timeout);
  }, []);

  useEffect(() => {
    finishNavigation();
  }, [pathname, searchParams, finishNavigation]);

  useEffect(() => {
    const handleClick = (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      const anchor = target.closest('a');
      if (!anchor) return;
      const href = anchor.getAttribute('href');
      if (!href || href.startsWith('#') || href.startsWith('http') || href.startsWith('mailto:')) return;
      if (anchor.getAttribute('target') === '_blank') return;
      if (href === pathname) return;

      setIsNavigating(true);
      setProgress(20);
      const t1 = setTimeout(() => setProgress(50), 100);
      const t2 = setTimeout(() => setProgress(75), 300);
      const t3 = setTimeout(() => setProgress(90), 800);
      return () => {
        clearTimeout(t1);
        clearTimeout(t2);
        clearTimeout(t3);
      };
    };

    document.addEventListener('click', handleClick, true);
    return () => document.removeEventListener('click', handleClick, true);
  }, [pathname]);

  if (!isNavigating) return null;

  return (
    <div className="fixed top-0 left-0 right-0 z-[200] h-0.5 bg-slate-900/20">
      <div
        className="h-full bg-gradient-to-r from-sky-500 via-sky-400 to-indigo-500 shadow-lg shadow-sky-500/30 transition-all duration-300 ease-out"
        style={{ width: `${progress}%` }}
      />
    </div>
  );
}
