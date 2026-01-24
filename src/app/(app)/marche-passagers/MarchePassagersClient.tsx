'use client';

import { useState } from 'react';
import { Users, Plane, TrendingUp, MapPin, RefreshCw } from 'lucide-react';
import { useRouter } from 'next/navigation';

interface AeroportData {
  code: string;
  nom: string;
  taille: 'international' | 'regional' | 'small' | 'military';
  tourisme: boolean;
  passagersMax: number;
  passagers_disponibles: number;
  passagers_max: number;
  derniere_regeneration: string | null;
}

interface Props {
  aeroports: AeroportData[];
}

// Positions des aéroports sur la carte (en pourcentage)
// Basé sur la carte PTFS officielle
const POSITIONS: Record<string, { x: number; y: number }> = {
  'IDCS': { x: 48, y: 8 },    // Saba
  'ITKO': { x: 56, y: 14 },   // Tokyo International
  'IPPH': { x: 52, y: 28 },   // Perth International
  'ILKL': { x: 72, y: 28 },   // Lukla Airport
  'IGRV': { x: 10, y: 38 },   // Grindavik Airport
  'IBTH': { x: 50, y: 40 },   // Saint Barthélemy
  'ISCM': { x: 88, y: 38 },   // RAF Scampton
  'IJAF': { x: 92, y: 45 },   // Al Najaf
  'IBLT': { x: 48, y: 50 },   // Boltic Airfield
  'IZOL': { x: 82, y: 50 },   // Izolirani
  'IGAR': { x: 35, y: 55 },   // Airbase Garry
  'ISKP': { x: 85, y: 55 },   // Skopelos Airfield
  'IRFD': { x: 35, y: 62 },   // Greater Rockford
  'IMLR': { x: 52, y: 65 },   // Mellor Airport
  'ISAU': { x: 12, y: 72 },   // Sauthemptona Airport
  'ITRC': { x: 52, y: 75 },   // Training Centre
  'ILAR': { x: 68, y: 75 },   // Larnaca Airport
  'IPAP': { x: 85, y: 78 },   // Paphos Airport
  'IHEN': { x: 55, y: 88 },   // Henstridge Airfield
  'IBAR': { x: 82, y: 85 },   // Barra Airport
  'IIAB': { x: 25, y: 45 },   // McConnell AFB (estimation)
  'IBRD': { x: 65, y: 25 },   // Bird Island (estimation)
  'IUFO': { x: 8, y: 58 },    // UFO Base (estimation)
};

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

