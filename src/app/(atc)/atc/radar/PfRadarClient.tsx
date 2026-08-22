'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Plane, RefreshCw, ZoomIn, ZoomOut, RotateCcw } from 'lucide-react';
import { PLANE_BLIP_D } from '@/lib/radar-utils';
import { PF_AIRPORTS } from '@/lib/pf-airports';
import { PF_NM_TO_MAP, PF_RADAR_POSITIONS, scopeForPosition } from '@/lib/pf-radar';
import {
  PF_MAP_H,
  PF_MAP_W,
  pfTileUnit,
  altitudeToTrailColor,
} from '@/lib/pftester-odw';

type PfAircraft = {
  id: string;
  serverId: string;
  callsign: string;
  robloxUsername: string;
  heading: number;
  altitude: number;
  speed: number;
  model: string;
  livery: string;
  mapX: number;
  mapY: number;
  onGround?: boolean;
};

type TrailPt = { x: number; y: number; alt: number };
type MapTile = { key: string; z: number; x: number; y: number; left: number; top: number; width: number; height: number };
type MapBounds = { minX: number; minY: number; maxX: number; maxY: number };

const MIN_VIEW_ZOOM = 1;
const MAX_VIEW_ZOOM = 64;
const MAX_TILE_Z = 8;

function tileUrl(z: number, x: number, y: number): string {
  return `/api/pftester-odw/tiles/${z}/${x}/${y}`;
}

function clampViewZoom(z: number): number {
  return Math.max(MIN_VIEW_ZOOM, Math.min(MAX_VIEW_ZOOM, z));
}

function fittedMapSize(containerW: number, containerH: number): { dispW: number; dispH: number } {
  const availW = Math.max(80, containerW - 16);
  const availH = Math.max(80, containerH - 16);
  if (availW / availH > PF_MAP_W / PF_MAP_H) {
    return { dispW: availH * (PF_MAP_W / PF_MAP_H), dispH: availH };
  }
  return { dispW: availW, dispH: availW * (PF_MAP_H / PF_MAP_W) };
}

function visibleMapBounds(
  containerW: number,
  containerH: number,
  zoom: number,
  pan: { x: number; y: number },
): MapBounds {
  const { dispW, dispH } = fittedMapSize(containerW, containerH);
  const pad = 8;
  return {
    minX: PF_MAP_W * (0.5 + (-containerW / 2 - pan.x) / (zoom * dispW)) - pad,
    maxX: PF_MAP_W * (0.5 + (containerW / 2 - pan.x) / (zoom * dispW)) + pad,
    minY: PF_MAP_H * (0.5 + (-containerH / 2 - pan.y) / (zoom * dispH)) - pad,
    maxY: PF_MAP_H * (0.5 + (containerH / 2 - pan.y) / (zoom * dispH)) + pad,
  };
}

function tilesInBounds(tileZoom: number, bounds: MapBounds): MapTile[] {
  const n = 2 ** tileZoom;
  const unit = pfTileUnit(tileZoom);
  const x0 = Math.max(0, Math.floor(bounds.minX / unit) - 1);
  const y0 = Math.max(0, Math.floor(bounds.minY / unit) - 1);
  const x1 = Math.min(n - 1, Math.ceil(Math.min(PF_MAP_W, bounds.maxX) / unit) + 1);
  const y1 = Math.min(n - 1, Math.ceil(Math.min(PF_MAP_H, bounds.maxY) / unit) + 1);
  const list: MapTile[] = [];
  for (let y = y0; y <= y1; y++) {
    for (let x = x0; x <= x1; x++) {
      if (x * unit >= PF_MAP_W || y * unit >= PF_MAP_H) continue;
      list.push({
        key: `${tileZoom}-${x}-${y}`,
        z: tileZoom,
        x,
        y,
        left: x * unit,
        top: y * unit,
        width: unit,
        height: unit,
      });
    }
  }
  return list;
}

function viewForAirport(
  containerW: number,
  containerH: number,
  mapX: number,
  mapY: number,
  rangeNm: number,
): { zoom: number; pan: { x: number; y: number } } {
  const { dispW, dispH } = fittedMapSize(containerW, containerH);
  const rangeMap = Math.max(6, rangeNm * PF_NM_TO_MAP);
  const wantUnits = rangeMap * 2.4;
  const zoomX = (containerW * PF_MAP_W) / (Math.max(80, dispW) * wantUnits);
  const zoomY = (containerH * PF_MAP_H) / (Math.max(80, dispH) * wantUnits);
  const zoom = clampViewZoom(Math.min(zoomX, zoomY, 48));
  return {
    zoom,
    pan: {
      x: -((mapX / PF_MAP_W) - 0.5) * dispW * zoom,
      y: -((mapY / PF_MAP_H) - 0.5) * dispH * zoom,
    },
  };
}

