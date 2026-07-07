'use client';

import { useState, useEffect, useCallback, useRef } from 'react';

interface Props {
  onFinish: (score: number) => void;
}

type Direction = 'up' | 'right' | 'down' | 'left' | 'stop';

interface Step {
  dir: Direction;
  label: string;
  emoji: string;
  key: string;
}

const STEP_DURATION = 3; // secondes par étape

const ALL_STEPS: Step[] = [
  { dir: 'up',    label: 'Avancez',  emoji: '⬆️', key: 'ArrowUp' },
  { dir: 'right', label: 'Tournez à droite', emoji: '➡️', key: 'ArrowRight' },
  { dir: 'left',  label: 'Tournez à gauche', emoji: '⬅️', key: 'ArrowLeft' },
  { dir: 'down',  label: 'Reculez',  emoji: '⬇️', key: 'ArrowDown' },
  { dir: 'stop',  label: 'STOP !',   emoji: '✋', key: 'Space' },
];

function generateSequence(length = 7): Step[] {
  const withStop = [...ALL_STEPS];
  const seq: Step[] = [];
  for (let i = 0; i < length - 1; i++) {
    const pool = withStop.filter(s => s.dir !== 'stop' && seq.at(-1)?.dir !== s.dir);
    seq.push(pool[Math.floor(Math.random() * pool.length)]);
  }
  seq.push(withStop.find(s => s.dir === 'stop')!); // toujours finir par stop
  return seq;
}

const PLANE_POS_MAP: Partial<Record<Direction, { x: number; y: number }>> = {
  up:    { x: 0,   y: -10 },
  down:  { x: 0,   y:  10 },
  right: { x: 10,  y:   0 },
  left:  { x: -10, y:   0 },
  stop:  { x: 0,   y:   0 },
};