export default function MarchePassagersClient({ aeroports }: Props) {
  const router = useRouter();
  const [selectedAeroport, setSelectedAeroport] = useState<AeroportData | null>(null);
  const [viewMode, setViewMode] = useState<'carte' | 'liste'>('carte');
  const [refreshing, setRefreshing] = useState(false);

  async function handleRefresh() {
    setRefreshing(true);
    router.refresh();
    setTimeout(() => setRefreshing(false), 1000);
  }

  function getPassagerRatio(aeroport: AeroportData): number {
    return aeroport.passagers_disponibles / aeroport.passagers_max;
  }

  function getPassagerColor(ratio: number): string {
    if (ratio >= 0.7) return 'text-emerald-400';
    if (ratio >= 0.4) return 'text-amber-400';
    return 'text-red-400';
  }

  function getPassagerBgColor(ratio: number): string {
    if (ratio >= 0.7) return 'bg-emerald-500/20';
    if (ratio >= 0.4) return 'bg-amber-500/20';
    return 'bg-red-500/20';
  }

  // Trier les aéroports par nombre de passagers disponibles (décroissant)
  const aeroportsTries = [...aeroports].sort((a, b) => b.passagers_disponibles - a.passagers_disponibles);

  return (
    <div className="space-y-4">
      {/* Contrôles */}
      <div className="flex items-center justify-between">
        <div className="flex gap-2">
          <button
            onClick={() => setViewMode('carte')}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
              viewMode === 'carte' 
                ? 'bg-emerald-600 text-white' 
                : 'bg-slate-700 text-slate-300 hover:bg-slate-600'
            }`}
          >
            <MapPin className="h-4 w-4 inline mr-2" />
            Carte
          </button>
          <button
            onClick={() => setViewMode('liste')}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
              viewMode === 'liste' 
                ? 'bg-emerald-600 text-white' 
                : 'bg-slate-700 text-slate-300 hover:bg-slate-600'
            }`}
          >
            <Users className="h-4 w-4 inline mr-2" />
            Liste
          </button>
        </div>
        <button
          onClick={handleRefresh}
          disabled={refreshing}
          className="flex items-center gap-2 px-4 py-2 bg-slate-700 hover:bg-slate-600 text-slate-300 rounded-lg text-sm transition-colors disabled:opacity-50"
        >
          <RefreshCw className={`h-4 w-4 ${refreshing ? 'animate-spin' : ''}`} />
          Actualiser
        </button>
      </div>

      {viewMode === 'carte' ? (
        /* Vue Carte */
        <div className="grid lg:grid-cols-3 gap-6">
          {/* Carte */}
          <div className="lg:col-span-2 card p-0 overflow-hidden">
            <div 
              className="relative w-full bg-gradient-to-br from-slate-700 via-slate-800 to-slate-900"
              style={{ aspectRatio: '4/3' }}
            >
              {/* Fond stylisé façon océan */}
              <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,_var(--tw-gradient-stops))] from-blue-900/30 via-slate-800 to-slate-900"></div>
              
              {/* Grille de fond */}
              <div className="absolute inset-0 opacity-10" style={{
                backgroundImage: 'linear-gradient(to right, #475569 1px, transparent 1px), linear-gradient(to bottom, #475569 1px, transparent 1px)',
                backgroundSize: '50px 50px'
              }}></div>

              {/* Points d'aéroports */}
              {aeroports.map((aeroport) => {
                const pos = POSITIONS[aeroport.code];
                if (!pos) return null;
                
                const ratio = getPassagerRatio(aeroport);
                const isSelected = selectedAeroport?.code === aeroport.code;
                
                return (
                  <button
                    key={aeroport.code}
                    onClick={() => setSelectedAeroport(aeroport)}
                    className={`absolute transform -translate-x-1/2 -translate-y-1/2 transition-all duration-200 group z-10 ${
                      isSelected ? 'scale-150 z-20' : 'hover:scale-125'
                    }`}
                    style={{ left: `${pos.x}%`, top: `${pos.y}%` }}
                    title={`${aeroport.code} - ${aeroport.nom}`}
                  >
                    {/* Point principal */}
                    <div className={`w-4 h-4 rounded-full border-2 ${TAILLE_COLORS[aeroport.taille]} ${
                      isSelected ? 'ring-2 ring-white ring-offset-2 ring-offset-slate-800' : ''
                    }`}>
                      {/* Indicateur de remplissage */}
                      <div 
                        className="absolute -bottom-1 -right-1 w-2 h-2 rounded-full"
                        style={{
                          backgroundColor: ratio >= 0.7 ? '#10b981' : ratio >= 0.4 ? '#f59e0b' : '#ef4444'
                        }}
                      ></div>
                    </div>
                    
                    {/* Icône tourisme */}
                    {aeroport.tourisme && (
                      <span className="absolute -top-3 -right-3 text-xs">🏝️</span>
                    )}
                    
                    {/* Label au survol */}
                    <div className={`absolute left-1/2 -translate-x-1/2 -bottom-8 whitespace-nowrap bg-slate-900/95 px-2 py-1 rounded text-xs text-white opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none ${
                      isSelected ? 'opacity-100' : ''
                    }`}>
                      {aeroport.code}
                    </div>
                  </button>
                );
              })}

              {/* Titre sur la carte */}
              <div className="absolute top-4 left-4 bg-slate-900/80 px-3 py-2 rounded-lg">
                <h3 className="text-sm font-bold text-slate-200">Carte PTFS</h3>
                <p className="text-xs text-slate-400">{aeroports.length} aéroports</p>
              </div>
            </div>
          </div>

          {/* Détails aéroport sélectionné */}
          <div className="card">
            {selectedAeroport ? (
              <div className="space-y-4">
                <div className="flex items-start justify-between">
                  <div>
                    <h3 className="text-xl font-bold text-slate-100">{selectedAeroport.code}</h3>
                    <p className="text-slate-400">{selectedAeroport.nom}</p>
                  </div>
                  {selectedAeroport.tourisme && (
                    <span className="text-2xl" title="Destination touristique">🏝️</span>
                  )}
                </div>

                {/* Type */}
                <div className="flex items-center gap-2">
                  <div className={`w-3 h-3 rounded-full ${TAILLE_COLORS[selectedAeroport.taille].split(' ')[0]}`}></div>
                  <span className="text-slate-300">{TAILLE_LABELS[selectedAeroport.taille]}</span>
                </div>

                {/* Passagers */}
                <div className={`p-4 rounded-lg ${getPassagerBgColor(getPassagerRatio(selectedAeroport))}`}>
                  <div className="flex items-center gap-2 mb-2">
                    <Users className="h-5 w-5 text-slate-400" />
                    <span className="text-slate-300 font-medium">Passagers disponibles</span>
                  </div>
                  <div className="flex items-baseline gap-2">
                    <span className={`text-3xl font-bold ${getPassagerColor(getPassagerRatio(selectedAeroport))}`}>
                      {selectedAeroport.passagers_disponibles.toLocaleString('fr-FR')}
                    </span>
                    <span className="text-slate-500">/ {selectedAeroport.passagers_max.toLocaleString('fr-FR')}</span>
                  </div>
                  {/* Barre de progression */}
                  <div className="mt-3 h-2 bg-slate-700 rounded-full overflow-hidden">
                    <div 
                      className={`h-full transition-all ${
                        getPassagerRatio(selectedAeroport) >= 0.7 ? 'bg-emerald-500' :
                        getPassagerRatio(selectedAeroport) >= 0.4 ? 'bg-amber-500' : 'bg-red-500'
                      }`}
                      style={{ width: `${getPassagerRatio(selectedAeroport) * 100}%` }}
                    ></div>
                  </div>
                </div>

                {/* Bonus */}
                <div className="space-y-2">
                  <h4 className="text-sm font-medium text-slate-400">Bonus & Malus</h4>
                  <div className="space-y-1 text-sm">
                    {selectedAeroport.taille === 'international' && (
                      <div className="flex items-center gap-2 text-purple-300">
                        <TrendingUp className="h-4 w-4" />
                        <span>Prix billet: -40% d&apos;impact</span>
                      </div>
                    )}
                    {selectedAeroport.taille === 'regional' && (
                      <div className="flex items-center gap-2 text-sky-300">
                        <TrendingUp className="h-4 w-4" />
                        <span>Prix billet: -20% d&apos;impact</span>
                      </div>
                    )}
                    {selectedAeroport.taille === 'military' && (
                      <div className="flex items-center gap-2 text-red-300">
                        <Plane className="h-4 w-4" />
                        <span>Peu de passagers civils (-70%)</span>
                      </div>
                    )}
                    {selectedAeroport.tourisme && (
                      <div className="flex items-center gap-2 text-amber-300">
                        <span>🏝️</span>
                        <span>Destination touristique: +15% remplissage</span>
                      </div>
                    )}
                    {selectedAeroport.taille === 'small' && !selectedAeroport.tourisme && (
                      <div className="flex items-center gap-2 text-slate-400">
                        <span>Pas de bonus particulier</span>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            ) : (
              <div className="text-center py-8">
                <MapPin className="h-12 w-12 text-slate-600 mx-auto mb-3" />
                <p className="text-slate-400">Cliquez sur un aéroport sur la carte</p>
                <p className="text-slate-500 text-sm mt-1">pour voir les détails</p>
              </div>
            )}
          </div>
        </div>
      ) : (
        /* Vue Liste */
        <div className="card">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-700 text-left text-slate-400">
                  <th className="pb-3 pr-4">Aéroport</th>
                  <th className="pb-3 pr-4">Type</th>
                  <th className="pb-3 pr-4">Passagers</th>
                  <th className="pb-3 pr-4">Remplissage</th>
                  <th className="pb-3">Bonus</th>
                </tr>
              </thead>
              <tbody>
                {aeroportsTries.map((aeroport) => {
                  const ratio = getPassagerRatio(aeroport);
                  return (
                    <tr 
                      key={aeroport.code} 
                      className="border-b border-slate-700/50 last:border-0 hover:bg-slate-800/50 cursor-pointer"
                      onClick={() => { setSelectedAeroport(aeroport); setViewMode('carte'); }}
                    >
                      <td className="py-3 pr-4">
                        <div className="flex items-center gap-2">
                          <span className="font-mono font-bold text-slate-200">{aeroport.code}</span>
                          <span className="text-slate-400">{aeroport.nom}</span>
                        </div>
                      </td>
                      <td className="py-3 pr-4">
                        <div className="flex items-center gap-2">
                          <div className={`w-3 h-3 rounded-full ${TAILLE_COLORS[aeroport.taille].split(' ')[0]}`}></div>
                          <span className="text-slate-300">{TAILLE_LABELS[aeroport.taille]}</span>
                        </div>
                      </td>
                      <td className="py-3 pr-4">
                        <span className={`font-bold ${getPassagerColor(ratio)}`}>
                          {aeroport.passagers_disponibles.toLocaleString('fr-FR')}
                        </span>
                        <span className="text-slate-500"> / {aeroport.passagers_max.toLocaleString('fr-FR')}</span>
                      </td>
                      <td className="py-3 pr-4">
                        <div className="flex items-center gap-2">
                          <div className="w-24 h-2 bg-slate-700 rounded-full overflow-hidden">
                            <div 
                              className={`h-full ${
                                ratio >= 0.7 ? 'bg-emerald-500' :
                                ratio >= 0.4 ? 'bg-amber-500' : 'bg-red-500'
                              }`}
                              style={{ width: `${ratio * 100}%` }}
                            ></div>
                          </div>
                          <span className={`text-xs ${getPassagerColor(ratio)}`}>
                            {Math.round(ratio * 100)}%
                          </span>
                        </div>
                      </td>
                      <td className="py-3">
                        <div className="flex items-center gap-1">
                          {aeroport.tourisme && <span title="Touristique (+15%)">🏝️</span>}
                          {aeroport.taille === 'international' && (
                            <span className="text-xs px-1.5 py-0.5 rounded bg-purple-500/20 text-purple-300">-40%</span>
                          )}
                          {aeroport.taille === 'regional' && (
                            <span className="text-xs px-1.5 py-0.5 rounded bg-sky-500/20 text-sky-300">-20%</span>
                          )}
                          {aeroport.taille === 'military' && (
                            <span className="text-xs px-1.5 py-0.5 rounded bg-red-500/20 text-red-300">Mil.</span>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Stats globales */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className="card bg-purple-500/10 border-purple-500/30">
          <p className="text-sm text-purple-300">Aéroports internationaux</p>
          <p className="text-2xl font-bold text-purple-400">
            {aeroports.filter(a => a.taille === 'international').length}
          </p>
        </div>
        <div className="card bg-emerald-500/10 border-emerald-500/30">
          <p className="text-sm text-emerald-300">Total passagers disponibles</p>
          <p className="text-2xl font-bold text-emerald-400">
            {aeroports.reduce((sum, a) => sum + a.passagers_disponibles, 0).toLocaleString('fr-FR')}
          </p>
        </div>
        <div className="card bg-amber-500/10 border-amber-500/30">
          <p className="text-sm text-amber-300">Destinations touristiques</p>
          <p className="text-2xl font-bold text-amber-400">
            {aeroports.filter(a => a.tourisme).length}
          </p>
        </div>
        <div className="card bg-sky-500/10 border-sky-500/30">
          <p className="text-sm text-sky-300">Capacité max totale</p>
          <p className="text-2xl font-bold text-sky-400">
            {aeroports.reduce((sum, a) => sum + a.passagers_max, 0).toLocaleString('fr-FR')}
          </p>
        </div>
      </div>
    </div>
  );
}
