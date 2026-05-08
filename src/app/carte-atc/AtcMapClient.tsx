'use client';

import { useState, useCallback, useRef, useEffect, useMemo } from 'react';
import Link from 'next/link';
import { RefreshCw, Radio, Layers, ArrowLeft, Info, X, ZoomIn, ZoomOut, RotateCcw } from 'lucide-react';
import {
  AIRPORT_TO_FIR,
  DEFAULT_FIR_ZONES,
  DEFAULT_ISLANDS,
  DEFAULT_POSITIONS,
  DEFAULT_VORS,
  DEFAULT_WAYPOINTS,
  AIRPORT_NAMES,
  type FIRZone,
  type Island,
  type Point,
} from '@/lib/cartography-data';
import {
  buildRouteInfo,
  interpolateAlongRoute,
  getFlightPhase,
  PHASE_LABELS_FR,
  PLANE_BLIP_D,
  type FlightPhase,
} from '@/lib/radar-utils';

interface AtcSession {
  aeroport: string;
  position: string;
  started_at: string;
  callsign: string | null;
}

interface MapFlight {
  id: string;
  kind: 'civil' | 'military';
  numero_vol: string;
  aeroport_depart: string;
  aeroport_arrivee: string;
  type_vol: 'VFR' | 'IFR' | 'MIL';
  temps_prev_min: number;
  started_at: string;
  status: string;
  pilote_id: string | null;
  pilote_identifiant: string | null;
  discord_username: string | null;
  route: string | null;
  sid: string | null;
  star: string | null;
  /** Déplacement lié réparation externe → symbole / trace orange sur l’ODW. */
  operationnel_reparation?: boolean;
}

interface RenderFlight extends MapFlight {
  progress: number;
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  x: number;
  y: number;
  heading: number;
  routePath: Point[];
  flight_phase: FlightPhase;
  finished: boolean;
}

const POSITION_PRIORITY = ['Center', 'APP', 'DEP', 'Tower', 'Ground', 'Delivery', 'Clairance'] as const;

const OPS_REPARATION_COLOR = '#f97316'; // orange — acheminement réparation externe (ODW)

function mapFlightAccentColor(f: Pick<MapFlight, 'operationnel_reparation' | 'type_vol'>): string {
  if (f.operationnel_reparation) return OPS_REPARATION_COLOR;
  if (f.type_vol === 'VFR') return '#22c55e';
  if (f.type_vol === 'MIL') return '#a855f7';
  return '#ef4444';
}

function formatDuration(startedAt: string): string {
  const ms = Date.now() - new Date(startedAt).getTime();
  const mins = Math.floor(ms / 60000);
  if (mins < 60) return `${mins}min`;
  const h = Math.floor(mins / 60);
  return `${h}h${String(mins % 60).padStart(2, '0')}`;
}

function FourPointStar({ cx, cy, outerR, innerR, rotation = 0, fill, stroke, strokeWidth = 1, opacity = 1 }: {
  cx: number; cy: number; outerR: number; innerR: number; rotation?: number;
  fill: string; stroke: string; strokeWidth?: number; opacity?: number;
}) {
  const points: string[] = [];
  for (let i = 0; i < 8; i++) {
    const angle = (i * 45 + rotation) * (Math.PI / 180);
    const r = i % 2 === 0 ? outerR : innerR;
    points.push(`${cx + r * Math.cos(angle - Math.PI / 2)},${cy + r * Math.sin(angle - Math.PI / 2)}`);
  }
  return <polygon points={points.join(' ')} fill={fill} stroke={stroke} strokeWidth={strokeWidth} opacity={opacity} />;
}

function tracePointsForFlight(f: RenderFlight): string {
  if (f.routePath.length <= 2) {
    return `${f.x1},${f.y1} ${f.x},${f.y}`;
  }

  const clamped = Math.max(0, Math.min(1, f.progress));
  const dists: number[] = [0];
  for (let i = 1; i < f.routePath.length; i++) {
    const dx = f.routePath[i].x - f.routePath[i - 1].x;
    const dy = f.routePath[i].y - f.routePath[i - 1].y;
    dists.push(dists[i - 1] + Math.sqrt(dx * dx + dy * dy));
  }
  const total = dists[dists.length - 1];
  if (total <= 0) return `${f.x1},${f.y1} ${f.x},${f.y}`;

  const target = clamped * total;
  const pts: string[] = [`${f.routePath[0].x},${f.routePath[0].y}`];

  for (let i = 1; i < f.routePath.length; i++) {
    if (target >= dists[i]) {
      pts.push(`${f.routePath[i].x},${f.routePath[i].y}`);
      continue;
    }
    const seg = dists[i] - dists[i - 1];
    const t = seg > 0 ? (target - dists[i - 1]) / seg : 0;
    const ix = f.routePath[i - 1].x + (f.routePath[i].x - f.routePath[i - 1].x) * t;
    const iy = f.routePath[i - 1].y + (f.routePath[i].y - f.routePath[i - 1].y) * t;
    pts.push(`${ix},${iy}`);
    break;
  }

  return pts.join(' ');
}

function firHasCenterCoverage(
  fir: { code: string },
  centerAirports: Set<string>,
): boolean {
  return Object.entries(AIRPORT_TO_FIR).some(
    ([airportCode, firCode]) => firCode === fir.code && centerAirports.has(airportCode),
  );
}

