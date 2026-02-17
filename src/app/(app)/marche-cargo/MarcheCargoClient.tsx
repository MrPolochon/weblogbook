'use client';

import { useState, useTransition } from 'react';
import { Package, TrendingUp, MapPin, RefreshCw, Radio, Factory, Plane, ArrowRight } from 'lucide-react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';

interface AeroportCargoData {
  code: string;
  nom: string;
  taille: 'international' | 'regional' | 'small' | 'military';
  industriel: boolean;
  cargoMax: number;
  cargo_disponible: number;
  cargo_max: number;
  derniere_regeneration: string | null;
  vor?: string;
  freq?: string;
}

interface Props {
  aeroports: AeroportCargoData[];
}

const TAILLE_COLORS: Record<string, string> = {
  international: 'bg-purple-500 border-purple-400',
  regional: 'bg-sky-500 border-sky-400',
  small: 'bg-emerald-500 border-emerald-400',
  military: 'bg-red-500 border-red-400',
};

const TAILLE_LABELS: Record<string, string> = {
  international: 'International',
  regional: 'Régional',
  small: 'Petit',
  military: 'Militaire',
};

// Types de cargo disponibles
const CARGO_TYPES = [
  { id: 'general', nom: 'Marchandises générales', icon: '📦', color: 'text-slate-400' },
  { id: 'express', nom: 'Colis express', icon: '⚡', color: 'text-amber-400' },
  { id: 'perissable', nom: 'Denrées périssables', icon: '🧊', color: 'text-cyan-400' },
  { id: 'dangereux', nom: 'Matières dangereuses', icon: '☢️', color: 'text-red-400' },
  { id: 'surdimensionne', nom: 'Cargo surdimensionné', icon: '🚛', color: 'text-purple-400' },
];

