'use client';

import { useState, useEffect, useCallback } from 'react';
import { calculerScoreCatering } from '@/lib/ground/minigames';

const PLATS = ['🥗', '🍝', '🍱', '🥩', '🍣', '🥘', '🌮', '🍛', '🥪', '🍜'];
const DUREE_MEMO_BASE = 3; // secondes de mémorisation (Easy/Medium)
const DUREE_MEMO_HARD = 4;

type DifficultyMode = 'easy' | 'medium' | 'hard';

interface DiffConfig {
  label: string;
  color: string;
  platCount: number;
  intrusCount: number;
  memoSec: number;
}

const DIFF_CONFIG: Record<DifficultyMode, DiffConfig> = {
  easy:   { label: 'Facile',  color: 'emerald', platCount: 4, intrusCount: 0, memoSec: DUREE_MEMO_BASE },
  medium: { label: 'Moyen',   color: 'amber',   platCount: 6, intrusCount: 1, memoSec: DUREE_MEMO_BASE },
  hard:   { label: 'Difficile', color: 'red',   platCount: 8, intrusCount: 2, memoSec: DUREE_MEMO_HARD },
};

interface Props {
  onFinish: (score: number) => void;
}

export default function MinijeuCatering({ onFinish }: Props) {
  const [phase, setPhase] = useState<'idle' | 'memorize' | 'reproduce' | 'finished'>('idle');
  const [diffMode, setDiffMode] = useState<DifficultyMode>('medium');
  const [sequence, setSequence] = useState<string[]>([]);        // plats à reproduire dans l'ordre
  const [intrus, setIntrus]     = useState<Set<string>>(new Set()); // emojis intrus (NE PAS cliquer)
  const [repro, setRepro]       = useState<string[]>([]);
  const [countdown, setCountdown] = useState(DUREE_MEMO_BASE);
  const [bonnes, setBonnes]     = useState(0);
  const [score, setScore]       = useState<number | null>(null);
  const [feedback, setFeedback] = useState<{ msg: string; ok: boolean } | null>(null);

  const generateGame = useCallback((mode: DifficultyMode) => {
    const cfg = DIFF_CONFIG[mode];
    const pool = [...PLATS].sort(() => Math.random() - 0.5);
    const seq = pool.slice(0, cfg.platCount);
    const intrusPool = pool.slice(cfg.platCount, cfg.platCount + cfg.intrusCount);
    return { seq, intrusSet: new Set(intrusPool) };
  }, []);

  function startGame() {
    const { seq, intrusSet } = generateGame(diffMode);
    const cfg = DIFF_CONFIG[diffMode];
    setSequence(seq);
    setIntrus(intrusSet);
    setRepro([]);
    setBonnes(0);
    setCountdown(cfg.memoSec);
    setPhase('memorize');
    setFeedback(null);
  }

  useEffect(() => {
    if (phase !== 'memorize') return;
    if (countdown <= 0) { setPhase('reproduce'); return; }
    const id = setTimeout(() => setCountdown(c => c - 1), 1000);
    return () => clearTimeout(id);
  }, [phase, countdown]);

  function handleSelectPlat(plat: string) {
    if (phase !== 'reproduce') return;
    const nextIdx = repro.length;

    // Clic sur un intrus
    if (intrus.has(plat)) {
      setFeedback({ msg: '🚫 Intrus ! −1 étape', ok: false });
      setTimeout(() => setFeedback(null), 600);
      const newRepro = [...repro, plat]; // marquer comme erreur
      setRepro(newRepro);
      if (newRepro.length >= sequence.length + intrus.size) finishGame(bonnes, sequence.length);
      return;
    }

    const correct = sequence[nextIdx] === plat;
    const newRepro = [...repro, plat];
    setRepro(newRepro);
    setFeedback({ msg: correct ? '✓' : '✗', ok: correct });
    setTimeout(() => setFeedback(null), 400);
    const newBonnes = correct ? bonnes + 1 : bonnes;
    if (correct) setBonnes(newBonnes);

    if (newRepro.length >= sequence.length) {
      finishGame(newBonnes, sequence.length);
    }
  }

  function finishGame(finalBonnes: number, seqLen: number) {
    const s = calculerScoreCatering(finalBonnes, seqLen);
    setScore(s);
    setPhase('finished');
  }

  const cfg = DIFF_CONFIG[diffMode];
  const allGridPlats = [...new Set([...PLATS.slice(0, 8), ...sequence, ...Array.from(intrus)])].sort(() => Math.random() - 0.5).slice(0, 10);

  if (phase === 'idle') {
    return (
      <div className="text-center space-y-5">
        <div className="text-5xl">🍽️</div>
        <h2 className="text-xl font-bold text-slate-100">Service Catering</h2>
        <p className="text-slate-400 text-sm max-w-sm mx-auto">
          Mémorisez la séquence, reproduisez-la dans l&apos;ordre.
          En mode Difficile : des plats <span className="text-red-300 font-semibold">intrus</span> apparaissent — ne les cliquez pas !
        </p>

        {/* Sélecteur de difficulté */}
        <div className="flex items-center justify-center gap-2">
          {(Object.keys(DIFF_CONFIG) as DifficultyMode[]).map(m => {
            const c = DIFF_CONFIG[m];
            const active = m === diffMode;
            const colorClass = c.color === 'emerald' ? 'border-emerald-500/50 text-emerald-300 bg-emerald-500/10' :
                               c.color === 'amber'   ? 'border-amber-500/50 text-amber-300 bg-amber-500/10'     :
                                                       'border-red-500/50 text-red-300 bg-red-500/10';
            return (
              <button
                key={m}
                type="button"
                onClick={() => setDiffMode(m)}
                className={`px-3 py-1.5 rounded-xl border text-sm font-semibold transition-all ${
                  active ? colorClass + ' ring-1 ring-offset-0 scale-105' : 'border-slate-600 text-slate-400 hover:border-slate-500'
                }`}
              >
                {c.label}
                <span className="block text-[10px] font-normal mt-0.5 opacity-70">
                  {c.platCount} plats{c.intrusCount > 0 ? ` · ${c.intrusCount} intrus` : ''}
                </span>
              </button>
            );
          })}
        </div>

        <button type="button" onClick={startGame} className={`px-6 py-3 rounded-xl text-white font-bold transition-colors ${
          diffMode === 'easy' ? 'bg-emerald-600 hover:bg-emerald-700' :
          diffMode === 'medium' ? 'bg-amber-600 hover:bg-amber-700' : 'bg-red-600 hover:bg-red-700'
        }`}>
          Commencer
        </button>
      </div>
    );
  }

  if (phase === 'memorize') {
    return (
      <div className="text-center space-y-5">
        <div className="flex items-center justify-center gap-2">
          <span className="text-slate-400 text-sm">Mémorisez !</span>
          <span className="text-2xl font-black text-emerald-400">{countdown}s</span>
          {intrus.size > 0 && <span className="text-xs text-red-400 font-semibold">🚫 = intrus à éviter</span>}
        </div>
        <div className="flex flex-wrap justify-center gap-3">
          {sequence.map((plat, i) => (
            <div key={i} className="flex flex-col items-center">
              <div className="text-4xl bg-slate-800 border border-slate-700 rounded-xl p-3 w-16 h-16 flex items-center justify-center">
                {plat}
              </div>
              <span className="text-xs text-slate-500 mt-1">#{i + 1}</span>
            </div>
          ))}
        </div>
        {intrus.size > 0 && (
          <div className="flex flex-wrap justify-center gap-2">
            <span className="text-xs text-slate-500">Intrus (à éviter) :</span>
            {Array.from(intrus).map((p, i) => (
              <div key={i} className="relative text-3xl bg-red-900/20 border border-red-700/40 rounded-xl p-2 w-12 h-12 flex items-center justify-center">
                {p}
                <span className="absolute -top-1 -right-1 text-sm">🚫</span>
              </div>
            ))}
          </div>
        )}
      </div>
    );
  }

  if (phase === 'reproduce') {
    const reproFiltered = repro.filter(p => !intrus.has(p));
    return (
      <div className="space-y-5">
        <div className="flex items-center justify-between">
          <span className="text-sm text-slate-400">
            Reproduisez dans l&apos;ordre : <span className="font-semibold text-slate-200">{reproFiltered.length + 1}/{sequence.length}</span>
          </span>
          {feedback && (
            <span className={`text-xl font-black ${feedback.ok ? 'text-emerald-400' : 'text-red-400'}`}>{feedback.msg}</span>
          )}
        </div>

        <div className="flex gap-1.5 flex-wrap min-h-[3rem] items-center">
          {repro.map((plat, i) => {
            const isIntrus = intrus.has(plat);
            const isCorrect = !isIntrus && sequence[repro.filter(p => !intrus.has(p)).indexOf(plat)] === plat;
            return (
              <div key={i} className={`text-2xl rounded-lg px-2 py-1 border ${
                isIntrus ? 'bg-red-900/40 border-red-700/50 relative' :
                isCorrect ? 'bg-emerald-900/30 border-emerald-800/40' : 'bg-red-900/30 border-red-800/40'
              }`}>
                {plat}
                {isIntrus && <span className="absolute -top-1 -right-1 text-xs">🚫</span>}
              </div>
            );
          })}
          {repro.filter(p => !intrus.has(p)).length < sequence.length && (
            <div className="h-10 w-10 rounded-lg border-2 border-dashed border-slate-600 animate-pulse" />
          )}
        </div>

        <div className="grid grid-cols-5 gap-2">
          {allGridPlats.map((plat) => {
            const isIntrus = intrus.has(plat);
            return (
              <button
                key={plat}
                type="button"
                onClick={() => handleSelectPlat(plat)}
                className={`text-3xl rounded-xl border p-2.5 transition-all active:scale-95 ${
                  isIntrus
                    ? 'border-red-700/40 bg-red-900/20 hover:bg-red-900/40 relative'
                    : 'border-slate-700/50 bg-slate-800/40 hover:border-emerald-600/50 hover:bg-emerald-900/20'
                }`}
              >
                {plat}
                {isIntrus && <span className="absolute -top-1 -right-1 text-xs">🚫</span>}
              </button>
            );
          })}
        </div>
      </div>
    );
  }

  if (phase === 'finished' && score !== null) {
    const pct = Math.round(score * 100);
    return (
      <div className="text-center space-y-4">
        <div className="text-5xl">{pct >= 80 ? '🌟' : pct >= 50 ? '👍' : '😅'}</div>
        <h2 className="text-xl font-bold text-slate-100">Service terminé !</h2>
        <div className="inline-flex flex-col items-center gap-1 px-8 py-4 rounded-2xl bg-emerald-900/20 border border-emerald-800/40">
          <span className="text-4xl font-black text-emerald-400">{pct}%</span>
          <span className="text-slate-400 text-sm">{bonnes}/{sequence.length} corrects · {cfg.label}</span>
        </div>
        <div className="flex gap-2 justify-center">
          <button type="button" onClick={startGame} className="px-4 py-2 rounded-xl border border-slate-600 text-slate-300 text-sm hover:bg-slate-700 transition-colors">Rejouer</button>
          <button type="button" onClick={() => onFinish(score)} className="px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-bold transition-colors">Valider le score</button>
        </div>
      </div>
    );
  }

  return null;
}
