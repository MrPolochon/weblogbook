'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { calculerScoreBagages } from '@/lib/ground/minigames';

interface Colis {
  id: number;
  x: number;
  y: number;
  yOffset: number;  // pour animation chute (0 → 1)
  visible: boolean;
  emoji: string;
  fragile: boolean;
  spawnedAt: number;
}

interface Props {
  onFinish: (score: number) => void;
}

const DUREE = 30;
const EMOJIS_NORMAL  = ['🧳', '📦', '🎒', '💼', '📫', '🗃️'];
const EMOJIS_FRAGILE = ['🏺', '🔮', '🪴', '🫙'];
const PROBA_FRAGILE  = 0.22; // ~22% des colis sont fragiles

export default function MinijeuBagages({ onFinish }: Props) {
  const [phase, setPhase] = useState<'idle' | 'playing' | 'finished'>('idle');
  const [timeLeft, setTimeLeft] = useState(DUREE);
  const [colis, setColis] = useState<Colis[]>([]);
  const [clicsReussis, setClicsReussis] = useState(0);
  const [totalApparus, setTotalApparus] = useState(0);
  const [penalties, setPenalties] = useState(0);
  const [score, setScore] = useState<number | null>(null);
  const [flashMsg, setFlashMsg] = useState<{ txt: string; ok: boolean } | null>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const colisTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const animFrameRef = useRef<number | null>(null);
  const nextIdRef = useRef(0);

  // Animer la chute des colis (yOffset 0→1 en 600ms)
  const animate = useCallback(() => {
    const now = Date.now();
    setColis(prev =>
      prev.map(c => {
        const elapsed = (now - c.spawnedAt) / 600;
        return c.visible ? { ...c, yOffset: Math.min(1, elapsed) } : c;
      })
    );
    animFrameRef.current = requestAnimationFrame(animate);
  }, []);

  const spawnColis = useCallback(() => {
    const id = nextIdRef.current++;
    const fragile = Math.random() < PROBA_FRAGILE;
    const pool = fragile ? EMOJIS_FRAGILE : EMOJIS_NORMAL;
    const newColis: Colis = {
      id,
      x: 5 + Math.random() * 85,
      y: 10 + Math.random() * 75,
      yOffset: 0,
      visible: true,
      emoji: pool[Math.floor(Math.random() * pool.length)],
      fragile,
      spawnedAt: Date.now(),
    };
    setColis(prev => [...prev.filter(c => c.visible).slice(-8), newColis]);
    setTotalApparus(n => n + 1);
    setTimeout(() => {
      setColis(prev => prev.map(c => c.id === id ? { ...c, visible: false } : c));
    }, 2200);
  }, []);

  const startGame = useCallback(() => {
    setPhase('playing');
    setTimeLeft(DUREE);
    setClicsReussis(0);
    setTotalApparus(0);
    setPenalties(0);
    setColis([]);
    nextIdRef.current = 0;

    timerRef.current = setInterval(() => {
      setTimeLeft(t => {
        if (t <= 1) { clearInterval(timerRef.current!); clearInterval(colisTimerRef.current!); return 0; }
        return t - 1;
      });
    }, 1000);

    colisTimerRef.current = setInterval(spawnColis, 750);
    animFrameRef.current = requestAnimationFrame(animate);
  }, [spawnColis, animate]);

  useEffect(() => {
    if (phase === 'playing' && timeLeft === 0) {
      if (animFrameRef.current) cancelAnimationFrame(animFrameRef.current);
      setPhase('finished');
      const rawScore = calculerScoreBagages(clicsReussis, Math.max(1, totalApparus), 0, DUREE);
      const penaltyDeduction = penalties * 0.2;
      setScore(Math.max(0, rawScore - penaltyDeduction));
    }
  }, [timeLeft, phase, clicsReussis, totalApparus, penalties]);

  useEffect(() => {
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
      if (colisTimerRef.current) clearInterval(colisTimerRef.current);
      if (animFrameRef.current) cancelAnimationFrame(animFrameRef.current);
    };
  }, []);

  function showFlash(txt: string, ok: boolean) {
    setFlashMsg({ txt, ok });
    setTimeout(() => setFlashMsg(null), 700);
  }

  function handleClick(c: Colis) {
    if (!c.visible) return;
    setColis(prev => prev.map(p => p.id === c.id ? { ...p, visible: false } : p));

    // Vérifier si des colis normaux sont encore visibles
    const normalVisibles = colis.filter(co => co.visible && !co.fragile && co.id !== c.id);

    if (c.fragile && normalVisibles.length > 0) {
      setPenalties(n => n + 1);
      showFlash('-0.2 ⚠️ Fragile !', false);
    } else {
      setClicsReussis(n => n + 1);
      if (c.fragile) showFlash('🔮 Fragile géré !', true);
    }
  }

  const timerPct = (timeLeft / DUREE) * 100;
  const timerColor = timerPct > 50 ? 'bg-emerald-500' : timerPct > 25 ? 'bg-amber-500' : 'bg-red-500';

  if (phase === 'idle') {
    return (
      <div className="text-center space-y-4">
        <div className="text-5xl">🧳</div>
        <h2 className="text-xl font-bold text-slate-100">Chargement Bagages</h2>
        <p className="text-slate-400 text-sm max-w-sm mx-auto">
          Des colis tombent sur la piste. Cliquez dessus avant qu&apos;ils disparaissent !
          Les colis <span className="text-red-300 font-semibold">fragiles</span> (🏺 🔮 🪴) ont une priorité basse — les cliquer quand des colis normaux sont là coûte <strong>-0.2</strong> de score.
        </p>
        <button type="button" onClick={startGame} className="px-6 py-3 rounded-xl bg-amber-600 hover:bg-amber-700 text-white font-bold transition-colors">
          Commencer ({DUREE}s)
        </button>
      </div>
    );
  }

  if (phase === 'finished' && score !== null) {
    const pct = Math.round(score * 100);
    return (
      <div className="text-center space-y-4">
        <div className="text-5xl">{pct >= 75 ? '🏆' : pct >= 50 ? '👍' : '😅'}</div>
        <h2 className="text-xl font-bold text-slate-100">Terminé !</h2>
        <div className="inline-flex flex-col items-center gap-1 px-8 py-4 rounded-2xl bg-amber-900/20 border border-amber-800/40">
          <span className="text-4xl font-black text-amber-400">{pct}%</span>
          <span className="text-slate-400 text-sm">{clicsReussis}/{totalApparus} colis chargés</span>
          {penalties > 0 && <span className="text-red-400 text-xs">−{penalties} pénalité{penalties > 1 ? 's' : ''} fragile</span>}
        </div>
        <div className="flex gap-2 justify-center">
          <button type="button" onClick={startGame} className="px-4 py-2 rounded-xl border border-slate-600 text-slate-300 text-sm hover:bg-slate-700 transition-colors">Rejouer</button>
          <button type="button" onClick={() => onFinish(score)} className="px-4 py-2 rounded-xl bg-amber-600 hover:bg-amber-700 text-white text-sm font-bold transition-colors">Valider le score</button>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <span className="text-sm font-semibold text-slate-300">{clicsReussis} colis</span>
          {penalties > 0 && <span className="text-xs text-red-400 font-semibold">−{penalties} fragile</span>}
        </div>
        <span className="text-lg font-black font-mono text-amber-400">{timeLeft}s</span>
      </div>
      <div className="h-2 rounded-full bg-slate-700 overflow-hidden">
        <div className={`h-full ${timerColor} transition-all duration-1000`} style={{ width: `${timerPct}%` }} />
      </div>
      <div
        className="relative w-full rounded-2xl bg-slate-900 border border-slate-700/50 overflow-hidden select-none"
        style={{ height: 320 }}
      >
        {flashMsg && (
          <div className={`absolute top-2 left-1/2 -translate-x-1/2 z-20 px-3 py-1.5 rounded-full text-xs font-bold shadow-lg pointer-events-none ${flashMsg.ok ? 'bg-emerald-700 text-white' : 'bg-red-700 text-white'}`}>
            {flashMsg.txt}
          </div>
        )}
        {/* Piste d'aéroport (fond) */}
        <div className="absolute inset-0 flex items-end justify-center pb-2 pointer-events-none opacity-10">
          <div className="w-3/4 h-4 rounded-full bg-slate-500" />
        </div>

        {colis.filter(c => c.visible).map(c => {
          const fallY = c.yOffset * 12; // 0 → 12px de chute
          return (
            <button
              key={c.id}
              type="button"
              onClick={() => handleClick(c)}
              className={`absolute transition-none cursor-pointer select-none ${c.fragile ? 'text-2xl' : 'text-3xl'}`}
              style={{
                left: `${c.x}%`,
                top: `calc(${c.y}% + ${fallY}px)`,
                transform: `translate(-50%, -50%) scale(${0.6 + c.yOffset * 0.4})`,
                opacity: c.yOffset < 0.3 ? c.yOffset / 0.3 : 1,
              }}
            >
              {c.fragile && <span className="absolute -top-1 -right-1 text-[10px] font-bold text-red-400 bg-slate-900/80 rounded-full px-0.5">!</span>}
              {c.emoji}
            </button>
          );
        })}
      </div>
      <p className="text-xs text-slate-600 text-center">Colis normaux = +1 · Colis fragiles si normaux présents = −0.2</p>
    </div>
  );
}
