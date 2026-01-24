'use client';

import { useState } from 'react';
import { Users, Plane, TrendingUp, MapPin, RefreshCw, Radio, Navigation, Layers } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { WAYPOINTS_PTFS, ESPACES_AERIENS } from '@/lib/aeroports-ptfs';

interface AeroportData {
  code: string;
  nom: string;
  taille: 'international' | 'regional' | 'small' | 'military';
  tourisme: boolean;
  passagersMax: number;
  passagers_disponibles: number;
  passagers_max: number;
  derniere_regeneration: string | null;
  vor?: string;
  freq?: string;
}

interface Props {
  aeroports: AeroportData[];
}

// Positions des aéroports sur la carte (en pourcentage) - basé sur ATC24 Chart 2024
const POSITIONS: Record<string, { x: number; y: number }> = {
  // Nord
  'IDCS': { x: 50, y: 5 },     // Saba
  'ITKO': { x: 45, y: 12 },    // Tokyo Haneda
  'IPPH': { x: 65, y: 22 },    // Perth
  'ILKL': { x: 72, y: 26 },    // Lukla
  'SHV': { x: 70, y: 20 },     // Sea Haven
  
  // Nord-Ouest
  'IGRV': { x: 15, y: 42 },    // Grindavik
  'GOLDEN': { x: 12, y: 48 },  // Golden
  'OTVO': { x: 17, y: 46 },    // Otvo
  'KROTEN': { x: 10, y: 65 },  // Kroten
  'ISAU': { x: 15, y: 70 },    // Sauthemptona
  
  // Centre-Nord
  'IBTH': { x: 52, y: 42 },    // Saint Barthelemy
  'ORANGE': { x: 68, y: 28 },  // Orange
  
  // Centre
  'IBLT': { x: 48, y: 58 },    // Boltic
  'ICTAM': { x: 42, y: 60 },   // ICTAM
  'OOWO': { x: 52, y: 62 },    // Queen Blades
  'IMLR': { x: 45, y: 65 },    // Mellor
  'IRFD': { x: 52, y: 68 },    // Rockford
  'IGAR': { x: 38, y: 68 },    // Garry AFB
  
  // Centre-Est
  'ISCM': { x: 78, y: 42 },    // RAF Scampton
  'IJAF': { x: 90, y: 48 },    // Al Najaf
  'IZOL': { x: 85, y: 52 },    // Izolirani
  'ISKP': { x: 82, y: 58 },    // Skopelos
  'HOTDOG': { x: 80, y: 45 },  // Hotdog
  'DETOX': { x: 88, y: 68 },   // Detox
  
  // Sud
  'ITRN': { x: 55, y: 78 },    // Training Centre
  'ILAR': { x: 68, y: 80 },    // Larnaca
  'IPAP': { x: 78, y: 82 },    // Paphos
  'IBAR': { x: 80, y: 88 },    // Barra
  'IHEN': { x: 58, y: 92 },    // Henstridge
  'IIAB': { x: 75, y: 92 },    // McConnell AFB
  'HUNTER': { x: 78, y: 95 },  // Hunter
  'BARNIE': { x: 28, y: 82 },  // Barnie
};

