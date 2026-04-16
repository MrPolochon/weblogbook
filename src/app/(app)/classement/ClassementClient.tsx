'use client';

import { useState, useMemo } from 'react';
import {
  Trophy, Clock, Plane, Award, MapPin, Layers, Navigation, Cloud,
  GraduationCap, Shield, Timer, Banknote, Warehouse, CalendarDays, Crown,
} from 'lucide-react';

type PiloteStat = {
  id: string;
  identifiant: string;
  totalMinutes: number;
  nbVols: number;
  nbLicences: number;
  nbAeroports: number;
  nbTypesAvion: number;
  nbVolsIFR: number;
  nbVolsVFR: number;
  nbVolsInstruction: number;
  nbVolsMilitaires: number;
  longestFlight: number;
  solde: number;
  nbAvions: number;
  memberSince: string;
};

interface Props {
  pilotes: PiloteStat[];
  currentUserId: string;
}

type CategoryId =
  | 'heures' | 'vols' | 'licences' | 'aeroports' | 'types_avion'
  | 'ifr' | 'vfr' | 'instruction' | 'militaire' | 'longest'
  | 'fortune' | 'flotte' | 'veteran';

const CATEGORIES: { id: CategoryId; label: string; icon: typeof Trophy; color: string; description: string }[] = [
  { id: 'heures', label: 'Heures de vol', icon: Clock, color: 'text-amber-400', description: 'Total des heures de vol cumulées' },
  { id: 'vols', label: 'Nombre de vols', icon: Plane, color: 'text-sky-400', description: 'Total de vols validés' },
  { id: 'licences', label: 'Licences', icon: Award, color: 'text-violet-400', description: 'Nombre de qualifications obtenues' },
  { id: 'aeroports', label: 'Globe-trotter', icon: MapPin, color: 'text-emerald-400', description: 'Aéroports différents visités' },
  { id: 'types_avion', label: 'Polyvalent', icon: Layers, color: 'text-cyan-400', description: 'Types d\'avion différents pilotés' },
  { id: 'ifr', label: 'Maître IFR', icon: Navigation, color: 'text-indigo-400', description: 'Vols en régime IFR' },
  { id: 'vfr', label: 'Pilote VFR', icon: Cloud, color: 'text-teal-400', description: 'Vols en régime VFR' },
  { id: 'instruction', label: 'Formateur', icon: GraduationCap, color: 'text-rose-400', description: 'Vols d\'instruction dispensés' },
  { id: 'militaire', label: 'As militaire', icon: Shield, color: 'text-orange-400', description: 'Vols militaires effectués' },
  { id: 'longest', label: 'Endurance', icon: Timer, color: 'text-red-400', description: 'Vol le plus long en minutes' },
  { id: 'fortune', label: 'Fortune', icon: Banknote, color: 'text-yellow-400', description: 'Solde du compte Felitz' },
  { id: 'flotte', label: 'Collectionneur', icon: Warehouse, color: 'text-lime-400', description: 'Avions possédés' },
  { id: 'veteran', label: 'Vétéran', icon: CalendarDays, color: 'text-slate-300', description: 'Membre depuis le plus longtemps' },
];

function getValue(p: PiloteStat, cat: CategoryId): number {
  switch (cat) {
    case 'heures': return p.totalMinutes;
    case 'vols': return p.nbVols;
    case 'licences': return p.nbLicences;
    case 'aeroports': return p.nbAeroports;
    case 'types_avion': return p.nbTypesAvion;
    case 'ifr': return p.nbVolsIFR;
    case 'vfr': return p.nbVolsVFR;
    case 'instruction': return p.nbVolsInstruction;
    case 'militaire': return p.nbVolsMilitaires;
    case 'longest': return p.longestFlight;
    case 'fortune': return p.solde;
    case 'flotte': return p.nbAvions;
    case 'veteran': return -new Date(p.memberSince).getTime();
    default: return 0;
  }
}

function formatValue(val: number, cat: CategoryId): string {
  switch (cat) {
    case 'heures': {
      const h = Math.floor(val / 60);
      const m = val % 60;
      return `${h}h${String(m).padStart(2, '0')}`;
    }
    case 'longest': return `${val} min`;
    case 'fortune': return `${val.toLocaleString('fr-FR')} F$`;
    case 'veteran': {
      const d = new Date(-val);
      return d.toLocaleDateString('fr-FR', { day: '2-digit', month: 'short', year: 'numeric', timeZone: 'UTC' });
    }
    default: return val.toLocaleString('fr-FR');
  }
}

