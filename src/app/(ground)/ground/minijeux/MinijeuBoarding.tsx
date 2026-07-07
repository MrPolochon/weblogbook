'use client';

import { useState, useEffect, useMemo, useCallback } from 'react';
import { calculerScoreBoarding, getDureeBoarding, BOARDING_CLASS_COLORS } from '@/lib/ground/minigames';

interface Carte {
  id: number;
  classe: 'vip' | 'business' | 'premium' | 'economy';
  nom: string;
  siege: string;
  row: number;
  vip: boolean;
}

interface Props {
  paxCount: number;
  onFinish: (score: number) => void;
}

type Classe = 'vip' | 'business' | 'premium' | 'economy';

const ORDRE_CLASSES: Classe[] = ['vip', 'business', 'premium', 'economy'];

const CLASS_LABELS: Record<Classe, string> = {
  vip:      'VIP ⭐',
  business: 'Business Class',
  premium:  'Premium Economy',
  economy:  'Economy',
};

const CLASS_COLORS: Record<Classe, string> = {
  vip:      'bg-yellow-500/20 text-yellow-200 border-yellow-500/40',
  business: BOARDING_CLASS_COLORS.business,
  premium:  BOARDING_CLASS_COLORS.premium,
  economy:  BOARDING_CLASS_COLORS.economy,
};

const NOMS = ['MARTIN', 'DURAND', 'PETIT', 'SIMON', 'BLANC', 'GARCIA', 'THOMAS', 'ROBERT', 'LEROY', 'RICHARD', 'LEBLANC', 'DUPONT', 'MOREAU', 'FAURE', 'GIRARD'];

function genererCartesAvecVIP(paxCount: number): Carte[] {
  const nbVIP      = Math.min(2, Math.max(1, Math.floor(paxCount * 0.05)));
  const nbBusiness = Math.max(1, Math.floor(paxCount * 0.1));
  const nbPremium  = Math.max(1, Math.floor(paxCount * 0.2));
  const nbEconomy  = paxCount - nbVIP - nbBusiness - nbPremium;

  const cartes: Carte[] = [];
  let id = 0;

  for (let i = 0; i < nbVIP; i++) {
    cartes.push({ id: id++, classe: 'vip', nom: NOMS[id % NOMS.length], siege: `1${String.fromCharCode(65 + i)}`, row: 1, vip: true });
  }
  for (let i = 0; i < nbBusiness; i++) {
    cartes.push({ id: id++, classe: 'business', nom: NOMS[id % NOMS.length], siege: `${2 + i}${String.fromCharCode(65 + (i % 6))}`, row: 2 + i, vip: false });
  }
  for (let i = 0; i < nbPremium; i++) {
    cartes.push({ id: id++, classe: 'premium', nom: NOMS[id % NOMS.length], siege: `${10 + i}${String.fromCharCode(65 + (i % 6))}`, row: 10 + i, vip: false });
  }
  for (let i = 0; i < nbEconomy; i++) {
    const row = 40 - i; // rangée décroissante (arrière en premier)
    cartes.push({ id: id++, classe: 'economy', nom: NOMS[id % NOMS.length], siege: `${row}${String.fromCharCode(65 + (i % 6))}`, row, vip: false });
  }

  return cartes.sort(() => Math.random() - 0.5);
}