// Positions des waypoints
const WAYPOINT_POSITIONS: Record<string, { x: number; y: number }> = {
  'SHELL': { x: 35, y: 8 },
  'SHIBA': { x: 40, y: 10 },
  'NIKON': { x: 48, y: 6 },
  'ASTRO': { x: 38, y: 15 },
  'LETSE': { x: 52, y: 12 },
  'HONDA': { x: 55, y: 14 },
  'CHILY': { x: 58, y: 10 },
  'CRAZY': { x: 70, y: 12 },
  'WELLS': { x: 75, y: 18 },
  'GULEG': { x: 35, y: 20 },
  'PIPER': { x: 45, y: 18 },
  'ONDER': { x: 52, y: 18 },
  'KNIFE': { x: 58, y: 18 },
  'TUDEP': { x: 48, y: 25 },
  'ALLRY': { x: 55, y: 25 },
  'BLANK': { x: 35, y: 30 },
  'GERLD': { x: 45, y: 30 },
  'RENDR': { x: 50, y: 30 },
  'JOOPY': { x: 55, y: 30 },
  'THENR': { x: 28, y: 35 },
  'ACRES': { x: 18, y: 38 },
  'YOUTH': { x: 32, y: 40 },
  'PROBE': { x: 50, y: 38 },
  'DINER': { x: 55, y: 40 },
  'EZYDB': { x: 32, y: 45 },
  'WELSH': { x: 48, y: 45 },
  'CAMEL': { x: 72, y: 45 },
  'DUNKS': { x: 78, y: 48 },
  'FRANK': { x: 12, y: 52 },
  'ENDER': { x: 35, y: 52 },
  'INDEX': { x: 50, y: 52 },
  'GAVIN': { x: 58, y: 52 },
  'SILVA': { x: 62, y: 55 },
  'CELAR': { x: 22, y: 55 },
  'SUNST': { x: 32, y: 55 },
  'BUCFA': { x: 38, y: 58 },
  'KUNAV': { x: 48, y: 58 },
  'SETHR': { x: 58, y: 58 },
  'OCEEN': { x: 62, y: 55 },
  'SHREK': { x: 18, y: 58 },
  'SPACE': { x: 28, y: 60 },
  'SAWPE': { x: 35, y: 62 },
  'HAWFA': { x: 48, y: 62 },
  'THACC': { x: 10, y: 60 },
  'HACKE': { x: 15, y: 68 },
  'BEANS': { x: 32, y: 68 },
  'LOGAN': { x: 42, y: 70 },
  'ATPEV': { x: 58, y: 65 },
  'LAVNO': { x: 55, y: 68 },
  'ANYMS': { x: 62, y: 72 },
  'GEORG': { x: 28, y: 72 },
  'SEEKS': { x: 25, y: 75 },
  'EXMOR': { x: 42, y: 75 },
  'JAMSI': { x: 58, y: 75 },
  'GRASS': { x: 65, y: 78 },
  'PEPUL': { x: 48, y: 80 },
  'GODLU': { x: 55, y: 80 },
  'LAZER': { x: 58, y: 82 },
  'ALDER': { x: 32, y: 85 },
  'STACK': { x: 35, y: 88 },
  'EMJAY': { x: 45, y: 90 },
  'ODOKU': { x: 52, y: 88 },
  'CANDLE': { x: 60, y: 88 },
  'AQWRT': { x: 65, y: 90 },
  'FORIA': { x: 70, y: 92 },
  'TRELN': { x: 42, y: 95 },
  'REAPR': { x: 50, y: 95 },
};

