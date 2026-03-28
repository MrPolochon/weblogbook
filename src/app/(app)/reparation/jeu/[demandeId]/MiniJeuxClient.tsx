'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import {
  Loader2, Eye, Sliders, Puzzle, Gauge, Check, ArrowRight,
  Trophy
} from 'lucide-react';

interface DemandeInfo {
  id: string;
  statut: string;
  entreprise: { nom: string } | null;
  avion: { immatriculation: string; nom_bapteme: string | null } | null;
  scores: Array<{ type_jeu: string; score: number }>;
}

interface GameScore {
  type_jeu: string;
  score: number;
  duree_secondes: number;
}

import { getGamesForDemande, type GameType } from '@/lib/reparation-games';
import { Zap, Droplets, Flame, ClipboardCheck } from 'lucide-react';

const ALL_GAME_META: Record<string, { label: string; icon: typeof Eye; color: string }> = {
  inspection: { label: 'Inspection Visuelle', icon: Eye, color: 'text-sky-400' },
  calibrage: { label: 'Calibrage Instruments', icon: Sliders, color: 'text-amber-400' },
  assemblage: { label: 'Assemblage Pièces', icon: Puzzle, color: 'text-emerald-400' },
  test_moteur: { label: 'Test Moteur', icon: Gauge, color: 'text-red-400' },
  cablage: { label: 'Câblage Électrique', icon: Zap, color: 'text-yellow-400' },
  hydraulique: { label: 'Circuit Hydraulique', icon: Droplets, color: 'text-blue-400' },
  soudure: { label: 'Soudure de Précision', icon: Flame, color: 'text-orange-400' },
  diagnostic: { label: 'Diagnostic Technique', icon: ClipboardCheck, color: 'text-teal-400' },
};

const GAME_COMPONENTS: Record<GameType, React.ComponentType<{ onComplete: (s: GameScore) => Promise<boolean> | boolean }>> = {
  inspection: InspectionGame,
  calibrage: CalibrageGame,
  assemblage: AssemblageGame,
  test_moteur: TestMoteurGame,
  cablage: CablageGame,
  hydraulique: HydrauliqueGame,
  soudure: SoudureGame,
  diagnostic: DiagnosticGame,
};