export default function MarcheCargoClient({ aeroports }: Props) {
  const router = useRouter();
  const [, startTransition] = useTransition();
  const [selectedAeroport, setSelectedAeroport] = useState<AeroportCargoData | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [filterTaille, setFilterTaille] = useState<string>('all');
  const [sortBy, setSortBy] = useState<'cargo' | 'nom' | 'taille'>('cargo');

  async function handleRefresh() {
    setRefreshing(true);
    startTransition(() => router.refresh());
    setTimeout(() => setRefreshing(false), 1000);
  }

  function getCargoRatio(aeroport: AeroportCargoData): number {
    return aeroport.cargo_disponible / aeroport.cargo_max;
  }

  function getCargoColor(ratio: number): string {
    if (ratio >= 0.7) return 'text-emerald-400';
    if (ratio >= 0.4) return 'text-amber-400';
    return 'text-red-400';
  }

  function getCargoColorBg(ratio: number): string {
    if (ratio >= 0.7) return 'bg-emerald-500';
    if (ratio >= 0.4) return 'bg-amber-500';
    return 'bg-red-500';
  }

  function formatCargo(kg: number): string {
    if (kg >= 1000) {
      return `${(kg / 1000).toFixed(1)}t`;
    }
    return `${kg}kg`;
  }

  // Filtrage et tri
  let aeroportsFiltres = aeroports;
  if (filterTaille !== 'all') {
    aeroportsFiltres = aeroports.filter(a => a.taille === filterTaille);
  }

  const aeroportsTries = [...aeroportsFiltres].sort((a, b) => {
    if (sortBy === 'cargo') return b.cargo_disponible - a.cargo_disponible;
    if (sortBy === 'nom') return a.nom.localeCompare(b.nom);
    return a.taille.localeCompare(b.taille);
  });

  // Statistiques
  const totalCargo = aeroports.reduce((sum, a) => sum + a.cargo_disponible, 0);
  const cargoIndustriel = aeroports.filter(a => a.industriel).reduce((sum, a) => sum + a.cargo_disponible, 0);
  const cargoMilitaire = aeroports.filter(a => a.taille === 'military').reduce((sum, a) => sum + a.cargo_disponible, 0);

  // Meilleures liaisons cargo (aéroports industriels vers aéroports touristiques)
  const aeroportsIndustriels = aeroports.filter(a => a.industriel && a.cargo_disponible > 10000);
  const aeroportsDestination = aeroports.filter(a => !a.industriel && a.taille !== 'military');

  return (
    <div className="space-y-6">
      {/* Contrôles */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex gap-2 flex-wrap">
          <button
            onClick={() => setFilterTaille('all')}
            className={`px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
              filterTaille === 'all' ? 'bg-amber-600 text-white' : 'bg-slate-700 text-slate-300 hover:bg-slate-600'
            }`}
          >
            Tous ({aeroports.length})
          </button>
          {['international', 'regional', 'small', 'military'].map(taille => {
            const count = aeroports.filter(a => a.taille === taille).length;
            return (
              <button
                key={taille}
                onClick={() => setFilterTaille(taille)}
                className={`px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
                  filterTaille === taille ? 'bg-amber-600 text-white' : 'bg-slate-700 text-slate-300 hover:bg-slate-600'
                }`}
              >
                {TAILLE_LABELS[taille]} ({count})
              </button>
            );
          })}
        </div>
        
        <div className="flex gap-2">
          <select
            value={sortBy}
            onChange={(e) => setSortBy(e.target.value as 'cargo' | 'nom' | 'taille')}
            className="px-3 py-2 bg-slate-700 border border-slate-600 rounded-lg text-slate-200 text-sm"
          >
            <option value="cargo">Trier par cargo</option>
            <option value="nom">Trier par nom</option>
            <option value="taille">Trier par taille</option>
          </select>
          
          <button
            onClick={handleRefresh}
            disabled={refreshing}
            className="flex items-center gap-2 px-4 py-2 bg-slate-700 hover:bg-slate-600 text-slate-300 rounded-lg text-sm transition-colors disabled:opacity-50"
          >
            <RefreshCw className={`h-4 w-4 ${refreshing ? 'animate-spin' : ''}`} />
            Actualiser
          </button>
        </div>
      </div>

      {/* Grille principale */}
      <div className="grid lg:grid-cols-3 gap-6">
        {/* Liste des aéroports */}
        <div className="lg:col-span-2 space-y-3">
          {aeroportsTries.map((aeroport) => {
            const ratio = getCargoRatio(aeroport);
            const isSelected = selectedAeroport?.code === aeroport.code;
            
            return (
              <div
                key={aeroport.code}
                onClick={() => setSelectedAeroport(aeroport)}
                className={`card cursor-pointer transition-all hover:border-amber-500/50 ${
                  isSelected ? 'border-amber-500 bg-amber-500/10' : ''
                }`}
              >
                <div className="flex items-center justify-between gap-4">
                  <div className="flex items-center gap-3 min-w-0">
                    <div className={`w-10 h-10 rounded-lg flex items-center justify-center ${TAILLE_COLORS[aeroport.taille].split(' ')[0]}`}>
                      <Package className="h-5 w-5 text-white" />
                    </div>
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="font-mono font-bold text-amber-400">{aeroport.code}</span>
                        <span className="text-slate-300 truncate">{aeroport.nom}</span>
                        {aeroport.industriel && <span title="Zone industrielle">🏭</span>}
                      </div>
                      <div className="flex items-center gap-2 text-xs text-slate-500">
                        <span className={`px-1.5 py-0.5 rounded ${TAILLE_COLORS[aeroport.taille].split(' ')[0]}/20`}>
                          {TAILLE_LABELS[aeroport.taille]}
                        </span>
                        {aeroport.vor && (
                          <span className="text-cyan-400 font-mono">{aeroport.vor}</span>
                        )}
                      </div>
                    </div>
                  </div>
                  
                  <div className="flex items-center gap-4">
                    <div className="text-right">
                      <div className={`text-lg font-bold ${getCargoColor(ratio)}`}>
                        {formatCargo(aeroport.cargo_disponible)}
                      </div>
                      <div className="text-xs text-slate-500">
                        / {formatCargo(aeroport.cargo_max)}
                      </div>
                    </div>
                    <div className="w-24">
                      <div className="h-2 bg-slate-700 rounded-full overflow-hidden">
                        <div
                          className={`h-full transition-all ${getCargoColorBg(ratio)}`}
                          style={{ width: `${ratio * 100}%` }}
                        />
                      </div>
                      <div className={`text-xs text-center mt-1 ${getCargoColor(ratio)}`}>
                        {Math.round(ratio * 100)}%
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>

        {/* Panel détails */}
        <div className="space-y-4">
          {selectedAeroport ? (
            <div className="card space-y-4">
              <div className="flex items-start justify-between">
                <div>
                  <h3 className="text-xl font-bold text-slate-100 font-mono">{selectedAeroport.code}</h3>
                  <p className="text-slate-400">{selectedAeroport.nom}</p>
                </div>
                {selectedAeroport.industriel && <span className="text-2xl">🏭</span>}
              </div>
              
              <div className="flex items-center gap-2">
                <div className={`w-3 h-3 rounded-full ${TAILLE_COLORS[selectedAeroport.taille].split(' ')[0]}`}></div>
                <span className="text-slate-300">{TAILLE_LABELS[selectedAeroport.taille]}</span>
              </div>
              
              {selectedAeroport.vor && (
                <div className="p-3 rounded-lg bg-cyan-500/10 border border-cyan-500/30">
                  <div className="flex items-center gap-2 text-cyan-300">
                    <Radio className="h-4 w-4" />
                    <span className="font-mono font-bold">{selectedAeroport.vor}</span>
                    {selectedAeroport.freq && <span className="text-cyan-400/70">{selectedAeroport.freq} MHz</span>}
                  </div>
                </div>
              )}
              
              <div className={`p-4 rounded-lg ${getCargoRatio(selectedAeroport) >= 0.7 ? 'bg-emerald-500/20' : getCargoRatio(selectedAeroport) >= 0.4 ? 'bg-amber-500/20' : 'bg-red-500/20'}`}>
                <div className="flex items-center gap-2 mb-2">
                  <Package className="h-5 w-5 text-slate-400" />
                  <span className="text-slate-300 font-medium">Cargo disponible</span>
                </div>
                <div className="flex items-baseline gap-2">
                  <span className={`text-3xl font-bold ${getCargoColor(getCargoRatio(selectedAeroport))}`}>
                    {formatCargo(selectedAeroport.cargo_disponible)}
                  </span>
                  <span className="text-slate-500">/ {formatCargo(selectedAeroport.cargo_max)}</span>
                </div>
                <div className="mt-3 h-2 bg-slate-700 rounded-full overflow-hidden">
                  <div
                    className={`h-full transition-all ${getCargoColorBg(getCargoRatio(selectedAeroport))}`}
                    style={{ width: `${getCargoRatio(selectedAeroport) * 100}%` }}
                  />
                </div>
              </div>
              
              <div className="space-y-2">
                <h4 className="text-sm font-medium text-slate-400">Types de cargo acceptés</h4>
                <div className="space-y-1">
                  {CARGO_TYPES.map(type => (
                    <div key={type.id} className="flex items-center gap-2 text-sm">
                      <span>{type.icon}</span>
                      <span className={type.color}>{type.nom}</span>
                      {type.id === 'dangereux' && selectedAeroport.taille !== 'international' && (
                        <span className="text-[10px] px-1 py-0.5 rounded bg-red-500/20 text-red-400">Non disponible</span>
                      )}
                      {type.id === 'surdimensionne' && selectedAeroport.taille === 'small' && (
                        <span className="text-[10px] px-1 py-0.5 rounded bg-red-500/20 text-red-400">Piste trop courte</span>
                      )}
                    </div>
                  ))}
                </div>
              </div>
              
              <div className="space-y-2">
                <h4 className="text-sm font-medium text-slate-400">Bonus & Caractéristiques</h4>
                <div className="space-y-1 text-sm">
                  {selectedAeroport.industriel && (
                    <div className="flex items-center gap-2 text-amber-300">
                      <Factory className="h-4 w-4" />
                      <span>Zone industrielle: +25% cargo généré</span>
                    </div>
                  )}
                  {selectedAeroport.taille === 'international' && (
                    <div className="flex items-center gap-2 text-purple-300">
                      <Plane className="h-4 w-4" />
                      <span>Hub cargo: tout type accepté</span>
                    </div>
                  )}
                  {selectedAeroport.taille === 'military' && (
                    <div className="flex items-center gap-2 text-red-300">
                      <Package className="h-4 w-4" />
                      <span>Cargo militaire uniquement</span>
                    </div>
                  )}
                </div>
              </div>
            </div>
          ) : (
            <div className="card text-center py-8">
              <MapPin className="h-12 w-12 text-slate-600 mx-auto mb-3" />
              <p className="text-slate-400">Cliquez sur un aéroport</p>
              <p className="text-slate-500 text-sm mt-1">pour voir les détails cargo</p>
            </div>
          )}

          {/* Liaisons suggérées */}
          <div className="card">
            <h3 className="text-sm font-semibold text-amber-400 mb-3 flex items-center gap-2">
              <TrendingUp className="h-4 w-4" />
              Liaisons cargo recommandées
            </h3>
            <div className="space-y-2 text-sm">
              {aeroportsIndustriels.slice(0, 3).map(depart => {
                const destination = aeroportsDestination.find(d => d.cargo_disponible < d.cargo_max * 0.5);
                if (!destination) return null;
                return (
                  <div key={depart.code} className="flex items-center gap-2 text-slate-400">
                    <span className="font-mono text-emerald-400">{depart.code}</span>
                    <ArrowRight className="h-3 w-3" />
                    <span className="font-mono text-amber-400">{destination.code}</span>
                    <span className="text-xs text-slate-500">({formatCargo(Math.min(depart.cargo_disponible, destination.cargo_max - destination.cargo_disponible))})</span>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </div>

      {/* Statistiques */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className="card bg-amber-500/10 border-amber-500/30">
          <p className="text-sm text-amber-300">Cargo total disponible</p>
          <p className="text-2xl font-bold text-amber-400">{formatCargo(totalCargo)}</p>
        </div>
        <div className="card bg-purple-500/10 border-purple-500/30">
          <p className="text-sm text-purple-300">Hubs internationaux</p>
          <p className="text-2xl font-bold text-purple-400">{aeroports.filter(a => a.taille === 'international').length}</p>
        </div>
        <div className="card bg-emerald-500/10 border-emerald-500/30">
          <p className="text-sm text-emerald-300">Zones industrielles</p>
          <p className="text-2xl font-bold text-emerald-400">{aeroports.filter(a => a.industriel).length}</p>
          <p className="text-xs text-emerald-300/70">{formatCargo(cargoIndustriel)} disponible</p>
        </div>
        <div className="card bg-red-500/10 border-red-500/30">
          <p className="text-sm text-red-300">Bases militaires</p>
          <p className="text-2xl font-bold text-red-400">{aeroports.filter(a => a.taille === 'military').length}</p>
          <p className="text-xs text-red-300/70">{formatCargo(cargoMilitaire)} cargo mil.</p>
        </div>
      </div>

      {/* Lien vers marché passagers */}
      <div className="flex justify-center">
        <Link
          href="/marche-passagers"
          className="flex items-center gap-2 text-slate-400 hover:text-slate-200 text-sm transition-colors"
        >
          Voir le marché des passagers
          <ArrowRight className="h-4 w-4" />
        </Link>
      </div>
    </div>
  );
}