export default function PfRadarClient({
  sessionAirport,
  sessionPosition,
}: {
  sessionAirport: string | null;
  sessionPosition: string | null;
}) {
  const sessionIsPf = Boolean(sessionAirport && PF_AIRPORTS.some((a) => a.code === sessionAirport));
  const [airportCode, setAirportCode] = useState(sessionIsPf ? sessionAirport! : 'MDPC');
  const [position, setPosition] = useState(sessionPosition || 'Tower');
  const [aircraft, setAircraft] = useState<PfAircraft[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [scopeLabel, setScopeLabel] = useState(scopeForPosition(sessionPosition || 'Tower').label);
  const [rangeNm, setRangeNm] = useState(scopeForPosition(sessionPosition || 'Tower').nm);
  const [zoom, setZoom] = useState(4);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [isPanning, setIsPanning] = useState(false);
  const panStartRef = useRef<{ x: number; y: number; mouseX: number; mouseY: number } | null>(null);
  const mapContainerRef = useRef<HTMLDivElement>(null);
  const [trails, setTrails] = useState<Record<string, TrailPt[]>>({});
  const [viewport, setViewport] = useState({ w: 900, h: 560 });
  const viewRef = useRef({ zoom: 4, pan: { x: 0, y: 0 } });
  viewRef.current = { zoom, pan };
  const fittedOnce = useRef(false);

  const airport = PF_AIRPORTS.find((a) => a.code === airportCode) ?? PF_AIRPORTS[0]!;

  const fetchTraffic = useCallback(async () => {
    try {
      const q = new URLSearchParams({
        airport: airportCode,
        position,
      });
      const res = await fetch(`/api/radar/pf-traffic?${q}`, { cache: 'no-store' });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || 'Erreur trafic');
      setAircraft(Array.isArray(data.aircraft) ? data.aircraft : []);
      if (data.scope?.label) setScopeLabel(data.scope.label);
      if (typeof data.scope?.nm === 'number') setRangeNm(data.scope.nm);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Erreur trafic');
    }
    setLoading(false);
  }, [airportCode, position]);

  useEffect(() => {
    setLoading(true);
    setTrails({});
    fetchTraffic();
    const t = setInterval(fetchTraffic, 1_000);
    return () => clearInterval(t);
  }, [fetchTraffic]);

  useEffect(() => {
    const el = mapContainerRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => {
      const r = el.getBoundingClientRect();
      if (r.width > 0 && r.height > 0) setViewport({ w: r.width, h: r.height });
    });
    ro.observe(el);
    const r = el.getBoundingClientRect();
    if (r.width > 0 && r.height > 0) setViewport({ w: r.width, h: r.height });
    return () => ro.disconnect();
  }, []);

  useEffect(() => {
    setTrails((prev) => {
      const next: Record<string, TrailPt[]> = {};
      let changed = false;
      for (const a of aircraft) {
        const pts = prev[a.id] ? prev[a.id].slice() : [];
        const last = pts[pts.length - 1];
        const dx = last ? a.mapX - last.x : 99;
        const dy = last ? a.mapY - last.y : 99;
        if (!last || dx * dx + dy * dy >= 0.03) {
          pts.push({ x: a.mapX, y: a.mapY, alt: a.altitude });
          if (pts.length > 90) pts.splice(0, pts.length - 90);
          changed = true;
        }
        next[a.id] = pts;
      }
      if (!changed && Object.keys(prev).length === Object.keys(next).length) {
        const sameIds = Object.keys(next).every((id) => prev[id]);
        if (sameIds) return prev;
      }
      return next;
    });
  }, [aircraft]);

  const applyZoomAt = useCallback((clientX: number, clientY: number, nextZoom: number) => {
    const z = clampViewZoom(nextZoom);
    const el = mapContainerRef.current;
    const cur = viewRef.current;
    if (!el || cur.zoom === z) {
      setZoom(z);
      return;
    }
    const rect = el.getBoundingClientRect();
    const cx = clientX - rect.left - rect.width / 2;
    const cy = clientY - rect.top - rect.height / 2;
    const k = z / cur.zoom;
    setPan({ x: cx * (1 - k) + cur.pan.x * k, y: cy * (1 - k) + cur.pan.y * k });
    setZoom(z);
  }, []);

  const updateZoom = useCallback((next: number) => {
    const el = mapContainerRef.current;
    if (!el) {
      setZoom(clampViewZoom(next));
      return;
    }
    const r = el.getBoundingClientRect();
    applyZoomAt(r.left + r.width / 2, r.top + r.height / 2, next);
  }, [applyZoomAt]);

  useEffect(() => {
    const el = mapContainerRef.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      applyZoomAt(e.clientX, e.clientY, viewRef.current.zoom * Math.exp(-e.deltaY * 0.0018));
    };
    el.addEventListener('wheel', onWheel, { passive: false });
    return () => el.removeEventListener('wheel', onWheel);
  }, [applyZoomAt]);

  function fitAirport() {
    const view = viewForAirport(viewport.w, viewport.h, airport.mapX, airport.mapY, rangeNm);
    setZoom(view.zoom);
    setPan(view.pan);
  }

  useEffect(() => {
    if (viewport.w < 100) return;
    if (!fittedOnce.current) {
      fittedOnce.current = true;
      fitAirport();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [viewport.w, viewport.h]);

  useEffect(() => {
    if (!fittedOnce.current || viewport.w < 100) return;
    fitAirport();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [airportCode, position, rangeNm]);

  function startPan(clientX: number, clientY: number) {
    panStartRef.current = { x: pan.x, y: pan.y, mouseX: clientX, mouseY: clientY };
    setIsPanning(true);
  }
  function movePan(clientX: number, clientY: number) {
    if (!panStartRef.current) return;
    setPan({
      x: panStartRef.current.x + (clientX - panStartRef.current.mouseX),
      y: panStartRef.current.y + (clientY - panStartRef.current.mouseY),
    });
  }
  function endPan() {
    panStartRef.current = null;
    setIsPanning(false);
  }

  const { dispW, dispH } = fittedMapSize(viewport.w, viewport.h);
  const tileZ = Math.max(
    1,
    Math.min(MAX_TILE_Z, Math.round(Math.log2(Math.max(2, (dispW * zoom) / PF_MAP_W)) + 0.25)),
  );
  const bounds = useMemo(
    () => visibleMapBounds(viewport.w, viewport.h, zoom, pan),
    [viewport.w, viewport.h, zoom, pan],
  );
  const tiles = useMemo(() => {
    if (tileZ <= 1) {
      return tilesInBounds(1, { minX: 0, minY: 0, maxX: PF_MAP_W, maxY: PF_MAP_H });
    }
    return tilesInBounds(tileZ, bounds);
  }, [tileZ, bounds]);
  const iconScale = 0.55 / zoom;
  const labelSize = 2.6 / zoom;
  const trailW = 0.55 / zoom;
  const ringR = rangeNm * PF_NM_TO_MAP;
  const selected = aircraft.find((a) => a.id === selectedId) ?? null;

  return (
    <div className="flex-1 min-h-0 w-full flex flex-col md:flex-row gap-3 md:gap-4" style={{ minHeight: '70vh' }}>
      <div
        className="flex-1 min-h-[420px] relative rounded-xl border border-emerald-700/40 bg-slate-950 overflow-hidden touch-none"
        ref={mapContainerRef}
        onDoubleClick={(e) => {
          e.preventDefault();
          applyZoomAt(e.clientX, e.clientY, viewRef.current.zoom * 2);
        }}
        onMouseDown={(e) => startPan(e.clientX, e.clientY)}
        onMouseMove={(e) => movePan(e.clientX, e.clientY)}
        onMouseUp={endPan}
        onMouseLeave={endPan}
        style={{ cursor: isPanning ? 'grabbing' : 'grab' }}
      >
        <div
          className="absolute inset-0"
          style={{
            transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})`,
            transformOrigin: 'center center',
          }}
        >
          <div className="absolute inset-0 flex items-center justify-center p-2">
            <div className="relative shrink-0" style={{ width: dispW, height: dispH }}>
              <div className="absolute inset-0 overflow-hidden bg-[#0b1c2c]">
                {tiles.map((t) => (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    key={t.key}
                    alt=""
                    draggable={false}
                    src={tileUrl(t.z, t.x, t.y)}
                    className="absolute max-w-none select-none pointer-events-none"
                    style={{
                      left: `${(t.left / PF_MAP_W) * 100}%`,
                      top: `${(t.top / PF_MAP_H) * 100}%`,
                      width: `${(t.width / PF_MAP_W) * 100}%`,
                      height: `${(t.height / PF_MAP_H) * 100}%`,
                    }}
                  />
                ))}
              </div>
              <svg viewBox={`0 0 ${PF_MAP_W} ${PF_MAP_H}`} className="absolute inset-0 w-full h-full pointer-events-none">
                <circle
                  cx={airport.mapX}
                  cy={airport.mapY}
                  r={ringR}
                  fill="rgba(16,185,129,0.08)"
                  stroke="#34d399"
                  strokeWidth={0.35 / zoom}
                  strokeDasharray={`${1.2 / zoom} ${0.8 / zoom}`}
                />
                <circle cx={airport.mapX} cy={airport.mapY} r={0.7 / zoom} fill="#34d399" />
                <text
                  x={airport.mapX + 1.4 / zoom}
                  y={airport.mapY - 1.2 / zoom}
                  fill="#6ee7b7"
                  fontSize={2.2 / zoom}
                  fontFamily="monospace"
                  fontWeight="bold"
                >
                  {airport.code}
                </text>
                {aircraft.map((a) => {
                  const isSelected = selectedId === a.id;
                  const color = isSelected ? '#fbbf24' : a.onGround ? '#a3e635' : '#22d3ee';
                  const trail = trails[a.id];
                  return (
                    <g
                      key={a.id}
                      className="pointer-events-auto"
                      style={{ cursor: 'pointer' }}
                      onClick={() => setSelectedId((prev) => (prev === a.id ? null : a.id))}
                    >
                      {trail && trail.length > 1
                        ? trail.slice(1).map((p, i) => (
                            <line
                              key={`${a.id}-t${i}`}
                              x1={trail[i].x}
                              y1={trail[i].y}
                              x2={p.x}
                              y2={p.y}
                              stroke={altitudeToTrailColor((trail[i].alt + p.alt) / 2)}
                              strokeWidth={isSelected ? trailW * 1.4 : trailW}
                              strokeLinecap="round"
                              opacity={isSelected ? 0.95 : 0.85}
                            />
                          ))
                        : null}
                      <circle cx={a.mapX} cy={a.mapY} r={Math.max(1.2, 10 / zoom)} fill="transparent" />
                      <g transform={`translate(${a.mapX},${a.mapY}) rotate(${a.heading}) scale(${iconScale})`}>
                        <path
                          d={PLANE_BLIP_D}
                          fill={color}
                          stroke="rgba(15,23,42,0.9)"
                          strokeWidth={0.35}
                          paintOrder="stroke fill"
                        />
                      </g>
                      <text
                        x={a.mapX + 2.2 / zoom}
                        y={a.mapY - 2.4 / zoom}
                        fill={color}
                        fontSize={labelSize}
                        fontFamily="monospace"
                        fontWeight="bold"
                        style={{ textShadow: '0 1px 2px rgba(0,0,0,0.9)' }}
                      >
                        {a.callsign || a.robloxUsername}
                      </text>
                    </g>
                  );
                })}
              </svg>
            </div>
          </div>
        </div>

        <div className="absolute top-3 left-3 z-10 rounded-lg bg-slate-900/90 border border-emerald-700/40 px-2.5 py-1.5 text-[11px] text-emerald-100 font-mono">
          {airport.code} · {position} · {scopeLabel}
        </div>

        <div className="absolute bottom-3 right-3 flex flex-col items-center gap-1.5 z-10">
          <span className="px-1.5 py-0.5 rounded-md bg-slate-900/90 border border-slate-600 text-[10px] font-mono text-cyan-200 tabular-nums">
            ×{zoom >= 10 ? Math.round(zoom) : zoom.toFixed(1)}
          </span>
          <button type="button" onClick={() => updateZoom(zoom * 1.6)} className="p-2 rounded-lg bg-slate-900/90 border border-slate-600 text-slate-200" title="Zoom +">
            <ZoomIn className="h-4 w-4" />
          </button>
          <button type="button" onClick={() => updateZoom(zoom / 1.6)} className="p-2 rounded-lg bg-slate-900/90 border border-slate-600 text-slate-200" title="Zoom −">
            <ZoomOut className="h-4 w-4" />
          </button>
          <button type="button" onClick={fitAirport} className="p-2 rounded-lg bg-slate-900/90 border border-slate-600 text-slate-200" title="Recentrer sur l’aéroport">
            <RotateCcw className="h-4 w-4" />
          </button>
        </div>
      </div>

      <div className="w-full md:w-[320px] shrink-0 rounded-xl border border-emerald-700/40 bg-slate-900/70 flex flex-col min-h-[220px] md:min-h-0">
        <div className="p-3 border-b border-slate-700/50 space-y-2">
          <div className="flex items-center justify-between gap-2">
            <p className="text-slate-200 text-sm font-semibold">Radar Project Flight</p>
            <button type="button" onClick={() => { setLoading(true); fetchTraffic(); }} className="p-1.5 rounded-md bg-slate-800 text-slate-300 hover:bg-slate-700" title="Actualiser">
              <RefreshCw className={`h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`} />
            </button>
          </div>
          {!sessionAirport && (
            <p className="text-[11px] text-amber-300/90">Pas en service — portée choisie à la main.</p>
          )}
          {sessionAirport && !sessionIsPf && (
            <p className="text-[11px] text-amber-300/90">
              Session {sessionAirport} (hors carte PF). Choisis un aéroport Project Flight ci-dessous.
            </p>
          )}
          <label className="block text-[11px] text-slate-500">
            Aéroport
            <select
              className="mt-1 w-full rounded-md bg-slate-800 border border-slate-600 px-2 py-1.5 text-xs font-mono text-emerald-200"
              value={airportCode}
              onChange={(e) => setAirportCode(e.target.value)}
            >
              {PF_AIRPORTS.map((a) => (
                <option key={a.code} value={a.code}>{a.code} — {a.name}</option>
              ))}
            </select>
          </label>
          <label className="block text-[11px] text-slate-500">
            Position
            <select
              className="mt-1 w-full rounded-md bg-slate-800 border border-slate-600 px-2 py-1.5 text-xs font-mono text-emerald-200"
              value={position}
              onChange={(e) => setPosition(e.target.value)}
            >
              {PF_RADAR_POSITIONS.map((p) => (
                <option key={p} value={p}>{p}</option>
              ))}
            </select>
          </label>
          <p className="text-[11px] text-slate-500">Serveur Mixou Airlines uniquement.</p>
          <p className="text-[11px] text-emerald-300/80 font-mono">
            {aircraft.length} avion{aircraft.length > 1 ? 's' : ''} · {rangeNm} NM
          </p>
        </div>
        <div className="flex-1 overflow-y-auto p-3 space-y-2">
          {error && <p className="text-red-400 text-xs">{error}</p>}
          {loading && aircraft.length === 0 && <p className="text-slate-500 text-sm text-center py-8">Chargement…</p>}
          {!loading && !error && aircraft.length === 0 && (
            <div className="text-center py-10 space-y-2">
              <Plane className="h-8 w-8 text-slate-600 mx-auto" />
              <p className="text-slate-500 text-sm">Aucun trafic dans cette portée.</p>
            </div>
          )}
          {aircraft.map((a) => (
            <button
              key={a.id}
              type="button"
              onClick={() => setSelectedId((prev) => (prev === a.id ? null : a.id))}
              className={`w-full text-left rounded-lg p-2.5 text-[11px] border transition ${
                selectedId === a.id
                  ? 'border-amber-400/50 bg-amber-950/30 text-slate-100'
                  : 'border-slate-700/50 bg-slate-800/50 text-slate-300 hover:border-emerald-700/50'
              }`}
            >
              <span className="font-mono font-bold text-cyan-300">{a.callsign || '—'}</span>
              <span className="text-slate-500 mx-1">·</span>
              <span className="text-slate-400">{a.robloxUsername}</span>
              {a.onGround ? <span className="ml-1 text-lime-400">GND</span> : null}
              <br />
              <span className="text-slate-500">{a.model || '—'}</span>
              <br />
              <span className="text-slate-500">
                FL{Math.max(0, Math.round(a.altitude / 100)).toString().padStart(3, '0')} · {a.speed} kt · {a.heading.toString().padStart(3, '0')}°
              </span>
            </button>
          ))}
          {selected && (
            <div className="rounded-lg border border-amber-500/30 bg-amber-950/20 p-2.5 text-[11px] text-slate-300">
              <p className="font-semibold text-amber-200 mb-1">Sélection</p>
              <p>{selected.callsign} — {selected.robloxUsername}</p>
              <p>{selected.model}</p>
              <p>Alt {Math.round(selected.altitude)} ft · {selected.speed} kt</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
