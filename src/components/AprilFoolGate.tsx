'use client';

import { useEffect, useState } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import {
  APRIL_FOOL_RETURN_PATH_KEY,
  getAprilFoolErrorPathForPathname,
  resolveAprilFoolReturnPath,
} from '@/lib/april-fool-paths';

type AprilFoolGateProps = {
  children: React.ReactNode;
};

type GatePhase = 'checking' | 'hidden' | 'fake-error' | 'reveal';

const PARIS_TIMEZONE = 'Europe/Paris';
const REQUIRED_CLICKS = 4;
const ERROR_CODE = 'ERR-ACCT-NOTFOUND-404';

function getParisDateParts() {
  const formatter = new Intl.DateTimeFormat('fr-FR', {
    timeZone: PARIS_TIMEZONE,
    day: 'numeric',
    month: 'numeric',
    year: 'numeric',
  });

  const parts = formatter.formatToParts(new Date());
  const day = Number(parts.find((part) => part.type === 'day')?.value ?? '0');
  const month = Number(parts.find((part) => part.type === 'month')?.value ?? '0');
  const year = Number(parts.find((part) => part.type === 'year')?.value ?? '0');

  return { day, month, year };
}

function getStorageKey(year: number) {
  return `weblogbook_april_fool_ack_${year}`;
}

export default function AprilFoolGate({ children }: AprilFoolGateProps) {
  const router = useRouter();
  const pathname = usePathname();
  const [phase, setPhase] = useState<GatePhase>('checking');
  const [clickCount, setClickCount] = useState(0);

  useEffect(() => {
    const { day, month, year } = getParisDateParts();
    const isAprilFirst = day === 1 && month === 4;
    if (!isAprilFirst) {
      setPhase('hidden');
      return;
    }

    const alreadySeen = localStorage.getItem(getStorageKey(year)) === '1';
    setPhase(alreadySeen ? 'hidden' : 'fake-error');
  }, []);

  useEffect(() => {
    const shouldDisableEasterTheme = phase === 'fake-error';
    document.body.classList.toggle('disable-easter-theme', shouldDisableEasterTheme);

    return () => {
      document.body.classList.remove('disable-easter-theme');
    };
  }, [phase]);

  useEffect(() => {
    if (phase !== 'fake-error') return;
    const target = getAprilFoolErrorPathForPathname(pathname);
    if (pathname === target) return;
    try {
      sessionStorage.setItem(APRIL_FOOL_RETURN_PATH_KEY, pathname);
    } catch {
      /* quota / private mode */
    }
    router.replace(target);
  }, [phase, pathname, router]);

  const handleErrorCodeClick = () => {
    if (phase !== 'fake-error') return;
    setClickCount((previous) => {
      const next = previous + 1;
      if (next >= REQUIRED_CLICKS) {
        setPhase('reveal');
      }
      return next;
    });
  };

  const handleContinue = () => {
    const { year } = getParisDateParts();
    localStorage.setItem(getStorageKey(year), '1');
    let stored: string | null = null;
    try {
      stored = sessionStorage.getItem(APRIL_FOOL_RETURN_PATH_KEY);
      sessionStorage.removeItem(APRIL_FOOL_RETURN_PATH_KEY);
    } catch {
      /* ignore */
    }
    const returnPath = resolveAprilFoolReturnPath(pathname, stored);
    router.replace(returnPath);
    setPhase('hidden');
  };

  if (phase === 'hidden') {
    return <>{children}</>;
  }

  if (phase === 'checking') {
    return null;
  }

  if (phase === 'reveal') {
    return (
      <div className="fixed inset-0 z-[10050] flex items-center justify-center bg-gradient-to-b from-emerald-950 via-slate-950 to-sky-950 px-6">
        <div className="w-full max-w-3xl rounded-3xl border border-emerald-300/20 bg-slate-900/80 p-8 text-center shadow-2xl backdrop-blur-lg md:p-12">
          <p className="text-xs uppercase tracking-[0.4em] text-emerald-300/80">Annonce officielle</p>
          <h1 className="mt-4 text-4xl font-black text-white md:text-6xl">POISSON D&apos;AVRIL !</h1>
          <p className="mx-auto mt-6 max-w-2xl text-base leading-relaxed text-slate-200 md:text-lg">
            J&apos;espère que vous avez apprécié la blague. Au nom de tout le staff, nous vous souhaitons
            une excellente Semaine sainte et de joyeuses Pâques en avance !
          </p>
          <button
            type="button"
            onClick={handleContinue}
            className="mt-10 rounded-xl bg-emerald-500 px-8 py-3 text-base font-semibold text-emerald-950 transition hover:bg-emerald-400"
          >
            Continuer
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 z-[10050] flex items-center justify-center bg-black px-6">
      <div className="w-full max-w-3xl rounded-2xl border border-red-500/25 bg-slate-950 p-7 shadow-2xl md:p-10">
        <p className="text-xs uppercase tracking-[0.3em] text-red-300/80">Incident critique</p>
        <h1 className="mt-4 text-3xl font-bold text-red-100 md:text-4xl">Erreur de restauration des comptes</h1>
        <p className="mt-6 text-base leading-relaxed text-slate-300">
          Une erreur majeure a été détectée lors de la synchronisation des données. Certains comptes sont
          actuellement introuvables ou marqués comme supprimés. Les services économiques et les flottes
          ont été temporairement désactivés pendant l&apos;enquête.
        </p>
        <p className="mt-4 text-sm text-slate-400">
          Ne fermez pas cette page. Une vérification automatique est en cours sur votre profil.
        </p>

        <div className="mt-10 rounded-lg border border-slate-800 bg-slate-900/80 px-4 py-3">
          <p className="text-[11px] uppercase tracking-wider text-slate-500">Référence technique</p>
          <p className="mt-1.5 text-xs text-slate-500">
            Conservez ces identifiants si vous contactez le support (copie possible).
          </p>
          <p className="mt-3 font-mono text-[13px] text-slate-400">
            <span className="text-slate-500">ID requête : </span>
            <span className="select-all text-slate-300">8f2c-9ae1-7b0d-4e12</span>
          </p>
          <p className="mt-2 font-mono text-[13px] text-slate-400">
            <span className="text-slate-500">Code incident : </span>
            <span className="cursor-text select-all text-slate-300" onClick={handleErrorCodeClick}>
              {ERROR_CODE}
            </span>
          </p>
        </div>
      </div>
    </div>
  );
}