function medalColor(rank: number): string {
  if (rank === 0) return 'text-amber-400';
  if (rank === 1) return 'text-slate-300';
  if (rank === 2) return 'text-amber-600';
  return 'text-slate-600';
}

function medalBg(rank: number): string {
  if (rank === 0) return 'bg-amber-400/10 border-amber-400/30';
  if (rank === 1) return 'bg-slate-300/5 border-slate-400/20';
  if (rank === 2) return 'bg-amber-600/5 border-amber-600/20';
  return 'border-transparent';
}

export default function ClassementClient({ pilotes, currentUserId }: Props) {
  const [activeCategory, setActiveCategory] = useState<CategoryId>('heures');

  const sorted = useMemo(() => {
    return [...pilotes]
      .filter(p => activeCategory === 'veteran' ? !!p.memberSince : getValue(p, activeCategory) > 0)
      .sort((a, b) => getValue(b, activeCategory) - getValue(a, activeCategory));
  }, [pilotes, activeCategory]);

  const activeCat = CATEGORIES.find(c => c.id === activeCategory)!;
  const ActiveIcon = activeCat.icon;

  const myRank = sorted.findIndex(p => p.id === currentUserId);
  const myStats = pilotes.find(p => p.id === currentUserId);

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-center gap-3">
        <Trophy className="h-6 w-6 text-amber-400" />
        <div>
          <h1 className="text-xl font-semibold text-slate-100">Classement</h1>
          <p className="text-sm text-slate-500">Comparez-vous aux autres pilotes</p>
        </div>
        {myRank >= 0 && (
          <div className="ml-auto px-3 py-1.5 rounded-lg bg-violet-500/10 border border-violet-500/20">
            <p className="text-xs text-violet-300">Votre position : <span className="font-bold">#{myRank + 1}</span> / {sorted.length}</p>
          </div>
        )}
      </div>

      {/* Category selector */}
      <div className="flex flex-wrap gap-1.5">
        {CATEGORIES.map(cat => {
          const Icon = cat.icon;
          const isActive = activeCategory === cat.id;
          return (
            <button
              key={cat.id}
              onClick={() => setActiveCategory(cat.id)}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
                isActive
                  ? 'bg-slate-800 text-slate-100 border border-slate-700'
                  : 'text-slate-500 hover:text-slate-300 hover:bg-slate-800/40 border border-transparent'
              }`}
            >
              <Icon className={`h-3.5 w-3.5 ${isActive ? cat.color : ''}`} />
              <span className="hidden sm:inline">{cat.label}</span>
            </button>
          );
        })}
      </div>

      {/* Active category description */}
      <div className="flex items-center gap-2 px-4 py-2.5 rounded-lg bg-slate-800/40 border border-slate-800/60">
        <ActiveIcon className={`h-5 w-5 ${activeCat.color}`} />
        <div>
          <p className="text-sm font-medium text-slate-200">{activeCat.label}</p>
          <p className="text-xs text-slate-500">{activeCat.description}</p>
        </div>
        <p className="ml-auto text-xs text-slate-600">{sorted.length} pilote{sorted.length > 1 ? 's' : ''}</p>
      </div>

      {/* Podium (top 3) */}
      {sorted.length >= 3 && (
        <div className="grid grid-cols-3 gap-3">
          {[1, 0, 2].map(rank => {
            const p = sorted[rank];
            if (!p) return null;
            const isMe = p.id === currentUserId;
            return (
              <div key={p.id} className={`flex flex-col items-center p-4 rounded-xl border ${medalBg(rank)} ${rank === 0 ? 'order-2 -mt-2' : rank === 1 ? 'order-1 mt-2' : 'order-3 mt-2'}`}>
                <div className={`w-10 h-10 rounded-full flex items-center justify-center mb-2 ${rank === 0 ? 'bg-amber-400/20' : rank === 1 ? 'bg-slate-400/10' : 'bg-amber-700/10'}`}>
                  <Crown className={`h-5 w-5 ${medalColor(rank)}`} />
                </div>
                <p className="text-[10px] text-slate-500 font-mono">#{rank + 1}</p>
                <p className={`text-sm font-semibold truncate max-w-full ${isMe ? 'text-violet-300' : 'text-slate-200'}`}>{p.identifiant}</p>
                <p className={`text-lg font-bold mt-1 ${activeCat.color}`}>
                  {formatValue(getValue(p, activeCategory), activeCategory)}
                </p>
              </div>
            );
          })}
        </div>
      )}

      {/* Full ranking list */}
      <div className="rounded-xl border border-slate-800/60 bg-slate-900/40 overflow-hidden">
        <div className="grid grid-cols-[3rem_1fr_auto] px-4 py-2 text-[10px] font-medium text-slate-600 uppercase tracking-wider border-b border-slate-800/40">
          <span>#</span>
          <span>Pilote</span>
          <span>{activeCat.label}</span>
        </div>
        <div className="max-h-[500px] overflow-y-auto">
          {sorted.length === 0 ? (
            <p className="px-4 py-8 text-center text-sm text-slate-600">Aucune donnée</p>
          ) : (
            sorted.map((p, i) => {
              const isMe = p.id === currentUserId;
              const val = getValue(p, activeCategory);
              const maxVal = getValue(sorted[0], activeCategory);
              const pct = maxVal > 0 ? (val / maxVal) * 100 : 0;
              return (
                <div
                  key={p.id}
                  className={`grid grid-cols-[3rem_1fr_auto] items-center px-4 py-2.5 border-b border-slate-800/20 last:border-b-0 transition-colors ${
                    isMe ? 'bg-violet-500/5' : 'hover:bg-slate-800/30'
                  }`}
                >
                  <span className={`text-sm font-mono font-bold ${i < 3 ? medalColor(i) : 'text-slate-600'}`}>
                    {i + 1}
                  </span>
                  <div className="min-w-0 flex items-center gap-2">
                    <div className={`w-7 h-7 rounded-full flex items-center justify-center text-[10px] font-bold shrink-0 ${
                      isMe ? 'bg-violet-500/20 text-violet-300' : 'bg-slate-800 text-slate-400'
                    }`}>
                      {p.identifiant[0]?.toUpperCase()}
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className={`text-sm truncate ${isMe ? 'font-semibold text-violet-200' : 'text-slate-300'}`}>{p.identifiant}</p>
                      <div className="mt-1 h-1 rounded-full bg-slate-800 overflow-hidden">
                        <div className={`h-full rounded-full transition-all duration-500 ${i === 0 ? 'bg-amber-400' : i === 1 ? 'bg-slate-400' : i === 2 ? 'bg-amber-600' : 'bg-slate-600'}`} style={{ width: `${pct}%` }} />
                      </div>
                    </div>
                  </div>
                  <span className={`text-sm font-mono font-semibold ml-3 ${i < 3 ? activeCat.color : 'text-slate-400'}`}>
                    {formatValue(val, activeCategory)}
                  </span>
                </div>
              );
            })
          )}
        </div>
      </div>

      {/* My stats summary */}
      {myStats && (
        <div className="rounded-xl border border-slate-800/60 bg-slate-900/40 p-5">
          <h2 className="text-sm font-semibold text-slate-200 mb-3">Mes statistiques</h2>
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
            {[
              { label: 'Heures de vol', value: formatValue(myStats.totalMinutes, 'heures'), icon: Clock, color: 'text-amber-400' },
              { label: 'Vols', value: myStats.nbVols.toString(), icon: Plane, color: 'text-sky-400' },
              { label: 'Licences', value: myStats.nbLicences.toString(), icon: Award, color: 'text-violet-400' },
              { label: 'Aéroports', value: myStats.nbAeroports.toString(), icon: MapPin, color: 'text-emerald-400' },
              { label: 'Types avion', value: myStats.nbTypesAvion.toString(), icon: Layers, color: 'text-cyan-400' },
              { label: 'Vols IFR', value: myStats.nbVolsIFR.toString(), icon: Navigation, color: 'text-indigo-400' },
              { label: 'Vols VFR', value: myStats.nbVolsVFR.toString(), icon: Cloud, color: 'text-teal-400' },
              { label: 'Fortune', value: `${myStats.solde.toLocaleString('fr-FR')} F$`, icon: Banknote, color: 'text-yellow-400' },
              { label: 'Flotte', value: `${myStats.nbAvions} avion${myStats.nbAvions > 1 ? 's' : ''}`, icon: Warehouse, color: 'text-lime-400' },
              { label: 'Vol le plus long', value: `${myStats.longestFlight} min`, icon: Timer, color: 'text-red-400' },
            ].map(stat => {
              const Icon = stat.icon;
              return (
                <div key={stat.label} className="rounded-lg bg-slate-800/30 border border-slate-800/40 px-3 py-2.5">
                  <div className="flex items-center gap-1.5 mb-1">
                    <Icon className={`h-3.5 w-3.5 ${stat.color}`} />
                    <span className="text-[10px] text-slate-500 uppercase tracking-wide">{stat.label}</span>
                  </div>
                  <p className="text-sm font-bold text-slate-200">{stat.value}</p>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
