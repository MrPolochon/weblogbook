'use client';

import { useState, useEffect, useRef, useCallback } from 'react';

interface Props {
  onFinish: (score: number) => void;
}

const COLS  = 22;
const ROWS  = 5;
const TOTAL = COLS * ROWS;
const DUREE = 45;
// Probabilité initiale de glace par cellule
const PROBA_GLACE = 0.68;

function genererGlace(): boolean[] {
  return Array.from({ length: TOTAL }, () => Math.random() < PROBA_GLACE);
}

export default function MinijeuDegivrage({ onFinish }: Props) {
  const [phase, setPhase] = useState<'idle' | 'playing' | 'finished'>('idle');
  const [timeLeft, setTimeLeft] = useState(DUREE);
  const [iced, setIced] = useState<boolean[]>(Array(TOTAL).fill(false));
  const [cleared, setCleared] = useState<boolean[]>(Array(TOTAL).fill(false));
  const [score, setScore] = useState<number | null>(null);
  const isDragging = useRef(false);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const totalIced = iced.filter(Boolean).length;
  const totalCleared = cleared.filter((c, i) => c && iced[i]).length;
  const progressPct = totalIced > 0 ? Math.round((totalCleared / totalIced) * 100) : 0;

  function startGame() {
    const icedCells = genererGlace();
    setIced(icedCells);
    setCleared(Array(TOTAL).fill(false));
    setTimeLeft(DUREE);
    setScore(null);
    setPhase('playing');

    timerRef.current = setInterval(() => {
      setTimeLeft(t => {
        if (t <= 1) { clearInterval(timerRef.current!); return 0; }
        return t - 1;
      });
    }, 1000);
  }

  useEffect(() => {
    if (phase === 'playing' && timeLeft === 0) {
      endGame();
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [timeLeft, phase]);

  const endGame = useCallback(() => {
    if (timerRef.current) clearInterval(timerRef.current);
    const icedAtEnd = iced;
    const clearedAtEnd = cleared;
    const totalIcedEnd = icedAtEnd.filter(Boolean).length;
    const totalClearedEnd = clearedAtEnd.filter((c, i) => c && icedAtEnd[i]).length;
    const s = totalIcedEnd > 0 ? totalClearedEnd / totalIcedEnd : 1;
    setScore(s);
    setPhase('finished');
  }, [iced, cleared]);

  // Vérifier si tout est dégivré
  useEffect(() => {
    if (phase !== 'playing') return;
    const allDone = iced.every((ic, i) => !ic || cleared[i]);
    if (allDone && totalIced > 0) endGame();
  }, [cleared, iced, phase, totalIced, endGame]);

  useEffect(() => {
    return () => { if (timerRef.current) clearInterval(timerRef.current); };
  }, []);

  function clearCell(idx: number) {
    if (!iced[idx] || cleared[idx] || phase !== 'playing') return;
    setCleared(prev => { const n = [...prev]; n[idx] = true; return n; });
  }

  function handleMouseDown(idx: number) {
    isDragging.current = true;
    clearCell(idx);
  }
  function handleMouseEnter(idx: number) {
    if (isDragging.current) clearCell(idx);
  }
  function handleMouseUp() { isDragging.current = false; }

  // Touch support
  function handleTouchMove(e: React.TouchEvent<HTMLDivElement>) {
    e.preventDefault();
    const touch = e.touches[0];
    const el = document.elementFromPoint(touch.clientX, touch.clientY) as HTMLElement | null;
    if (el?.dataset.idx) clearCell(Number(el.dataset.idx));
  }

  const timerPct = (timeLeft / DUREE) * 100;
  const timerColor = timerPct > 50 ? 'bg-emerald-500' : timerPct > 25 ? 'bg-amber-500' : 'bg-red-500';

  if (phase === 'idle') {
    return (
      <div className="text-center space-y-4">
        <div className="text-5xl">❄️</div>
        <h2 className="text-xl font-bold text-slate-100">Dégivrage Aile</h2>
        <p className="text-slate-400 text-sm max-w-sm mx-auto">
          Cliquez et faites glisser pour gratter la glace bleue sur l&apos;aile.
          Dégivrez un maximum de surface en <strong>{DUREE}s</strong>.
        </p>
        <button type="button" onClick={startGame} className="px-6 py-3 rounded-xl bg-sky-600 hover:bg-sky-700 text-white font-bold transition-colors">
          Commencer ({DUREE}s)
        </button>
      </div>
    );
  }

  if (phase === 'finished' && score !== null) {
    const pct = Math.round(score * 100);
    return (
      <div className="text-center space-y-4">
        <div className="text-5xl">{pct >= 85 ? '✈️' : pct >= 60 ? '👍' : '😬'}</div>
        <h2 className="text-xl font-bold text-slate-100">Dégivrage terminé !</h2>
        <div className="inline-flex flex-col items-center gap-1 px-8 py-4 rounded-2xl bg-sky-900/20 border border-sky-800/40">
          <span className="text-4xl font-black text-sky-400">{pct}%</span>
          <span className="text-slate-400 text-sm">{totalCleared}/{totalIced} cellules dégivrées</span>
        </div>
        <div className="flex gap-2 justify-center">
          <button type="button" onClick={startGame} className="px-4 py-2 rounded-xl border border-slate-600 text-slate-300 text-sm hover:bg-slate-700 transition-colors">Rejouer</button>
          <button type="button" onClick={() => onFinish(score)} className="px-4 py-2 rounded-xl bg-sky-600 hover:bg-sky-700 text-white text-sm font-bold transition-colors">Valider le score</button>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-3" onMouseUp={handleMouseUp} onMouseLeave={handleMouseUp}>
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <span className="text-sm font-semibold text-slate-300">❄️ {progressPct}% dégivré</span>
        </div>
        <span className="text-lg font-black font-mono text-sky-400">{timeLeft}s</span>
      </div>
      <div className="h-2 rounded-full bg-slate-700 overflow-hidden">
        <div className={`h-full ${timerColor} transition-all duration-1000`} style={{ width: `${timerPct}%` }} />
      </div>

      {/* Progress dégivrage */}
      <div className="h-1.5 rounded-full bg-slate-700 overflow-hidden">
        <div className="h-full bg-sky-500 transition-all" style={{ width: `${progressPct}%` }} />
      </div>

      {/* Grille aile */}
      <div
        className="rounded-xl overflow-hidden border border-slate-700/40 select-none bg-slate-800/40 p-2"
        onTouchMove={handleTouchMove}
        style={{ touchAction: 'none' }}
      >
        {/* Forme d'aile stylisée */}
        <p className="text-[10px] text-slate-600 mb-1 text-center">Surface de l&apos;aile — faites glisser pour gratter</p>
        <div
          className="grid gap-0.5"
          style={{ gridTemplateColumns: `repeat(${COLS}, 1fr)` }}
        >
          {Array.from({ length: TOTAL }).map((_, i) => {
            const col = i % COLS;
            const row = Math.floor(i / COLS);
            const isIced = iced[i];
            const isCleared = cleared[i];
            // Forme d'aile : profil effilé (lignes du haut plus longues)
            const maxCol = Math.round(COLS - row * (COLS / ROWS) * 0.3);
            const visible = col < maxCol;
            if (!visible) return <div key={i} className="aspect-square" />;

            return (
              <div
                key={i}
                data-idx={i}
                onMouseDown={() => handleMouseDown(i)}
                onMouseEnter={() => handleMouseEnter(i)}
                className={`aspect-square rounded-[2px] cursor-crosshair transition-colors ${
                  !isIced
                    ? 'bg-slate-600/30'
                    : isCleared
                      ? 'bg-slate-600/30'
                      : 'bg-sky-400/80 hover:bg-sky-300/90'
                }`}
              />
            );
          })}
        </div>
      </div>
      <p className="text-xs text-slate-600 text-center">Cellules bleues = glace à gratter · Glissez sans lever la souris</p>
    </div>
  );
}