export default function MinijeuMarshalling({ onFinish }: Props) {
  const [phase, setPhase] = useState<'idle' | 'playing' | 'finished'>('idle');
  const [sequence, setSequence] = useState<Step[]>([]);
  const [currentIdx, setCurrentIdx] = useState(0);
  const [stepTimer, setStepTimer] = useState(STEP_DURATION);
  const [correct, setCorrect] = useState(0);
  const [planePos, setPlanePos] = useState({ x: 0, y: 0 });
  const [feedbackMsg, setFeedbackMsg] = useState<{ txt: string; ok: boolean } | null>(null);
  const [score, setScore] = useState<number | null>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const handledRef = useRef(false); // éviter double-comptage

  const endGame = useCallback((finalCorrect: number, totalSteps: number) => {
    if (timerRef.current) clearInterval(timerRef.current);
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
    const seq = generateSequence(7);
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

  // Countdown par étape
  useEffect(() => {
    if (phase !== 'playing') return;
    if (stepTimer <= 0) {
      if (!handledRef.current) {
        handledRef.current = true;
        setFeedbackMsg({ txt: '⏱️ Trop lent !', ok: false });
        setTimeout(() => setFeedbackMsg(null), 600);
        nextStep(sequence, currentIdx, correct);
      }
      return;
    }
    const id = setTimeout(() => setStepTimer(t => t - 1), 1000);
    return () => clearTimeout(id);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase, stepTimer, currentIdx]);

  const handleInput = useCallback((inputKey: string) => {
    if (phase !== 'playing' || handledRef.current) return;
    const currentStep = sequence[currentIdx];
    if (!currentStep) return;

    const isCorrect = inputKey === currentStep.key || (inputKey === currentStep.dir);
    handledRef.current = true;

    const delta = PLANE_POS_MAP[currentStep.dir] ?? { x: 0, y: 0 };
    setPlanePos(prev => ({ x: prev.x + delta.x, y: prev.y + delta.y }));

    const newCorrect = isCorrect ? correct + 1 : correct;
    if (isCorrect) {
      setCorrect(newCorrect);
      setFeedbackMsg({ txt: '✓', ok: true });
    } else {
      setFeedbackMsg({ txt: '✗ Mauvaise direction', ok: false });
    }
    setTimeout(() => setFeedbackMsg(null), 500);
    setTimeout(() => nextStep(sequence, currentIdx, newCorrect), 400);
  }, [phase, sequence, currentIdx, correct, nextStep]);

  // Clavier
  useEffect(() => {
    if (phase !== 'playing') return;
    function onKey(e: KeyboardEvent) {
      if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space'].includes(e.code)) {
        e.preventDefault();
        handleInput(e.code);
      }
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [phase, handleInput]);

  const currentStep = sequence[currentIdx];
  const timerPct = (stepTimer / STEP_DURATION) * 100;
  const timerColor = timerPct > 60 ? 'bg-emerald-500' : timerPct > 30 ? 'bg-amber-500' : 'bg-red-500 animate-pulse';

  if (phase === 'idle') {
    return (
      <div className="text-center space-y-4">
        <div className="text-5xl">🦺</div>
        <h2 className="text-xl font-bold text-slate-100">Marshalling</h2>
        <p className="text-slate-400 text-sm max-w-sm mx-auto">
          Guidez l&apos;avion vers son parking en suivant les signaux de marshalling.
          Appuyez sur la <span className="text-orange-300 font-semibold">flèche indiquée</span> dans les {STEP_DURATION}s imparties.
          Séquence de 7 signaux dont un <strong>STOP</strong> final.
        </p>
        <div className="flex justify-center gap-2 text-2xl">
          {ALL_STEPS.map(s => <span key={s.dir} title={s.label}>{s.emoji}</span>)}
        </div>
        <button type="button" onClick={startGame} className="px-6 py-3 rounded-xl bg-orange-600 hover:bg-orange-700 text-white font-bold transition-colors">
          Commencer
        </button>
      </div>
    );
  }

  if (phase === 'finished' && score !== null) {
    const pct = Math.round(score * 100);
    return (
      <div className="text-center space-y-4">
        <div className="text-5xl">{pct >= 85 ? '🅿️' : pct >= 60 ? '🦺' : '✈️💥'}</div>
        <h2 className="text-xl font-bold text-slate-100">Parking atteint !</h2>
        <div className="inline-flex flex-col items-center gap-1 px-8 py-4 rounded-2xl bg-orange-900/20 border border-orange-800/40">
          <span className="text-4xl font-black text-orange-400">{pct}%</span>
          <span className="text-slate-400 text-sm">{correct}/{sequence.length} signaux corrects</span>
        </div>
        <div className="flex gap-2 justify-center">
          <button type="button" onClick={startGame} className="px-4 py-2 rounded-xl border border-slate-600 text-slate-300 text-sm hover:bg-slate-700 transition-colors">Rejouer</button>
          <button type="button" onClick={() => onFinish(score)} className="px-4 py-2 rounded-xl bg-orange-600 hover:bg-orange-700 text-white text-sm font-bold transition-colors">Valider le score</button>
        </div>
      </div>
    );
  }

  // Phase playing
  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <span className="text-sm font-semibold text-slate-300">
          Signal {currentIdx + 1} / {sequence.length}
        </span>
        <div className="flex items-center gap-2">
          {feedbackMsg && (
            <span className={`text-sm font-bold ${feedbackMsg.ok ? 'text-emerald-400' : 'text-red-400'}`}>{feedbackMsg.txt}</span>
          )}
          <span className={`text-xl font-black font-mono ${stepTimer <= 1 ? 'text-red-400' : 'text-orange-400'}`}>{stepTimer}s</span>
        </div>
      </div>
      <div className="h-2 rounded-full bg-slate-700 overflow-hidden">
        <div className={`h-full ${timerColor} transition-all duration-1000`} style={{ width: `${timerPct}%` }} />
      </div>

      {/* Signal actuel */}
      {currentStep && (
        <div className="flex flex-col items-center py-4 gap-2">
          <div className={`text-8xl transition-transform ${stepTimer <= 1 ? 'animate-pulse' : ''}`}>
            {currentStep.emoji}
          </div>
          <p className="text-xl font-bold text-slate-100">{currentStep.label}</p>
          {currentStep.dir !== 'stop' && (
            <p className="text-slate-500 text-sm">Touche : <kbd className="px-1.5 py-0.5 rounded bg-slate-700 text-slate-200 text-xs font-mono">{currentStep.key.replace('Arrow', '↑').replace('ArrowUp', '↑').replace('ArrowDown', '↓').replace('ArrowLeft', '←').replace('ArrowRight', '→')}</kbd></p>
          )}
        </div>
      )}

      {/* Avion (représentation positionnelle) */}
      <div className="relative rounded-xl border border-slate-700/40 bg-slate-900/60 overflow-hidden" style={{ height: 120 }}>
        <div
          className="absolute text-3xl transition-all duration-300"
          style={{
            left: `calc(50% + ${Math.max(-120, Math.min(120, planePos.x * 2))}px)`,
            top: `calc(50% + ${Math.max(-40, Math.min(40, planePos.y * 0.5))}px)`,
            transform: 'translate(-50%, -50%)',
          }}
        >
          ✈️
        </div>
        {/* Parking target */}
        <div className="absolute bottom-2 right-4 text-xs text-slate-600 flex items-center gap-1">
          <span>🅿️</span> Parking
        </div>
      </div>

      {/* Boutons directionnels (tactile) */}
      <div className="grid grid-cols-3 gap-2 max-w-[200px] mx-auto">
        {[
          { dir: 'up',    emoji: '⬆️', col: 2, row: 1 },
          { dir: 'left',  emoji: '⬅️', col: 1, row: 2 },
          { dir: 'stop',  emoji: '✋', col: 2, row: 2 },
          { dir: 'right', emoji: '➡️', col: 3, row: 2 },
          { dir: 'down',  emoji: '⬇️', col: 2, row: 3 },
        ].map(b => (
          <button
            key={b.dir}
            type="button"
            onClick={() => handleInput(b.dir)}
            style={{ gridColumn: b.col, gridRow: b.row }}
            className={`text-2xl p-2 rounded-xl border transition-all active:scale-90 ${
              currentStep?.dir === b.dir
                ? 'border-orange-500/60 bg-orange-500/20 text-orange-200 shadow-lg shadow-orange-500/20'
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
            className={`w-6 h-6 rounded flex items-center justify-center text-sm transition-all ${
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
