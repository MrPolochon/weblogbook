'use client';

import { useState, useEffect, useCallback, useRef } from 'react';

interface Props {
  onFinish: (score: number) => void;
}

type Direction = 'up' | 'right' | 'down' | 'left' | 'down-left' | 'down-right' | 'stop';

interface Step {
  dir: Direction;
  label: string;
  emoji: string;
  key: string;
}

const STEP_DURATION = 5; // secondes par étape
const NB_ETAPES = 5;

const ALL_PUSHBACK_STEPS: Step[] = [
  { dir: 'down',       label: 'Reculez',           emoji: '⬇️', key: 'ArrowDown'  },
  { dir: 'down-left',  label: 'Arrière gauche',     emoji: '↙️', key: 'ArrowLeft'  },
  { dir: 'down-right', label: 'Arrière droit',      emoji: '↘️', key: 'ArrowRight' },
  { dir: 'left',       label: 'Tournez à gauche',   emoji: '⬅️', key: 'ArrowLeft'  },
  { dir: 'right',      label: 'Tournez à droite',   emoji: '➡️', key: 'ArrowRight' },
];

const STOP_STEP: Step = { dir: 'stop', label: 'STOP !', emoji: '✋', key: 'Space' };

function generateSequence(): Step[] {
  const pool = [...ALL_PUSHBACK_STEPS];
  const seq: Step[] = [];
  for (let i = 0; i < NB_ETAPES - 1; i++) {
    const filtered = pool.filter(s => seq.at(-1)?.dir !== s.dir);
    seq.push(filtered[Math.floor(Math.random() * filtered.length)]);
  }
  seq.push(STOP_STEP);
  return seq;
}

const PUSHBACK_MOVE: Partial<Record<Direction, { x: number; y: number }>> = {
  down:       { x: 0,   y:  10 },
  'down-left':  { x: -8,  y:  8  },
  'down-right': { x:  8,  y:  8  },
  left:       { x: -10, y:  0  },
  right:      { x:  10, y:  0  },
  stop:       { x: 0,   y:  0  },
};

// Mapping des touches pour les directions diagonales (partagent la même touche que gauche/droite)
const KEY_TO_DIR: Record<string, Direction[]> = {
  ArrowDown:  ['down'],
  ArrowLeft:  ['left', 'down-left'],
  ArrowRight: ['right', 'down-right'],
  Space:      ['stop'],
};

