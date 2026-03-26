'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import {
  Loader2, Eye, Sliders, Puzzle, Gauge, Check, ArrowRight,
  Trophy, Star, RotateCcw
} from 'lucide-react';

interface DemandeInfo {
  id: string;
  statut: string;
  entreprise: { nom: string } | null;
  avion: { immatriculation: string; nom: string } | null;
  scores: Array<{ type_jeu: string; score: number }>;
}

interface GameScore {
  type_jeu: string;
  score: number;
  duree_secondes: number;
}

const GAMES = [
  { key: 'inspection', label: 'Inspection Visuelle', icon: Eye, color: 'text-sky-400' },
  { key: 'calibrage', label: 'Calibrage Instruments', icon: Sliders, color: 'text-amber-400' },
  { key: 'assemblage', label: 'Assemblage Pièces', icon: Puzzle, color: 'text-emerald-400' },
  { key: 'test_moteur', label: 'Test Moteur', icon: Gauge, color: 'text-red-400' },
] as const;

export default function MiniJeuxClient({ demandeId }: { demandeId: string }) {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [demande, setDemande] = useState<DemandeInfo | null>(null);
  const [currentGame, setCurrentGame] = useState<string | null>(null);
  const [completedGames, setCompletedGames] = useState<Map<string, number>>(new Map());
  const [error, setError] = useState('');

  useEffect(() => {
    fetch(`/api/reparation/demandes/${demandeId}`)
      .then(r => r.json())
      .then(d => {
        setDemande(d);
        const map = new Map<string, number>();
        (d.scores || []).forEach((s: { type_jeu: string; score: number }) => map.set(s.type_jeu, s.score));
        setCompletedGames(map);
      })
      .catch(() => setError('Impossible de charger la demande'))
      .finally(() => setLoading(false));
  }, [demandeId]);

  async function submitScore(gameScore: GameScore) {
    try {
      const res = await fetch(`/api/reparation/demandes/${demandeId}/mini-jeu`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(gameScore),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Erreur');
      setCompletedGames(prev => new Map(prev).set(gameScore.type_jeu, data.score));
      setCurrentGame(null);

      if (data.all_completed) {
        setDemande(prev => prev ? { ...prev, scores: data.scores } : prev);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erreur');
    }
  }

  if (loading) return <div className="flex items-center justify-center py-12"><Loader2 className="h-8 w-8 animate-spin text-slate-400" /></div>;
  if (!demande) return <p className="text-red-400">{error || 'Demande introuvable'}</p>;

  const allCompleted = GAMES.every(g => completedGames.has(g.key));
  const avgScore = allCompleted
    ? Math.round(Array.from(completedGames.values()).reduce((a, b) => a + b, 0) / completedGames.size)
    : null;

  if (currentGame) {
    return (
      <div className="space-y-4">
        <button onClick={() => setCurrentGame(null)} className="text-sm text-slate-400 hover:text-slate-200">← Retour aux jeux</button>
        {currentGame === 'inspection' && <InspectionGame onComplete={submitScore} />}
        {currentGame === 'calibrage' && <CalibrageGame onComplete={submitScore} />}
        {currentGame === 'assemblage' && <AssemblageGame onComplete={submitScore} />}
        {currentGame === 'test_moteur' && <TestMoteurGame onComplete={submitScore} />}
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-100 flex items-center gap-2">
          <Puzzle className="h-7 w-7 text-violet-400" />
          Mini-jeux de réparation
        </h1>
        <p className="text-slate-400 mt-1">
          {demande.avion?.immatriculation} ({demande.avion?.nom}) — {demande.entreprise?.nom}
        </p>
      </div>

      {error && <p className="text-red-400 text-sm">{error}</p>}

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        {GAMES.map(g => {
          const done = completedGames.has(g.key);
          const score = completedGames.get(g.key);
          const Icon = g.icon;
          return (
            <button key={g.key} onClick={() => !done && setCurrentGame(g.key)} disabled={done}
              className={`p-6 rounded-xl border transition text-left ${done ? 'border-emerald-700/30 bg-emerald-900/10 cursor-default' : 'border-slate-700/50 bg-slate-800/30 hover:bg-slate-800/50 cursor-pointer'}`}>
              <div className="flex items-center gap-3 mb-2">
                <Icon className={`h-6 w-6 ${done ? 'text-emerald-400' : g.color}`} />
                <span className="font-semibold text-slate-100">{g.label}</span>
                {done && <Check className="h-5 w-5 text-emerald-400 ml-auto" />}
              </div>
              {done ? (
                <div className="flex items-center gap-2">
                  <div className="flex-1 h-2 rounded-full bg-slate-700 overflow-hidden">
                    <div className="h-full rounded-full bg-emerald-500 transition-all" style={{ width: `${score}%` }} />
                  </div>
                  <span className="text-sm font-bold text-emerald-400">{score}/100</span>
                </div>
              ) : (
                <p className="text-slate-500 text-sm">Cliquez pour jouer</p>
              )}
            </button>
          );
        })}
      </div>

      {allCompleted && (
        <div className="rounded-xl border border-violet-700/30 bg-violet-900/10 p-6 text-center space-y-3">
          <Trophy className="h-12 w-12 text-amber-400 mx-auto" />
          <h2 className="text-xl font-bold text-slate-100">Réparation terminée !</h2>
          <p className="text-3xl font-bold text-violet-400">{avgScore}/100</p>
          <p className="text-slate-400 text-sm">
            {avgScore! >= 90 ? 'Excellent travail ! Réparation parfaite.' :
             avgScore! >= 70 ? 'Bon travail ! Réparation de qualité.' :
             avgScore! >= 50 ? 'Travail correct. Réparation acceptable.' :
             'Résultat médiocre. La réparation est partielle.'}
          </p>
          <button onClick={() => router.push('/reparation')} className="px-6 py-2 rounded-lg bg-violet-600 text-white font-medium">
            Retour au dashboard
          </button>
        </div>
      )}
    </div>
  );
}

// ═══════════════════════════════════════════════
// JEU 1 : INSPECTION VISUELLE
// ═══════════════════════════════════════════════

function InspectionGame({ onComplete }: { onComplete: (s: GameScore) => void }) {
  const GRID = 8;
  const TOTAL_DEFECTS = 6;
  const TIME_LIMIT = 30;

  const [defects, setDefects] = useState<Set<number>>(new Set());
  const [found, setFound] = useState<Set<number>>(new Set());
  const [clicked, setClicked] = useState<Set<number>>(new Set());
  const [timeLeft, setTimeLeft] = useState(TIME_LIMIT);
  const [started, setStarted] = useState(false);
  const [finished, setFinished] = useState(false);
  const startTime = useRef(0);
  const finishedRef = useRef(false);
  const foundRef = useRef<Set<number>>(new Set());

  useEffect(() => {
    const d = new Set<number>();
    while (d.size < TOTAL_DEFECTS) d.add(Math.floor(Math.random() * GRID * GRID));
    setDefects(d);
  }, []);

  useEffect(() => {
    if (!started || finished) return;
    const timer = setInterval(() => {
      setTimeLeft(prev => {
        if (prev <= 1) { clearInterval(timer); finish(); return 0; }
        return prev - 1;
      });
    }, 1000);
    return () => clearInterval(timer);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [started, finished]);

  function finish() {
    if (finishedRef.current) return;
    finishedRef.current = true;
    setFinished(true);
    const score = Math.round((foundRef.current.size / TOTAL_DEFECTS) * 100);
    const duration = Math.round((Date.now() - startTime.current) / 1000);
    onComplete({ type_jeu: 'inspection', score, duree_secondes: Math.max(duration, 10) });
  }

  function handleClick(idx: number) {
    if (finishedRef.current || clicked.has(idx)) return;
    if (!started) { setStarted(true); startTime.current = Date.now(); }
    setClicked(prev => new Set(prev).add(idx));
    if (defects.has(idx)) {
      const newFound = new Set(foundRef.current).add(idx);
      foundRef.current = newFound;
      setFound(newFound);
      if (newFound.size === TOTAL_DEFECTS) finish();
    }
  }

  const ZONE_LABELS = ['Aile G', 'Moteur G', 'Fuselage AV', 'Cockpit', 'Fuselage AR', 'Empennage', 'Moteur D', 'Aile D'];

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-bold text-slate-100 flex items-center gap-2"><Eye className="h-5 w-5 text-sky-400" />Inspection Visuelle</h2>
        <div className="flex items-center gap-4">
          <span className="text-sm text-slate-400">Défauts : {found.size}/{TOTAL_DEFECTS}</span>
          <span className={`text-sm font-bold ${timeLeft <= 10 ? 'text-red-400' : 'text-slate-300'}`}>{timeLeft}s</span>
        </div>
      </div>
      <p className="text-slate-400 text-sm">Cliquez sur les cellules pour trouver les {TOTAL_DEFECTS} défauts cachés. {!started && 'Cliquez pour commencer.'}</p>
      <div className="grid gap-1" style={{ gridTemplateColumns: `repeat(${GRID}, 1fr)` }}>
        {Array.from({ length: GRID * GRID }, (_, i) => {
          const isDefect = defects.has(i);
          const isFound = found.has(i);
          const wasClicked = clicked.has(i);
          const showDefect = finished && isDefect && !isFound;
          return (
            <button key={i} onClick={() => handleClick(i)}
              className={`aspect-square rounded text-xs font-medium transition-all duration-150 ${
                isFound ? 'bg-emerald-600 text-white scale-95' :
                showDefect ? 'bg-red-600/50 text-red-200 animate-pulse' :
                wasClicked ? 'bg-slate-700/50 text-slate-500' :
                'bg-slate-700/30 hover:bg-slate-600/50 text-slate-500'
              }`}
              disabled={finished}
              title={ZONE_LABELS[Math.floor(i / GRID)] || ''}
            >
              {isFound ? '✓' : showDefect ? '✗' : ''}
            </button>
          );
        })}
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════
// JEU 2 : CALIBRAGE INSTRUMENTS
// ═══════════════════════════════════════════════

function CalibrageGame({ onComplete }: { onComplete: (s: GameScore) => void }) {
  const GAUGES = [
    { name: 'Pression huile', target: 65, unit: 'PSI', range: [0, 100] },
    { name: 'Température', target: 42, unit: '°C', range: [0, 80] },
    { name: 'Voltage', target: 28, unit: 'V', range: [0, 40] },
    { name: 'RPM', target: 2200, unit: 'RPM', range: [0, 3000] },
  ];

  const [values, setValues] = useState(GAUGES.map(() => 50));
  const [targets, setTargets] = useState(GAUGES.map(g => g.target));
  const [oscillation, setOscillation] = useState(GAUGES.map(() => 0));
  const [submitted, setSubmitted] = useState(false);
  const startTime = useRef(Date.now());

  useEffect(() => {
    const jitter = GAUGES.map(g => g.target + (Math.random() * 10 - 5));
    setTargets(jitter.map(j => Math.round(j)));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const interval = setInterval(() => {
      setOscillation(prev => prev.map(() => Math.sin(Date.now() / 500) * 3));
    }, 100);
    return () => clearInterval(interval);
  }, []);

  function handleSubmit() {
    setSubmitted(true);
    const precisions = values.map((v, i) => {
      const target = targets[i];
      const range = GAUGES[i].range[1] - GAUGES[i].range[0];
      const diff = Math.abs(v - target) / range;
      return Math.max(0, 100 - diff * 200);
    });
    const score = Math.round(precisions.reduce((a, b) => a + b, 0) / precisions.length);
    const duration = Math.round((Date.now() - startTime.current) / 1000);
    onComplete({ type_jeu: 'calibrage', score, duree_secondes: Math.max(duration, 8) });
  }

  return (
    <div className="space-y-4">
      <h2 className="text-lg font-bold text-slate-100 flex items-center gap-2"><Sliders className="h-5 w-5 text-amber-400" />Calibrage Instruments</h2>
      <p className="text-slate-400 text-sm">Amenez chaque curseur dans la zone verte (zone cible). La cible oscille légèrement.</p>

      <div className="space-y-6">
        {GAUGES.map((g, i) => {
          const targetPos = ((targets[i] + oscillation[i] - g.range[0]) / (g.range[1] - g.range[0])) * 100;
          const valPos = ((values[i] - g.range[0]) / (g.range[1] - g.range[0])) * 100;
          return (
            <div key={g.name} className="space-y-1">
              <div className="flex justify-between text-sm">
                <span className="text-slate-300">{g.name}</span>
                <span className="text-slate-400">{Math.round(values[i])} {g.unit}</span>
              </div>
              <div className="relative h-8 rounded-full bg-slate-700 overflow-hidden">
                <div className="absolute h-full bg-emerald-600/30 rounded-full transition-all"
                  style={{ left: `${Math.max(0, targetPos - 5)}%`, width: '10%' }} />
                <div className="absolute h-full w-1 bg-amber-400 top-0 transition-all" style={{ left: `${targetPos}%` }} />
                <input type="range" min={g.range[0]} max={g.range[1]} value={values[i]} disabled={submitted}
                  onChange={e => setValues(prev => { const n = [...prev]; n[i] = Number(e.target.value); return n; })}
                  className="absolute inset-0 w-full h-full opacity-0 cursor-pointer" />
                <div className="absolute top-1 h-6 w-3 rounded bg-sky-400 transition-all pointer-events-none" style={{ left: `calc(${valPos}% - 6px)` }} />
              </div>
              <div className="flex justify-between text-xs text-slate-500">
                <span>{g.range[0]}</span><span>{g.range[1]}</span>
              </div>
            </div>
          );
        })}
      </div>

      {!submitted && (
        <button onClick={handleSubmit} className="px-6 py-2 rounded-lg bg-amber-600 text-white font-medium flex items-center gap-2">
          <Check className="h-4 w-4" /> Valider le calibrage
        </button>
      )}
    </div>
  );
}

// ═══════════════════════════════════════════════
// JEU 3 : ASSEMBLAGE PIÈCES
// ═══════════════════════════════════════════════

function AssemblageGame({ onComplete }: { onComplete: (s: GameScore) => void }) {
  const PIECES = [
    'Carter moteur', 'Cylindres', 'Pistons', 'Vilebrequin',
    'Soupapes', 'Arbre à cames', 'Injecteurs', 'Collecteur',
  ];
  const CORRECT_ORDER = PIECES.map((_, i) => i);

  const [shuffled, setShuffled] = useState<number[]>([]);
  const [userOrder, setUserOrder] = useState<number[]>([]);
  const [dragIdx, setDragIdx] = useState<number | null>(null);
  const [submitted, setSubmitted] = useState(false);
  const startTime = useRef(Date.now());

  useEffect(() => {
    const arr = [...CORRECT_ORDER].sort(() => Math.random() - 0.5);
    setShuffled(arr);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function handleDragStart(idx: number) {
    setDragIdx(idx);
  }

  function handleDrop(targetIdx: number) {
    if (dragIdx === null || dragIdx === targetIdx) return;
    setShuffled(prev => {
      const arr = [...prev];
      const item = arr.splice(dragIdx, 1)[0];
      arr.splice(targetIdx, 0, item);
      return arr;
    });
    setDragIdx(null);
  }

  function handleSwap(from: number, to: number) {
    if (from < 0 || from >= shuffled.length || to < 0 || to >= shuffled.length) return;
    setShuffled(prev => {
      const arr = [...prev];
      [arr[from], arr[to]] = [arr[to], arr[from]];
      return arr;
    });
  }

  function handleSubmit() {
    setSubmitted(true);
    let correct = 0;
    shuffled.forEach((piece, idx) => { if (piece === CORRECT_ORDER[idx]) correct++; });
    const baseScore = Math.round((correct / PIECES.length) * 100);
    const duration = Math.round((Date.now() - startTime.current) / 1000);
    const speedBonus = duration < 30 ? 10 : duration < 60 ? 5 : 0;
    const score = Math.min(100, baseScore + speedBonus);
    onComplete({ type_jeu: 'assemblage', score, duree_secondes: Math.max(duration, 12) });
  }

  return (
    <div className="space-y-4">
      <h2 className="text-lg font-bold text-slate-100 flex items-center gap-2"><Puzzle className="h-5 w-5 text-emerald-400" />Assemblage Pièces</h2>
      <p className="text-slate-400 text-sm">Ordonnez les pièces dans le bon ordre d&apos;assemblage. Utilisez les flèches ou le glisser-déposer.</p>

      <div className="grid grid-cols-1 gap-2 max-w-md">
        <div className="grid grid-cols-2 gap-4 mb-2">
          <div>
            <p className="text-xs text-slate-500 mb-1">Votre ordre :</p>
          </div>
          <div>
            <p className="text-xs text-slate-500 mb-1">Référence :</p>
          </div>
        </div>
        {shuffled.map((piece, idx) => {
          const isCorrect = submitted && piece === CORRECT_ORDER[idx];
          const isWrong = submitted && piece !== CORRECT_ORDER[idx];
          return (
            <div key={`${piece}-${idx}`}
              draggable={!submitted}
              onDragStart={() => handleDragStart(idx)}
              onDragOver={e => e.preventDefault()}
              onDrop={() => handleDrop(idx)}
              className={`flex items-center justify-between p-3 rounded-lg border transition ${
                isCorrect ? 'border-emerald-600 bg-emerald-900/20' :
                isWrong ? 'border-red-600 bg-red-900/20' :
                'border-slate-600 bg-slate-800 hover:bg-slate-700/50 cursor-grab'
              }`}>
              <div className="flex items-center gap-2">
                <span className="text-xs text-slate-500 w-6">{idx + 1}.</span>
                <span className={`text-sm ${isCorrect ? 'text-emerald-300' : isWrong ? 'text-red-300' : 'text-slate-200'}`}>
                  {PIECES[piece]}
                </span>
              </div>
              {!submitted && (
                <div className="flex gap-1">
                  <button onClick={() => handleSwap(idx, idx - 1)} disabled={idx === 0} className="text-slate-500 hover:text-slate-300 disabled:opacity-30 text-xs px-1">▲</button>
                  <button onClick={() => handleSwap(idx, idx + 1)} disabled={idx === shuffled.length - 1} className="text-slate-500 hover:text-slate-300 disabled:opacity-30 text-xs px-1">▼</button>
                </div>
              )}
            </div>
          );
        })}
      </div>

      <div className="rounded-lg bg-slate-700/20 p-3">
        <p className="text-xs text-slate-500 mb-1">Ordre de référence :</p>
        <p className="text-xs text-slate-400">{PIECES.join(' → ')}</p>
      </div>

      {!submitted && (
        <button onClick={handleSubmit} className="px-6 py-2 rounded-lg bg-emerald-600 text-white font-medium flex items-center gap-2">
          <Check className="h-4 w-4" /> Valider l&apos;assemblage
        </button>
      )}
    </div>
  );
}

// ═══════════════════════════════════════════════
// JEU 4 : TEST MOTEUR
// ═══════════════════════════════════════════════

function TestMoteurGame({ onComplete }: { onComplete: (s: GameScore) => void }) {
  const DURATION = 30;
  const PARAMS = [
    { name: 'RPM', min: 0, max: 3000, target: 2200, greenRange: 200 },
    { name: 'Température', min: 0, max: 120, target: 75, greenRange: 15 },
    { name: 'Pression', min: 0, max: 100, target: 55, greenRange: 10 },
  ];

  const [sliders, setSliders] = useState(PARAMS.map(p => p.target));
  const [fluctuations, setFluctuations] = useState(PARAMS.map(() => 0));
  const [timeLeft, setTimeLeft] = useState(DURATION);
  const [running, setRunning] = useState(false);
  const [finished, setFinished] = useState(false);
  const inGreenFrames = useRef(0);
  const totalFrames = useRef(0);
  const startTime = useRef(0);
  const animRef = useRef<number>(0);
  const slidersRef = useRef(PARAMS.map(p => p.target));

  useEffect(() => { slidersRef.current = sliders; }, [sliders]);

  const tick = useCallback(() => {
    if (!running || finished) return;

    const newFluct = PARAMS.map((p, i) => {
      const t = Date.now() / 1000;
      return Math.sin(t * (1.5 + i * 0.7)) * (p.greenRange * 0.8) +
             Math.cos(t * (2.3 + i * 0.5)) * (p.greenRange * 0.3);
    });
    setFluctuations(newFluct);

    totalFrames.current++;
    const allInGreen = PARAMS.every((p, i) => {
      const actual = slidersRef.current[i] + newFluct[i];
      return Math.abs(actual - p.target) <= p.greenRange;
    });
    if (allInGreen) inGreenFrames.current++;

    animRef.current = requestAnimationFrame(tick);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [running, finished]);

  useEffect(() => {
    if (running && !finished) {
      animRef.current = requestAnimationFrame(tick);
    }
    return () => cancelAnimationFrame(animRef.current);
  }, [running, finished, tick]);

  useEffect(() => {
    if (!running || finished) return;
    const timer = setInterval(() => {
      setTimeLeft(prev => {
        if (prev <= 1) {
          clearInterval(timer);
          setFinished(true);
          setRunning(false);
          const score = totalFrames.current > 0
            ? Math.round((inGreenFrames.current / totalFrames.current) * 100)
            : 50;
          const duration = Math.round((Date.now() - startTime.current) / 1000);
          onComplete({ type_jeu: 'test_moteur', score, duree_secondes: Math.max(duration, 15) });
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
    return () => clearInterval(timer);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [running, finished]);

  function start() {
    setRunning(true);
    startTime.current = Date.now();
    inGreenFrames.current = 0;
    totalFrames.current = 0;
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-bold text-slate-100 flex items-center gap-2"><Gauge className="h-5 w-5 text-red-400" />Test Moteur</h2>
        <span className={`text-lg font-bold ${timeLeft <= 10 ? 'text-red-400' : 'text-slate-300'}`}>{timeLeft}s</span>
      </div>
      <p className="text-slate-400 text-sm">Maintenez les paramètres dans la zone verte pendant {DURATION} secondes. Les valeurs fluctuent !</p>

      {!running && !finished && (
        <button onClick={start} className="px-6 py-3 rounded-lg bg-red-600 text-white font-medium text-lg flex items-center gap-2 mx-auto">
          <Gauge className="h-5 w-5" /> Démarrer le test
        </button>
      )}

      {(running || finished) && (
        <div className="space-y-6">
          {PARAMS.map((p, i) => {
            const actual = sliders[i] + fluctuations[i];
            const inGreen = Math.abs(actual - p.target) <= p.greenRange;
            const normalizedActual = ((actual - p.min) / (p.max - p.min)) * 100;
            const greenStart = ((p.target - p.greenRange - p.min) / (p.max - p.min)) * 100;
            const greenWidth = ((p.greenRange * 2) / (p.max - p.min)) * 100;

            return (
              <div key={p.name} className="space-y-1">
                <div className="flex justify-between text-sm">
                  <span className={inGreen ? 'text-emerald-300' : 'text-red-300'}>{p.name}</span>
                  <span className="text-slate-400">{Math.round(actual)} / {p.target} cible</span>
                </div>
                <div className="relative h-10 rounded-full bg-slate-700 overflow-hidden">
                  <div className="absolute h-full bg-emerald-600/20 rounded-full" style={{ left: `${greenStart}%`, width: `${greenWidth}%` }} />
                  <div className={`absolute top-1 h-8 w-2 rounded transition-all ${inGreen ? 'bg-emerald-400' : 'bg-red-400'}`}
                    style={{ left: `calc(${Math.max(0, Math.min(100, normalizedActual))}% - 4px)` }} />
                  <input type="range" min={p.min} max={p.max} value={sliders[i]} disabled={finished}
                    onChange={e => setSliders(prev => { const n = [...prev]; n[i] = Number(e.target.value); return n; })}
                    className="absolute inset-0 w-full h-full opacity-0 cursor-pointer" />
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
