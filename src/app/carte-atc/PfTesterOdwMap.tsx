'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Crosshair, LocateFixed, Plane, RefreshCw, RotateCcw, ZoomIn, ZoomOut } from 'lucide-react';
import { PLANE_BLIP_D } from '@/lib/radar-utils';
import {
  PF_MAP_H,
  PF_MAP_W,
  pfTileUnit,
  altitudeToTrailColor,
  gameToMap,
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
  x?: number;
  y?: number;
  mapX: number;
  mapY: number;
};

type TrailPt = { x: number; y: number; alt: number };
type MapTile = { key: string; z: number; x: number; y: number; left: number; top: number; width: number; height: number };
type MapBounds = { minX: number; minY: number; maxX: number; maxY: number };
type ViewState = { zoom: number; pan: { x: number; y: number } };

const MIN_VIEW_ZOOM = 1;
const MAX_VIEW_ZOOM = 48;
const MAX_TILE_Z = 8;
const FIT_ZOOM = 1;
const FOCUS_ZOOM = 8;
const KEEP_MAP_PX = 96;

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

function clampPan(
  pan: { x: number; y: number },
  zoom: number,
  containerW: number,
  containerH: number,
  dispW: number,
  dispH: number,
): { x: number; y: number } {
  const mapW = dispW * zoom;
  const mapH = dispH * zoom;
  const maxX = Math.max(0, (mapW + containerW) / 2 - KEEP_MAP_PX);
  const maxY = Math.max(0, (mapH + containerH) / 2 - KEEP_MAP_PX);
  return {
    x: Math.max(-maxX, Math.min(maxX, pan.x)),
    y: Math.max(-maxY, Math.min(maxY, pan.y)),
  };
}

function panToMapPoint(
  mapX: number,
  mapY: number,
  zoom: number,
  dispW: number,
  dispH: number,
): { x: number; y: number } {
  return {
    x: -((mapX / PF_MAP_W) - 0.5) * dispW * zoom,
    y: -((mapY / PF_MAP_H) - 0.5) * dispH * zoom,
  };
}

function visibleMapBounds(
  containerW: number,
  containerH: number,
  zoom: number,
  pan: { x: number; y: number },
): MapBounds {
  const { dispW, dispH } = fittedMapSize(containerW, containerH);
  const pad = 16;
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

function wheelZoomFactor(e: WheelEvent): number {
  let dy = e.deltaY;
  if (e.deltaMode === 1) dy *= 16;
  if (e.deltaMode === 2) dy *= 120;
  const sensitivity = e.ctrlKey ? 0.01 : Math.abs(dy) > 50 ? 0.0026 : 0.0018;
  return Math.exp(-dy * sensitivity);
}

function TileLayer({ tiles }: { tiles: MapTile[] }) {
  return (
    <>
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
            width: `${(t.width / PF_MAP_W) * 100 + 0.08}%`,
            height: `${(t.height / PF_MAP_H) * 100 + 0.12}%`,
          }}
          onError={(e) => {
            e.currentTarget.style.visibility = 'hidden';
          }}
        />
      ))}
    </>
  );
}

