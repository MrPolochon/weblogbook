'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { calculerScoreFuel } from '@/lib/ground/minigames';

interface Props {
  onFinish: (score: number) => void;
}

const CIBLE_PCT   = 75;
const TOLERANCE_PCT = 5;
const MAX_ATTEMPTS  = 3;

interface Attempt {
  value: number;
  score: number;
}

export default function MinijeuFuel({ onFinish }: Props) {
  const [phase, setPhase] = useState<'idle' | 'playing' | 'result' | 'finished'>('idle');
  const [value, setValue] = useState(0);
  const [attempts, setAttempts] = useState<Attempt[]>([]);
  const [currentAttempt, setCurrentAttempt] = useState(0);
  const [lastStopped, setLastStopped] = useState<number | null>(null);
  const [lastScore, setLastScore] = useState<number | null>(null);
  const rafRef = useRef<number | null>(null);
  const startRef = useRef<number>(0);
  const playingRef = useRef(false);

  // Jauge oscillante : deux sinus à fréquences distinctes + phase aléatoire
  const phaseRef = useRef(Math.random() * Math.PI * 2);

  const animate = useCallback((ts: number) => {
    if (!playingRef.current) return;
    const t = (ts - startRef.current) / 1000; // secondes
    const v = 50 + 30 * Math.sin(t * 1.4 + phaseRef.current) + 14 * Math.sin(t * 3.1 + phaseRef.current * 1.7);
    setValue(Math.max(0, Math.min(100, v)));
    rafRef.current = requestAnimationFrame(animate);
  }, []);

  function startAttempt() {
    setValue(0);
    setLastStopped(null);
    setLastScore(null);
    phaseRef.current = Math.random() * Math.PI * 2; // aléatoire chaque tentative
    setPhase('playing');
    playingRef.current = true;
    startRef.current = performance.now();
    rafRef.current = requestAnimationFrame(animate);
  }

  function startGame() {
    setAttempts([]);
    setCurrentAttempt(0);
    startAttempt();
  }

  function stop() {
    if (phase !== 'playing') return;
    playingRef.current = false;
    if (rafRef.current) cancelAnimationFrame(rafRef.current);
    const v = value;
    const s = calculerScoreFuel(v, CIBLE_PCT - TOLERANCE_PCT, CIBLE_PCT + TOLERANCE_PCT);
    setLastStopped(v);
    setLastScore(s);
    const newAttempts = [...attempts, { value: v, score: s }];
    setAttempts(newAttempts);
    setPhase('result');
  }

  function nextAttempt() {
    const next = currentAttempt + 1;
    if (next >= MAX_ATTEMPTS) {
      setPhase('finished');
    } else {
      setCurrentAttempt(next);
      startAttempt();
    }
  }

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.code === 'Space') { e.preventDefault(); stop(); }
    }
    if (phase === 'playing') {
      window.addEventListener('keydown', onKey);
      return () => window.removeEventListener('keydown', onKey);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase, value]);

  useEffect(() => {
    return () => { if (rafRef.current) cancelAnimationFrame(rafRef.current); };
  }, []);

  const inZone = value >= CIBLE_PCT - TOLERANCE_PCT && value <= CIBLE_PCT + TOLERANCE_PCT;
  const barColor = inZone ? 'bg-emerald-500' : value < CIBLE_PCT - TOLERANCE_PCT ? 'bg-sky-400' : 'bg-red-500';

  const bestScore = attempts.length > 0 ? Math.max(...attempts.map(a => a.score)) : null;

  if (phase === 'idle') {
    return (
      <div className="text-center space-y-4">
        <div className="text-5xl">⛽</div>
        <h2 className="text-xl font-bold text-slate-100">Ravitaillement Carburant</h2>
        <p className="text-slate-400 text-sm max-w-sm mx-auto">
          La jauge oscille. Arrêtez-la dans la zone verte (±5% de la cible).<br />
          <span className="text-amber-300 font-semibold">{MAX_ATTEMPTS} tentatives</span> — le meilleur score est retenu.
          Appuyez sur <kbd className="px-1.5 py-0.5 rounded bg-slate-700 text-slate-200 text-xs font-mono">Espace</kbd> ou cliquez pour arrêter.
        </p>
        <button type="button" onClick={startGame} className="px-6 py-3 rounded-xl bg-sky-600 hover:bg-sky-700 text-white font-bold transition-colors">
          Démarrer
        </button>
      </div>
    );
  }

  if (phase === 'result' && lastStopped !== null && lastScore !== null) {
    const inZoneFinal = lastStopped >= CIBLE_PCT - TOLERANCE_PCT && lastStopped <= CIBLE_PCT + TOLERANCE_PCT;
    const pct = Math.round(lastScore * 100);
    const remaining = MAX_ATTEMPTS - attempts.length;
    return (
      <div className="text-center space-y-4">
        <div className="text-4xl">{inZoneFinal ? '🎯' : '😬'}</div>
        <div className={`inline-flex flex-col items-center gap-1 px-6 py-3 rounded-2xl ${inZoneFinal ? 'bg-sky-900/30 border border-sky-700/40' : 'bg-red-900/20 border border-red-700/30'}`}>
          <span className={`text-3xl font-black ${inZoneFinal ? 'text-sky-400' : 'text-red-400'}`}>{pct}%</span>
          <span className="text-slate-400 text-sm">Valeur d&apos;arrêt : {Math.round(lastStopped)}% · Cible : {CIBLE_PCT}%</span>
        </div>

        {/* Historique */}
        <div className="flex justify-center gap-2">
          {Array.from({ length: MAX_ATTEMPTS }).map((_, i) => {
            const a = attempts[i];
            return (
              <div key={i} className={`w-14 h-14 rounded-xl flex flex-col items-center justify-center text-xs font-bold ${
                a ? (a.score >= 0.9 ? 'bg-emerald-900/30 border border-emerald-700/40 text-emerald-300' :
                     a.score >= 0.5 ? 'bg-amber-900/30 border border-amber-700/40 text-amber-300' :
                     'bg-red-900/30 border border-red-700/40 text-red-300') :
                'bg-slate-800/30 border border-dashed border-slate-600/50 text-slate-600'
              }`}>
                {a ? `${Math.round(a.score * 100)}%` : `${i + 1}`}
                <span className="text-[9px] font-normal opacity-70">{a ? 'essai' : '—'}</span>
              </div>
            );
          })}
        </div>

        {remaining > 0 ? (
          <button type="button" onClick={nextAttempt} className="px-5 py-2.5 rounded-xl bg-sky-600 hover:bg-sky-500 text-white font-bold text-sm transition-colors">
            Essai suivant ({remaining} restant{remaining > 1 ? 's' : ''})
          </button>
        ) : (
          <button type="button" onClick={() => setPhase('finished')} className="px-5 py-2.5 rounded-xl bg-sky-600 hover:bg-sky-500 text-white font-bold text-sm transition-colors">
            Voir résultat final
          </button>
        )}
      </div>
    );
  }

  if (phase === 'finished' && bestScore !== null) {
    const pct = Math.round(bestScore * 100);
    return (
      <div className="text-center space-y-4">
        <div className="text-5xl">{pct >= 90 ? '🏆' : pct >= 60 ? '🎯' : '😓'}</div>
        <h2 className="text-xl font-bold text-slate-100">Ravitaillement terminé !</h2>
        <div className="inline-flex flex-col items-center gap-1 px-8 py-4 rounded-2xl bg-sky-900/20 border border-sky-800/40">
          <span className="text-4xl font-black text-sky-400">{pct}%</span>
          <span className="text-slate-400 text-sm">Meilleur score sur {MAX_ATTEMPTS} tentatives</span>
        </div>
        <div className="flex gap-2 justify-center">
          <button type="button" onClick={startGame} className="px-4 py-2 rounded-xl border border-slate-600 text-slate-300 text-sm hover:bg-slate-700 transition-colors">Rejouer</button>
          <button type="button" onClick={() => onFinish(bestScore)} className="px-4 py-2 rounded-xl bg-sky-600 hover:bg-sky-700 text-white text-sm font-bold transition-colors">Valider le score</button>
        </div>
      </div>
    );
  }

  // Phase playing
  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <span className="text-sm text-slate-400">
          Tentative <span className="text-slate-200 font-bold">{currentAttempt + 1}</span> / {MAX_ATTEMPTS}
        </span>
        <span className="text-xs text-slate-500">
          Appuyez sur <kbd className="px-1 py-0.5 rounded bg-slate-700 text-slate-300 text-[10px] font-mono">Espace</kbd> ou cliquez
        </span>
      </div>

      <div
        className="relative flex flex-col-reverse rounded-2xl border border-slate-700/50 bg-slate-900 overflow-hidden cursor-pointer select-none mx-auto"
        style={{ width: 80, height: 300 }}
        onClick={stop}
      >
        {/* Zone verte */}
        <div
          className="absolute left-0 right-0 bg-emerald-500/20 border-y border-emerald-500/40"
          style={{ bottom: `${CIBLE_PCT - TOLERANCE_PCT}%`, height: `${TOLERANCE_PCT * 2}%` }}
        />
        {/* Jauge */}
        <div className={`w-full ${barColor} transition-none`} style={{ height: `${value}%` }} />
        {/* Marqueur cible */}
        <div className="absolute left-0 right-0 border-t-2 border-dashed border-emerald-400" style={{ bottom: `${CIBLE_PCT}%` }} />
        {/* Valeur actuelle */}
        <div className="absolute top-2 left-0 right-0 text-center text-xs font-mono font-bold text-slate-300">
          {Math.round(value)}%
        </div>
        {/* Indicateur zone */}
        {inZone && (
          <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
            <span className="text-2xl animate-bounce">✓</span>
          </div>
        )}
      </div>
      <div className="text-center text-xs text-slate-500">Zone cible : {CIBLE_PCT - TOLERANCE_PCT}% – {CIBLE_PCT + TOLERANCE_PCT}%</div>
    </div>
  );
}