export default function AtcMapClient() {
  const [sessions, setSessions] = useState<AtcSession[]>([]);
  const [flights, setFlights] = useState<MapFlight[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedAirport, setSelectedAirport] = useState<string | null>(null);
  const [selectedFlightId, setSelectedFlightId] = useState<string | null>(null);
  const mapContainerRef = useRef<HTMLDivElement>(null);
  const layersPanelRef = useRef<HTMLDivElement>(null);
  const [now, setNow] = useState(Date.now());
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [isPanning, setIsPanning] = useState(false);
  const panStartRef = useRef<{ x: number; y: number; mouseX: number; mouseY: number } | null>(null);
  // Support tactile : pinch-zoom (2 doigts) et pan (1 doigt)
  const pinchStartRef = useRef<{ distance: number; zoom: number } | null>(null);
  const [layersOpen, setLayersOpen] = useState(false);
  const [legendOpen, setLegendOpen] = useState(false);
  const legendRef = useRef<HTMLDivElement>(null);
  /** FIR sans Center en ligne : affichage optionnel (bleu). */
  const [showOptionalFirs, setShowOptionalFirs] = useState(false);
  const [showAirports, setShowAirports] = useState(true);
  const [showWaypoints, setShowWaypoints] = useState(true);
  const [showVors, setShowVors] = useState(true);

  const fetchMapData = useCallback(async () => {
    try {
      const [sessionsRes, flightsRes] = await Promise.all([
        fetch('/api/atc/online'),
        fetch('/api/carte-atc/flights'),
      ]);
      if (sessionsRes.ok) {
        const sessionsData = await sessionsRes.json();
        setSessions(Array.isArray(sessionsData) ? sessionsData : []);
      }
      if (flightsRes.ok) {
        const flightsData = await flightsRes.json();
        setFlights(Array.isArray(flightsData) ? flightsData : []);
      }
    } catch { /* ignore */ }
    setLoading(false);
  }, []);

  useEffect(() => { fetchMapData(); }, [fetchMapData]);

  useEffect(() => {
    const interval = setInterval(() => {
      fetchMapData();
    }, 10000);
    return () => clearInterval(interval);
  }, [fetchMapData]);

  useEffect(() => {
    function handleVisibilityOrFocus() {
      fetchMapData();
      setNow(Date.now());
    }
    window.addEventListener('focus', handleVisibilityOrFocus);
    document.addEventListener('visibilitychange', handleVisibilityOrFocus);
    return () => {
      window.removeEventListener('focus', handleVisibilityOrFocus);
      document.removeEventListener('visibilitychange', handleVisibilityOrFocus);
    };
  }, [fetchMapData]);

  useEffect(() => {
    const ticker = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(ticker);
  }, []);

  useEffect(() => {
    if (!layersOpen && !legendOpen) return;
    function onDocMouseDown(e: MouseEvent) {
      if (layersOpen && layersPanelRef.current && !layersPanelRef.current.contains(e.target as Node)) {
        setLayersOpen(false);
      }
      if (legendOpen && legendRef.current && !legendRef.current.contains(e.target as Node)) {
        setLegendOpen(false);
      }
    }
    document.addEventListener('mousedown', onDocMouseDown);
    return () => document.removeEventListener('mousedown', onDocMouseDown);
  }, [layersOpen, legendOpen]);

  const { sessionsByAirport, centerAirports } = useMemo(() => {
    const map = new Map<string, AtcSession[]>();
    sessions.forEach((s) => {
      const list = map.get(s.aeroport) || [];
      list.push(s);
      map.set(s.aeroport, list);
    });
    const center = new Set(
      sessions.filter((s) => s.position === 'Center').map((s) => s.aeroport),
    );
    return { sessionsByAirport: map, centerAirports: center };
  }, [sessions]);

  const airportsWithATC = Array.from(sessionsByAirport.entries())
    .map(([code, sess]) => ({
      code,
      name: AIRPORT_NAMES[code] || code,
      sessions: sess.sort((a, b) =>
        POSITION_PRIORITY.indexOf(a.position as typeof POSITION_PRIORITY[number]) -
        POSITION_PRIORITY.indexOf(b.position as typeof POSITION_PRIORITY[number])
      ),
    }))
    .sort((a, b) => b.sessions.length - a.sessions.length);

  const hasPosition = (code: string, pos: string) =>
    sessionsByAirport.get(code)?.some(s => s.position === pos) || false;

  const renderedFlights: RenderFlight[] = flights
    .map((f) => {
      const dep = DEFAULT_POSITIONS[f.aeroport_depart];
      const arr = DEFAULT_POSITIONS[f.aeroport_arrivee];
      if (!dep || !arr) return null;

      const x1 = dep.x * 10.24;
      const y1 = dep.y * 7.87;
      const x2 = arr.x * 10.24;
      const y2 = arr.y * 7.87;

      const startMs = new Date(f.started_at).getTime();
      if (Number.isNaN(startMs)) return null;
      const durationMs = Math.max(60_000, f.temps_prev_min * 60_000);
      const progressRaw = (now - startMs) / durationMs;
      const progress = Math.max(0, Math.min(1, progressRaw));

      const routeInfo = buildRouteInfo(
        f.aeroport_depart, f.aeroport_arrivee,
        f.route, f.sid, f.star,
      );
      const routePath = routeInfo.path;
      const hasRoute = routePath.length > 2;

      let x: number, y: number, heading: number;
      if (hasRoute) {
        const result = interpolateAlongRoute(routePath, progress);
        x = result.position.x;
        y = result.position.y;
        heading = result.heading;
      } else {
        x = x1 + (x2 - x1) * progress;
        y = y1 + (y2 - y1) * progress;
        const dx = x2 - x1;
        const dy = y2 - y1;
        heading = ((Math.atan2(dx, -dy) * 180) / Math.PI + 360) % 360;
      }

      return {
        ...f,
        progress,
        x1,
        y1,
        x2,
        y2,
        x,
        y,
        heading,
        routePath,
        flight_phase: getFlightPhase(routeInfo, progress),
        finished: progress >= 1,
      };
    })
    .filter((v): v is RenderFlight => Boolean(v))
    /** Cacher les transits OPS réparation arrivés à 100 % (filet si l’API a encore renvoyé la ligne quelques secondes). */
    .filter((f) => !(f.operationnel_reparation && f.finished));

  const selectedFlight = renderedFlights.find((f) => f.id === selectedFlightId) || null;

  useEffect(() => {
    if (!selectedFlightId || renderedFlights.some((f) => f.id === selectedFlightId)) return;
    setSelectedFlightId(null);
  }, [selectedFlightId, renderedFlights]);

  function updateZoom(next: number) {
    const clamped = Math.max(1, Math.min(10, Number(next.toFixed(2))));
    setZoom(clamped);
    if (clamped === 1) setPan({ x: 0, y: 0 });
  }

  function zoomIn() {
    updateZoom(zoom + 0.25);
  }

  function zoomOut() {
    updateZoom(zoom - 0.25);
  }

  function resetView() {
    setZoom(1);
    setPan({ x: 0, y: 0 });
  }

  function startPan(clientX: number, clientY: number) {
    if (zoom <= 1) return;
    panStartRef.current = { x: pan.x, y: pan.y, mouseX: clientX, mouseY: clientY };
    setIsPanning(true);
  }

  function movePan(clientX: number, clientY: number) {
    if (!panStartRef.current) return;
    const dx = clientX - panStartRef.current.mouseX;
    const dy = clientY - panStartRef.current.mouseY;
    setPan({ x: panStartRef.current.x + dx, y: panStartRef.current.y + dy });
  }

  function endPan() {
    panStartRef.current = null;
    setIsPanning(false);
  }

  // Gestion tactile : 1 doigt = pan, 2 doigts = pinch-zoom
  function touchDistance(touches: React.TouchList): number {
    if (touches.length < 2) return 0;
    const dx = touches[0].clientX - touches[1].clientX;
    const dy = touches[0].clientY - touches[1].clientY;
    return Math.hypot(dx, dy);
  }

  function handleTouchStart(e: React.TouchEvent) {
    if (e.touches.length === 2) {
      pinchStartRef.current = { distance: touchDistance(e.touches), zoom };
      panStartRef.current = null;
    } else if (e.touches.length === 1) {
      startPan(e.touches[0].clientX, e.touches[0].clientY);
    }
  }

  function handleTouchMove(e: React.TouchEvent) {
    if (e.touches.length === 2 && pinchStartRef.current) {
      e.preventDefault();
      const d = touchDistance(e.touches);
      const ratio = d / pinchStartRef.current.distance;
      updateZoom(pinchStartRef.current.zoom * ratio);
    } else if (e.touches.length === 1 && panStartRef.current) {
      movePan(e.touches[0].clientX, e.touches[0].clientY);
    }
  }

  function handleTouchEnd() {
    pinchStartRef.current = null;
    endPan();
  }

  return (
    <div className="min-h-screen bg-gradient-to-b from-slate-950 via-slate-900 to-slate-950">
      <header className="border-b border-slate-700/50 bg-slate-900/80 backdrop-blur-sm">
        <div className="max-w-[1600px] mx-auto px-3 sm:px-4 py-3 flex items-center justify-between gap-2">
          <div className="flex items-center gap-2 sm:gap-3 min-w-0">
            <Link href="/logbook" className="shrink-0 p-2 rounded-lg bg-slate-800 text-slate-300 hover:bg-slate-700" title="Retour">
              <ArrowLeft className="h-4 w-4" />
            </Link>
            <Radio className="h-5 w-5 sm:h-6 sm:w-6 text-emerald-400 shrink-0" />
            <h1 className="text-base sm:text-xl font-bold text-slate-100 truncate">Carte œil du web</h1>
            <span className="hidden sm:inline text-[10px] font-mono px-1.5 py-0.5 rounded border border-sky-500/40 text-sky-300/90" title="Œil du web">
              ODW
            </span>
            <span className="text-xs px-2 py-0.5 rounded-full bg-emerald-600/20 text-emerald-400 border border-emerald-600/30 whitespace-nowrap">
              {sessions.length} <span className="hidden sm:inline">contrôleur{sessions.length > 1 ? 's' : ''} </span>en ligne
            </span>
          </div>
          <button onClick={() => { setLoading(true); fetchMapData(); }} className="shrink-0 p-2 rounded-lg bg-slate-800 text-slate-300 hover:bg-slate-700" title="Actualiser">
            <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
          </button>
        </div>
      </header>

      <div className="max-w-[1600px] mx-auto p-2 sm:p-4 flex flex-col md:flex-row gap-3 md:gap-4" style={{ height: 'calc(100dvh - 60px)' }}>
        {/* Carte */}
        <div className="flex-1 min-h-0 relative rounded-xl border border-slate-700/50 bg-slate-800/30 overflow-hidden touch-none"
          ref={mapContainerRef}
          onWheel={(e) => {
            e.preventDefault();
            const delta = e.deltaY < 0 ? 0.18 : -0.18;
            updateZoom(zoom + delta);
          }}
          onMouseDown={(e) => startPan(e.clientX, e.clientY)}
          onMouseMove={(e) => movePan(e.clientX, e.clientY)}
          onMouseUp={endPan}
          onMouseLeave={endPan}
          onTouchStart={handleTouchStart}
          onTouchMove={handleTouchMove}
          onTouchEnd={handleTouchEnd}
          onTouchCancel={handleTouchEnd}
          style={{ cursor: zoom > 1 ? (isPanning ? 'grabbing' : 'grab') : 'default' }}
        >
          <div
            style={{
              width: '100%',
              height: '100%',
              transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})`,
              transformOrigin: 'center center',
              transition: isPanning ? 'none' : 'transform 0.12s ease-out',
            }}
          >
            <svg viewBox="0 0 1024 787" className="w-full h-full" style={{ background: 'linear-gradient(180deg, #0f172a 0%, #1a2744 50%, #0f172a 100%)' }}>
              {/* Grille radar */}
              <defs>
                <pattern id="radarGrid" x="0" y="0" width="64" height="49.19" patternUnits="userSpaceOnUse">
                  <path d="M 64 0 L 0 0 0 49.19" fill="none" stroke="rgba(100,150,200,0.06)" strokeWidth="0.5" />
                </pattern>
              </defs>
              <rect width="1024" height="787" fill="url(#radarGrid)" />

              {/* FIR contrôlés (Center en ligne) — toujours visibles */}
              {DEFAULT_FIR_ZONES.map((fir) => {
                if (!firHasCenterCoverage(fir, centerAirports)) return null;
                return (
                  <g key={fir.id}>
                    <polygon
                      points={fir.points.map(p => `${p.x},${p.y}`).join(' ')}
                      fill={fir.color}
                      stroke={fir.borderColor}
                      strokeWidth="2"
                      strokeDasharray="8 4"
                      opacity="0.9"
                    />
                    <text
                      x={fir.points.reduce((s, p) => s + p.x, 0) / fir.points.length}
                      y={fir.points.reduce((s, p) => s + p.y, 0) / fir.points.length}
                      fill={fir.borderColor}
                      fontSize="14"
                      fontFamily="monospace"
                      fontWeight="bold"
                      textAnchor="middle"
                      opacity="0.7"
                    >
                      {fir.name}
                    </text>
                  </g>
                );
              })}

              {/* FIR sans Center (affichage manuel, bleu) */}
              {showOptionalFirs && DEFAULT_FIR_ZONES.map((fir) => {
                if (firHasCenterCoverage(fir, centerAirports)) return null;
                return (
                  <g key={`opt-fir-${fir.id}`}>
                    <polygon
                      points={fir.points.map(p => `${p.x},${p.y}`).join(' ')}
                      fill="rgba(59,130,246,0.12)"
                      stroke="#3b82f6"
                      strokeWidth="2"
                      strokeDasharray="8 4"
                      opacity="0.88"
                    />
                    <text
                      x={fir.points.reduce((s, p) => s + p.x, 0) / fir.points.length}
                      y={fir.points.reduce((s, p) => s + p.y, 0) / fir.points.length}
                      fill="#93c5fd"
                      fontSize="14"
                      fontFamily="monospace"
                      fontWeight="bold"
                      textAnchor="middle"
                      opacity="0.75"
                    >
                      {fir.name}
                    </text>
                  </g>
                );
              })}

              {/* Iles */}
              {DEFAULT_ISLANDS.map(island => (
                <polygon
                  key={island.id}
                  points={island.points.map(p => `${p.x},${p.y}`).join(' ')}
                  fill={island.fill}
                  stroke={island.stroke}
                  strokeWidth="1.5"
                  opacity="0.18"
                />
              ))}

              {showWaypoints && DEFAULT_WAYPOINTS.map((waypoint) => {
                const x = waypoint.x * 10.24;
                const y = waypoint.y * 7.87;
                return (
                  <g key={waypoint.code} opacity="0.34">
                    <circle cx={x} cy={y} r="1.5" fill="#84cc16" />
                    <text x={x + 4} y={y - 3} fill="#bef264" fontSize="6" fontFamily="monospace">
                      {waypoint.code}
                    </text>
                  </g>
                );
              })}

              {showVors && DEFAULT_VORS.map((vor) => {
                const x = vor.x * 10.24;
                const y = vor.y * 7.87;
                return (
                  <g key={vor.code} opacity="0.4">
                    <circle cx={x} cy={y} r="6" fill="none" stroke="#22d3ee" strokeWidth="1" />
                    <circle cx={x} cy={y} r="2" fill="#22d3ee" />
                    <text x={x + 8} y={y - 6} fill="#67e8f9" fontSize="7" fontFamily="monospace">
                      {vor.code}
                    </text>
                  </g>
                );
              })}

              {/* Overlays ATC pour chaque aéroport */}
              {showAirports && Object.entries(DEFAULT_POSITIONS).map(([code, pos]) => {
                const x = pos.x * 10.24;
                const y = pos.y * 7.87;
                const hasATC = sessionsByAirport.has(code);
                const hasApp = hasPosition(code, 'APP');
                const hasDep = hasPosition(code, 'DEP');
                const hasTwr = hasPosition(code, 'Tower');
                const hasGnd = hasPosition(code, 'Ground');
                const hasDel = hasPosition(code, 'Delivery') || hasPosition(code, 'Clairance');

                return (
                  <g key={code} onClick={() => setSelectedAirport(selectedAirport === code ? null : code)} style={{ cursor: 'pointer' }}>
                    {/* APP - cercle bleu */}
                    {hasApp && (
                      <circle cx={x} cy={y} r="55" fill="rgba(59,130,246,0.06)" stroke="#3b82f6" strokeWidth="2" strokeDasharray="6 4" opacity="0.9">
                        <animate attributeName="r" values="52;58;52" dur="4s" repeatCount="indefinite" />
                      </circle>
                    )}

                    {/* DEP - cercle blanc */}
                    {hasDep && (
                      <circle cx={x} cy={y} r="45" fill="rgba(255,255,255,0.03)" stroke="rgba(255,255,255,0.5)" strokeWidth="1.5" strokeDasharray="5 5" opacity="0.8">
                        <animate attributeName="r" values="42;48;42" dur="5s" repeatCount="indefinite" />
                      </circle>
                    )}

                    {/* TWR - carré rouge */}
                    {hasTwr && (
                      <rect x={x - 16} y={y - 16} width="32" height="32" fill="rgba(239,68,68,0.12)" stroke="#ef4444" strokeWidth="2" rx="3" opacity="0.9" />
                    )}

                    {/* GND - étoile 4 branches cardinal (0°) */}
                    {hasGnd && (
                      <FourPointStar cx={x} cy={y} outerR={14} innerR={5} rotation={0} fill="rgba(245,158,11,0.8)" stroke="#f59e0b" strokeWidth={1.2} />
                    )}

                    {/* DEL/Clairance - étoile 4 branches 45° */}
                    {hasDel && (
                      <FourPointStar cx={x} cy={y} outerR={12} innerR={4} rotation={45} fill="rgba(16,185,129,0.8)" stroke="#10b981" strokeWidth={1.2} />
                    )}

                    {/* Point central aéroport */}
                    <circle cx={x} cy={y} r={hasATC ? 4 : 4} fill={hasATC ? '#10b981' : '#64748b'} stroke="white" strokeWidth={hasATC ? 1.5 : 1} opacity={hasATC ? 1 : 0.5} />

                    {/* Indicateur pulsant si ATC en ligne */}
                    {hasATC && (
                      <circle cx={x} cy={y} r="6" fill="none" stroke="#10b981" strokeWidth="1.5" opacity="0.6">
                        <animate attributeName="r" values="6;18;6" dur="2s" repeatCount="indefinite" />
                        <animate attributeName="opacity" values="0.6;0;0.6" dur="2s" repeatCount="indefinite" />
                      </circle>
                    )}

                    {/* Label aéroport */}
                    <text x={x} y={y + (hasATC ? 22 : 16)} fill={hasATC ? '#4ade80' : '#94a3b8'} fontSize={hasATC ? '9' : '7'} fontFamily="monospace" fontWeight={hasATC ? 'bold' : 'normal'} textAnchor="middle" style={{ textShadow: '0 1px 3px rgba(0,0,0,0.8)' }}>
                      {code}
                    </text>
                  </g>
                );
              })}

              {/* Trace (départ → position actuelle) : uniquement pour le vol sélectionné au clic (carte ou liste). */}
              {renderedFlights.map((f) => {
                if (selectedFlightId !== f.id) return null;
                const color = mapFlightAccentColor(f);
                return (
                  <polyline
                    key={`path-${f.id}`}
                    points={tracePointsForFlight(f)}
                    fill="none"
                    stroke={color}
                    strokeWidth={2}
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    opacity={0.95}
                  />
                );
              })}

              {/* Avions (un seul tracé de route en pointillés par vol — pas de seconde couche « parcouru » qui traversait la carte) */}
              {renderedFlights.map((f) => {
                const isSelected = selectedFlightId === f.id;
                const color = mapFlightAccentColor(f);
                return (
                  <g key={f.id}>
                    <g
                      style={{ cursor: 'pointer' }}
                      onClick={() => setSelectedFlightId((prev) => (prev === f.id ? null : f.id))}
                    >
                      <circle cx={f.x} cy={f.y} r="14" fill="transparent" />
                      <g transform={`translate(${f.x},${f.y}) rotate(${f.heading})`}>
                        <path
                          d={PLANE_BLIP_D}
                          fill={color}
                          stroke="rgba(15,23,42,0.85)"
                          strokeWidth={0.22}
                          strokeLinejoin="miter"
                          paintOrder="stroke fill"
                          opacity={0.98}
                        />
                      </g>
                      <text
                        x={f.x + 8}
                        y={f.y - 10}
                        fill={color}
                        fontSize="7"
                        fontFamily="monospace"
                        fontWeight="bold"
                        style={{ textShadow: '0 1px 3px rgba(0,0,0,0.9)' }}
                      >
                        {f.numero_vol}
                      </text>
                    </g>
                  </g>
                );
              })}
            </svg>
          </div>

          <div ref={layersPanelRef} className="absolute top-3 right-3 flex flex-col items-end gap-2">
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setLayersOpen((o) => !o)}
                className={`rounded-lg border p-2 backdrop-blur-sm transition-colors ${
                  layersOpen || showOptionalFirs || !showAirports || !showWaypoints || !showVors
                    ? 'bg-sky-600/25 border-sky-500/50 text-sky-200'
                    : 'bg-slate-900/90 border-slate-700/50 text-slate-200 hover:bg-slate-800'
                }`}
                title="Couches : FIR, aéroports, waypoints, VOR"
                aria-expanded={layersOpen}
              >
                <Layers className="h-4 w-4" />
              </button>
              <div className="rounded-lg bg-slate-900/90 border border-slate-700/50 p-1.5 flex items-center gap-1.5 backdrop-blur-sm">
                <button
                  onClick={zoomOut}
                  className="h-8 w-8 rounded-md bg-slate-800 text-slate-200 hover:bg-slate-700 disabled:opacity-30 flex items-center justify-center transition-colors"
                  title="Dézoomer"
                  disabled={zoom <= 1}
                >
                  <ZoomOut className="h-4 w-4" />
                </button>
                <span className="text-[11px] text-slate-300 min-w-[48px] text-center font-mono tabular-nums">{Math.round(zoom * 100)}%</span>
                <button
                  onClick={zoomIn}
                  className="h-8 w-8 rounded-md bg-slate-800 text-slate-200 hover:bg-slate-700 disabled:opacity-30 flex items-center justify-center transition-colors"
                  title="Zoomer"
                  disabled={zoom >= 10}
                >
                  <ZoomIn className="h-4 w-4" />
                </button>
                {zoom > 1 && (
                  <button
                    onClick={resetView}
                    className="h-8 w-8 rounded-md bg-slate-800 text-slate-200 hover:bg-slate-700 flex items-center justify-center transition-colors"
                    title="Réinitialiser"
                  >
                    <RotateCcw className="h-3.5 w-3.5" />
                  </button>
                )}
              </div>
            </div>

            {layersOpen && (
              <div className="rounded-lg bg-slate-900/95 border border-slate-600/50 p-3 text-xs text-slate-200 shadow-xl backdrop-blur-sm w-[220px] space-y-3">
                <p className="font-semibold text-slate-100">Couches carte</p>
                <label className="flex items-center justify-between gap-2 cursor-pointer">
                  <span>FIR (sans Center)</span>
                  <input
                    type="checkbox"
                    className="accent-sky-500"
                    checked={showOptionalFirs}
                    onChange={(e) => setShowOptionalFirs(e.target.checked)}
                  />
                </label>
                <label className="flex items-center justify-between gap-2 cursor-pointer">
                  <span>Aéroports</span>
                  <input
                    type="checkbox"
                    className="accent-sky-500"
                    checked={showAirports}
                    onChange={(e) => setShowAirports(e.target.checked)}
                  />
                </label>
                <label className="flex items-center justify-between gap-2 cursor-pointer">
                  <span>Waypoints</span>
                  <input
                    type="checkbox"
                    className="accent-sky-500"
                    checked={showWaypoints}
                    onChange={(e) => setShowWaypoints(e.target.checked)}
                  />
                </label>
                <label className="flex items-center justify-between gap-2 cursor-pointer">
                  <span>VOR</span>
                  <input
                    type="checkbox"
                    className="accent-sky-500"
                    checked={showVors}
                    onChange={(e) => setShowVors(e.target.checked)}
                  />
                </label>
                <p className="text-[10px] leading-relaxed text-slate-500 border-t border-slate-700/50 pt-2">
                  Les FIR avec une position Center en ligne restent affichés (style actuel), même si les autres FIR sont masqués.
                </p>
              </div>
            )}
          </div>

          {/* Légende toggle */}
          <div ref={legendRef} className="absolute bottom-3 left-3 flex flex-col items-start gap-2">
            <button
              type="button"
              onClick={() => setLegendOpen(o => !o)}
              className={`rounded-lg border p-2 backdrop-blur-sm transition-colors ${
                legendOpen
                  ? 'bg-sky-600/25 border-sky-500/50 text-sky-200'
                  : 'bg-slate-900/90 border-slate-700/50 text-slate-300 hover:bg-slate-800'
              }`}
              title="Légende"
            >
              <Info className="h-4 w-4" />
            </button>

            {legendOpen && (
              <div className="rounded-lg bg-slate-900/95 border border-slate-600/50 p-3 text-xs space-y-1.5 backdrop-blur-sm shadow-xl max-h-[60dvh] overflow-y-auto w-[210px]">
                <div className="flex items-center justify-between mb-2">
                  <p className="text-slate-300 font-semibold">Légende</p>
                  <button onClick={() => setLegendOpen(false)} className="text-slate-500 hover:text-slate-300 p-0.5">
                    <X className="h-3.5 w-3.5" />
                  </button>
                </div>
                <div className="flex items-center gap-2"><span className="w-4 h-4 rounded-full border-2 border-blue-500 bg-blue-500/10 shrink-0" /> <span className="text-slate-300">APP (Approche)</span></div>
                <div className="flex items-center gap-2"><span className="w-4 h-4 rounded-full border border-white/60 bg-white/5 shrink-0" /> <span className="text-slate-300">DEP (Départ)</span></div>
                <div className="flex items-center gap-2"><span className="w-3.5 h-3.5 rounded-sm border-2 border-red-500 bg-red-500/15 shrink-0" /> <span className="text-slate-300">TWR (Tour)</span></div>
                <div className="flex items-center gap-2">
                  <svg viewBox="0 0 16 16" className="w-4 h-4 shrink-0">
                    <FourPointStar cx={8} cy={8} outerR={7} innerR={2.5} rotation={0} fill="rgba(245,158,11,0.8)" stroke="#f59e0b" strokeWidth={0.8} />
                  </svg>
                  <span className="text-slate-300">GND (Sol)</span>
                </div>
                <div className="flex items-center gap-2">
                  <svg viewBox="0 0 16 16" className="w-4 h-4 shrink-0">
                    <FourPointStar cx={8} cy={8} outerR={7} innerR={2.5} rotation={45} fill="rgba(16,185,129,0.8)" stroke="#10b981" strokeWidth={0.8} />
                  </svg>
                  <span className="text-slate-300">DEL (Clairance)</span>
                </div>
                <div className="flex items-center gap-2"><span className="w-4 h-0 border-t-2 border-dashed border-amber-400 shrink-0" /> <span className="text-slate-300">FIR contrôlé</span></div>
                <div className="flex items-center gap-2"><span className="w-4 h-0 border-t-2 border-dashed border-blue-500 shrink-0" /> <span className="text-slate-300">FIR manuel</span></div>
                <div className="flex items-center gap-2">
                  <svg viewBox="0 0 16 16" className="w-4 h-4 shrink-0" aria-hidden>
                    <circle cx="8" cy="8" r="5" fill="none" stroke="#22d3ee" strokeWidth="1.2" />
                    <circle cx="8" cy="8" r="2" fill="#22d3ee" />
                  </svg>
                  <span className="text-slate-300">VOR</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="w-2 h-2 rounded-full bg-lime-400 shrink-0 ring-1 ring-lime-300/50" />
                  <span className="text-slate-300">Waypoint</span>
                </div>
                <div className="border-t border-slate-700/50 pt-2 mt-2 space-y-1.5">
                  <div className="flex items-center gap-2"><span className="w-4 h-0 border-t-2 border-dashed border-green-500 shrink-0" /> <span className="text-slate-300">Vol VFR</span></div>
                  <div className="flex items-center gap-2"><span className="w-4 h-0 border-t-2 border-dashed border-red-500 shrink-0" /> <span className="text-slate-300">Vol IFR</span></div>
                  <div className="flex items-center gap-2"><span className="w-4 h-0 border-t-2 border-dashed border-purple-500 shrink-0" /> <span className="text-slate-300">Vol militaire</span></div>
                  <div className="flex items-center gap-2"><span className="w-4 h-0 border-t-2 border-dashed shrink-0" style={{ borderColor: OPS_REPARATION_COLOR }} /> <span className="text-slate-300">Réparation ext.</span></div>
                </div>
              </div>
            )}
          </div>

          {selectedFlight && (
            <div className="absolute top-3 left-3 max-w-[340px] rounded-lg bg-slate-900/95 border border-slate-600/40 p-3 text-xs space-y-1.5 backdrop-blur-sm">
              <p className="text-slate-100 font-semibold text-sm">
                Plan de vol {selectedFlight.numero_vol}
                {selectedFlight.operationnel_reparation && (
                  <span
                    className="ml-2 align-middle px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wide"
                    style={{ backgroundColor: 'rgba(249,115,22,0.2)', color: OPS_REPARATION_COLOR }}
                  >
                    Réparation
                  </span>
                )}
              </p>
              <p className="text-slate-300">
                {selectedFlight.aeroport_depart} → {selectedFlight.aeroport_arrivee}
              </p>
              <div className="flex items-center gap-2">
                <span
                  className="px-2 py-0.5 rounded-full text-[11px] font-semibold"
                  style={{
                    backgroundColor: selectedFlight.operationnel_reparation
                      ? 'rgba(249,115,22,0.2)'
                      : selectedFlight.type_vol === 'VFR' ? 'rgba(34,197,94,0.18)' :
                      selectedFlight.type_vol === 'MIL' ? 'rgba(168,85,247,0.18)' :
                      'rgba(239,68,68,0.18)',
                    color: selectedFlight.operationnel_reparation
                      ? OPS_REPARATION_COLOR
                      : selectedFlight.type_vol === 'VFR' ? '#4ade80' :
                      selectedFlight.type_vol === 'MIL' ? '#c084fc' :
                      '#f87171',
                  }}
                >
                  {selectedFlight.operationnel_reparation ? 'OPS RÉPARATION' :
                    selectedFlight.type_vol === 'MIL' ? 'MILITAIRE' : selectedFlight.type_vol}
                </span>
                <span className="text-slate-400">
                  Durée prévue: {selectedFlight.temps_prev_min} min
                </span>
              </div>
              <p className="text-slate-200">
                <span className="text-slate-400">Statut : </span>
                <strong
                  className="font-semibold"
                  style={{
                    color:
                      selectedFlight.flight_phase === 'departing' ? '#60a5fa' :
                      selectedFlight.flight_phase === 'cruising' ? '#4ade80' :
                      selectedFlight.flight_phase === 'approaching' ? '#fbbf24' :
                      '#a78bfa',
                  }}
                >
                  {PHASE_LABELS_FR[selectedFlight.flight_phase]}
                </strong>
              </p>
              <p className="text-slate-400">
                Progression : {Math.round(selectedFlight.progress * 100)}%
              </p>
              <p className="text-slate-300">
                Pilote (ID site): {selectedFlight.pilote_identifiant || 'N/A'}
              </p>
              <p className="text-slate-300">
                Discord: {selectedFlight.discord_username || 'Non lié'}
              </p>
            </div>
          )}
        </div>

        {/* Panneau latéral */}
        <div className="w-full md:w-80 flex-shrink-0 max-h-[40dvh] md:max-h-none rounded-xl border border-slate-700/50 bg-slate-800/30 overflow-hidden flex flex-col">
          <div className="p-4 border-b border-slate-700/30">
            <h2 className="font-semibold text-slate-100 text-sm">Contrôleurs en ligne</h2>
          </div>
          <div className="flex-1 overflow-y-auto p-3 space-y-2">
            {loading && <p className="text-slate-500 text-sm text-center py-8">Chargement...</p>}
            {!loading && airportsWithATC.length === 0 && (
              <div className="text-center py-12 space-y-2">
                <Radio className="h-8 w-8 text-slate-600 mx-auto" />
                <p className="text-slate-500 text-sm">Aucun contrôleur en ligne</p>
              </div>
            )}
            {airportsWithATC.map(ap => (
              <button
                key={ap.code}
                onClick={() => setSelectedAirport(selectedAirport === ap.code ? null : ap.code)}
                className={`w-full text-left rounded-lg p-3 transition border ${
                  selectedAirport === ap.code
                    ? 'bg-emerald-900/20 border-emerald-600/30'
                    : 'bg-slate-800/40 border-slate-700/30 hover:bg-slate-700/40'
                }`}
              >
                <div className="flex items-center justify-between mb-1.5">
                  <span className="font-mono font-bold text-emerald-400 text-sm">{ap.code}</span>
                  <span className="text-slate-500 text-xs">{ap.name}</span>
                </div>
                <div className="space-y-1">
                  {ap.sessions.map(s => (
                    <div key={`${s.aeroport}-${s.position}`} className="flex items-center justify-between text-xs">
                      <div className="flex items-center gap-1.5">
                        <span className={`w-1.5 h-1.5 rounded-full ${
                          s.position === 'Center' ? 'bg-orange-400' :
                          s.position === 'APP' ? 'bg-blue-400' :
                          s.position === 'DEP' ? 'bg-white' :
                          s.position === 'Tower' ? 'bg-red-400' :
                          s.position === 'Ground' ? 'bg-amber-400' :
                          'bg-emerald-400'
                        }`} />
                        <span className="text-slate-300">{s.position}</span>
                      </div>
                      <div className="flex items-center gap-2">
                        {s.callsign && <span className="text-slate-500">{s.callsign}</span>}
                        <span className="text-slate-600">{formatDuration(s.started_at)}</span>
                      </div>
                    </div>
                  ))}
                </div>
              </button>
            ))}
            {!loading && renderedFlights.length > 0 && (
              <div className="mt-2 rounded-lg border border-slate-700/40 bg-slate-800/40 p-3 space-y-2">
                <p className="text-slate-300 text-xs font-semibold">Trafic affiché</p>
                {renderedFlights.map((f) => (
                  <button
                    key={f.id}
                    type="button"
                    onClick={() => setSelectedFlightId((prev) => (prev === f.id ? null : f.id))}
                    className={`w-full text-left rounded-md px-2 py-1.5 text-[11px] border transition flex items-start gap-2 ${
                      selectedFlightId === f.id
                        ? 'border-emerald-500/50 bg-emerald-950/30 text-slate-100'
                        : f.operationnel_reparation
                          ? 'border-orange-500/40 bg-orange-950/20 text-slate-300 hover:border-orange-400/55'
                          : 'border-slate-700/50 bg-slate-800/50 text-slate-300 hover:border-slate-600'
                    }`}
                  >
                    <span className="shrink-0 w-1 min-h-[2.25rem] rounded-full self-stretch mt-0.5" style={{ backgroundColor: mapFlightAccentColor(f) }} aria-hidden />

                    <span className="min-w-0">
                    <span className="font-mono font-bold">{f.numero_vol}</span>
                    <span className="text-slate-500 mx-1">·</span>
                    <span className="text-slate-400">
                      {f.aeroport_depart} → {f.aeroport_arrivee}
                    </span>
                    <br />
                    <span className="text-slate-500">{f.operationnel_reparation ? 'Réparation externe · ' : ''}Statut : {PHASE_LABELS_FR[f.flight_phase]}</span>

                    </span>
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
