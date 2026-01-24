'use client';

import { useState, useCallback } from 'react';
import { Users, Plane, TrendingUp, MapPin, RefreshCw, Radio, ZoomIn, ZoomOut, Move } from 'lucide-react';
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

// Positions des aéroports sur la carte ATC24 (en pourcentage) - calibré sur l'image
const POSITIONS: Record<string, { x: number; y: number }> = {
  // Nord - ORENJI
  'IDCS': { x: 55, y: 3 },      // Saba (petite île tout en haut)
  'ITKO': { x: 40, y: 12 },     // Tokyo/Haneda (Orenji)
  
  // Nord-Est - PERTH
  'IPPH': { x: 70, y: 17 },     // Perth
  'ILKL': { x: 76, y: 21 },     // Lukla
  
  // Ouest - GRINDAVIK
  'IGRV': { x: 14, y: 40 },     // Grindavik
  
  // Sud-Ouest - SAUTHEMPTONA
  'ISAU': { x: 12, y: 66 },     // Sauthemptona
  
  // Centre - BARTHELEMY
  'IBTH': { x: 56, y: 38 },     // Saint Barthelemy
  
  // Centre-Sud - ROCKFORD
  'IMLR': { x: 36, y: 53 },     // Mellor
  'IBLT': { x: 38, y: 56 },     // Boltic
  'IRFD': { x: 44, y: 63 },     // Greater Rockford
  'IGAR': { x: 36, y: 65 },     // Garry AFB
  'ITRC': { x: 52, y: 76 },     // Training Centre
  
  // Est - IZOLIRANI
  'ISCM': { x: 83, y: 38 },     // RAF Scampton
  'IZOL': { x: 88, y: 46 },     // Izolirani
  'IJAF': { x: 92, y: 44 },     // Al Najaf
  
  // Centre-Est - SKOPELOS
  'ISKP': { x: 74, y: 54 },     // Skopelos
  
  // Sud-Est - LARNACA/CYPRUS
  'ILAR': { x: 74, y: 80 },     // Larnaca
  'IPAP': { x: 84, y: 85 },     // Paphos
  'IBAR': { x: 80, y: 88 },     // Barra
  'IHEN': { x: 70, y: 90 },     // Henstridge
  'IIAB': { x: 76, y: 92 },     // McConnell AFB
  
  // Autres
  'IBRD': { x: 68, y: 24 },     // Bird Island (près de Perth)
  'IUFO': { x: 17, y: 46 },     // Oil Rig area
};

// L'image de fond contient déjà les FIR, waypoints, îles, etc.

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
  
  // Zoom et pan
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [isDragging, setIsDragging] = useState(false);
  const [dragStart, setDragStart] = useState({ x: 0, y: 0 });

  const handleZoomIn = useCallback(() => {
    setZoom(z => Math.min(z + 0.25, 3));
  }, []);

  const handleZoomOut = useCallback(() => {
    setZoom(z => {
      const newZoom = Math.max(z - 0.25, 0.5);
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
              className="relative w-full overflow-hidden"
              style={{ 
                aspectRatio: '1024/787',
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
                {/* Image de fond - Carte PTFS avec FIR, waypoints, VOR */}
                <img 
                  src="/ptfs-map.png" 
                  alt="Carte PTFS" 
                  className="absolute inset-0 w-full h-full object-fill"
                  draggable={false}
                />

                {/* Aéroports - Marqueurs par-dessus l'image */}
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