export default function MinijeuBoarding({ paxCount, onFinish }: Props) {
  const [phase, setPhase] = useState<'idle' | 'playing' | 'finished'>('idle');
  const [cartes, setCartes] = useState<Carte[]>([]);
  const [validated, setValidated] = useState<Set<number>>(new Set());
  const [errors, setErrors] = useState<Set<number>>(new Set());
  const [timeLeft, setTimeLeft] = useState(0);
  const [validCount, setValidCount] = useState(0);
  const [score, setScore] = useState<number | null>(null);
  const duree = useMemo(() => getDureeBoarding(paxCount), [paxCount]);

  const startGame = useCallback(() => {
    const c = genererCartesAvecVIP(paxCount);
    setCartes(c);
    setValidated(new Set());
    setErrors(new Set());
    setValidCount(0);
    setTimeLeft(duree);
    setPhase('playing');
    setScore(null);
  }, [paxCount, duree]);

  // Timer
  useEffect(() => {
    if (phase !== 'playing') return;
    if (timeLeft <= 0) {
      const s = calculerScoreBoarding(validCount, paxCount);
      setScore(s);
      setPhase('finished');
      return;
    }
    const id = setTimeout(() => setTimeLeft(t => t - 1), 1000);
    return () => clearTimeout(id);
  }, [phase, timeLeft, validCount, paxCount]);

  // Prochaine classe attendue
  const nextClasse: Classe | null = useMemo(() => {
    for (const classe of ORDRE_CLASSES) {
      const cartesClasse = cartes.filter(c => c.classe === classe);
      const validatedClasse = cartesClasse.filter(c => validated.has(c.id));
      if (validatedClasse.length < cartesClasse.length) return classe;
    }
    return null;
  }, [cartes, validated]);

  // Prochain siège attendu dans la classe economy (ordre décroissant par row)
  const nextEconomySeat = useMemo(() => {
    if (nextClasse !== 'economy') return null;
    const economyPending = cartes
      .filter(c => c.classe === 'economy' && !validated.has(c.id))
      .sort((a, b) => b.row - a.row); // descending row
    return economyPending[0] ?? null;
  }, [cartes, validated, nextClasse]);

  useEffect(() => {
    if (phase === 'playing' && nextClasse === null && cartes.length > 0) {
      const s = calculerScoreBoarding(validCount, paxCount);
      setScore(s);
      setPhase('finished');
    }
  }, [nextClasse, phase, cartes, validCount, paxCount]);

  function handleValidate(carte: Carte) {
    if (phase !== 'playing' || validated.has(carte.id)) return;

    const wrongClass = carte.classe !== nextClasse;
    // Pour economy : vérifier l'ordre de rangée (décroissant)
    const wrongRowOrder = nextClasse === 'economy' && nextEconomySeat && carte.id !== nextEconomySeat.id;

    if (wrongClass || wrongRowOrder) {
      setErrors(prev => { const n = new Set(prev); n.add(carte.id); return n; });
      setTimeout(() => setErrors(prev => { const n = new Set(prev); n.delete(carte.id); return n; }), 600);
      return;
    }

    setValidated(prev => new Set([...prev, carte.id]));
    setValidCount(n => n + 1);
  }

  const timerPct = duree > 0 ? (timeLeft / duree) * 100 : 0;

  if (phase === 'idle') {
    return (
      <div className="text-center space-y-4">
        <div className="text-5xl">🎫</div>
        <h2 className="text-xl font-bold text-slate-100">Boarding Passagers</h2>
        <p className="text-slate-400 text-sm max-w-sm mx-auto">
          Ordre : <span className="text-yellow-300 font-semibold">VIP ⭐</span> →{' '}
          <span className="text-amber-300 font-semibold">Business</span> →{' '}
          <span className="text-slate-300 font-semibold">Premium</span> →{' '}
          <span className="text-sky-300 font-semibold">Economy</span> (arrière en premier).
          Durée : {duree}s pour {paxCount} passagers.
        </p>
        <button type="button" onClick={startGame} className="px-6 py-3 rounded-xl bg-purple-600 hover:bg-purple-700 text-white font-bold transition-colors">
          Démarrer le boarding
        </button>
      </div>
    );
  }

  if (phase === 'finished' && score !== null) {
    const pct = Math.round(score * 100);
    return (
      <div className="text-center space-y-4">
        <div className="text-5xl">{pct >= 80 ? '✈️' : pct >= 50 ? '🙂' : '😓'}</div>
        <h2 className="text-xl font-bold text-slate-100">Boarding terminé !</h2>
        <div className="inline-flex flex-col items-center gap-1 px-8 py-4 rounded-2xl bg-purple-900/20 border border-purple-800/40">
          <span className="text-4xl font-black text-purple-400">{pct}%</span>
          <span className="text-slate-400 text-sm">{validCount}/{paxCount} passagers embarqués</span>
        </div>
        <div className="flex gap-2 justify-center">
          <button type="button" onClick={startGame} className="px-4 py-2 rounded-xl border border-slate-600 text-slate-300 text-sm hover:bg-slate-700 transition-colors">Rejouer</button>
          <button type="button" onClick={() => onFinish(score)} className="px-4 py-2 rounded-xl bg-purple-600 hover:bg-purple-700 text-white text-sm font-bold transition-colors">Valider le score</button>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="text-sm text-slate-400">
          Prochaine :{' '}
          <span className={`font-semibold ${nextClasse ? 'text-slate-200' : 'text-emerald-400'}`}>
            {nextClasse ? CLASS_LABELS[nextClasse] : 'Terminé !'}
          </span>
          {nextClasse === 'economy' && nextEconomySeat && (
            <span className="text-slate-500 text-xs ml-2">(Rangée {nextEconomySeat.row} d&apos;abord)</span>
          )}
        </div>
        <span className="text-lg font-black font-mono text-purple-400">{timeLeft}s</span>
      </div>
      <div className="h-1.5 rounded-full bg-slate-700 overflow-hidden">
        <div className="h-full bg-purple-500 transition-all duration-1000" style={{ width: `${timerPct}%` }} />
      </div>

      {/* Cartes par classe */}
      {ORDRE_CLASSES.map(classe => {
        const classCartes = cartes.filter(c => c.classe === classe);
        if (classCartes.length === 0) return null;
        const validatedClass = classCartes.filter(c => validated.has(c.id));
        const isDone = validatedClass.length === classCartes.length;
        const isActive = classe === nextClasse;
        // Trier l'affichage economy par row desc (pour montrer l'ordre attendu)
        const sortedCartes = classe === 'economy'
          ? [...classCartes].sort((a, b) => b.row - a.row)
          : classCartes;

        return (
          <div key={classe} className={`rounded-xl border p-3 transition-all ${CLASS_COLORS[classe]} ${isDone ? 'opacity-40' : ''} ${isActive ? 'ring-1 ring-white/10' : ''}`}>
            <div className="flex items-center justify-between mb-2">
              <p className="text-xs font-bold uppercase tracking-wider opacity-80">
                {CLASS_LABELS[classe]} ({validatedClass.length}/{classCartes.length})
              </p>
              {classe === 'vip' && <span className="text-xs text-yellow-400 font-bold">PRIORITÉ ABSOLUE</span>}
              {classe === 'economy' && !isDone && <span className="text-[10px] text-slate-500">Arrière → avant</span>}
            </div>
            <div className="flex flex-wrap gap-2">
              {sortedCartes.map(carte => {
                const isValidated = validated.has(carte.id);
                const isError = errors.has(carte.id);
                const isNext = nextClasse === 'economy' && nextEconomySeat?.id === carte.id;
                return (
                  <button
                    key={carte.id}
                    type="button"
                    onClick={() => handleValidate(carte)}
                    disabled={isValidated || isDone}
                    className={`
                      rounded-lg border px-2.5 py-1 text-xs font-mono transition-all select-none
                      ${isValidated ? 'opacity-30 cursor-not-allowed' :
                        isError ? 'border-red-500 bg-red-900/30 text-red-300 animate-shake' :
                        isNext ? 'border-white/40 bg-white/10 animate-pulse' :
                        'cursor-pointer hover:scale-105 active:scale-95'}
                    `}
                  >
                    {isValidated ? '✓' : carte.vip ? `⭐ ${carte.siege}` : carte.siege}
                  </button>
                );
              })}
            </div>
          </div>
        );
      })}
    </div>
  );
}
