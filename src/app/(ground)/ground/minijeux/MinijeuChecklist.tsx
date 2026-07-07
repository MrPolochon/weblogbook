'use client';

import { useState, useEffect, useCallback } from 'react';

interface Props {
  onFinish: (score: number) => void;
}

interface CheckItem {
  id: number;
  text: string;
  reglOrder: number; // ordre réglementaire attendu (1-based)
}

const ALL_ITEMS: Omit<CheckItem, 'reglOrder'>[] = [
  { id: 1,  text: 'Vérifier jauges carburant' },
  { id: 2,  text: 'Contrôle altimètre' },
  { id: 3,  text: 'Tester radio COM1' },
  { id: 4,  text: 'Vérifier horizons artificiels' },
  { id: 5,  text: 'Test avertisseur de décrochage' },
  { id: 6,  text: 'Contrôle volets (position départ)' },
  { id: 7,  text: 'Tester frein de parking' },
  { id: 8,  text: 'Vérifier feux de navigation' },
  { id: 9,  text: 'Test commandes de vol' },
  { id: 10, text: 'Confirmer masse & centrage' },
  { id: 11, text: 'Vérifier train d\'atterrissage' },
  { id: 12, text: 'Contrôle ATIS / METAR' },
];
const MEMO_DURATION = 5; // secondes pour mémoriser
const N_ITEMS = 10;

function generateChecklist(): CheckItem[] {
  const shuffled = [...ALL_ITEMS].sort(() => Math.random() - 0.5).slice(0, N_ITEMS);
  return shuffled.map((item, i) => ({ ...item, reglOrder: i + 1 }));
}