// Zones FIR approximatives
const FIR_ZONES = [
  { code: 'GRINDAVIK', points: [[5, 35], [25, 35], [25, 80], [5, 80]], color: 'rgba(255, 200, 0, 0.15)' },
  { code: 'BARTHELEMY', points: [[25, 25], [65, 25], [65, 55], [25, 55]], color: 'rgba(0, 200, 255, 0.15)' },
  { code: 'ROCKFORD', points: [[25, 55], [65, 55], [65, 85], [25, 85]], color: 'rgba(255, 100, 100, 0.15)' },
  { code: 'LARNACA', points: [[55, 70], [95, 70], [95, 100], [55, 100]], color: 'rgba(100, 255, 100, 0.15)' },
  { code: 'PERTH', points: [[55, 15], [85, 15], [85, 40], [55, 40]], color: 'rgba(200, 100, 255, 0.15)' },
  { code: 'IZOLIRANI', points: [[75, 40], [95, 40], [95, 70], [75, 70]], color: 'rgba(255, 150, 50, 0.15)' },
];

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
  
  // Toggles pour les couches
  const [showWaypoints, setShowWaypoints] = useState(false);
  const [showVOR, setShowVOR] = useState(false);
  const [showFIR, setShowFIR] = useState(false);

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

  const aeroportsTries = [...aeroports].sort((a, b) => b.passagers_disponibles - a.passagers_disponibles);

  // VOR avec positions (aéroports qui ont un VOR)
  const vorList = aeroports.filter(a => a.vor && a.freq);

  return (
    <div className="space-y-4">
      {/* Contrôles */}
      <div className="flex items-center justify-between flex-wrap gap-3">
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
        
        {/* Boutons couches */}
        {viewMode === 'carte' && (
          <div className="flex gap-2 flex-wrap">
            <button
              onClick={() => setShowFIR(!showFIR)}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors flex items-center gap-1.5 ${
                showFIR 
                  ? 'bg-amber-500/30 text-amber-300 border border-amber-500/50' 
                  : 'bg-slate-700 text-slate-400 hover:bg-slate-600'
              }`}
            >
              <Layers className="h-3.5 w-3.5" />
              FIR/Espaces
            </button>
            <button
              onClick={() => setShowVOR(!showVOR)}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors flex items-center gap-1.5 ${
                showVOR 
                  ? 'bg-cyan-500/30 text-cyan-300 border border-cyan-500/50' 
                  : 'bg-slate-700 text-slate-400 hover:bg-slate-600'
              }`}
            >
              <Radio className="h-3.5 w-3.5" />
              VOR/DME
            </button>
            <button
              onClick={() => setShowWaypoints(!showWaypoints)}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors flex items-center gap-1.5 ${
                showWaypoints 
                  ? 'bg-green-500/30 text-green-300 border border-green-500/50' 
                  : 'bg-slate-700 text-slate-400 hover:bg-slate-600'
              }`}
            >
              <Navigation className="h-3.5 w-3.5" />
              Waypoints
            </button>
          </div>
        )}

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
        <div className="grid lg:grid-cols-3 gap-6">
          {/* Carte */}
          <div className="lg:col-span-2 card p-0 overflow-hidden">
            <div 
              className="relative w-full"
              style={{ 
                aspectRatio: '4/3',
                background: 'linear-gradient(180deg, #0a1628 0%, #0d1f3c 50%, #0a1628 100%)'
              }}
            >
              {/* Grille de fond style radar */}
              <div className="absolute inset-0 opacity-20" style={{
                backgroundImage: `
                  linear-gradient(to right, #1e3a5f 1px, transparent 1px),
                  linear-gradient(to bottom, #1e3a5f 1px, transparent 1px)
                `,
                backgroundSize: '40px 40px'
              }}></div>

              {/* Zones FIR */}
              {showFIR && (
                <svg className="absolute inset-0 w-full h-full pointer-events-none">
                  {FIR_ZONES.map((zone, idx) => (
                    <g key={idx}>
                      <polygon
                        points={zone.points.map(p => `${p[0]}%,${p[1]}%`).join(' ')}
                        fill={zone.color}
                        stroke="rgba(255, 200, 0, 0.4)"
                        strokeWidth="1"
                        strokeDasharray="5,5"
                      />
                      <text
                        x={`${(zone.points[0][0] + zone.points[2][0]) / 2}%`}
                        y={`${(zone.points[0][1] + zone.points[2][1]) / 2}%`}
                        fill="rgba(255, 200, 0, 0.6)"
                        fontSize="10"
                        textAnchor="middle"
                        className="font-mono"
                      >
                        {zone.code}
                      </text>
                    </g>
                  ))}
                </svg>
              )}

              {/* Waypoints */}
              {showWaypoints && Object.entries(WAYPOINT_POSITIONS).map(([code, pos]) => (
                <div
                  key={code}
                  className="absolute transform -translate-x-1/2 -translate-y-1/2 group"
                  style={{ left: `${pos.x}%`, top: `${pos.y}%` }}
                >
                  <div className="w-0 h-0 border-l-[4px] border-r-[4px] border-b-[7px] border-l-transparent border-r-transparent border-b-green-400/70"></div>
                  <span className="absolute left-2 top-0 text-[8px] text-green-400/70 font-mono whitespace-nowrap opacity-0 group-hover:opacity-100 transition-opacity">
                    {code}
                  </span>
                </div>
              ))}

              {/* VOR/DME */}
              {showVOR && vorList.map((aeroport) => {
                const pos = POSITIONS[aeroport.code];
                if (!pos || !aeroport.vor) return null;
                return (
                  <div
                    key={`vor-${aeroport.code}`}
                    className="absolute transform -translate-x-1/2 -translate-y-1/2 pointer-events-none"
                    style={{ left: `${pos.x}%`, top: `${pos.y}%` }}
                  >
                    {/* Cercle VOR */}
                    <div className="w-8 h-8 rounded-full border border-cyan-400/50 flex items-center justify-center">
                      <div className="w-2 h-2 bg-cyan-400 rounded-full"></div>
                    </div>
                    {/* Label VOR */}
                    <div className="absolute -bottom-5 left-1/2 -translate-x-1/2 text-[8px] text-cyan-400 font-mono whitespace-nowrap bg-slate-900/80 px-1 rounded">
                      {aeroport.vor} {aeroport.freq}
                    </div>
                  </div>
                );
              })}

              {/* Aéroports */}
              {aeroports.map((aeroport) => {
                const pos = POSITIONS[aeroport.code];
                if (!pos) return null;
                
                const ratio = getPassagerRatio(aeroport);
                const isSelected = selectedAeroport?.code === aeroport.code;
                
                return (
                  <button
                    key={aeroport.code}
                    onClick={() => setSelectedAeroport(aeroport)}
                    className={`absolute transform -translate-x-1/2 -translate-y-1/2 transition-all duration-200 group z-20 ${
                      isSelected ? 'scale-150 z-30' : 'hover:scale-125'
                    }`}
                    style={{ left: `${pos.x}%`, top: `${pos.y}%` }}
                    title={`${aeroport.code} - ${aeroport.nom}`}
                  >
                    <div className={`w-4 h-4 rounded-full border-2 ${TAILLE_COLORS[aeroport.taille]} ${
                      isSelected ? 'ring-2 ring-white ring-offset-2 ring-offset-slate-900' : ''
                    }`}>
                      <div 
                        className="absolute -bottom-1 -right-1 w-2 h-2 rounded-full"
                        style={{
                          backgroundColor: ratio >= 0.7 ? '#10b981' : ratio >= 0.4 ? '#f59e0b' : '#ef4444'
                        }}
                      ></div>
                    </div>
                    
                    {aeroport.tourisme && (
                      <span className="absolute -top-3 -right-3 text-xs">🏝️</span>
                    )}
                    
                    <div className={`absolute left-1/2 -translate-x-1/2 -bottom-6 whitespace-nowrap bg-slate-900/95 px-1.5 py-0.5 rounded text-[10px] text-green-400 font-mono opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none ${
                      isSelected ? 'opacity-100' : ''
                    }`}>
                      {aeroport.code}
                    </div>
                  </button>
                );
              })}

              {/* Titre */}
              <div className="absolute top-3 left-3 bg-slate-900/90 px-3 py-2 rounded-lg border border-slate-700">
                <h3 className="text-sm font-bold text-green-400 font-mono">PTFS-ATC24 Chart</h3>
                <p className="text-xs text-slate-500">{aeroports.length} aéroports</p>
              </div>
            </div>
          </div>

          {/* Panel détails */}
          <div className="card">
            {selectedAeroport ? (
              <div className="space-y-4">
                <div className="flex items-start justify-between">
                  <div>
                    <h3 className="text-xl font-bold text-slate-100 font-mono">{selectedAeroport.code}</h3>
                    <p className="text-slate-400">{selectedAeroport.nom}</p>
                  </div>
                  {selectedAeroport.tourisme && (
                    <span className="text-2xl" title="Destination touristique">🏝️</span>
                  )}
                </div>

                <div className="flex items-center gap-2">
                  <div className={`w-3 h-3 rounded-full ${TAILLE_COLORS[selectedAeroport.taille].split(' ')[0]}`}></div>
                  <span className="text-slate-300">{TAILLE_LABELS[selectedAeroport.taille]}</span>
                </div>

                {/* VOR Info */}
                {selectedAeroport.vor && (
                  <div className="p-3 rounded-lg bg-cyan-500/10 border border-cyan-500/30">
                    <div className="flex items-center gap-2 text-cyan-300">
                      <Radio className="h-4 w-4" />
                      <span className="font-mono font-bold">{selectedAeroport.vor}</span>
                      {selectedAeroport.freq && (
                        <span className="text-cyan-400/70">{selectedAeroport.freq} MHz</span>
                      )}
                    </div>
                  </div>
                )}

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
                <p className="text-slate-400">Cliquez sur un aéroport</p>
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
                  <th className="pb-3 pr-4">VOR</th>
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
                          <span className="font-mono font-bold text-green-400">{aeroport.code}</span>
                          <span className="text-slate-400 truncate max-w-[150px]">{aeroport.nom}</span>
                        </div>
                      </td>
                      <td className="py-3 pr-4">
                        <div className="flex items-center gap-2">
                          <div className={`w-3 h-3 rounded-full ${TAILLE_COLORS[aeroport.taille].split(' ')[0]}`}></div>
                          <span className="text-slate-300 text-xs">{TAILLE_LABELS[aeroport.taille]}</span>
                        </div>
                      </td>
                      <td className="py-3 pr-4">
                        {aeroport.vor ? (
                          <span className="font-mono text-cyan-400 text-xs">{aeroport.vor} {aeroport.freq}</span>
                        ) : (
                          <span className="text-slate-600">-</span>
                        )}
                      </td>
                      <td className="py-3 pr-4">
                        <span className={`font-bold ${getPassagerColor(ratio)}`}>
                          {aeroport.passagers_disponibles.toLocaleString('fr-FR')}
                        </span>
                        <span className="text-slate-500 text-xs"> / {aeroport.passagers_max.toLocaleString('fr-FR')}</span>
                      </td>
                      <td className="py-3 pr-4">
                        <div className="flex items-center gap-2">
                          <div className="w-16 h-2 bg-slate-700 rounded-full overflow-hidden">
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
                            <span className="text-[10px] px-1 py-0.5 rounded bg-purple-500/20 text-purple-300">-40%</span>
                          )}
                          {aeroport.taille === 'regional' && (
                            <span className="text-[10px] px-1 py-0.5 rounded bg-sky-500/20 text-sky-300">-20%</span>
                          )}
                          {aeroport.taille === 'military' && (
                            <span className="text-[10px] px-1 py-0.5 rounded bg-red-500/20 text-red-300">Mil.</span>
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

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className="card bg-purple-500/10 border-purple-500/30">
          <p className="text-sm text-purple-300">Internationaux</p>
          <p className="text-2xl font-bold text-purple-400">
            {aeroports.filter(a => a.taille === 'international').length}
          </p>
        </div>
        <div className="card bg-emerald-500/10 border-emerald-500/30">
          <p className="text-sm text-emerald-300">Passagers disponibles</p>
          <p className="text-2xl font-bold text-emerald-400">
            {aeroports.reduce((sum, a) => sum + a.passagers_disponibles, 0).toLocaleString('fr-FR')}
          </p>
        </div>
        <div className="card bg-amber-500/10 border-amber-500/30">
          <p className="text-sm text-amber-300">Touristiques</p>
          <p className="text-2xl font-bold text-amber-400">
            {aeroports.filter(a => a.tourisme).length}
          </p>
        </div>
        <div className="card bg-cyan-500/10 border-cyan-500/30">
          <p className="text-sm text-cyan-300">Avec VOR/DME</p>
          <p className="text-2xl font-bold text-cyan-400">
            {aeroports.filter(a => a.vor).length}
          </p>
        </div>
      </div>
    </div>
  );
}