export default function MinijeuRepoussage({ onFinish }: Props) {
  const [phase, setPhase] = useState<'idle' | 'playing' | 'finished'>('idle');
  const [sequence, setSequence] = useState<Step[]>([]);
  const [currentIdx, setCurrentIdx] = useState(0);
  const [stepTimer, setStepTimer] = useState(STEP_DURATION);
  const [correct, setCorrect] = useState(0);
  const [planePos, setPlanePos] = useState({ x: 0, y: 0 });
  const [feedbackMsg, setFeedbackMsg] = useState<{ txt: string; ok: boolean } | null>(null);
  const [score, setScore] = useState<number | null>(null);
  const handledRef = useRef(false);

  const endGame = useCallback((finalCorrect: number, totalSteps: number) => {
    const s = Math.max(0, Math.min(1, finalCorrect / totalSteps));
    setScore(s);
    setPhase('finished');
  }, []);

  const nextStep = useCallback((seq: Step[], idx: number, cor: number) => {
    handledRef.current = false;
    const newIdx = idx + 1;
    if (newIdx >= seq.length) {
      endGame(cor, seq.length);
      return;
    }
    setCurrentIdx(newIdx);
    setStepTimer(STEP_DURATION);
  }, [endGame]);

  function startGame() {
    const seq = generateSequence();
    setSequence(seq);
    setCurrentIdx(0);
    setStepTimer(STEP_DURATION);
    setCorrect(0);
    setPlanePos({ x: 0, y: 0 });
    setFeedbackMsg(null);
    setScore(null);
    setPhase('playing');
    handledRef.current = false;
  }

  useEffect(() => {
    if (phase !== 'playing') return;
    if (stepTimer <= 0) {
      if (!handledRef.current) {
        handledRef.current = true;
        setFeedbackMsg({ txt: '⏱ Trop lent !', ok: false });
        setTimeout(() => setFeedbackMsg(null), 600);
        nextStep(sequence, currentIdx, correct);
      }
      return;
    }
    const id = setTimeout(() => setStepTimer(t => t - 1), 1000);
    return () => clearTimeout(id);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase, stepTimer, currentIdx]);

  const handleInput = useCallback((inputDir: Direction) => {
    if (phase !== 'playing' || handledRef.current) return;
    const currentStep = sequence[currentIdx];
    if (!currentStep) return;

    const isCorrect = inputDir === currentStep.dir;
    handledRef.current = true;

    const delta = PUSHBACK_MOVE[currentStep.dir] ?? { x: 0, y: 0 };
    setPlanePos(prev => ({ x: prev.x + delta.x, y: prev.y + delta.y }));

    const newCorrect = isCorrect ? correct + 1 : correct;
    if (isCorrect) setCorrect(newCorrect);

    setFeedbackMsg({
      txt: isCorrect ? '✓ Bonne manœuvre !' : `✗ ${currentStep.label} attendu`,
      ok: isCorrect,
    });
    setTimeout(() => setFeedbackMsg(null), 500);
    setTimeout(() => nextStep(sequence, currentIdx, newCorrect), 450);
  }, [phase, sequence, currentIdx, correct, nextStep]);

  useEffect(() => {
    if (phase !== 'playing') return;
    function onKey(e: KeyboardEvent) {
      const code = e.code;
      if (!['ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space'].includes(code)) return;
      e.preventDefault();
      const currentStep = sequence[currentIdx];
      if (!currentStep) return;
      // Résoudre la direction exacte attendue si plusieurs options pour cette touche
      const possibleDirs = KEY_TO_DIR[code] ?? [];
      const matchedDir = possibleDirs.includes(currentStep.dir)
        ? currentStep.dir
        : (possibleDirs[0] as Direction);
      handleInput(matchedDir);
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [phase, sequence, currentIdx, handleInput]);

  const currentStep = sequence[currentIdx];
  const timerPct = (stepTimer / STEP_DURATION) * 100;
  const timerColor = timerPct > 60 ? 'bg-orange-500' : timerPct > 30 ? 'bg-amber-500' : 'bg-red-500 animate-pulse';

  if (phase === 'idle') {
    return (
      <div className="text-center space-y-4">
        <div className="text-5xl">🚛</div>
        <h2 className="text-xl font-bold text-slate-100">Repoussage</h2>
        <p className="text-slate-400 text-sm max-w-sm mx-auto">
          Guidez l&apos;avion hors du parking avec le tracteur de repoussage.
          Suivez les <span className="text-orange-300 font-semibold">directions indiquées</span> dans les {STEP_DURATION}s imparties.
          Séquence de {NB_ETAPES} manœuvres — terminez par <strong>STOP</strong>.
        </p>
        <div className="flex justify-center gap-3 text-2xl">
          <span title="Reculez">⬇️</span>
          <span title="Arrière gauche">↙️</span>
          <span title="Arrière droit">↘️</span>
          <span title="Gauche">⬅️</span>
          <span title="Droite">➡️</span>
          <span title="Stop">✋</span>
        </div>
        <button
          type="button"
          onClick={startGame}
          className="px-6 py-3 rounded-xl bg-orange-700 hover:bg-orange-600 text-white font-bold transition-colors"
        >
          Commencer le repoussage
        </button>
      </div>
    );
  }

  if (phase === 'finished' && score !== null) {
    const pct = Math.round(score * 100);
    return (
      <div className="text-center space-y-4">
        <div className="text-5xl">{pct >= 80 ? '✈️' : pct >= 60 ? '👍' : '😓'}</div>
        <h2 className="text-xl font-bold text-slate-100">Repoussage terminé !</h2>
        <div className="inline-flex flex-col items-center gap-1 px-8 py-4 rounded-2xl bg-orange-900/20 border border-orange-800/40">
          <span className="text-4xl font-black text-orange-400">{pct}%</span>
          <span className="text-slate-400 text-sm">{correct}/{sequence.length} manœuvres correctes</span>
        </div>
        <div className="flex gap-2 justify-center">
          <button
            type="button"
            onClick={startGame}
            className="px-4 py-2 rounded-xl border border-slate-600 text-slate-300 text-sm hover:bg-slate-700 transition-colors"
          >
            Rejouer
          </button>
          <button
            type="button"
            onClick={() => onFinish(score)}
            className="px-4 py-2 rounded-xl bg-orange-700 hover:bg-orange-600 text-white text-sm font-bold transition-colors"
          >
            Valider le score
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <span className="text-sm font-semibold text-slate-300">
          Manœuvre {currentIdx + 1} / {sequence.length}
        </span>
        <div className="flex items-center gap-2">
          {feedbackMsg && (
            <span className={`text-sm font-bold ${feedbackMsg.ok ? 'text-emerald-400' : 'text-red-400'}`}>
              {feedbackMsg.txt}
            </span>
          )}
          <span className={`text-xl font-black font-mono ${stepTimer <= 1 ? 'text-red-400' : 'text-orange-400'}`}>
            {stepTimer}s
          </span>
        </div>
      </div>

      <div className="h-2 rounded-full bg-slate-700 overflow-hidden">
        <div className={`h-full ${timerColor} transition-all duration-1000`} style={{ width: `${timerPct}%` }} />
      </div>

      {/* Signal actuel */}
      {currentStep && (
        <div className="flex flex-col items-center py-3 gap-2">
          <div className={`text-7xl transition-transform ${stepTimer <= 1 ? 'animate-pulse' : ''}`}>
            {currentStep.emoji}
          </div>
          <p className="text-xl font-bold text-slate-100">{currentStep.label}</p>
          {currentStep.dir !== 'stop' && (
            <p className="text-slate-500 text-xs">
              Touche :{' '}
              <kbd className="px-1.5 py-0.5 rounded bg-slate-700 text-slate-200 text-xs font-mono">
                {currentStep.key === 'ArrowLeft' ? '←' : currentStep.key === 'ArrowRight' ? '→' : currentStep.key === 'ArrowDown' ? '↓' : 'Espace'}
              </kbd>
            </p>
          )}
        </div>
      )}

      {/* Vue de l'avion en recul */}
      <div
        className="relative rounded-xl border border-slate-700/40 bg-slate-900/60 overflow-hidden"
        style={{ height: 120 }}
      >
        {/* Piste */}
        <div className="absolute bottom-0 left-0 right-0 h-8 bg-slate-800/60 border-t border-slate-700/30 flex items-center justify-center">
          <div className="w-3/4 h-1 rounded-full bg-slate-600/40 flex gap-4">
            {[1,2,3,4,5].map(i => (
              <div key={i} className="flex-1 h-full bg-amber-500/30 rounded-full" />
            ))}
          </div>
        </div>
        {/* Parking */}
        <div className="absolute top-2 left-1/2 -translate-x-1/2 text-[10px] text-slate-600 flex items-center gap-1">
          <span>🅿️</span> Parking
        </div>
        {/* Avion */}
        <div
          className="absolute text-2xl transition-all duration-300 rotate-180"
          style={{
            left: `calc(50% + ${Math.max(-100, Math.min(100, planePos.x * 1.5))}px)`,
            top: `calc(20% + ${Math.max(0, Math.min(60, planePos.y * 0.6))}px)`,
            transform: `translate(-50%, -50%) rotate(180deg)`,
          }}
        >
          ✈️
        </div>
        {/* Tracteur */}
        <div
          className="absolute text-xl transition-all duration-300"
          style={{
            left: `calc(50% + ${Math.max(-100, Math.min(100, planePos.x * 1.5))}px)`,
            top: `calc(30% + ${Math.max(0, Math.min(70, planePos.y * 0.6))}px)`,
            transform: 'translate(-50%, 0)',
          }}
        >
          🚛
        </div>
      </div>

      {/* Boutons directionnels */}
      <div className="grid grid-cols-3 gap-2 max-w-[200px] mx-auto">
        {[
          { dir: 'down-left'  as Direction, emoji: '↙️', col: 1, row: 1 },
          { dir: 'down'       as Direction, emoji: '⬇️', col: 2, row: 1 },
          { dir: 'down-right' as Direction, emoji: '↘️', col: 3, row: 1 },
          { dir: 'left'       as Direction, emoji: '⬅️', col: 1, row: 2 },
          { dir: 'stop'       as Direction, emoji: '✋', col: 2, row: 2 },
          { dir: 'right'      as Direction, emoji: '➡️', col: 3, row: 2 },
        ].map(b => (
          <button
            key={b.dir}
            type="button"
            onClick={() => handleInput(b.dir)}
            style={{ gridColumn: b.col, gridRow: b.row }}
            className={`text-xl p-2.5 rounded-xl border transition-all active:scale-90 ${
              currentStep?.dir === b.dir
                ? 'border-orange-500/60 bg-orange-500/20 text-orange-200 shadow-lg shadow-orange-500/20 scale-110'
                : b.dir === 'stop'
                ? 'border-red-700/50 bg-red-900/20 text-red-300 hover:bg-red-900/40'
                : 'border-slate-700/40 bg-slate-800/40 hover:bg-slate-700/60'
            }`}
          >
            {b.emoji}
          </button>
        ))}
      </div>

      {/* Progression séquence */}
      <div className="flex gap-1 justify-center">
        {sequence.map((s, i) => (
          <div
            key={i}
            className={`w-7 h-7 rounded flex items-center justify-center text-sm transition-all ${
              i < currentIdx
                ? 'bg-emerald-700/40 text-emerald-400'
                : i === currentIdx
                  ? 'bg-orange-500/30 ring-1 ring-orange-500/60 text-orange-300 scale-110'
                  : 'bg-slate-800/40 text-slate-600'
            }`}
          >
            {s.emoji}
          </div>
        ))}
      </div>
    </div>
  );
}
