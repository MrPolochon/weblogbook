'use client';

import { useEffect, useMemo, useState } from 'react';

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
  const [phase, setPhase] = useState<GatePhase>('checking');
  const [clickCount, setClickCount] = useState(0);

  const remainingClicks = useMemo(
    () => Math.max(0, REQUIRED_CLICKS - clickCount),
    [clickCount],
  );

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
            J&apos;espere que vous avez apprecie la blague. Au nom de tout le staff, nous vous souhaitons
            une excellente Semaine sainte et de joyeuses Paques en avance !
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
      <div className="w-full max-w-3xl rounded-2xl border border-red-500/30 bg-slate-950 p-7 shadow-2xl md:p-10">
        <p className="text-xs uppercase tracking-[0.3em] text-red-300/80">Incident critique</p>
        <h1 className="mt-4 text-3xl font-bold text-red-100 md:text-4xl">Erreur de restauration des comptes</h1>
        <p className="mt-6 text-base leading-relaxed text-slate-300">
          Une erreur majeure a ete detectee lors de la synchronisation des donnees. Certains comptes sont
          actuellement introuvables ou marques comme supprimes. Les services economiques et les flottes
          ont ete temporairement desactives pendant l&apos;investigation.
        </p>
        <p className="mt-4 text-sm text-slate-400">
          Ne fermez pas cette page. Une verification automatique est en cours sur votre profil.
        </p>

        <button
          type="button"
          onClick={handleErrorCodeClick}
          className="mt-8 inline-flex rounded-lg border border-red-400/40 bg-red-950/40 px-4 py-2 font-mono text-sm text-red-200 transition hover:bg-red-900/50"
          aria-label="Code erreur technique"
        >
          {ERROR_CODE}
        </button>
        <p className="mt-3 text-xs text-slate-500">
          Code interne de diagnostic. Tentatives restantes: {remainingClicks}
        </p>
      </div>
    </div>
  );
}
