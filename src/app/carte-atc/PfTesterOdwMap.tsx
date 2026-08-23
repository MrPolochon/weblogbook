'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ChevronDown, ChevronLeft, ChevronRight, ChevronUp, Crosshair, LocateFixed, Plane, RefreshCw, RotateCcw, Search, ZoomIn, ZoomOut } from 'lucide-react';
import { PLANE_BLIP_D } from '@/lib/radar-utils';
import { PF_AIRPORTS } from '@/lib/pf-airports';
import { PF_NM_TO_MAP } from '@/lib/pf-radar';
import {
  PF_DEFAULT_SERVER_ID,
  PF_MAP_H,
  PF_MAP_W,
  decodeMultiPlanes,
  filterByServer,
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

type TrailPt = { x: number; y: number; alt: number; at: number };
type MapTile = { key: string; z: number; x: number; y: number; left: number; top: number; width: number; height: number };
type MapBounds = { minX: number; minY: number; maxX: number; maxY: number };
type ViewState = { zoom: number; pan: { x: number; y: number } };

const MIN_VIEW_ZOOM = 0.85;
const MAX_VIEW_ZOOM = 48;
const MAX_TILE_Z = 8;
const FIT_ZOOM = 1;
const FOCUS_ZOOM = 8;
const KEEP_MAP_PX = 48;
const ZOOM_STEP = 1.28;
const MAX_TILE_PX = 520;
const TRAIL_MIN_STEP = 0.015;
const TRAIL_MAX_STEP = 0.75;
const TRAIL_MAX_LEN = 3600;
const MOTION_MS = 1000;
const AIRPORT_ZOOM = 1.7;
const LABEL_ZOOM = 1.8;
const PREDICT_MIN = 1;
const PLANE_IDLE = '#f97316';
const PLANE_ACTIVE = '#38bdf8';

function flLabel(alt: number): string {
  return `FL${Math.max(0, Math.round(alt / 100)).toString().padStart(3, '0')}`;
}

function isOnGround(alt: number, speed: number): boolean {
  return alt <= 80 || (alt < 200 && speed < 40);
}

function lerpAngle(from: number, to: number, t: number): number {
  const d = ((to - from + 540) % 360) - 180;
  return from + d * t;
}

function headingOffset(mapX: number, mapY: number, heading: number, nm: number): { x: number; y: number } {
  const rad = (heading * Math.PI) / 180;
  const len = nm * PF_NM_TO_MAP;
  return {
    x: mapX + Math.sin(rad) * len,
    y: mapY - Math.cos(rad) * len,
  };
}

function niceNm(raw: number): number {
  const steps = [1, 2, 5, 10, 20, 50, 100, 200, 400];
  return steps.find((s) => s >= raw) ?? 400;
}

function trailKey(a: { id: string; callsign?: string }): string {
  return `${a.id}::${a.callsign || ''}`;
}

function readGameXY(x?: number, y?: number): { x: number; y: number } | null {
  if (typeof x !== 'number' || typeof y !== 'number') return null;
  if (!Number.isFinite(x) || !Number.isFinite(y) || (x === 0 && y === 0)) return null;
  return { x, y };
}

function pushTrailPoint(pts: TrailPt[], x: number, y: number, alt: number): TrailPt[] {
  if (!Number.isFinite(x) || !Number.isFinite(y)) return pts;
  const now = Date.now();
  const last = pts[pts.length - 1];
  if (!last) return [{ x, y, alt, at: now }];
  const dist = Math.hypot(x - last.x, y - last.y);
  if (dist < TRAIL_MIN_STEP) return pts;
  if (dist > TRAIL_MAX_STEP) return [{ x, y, alt, at: now }];
  const next = pts.concat({ x, y, alt, at: now });
  if (next.length > TRAIL_MAX_LEN) next.splice(0, next.length - TRAIL_MAX_LEN);
  return next;
}

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

function mapToScreen(
  mapX: number,
  mapY: number,
  zoom: number,
  pan: { x: number; y: number },
  containerW: number,
  containerH: number,
  dispW: number,
  dispH: number,
): { x: number; y: number } {
  return {
    x: containerW / 2 + pan.x + ((mapX / PF_MAP_W) - 0.5) * dispW * zoom,
    y: containerH / 2 + pan.y + ((mapY / PF_MAP_H) - 0.5) * dispH * zoom,
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
  if (e.ctrlKey) return Math.exp(-dy * 0.014);
  if (Math.abs(dy) >= 40) return dy < 0 ? ZOOM_STEP : 1 / ZOOM_STEP;
  return Math.exp(-dy * 0.004);
}

type Motion = {
  fromX: number;
  fromY: number;
  fromHdg: number;
  toX: number;
  toY: number;
  toHdg: number;
  t0: number;
};

function tileScreenPx(tileZoom: number, dispW: number, viewZoom: number): number {
  return (pfTileUnit(tileZoom) / PF_MAP_W) * dispW * viewZoom;
}

function TileLayer({
  tiles,
  zoom,
  pan,
  containerW,
  containerH,
  dispW,
  dispH,
}: {
  tiles: MapTile[];
  zoom: number;
  pan: { x: number; y: number };
  containerW: number;
  containerH: number;
  dispW: number;
  dispH: number;
}) {
  return (
    <div className="absolute inset-0 overflow-hidden pointer-events-none bg-[#0b1c2c]">
      {tiles.map((t) => {
        const tl = mapToScreen(t.left, t.top, zoom, pan, containerW, containerH, dispW, dispH);
        const br = mapToScreen(t.left + t.width, t.top + t.height, zoom, pan, containerW, containerH, dispW, dispH);
        return (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            key={t.key}
            alt=""
            draggable={false}
            src={tileUrl(t.z, t.x, t.y)}
            className="absolute max-w-none select-none pointer-events-none"
            style={{
              left: tl.x,
              top: tl.y,
              width: Math.max(1, br.x - tl.x) + 1,
              height: Math.max(1, br.y - tl.y) + 1,
              userSelect: 'none',
            }}
            onDragStart={(e) => e.preventDefault()}
            onError={(e) => {
              e.currentTarget.style.visibility = 'hidden';
            }}
          />
        );
      })}
    </div>
  );
}

export default function PfTesterOdwMap() {
  const [aircraft, setAircraft] = useState<PfAircraft[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [fetchedAt, setFetchedAt] = useState<number | null>(null);
  const [feedServerId, setFeedServerId] = useState<string | null>(null);
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
  const [query, setQuery] = useState('');
  const [display, setDisplay] = useState<Record<string, { x: number; y: number; hdg: number }>>({});
  const [viewport, setViewport] = useState({ w: 900, h: 560 });
  const viewRef = useRef<ViewState>({ zoom: FIT_ZOOM, pan: { x: 0, y: 0 } });
  viewRef.current = { zoom, pan };
  const dragRef = useRef({ x: 0, y: 0, moved: false });
  const rafRef = useRef(0);
  const pendingViewRef = useRef<ViewState | null>(null);
  const motionRef = useRef<Record<string, Motion>>({});
  const shownRef = useRef<Record<string, { x: number; y: number; hdg: number }>>({});
  const lastPaintRef = useRef(0);
  const lastPointerRef = useRef<{ x: number; y: number } | null>(null);
  const lastCallsignRef = useRef<Record<string, string>>({});

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

  const applyAircraft = useCallback((next: PfAircraft[], serverId: string, at: number) => {
    setAircraft(next);
    setFeedServerId(serverId);
    setFetchedAt(at);
    setError(null);
  }, []);

  const fetchFlights = useCallback(async () => {
    try {
      const live = await fetch(`/api/pftester-odw/live?t=${Date.now()}`, { cache: 'no-store' });
      const upstreamAt = Number(live.headers.get('X-Pf-Fetched-At'));
      const isTraffic =
        live.ok &&
        live.headers.get('Content-Type')?.includes('application/octet-stream') === true &&
        Number.isFinite(upstreamAt) &&
        upstreamAt > 0;
      if (isTraffic) {
        const buf = new Uint8Array(await live.arrayBuffer());
        const mine = filterByServer(decodeMultiPlanes(buf), PF_DEFAULT_SERVER_ID);
        applyAircraft(
          mine.map((p) => ({
            id: p.id,
            serverId: p.serverId,
            callsign: p.callsign,
            robloxUsername: p.robloxUsername,
            heading: Math.round(p.heading),
            altitude: Math.round(p.altitude),
            speed: Math.round(p.speed),
            model: p.model,
            livery: p.livery,
            x: p.x,
            y: p.y,
            mapX: p.mapX,
            mapY: p.mapY,
          })),
          PF_DEFAULT_SERVER_ID,
          Number.isFinite(upstreamAt) && upstreamAt > 0 ? upstreamAt : Date.now(),
        );
        return;
      }

      const res = await fetch(`/api/pftester-odw/flights?t=${Date.now()}`, { cache: 'no-store' });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data.error || 'Erreur trafic');
        return;
      }
      applyAircraft(
        Array.isArray(data.aircraft) ? data.aircraft : [],
        typeof data.serverId === 'string' ? data.serverId : PF_DEFAULT_SERVER_ID,
        typeof data.fetchedAt === 'number' ? data.fetchedAt : Date.now(),
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Erreur trafic');
    } finally {
      setLoading(false);
    }
  }, [applyAircraft]);

  useEffect(() => {
    setLoading(true);
    setTrails({});
    fetchFlights();
    const t = setInterval(fetchFlights, 2_000);
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
        const xy = readGameXY(a.x, a.y);
        if (!xy) return a;
        const m = gameToMap(xy.x, xy.y);
        return { ...a, mapX: m.mapX, mapY: m.mapY };
      }),
    [aircraft],
  );

  useEffect(() => {
    setTrails((prev) => {
      const next: Record<string, TrailPt[]> = {};
      let changed = false;
      for (const a of plotted) {
        const key = trailKey(a);
        const pts = pushTrailPoint(prev[key] ?? [], a.mapX, a.mapY, a.altitude);
        if (pts !== prev[key]) changed = true;
        next[key] = pts;
      }
      if (!changed && Object.keys(prev).length === Object.keys(next).length) {
        const sameIds = Object.keys(next).every((id) => prev[id]);
        if (sameIds) return prev;
      }
      return next;
    });
  }, [plotted]);

  useEffect(() => {
    const now = performance.now();
    const nextMotion: Record<string, Motion> = {};
    const nextSigns = { ...lastCallsignRef.current };
    for (const a of plotted) {
      const shown = shownRef.current[a.id];
      const jump = !!shown && Math.hypot(shown.x - a.mapX, shown.y - a.mapY) > TRAIL_MAX_STEP;
      const respawn = nextSigns[a.id] !== undefined && nextSigns[a.id] !== a.callsign;
      nextSigns[a.id] = a.callsign;
      const snap = !shown || jump || respawn;
      nextMotion[a.id] = {
        fromX: snap ? a.mapX : shown.x,
        fromY: snap ? a.mapY : shown.y,
        fromHdg: snap ? a.heading : shown.hdg,
        toX: a.mapX,
        toY: a.mapY,
        toHdg: a.heading,
        t0: now,
      };
    }
    lastCallsignRef.current = nextSigns;
    motionRef.current = nextMotion;
  }, [plotted]);

  useEffect(() => {
    let frame = 0;
    const loop = (now: number) => {
      if (now - lastPaintRef.current >= 50) {
        lastPaintRef.current = now;
        const next: Record<string, { x: number; y: number; hdg: number }> = {};
        for (const [id, m] of Object.entries(motionRef.current)) {
          const t = Math.min(1, (now - m.t0) / MOTION_MS);
          const ease = t * t * (3 - 2 * t);
          next[id] = {
            x: m.fromX + (m.toX - m.fromX) * ease,
            y: m.fromY + (m.toY - m.fromY) * ease,
            hdg: lerpAngle(m.fromHdg, m.toHdg, ease),
          };
        }
        shownRef.current = next;
        setDisplay(next);
      }
      frame = requestAnimationFrame(loop);
    };
    frame = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(frame);
  }, []);

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
    const pointer = lastPointerRef.current;
    if (el && pointer) {
      applyZoomAt(pointer.x, pointer.y, next);
      return;
    }
    if (!el) {
      applyView({ zoom: next, pan: viewRef.current.pan });
      return;
    }
    const r = el.getBoundingClientRect();
    applyZoomAt(r.left + r.width / 2, r.top + r.height / 2, next);
  }, [applyView, applyZoomAt]);

  const nudgePan = useCallback((dx: number, dy: number) => {
    const cur = viewRef.current;
    setFollowId(null);
    applyView({ zoom: cur.zoom, pan: { x: cur.pan.x + dx, y: cur.pan.y + dy } });
  }, [applyView]);

  const posOf = useCallback((a: PfAircraft) => {
    const d = display[a.id];
    return { x: d?.x ?? a.mapX, y: d?.y ?? a.mapY, hdg: d?.hdg ?? a.heading };
  }, [display]);

  const focusAircraft = useCallback((a: PfAircraft, nextZoom = Math.max(viewRef.current.zoom, FOCUS_ZOOM)) => {
    const z = clampViewZoom(nextZoom);
    const p = posOf(a);
    applyView({ zoom: z, pan: panToMapPoint(p.x, p.y, z, dispW, dispH) });
  }, [applyView, dispW, dispH, posOf]);

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
    const p = posOf(a);
    applyView({
      zoom: viewRef.current.zoom,
      pan: panToMapPoint(p.x, p.y, viewRef.current.zoom, dispW, dispH),
    });
  }, [followId, plotted, applyView, dispW, dispH, posOf]);

  useEffect(() => {
    const el = mapContainerRef.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      lastPointerRef.current = { x: e.clientX, y: e.clientY };
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
        updateZoom(cur.zoom * ZOOM_STEP);
      } else if (e.key === '-' || e.key === '_') {
        e.preventDefault();
        updateZoom(cur.zoom / ZOOM_STEP);
      } else if (e.key === '0' || e.key === 'Home') {
        e.preventDefault();
        resetView();
      } else if (e.key === 'f' || e.key === 'F') {
        e.preventDefault();
        if (selectedId) setFollowId((prev) => (prev === selectedId ? null : selectedId));
      } else if (e.key.startsWith('Arrow') || ['w', 'a', 's', 'd', 'W', 'A', 'S', 'D'].includes(e.key)) {
        e.preventDefault();
        const step = e.shiftKey ? 140 : 70;
        const left = e.key === 'ArrowLeft' || e.key === 'a' || e.key === 'A';
        const right = e.key === 'ArrowRight' || e.key === 'd' || e.key === 'D';
        const up = e.key === 'ArrowUp' || e.key === 'w' || e.key === 'W';
        const down = e.key === 'ArrowDown' || e.key === 's' || e.key === 'S';
        nudgePan(left ? step : right ? -step : 0, up ? step : down ? -step : 0);
      }
    };
    el.addEventListener('keydown', onKey);
    return () => el.removeEventListener('keydown', onKey);
  }, [nudgePan, resetView, selectedId, updateZoom]);

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

  const dpr = typeof window === 'undefined' ? 1 : Math.min(2, window.devicePixelRatio || 1);
  const tileZ = Math.max(
    1,
    Math.min(MAX_TILE_Z, Math.ceil(Math.log2(Math.max(2, (dispW * zoom * dpr) / PF_MAP_W)))),
  );
  const midZ = tileZ >= 3 ? tileZ - 1 : 0;
  const bounds = useMemo(
    () => visibleMapBounds(viewport.w, viewport.h, zoom, pan),
    [viewport.w, viewport.h, zoom, pan],
  );
  const mapTiles = useMemo(() => {
    const seen = new Set<string>();
    const out: MapTile[] = [];
    const layers: MapTile[][] = [];
    if (tileScreenPx(1, dispW, zoom) <= MAX_TILE_PX) {
      layers.push(tilesInBounds(1, { minX: 0, minY: 0, maxX: PF_MAP_W, maxY: PF_MAP_H }));
    }
    if (midZ && tileScreenPx(midZ, dispW, zoom) <= MAX_TILE_PX) {
      layers.push(tilesInBounds(midZ, bounds));
    }
    layers.push(tilesInBounds(tileZ, bounds));
    for (const layer of layers) {
      for (const t of layer) {
        if (seen.has(t.key)) continue;
        seen.add(t.key);
        out.push(t);
      }
    }
    return out;
  }, [tileZ, midZ, bounds, dispW, zoom]);
  const selected = plotted.find((a) => a.id === selectedId) ?? null;
  const selectedPos = selected ? posOf(selected) : null;
  const predict = selected && selectedPos && selected.speed > 40
    ? headingOffset(selectedPos.x, selectedPos.y, selectedPos.hdg, (selected.speed / 60) * PREDICT_MIN)
    : null;
  const q = query.trim().toLowerCase();
  const listed = useMemo(() => {
    const rows = q
      ? plotted.filter((a) =>
          `${a.callsign} ${a.robloxUsername} ${a.model} ${a.livery}`.toLowerCase().includes(q),
        )
      : plotted.slice();
    rows.sort((a, b) => b.altitude - a.altitude || (a.callsign || '').localeCompare(b.callsign || ''));
    return rows;
  }, [plotted, q]);
  const showAllLabels = zoom >= LABEL_ZOOM || plotted.length <= 10;
  const feedAgeSec = fetchedAt === null ? null : Math.max(0, Math.round((Date.now() - fetchedAt) / 1000));
  const mapNm = (viewport.w / Math.max(1, dispW * zoom)) * PF_MAP_W / PF_NM_TO_MAP;
  const scaleNm = niceNm(mapNm * 0.18);
  const scalePx = (scaleNm * PF_NM_TO_MAP / PF_MAP_W) * dispW * zoom;

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
        className="flex-1 min-h-0 relative rounded-xl border border-cyan-700/40 bg-slate-950 overflow-hidden isolate touch-none outline-none overscroll-none select-none"
        ref={mapContainerRef}
        tabIndex={0}
        onDoubleClick={(e) => {
          e.preventDefault();
          lastPointerRef.current = { x: e.clientX, y: e.clientY };
          applyZoomAt(e.clientX, e.clientY, viewRef.current.zoom * (e.shiftKey ? 1 / ZOOM_STEP : ZOOM_STEP * 1.2));
        }}
        onContextMenu={(e) => {
          e.preventDefault();
          lastPointerRef.current = { x: e.clientX, y: e.clientY };
          applyZoomAt(e.clientX, e.clientY, viewRef.current.zoom / ZOOM_STEP);
        }}
        onDragStart={(e) => e.preventDefault()}
        onPointerDown={(e) => {
          if (e.button !== 0 && e.button !== 1) return;
          lastPointerRef.current = { x: e.clientX, y: e.clientY };
          e.currentTarget.focus();
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
          lastPointerRef.current = { x: e.clientX, y: e.clientY };
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
        style={{ cursor: isPanning ? 'grabbing' : 'grab', clipPath: 'inset(0)' }}
      >
        <TileLayer
          tiles={mapTiles}
          zoom={zoom}
          pan={pan}
          containerW={viewport.w}
          containerH={viewport.h}
          dispW={dispW}
          dispH={dispH}
        />
        {zoom >= AIRPORT_ZOOM && PF_AIRPORTS.map((ap) => {
          const s = mapToScreen(ap.mapX, ap.mapY, zoom, pan, viewport.w, viewport.h, dispW, dispH);
          return (
            <div
              key={`ap-${ap.code}`}
              className="absolute pointer-events-none font-mono font-bold text-slate-100 z-[1]"
              style={{
                left: s.x,
                top: s.y,
                fontSize: 10,
                lineHeight: 1.15,
                textShadow: '0 1px 2px rgba(0,0,0,0.9)',
                transform: 'translate(8px, -12px)',
              }}
            >
              {ap.code}
              {zoom >= 4 && <span className="block text-slate-300 font-normal">{ap.name}</span>}
            </div>
          );
        })}
        {plotted.map((a) => {
          const isSelected = selectedId === a.id;
          if (!isSelected && !showAllLabels && followId !== a.id) return null;
          const p = posOf(a);
          const s = mapToScreen(p.x, p.y, zoom, pan, viewport.w, viewport.h, dispW, dispH);
          const color = isSelected || followId === a.id ? PLANE_ACTIVE : PLANE_IDLE;
          return (
            <div
              key={`${a.id}-label`}
              className="absolute pointer-events-none whitespace-nowrap font-mono font-bold z-[1]"
              style={{
                left: s.x,
                top: s.y,
                color,
                fontSize: isSelected ? 11 : 10,
                lineHeight: 1.15,
                textShadow: '0 1px 2px rgba(0,0,0,0.9)',
                transform: 'translate(10px, -14px)',
              }}
            >
              {a.callsign || a.robloxUsername}
              {isSelected && (
                <span className="block font-semibold">
                  {flLabel(a.altitude)} · {a.speed} kt
                </span>
              )}
            </div>
          );
        })}

        <svg className="absolute inset-0 w-full h-full z-[1] overflow-hidden pointer-events-none">
          {zoom >= AIRPORT_ZOOM && PF_AIRPORTS.map((ap) => {
            const s = mapToScreen(ap.mapX, ap.mapY, zoom, pan, viewport.w, viewport.h, dispW, dispH);
            return (
              <g
                key={ap.code}
                className="pointer-events-auto"
                style={{ cursor: 'pointer' }}
                onClick={() => {
                  if (dragRef.current.moved) return;
                  applyView({ zoom: Math.max(viewRef.current.zoom, 6), pan: panToMapPoint(ap.mapX, ap.mapY, Math.max(viewRef.current.zoom, 6), dispW, dispH) });
                }}
              >
                <rect x={s.x - 4} y={s.y - 4} width={8} height={8} fill="#e2e8f0" stroke="#0f172a" strokeWidth={1} />
              </g>
            );
          })}
          {plotted.map((a) => {
            const isSelected = selectedId === a.id;
            const p = posOf(a);
            const s = mapToScreen(p.x, p.y, zoom, pan, viewport.w, viewport.h, dispW, dispH);
            const color = isSelected || followId === a.id ? PLANE_ACTIVE : PLANE_IDLE;
            return (
              <g
                key={a.id}
                className="pointer-events-auto"
                style={{ cursor: 'pointer' }}
                onClick={() => {
                  if (dragRef.current.moved) return;
                  selectAircraft(a.id);
                }}
              >
                <g transform={`translate(${s.x},${s.y}) rotate(${p.hdg}) scale(${isOnGround(a.altitude, a.speed) ? 0.7 : 0.9})`}>
                  <circle r={16} fill="transparent" />
                  <path
                    d={PLANE_BLIP_D}
                    fill={color}
                    stroke="rgba(15,23,42,0.9)"
                    strokeWidth={0.35}
                    paintOrder="stroke fill"
                  />
                </g>
              </g>
            );
          })}
          {plotted.map((a) => {
            const showTrail = selectedId === a.id || followId === a.id;
            if (!showTrail) return null;
            const trail = trails[trailKey(a)];
            if (!trail || trail.length < 2) return null;
            const p = posOf(a);
            const pts = trail.map((pt) =>
              mapToScreen(pt.x, pt.y, zoom, pan, viewport.w, viewport.h, dispW, dispH),
            );
            const now = mapToScreen(p.x, p.y, zoom, pan, viewport.w, viewport.h, dispW, dispH);
            const last = pts[pts.length - 1]!;
            return (
              <g key={`${a.id}-trail`}>
                {pts.slice(1).map((pt, i) => (
                  <line
                    key={`${a.id}-t${i}`}
                    x1={pts[i]!.x}
                    y1={pts[i]!.y}
                    x2={pt.x}
                    y2={pt.y}
                    stroke={altitudeToTrailColor((trail[i]!.alt + trail[i + 1]!.alt) / 2)}
                    strokeWidth={2.4}
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    opacity={0.92}
                  />
                ))}
                <line
                  x1={last.x}
                  y1={last.y}
                  x2={now.x}
                  y2={now.y}
                  stroke={altitudeToTrailColor(a.altitude)}
                  strokeWidth={2.4}
                  strokeLinecap="round"
                  opacity={0.92}
                />
              </g>
            );
          })}
          {predict && selectedPos && (
            <line
              x1={mapToScreen(selectedPos.x, selectedPos.y, zoom, pan, viewport.w, viewport.h, dispW, dispH).x}
              y1={mapToScreen(selectedPos.x, selectedPos.y, zoom, pan, viewport.w, viewport.h, dispW, dispH).y}
              x2={mapToScreen(predict.x, predict.y, zoom, pan, viewport.w, viewport.h, dispW, dispH).x}
              y2={mapToScreen(predict.x, predict.y, zoom, pan, viewport.w, viewport.h, dispW, dispH).y}
              stroke={PLANE_ACTIVE}
              strokeWidth={1.4}
              strokeDasharray="5 4"
              opacity={0.75}
            />
          )}
        </svg>

        <div className="absolute bottom-3 left-3 z-10 rounded-lg bg-slate-900/90 border border-slate-600 px-2 py-1.5 space-y-1" onPointerDown={(e) => e.stopPropagation()}>
          <div
            className="h-1.5 w-36 rounded-full"
            style={{
              background: 'linear-gradient(90deg,#dc2626 0%,#f97316 12%,#22c55e 25%,#38bdf8 45%,#3b82f6 65%,#8b5cf6 85%,#3b0764 100%)',
            }}
          />
          <div className="flex justify-between text-[9px] font-mono text-slate-400 w-36">
            <span>SFC</span>
            <span>FL030</span>
            <span>FL120</span>
            <span>FL360</span>
          </div>
          <div className="flex items-center gap-1.5 pt-0.5">
            <span className="block h-0.5 bg-slate-200" style={{ width: Math.max(18, Math.min(140, scalePx)) }} />
            <span className="text-[9px] font-mono text-slate-300">{scaleNm} NM</span>
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
            className="w-24 accent-cyan-400 cursor-pointer"
            title="Niveau de zoom"
            aria-label="Niveau de zoom"
          />
          <button type="button" onClick={() => updateZoom(viewRef.current.zoom * ZOOM_STEP)} className="p-2 rounded-lg bg-slate-900/90 border border-slate-600 text-slate-200 hover:bg-slate-800" title="Zoom +">
            <ZoomIn className="h-4 w-4" />
          </button>
          <button type="button" onClick={() => updateZoom(viewRef.current.zoom / ZOOM_STEP)} className="p-2 rounded-lg bg-slate-900/90 border border-slate-600 text-slate-200 hover:bg-slate-800" title="Zoom −">
            <ZoomOut className="h-4 w-4" />
          </button>
          <div className="grid grid-cols-3 gap-0.5">
            <span />
            <button type="button" onClick={() => nudgePan(0, 90)} className="p-1.5 rounded-md bg-slate-900/90 border border-slate-600 text-slate-200 hover:bg-slate-800" title="Haut">
              <ChevronUp className="h-3.5 w-3.5" />
            </button>
            <span />
            <button type="button" onClick={() => nudgePan(90, 0)} className="p-1.5 rounded-md bg-slate-900/90 border border-slate-600 text-slate-200 hover:bg-slate-800" title="Gauche">
              <ChevronLeft className="h-3.5 w-3.5" />
            </button>
            <button type="button" onClick={resetView} className="p-1.5 rounded-md bg-slate-900/90 border border-slate-600 text-slate-200 hover:bg-slate-800" title="Recentrer">
              <RotateCcw className="h-3 w-3" />
            </button>
            <button type="button" onClick={() => nudgePan(-90, 0)} className="p-1.5 rounded-md bg-slate-900/90 border border-slate-600 text-slate-200 hover:bg-slate-800" title="Droite">
              <ChevronRight className="h-3.5 w-3.5" />
            </button>
            <span />
            <button type="button" onClick={() => nudgePan(0, -90)} className="p-1.5 rounded-md bg-slate-900/90 border border-slate-600 text-slate-200 hover:bg-slate-800" title="Bas">
              <ChevronDown className="h-3.5 w-3.5" />
            </button>
          </div>
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
            Glisser pour déplacer, molette pour zoomer sous le curseur. Clic aéroport, F pour suivre.
          </p>
          <label className="relative block">
            <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-3 w-3 text-slate-500" />
            <input
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Callsign, pilote, type…"
              className="w-full rounded-md bg-slate-800 border border-slate-600 pl-7 pr-2 py-1.5 text-[11px] text-slate-200 placeholder:text-slate-500"
            />
          </label>
          <p className="text-[11px] text-cyan-300/80 font-mono">
            {listed.length} avion{listed.length > 1 ? 's' : ''}
            {q ? ' · filtre' : ''}
            {feedServerId ? ` · ${feedServerId}` : ''}
          </p>
          {feedAgeSec !== null && (
            <p className={`text-[11px] font-mono ${feedAgeSec > 10 ? 'text-amber-300' : 'text-slate-500'}`}>
              position reçue il y a {feedAgeSec} s
            </p>
          )}
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
          {listed.map((a) => (
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
              <span className="inline-block w-1.5 h-1.5 rounded-full mr-1.5 align-middle" style={{ background: selectedId === a.id || followId === a.id ? PLANE_ACTIVE : PLANE_IDLE }} />
              <span className="font-mono font-bold" style={{ color: selectedId === a.id || followId === a.id ? PLANE_ACTIVE : PLANE_IDLE }}>{a.callsign || '—'}</span>
              <span className="text-slate-500 mx-1">·</span>
              <span className="text-slate-400">{a.robloxUsername}</span>
              {followId === a.id ? <span className="ml-1 text-amber-300">suivi</span> : null}
              <br />
              <span className="text-slate-500">
                {a.model || '—'} {a.livery ? `· ${a.livery.replace(/_/g, ' ')}` : ''}
              </span>
              <br />
              <span className="text-slate-500">
                {flLabel(a.altitude)} · {a.speed} kt · {a.heading.toString().padStart(3, '0')}°
                {isOnGround(a.altitude, a.speed) ? ' · SOL' : ''}
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