export default function MinijeuChecklist({ onFinish }: Props) {
  const [phase, setPhase] = useState<'idle' | 'memorize' | 'play' | 'finished'>('idle');
  const [items, setItems] = useState<CheckItem[]>([]);
  const [displayOrder, setDisplayOrder] = useState<CheckItem[]>([]); // ordre mélangé
  const [countdown, setCountdown] = useState(MEMO_DURATION);
  const [nextExpected, setNextExpected] = useState(1); // prochain ordre réglementaire attendu
  const [checked, setChecked] = useState<number[]>([]); // IDs cochés dans l'ordre cliqué
  const [wrongClicks, setWrongClicks] = useState<Set<number>>(new Set());
  const [score, setScore] = useState<number | null>(null);

  const startGame = useCallback(() => {
    const checklist = generateChecklist();
    const shuffled = [...checklist].sort(() => Math.random() - 0.5);
    setItems(checklist);
    setDisplayOrder(shuffled);
    setCountdown(MEMO_DURATION);
    setChecked([]);
    setWrongClicks(new Set());
    setNextExpected(1);
    setPhase('memorize');
    setScore(null);
  }, []);

  // Countdown mémorisation
  useEffect(() => {
    if (phase !== 'memorize') return;
    if (countdown <= 0) { setPhase('play'); return; }
    const id = setTimeout(() => setCountdown(c => c - 1), 1000);
    return () => clearTimeout(id);
  }, [phase, countdown]);

  function handleCheck(item: CheckItem) {
    if (phase !== 'play' || checked.includes(item.id)) return;

    if (item.reglOrder === nextExpected) {
      // Correct
      const newChecked = [...checked, item.id];
      setChecked(newChecked);
      setNextExpected(nextExpected + 1);
      if (newChecked.length >= items.length) {
        const correct = newChecked.filter(id => {
          const it = items.find(i => i.id === id)!;
          const clickPos = newChecked.indexOf(id) + 1;
          return it.reglOrder === clickPos;
        }).length;
        const s = Math.max(0, Math.min(1, correct / items.length));
        setScore(s);
        setPhase('finished');
      }
    } else {
      // Erreur : mauvais ordre
      setWrongClicks(prev => { const n = new Set(prev); n.add(item.id); return n; });
      setTimeout(() => setWrongClicks(prev => { const n = new Set(prev); n.delete(item.id); return n; }), 600);
      // Quand même cocher (avec pénalité implicite dans le score)
      const newChecked = [...checked, item.id];
      setChecked(newChecked);
      // Avancer quand même pour ne pas bloquer
      setNextExpected(nextExpected + 1);
      if (newChecked.length >= items.length) {
        const correct = newChecked.filter((id, pos) => {
          const it = items.find(i => i.id === id)!;
          return it.reglOrder === pos + 1;
        }).length;
        const s = Math.max(0, Math.min(1, correct / items.length));
        setScore(s);
        setPhase('finished');
      }
    }
  }

  if (phase === 'idle') {
    return (
      <div className="text-center space-y-4">
        <div className="text-5xl">📋</div>
        <h2 className="text-xl font-bold text-slate-100">Checklist Pré-vol</h2>
        <p className="text-slate-400 text-sm max-w-sm mx-auto">
          L&apos;ordre réglementaire s&apos;affiche pendant <strong>{MEMO_DURATION}s</strong>.
          Mémorisez-le, puis cochez les {N_ITEMS} items dans le bon ordre.
        </p>
        <button type="button" onClick={startGame} className="px-6 py-3 rounded-xl bg-violet-600 hover:bg-violet-700 text-white font-bold transition-colors">
          Commencer
        </button>
      </div>
    );
  }

  if (phase === 'memorize') {
    return (
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <span className="text-slate-400 text-sm font-semibold">Mémorisez l&apos;ordre réglementaire</span>
          <span className="text-2xl font-black text-violet-400">{countdown}s</span>
        </div>
        <div className="space-y-1.5 max-h-80 overflow-y-auto">
          {items.map((item, i) => (
            <div key={item.id} className="flex items-center gap-3 rounded-lg bg-slate-800/40 border border-slate-700/30 px-3 py-2">
              <span className="shrink-0 w-6 h-6 rounded-full bg-violet-500/20 border border-violet-500/40 text-violet-300 text-xs font-bold flex items-center justify-center">
                {i + 1}
              </span>
              <span className="text-slate-200 text-sm">{item.text}</span>
            </div>
          ))}
        </div>
      </div>
    );
  }

  if (phase === 'play') {
    return (
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <span className="text-slate-400 text-sm">Item {Math.min(checked.length + 1, items.length)}/{items.length}</span>
          <span className="text-xs text-slate-500">Cochez dans le bon ordre réglementaire</span>
        </div>
        <div className="h-1.5 rounded-full bg-slate-700 overflow-hidden">
          <div className="h-full bg-violet-500 transition-all" style={{ width: `${(checked.length / items.length) * 100}%` }} />
        </div>
        <div className="space-y-1.5 max-h-80 overflow-y-auto">
          {displayOrder.map(item => {
            const isChecked = checked.includes(item.id);
            const isWrong = wrongClicks.has(item.id);
            const checkPos = checked.indexOf(item.id) + 1;
            const wasCorrect = isChecked && item.reglOrder === checkPos;
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => handleCheck(item)}
                disabled={isChecked}
                className={`w-full flex items-center gap-3 rounded-lg border px-3 py-2.5 text-left transition-all ${
                  isChecked
                    ? wasCorrect
                      ? 'bg-emerald-900/20 border-emerald-700/40 opacity-60'
                      : 'bg-red-900/20 border-red-700/40 opacity-60'
                    : isWrong
                      ? 'bg-red-900/30 border-red-600/50 animate-shake'
                      : 'bg-slate-800/40 border-slate-700/30 hover:border-violet-500/40 hover:bg-violet-900/10 cursor-pointer'
                }`}
              >
                <span className={`shrink-0 w-6 h-6 rounded-full border text-xs font-bold flex items-center justify-center ${
                  isChecked
                    ? wasCorrect
                      ? 'bg-emerald-700 border-emerald-600 text-white'
                      : 'bg-red-700 border-red-600 text-white'
                    : 'border-slate-600 text-slate-500'
                }`}>
                  {isChecked ? (wasCorrect ? '✓' : '✗') : '·'}
                </span>
                <span className="text-sm text-slate-200">{item.text}</span>
                {isChecked && (
                  <span className="ml-auto text-xs text-slate-500">#{checkPos}</span>
                )}
              </button>
            );
          })}
        </div>
      </div>
    );
  }

  if (phase === 'finished' && score !== null) {
    const pct = Math.round(score * 100);
    const correct = checked.filter((id, pos) => {
      const it = items.find(i => i.id === id)!;
      return it.reglOrder === pos + 1;
    }).length;
    return (
      <div className="text-center space-y-4">
        <div className="text-5xl">{pct >= 80 ? '✅' : pct >= 50 ? '📋' : '❌'}</div>
        <h2 className="text-xl font-bold text-slate-100">Checklist terminée !</h2>
        <div className="inline-flex flex-col items-center gap-1 px-8 py-4 rounded-2xl bg-violet-900/20 border border-violet-800/40">
          <span className="text-4xl font-black text-violet-400">{pct}%</span>
          <span className="text-slate-400 text-sm">{correct}/{items.length} items dans le bon ordre</span>
        </div>
        <div className="flex gap-2 justify-center">
          <button type="button" onClick={startGame} className="px-4 py-2 rounded-xl border border-slate-600 text-slate-300 text-sm hover:bg-slate-700 transition-colors">Rejouer</button>
          <button type="button" onClick={() => onFinish(score)} className="px-4 py-2 rounded-xl bg-violet-600 hover:bg-violet-700 text-white text-sm font-bold transition-colors">Valider le score</button>
        </div>
      </div>
    );
  }

  return null;
}