export default function MiniJeuxClient({ demandeId }: { demandeId: string }) {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [demande, setDemande] = useState<DemandeInfo | null>(null);
  const [currentGame, setCurrentGame] = useState<string | null>(null);
  const [completedGames, setCompletedGames] = useState<Map<string, number>>(new Map());
  const [error, setError] = useState('');

  const assignedGames = getGamesForDemande(demandeId);

  useEffect(() => {
    fetch(`/api/reparation/demandes/${demandeId}`)
      .then(r => {
        if (!r.ok) throw new Error('Erreur chargement');
        return r.json();
      })
      .then(d => {
        setDemande(d);
        const map = new Map<string, number>();
        (d.scores || []).forEach((s: { type_jeu: string; score: number }) => map.set(s.type_jeu, s.score));
        setCompletedGames(map);
      })
      .catch(() => setError('Impossible de charger la demande'))
      .finally(() => setLoading(false));
  }, [demandeId]);

  async function submitScore(gameScore: GameScore): Promise<boolean> {
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
      return true;
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erreur');
      return false;
    }
  }

  if (loading) return <div className="flex items-center justify-center py-12"><Loader2 className="h-8 w-8 animate-spin text-slate-400" /></div>;
  if (!demande) return <p className="text-red-400">{error || 'Demande introuvable'}</p>;

  const allCompleted = assignedGames.every(g => completedGames.has(g));
  const avgScore = allCompleted
    ? Math.round(Array.from(completedGames.values()).reduce((a, b) => a + b, 0) / completedGames.size)
    : null;

  if (currentGame) {
    const GameComponent = GAME_COMPONENTS[currentGame as GameType];
    return (
      <div className="space-y-4">
        <button onClick={() => setCurrentGame(null)} className="text-sm text-slate-400 hover:text-slate-200">← Retour aux jeux</button>
        {GameComponent && <GameComponent onComplete={submitScore} />}
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
          {demande.avion?.immatriculation} ({demande.avion?.nom_bapteme || 'sans nom'}) — {demande.entreprise?.nom}
        </p>
      </div>

      {error && <p className="text-red-400 text-sm">{error}</p>}

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        {assignedGames.map(key => {
          const meta = ALL_GAME_META[key];
          if (!meta) return null;
          const done = completedGames.has(key);
          const score = completedGames.get(key);
          const Icon = meta.icon;
          return (
            <button key={key} onClick={() => !done && setCurrentGame(key)} disabled={done}
              className={`p-6 rounded-xl border transition text-left ${done ? 'border-emerald-700/30 bg-emerald-900/10 cursor-default' : 'border-slate-700/50 bg-slate-800/30 hover:bg-slate-800/50 cursor-pointer'}`}>
              <div className="flex items-center gap-3 mb-2">
                <Icon className={`h-6 w-6 ${done ? 'text-emerald-400' : meta.color}`} />
                <span className="font-semibold text-slate-100">{meta.label}</span>
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

const DEFECT_TYPES = [
  { symbol: '⚡', name: 'Fissure', color: 'text-yellow-300' },
  { symbol: '●', name: 'Corrosion', color: 'text-orange-400' },
  { symbol: '◇', name: 'Rivet manquant', color: 'text-red-400' },
  { symbol: '≋', name: 'Fuite', color: 'text-blue-400' },
  { symbol: '◎', name: 'Usure', color: 'text-violet-400' },
];

const ZONE_LABELS = ['Aile gauche', 'Moteur gauche', 'Fuselage avant', 'Cockpit', 'Fuselage arrière', 'Empennage', 'Moteur droit', 'Aile droite'];

function InspectionGame({ onComplete }: { onComplete: (s: GameScore) => void }) {
  const GRID = 8;
  const TOTAL_DEFECTS = 8;
  const TIME_LIMIT = 35;

  const [defects, setDefects] = useState<Map<number, number>>(new Map());
  const [found, setFound] = useState<Set<number>>(new Set());
  const [clicked, setClicked] = useState<Set<number>>(new Set());
  const [falseClicks, setFalseClicks] = useState(0);
  const [timeLeft, setTimeLeft] = useState(TIME_LIMIT);
  const [started, setStarted] = useState(false);
  const [finished, setFinished] = useState(false);
  const [shakeCell, setShakeCell] = useState<number | null>(null);
  const startTime = useRef(0);
  const finishedRef = useRef(false);
  const foundRef = useRef<Set<number>>(new Set());
  const falseRef = useRef(0);

  useEffect(() => {
    const d = new Map<number, number>();
    while (d.size < TOTAL_DEFECTS) {
      const cell = Math.floor(Math.random() * GRID * GRID);
      if (!d.has(cell)) d.set(cell, Math.floor(Math.random() * DEFECT_TYPES.length));
    }
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
    const baseScore = (foundRef.current.size / TOTAL_DEFECTS) * 100;
    const penalty = falseRef.current * 5;
    const score = Math.max(0, Math.round(baseScore - penalty));
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
    } else {
      falseRef.current++;
      setFalseClicks(falseRef.current);
      setShakeCell(idx);
      setTimeout(() => setShakeCell(null), 400);
    }
  }

  const timerPct = (timeLeft / TIME_LIMIT) * 100;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-bold text-slate-100 flex items-center gap-2"><Eye className="h-5 w-5 text-sky-400" />Inspection Visuelle</h2>
        <div className="flex items-center gap-3">
          <span className="text-sm text-emerald-400">{found.size}/{TOTAL_DEFECTS}</span>
          {falseClicks > 0 && <span className="text-xs text-red-400">-{falseClicks * 5}pts</span>}
          <span className={`text-sm font-bold ${timeLeft <= 10 ? 'text-red-400 animate-pulse' : 'text-slate-300'}`}>{timeLeft}s</span>
        </div>
      </div>

      <div className="w-full h-1.5 rounded-full bg-slate-700 overflow-hidden">
        <div className={`h-full rounded-full transition-all duration-1000 ${timeLeft <= 10 ? 'bg-red-500' : timeLeft <= 20 ? 'bg-amber-500' : 'bg-sky-500'}`}
          style={{ width: `${timerPct}%` }} />
      </div>

      <p className="text-slate-400 text-sm">
        Trouvez les {TOTAL_DEFECTS} défauts sur l&apos;avion. Attention, chaque faux clic coûte 5 points !
        {!started && ' Cliquez pour commencer.'}
      </p>

      <div className="relative">
        {/* Aircraft silhouette SVG background */}
        <svg viewBox="0 0 320 320" className="absolute inset-0 w-full h-full pointer-events-none opacity-[0.07]" preserveAspectRatio="xMidYMid meet">
          <path d="M160 10 L170 80 L250 140 L280 135 L280 155 L250 150 L175 200 L180 290 L210 310 L210 320 L160 300 L110 320 L110 310 L140 290 L145 200 L70 150 L40 155 L40 135 L70 140 L150 80 Z"
            fill="currentColor" className="text-slate-300" />
        </svg>

        <div className="relative grid gap-0.5" style={{ gridTemplateColumns: `auto repeat(${GRID}, 1fr)` }}>
          {Array.from({ length: GRID }, (_, row) => (
            <div key={`row-${row}`} className="contents">
              <div className="flex items-center pr-1.5">
                <span className="text-[9px] text-slate-600 whitespace-nowrap w-14 text-right">{ZONE_LABELS[row]}</span>
              </div>
              {Array.from({ length: GRID }, (_, col) => {
                const idx = row * GRID + col;
                const defType = defects.get(idx);
                const isDefect = defType !== undefined;
                const isFound = found.has(idx);
                const wasClicked = clicked.has(idx);
                const showDefect = finished && isDefect && !isFound;
                const isShaking = shakeCell === idx;

                return (
                  <button key={idx} onClick={() => handleClick(idx)}
                    className={`aspect-square rounded-sm text-xs font-bold transition-all duration-150 flex items-center justify-center ${
                      isFound ? 'bg-emerald-600/80 text-white scale-95 ring-1 ring-emerald-400' :
                      showDefect ? 'bg-red-600/60 text-red-200 animate-pulse ring-1 ring-red-500' :
                      isShaking ? 'bg-red-900/30 text-red-500' :
                      wasClicked ? 'bg-slate-800/60 text-slate-600' :
                      'bg-slate-700/40 hover:bg-slate-600/50 text-transparent hover:text-slate-600 active:scale-90'
                    }`}
                    style={isShaking ? { animation: 'shake 0.4s ease-in-out' } : undefined}
                    disabled={finished}>
                    {isFound ? DEFECT_TYPES[defType!].symbol :
                     showDefect ? DEFECT_TYPES[defType!].symbol : ''}
                  </button>
                );
              })}
            </div>
          ))}
        </div>
      </div>

      {/* Defects legend */}
      <div className="flex flex-wrap gap-3 text-xs">
        {DEFECT_TYPES.map(dt => (
          <span key={dt.name} className={`${dt.color} opacity-60`}>{dt.symbol} {dt.name}</span>
        ))}
      </div>

      {finished && (
        <div className="rounded-lg bg-slate-800/60 border border-slate-700 p-3 space-y-1">
          <p className="text-sm text-slate-200">Résultat : <strong className="text-emerald-400">{found.size}</strong> trouvés, <strong className="text-red-400">{falseClicks}</strong> faux positifs</p>
          <p className="text-xs text-slate-500">Score = ({found.size}/{TOTAL_DEFECTS} × 100) - ({falseClicks} × 5) = <strong>{Math.max(0, Math.round((found.size / TOTAL_DEFECTS) * 100 - falseClicks * 5))}</strong></p>
        </div>
      )}

      <style>{`@keyframes shake { 0%,100%{transform:translateX(0)} 20%{transform:translateX(-4px)} 40%{transform:translateX(4px)} 60%{transform:translateX(-3px)} 80%{transform:translateX(2px)} }`}</style>
    </div>
  );
}

// ═══════════════════════════════════════════════
// JEU 2 : CALIBRAGE INSTRUMENTS
// ═══════════════════════════════════════════════

const GAUGE_DEFS = [
  { name: 'Pression huile', target: 65, unit: 'PSI', range: [0, 100] as const, freq: 1.2, amp: 4 },
  { name: 'Température EGT', target: 680, unit: '°C', range: [400, 900] as const, freq: 0.8, amp: 15 },
  { name: 'Voltage', target: 28, unit: 'V', range: [20, 36] as const, freq: 1.8, amp: 1.5 },
  { name: 'RPM', target: 2200, unit: 'RPM', range: [800, 3000] as const, freq: 0.6, amp: 80 },
  { name: 'Débit carburant', target: 38, unit: 'GPH', range: [10, 60] as const, freq: 1.4, amp: 3 },
];

function CalibrageGame({ onComplete }: { onComplete: (s: GameScore) => void }) {
  const TIME_LIMIT = 45;

  const [values, setValues] = useState(GAUGE_DEFS.map(g => g.range[0] + (g.range[1] - g.range[0]) * 0.3));
  const [targets] = useState(() => GAUGE_DEFS.map(g => g.target + Math.round((Math.random() - 0.5) * g.amp * 2)));
  const [oscillation, setOscillation] = useState(GAUGE_DEFS.map(() => 0));
  const [submitted, setSubmitted] = useState(false);
  const [timeLeft, setTimeLeft] = useState(TIME_LIMIT);
  const [precisions, setPrecisions] = useState<number[]>([]);
  const startTime = useRef(Date.now());
  const finishedRef = useRef(false);

  useEffect(() => {
    const interval = setInterval(() => {
      const t = Date.now() / 1000;
      setOscillation(GAUGE_DEFS.map((g, i) =>
        Math.sin(t * g.freq) * g.amp + Math.cos(t * g.freq * 1.7 + i) * (g.amp * 0.4)
      ));
    }, 50);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    if (submitted) return;
    const timer = setInterval(() => {
      setTimeLeft(prev => {
        if (prev <= 1) { clearInterval(timer); doSubmit(); return 0; }
        return prev - 1;
      });
    }, 1000);
    return () => clearInterval(timer);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [submitted]);

  function doSubmit() {
    if (finishedRef.current) return;
    finishedRef.current = true;
    setSubmitted(true);
    const prec = values.map((v, i) => {
      const range = GAUGE_DEFS[i].range[1] - GAUGE_DEFS[i].range[0];
      const diff = Math.abs(v - targets[i]) / range;
      return Math.max(0, Math.round(100 - diff * 250));
    });
    setPrecisions(prec);
    const score = Math.round(prec.reduce((a, b) => a + b, 0) / prec.length);
    const duration = Math.round((Date.now() - startTime.current) / 1000);
    onComplete({ type_jeu: 'calibrage', score, duree_secondes: Math.max(duration, 8) });
  }

  function getProximity(i: number): string {
    const range = GAUGE_DEFS[i].range[1] - GAUGE_DEFS[i].range[0];
    const diff = Math.abs(values[i] - targets[i]) / range;
    if (diff < 0.03) return 'text-emerald-400';
    if (diff < 0.08) return 'text-amber-400';
    return 'text-red-400';
  }

  const timerPct = (timeLeft / TIME_LIMIT) * 100;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-bold text-slate-100 flex items-center gap-2"><Sliders className="h-5 w-5 text-amber-400" />Calibrage Instruments</h2>
        <span className={`text-lg font-bold ${timeLeft <= 10 ? 'text-red-400 animate-pulse' : 'text-slate-300'}`}>{timeLeft}s</span>
      </div>

      <div className="w-full h-1.5 rounded-full bg-slate-700 overflow-hidden">
        <div className={`h-full rounded-full transition-all duration-1000 ${timeLeft <= 10 ? 'bg-red-500' : timeLeft <= 20 ? 'bg-amber-500' : 'bg-amber-400'}`}
          style={{ width: `${timerPct}%` }} />
      </div>

      <p className="text-slate-400 text-sm">Réglez les 5 instruments pour atteindre la cible (trait doré). La cible oscille indépendamment.</p>

      <div className="space-y-5">
        {GAUGE_DEFS.map((g, i) => {
          const range = g.range[1] - g.range[0];
          const targetEffective = targets[i] + oscillation[i];
          const targetPos = ((targetEffective - g.range[0]) / range) * 100;
          const valPos = ((values[i] - g.range[0]) / range) * 100;
          const greenW = Math.max(6, (g.amp * 3 / range) * 100);
          const prec = precisions[i];

          return (
            <div key={g.name} className="space-y-1">
              <div className="flex justify-between text-sm">
                <span className={`font-medium ${submitted ? (prec !== undefined && prec >= 80 ? 'text-emerald-300' : prec !== undefined && prec >= 50 ? 'text-amber-300' : 'text-red-300') : 'text-slate-300'}`}>
                  {g.name}
                  {submitted && prec !== undefined && <span className="ml-2 text-xs opacity-70">({prec}%)</span>}
                </span>
                <span className={`font-mono ${getProximity(i)}`}>
                  {Math.round(values[i])} {g.unit}
                </span>
              </div>
              <div className="relative h-10 rounded-lg bg-slate-700/80 overflow-hidden border border-slate-600/50">
                <div className="absolute h-full bg-emerald-600/15 transition-all"
                  style={{ left: `${Math.max(0, targetPos - greenW / 2)}%`, width: `${greenW}%` }} />
                <div className="absolute h-full w-0.5 bg-amber-400/80 top-0 transition-all" style={{ left: `${Math.max(0, Math.min(100, targetPos))}%` }} />
                {submitted && (
                  <div className="absolute h-full w-0.5 bg-sky-400 top-0" style={{ left: `${valPos}%` }} />
                )}
                <input type="range" min={g.range[0]} max={g.range[1]} step={(range / 200)} value={values[i]} disabled={submitted}
                  onChange={e => setValues(prev => { const n = [...prev]; n[i] = Number(e.target.value); return n; })}
                  className="absolute inset-0 w-full h-full opacity-0 cursor-pointer" />
                <div className={`absolute top-1.5 h-7 w-3 rounded-sm transition-all pointer-events-none shadow-lg ${
                  submitted ? (prec !== undefined && prec >= 80 ? 'bg-emerald-400' : prec !== undefined && prec >= 50 ? 'bg-amber-400' : 'bg-red-400') : 'bg-sky-400'
                }`} style={{ left: `calc(${Math.max(1, Math.min(99, valPos))}% - 6px)` }} />
              </div>
              <div className="flex justify-between text-[10px] text-slate-600">
                <span>{g.range[0]}</span><span className="text-slate-500">cible ≈ {targets[i]}</span><span>{g.range[1]}</span>
              </div>
            </div>
          );
        })}
      </div>

      {!submitted && (
        <button onClick={doSubmit} className="px-6 py-2.5 rounded-lg bg-amber-600 text-white font-medium flex items-center gap-2 hover:bg-amber-500 transition">
          <Check className="h-4 w-4" /> Valider le calibrage
        </button>
      )}
    </div>
  );
}

// ═══════════════════════════════════════════════
// JEU 3 : ASSEMBLAGE PIÈCES
// ═══════════════════════════════════════════════

const ASSEMBLY_PIECES = [
  { name: 'Carter moteur', icon: '⬡', desc: 'Structure de base' },
  { name: 'Vilebrequin', icon: '⟳', desc: 'Axe de rotation' },
  { name: 'Bielles', icon: '⟂', desc: 'Liaison piston-vilebrequin' },
  { name: 'Pistons', icon: '▣', desc: 'Compression du mélange' },
  { name: 'Cylindres', icon: '◉', desc: 'Chambres de combustion' },
  { name: 'Culasse', icon: '▤', desc: 'Fermeture haute cylindres' },
  { name: 'Soupapes', icon: '⇅', desc: 'Admission & échappement' },
  { name: 'Arbre à cames', icon: '◠', desc: 'Commande soupapes' },
  { name: 'Injecteurs', icon: '⊕', desc: 'Injection carburant' },
  { name: 'Collecteur', icon: '⟡', desc: 'Distribution gaz' },
];

function AssemblageGame({ onComplete }: { onComplete: (s: GameScore) => void }) {
  const TIME_LIMIT = 90;
  const CORRECT_ORDER = ASSEMBLY_PIECES.map((_, i) => i);

  const [shuffled, setShuffled] = useState<number[]>([]);
  const [dragIdx, setDragIdx] = useState<number | null>(null);
  const [dragOverIdx, setDragOverIdx] = useState<number | null>(null);
  const [submitted, setSubmitted] = useState(false);
  const [showHint, setShowHint] = useState(false);
  const [hintUsed, setHintUsed] = useState(false);
  const [timeLeft, setTimeLeft] = useState(TIME_LIMIT);
  const startTime = useRef(Date.now());
  const finishedRef = useRef(false);

  useEffect(() => {
    let arr = [...CORRECT_ORDER];
    for (let i = arr.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [arr[i], arr[j]] = [arr[j], arr[i]];
    }
    if (arr.every((v, i) => v === i)) {
      [arr[0], arr[1]] = [arr[1], arr[0]];
    }
    setShuffled(arr);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (submitted) return;
    const timer = setInterval(() => {
      setTimeLeft(prev => {
        if (prev <= 1) { clearInterval(timer); doSubmit(); return 0; }
        return prev - 1;
      });
    }, 1000);
    return () => clearInterval(timer);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [submitted]);

  function doSubmit() {
    if (finishedRef.current) return;
    finishedRef.current = true;
    setSubmitted(true);
    let correct = 0;
    shuffled.forEach((piece, idx) => { if (piece === CORRECT_ORDER[idx]) correct++; });
    const baseScore = Math.round((correct / ASSEMBLY_PIECES.length) * 100);
    const duration = Math.round((Date.now() - startTime.current) / 1000);
    const speedBonus = duration < 30 ? 15 : duration < 50 ? 10 : duration < 70 ? 5 : 0;
    const hintPenalty = hintUsed ? 15 : 0;
    const score = Math.max(0, Math.min(100, baseScore + speedBonus - hintPenalty));
    onComplete({ type_jeu: 'assemblage', score, duree_secondes: Math.max(duration, 12) });
  }

  function handleSwap(from: number, to: number) {
    if (from < 0 || from >= shuffled.length || to < 0 || to >= shuffled.length) return;
    setShuffled(prev => {
      const arr = [...prev];
      [arr[from], arr[to]] = [arr[to], arr[from]];
      return arr;
    });
  }

  const timerPct = (timeLeft / TIME_LIMIT) * 100;
  const correctCount = shuffled.filter((p, i) => p === i).length;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-bold text-slate-100 flex items-center gap-2"><Puzzle className="h-5 w-5 text-emerald-400" />Assemblage Pièces</h2>
        <div className="flex items-center gap-3">
          <span className="text-xs text-slate-400">{correctCount}/{ASSEMBLY_PIECES.length} bien placées</span>
          <span className={`text-sm font-bold ${timeLeft <= 15 ? 'text-red-400 animate-pulse' : 'text-slate-300'}`}>{timeLeft}s</span>
        </div>
      </div>

      <div className="w-full h-1.5 rounded-full bg-slate-700 overflow-hidden">
        <div className={`h-full rounded-full transition-all duration-1000 ${timeLeft <= 15 ? 'bg-red-500' : timeLeft <= 30 ? 'bg-amber-500' : 'bg-emerald-500'}`}
          style={{ width: `${timerPct}%` }} />
      </div>

      <p className="text-slate-400 text-sm">
        Ordonnez les 10 pièces moteur. Glisser-déposer ou flèches. L&apos;indice coûte 15 points.
      </p>

      <div className="grid grid-cols-1 gap-1.5 max-w-lg">
        {shuffled.map((piece, idx) => {
          const isCorrect = submitted && piece === CORRECT_ORDER[idx];
          const isWrong = submitted && piece !== CORRECT_ORDER[idx];
          const isPreviewCorrect = !submitted && piece === idx;
          const isDragTarget = dragOverIdx === idx && dragIdx !== idx;
          const p = ASSEMBLY_PIECES[piece];
          return (
            <div key={`${piece}-${idx}`}
              draggable={!submitted}
              onDragStart={() => setDragIdx(idx)}
              onDragOver={e => { e.preventDefault(); setDragOverIdx(idx); }}
              onDragLeave={() => setDragOverIdx(null)}
              onDrop={() => {
                if (dragIdx !== null && dragIdx !== idx) {
                  setShuffled(prev => {
                    const arr = [...prev];
                    const item = arr.splice(dragIdx, 1)[0];
                    arr.splice(idx, 0, item);
                    return arr;
                  });
                }
                setDragIdx(null);
                setDragOverIdx(null);
              }}
              onDragEnd={() => { setDragIdx(null); setDragOverIdx(null); }}
              className={`flex items-center justify-between p-2.5 rounded-lg border transition-all ${
                isCorrect ? 'border-emerald-500 bg-emerald-900/20' :
                isWrong ? 'border-red-500 bg-red-900/20' :
                isDragTarget ? 'border-amber-400 bg-amber-900/15 scale-[1.02]' :
                isPreviewCorrect ? 'border-emerald-700/40 bg-emerald-900/5' :
                'border-slate-600/60 bg-slate-800/80 hover:bg-slate-700/60 cursor-grab'
              }`}>
              <div className="flex items-center gap-2.5 min-w-0">
                <span className={`text-xs font-mono w-5 text-center ${isCorrect ? 'text-emerald-400' : isWrong ? 'text-red-400' : isPreviewCorrect ? 'text-emerald-600' : 'text-slate-600'}`}>
                  {idx + 1}
                </span>
                <span className="text-base w-5 text-center">{p.icon}</span>
                <div className="min-w-0">
                  <span className={`text-sm font-medium ${isCorrect ? 'text-emerald-300' : isWrong ? 'text-red-300' : 'text-slate-200'}`}>
                    {p.name}
                  </span>
                  <span className="text-[10px] text-slate-500 ml-2">{p.desc}</span>
                </div>
              </div>
              {!submitted && (
                <div className="flex gap-0.5 flex-shrink-0">
                  <button onClick={() => handleSwap(idx, idx - 1)} disabled={idx === 0}
                    className="w-6 h-6 flex items-center justify-center rounded text-slate-500 hover:text-slate-200 hover:bg-slate-600/50 disabled:opacity-20 text-xs">▲</button>
                  <button onClick={() => handleSwap(idx, idx + 1)} disabled={idx === shuffled.length - 1}
                    className="w-6 h-6 flex items-center justify-center rounded text-slate-500 hover:text-slate-200 hover:bg-slate-600/50 disabled:opacity-20 text-xs">▼</button>
                </div>
              )}
              {submitted && (
                <span className="text-xs flex-shrink-0">{isCorrect ? '✓' : `→ ${CORRECT_ORDER[idx] + 1}`}</span>
              )}
            </div>
          );
        })}
      </div>

      <div className="flex items-center gap-3">
        {!submitted && (
          <>
            <button onClick={doSubmit} className="px-6 py-2 rounded-lg bg-emerald-600 text-white font-medium flex items-center gap-2 hover:bg-emerald-500">
              <Check className="h-4 w-4" /> Valider
            </button>
            <button onClick={() => { setShowHint(!showHint); setHintUsed(true); }}
              className="px-4 py-2 rounded-lg bg-slate-700 text-slate-300 text-sm flex items-center gap-1.5 hover:bg-slate-600">
              <Eye className="h-3.5 w-3.5" /> {showHint ? 'Masquer' : 'Indice'} {!hintUsed && '(-15pts)'}
            </button>
          </>
        )}
      </div>

      {showHint && !submitted && (
        <div className="rounded-lg bg-slate-700/30 border border-slate-600/50 p-3">
          <p className="text-[10px] text-slate-500 mb-1.5">Ordre correct :</p>
          <div className="flex flex-wrap gap-1">
            {ASSEMBLY_PIECES.map((p, i) => (
              <span key={i} className="text-[10px] text-slate-400 bg-slate-700/50 px-1.5 py-0.5 rounded">
                {i + 1}. {p.icon} {p.name}
              </span>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// ═══════════════════════════════════════════════
// JEU 4 : TEST MOTEUR
// ═══════════════════════════════════════════════

// ═══════════════════════════════════════════════
// JEU 5 : CÂBLAGE ÉLECTRIQUE
// ═══════════════════════════════════════════════

const WIRE_DEFS = [
  { id: 0, label: 'Batterie +', color: '#ef4444', terminal: 'Relais démarrage', section: 'Puissance' },
  { id: 1, label: 'Alternateur', color: '#f59e0b', terminal: 'Régulateur tension', section: 'Puissance' },
  { id: 2, label: 'Magnéto L', color: '#22c55e', terminal: 'Bougies cyl. G', section: 'Allumage' },
  { id: 3, label: 'Magnéto R', color: '#3b82f6', terminal: 'Bougies cyl. D', section: 'Allumage' },
  { id: 4, label: 'Bus avionic', color: '#a855f7', terminal: 'Panneau instruments', section: 'Avionique' },
  { id: 5, label: 'Éclairage nav', color: '#ec4899', terminal: 'Disjoncteur feux', section: 'Éclairage' },
  { id: 6, label: 'Pitot chauff.', color: '#06b6d4', terminal: 'Sonde Pitot', section: 'Instruments' },
  { id: 7, label: 'Démarreur', color: '#84cc16', terminal: 'Moteur starter', section: 'Puissance' },
];

function CablageGame({ onComplete }: { onComplete: (s: GameScore) => void }) {
  const TIME_LIMIT = 55;

  const [shuffledTerminals, setShuffledTerminals] = useState<number[]>([]);
  const [connections, setConnections] = useState<Map<number, number>>(new Map());
  const [selectedWire, setSelectedWire] = useState<number | null>(null);
  const [submitted, setSubmitted] = useState(false);
  const [timeLeft, setTimeLeft] = useState(TIME_LIMIT);
  const startTime = useRef(Date.now());
  const finishedRef = useRef(false);
  const wireRefs = useRef<Map<number, HTMLButtonElement | null>>(new Map());
  const termRefs = useRef<Map<number, HTMLButtonElement | null>>(new Map());
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const order = WIRE_DEFS.map((_, i) => i).sort(() => Math.random() - 0.5);
    setShuffledTerminals(order);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (submitted) return;
    const timer = setInterval(() => {
      setTimeLeft(prev => {
        if (prev <= 1) { clearInterval(timer); doSubmit(); return 0; }
        return prev - 1;
      });
    }, 1000);
    return () => clearInterval(timer);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [submitted]);

  function doSubmit() {
    if (finishedRef.current) return;
    finishedRef.current = true;
    setSubmitted(true);
    let correct = 0;
    connections.forEach((terminalIdx, wireId) => {
      if (shuffledTerminals[terminalIdx] === wireId) correct++;
    });
    const baseScore = Math.round((correct / WIRE_DEFS.length) * 100);
    const duration = Math.round((Date.now() - startTime.current) / 1000);
    const speedBonus = duration < 25 ? 10 : duration < 40 ? 5 : 0;
    onComplete({ type_jeu: 'cablage', score: Math.min(100, baseScore + speedBonus), duree_secondes: Math.max(duration, 8) });
  }

  function handleWireClick(wireId: number) {
    if (submitted) return;
    setSelectedWire(prev => prev === wireId ? null : wireId);
  }

  function handleTerminalClick(terminalIdx: number) {
    if (submitted || selectedWire === null) return;
    setConnections(prev => {
      const next = new Map(prev);
      for (const [k, v] of Array.from(next.entries())) {
        if (v === terminalIdx) next.delete(k);
      }
      next.set(selectedWire, terminalIdx);
      return next;
    });
    setSelectedWire(null);
  }

  function getLineCoords(wireId: number, termIdx: number): { x1: number; y1: number; x2: number; y2: number } | null {
    const container = containerRef.current;
    const wEl = wireRefs.current.get(wireId);
    const tEl = termRefs.current.get(termIdx);
    if (!container || !wEl || !tEl) return null;
    const cRect = container.getBoundingClientRect();
    const wRect = wEl.getBoundingClientRect();
    const tRect = tEl.getBoundingClientRect();
    return {
      x1: wRect.right - cRect.left,
      y1: wRect.top + wRect.height / 2 - cRect.top,
      x2: tRect.left - cRect.left,
      y2: tRect.top + tRect.height / 2 - cRect.top,
    };
  }

  const timerPct = (timeLeft / TIME_LIMIT) * 100;
  const allConnected = connections.size === WIRE_DEFS.length;

  return (
    <div className="space-y-3 max-w-5xl">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-bold text-slate-100 flex items-center gap-2"><Zap className="h-5 w-5 text-yellow-400" />Câblage Électrique</h2>
        <div className="flex items-center gap-3">
          <span className="text-xs text-slate-400">{connections.size}/{WIRE_DEFS.length}</span>
          <span className={`text-sm font-bold ${timeLeft <= 15 ? 'text-red-400 animate-pulse' : 'text-slate-300'}`}>{timeLeft}s</span>
        </div>
      </div>

      <div className="w-full h-1.5 rounded-full bg-slate-700 overflow-hidden">
        <div className={`h-full rounded-full transition-all duration-1000 ${timeLeft <= 15 ? 'bg-red-500' : timeLeft <= 30 ? 'bg-amber-500' : 'bg-yellow-500'}`}
          style={{ width: `${timerPct}%` }} />
      </div>

      <p className="text-slate-400 text-xs">Connectez les 8 fils aux bons terminaux. Cliquez un fil puis son terminal.</p>

      <div ref={containerRef} className="relative grid grid-cols-[minmax(0,1fr)_110px_minmax(0,1fr)] gap-2 items-start">
        {/* Left: wires */}
        <div className="space-y-1">
          <p className="text-[10px] text-slate-600 font-medium mb-1">FILS</p>
          {WIRE_DEFS.map(w => {
            const isSelected = selectedWire === w.id;
            const isConnected = connections.has(w.id);
            const connTermIdx = connections.get(w.id);
            const isCorrect = submitted && connTermIdx !== undefined && shuffledTerminals[connTermIdx] === w.id;
            const isWrong = submitted && connTermIdx !== undefined && shuffledTerminals[connTermIdx] !== w.id;
            return (
              <button key={w.id} ref={el => { wireRefs.current.set(w.id, el); }}
                onClick={() => handleWireClick(w.id)} disabled={submitted}
                className={`w-full min-h-8 p-1.5 rounded-lg border text-left text-[11px] transition flex items-center gap-1.5 ${
                  isCorrect ? 'border-emerald-500 bg-emerald-900/20' :
                  isWrong ? 'border-red-500 bg-red-900/20' :
                  isSelected ? 'border-amber-400 bg-amber-900/20 ring-1 ring-amber-400 scale-[1.02]' :
                  isConnected ? 'border-slate-500 bg-slate-700/50' :
                  'border-slate-600/50 bg-slate-800/80 hover:bg-slate-700'
                }`}>
                <span className="w-2.5 h-2.5 rounded-full flex-shrink-0 ring-1 ring-white/20" style={{ backgroundColor: w.color }} />
                <span className="text-slate-200 truncate" title={w.label}>{w.label}</span>
                <span className="text-[9px] text-slate-600 ml-auto">{w.section}</span>
              </button>
            );
          })}
        </div>

        {/* Center: SVG lines */}
        <svg className="w-full h-full absolute inset-0 pointer-events-none" style={{ zIndex: 1 }}>
          {Array.from(connections.entries()).map(([wireId, termIdx]) => {
            const coords = getLineCoords(wireId, termIdx);
            if (!coords) return null;
            const wire = WIRE_DEFS[wireId];
            const isCorrect = submitted && shuffledTerminals[termIdx] === wireId;
            const isWrong = submitted && shuffledTerminals[termIdx] !== wireId;
            return (
              <line key={`${wireId}-${termIdx}`}
                x1={coords.x1} y1={coords.y1} x2={coords.x2} y2={coords.y2}
                stroke={isCorrect ? '#22c55e' : isWrong ? '#ef4444' : wire.color}
                strokeWidth={isCorrect || isWrong ? 2.5 : 1.5}
                strokeDasharray={isWrong ? '4 3' : 'none'}
                opacity={0.7} />
            );
          })}
        </svg>

        {/* Right: terminals */}
        <div className="space-y-1">
          <p className="text-[10px] text-slate-600 font-medium mb-1">TERMINAUX</p>
          {shuffledTerminals.map((wireId, idx) => {
            const terminal = WIRE_DEFS[wireId];
            const connectedWireId = Array.from(connections.entries()).find(([, v]) => v === idx)?.[0];
            const hasConnection = connectedWireId !== undefined;
            const isCorrect = submitted && connectedWireId === wireId;
            const isWrong = submitted && hasConnection && connectedWireId !== wireId;
            const missed = submitted && !hasConnection;
            return (
              <button key={idx} ref={el => { termRefs.current.set(idx, el); }}
                onClick={() => handleTerminalClick(idx)} disabled={submitted}
                className={`w-full min-h-8 p-1.5 rounded-lg border text-left text-[11px] transition ${
                  isCorrect ? 'border-emerald-500 bg-emerald-900/20' :
                  isWrong ? 'border-red-500 bg-red-900/20' :
                  missed ? 'border-orange-500/40 bg-orange-900/10' :
                  hasConnection ? 'border-slate-500 bg-slate-700/50' :
                  selectedWire !== null ? 'border-amber-600/50 bg-slate-800 hover:bg-amber-900/10 cursor-pointer ring-1 ring-amber-600/20' :
                  'border-slate-600/50 bg-slate-800/80'
                }`}>
                <span className="text-slate-300 truncate block" title={terminal.terminal}>{terminal.terminal}</span>
                {hasConnection && (
                  <span className="text-[9px] mt-0.5 block truncate" style={{ color: WIRE_DEFS[connectedWireId].color }}>
                    ← {WIRE_DEFS[connectedWireId].label}
                  </span>
                )}
              </button>
            );
          })}
        </div>
      </div>

      <div className="flex items-center gap-3">
        {!submitted && allConnected && (
          <button onClick={doSubmit} className="px-6 py-2 rounded-lg bg-yellow-600 text-white font-medium flex items-center gap-2 hover:bg-yellow-500">
            <Check className="h-4 w-4" /> Valider le câblage
          </button>
        )}
        {!submitted && !allConnected && (
          <p className="text-xs text-slate-500">{connections.size}/{WIRE_DEFS.length} connexions — {selectedWire !== null ? `Fil "${WIRE_DEFS[selectedWire].label}" sélectionné, cliquez un terminal` : 'Sélectionnez un fil'}</p>
        )}
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════
// JEU 6 : CIRCUIT HYDRAULIQUE
// ═══════════════════════════════════════════════

interface HydLeak { id: number; position: number; severity: number; sealedUntil: number }

function HydrauliqueGame({ onComplete }: { onComplete: (s: GameScore) => void }) {
  const DURATION = 35;
  const TARGET_PRESSURE = 75;
  const GREEN_RANGE = 12;
  const BASE_LEAK = 0.3;
  const PUMP_AMOUNT = 2.5;
  const MAX_PRESSURE = 110;

  const [pressure, setPressure] = useState(TARGET_PRESSURE);
  const [timeLeft, setTimeLeft] = useState(DURATION);
  const [running, setRunning] = useState(false);
  const [finished, setFinished] = useState(false);
  const [pumping, setPumping] = useState(false);
  const [leaks, setLeaks] = useState<HydLeak[]>([]);
  const [leaksSealed, setLeaksSealed] = useState(0);
  const [liveScore, setLiveScore] = useState(100);
  const pressureRef = useRef(TARGET_PRESSURE);
  const inGreenFrames = useRef(0);
  const totalFrames = useRef(0);
  const startTime = useRef(0);
  const pumpingRef = useRef(false);
  const animRef = useRef(0);
  const leaksRef = useRef<HydLeak[]>([]);
  const nextLeakId = useRef(0);

  useEffect(() => { pressureRef.current = pressure; }, [pressure]);
  useEffect(() => { pumpingRef.current = pumping; }, [pumping]);
  useEffect(() => { leaksRef.current = leaks; }, [leaks]);

  function sealLeak(leakId: number) {
    setLeaks(prev => prev.map(l => l.id === leakId ? { ...l, sealedUntil: Date.now() + 5000 } : l));
    setLeaksSealed(prev => prev + 1);
  }

  const tick = useCallback(() => {
    if (!running || finished) return;
    const now = Date.now();
    const elapsed = (now - startTime.current) / 1000;
    const t = now / 1000;

    const difficultyMult = 1 + elapsed / DURATION;
    const activeLeaks = leaksRef.current.filter(l => l.sealedUntil < now);
    const leakExtra = activeLeaks.reduce((sum, l) => sum + l.severity * 0.15, 0);
    const totalLeak = (BASE_LEAK * difficultyMult + leakExtra);

    const jitter = Math.sin(t * 2.5) * 0.2;
    let newP = pressureRef.current - totalLeak + jitter;
    if (pumpingRef.current) newP += PUMP_AMOUNT;
    newP = Math.max(0, Math.min(MAX_PRESSURE, newP));
    pressureRef.current = newP;
    setPressure(newP);

    totalFrames.current++;
    if (Math.abs(newP - TARGET_PRESSURE) <= GREEN_RANGE) inGreenFrames.current++;
    if (totalFrames.current > 0) {
      setLiveScore(Math.round((inGreenFrames.current / totalFrames.current) * 100));
    }

    if (Math.random() < 0.003 * difficultyMult && leaksRef.current.filter(l => l.sealedUntil < now).length < 3) {
      const newLeak: HydLeak = {
        id: nextLeakId.current++,
        position: 10 + Math.random() * 80,
        severity: 1 + Math.floor(Math.random() * 3),
        sealedUntil: 0,
      };
      setLeaks(prev => [...prev, newLeak]);
    }

    animRef.current = requestAnimationFrame(tick);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [running, finished]);

  useEffect(() => {
    if (running && !finished) animRef.current = requestAnimationFrame(tick);
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
            ? Math.round((inGreenFrames.current / totalFrames.current) * 100) : 50;
          const duration = Math.round((Date.now() - startTime.current) / 1000);
          onComplete({ type_jeu: 'hydraulique', score, duree_secondes: Math.max(duration, 12) });
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

  const greenStart = ((TARGET_PRESSURE - GREEN_RANGE) / MAX_PRESSURE) * 100;
  const greenWidth = ((GREEN_RANGE * 2) / MAX_PRESSURE) * 100;
  const needlePos = (pressure / MAX_PRESSURE) * 100;
  const inGreen = Math.abs(pressure - TARGET_PRESSURE) <= GREEN_RANGE;
  const dangerHigh = pressure > TARGET_PRESSURE + GREEN_RANGE * 1.5;
  const dangerLow = pressure < TARGET_PRESSURE - GREEN_RANGE * 1.5;
  const timerPct = (timeLeft / DURATION) * 100;
  const activeLeakCount = leaks.filter(l => l.sealedUntil < Date.now()).length;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-bold text-slate-100 flex items-center gap-2"><Droplets className="h-5 w-5 text-blue-400" />Circuit Hydraulique</h2>
        <div className="flex items-center gap-3">
          <span className={`text-sm font-mono ${liveScore >= 70 ? 'text-emerald-400' : liveScore >= 40 ? 'text-amber-400' : 'text-red-400'}`}>{liveScore}%</span>
          <span className={`text-lg font-bold ${timeLeft <= 10 ? 'text-red-400 animate-pulse' : 'text-slate-300'}`}>{timeLeft}s</span>
        </div>
      </div>

      <div className="w-full h-1.5 rounded-full bg-slate-700 overflow-hidden">
        <div className={`h-full rounded-full transition-all duration-1000 ${timeLeft <= 10 ? 'bg-red-500' : 'bg-blue-500'}`}
          style={{ width: `${timerPct}%` }} />
      </div>

      <p className="text-slate-400 text-sm">
        Pompez pour maintenir la pression dans la zone verte. Colmatez les fuites qui apparaissent !
      </p>

      {!running && !finished && (
        <button onClick={start} className="px-6 py-3 rounded-lg bg-blue-600 text-white font-medium text-lg flex items-center gap-2 mx-auto hover:bg-blue-500">
          <Droplets className="h-5 w-5" /> Démarrer le circuit
        </button>
      )}

      {(running || finished) && (
        <div className="space-y-4">
          {/* Pressure gauge */}
          <div className="space-y-1.5">
            <div className="flex justify-between text-sm">
              <span className={inGreen ? 'text-emerald-300 font-medium' : dangerHigh ? 'text-red-300 font-medium' : dangerLow ? 'text-orange-300 font-medium' : 'text-amber-300'}>
                {Math.round(pressure)} PSI
                {dangerHigh && ' ⚠ SURPRESSION'}
                {dangerLow && ' ⚠ SOUS-PRESSION'}
              </span>
              <span className="text-slate-500 text-xs">Cible: {TARGET_PRESSURE} PSI</span>
            </div>
            <div className="relative h-10 rounded-lg bg-slate-700/80 overflow-hidden border border-slate-600/50">
              <div className="absolute h-full bg-red-600/10" style={{ left: '0%', width: `${greenStart}%` }} />
              <div className="absolute h-full bg-emerald-600/15" style={{ left: `${greenStart}%`, width: `${greenWidth}%` }} />
              <div className="absolute h-full bg-red-600/10" style={{ left: `${greenStart + greenWidth}%`, width: `${100 - greenStart - greenWidth}%` }} />
              <div className={`absolute top-1 bottom-1 w-3 rounded-sm transition-all shadow-lg ${
                inGreen ? 'bg-emerald-400' : dangerHigh ? 'bg-red-400' : 'bg-orange-400'
              }`} style={{ left: `calc(${Math.max(0, Math.min(100, needlePos))}% - 6px)` }} />
            </div>
          </div>

          {/* Pipe with leaks */}
          <div className="relative h-16 rounded-xl bg-slate-800/60 border border-slate-700/50 overflow-hidden">
            <div className="absolute top-1/2 left-0 right-0 h-4 bg-gradient-to-r from-blue-900/40 via-blue-800/30 to-blue-900/40 -translate-y-1/2 rounded" />
            <div className="absolute top-1/2 left-0 h-2 bg-blue-500/30 -translate-y-1/2 rounded transition-all"
              style={{ width: `${needlePos}%` }} />

            {leaks.filter(l => l.sealedUntil < Date.now()).map(leak => (
              <button key={leak.id} onClick={() => !finished && sealLeak(leak.id)}
                className="absolute top-1/2 -translate-y-1/2 -translate-x-1/2 cursor-pointer group"
                style={{ left: `${leak.position}%` }}>
                <span className="relative flex h-6 w-6">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-40" />
                  <span className={`relative inline-flex items-center justify-center rounded-full h-6 w-6 text-[10px] font-bold text-white group-hover:scale-110 transition ${
                    leak.severity >= 3 ? 'bg-red-600' : leak.severity >= 2 ? 'bg-orange-500' : 'bg-amber-500'
                  }`}>
                    {'!'.repeat(leak.severity)}
                  </span>
                </span>
              </button>
            ))}

            {activeLeakCount === 0 && running && (
              <span className="absolute top-1 right-2 text-[10px] text-emerald-500">Aucune fuite</span>
            )}
          </div>

          <div className="flex items-center gap-2 text-xs text-slate-500">
            <span>Fuites colmatées : {leaksSealed}</span>
            <span>•</span>
            <span>Fuites actives : <span className={activeLeakCount > 0 ? 'text-red-400 font-medium' : 'text-emerald-400'}>{activeLeakCount}</span></span>
          </div>

          {/* Pump button */}
          {!finished && (
            <button
              onMouseDown={() => setPumping(true)}
              onMouseUp={() => setPumping(false)}
              onMouseLeave={() => setPumping(false)}
              onTouchStart={() => setPumping(true)}
              onTouchEnd={() => setPumping(false)}
              className={`w-full py-5 rounded-xl text-lg font-bold transition-all select-none border ${
                pumping
                  ? 'bg-blue-500 text-white scale-[0.97] shadow-inner border-blue-400'
                  : 'bg-blue-700/80 text-blue-100 hover:bg-blue-600 shadow-lg border-blue-600/50'
              }`}>
              {pumping ? '💧 POMPAGE EN COURS...' : '⬇ MAINTENIR POUR POMPER'}
            </button>
          )}
        </div>
      )}
    </div>
  );
}

// ═══════════════════════════════════════════════
// JEU 7 : SOUDURE DE PRÉCISION
// ═══════════════════════════════════════════════

function SoudureGame({ onComplete }: { onComplete: (s: GameScore) => void }) {
  const CANVAS_W = 440;
  const CANVAS_H = 320;
  const TOLERANCE = 18;
  const NUM_POINTS = 12;
  const TIME_LIMIT = 40;
  const HEAT_PER_CLICK = 15;
  const HEAT_DECAY = 0.3;
  const OVERHEAT_THRESHOLD = 90;

  const [pathPoints] = useState(() => {
    const pts: { x: number; y: number }[] = [];
    for (let i = 0; i < NUM_POINTS; i++) {
      const baseX = 35 + (i / (NUM_POINTS - 1)) * (CANVAS_W - 70);
      const baseY = CANVAS_H / 2;
      const wave = Math.sin((i / NUM_POINTS) * Math.PI * 2.5) * 80;
      const jitter = (Math.random() - 0.5) * 30;
      pts.push({ x: baseX + (Math.random() - 0.5) * 20, y: Math.max(40, Math.min(CANVAS_H - 40, baseY + wave + jitter)) });
    }
    return pts;
  });

  const [userClicks, setUserClicks] = useState<{ x: number; y: number }[]>([]);
  const [currentTarget, setCurrentTarget] = useState(0);
  const [submitted, setSubmitted] = useState(false);
  const [started, setStarted] = useState(false);
  const [heat, setHeat] = useState(0);
  const [overheated, setOverheated] = useState(false);
  const [timeLeft, setTimeLeft] = useState(TIME_LIMIT);
  const startTime = useRef(Date.now());
  const svgRef = useRef<SVGSVGElement>(null);
  const heatRef = useRef(0);
  const finishedRef = useRef(false);

  useEffect(() => {
    if (!started || submitted) return;
    const interval = setInterval(() => {
      heatRef.current = Math.max(0, heatRef.current - HEAT_DECAY);
      setHeat(heatRef.current);
      if (heatRef.current < OVERHEAT_THRESHOLD && overheated) setOverheated(false);
    }, 50);
    return () => clearInterval(interval);
  }, [started, submitted, overheated]);

  useEffect(() => {
    if (!started || submitted) return;
    const timer = setInterval(() => {
      setTimeLeft(prev => {
        if (prev <= 1) { clearInterval(timer); finishGame([...userClicks]); return 0; }
        return prev - 1;
      });
    }, 1000);
    return () => clearInterval(timer);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [started, submitted]);

  function handleClick(e: React.MouseEvent<SVGSVGElement>) {
    if (submitted || finishedRef.current || overheated) return;
    if (!started) { setStarted(true); startTime.current = Date.now(); }
    if (currentTarget >= pathPoints.length) return;

    heatRef.current = Math.min(100, heatRef.current + HEAT_PER_CLICK);
    setHeat(heatRef.current);
    if (heatRef.current >= OVERHEAT_THRESHOLD) {
      setOverheated(true);
      return;
    }

    const svg = svgRef.current;
    if (!svg) return;
    const rect = svg.getBoundingClientRect();
    const x = (e.clientX - rect.left) * (CANVAS_W / rect.width);
    const y = (e.clientY - rect.top) * (CANVAS_H / rect.height);

    const newClicks = [...userClicks, { x, y }];
    setUserClicks(newClicks);
    const next = currentTarget + 1;
    setCurrentTarget(next);
    if (next >= pathPoints.length) finishGame(newClicks);
  }

  function finishGame(clicks: { x: number; y: number }[]) {
    if (finishedRef.current) return;
    finishedRef.current = true;
    setSubmitted(true);
    let totalDist = 0;
    let perfectCount = 0;
    clicks.forEach((click, i) => {
      if (i < pathPoints.length) {
        const dist = Math.sqrt((click.x - pathPoints[i].x) ** 2 + (click.y - pathPoints[i].y) ** 2);
        totalDist += dist;
        if (dist <= TOLERANCE * 0.5) perfectCount++;
      }
    });
    const completed = clicks.length;
    const completionRatio = completed / NUM_POINTS;
    const avgDist = completed > 0 ? totalDist / completed : TOLERANCE * 2;
    const accuracy = Math.max(0, 100 - (avgDist / TOLERANCE) * 40);
    const perfectBonus = perfectCount * 3;
    const duration = Math.round((Date.now() - startTime.current) / 1000);
    const score = Math.min(100, Math.max(0, Math.round(accuracy * completionRatio + perfectBonus)));
    onComplete({ type_jeu: 'soudure', score, duree_secondes: Math.max(duration, 10) });
  }

  const pathD = pathPoints.length > 1
    ? pathPoints.reduce((d, pt, i) => {
        if (i === 0) return `M ${pt.x} ${pt.y}`;
        const prev = pathPoints[i - 1];
        const cpx = (prev.x + pt.x) / 2;
        return `${d} Q ${prev.x + (cpx - prev.x) * 0.5 + (Math.random() - 0.5) * 10} ${prev.y} ${cpx} ${(prev.y + pt.y) / 2} T ${pt.x} ${pt.y}`;
      }, '')
    : '';

  const weldTrail = userClicks.length > 1
    ? userClicks.reduce((d, pt, i) => i === 0 ? `M ${pt.x} ${pt.y}` : `${d} L ${pt.x} ${pt.y}`, '')
    : '';

  const heatColor = heat > 80 ? '#ef4444' : heat > 50 ? '#f59e0b' : heat > 25 ? '#eab308' : '#22c55e';
  const timerPct = (timeLeft / TIME_LIMIT) * 100;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-bold text-slate-100 flex items-center gap-2"><Flame className="h-5 w-5 text-orange-400" />Soudure de Précision</h2>
        <div className="flex items-center gap-3">
          <span className="text-xs text-slate-400">{currentTarget}/{NUM_POINTS}</span>
          <span className={`text-sm font-bold ${timeLeft <= 10 ? 'text-red-400 animate-pulse' : 'text-slate-300'}`}>{timeLeft}s</span>
        </div>
      </div>

      <div className="w-full h-1.5 rounded-full bg-slate-700 overflow-hidden">
        <div className={`h-full rounded-full transition-all duration-1000 ${timeLeft <= 10 ? 'bg-red-500' : 'bg-orange-500'}`}
          style={{ width: `${timerPct}%` }} />
      </div>

      {/* Heat meter */}
      <div className="flex items-center gap-2">
        <Flame className="h-4 w-4" style={{ color: heatColor }} />
        <div className="flex-1 h-3 rounded-full bg-slate-700/80 overflow-hidden border border-slate-600/50">
          <div className="h-full rounded-full transition-all" style={{ width: `${heat}%`, backgroundColor: heatColor }} />
        </div>
        <span className="text-xs w-10 text-right" style={{ color: heatColor }}>{Math.round(heat)}°</span>
      </div>

      {overheated && (
        <div className="rounded-lg bg-red-900/30 border border-red-700/50 p-2 text-center animate-pulse">
          <p className="text-red-300 text-sm font-medium">⚠ SURCHAUFFE — Attendez le refroidissement !</p>
        </div>
      )}

      <p className="text-slate-400 text-sm">
        Soudez chaque point dans l&apos;ordre. Précision et gestion de chaleur requises !
        {!started && ' Cliquez pour commencer.'}
      </p>

      <div className="rounded-xl border border-slate-700 bg-slate-900 overflow-hidden">
        <svg ref={svgRef} viewBox={`0 0 ${CANVAS_W} ${CANVAS_H}`}
          className={`w-full ${overheated ? 'cursor-not-allowed' : 'cursor-crosshair'}`}
          onClick={handleClick}>
          {/* Metal plate texture */}
          <defs>
            <pattern id="metalGrid" width="20" height="20" patternUnits="userSpaceOnUse">
              <line x1="0" y1="0" x2="20" y2="0" stroke="#334155" strokeWidth="0.3" />
              <line x1="0" y1="0" x2="0" y2="20" stroke="#334155" strokeWidth="0.3" />
            </pattern>
          </defs>
          <rect width={CANVAS_W} height={CANVAS_H} fill="url(#metalGrid)" />

          {/* Weld seam to follow */}
          <path d={pathD} stroke="#475569" strokeWidth="3" fill="none" strokeDasharray="8 4" opacity="0.6" />

          {/* User's weld trail */}
          {weldTrail && (
            <path d={weldTrail} stroke="#f97316" strokeWidth="2.5" fill="none" opacity="0.5" strokeLinecap="round" />
          )}

          {pathPoints.map((pt, i) => {
            const isDone = i < currentTarget;
            const isCurrent = i === currentTarget && !submitted;
            const userPt = userClicks[i];
            const dist = userPt ? Math.sqrt((userPt.x - pt.x) ** 2 + (userPt.y - pt.y) ** 2) : null;
            const isPerfect = dist !== null && dist <= TOLERANCE * 0.5;
            const isGood = dist !== null && dist <= TOLERANCE;

            return (
              <g key={i}>
                {isCurrent && (
                  <>
                    <circle cx={pt.x} cy={pt.y} r={TOLERANCE} fill="none" stroke="#f59e0b" strokeWidth="0.8" strokeDasharray="3 3" opacity="0.3" />
                    <circle cx={pt.x} cy={pt.y} r={TOLERANCE * 0.5} fill="none" stroke="#22c55e" strokeWidth="0.5" strokeDasharray="2 2" opacity="0.2" />
                  </>
                )}

                <circle cx={pt.x} cy={pt.y} r={isCurrent ? 7 : isDone ? 5 : 4}
                  fill={isDone ? (isPerfect ? '#22c55e' : isGood ? '#86efac' : '#ef4444') : isCurrent ? '#f59e0b' : '#475569'}
                  stroke={isCurrent ? '#fbbf24' : isDone && isPerfect ? '#4ade80' : 'none'}
                  strokeWidth={isCurrent || isPerfect ? 2 : 0}
                  opacity={isDone ? 1 : isCurrent ? 1 : 0.4} />

                {isCurrent && !submitted && (
                  <circle cx={pt.x} cy={pt.y} r="10" fill="none" stroke="#fbbf24" strokeWidth="1" opacity="0.5">
                    <animate attributeName="r" values="7;14;7" dur="1.2s" repeatCount="indefinite" />
                    <animate attributeName="opacity" values="0.5;0.1;0.5" dur="1.2s" repeatCount="indefinite" />
                  </circle>
                )}

                {isDone && userPt && (
                  <>
                    <circle cx={userPt.x} cy={userPt.y} r="3" fill={isPerfect ? '#fbbf24' : isGood ? '#86efac' : '#fca5a5'} />
                    {isPerfect && <text x={userPt.x} y={userPt.y - 8} textAnchor="middle" fontSize="8" fill="#fbbf24">★</text>}
                  </>
                )}

                <text x={pt.x} y={pt.y - (isCurrent ? 14 : 10)} textAnchor="middle" fontSize="8"
                  fill={isDone ? (isGood ? '#86efac' : '#fca5a5') : '#64748b'}>{i + 1}</text>
              </g>
            );
          })}
        </svg>
      </div>

      {submitted && (
        <div className="rounded-lg bg-slate-800/60 border border-slate-700 p-3 text-xs text-slate-400 space-y-1">
          <p>Points soudés : {userClicks.length}/{NUM_POINTS}</p>
          <p>Points parfaits (★) : {userClicks.filter((c, i) => i < pathPoints.length && Math.sqrt((c.x - pathPoints[i].x) ** 2 + (c.y - pathPoints[i].y) ** 2) <= TOLERANCE * 0.5).length}</p>
        </div>
      )}
    </div>
  );
}

// ═══════════════════════════════════════════════
// JEU 8 : DIAGNOSTIC TECHNIQUE
// ═══════════════════════════════════════════════

const DIAGNOSTIC_QUESTIONS: Array<{
  symptoms: string[];
  choices: string[];
  correct: number;
  severity: 'critique' | 'majeur' | 'mineur';
  explanation: string;
  system: string;
}> = [
  {
    system: 'Moteur',
    severity: 'majeur',
    symptoms: ['RPM instable au ralenti', 'Fumée noire à l\'échappement', 'Perte de puissance intermittente'],
    choices: ['Mélange air-carburant trop riche', 'Défaut capteur O2', 'Pompe à carburant défaillante', 'Filtre à air colmaté'],
    correct: 0,
    explanation: 'La fumée noire indique une combustion incomplète due à un excès de carburant. Le mélange trop riche cause l\'instabilité RPM et la perte de puissance.',
  },
  {
    system: 'Allumage',
    severity: 'majeur',
    symptoms: ['Vibrations moteur en croisière', 'Chute RPM sur un magnéto', 'Raté d\'allumage cyclique'],
    choices: ['Hélice déséquilibrée', 'Bougie encrassée ou défaillante', 'Carburateur givré', 'Roulement vilebrequin usé'],
    correct: 1,
    explanation: 'La chute RPM au check magnéto et les ratés cycliques pointent vers un problème d\'allumage. Une bougie encrassée ne produit pas d\'étincelle régulière.',
  },
  {
    system: 'Lubrification',
    severity: 'critique',
    symptoms: ['Température huile élevée', 'Pression huile basse', 'Cliquetis métallique au moteur'],
    choices: ['Niveau huile insuffisant', 'Radiateur obstrué', 'Joint de culasse fissuré', 'Turbo en surchauffe'],
    correct: 0,
    explanation: 'Pression basse + température haute + cliquetis = lubrification insuffisante. Le niveau d\'huile bas cause un manque de pression et une surchauffe par friction.',
  },
  {
    system: 'Électrique',
    severity: 'majeur',
    symptoms: ['Tension bus < 24V en vol', 'Instruments gyro erratiques', 'Annunciateur "ALT" allumé'],
    choices: ['Batterie en fin de vie', 'Alternateur ou régulateur défaillant', 'Court-circuit avionique', 'Fusible bus principal grillé'],
    correct: 1,
    explanation: 'L\'annunciateur ALT signale un défaut de charge. L\'alternateur ne compense plus la consommation, d\'où la chute de tension et les instruments instables.',
  },
  {
    system: 'Commandes',
    severity: 'mineur',
    symptoms: ['Commandes de vol dures', 'Bruit de grincement aux ailerons', 'Jeu excessif dans le manche'],
    choices: ['Câbles de commande distendus', 'Charnières et roulements grippés', 'Vérin hydraulique fuyant', 'Tab de trim bloqué'],
    correct: 1,
    explanation: 'Le grincement + dureté = friction mécanique. Des charnières grippées créent une résistance et le jeu provient de l\'usure des roulements.',
  },
  {
    system: 'Train d\'atterrissage',
    severity: 'critique',
    symptoms: ['Train ne se verrouille pas sorti', 'Voyant vert absent', 'Pression hydraulique normale'],
    choices: ['Vérin de train fuyant', 'Capteur fin de course défaillant', 'Pompe hydraulique faible', 'Sélecteur train défectueux'],
    correct: 1,
    explanation: 'La pression hydraulique est normale donc le système fonctionne. Le train est probablement sorti mais le capteur fin de course ne détecte pas la position verrouillée.',
  },
  {
    system: 'Aérodynamique',
    severity: 'critique',
    symptoms: ['Décrochage asymétrique', 'Aile qui tombe à gauche', 'Vitesse de décrochage plus haute que normale'],
    choices: ['Givrage sur bord d\'attaque gauche', 'Volets asymétriques', 'Trim aileron décalé', 'Poids mal réparti'],
    correct: 0,
    explanation: 'Le givrage modifie le profil aérodynamique du bord d\'attaque, réduisant la portance de l\'aile gauche. Cela augmente la Vs et cause un décrochage asymétrique.',
  },
  {
    system: 'Électrique',
    severity: 'majeur',
    symptoms: ['Odeur de brûlé dans le cockpit', 'Fumée légère derrière panneau', 'Disjoncteur qui saute'],
    choices: ['Surchauffe pitot', 'Court-circuit câblage électrique', 'Fuite liquide hydraulique sur échappement', 'Résistance chauffante pare-brise HS'],
    correct: 1,
    explanation: 'L\'odeur de brûlé + fumée derrière panneau + disjoncteur = court-circuit dans le câblage électrique du panneau instruments.',
  },
  {
    system: 'Carburant',
    severity: 'critique',
    symptoms: ['Moteur cale en montée', 'Débit carburant fluctuant', 'Pré-chauffage carbu inefficace'],
    choices: ['Eau dans le carburant', 'Filtre carburant obstrué', 'Pompe mécanique défaillante', 'Givrage carburateur sévère'],
    correct: 3,
    explanation: 'Le calage en montée (régime élevé, air froid) avec fluctuation de débit et échec du pré-chauffage indiquent un givrage carburateur avancé.',
  },
  {
    system: 'Instruments',
    severity: 'mineur',
    symptoms: ['Altimètre en retard', 'Vitesse indiquée erronée', 'Variomètre bloqué'],
    choices: ['Prise statique obstruée', 'Tube Pitot givré', 'Altimètre mal calé (QNH)', 'Fuite dans le circuit anémométrique'],
    correct: 0,
    explanation: 'Les trois instruments utilisent la prise statique. Son obstruction fige le variomètre et fausse altimètre et anémomètre simultanément.',
  },
  {
    system: 'Hélice',
    severity: 'majeur',
    symptoms: ['RPM ne monte pas au décollage', 'Levier hélice au plein petit pas', 'Vibrations basses fréquences'],
    choices: ['Régulateur d\'hélice bloqué', 'Câble de commande hélice cassé', 'Huile hélice trop froide', 'Moteur sous-puissant'],
    correct: 0,
    explanation: 'Le régulateur bloqué empêche le changement de pas. L\'hélice reste en grand pas, limitant les RPM au décollage avec des vibrations caractéristiques.',
  },
  {
    system: 'Pneumatique',
    severity: 'mineur',
    symptoms: ['Horizon artificiel lent à se caler', 'Directionnel dérive rapidement', 'Aspiration gyro faible'],
    choices: ['Pompe à vide usée', 'Filtre d\'aspiration colmaté', 'Gyroscopes en fin de vie', 'Fuite dans le circuit pneumatique'],
    correct: 0,
    explanation: 'Une pompe à vide usée ne génère pas assez de dépression pour faire tourner les gyroscopes à vitesse nominale, causant lenteur et dérive.',
  },
];

function DiagnosticGame({ onComplete }: { onComplete: (s: GameScore) => Promise<boolean> | boolean }) {
  const TOTAL_QUESTIONS = 6;
  const TIME_PER_Q = 20;

  const [questions] = useState(() => {
    const shuffled = [...DIAGNOSTIC_QUESTIONS].sort(() => Math.random() - 0.5);
    return shuffled.slice(0, TOTAL_QUESTIONS);
  });

  const [currentQ, setCurrentQ] = useState(0);
  const [answers, setAnswers] = useState<number[]>([]);
  const [selectedAnswer, setSelectedAnswer] = useState<number | null>(null);
  const [showResult, setShowResult] = useState(false);
  const [qTimeLeft, setQTimeLeft] = useState(TIME_PER_Q);
  const [timedOut, setTimedOut] = useState(false);
  const [finalScore, setFinalScore] = useState<GameScore | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const startTime = useRef(Date.now());
  const qTimerRef = useRef<ReturnType<typeof setInterval>>();
  const finishTimeoutRef = useRef<ReturnType<typeof setTimeout>>();
  const submittingRef = useRef(false);

  useEffect(() => {
    if (showResult) return;
    setQTimeLeft(TIME_PER_Q);
    setTimedOut(false);
    qTimerRef.current = setInterval(() => {
      setQTimeLeft(prev => {
        if (prev <= 1) {
          clearInterval(qTimerRef.current);
          setTimedOut(true);
          handleTimeout();
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
    return () => clearInterval(qTimerRef.current);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentQ, showResult]);

  useEffect(() => {
    return () => {
      clearInterval(qTimerRef.current);
      clearTimeout(finishTimeoutRef.current);
    };
  }, []);

  function handleTimeout() {
    setShowResult(true);
    const newAnswers = [...answers, -1];
    setAnswers(newAnswers);
    advanceAfterDelay(newAnswers);
  }

  function handleSelect(choiceIdx: number) {
    if (showResult || timedOut) return;
    setSelectedAnswer(choiceIdx);
  }

  function handleValidate() {
    if (selectedAnswer === null || showResult) return;
    clearInterval(qTimerRef.current);
    setShowResult(true);
    const newAnswers = [...answers, selectedAnswer];
    setAnswers(newAnswers);
    advanceAfterDelay(newAnswers);
  }

  async function finalizeDiagnostic(payload: GameScore) {
    if (submittingRef.current) return;
    submittingRef.current = true;
    setIsSubmitting(true);
    clearTimeout(finishTimeoutRef.current);
    const ok = await onComplete(payload);
    if (!ok) {
      submittingRef.current = false;
      setIsSubmitting(false);
    }
  }

  function advanceAfterDelay(newAnswers: number[]) {
    clearTimeout(finishTimeoutRef.current);
    finishTimeoutRef.current = setTimeout(() => {
      if (currentQ + 1 >= TOTAL_QUESTIONS) {
        let correct = 0;
        let speedBonus = 0;
        newAnswers.forEach((a, i) => {
          if (a === questions[i].correct) {
            correct++;
            speedBonus += 2;
          }
        });
        const score = Math.min(100, Math.round((correct / TOTAL_QUESTIONS) * 100 + speedBonus));
        const duration = Math.round((Date.now() - startTime.current) / 1000);
        const payload: GameScore = { type_jeu: 'diagnostic', score, duree_secondes: Math.max(duration, 8) };
        setFinalScore(payload);
        void finalizeDiagnostic(payload);
      } else {
        setCurrentQ(prev => prev + 1);
        setSelectedAnswer(null);
        setShowResult(false);
        setFinalScore(null);
      }
    }, 2500);
  }

  const q = questions[currentQ];
  if (!q) return null;

  const isCorrect = showResult && selectedAnswer === q.correct;
  const sevColor = q.severity === 'critique' ? 'text-red-400 bg-red-900/20 border-red-700/40' :
    q.severity === 'majeur' ? 'text-amber-400 bg-amber-900/20 border-amber-700/40' :
    'text-teal-400 bg-teal-900/20 border-teal-700/40';
  const qTimerPct = (qTimeLeft / TIME_PER_Q) * 100;
  const correctSoFar = answers.filter((a, i) => a === questions[i].correct).length;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-bold text-slate-100 flex items-center gap-2"><ClipboardCheck className="h-5 w-5 text-teal-400" />Diagnostic Technique</h2>
        <div className="flex items-center gap-3">
          <span className="text-xs text-emerald-400">{correctSoFar}/{answers.length}</span>
          <span className="text-sm text-slate-400">Q{currentQ + 1}/{TOTAL_QUESTIONS}</span>
        </div>
      </div>

      {/* Question timer */}
      <div className="w-full h-1.5 rounded-full bg-slate-700 overflow-hidden">
        <div className={`h-full rounded-full transition-all duration-1000 ${qTimeLeft <= 5 ? 'bg-red-500' : qTimeLeft <= 10 ? 'bg-amber-500' : 'bg-teal-500'}`}
          style={{ width: `${qTimerPct}%` }} />
      </div>

      {/* Question metadata */}
      <div className="flex items-center gap-2">
        <span className={`text-[10px] px-2 py-0.5 rounded-full border ${sevColor}`}>
          {q.severity.toUpperCase()}
        </span>
        <span className="text-[10px] text-slate-500 px-2 py-0.5 rounded-full border border-slate-700 bg-slate-800/50">
          {q.system}
        </span>
        <span className={`text-xs font-mono ml-auto ${qTimeLeft <= 5 ? 'text-red-400 animate-pulse' : 'text-slate-400'}`}>
          {qTimeLeft}s
        </span>
      </div>

      {/* Symptoms */}
      <div className="rounded-xl border border-slate-700 bg-slate-800/50 p-4 space-y-2">
        <p className="text-[10px] text-slate-500 font-medium uppercase tracking-wider">Symptômes relevés</p>
        <ul className="space-y-1.5">
          {q.symptoms.map((s, i) => (
            <li key={i} className="text-sm text-amber-300 flex items-start gap-2">
              <span className="text-amber-600 mt-0.5 flex-shrink-0">▸</span>{s}
            </li>
          ))}
        </ul>
      </div>

      {/* Choices */}
      <div className="space-y-2">
        <p className="text-[10px] text-slate-500 font-medium uppercase tracking-wider">Diagnostic probable</p>
        {q.choices.map((choice, i) => {
          const isSelected = selectedAnswer === i;
          const correctChoice = showResult && i === q.correct;
          const wrongChoice = showResult && isSelected && i !== q.correct;
          return (
            <button key={i} onClick={() => handleSelect(i)} disabled={showResult || timedOut}
              className={`w-full p-3 rounded-lg border text-left text-sm transition-all ${
                correctChoice ? 'border-emerald-500 bg-emerald-900/20 text-emerald-200 ring-1 ring-emerald-500/50' :
                wrongChoice ? 'border-red-500 bg-red-900/20 text-red-200' :
                isSelected ? 'border-teal-400 bg-teal-900/20 text-teal-200 ring-1 ring-teal-400' :
                'border-slate-600/60 bg-slate-800 text-slate-300 hover:bg-slate-700 hover:border-slate-500'
              }`}>
              <div className="flex items-center gap-2">
                <span className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold flex-shrink-0 ${
                  correctChoice ? 'bg-emerald-600 text-white' :
                  wrongChoice ? 'bg-red-600 text-white' :
                  isSelected ? 'bg-teal-600 text-white' :
                  'bg-slate-700 text-slate-400'
                }`}>{String.fromCharCode(65 + i)}</span>
                <span>{choice}</span>
              </div>
            </button>
          );
        })}
      </div>

      {/* Result + explanation */}
      {showResult && (
        <div className={`rounded-lg p-3 space-y-2 ${isCorrect ? 'bg-emerald-900/20 border border-emerald-700/30' : 'bg-red-900/20 border border-red-700/30'}`}>
          <p className={`text-sm font-medium ${isCorrect ? 'text-emerald-300' : timedOut ? 'text-amber-300' : 'text-red-300'}`}>
            {isCorrect ? '✓ Correct !' : timedOut ? '⏱ Temps écoulé !' : `✗ Incorrect — Réponse : ${q.choices[q.correct]}`}
          </p>
          <p className="text-xs text-slate-400 leading-relaxed">{q.explanation}</p>
          {finalScore && (
            <div className="pt-2 space-y-2">
              <p className="text-xs text-slate-300">
                Fin du QCM. Quittez ici pour enregistrer proprement le résultat sans revenir avec le navigateur.
              </p>
              <button
                onClick={() => void finalizeDiagnostic(finalScore)}
                disabled={isSubmitting}
                className="w-full rounded-lg bg-teal-600 px-4 py-2 text-sm font-medium text-white hover:bg-teal-500 disabled:opacity-60"
              >
                {isSubmitting ? 'Sauvegarde en cours...' : 'Terminer et revenir aux jeux'}
              </button>
            </div>
          )}
        </div>
      )}

      {/* Validate button */}
      {!showResult && !timedOut && selectedAnswer !== null && (
        <button onClick={handleValidate} className="px-6 py-2 rounded-lg bg-teal-600 text-white font-medium flex items-center gap-2 hover:bg-teal-500">
          <Check className="h-4 w-4" /> Valider
        </button>
      )}

      {/* Progress bar */}
      <div className="flex gap-1">
        {Array.from({ length: TOTAL_QUESTIONS }, (_, i) => {
          const answered = i < answers.length;
          const correct = answered && answers[i] === questions[i].correct;
          const timeout = answered && answers[i] === -1;
          return (
            <div key={i} className={`h-2 flex-1 rounded-full transition-all ${
              i === currentQ ? 'bg-teal-500' :
              correct ? 'bg-emerald-500' :
              timeout ? 'bg-amber-500' :
              answered ? 'bg-red-500' :
              'bg-slate-700'
            }`} />
          );
        })}
      </div>
    </div>
  );
}

function TestMoteurGame({ onComplete }: { onComplete: (s: GameScore) => void }) {
  const DURATION = 35;
  const ENGINE_PARAMS = [
    { name: 'RPM', min: 800, max: 3000, target: 2200, greenRange: 180, unit: 'RPM' },
    { name: 'Temp. EGT', min: 300, max: 900, target: 650, greenRange: 60, unit: '°C' },
    { name: 'Pression huile', min: 20, max: 100, target: 65, greenRange: 10, unit: 'PSI' },
    { name: 'Débit carburant', min: 10, max: 60, target: 38, greenRange: 6, unit: 'GPH' },
  ];

  const [sliders, setSliders] = useState(ENGINE_PARAMS.map(p => p.target));
  const [fluctuations, setFluctuations] = useState(ENGINE_PARAMS.map(() => 0));
  const [timeLeft, setTimeLeft] = useState(DURATION);
  const [running, setRunning] = useState(false);
  const [finished, setFinished] = useState(false);
  const [liveScore, setLiveScore] = useState(100);
  const [phase, setPhase] = useState<'idle' | 'warmup' | 'cruise' | 'stress'>('idle');
  const inGreenFrames = useRef(0);
  const totalFrames = useRef(0);
  const startTime = useRef(0);
  const animRef = useRef<number>(0);
  const slidersRef = useRef(ENGINE_PARAMS.map(p => p.target));

  useEffect(() => { slidersRef.current = sliders; }, [sliders]);

  const tick = useCallback(() => {
    if (!running || finished) return;

    const elapsed = (Date.now() - startTime.current) / 1000;
    const difficultyScale = 1 + (elapsed / DURATION) * 0.55;

    if (elapsed < 8) setPhase('warmup');
    else if (elapsed < 22) setPhase('cruise');
    else setPhase('stress');

    const newFluct = ENGINE_PARAMS.map((p, i) => {
      const t = Date.now() / 1000;
      const base = Math.sin(t * (1.3 + i * 0.6)) * (p.greenRange * 0.5 * difficultyScale) +
                   Math.cos(t * (2.1 + i * 0.4)) * (p.greenRange * 0.2 * difficultyScale);
      return base;
    });
    setFluctuations(newFluct);

    totalFrames.current++;
    const inGreenCount = ENGINE_PARAMS.reduce((acc, p, i) => {
      const actual = slidersRef.current[i] + newFluct[i];
      return acc + (Math.abs(actual - p.target) <= p.greenRange ? 1 : 0);
    }, 0);
    inGreenFrames.current += inGreenCount / ENGINE_PARAMS.length;
    if (totalFrames.current > 0) {
      setLiveScore(Math.round((inGreenFrames.current / totalFrames.current) * 100));
    }

    animRef.current = requestAnimationFrame(tick);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [running, finished]);

  useEffect(() => {
    if (running && !finished) animRef.current = requestAnimationFrame(tick);
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
            ? Math.round((inGreenFrames.current / totalFrames.current) * 100) : 50;
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

  const timerPct = (timeLeft / DURATION) * 100;
  const phaseLabel = phase === 'warmup' ? 'CHAUFFE' : phase === 'cruise' ? 'CROISIÈRE' : phase === 'stress' ? 'STRESS TEST' : '';
  const phaseColor = phase === 'warmup' ? 'text-amber-400' : phase === 'cruise' ? 'text-emerald-400' : phase === 'stress' ? 'text-red-400' : 'text-slate-400';

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-bold text-slate-100 flex items-center gap-2"><Gauge className="h-5 w-5 text-red-400" />Test Moteur</h2>
        <div className="flex items-center gap-3">
          {running && <span className={`text-xs font-medium ${phaseColor} px-2 py-0.5 rounded-full border border-current/30`}>{phaseLabel}</span>}
          <span className={`text-sm font-mono ${liveScore >= 70 ? 'text-emerald-400' : liveScore >= 40 ? 'text-amber-400' : 'text-red-400'}`}>{liveScore}%</span>
          <span className={`text-lg font-bold ${timeLeft <= 10 ? 'text-red-400 animate-pulse' : 'text-slate-300'}`}>{timeLeft}s</span>
        </div>
      </div>

      <div className="w-full h-1.5 rounded-full bg-slate-700 overflow-hidden">
        <div className={`h-full rounded-full transition-all duration-1000 ${timeLeft <= 10 ? 'bg-red-500' : 'bg-red-400'}`}
          style={{ width: `${timerPct}%` }} />
      </div>

      <p className="text-slate-400 text-sm">
        Maintenez les 4 paramètres moteur dans la zone verte. La difficulté augmente progressivement !
      </p>

      {!running && !finished && (
        <button onClick={start} className="px-6 py-3 rounded-lg bg-red-600 text-white font-medium text-lg flex items-center gap-2 mx-auto hover:bg-red-500">
          <Gauge className="h-5 w-5" /> Démarrer le test
        </button>
      )}

      {(running || finished) && (
        <div className="space-y-4">
          {ENGINE_PARAMS.map((p, i) => {
            const actual = sliders[i] + fluctuations[i];
            const inGreen = Math.abs(actual - p.target) <= p.greenRange;
            const veryClose = Math.abs(actual - p.target) <= p.greenRange * 0.3;
            const range = p.max - p.min;
            const normalizedActual = ((actual - p.min) / range) * 100;
            const greenStart = ((p.target - p.greenRange - p.min) / range) * 100;
            const greenWidth = ((p.greenRange * 2) / range) * 100;

            return (
              <div key={p.name} className="space-y-1">
                <div className="flex justify-between text-xs">
                  <span className={`font-medium ${veryClose ? 'text-emerald-300' : inGreen ? 'text-emerald-400/70' : 'text-red-300'}`}>
                    {p.name}
                    {veryClose && ' ✓'}
                  </span>
                  <span className="text-slate-500 font-mono">{Math.round(actual)} <span className="text-slate-600">/ {p.target} {p.unit}</span></span>
                </div>
                <div className={`relative h-8 rounded-lg bg-slate-700/80 overflow-hidden border transition-colors ${
                  inGreen ? 'border-emerald-700/30' : 'border-red-700/30'
                }`}>
                  <div className="absolute h-full bg-red-600/5" style={{ left: '0%', width: `${greenStart}%` }} />
                  <div className="absolute h-full bg-emerald-600/10" style={{ left: `${greenStart}%`, width: `${greenWidth}%` }} />
                  <div className="absolute h-full bg-red-600/5" style={{ left: `${greenStart + greenWidth}%`, width: `${100 - greenStart - greenWidth}%` }} />
                  <div className={`absolute top-1 bottom-1 w-2.5 rounded-sm transition-all shadow-md ${
                    veryClose ? 'bg-emerald-300' : inGreen ? 'bg-emerald-400' : 'bg-red-400'
                  }`} style={{ left: `calc(${Math.max(0, Math.min(100, normalizedActual))}% - 5px)` }} />
                  <input type="range" min={p.min} max={p.max} step={(range / 300)} value={sliders[i]} disabled={finished}
                    onChange={e => setSliders(prev => { const n = [...prev]; n[i] = Number(e.target.value); return n; })}
                    className="absolute inset-0 w-full h-full opacity-0 cursor-pointer" />
                </div>
              </div>
            );
          })}

          {/* Engine status indicator */}
          <div className={`rounded-lg p-2 text-center text-xs border transition-colors ${
            liveScore >= 80 ? 'bg-emerald-900/10 border-emerald-700/30 text-emerald-400' :
            liveScore >= 50 ? 'bg-amber-900/10 border-amber-700/30 text-amber-400' :
            'bg-red-900/10 border-red-700/30 text-red-400'
          }`}>
            {liveScore >= 80 ? 'Moteur nominal — Tous paramètres en zone verte' :
             liveScore >= 50 ? 'Paramètres instables — Corrections nécessaires' :
             'Conditions moteur critiques — Attention !'}
          </div>
        </div>
      )}
    </div>
  );
}
