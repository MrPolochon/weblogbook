'use client';

import { useState, useRef, useCallback } from 'react';
import { Users, Plane, TrendingUp, MapPin, RefreshCw, Radio, Navigation, Layers, ZoomIn, ZoomOut, Move } from 'lucide-react';
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
  vor?: string;
  freq?: string;
}

interface Props {
  aeroports: AeroportData[];
}

// Positions des aéroports sur la carte (en pourcentage) - basé sur carte PTFS
const POSITIONS: Record<string, { x: number; y: number }> = {
  // ORENJI - Nord
  'ITKO': { x: 46, y: 9 },     // Tokyo/Orenji
  'IDCS': { x: 50, y: 7 },     // Saba (sur Orenji)
  
  // PERTH - Nord-Est  
  'IPPH': { x: 80, y: 24 },    // Perth
  'ILKL': { x: 85, y: 22 },    // Lukla
  'IBRD': { x: 76, y: 28 },    // Bird Island
  
  // GRINDAVIK - Ouest
  'IGRV': { x: 15, y: 42 },    // Grindavik
  
  // SAUTHEMPTONA - Sud-Ouest
  'ISAU': { x: 14, y: 66 },    // Sauthemptona
  
  // SAINT BARTHELEMY - Centre
  'IBTH': { x: 58, y: 40 },    // Saint Barthelemy
  
  // IZOLIRANI - Est
  'IZOL': { x: 88, y: 40 },    // Izolirani
  'ISCM': { x: 92, y: 36 },    // RAF Scampton
  'IJAF': { x: 94, y: 44 },    // Al Najaf
  
  // GREATER ROCKFORD - Centre-Sud
  'IBLT': { x: 46, y: 52 },    // Boltic
  'IMLR': { x: 48, y: 62 },    // Mellor
  'IRFD': { x: 46, y: 70 },    // Rockford
  'IGAR': { x: 38, y: 66 },    // Garry AFB
  'ITRC': { x: 52, y: 76 },    // Training Centre
  
  // SKOPELOS - Est du centre
  'ISKP': { x: 78, y: 58 },    // Skopelos
  
  // CYPRUS - Sud-Est
  'ILAR': { x: 82, y: 82 },    // Larnaca
  'IPAP': { x: 90, y: 86 },    // Paphos
  'IBAR': { x: 78, y: 90 },    // Barra
  'IHEN': { x: 74, y: 88 },    // Henstridge
  'IIAB': { x: 86, y: 92 },    // McConnell AFB
  
  // Autres
  'IUFO': { x: 15, y: 55 },    // Oil Rig / UFO
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

// Espaces aériens (FIR) - polygones en pourcentage
const FIR_ZONES = [
  { 
    code: 'GRINDAVIK FIR', 
    points: [[5, 30], [28, 30], [28, 85], [5, 85]], 
    color: 'rgba(255, 200, 0, 0.08)',
    borderColor: 'rgba(255, 200, 0, 0.6)'
  },
  { 
    code: 'BARTHELEMY FIR', 
    points: [[28, 5], [70, 5], [70, 50], [28, 50]], 
    color: 'rgba(0, 200, 255, 0.08)',
    borderColor: 'rgba(0, 200, 255, 0.6)'
  },
  { 
    code: 'ROCKFORD FIR', 
    points: [[28, 50], [70, 50], [70, 100], [28, 100]], 
    color: 'rgba(255, 100, 100, 0.08)',
    borderColor: 'rgba(255, 100, 100, 0.6)'
  },
  { 
    code: 'PERTH FIR', 
    points: [[55, 5], [95, 5], [95, 35], [55, 35]], 
    color: 'rgba(200, 100, 255, 0.08)',
    borderColor: 'rgba(200, 100, 255, 0.6)'
  },
  { 
    code: 'IZOLIRANI FIR', 
    points: [[70, 35], [95, 35], [95, 70], [70, 70]], 
    color: 'rgba(255, 150, 50, 0.08)',
    borderColor: 'rgba(255, 150, 50, 0.6)'
  },
  { 
    code: 'LARNACA FIR', 
    points: [[55, 70], [95, 70], [95, 100], [55, 100]], 
    color: 'rgba(100, 255, 100, 0.08)',
    borderColor: 'rgba(100, 255, 100, 0.6)'
  },
];

// Îles stylisées basées sur la carte PTFS officielle
const ISLANDS = [
  // ORENJI - Nord, île allongée horizontale
  { 
    name: 'Orenji',
    path: 'M 38,8 L 42,6 L 48,5 L 52,6 L 54,8 L 52,11 L 48,13 L 44,14 L 40,13 L 37,11 Z',
    color: '#3d6b4d'
  },
  // PERTH - Nord-Est, grande île
  { 
    name: 'Perth',
    path: 'M 72,18 L 78,16 L 84,17 L 88,20 L 89,25 L 87,30 L 82,32 L 76,31 L 72,28 L 70,23 Z',
    color: '#3d6b4d'
  },
  // GRINDAVIK - Ouest
  { 
    name: 'Grindavik',
    path: 'M 12,38 L 17,36 L 20,38 L 21,43 L 19,47 L 14,48 L 10,45 L 10,40 Z',
    color: '#3d6b4d'
  },
  // SAINT BARTHELEMY - Centre
  { 
    name: 'Saint Barthelemy',
    path: 'M 54,35 L 60,34 L 64,36 L 66,40 L 64,44 L 58,46 L 53,44 L 51,40 L 52,37 Z',
    color: '#3d6b4d'
  },
  // IZOLIRANI - Est, grande île multicolore
  { 
    name: 'Izolirani',
    path: 'M 82,32 L 90,30 L 96,33 L 98,40 L 96,48 L 90,52 L 84,50 L 80,44 L 80,38 Z',
    color: '#4a7a5a'
  },
  // Zone désertique d'Izolirani
  { 
    name: 'Izolirani Desert',
    path: 'M 88,35 L 94,36 L 96,42 L 92,46 L 86,44 L 86,38 Z',
    color: '#c9a227'
  },
  // OIL RIG area (petite plateforme ouest)
  { 
    name: 'Oil Rig Platform',
    path: 'M 14,54 L 17,53 L 18,56 L 16,58 L 13,57 Z',
    color: '#4a5568'
  },
  // SAUTHEMPTONA - Sud-Ouest
  { 
    name: 'Sauthemptona',
    path: 'M 10,62 L 16,60 L 20,62 L 21,67 L 18,71 L 12,72 L 8,68 L 8,64 Z',
    color: '#3d6b4d'
  },
  // GREATER ROCKFORD - Grande île centrale complexe
  // Partie Nord
  { 
    name: 'Rockford North',
    path: 'M 40,48 L 48,46 L 54,48 L 56,54 L 52,58 L 44,58 L 38,54 L 38,50 Z',
    color: '#3d6b4d'
  },
  // Partie principale Sud
  { 
    name: 'Rockford Main',
    path: 'M 36,56 L 44,54 L 52,56 L 58,60 L 60,68 L 58,76 L 52,80 L 44,82 L 36,78 L 32,70 L 32,62 Z',
    color: '#2d5a3d'
  },
  // Petite île à côté de Rockford (HMS Carrier area)
  { 
    name: 'Rockford Islet',
    path: 'M 56,52 L 60,51 L 62,54 L 60,57 L 56,56 Z',
    color: '#4a7a5a'
  },
  // SKOPELOS - Est du centre
  { 
    name: 'Skopelos',
    path: 'M 74,54 L 80,52 L 84,54 L 85,59 L 82,63 L 76,64 L 72,60 L 72,56 Z',
    color: '#4a9f6a'
  },
  // CYPRUS - Sud-Est, grande île beige/désertique
  { 
    name: 'Cyprus',
    path: 'M 72,76 L 82,72 L 92,74 L 98,80 L 96,90 L 88,96 L 76,96 L 68,90 L 68,82 Z',
    color: '#c9a960'
  },
  // Détails verts sur Cyprus
  { 
    name: 'Cyprus Green',
    path: 'M 74,80 L 80,78 L 84,82 L 82,88 L 76,90 L 72,86 Z',
    color: '#5a7a5a'
  },
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
  
  // Couches
  const [showWaypoints, setShowWaypoints] = useState(false);
  const [showVOR, setShowVOR] = useState(false);
  const [showFIR, setShowFIR] = useState(true); // Activé par défaut
  
  // Zoom et pan
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [isDragging, setIsDragging] = useState(false);
  const [dragStart, setDragStart] = useState({ x: 0, y: 0 });
  const mapRef = useRef<HTMLDivElement>(null);

  const handleZoomIn = useCallback(() => {
    setZoom(z => Math.min(z + 0.25, 3));
  }, []);

  const handleZoomOut = useCallback(() => {
    setZoom(z => {
      const newZoom = Math.max(z - 0.25, 0.5);
      // Reset pan si on dézoome
      if (newZoom <= 1) {
        setPan({ x: 0, y: 0 });
      }
      return newZoom;
    });
  }, []);

  const handleResetView = useCallback(() => {
    setZoom(1);
    setPan({ x: 0, y: 0 });
  }, []);

  const handleWheel = useCallback((e: React.WheelEvent) => {
    e.preventDefault();
    if (e.deltaY < 0) {
      handleZoomIn();
    } else {
      handleZoomOut();
    }
  }, [handleZoomIn, handleZoomOut]);

  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    if (zoom > 1) {
      setIsDragging(true);
      setDragStart({ x: e.clientX - pan.x, y: e.clientY - pan.y });
    }
  }, [zoom, pan]);

  const handleMouseMove = useCallback((e: React.MouseEvent) => {
    if (isDragging && zoom > 1) {
      const newX = e.clientX - dragStart.x;
      const newY = e.clientY - dragStart.y;
      // Limiter le pan
      const maxPan = (zoom - 1) * 200;
      setPan({
        x: Math.max(-maxPan, Math.min(maxPan, newX)),
        y: Math.max(-maxPan, Math.min(maxPan, newY))
      });
    }
  }, [isDragging, zoom, dragStart]);

  const handleMouseUp = useCallback(() => {
    setIsDragging(false);
  }, []);

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
              Espaces aériens
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
          <div className="lg:col-span-2 card p-0 overflow-hidden relative">
            {/* Contrôles de zoom */}
            <div className="absolute top-3 right-3 z-30 flex flex-col gap-1">
              <button
                onClick={handleZoomIn}
                className="p-2 bg-slate-800/90 hover:bg-slate-700 text-slate-300 rounded-lg transition-colors"
                title="Zoomer"
              >
                <ZoomIn className="h-4 w-4" />
              </button>
              <button
                onClick={handleZoomOut}
                className="p-2 bg-slate-800/90 hover:bg-slate-700 text-slate-300 rounded-lg transition-colors"
                title="Dézoomer"
              >
                <ZoomOut className="h-4 w-4" />
              </button>
              {zoom !== 1 && (
                <button
                  onClick={handleResetView}
                  className="p-2 bg-slate-800/90 hover:bg-slate-700 text-slate-300 rounded-lg transition-colors"
                  title="Réinitialiser la vue"
                >
                  <Move className="h-4 w-4" />
                </button>
              )}
              <div className="text-center text-xs text-slate-400 bg-slate-800/90 rounded px-2 py-1">
                {Math.round(zoom * 100)}%
              </div>
            </div>

            <div 
              ref={mapRef}
              className="relative w-full overflow-hidden"
              style={{ 
                aspectRatio: '4/3',
                cursor: zoom > 1 ? (isDragging ? 'grabbing' : 'grab') : 'default'
              }}
              onWheel={handleWheel}
              onMouseDown={handleMouseDown}
              onMouseMove={handleMouseMove}
              onMouseUp={handleMouseUp}
              onMouseLeave={handleMouseUp}
            >
              {/* Conteneur zoomable */}
              <div
                className="absolute inset-0 transition-transform duration-100"
                style={{
                  transform: `scale(${zoom}) translate(${pan.x / zoom}px, ${pan.y / zoom}px)`,
                  transformOrigin: 'center center'
                }}
              >
                {/* Fond océan */}
                <div className="absolute inset-0 bg-gradient-to-b from-[#0a1a2e] via-[#0d2240] to-[#0a1628]"></div>

                {/* Grille de navigation style carte aéronautique */}
                <svg className="absolute inset-0 w-full h-full pointer-events-none opacity-20">
                  <defs>
                    <pattern id="grid" width="50" height="50" patternUnits="userSpaceOnUse">
                      <path d="M 50 0 L 0 0 0 50" fill="none" stroke="#3b82f6" strokeWidth="0.5"/>
                    </pattern>
                    <pattern id="gridLarge" width="100" height="100" patternUnits="userSpaceOnUse">
                      <path d="M 100 0 L 0 0 0 100" fill="none" stroke="#3b82f6" strokeWidth="1"/>
                    </pattern>
                  </defs>
                  <rect width="100%" height="100%" fill="url(#grid)" />
                  <rect width="100%" height="100%" fill="url(#gridLarge)" />
                </svg>

                {/* Îles - Carte vectorielle */}
                <svg className="absolute inset-0 w-full h-full pointer-events-none" viewBox="0 0 100 100" preserveAspectRatio="none">
                  <defs>
                    {/* Dégradé pour l'eau */}
                    <linearGradient id="waterGradient" x1="0%" y1="0%" x2="0%" y2="100%">
                      <stop offset="0%" stopColor="#1e3a5f" stopOpacity="0.3"/>
                      <stop offset="100%" stopColor="#0d2240" stopOpacity="0.3"/>
                    </linearGradient>
                    {/* Effet de relief pour les îles */}
                    <filter id="islandShadow" x="-20%" y="-20%" width="140%" height="140%">
                      <feDropShadow dx="0.3" dy="0.3" stdDeviation="0.5" floodColor="#000" floodOpacity="0.5"/>
                    </filter>
                  </defs>
                  
                  {/* Vagues d'eau subtiles */}
                  <rect width="100" height="100" fill="url(#waterGradient)" />
                  
                  {/* Rendu des îles */}
                  {ISLANDS.map((island, idx) => (
                    <g key={idx} filter="url(#islandShadow)">
                      <path
                        d={island.path}
                        fill={island.color}
                        stroke="#1a3d2a"
                        strokeWidth="0.3"
                        opacity="0.9"
                      />
                      {/* Effet côte claire */}
                      <path
                        d={island.path}
                        fill="none"
                        stroke="rgba(255,255,255,0.15)"
                        strokeWidth="0.2"
                      />
                    </g>
                  ))}
                </svg>

                {/* Espaces aériens (FIR) */}
                {showFIR && (
                  <svg className="absolute inset-0 w-full h-full pointer-events-none">
                    {FIR_ZONES.map((zone, idx) => (
                      <g key={idx}>
                        <polygon
                          points={zone.points.map(p => `${p[0]}%,${p[1]}%`).join(' ')}
                          fill={zone.color}
                          stroke={zone.borderColor}
                          strokeWidth="2"
                        />
                        <text
                          x={`${(zone.points[0][0] + zone.points[2][0]) / 2}%`}
                          y={`${(zone.points[0][1] + zone.points[2][1]) / 2}%`}
                          fill={zone.borderColor}
                          fontSize="11"
                          fontWeight="bold"
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
                  <h3 className="text-sm font-bold text-green-400 font-mono">Carte PTFS</h3>
                  <p className="text-xs text-slate-500">{aeroports.length} aéroports</p>
                </div>
              </div>
            </div>

            {/* Légende zoom */}
            {zoom > 1 && (
              <div className="absolute bottom-3 left-3 text-xs text-slate-400 bg-slate-900/80 px-2 py-1 rounded">
                Cliquez et glissez pour naviguer
              </div>
            )}
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