export default function PfTesterOdwMap() {
  const [aircraft, setAircraft] = useState<PfAircraft[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [followId, setFollowId] = useState<string | null>(null);
  const [zoom, setZoom] = useState(FIT_ZOOM);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [isPanning, setIsPanning] = useState(false);
  const panStartRef = useRef<{ x: number; y: number; mouseX: number; mouseY: number } | null>(null);
  const pointersRef = useRef(new Map<number, { x: number; y: number }>());
  const pinchStartRef = useRef<{
    distance: number;
    zoom: number;
    pan: { x: number; y: number };
  } | null>(null);
  const mapContainerRef = useRef<HTMLDivElement>(null);
  const [trails, setTrails] = useState<Record<string, TrailPt[]>>({});
  const [viewport, setViewport] = useState({ w: 900, h: 560 });
  const viewRef = useRef<ViewState>({ zoom: FIT_ZOOM, pan: { x: 0, y: 0 } });
  viewRef.current = { zoom, pan };
  const dragRef = useRef({ x: 0, y: 0, moved: false });
  const rafRef = useRef(0);
  const pendingViewRef = useRef<ViewState | null>(null);

  const { dispW, dispH } = fittedMapSize(viewport.w, viewport.h);

  const applyView = useCallback((next: ViewState) => {
    const z = clampViewZoom(next.zoom);
    const p = clampPan(next.pan, z, viewport.w, viewport.h, dispW, dispH);
    pendingViewRef.current = { zoom: z, pan: p };
    if (rafRef.current) return;
    rafRef.current = requestAnimationFrame(() => {
      rafRef.current = 0;
      const v = pendingViewRef.current;
      if (!v) return;
      viewRef.current = v;
      setZoom(v.zoom);
      setPan(v.pan);
    });
  }, [viewport.w, viewport.h, dispW, dispH]);

  const fetchFlights = useCallback(async () => {
    try {
      const res = await fetch('/api/pftester-odw/flights', { cache: 'no-store' });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || 'Erreur trafic');
      setAircraft(Array.isArray(data.aircraft) ? data.aircraft : []);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Erreur trafic');
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    setLoading(true);
    setTrails({});
    fetchFlights();
    const t = setInterval(fetchFlights, 1_000);
    return () => clearInterval(t);
  }, [fetchFlights]);

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

  useEffect(() => () => {
    if (rafRef.current) cancelAnimationFrame(rafRef.current);
  }, []);

  const plotted = useMemo(
    () =>
      aircraft.map((a) => {
        if (typeof a.x !== 'number' || typeof a.y !== 'number') return a;
        const m = gameToMap(a.x, a.y);
        return { ...a, mapX: m.mapX, mapY: m.mapY };
      }),
    [aircraft],
  );

  useEffect(() => {
    setTrails((prev) => {
      const next: Record<string, TrailPt[]> = {};
      let changed = false;
      for (const a of plotted) {
        const y = a.mapY;
        const pts = prev[a.id] ? prev[a.id].slice() : [];
        const last = pts[pts.length - 1];
        const dx = last ? a.mapX - last.x : 99;
        const dy = last ? y - last.y : 99;
        if (!last || dx * dx + dy * dy >= 0.03) {
          pts.push({ x: a.mapX, y, alt: a.altitude });
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
  }, [plotted]);

  const applyZoomAt = useCallback((clientX: number, clientY: number, nextZoom: number) => {
    const z = clampViewZoom(nextZoom);
    const el = mapContainerRef.current;
    const cur = viewRef.current;
    if (!el || cur.zoom === z) {
      applyView({ zoom: z, pan: cur.pan });
      return;
    }
    const rect = el.getBoundingClientRect();
    const cx = clientX - rect.left - rect.width / 2;
    const cy = clientY - rect.top - rect.height / 2;
    const k = z / cur.zoom;
    applyView({
      zoom: z,
      pan: { x: cx * (1 - k) + cur.pan.x * k, y: cy * (1 - k) + cur.pan.y * k },
    });
  }, [applyView]);

  const updateZoom = useCallback((next: number) => {
    const el = mapContainerRef.current;
    if (!el) {
      applyView({ zoom: next, pan: viewRef.current.pan });
      return;
    }
    const r = el.getBoundingClientRect();
    applyZoomAt(r.left + r.width / 2, r.top + r.height / 2, next);
  }, [applyView, applyZoomAt]);

  const focusAircraft = useCallback((a: PfAircraft, nextZoom = Math.max(viewRef.current.zoom, FOCUS_ZOOM)) => {
    const z = clampViewZoom(nextZoom);
    applyView({ zoom: z, pan: panToMapPoint(a.mapX, a.mapY, z, dispW, dispH) });
  }, [applyView, dispW, dispH]);

  const resetView = useCallback(() => {
    setFollowId(null);
    applyView({ zoom: FIT_ZOOM, pan: { x: 0, y: 0 } });
  }, [applyView]);

  useEffect(() => {
    if (!followId) return;
    const a = plotted.find((p) => p.id === followId);
    if (!a) {
      setFollowId(null);
      return;
    }
    applyView({
      zoom: viewRef.current.zoom,
      pan: panToMapPoint(a.mapX, a.mapY, viewRef.current.zoom, dispW, dispH),
    });
  }, [followId, plotted, applyView, dispW, dispH]);

  useEffect(() => {
    const el = mapContainerRef.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      applyZoomAt(e.clientX, e.clientY, viewRef.current.zoom * wheelZoomFactor(e));
    };
    el.addEventListener('wheel', onWheel, { passive: false });
    return () => el.removeEventListener('wheel', onWheel);
  }, [applyZoomAt]);

  useEffect(() => {
    const el = mapContainerRef.current;
    if (!el) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLSelectElement) return;
      const cur = viewRef.current;
      if (e.key === '+' || e.key === '=') {
        e.preventDefault();
        updateZoom(cur.zoom * 1.35);
      } else if (e.key === '-' || e.key === '_') {
        e.preventDefault();
        updateZoom(cur.zoom / 1.35);
      } else if (e.key === '0' || e.key === 'Home') {
        e.preventDefault();
        resetView();
      } else if (e.key === 'f' || e.key === 'F') {
        e.preventDefault();
        if (selectedId) setFollowId((prev) => (prev === selectedId ? null : selectedId));
      } else if (e.key.startsWith('Arrow')) {
        e.preventDefault();
        const step = (e.shiftKey ? 120 : 48);
        const dx = e.key === 'ArrowLeft' ? step : e.key === 'ArrowRight' ? -step : 0;
        const dy = e.key === 'ArrowUp' ? step : e.key === 'ArrowDown' ? -step : 0;
        setFollowId(null);
        applyView({ zoom: cur.zoom, pan: { x: cur.pan.x + dx, y: cur.pan.y + dy } });
      }
    };
    el.addEventListener('keydown', onKey);
    return () => el.removeEventListener('keydown', onKey);
  }, [applyView, resetView, selectedId, updateZoom]);

  function startPan(clientX: number, clientY: number) {
    dragRef.current = { x: clientX, y: clientY, moved: false };
    panStartRef.current = { x: viewRef.current.pan.x, y: viewRef.current.pan.y, mouseX: clientX, mouseY: clientY };
    setIsPanning(true);
  }
  function movePan(clientX: number, clientY: number) {
    if (!panStartRef.current) return;
    if (Math.hypot(clientX - dragRef.current.x, clientY - dragRef.current.y) > 5) {
      dragRef.current.moved = true;
      setFollowId(null);
    }
    applyView({
      zoom: viewRef.current.zoom,
      pan: {
        x: panStartRef.current.x + (clientX - panStartRef.current.mouseX),
        y: panStartRef.current.y + (clientY - panStartRef.current.mouseY),
      },
    });
  }
  function endPan() {
    panStartRef.current = null;
    setIsPanning(false);
  }

  function pointerMid(): { x: number; y: number; distance: number } | null {
    const pts = [...pointersRef.current.values()];
    if (pts.length < 2) return null;
    return {
      x: (pts[0]!.x + pts[1]!.x) / 2,
      y: (pts[0]!.y + pts[1]!.y) / 2,
      distance: Math.hypot(pts[0]!.x - pts[1]!.x, pts[0]!.y - pts[1]!.y),
    };
  }

  const tileZ = Math.max(
    1,
    Math.min(MAX_TILE_Z, Math.floor(Math.log2(Math.max(2, (dispW * zoom) / PF_MAP_W)))),
  );
  const bounds = useMemo(
    () => visibleMapBounds(viewport.w, viewport.h, zoom, pan),
    [viewport.w, viewport.h, zoom, pan],
  );
  const baseTiles = useMemo(
    () => tilesInBounds(1, { minX: 0, minY: 0, maxX: PF_MAP_W, maxY: PF_MAP_H }),
    [],
  );
  const detailTiles = useMemo(
    () => (tileZ <= 1 ? [] : tilesInBounds(tileZ, bounds)),
    [tileZ, bounds],
  );
  const markerScale = 1 / zoom;
  const trailW = 0.55 / zoom;
  const selected = plotted.find((a) => a.id === selectedId) ?? null;

  function selectAircraft(id: string, fromList = false) {
    setSelectedId((prev) => {
      const next = prev === id ? null : id;
      if (!next) setFollowId(null);
      return next;
    });
    if (fromList) {
      const a = plotted.find((p) => p.id === id);
      if (a && selectedId !== id) {
        setFollowId(null);
        focusAircraft(a);
      }
    }
  }

  return (
    <div className="flex-1 min-h-0 w-full flex flex-col md:flex-row gap-3 md:gap-4">
      <div
        className="flex-1 min-h-0 relative rounded-xl border border-cyan-700/40 bg-slate-950 overflow-hidden touch-none outline-none"
        ref={mapContainerRef}
        tabIndex={0}
        onDoubleClick={(e) => {
          e.preventDefault();
          applyZoomAt(e.clientX, e.clientY, viewRef.current.zoom * (e.shiftKey ? 0.5 : 2));
        }}
        onPointerDown={(e) => {
          if (e.button !== 0 && e.button !== 1) return;
          e.currentTarget.setPointerCapture(e.pointerId);
          pointersRef.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
          if (pointersRef.current.size === 2) {
            const mid = pointerMid();
            if (mid) {
              pinchStartRef.current = {
                distance: mid.distance,
                zoom: viewRef.current.zoom,
                pan: { ...viewRef.current.pan },
              };
              panStartRef.current = null;
            }
          } else {
            startPan(e.clientX, e.clientY);
          }
        }}
        onPointerMove={(e) => {
          if (!pointersRef.current.has(e.pointerId)) return;
          pointersRef.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
          if (pointersRef.current.size >= 2 && pinchStartRef.current) {
            const mid = pointerMid();
            const start = pinchStartRef.current;
            if (!mid || mid.distance < 1) return;
            applyZoomAt(mid.x, mid.y, start.zoom * (mid.distance / start.distance));
            return;
          }
          movePan(e.clientX, e.clientY);
        }}
        onPointerUp={(e) => {
          pointersRef.current.delete(e.pointerId);
          if (pointersRef.current.size < 2) pinchStartRef.current = null;
          if (pointersRef.current.size === 0) endPan();
        }}
        onPointerCancel={(e) => {
          pointersRef.current.delete(e.pointerId);
          pinchStartRef.current = null;
          endPan();
        }}
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
                <TileLayer tiles={baseTiles} />
                <TileLayer tiles={detailTiles} />
              </div>
              <svg viewBox={`0 0 ${PF_MAP_W} ${PF_MAP_H}`} className="absolute inset-0 w-full h-full pointer-events-none">
                {plotted.map((a) => {
                  const isSelected = selectedId === a.id;
                  const color = isSelected ? '#fbbf24' : '#22d3ee';
                  const trail = trails[a.id];
                  return (
                    <g
                      key={a.id}
                      className="pointer-events-auto"
                      style={{ cursor: 'pointer' }}
                      onPointerDown={(e) => e.stopPropagation()}
                      onClick={() => {
                        if (dragRef.current.moved) return;
                        selectAircraft(a.id);
                      }}
                    >
                      {trail && trail.length > 1
                        ? trail.slice(1).map((p, i) => (
                            <line
                              key={`${a.id}-t${i}`}
                              x1={trail[i]!.x}
                              y1={trail[i]!.y}
                              x2={p.x}
                              y2={p.y}
                              stroke={altitudeToTrailColor((trail[i]!.alt + p.alt) / 2)}
                              strokeWidth={isSelected ? trailW * 1.4 : trailW}
                              strokeLinecap="round"
                              opacity={isSelected ? 0.95 : 0.85}
                            />
                          ))
                        : null}
                      <g transform={`translate(${a.mapX},${a.mapY}) scale(${markerScale})`}>
                        <circle r={14} fill="transparent" />
                        <g transform={`rotate(${a.heading}) scale(0.55)`}>
                          <path
                            d={PLANE_BLIP_D}
                            fill={color}
                            stroke="rgba(15,23,42,0.9)"
                            strokeWidth={0.35}
                            paintOrder="stroke fill"
                          />
                        </g>
                      </g>
                    </g>
                  );
                })}
              </svg>
              {plotted.map((a) => {
                const isSelected = selectedId === a.id;
                const color = isSelected ? '#fbbf24' : '#22d3ee';
                return (
                  <div
                    key={`${a.id}-label`}
                    className="absolute pointer-events-none whitespace-nowrap font-mono font-bold"
                    style={{
                      left: `${(a.mapX / PF_MAP_W) * 100}%`,
                      top: `${(a.mapY / PF_MAP_H) * 100}%`,
                      color,
                      fontSize: 11,
                      lineHeight: 1,
                      textShadow: '0 1px 2px rgba(0,0,0,0.9)',
                      transform: `translate(10px, -14px) scale(${markerScale})`,
                      transformOrigin: 'left bottom',
                    }}
                  >
                    {a.callsign || a.robloxUsername}
                  </div>
                );
              })}
            </div>
          </div>
        </div>

        <div
          className="absolute bottom-3 right-3 flex flex-col items-center gap-1.5 z-10"
          onPointerDown={(e) => e.stopPropagation()}
        >
          <span className="px-1.5 py-0.5 rounded-md bg-slate-900/90 border border-slate-600 text-[10px] font-mono text-cyan-200 tabular-nums">
            ×{zoom >= 10 ? Math.round(zoom) : zoom.toFixed(1)}
          </span>
          <input
            type="range"
            min={0}
            max={1}
            step={0.002}
            value={Math.log(zoom / MIN_VIEW_ZOOM) / Math.log(MAX_VIEW_ZOOM / MIN_VIEW_ZOOM)}
            onChange={(e) => updateZoom(MIN_VIEW_ZOOM * (MAX_VIEW_ZOOM / MIN_VIEW_ZOOM) ** Number(e.target.value))}
            className="w-16 accent-cyan-400 cursor-pointer"
            title="Niveau de zoom"
            aria-label="Niveau de zoom"
          />
          <button type="button" onClick={() => updateZoom(zoom * 1.35)} className="p-2 rounded-lg bg-slate-900/90 border border-slate-600 text-slate-200 hover:bg-slate-800" title="Zoom +">
            <ZoomIn className="h-4 w-4" />
          </button>
          <button type="button" onClick={() => updateZoom(zoom / 1.35)} className="p-2 rounded-lg bg-slate-900/90 border border-slate-600 text-slate-200 hover:bg-slate-800" title="Zoom −">
            <ZoomOut className="h-4 w-4" />
          </button>
          {selected && (
            <>
              <button
                type="button"
                onClick={() => focusAircraft(selected)}
                className="p-2 rounded-lg bg-slate-900/90 border border-slate-600 text-slate-200 hover:bg-slate-800"
                title="Centrer sur la sélection"
              >
                <Crosshair className="h-4 w-4" />
              </button>
              <button
                type="button"
                onClick={() => setFollowId((prev) => (prev === selected.id ? null : selected.id))}
                className={`p-2 rounded-lg border ${
                  followId === selected.id
                    ? 'bg-amber-500/20 border-amber-400 text-amber-200'
                    : 'bg-slate-900/90 border-slate-600 text-slate-200 hover:bg-slate-800'
                }`}
                title={followId === selected.id ? 'Arrêter le suivi' : 'Suivre l’avion'}
              >
                <LocateFixed className="h-4 w-4" />
              </button>
            </>
          )}
          <button type="button" onClick={resetView} className="p-2 rounded-lg bg-slate-900/90 border border-slate-600 text-slate-200 hover:bg-slate-800" title="Vue d’ensemble">
            <RotateCcw className="h-4 w-4" />
          </button>
        </div>
      </div>

      <div className="w-full md:w-[320px] shrink-0 rounded-xl border border-cyan-700/40 bg-slate-900/70 flex flex-col min-h-[220px] md:min-h-0">
        <div className="p-3 border-b border-slate-700/50 space-y-2">
          <div className="flex items-center justify-between gap-2">
            <p className="text-slate-200 text-sm font-semibold">Trafic Mixou Airlines</p>
            <button type="button" onClick={() => { setLoading(true); fetchFlights(); }} className="p-1.5 rounded-md bg-slate-800 text-slate-300 hover:bg-slate-700" title="Actualiser">
              <RefreshCw className={`h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`} />
            </button>
          </div>
          <p className="text-[11px] text-slate-500">
            Molette ou pincement pour zoomer, glisser pour déplacer. Clic liste pour centrer, F pour suivre.
          </p>
          <p className="text-[11px] text-cyan-300/80 font-mono">{aircraft.length} avion{aircraft.length > 1 ? 's' : ''}</p>
        </div>
        <div className="flex-1 overflow-y-auto p-3 space-y-2">
          {error && <p className="text-red-400 text-xs">{error}</p>}
          {loading && aircraft.length === 0 && <p className="text-slate-500 text-sm text-center py-8">Chargement…</p>}
          {!loading && !error && aircraft.length === 0 && (
            <div className="text-center py-10 space-y-2">
              <Plane className="h-8 w-8 text-slate-600 mx-auto" />
              <p className="text-slate-500 text-sm">Aucun avion sur le serveur Mixou Airlines pour le moment.</p>
              <p className="text-slate-600 text-[11px] px-2">
                Le tracker n’affiche un appareil que s’il est actif in-game sur ce serveur.
              </p>
            </div>
          )}
          {aircraft.map((a) => (
            <button
              key={a.id}
              type="button"
              onClick={() => selectAircraft(a.id, true)}
              className={`w-full text-left rounded-lg p-2.5 text-[11px] border transition ${
                selectedId === a.id
                  ? 'border-amber-400/50 bg-amber-950/30 text-slate-100'
                  : 'border-slate-700/50 bg-slate-800/50 text-slate-300 hover:border-cyan-700/50'
              }`}
            >
              <span className="font-mono font-bold text-cyan-300">{a.callsign || '—'}</span>
              <span className="text-slate-500 mx-1">·</span>
              <span className="text-slate-400">{a.robloxUsername}</span>
              {followId === a.id ? <span className="ml-1 text-amber-300">suivi</span> : null}
              <br />
              <span className="text-slate-500">
                {a.model || '—'} {a.livery ? `· ${a.livery.replace(/_/g, ' ')}` : ''}
              </span>
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
              <p>{selected.model} · {selected.livery.replace(/_/g, ' ')}</p>
              <p>Alt {Math.round(selected.altitude)} ft · {selected.speed} kt</p>
              {typeof selected.x === 'number' && typeof selected.y === 'number' && (
                <p className="font-mono text-slate-400">Jeu X {selected.x.toFixed(1)} · Y {selected.y.toFixed(1)}</p>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
