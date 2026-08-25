'use client';

import { memo, startTransition, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { ChevronDown, ChevronLeft, ChevronRight, ChevronUp, Crosshair, LocateFixed, Plane, RefreshCw, RotateCcw, Search, ZoomIn, ZoomOut } from 'lucide-react';
import { PLANE_BLIP_D } from '@/lib/radar-utils';
import { PF_AIRPORTS } from '@/lib/pf-airports';
import { PF_NM_TO_MAP } from '@/lib/pf-radar';
import {
  PF_DEFAULT_SERVER_ID,
  PF_MAP_H,
  PF_MAP_W,
  pfFlightKey,
  pfTileUnit,
  altitudeToTrailColor,
  gameToMap,
  isTrailGap,
  PF_TRAIL_MIN_STEP,
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

/** `gap` marque une rupture (respawn, téléportation) : on coupe le tracé sans perdre l'historique. */
type TrailPt = { x: number; y: number; alt: number; at: number; gap?: boolean };
type MapTile = { key: string; z: number; x: number; y: number; left: number; top: number; width: number; height: number };
type MapBounds = { minX: number; minY: number; maxX: number; maxY: number };
type ViewState = { zoom: number; pan: { x: number; y: number } };
type Layout = { w: number; h: number; dispW: number; dispH: number };

const MIN_VIEW_ZOOM = 0.85;
const MAX_VIEW_ZOOM = 48;
const MAX_TILE_Z = 8;
const FIT_ZOOM = 1;
const FOCUS_ZOOM = 8;
const KEEP_MAP_PX = 48;
const ZOOM_STEP = 1.28;
const TILE_HOLD_MAX = 256;
const TILE_Z_KEEP = 2;
const VIEW_COMMIT_MS = 120;
/** Seuil d'animation seulement : un saut plus grand snappe l'icône, sans couper la trace. */
const MOTION_SNAP_STEP = 0.75;
/** Assez pour un vol entier ; au-delà, les points anciens sont décimés, pas supprimés. */
const TRAIL_MAX_LEN = 7200;
/** La trace survit à un rechargement : sinon elle repart de zéro et reste invisible. */
const TRAIL_STORE_KEY = 'pf-odw-trails-v2';
/** Délai sans position avant d'oublier une trace : le vol est alors terminé. */
const TRAIL_GONE_MS = 15 * 60_000;
const TRAIL_STORE_MAX = 4000;
const TRAIL_SAVE_MS = 5_000;
/** Recharge l'historique worker même si l'onglet n'a pas été rechargé. */
const TRAIL_TRACKS_MS = 15_000;
/** Paliers de couleur : regroupe la trace en polylignes au lieu d'un segment par point. */
const TRAIL_ALT_STEP = 500;
const REFRESH_MS = 1000;
const LIVE_BACKUP_MS = 10_000;
const BOOT_TIMEOUT_MS = 10_000;
const BOOT_FADE_MS = 280;
/** Aligné sur REFRESH_MS : l'interpolation doit couvrir l'intervalle sans le devancer. */
const MOTION_MS = REFRESH_MS;
const AIRPORT_ZOOM = 1.7;
const LABEL_ZOOM = 1.8;
const PLANE_IDLE = '#f97316';
const PLANE_ACTIVE = '#38bdf8';
const FULL_BOUNDS: MapBounds = { minX: 0, minY: 0, maxX: PF_MAP_W, maxY: PF_MAP_H };

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

function niceNm(raw: number): number {
  const steps = [1, 2, 5, 10, 20, 50, 100, 200, 400];
  return steps.find((s) => s >= raw) ?? 400;
}

/** Même identité que celle enregistrée par le worker, sinon les traces ne se raccrochent pas. */
function trailKey(a: { robloxUsername?: string; callsign?: string }): string {
  return pfFlightKey(a.robloxUsername || '', a.callsign || '');
}

function readGameXY(x?: number, y?: number): { x: number; y: number } | null {
  if (typeof x !== 'number' || typeof y !== 'number') return null;
  if (!Number.isFinite(x) || !Number.isFinite(y) || (x === 0 && y === 0)) return null;
  return { x, y };
}

function loadStoredTrails(): Record<string, TrailPt[]> {
  if (typeof window === 'undefined') return {};
  try {
    const raw = window.localStorage.getItem(TRAIL_STORE_KEY);
    if (!raw) return {};
    const parsed: unknown = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object') return {};
    const cutoff = Date.now() - TRAIL_GONE_MS;
    const out: Record<string, TrailPt[]> = {};
    for (const [key, value] of Object.entries(parsed as Record<string, unknown>)) {
      if (!Array.isArray(value)) continue;
      const kept = (value as TrailPt[]).filter(
        (p) =>
          p &&
          Number.isFinite(p.x) &&
          Number.isFinite(p.y) &&
          Number.isFinite(p.alt) &&
          Number.isFinite(p.at),
      );
      // On juge la trace entière sur sa dernière position, jamais point par point.
      if (kept.length > 1 && kept[kept.length - 1]!.at > cutoff) out[key] = kept.slice(-TRAIL_MAX_LEN);
    }
    return out;
  } catch {
    return {};
  }
}

function saveStoredTrails(trails: Record<string, TrailPt[]>): void {
  if (typeof window === 'undefined') return;
  try {
    const out: Record<string, TrailPt[]> = {};
    for (const [key, pts] of Object.entries(trails)) {
      // Aucune expiration à l'écriture : seule la relecture décide si le vol est fini.
      if (pts.length < 2) continue;
      let kept = pts;
      while (kept.length > TRAIL_STORE_MAX) kept = thinOldest(kept);
      out[key] = kept.map((p) => ({
        x: Math.round(p.x * 1e4) / 1e4,
        y: Math.round(p.y * 1e4) / 1e4,
        alt: Math.round(p.alt),
        at: p.at,
        ...(p.gap ? { gap: true as const } : {}),
      }));
    }
    window.localStorage.setItem(TRAIL_STORE_KEY, JSON.stringify(out));
  } catch {
    // Quota dépassé ou stockage indisponible : la trace en mémoire reste valide.
  }
}

function pushTrailPoint(pts: TrailPt[], x: number, y: number, alt: number): TrailPt[] {
  if (!Number.isFinite(x) || !Number.isFinite(y)) return pts;
  const now = Date.now();
  const last = pts[pts.length - 1];
  if (!last) return [{ x, y, alt, at: now }];
  const dist = Math.hypot(x - last.x, y - last.y);
  if (dist < PF_TRAIL_MIN_STEP) return pts;
  const dt = (now - last.at) / 1000;
  const next = pts.concat({ x, y, alt, at: now, gap: isTrailGap(dist, dt) });
  return next.length > TRAIL_MAX_LEN ? thinOldest(next) : next;
}

type TrailRun = { color: string; points: string };

/**
 * Regroupe la trace en polylignes de même palier d'altitude. Un segment SVG par
 * point deviendrait ingérable sur un vol entier échantillonné à la seconde.
 */
function buildTrailRuns(trail: TrailPt[]): TrailRun[] {
  const runs: TrailRun[] = [];
  let current: TrailRun | null = null;
  let currentPts: { x: number; y: number }[] = [];
  let prev: TrailPt | null = null;
  const flush = () => {
    if (current && currentPts.length >= 2) {
      current.points = currentPts.map((pt) => `${pt.x.toFixed(2)},${pt.y.toFixed(2)}`).join(' ');
      runs.push(current);
    }
  };
  for (const pt of trail) {
    const color = altitudeToTrailColor(Math.round(pt.alt / TRAIL_ALT_STEP) * TRAIL_ALT_STEP);
    const dist = prev ? Math.hypot(pt.x - prev.x, pt.y - prev.y) : 0;
    const dt = prev ? (pt.at - prev.at) / 1000 : 1;
    // Recalcul : les anciens points (page fermée, cron 60 s) n'ont pas le flag gap.
    const broken = !!(prev && (pt.gap || isTrailGap(dist, dt)));
    if (!current || broken || color !== current.color) {
      if (current && !broken) currentPts.push(pt);
      flush();
      current = { color, points: '' };
      currentPts = [{ x: pt.x, y: pt.y }];
    } else {
      currentPts.push(pt);
    }
    prev = pt;
  }
  flush();
  return runs;
}

function decimateTrail(pts: TrailPt[], step: number): TrailPt[] {
  if (step <= 1 || pts.length <= 24) return pts;
  const last = pts.length - 1;
  const out: TrailPt[] = [];
  for (let i = 0; i <= last; i++) {
    const p = pts[i]!;
    if (i === 0 || i === last || p.gap || i % step === 0) out.push(p);
  }
  return out;
}

function trailDecimateStep(zoom: number): number {
  if (zoom >= 8) return 1;
  if (zoom >= 4) return 2;
  if (zoom >= 2) return 3;
  return 6;
}

/** Garde la seconde moitié intacte et n'échantillonne qu'un point sur deux dans la plus ancienne. */
function thinOldest(pts: TrailPt[]): TrailPt[] {
  const split = Math.floor(pts.length / 2);
  const old = pts.slice(0, split).filter((p, i) => i % 2 === 0 || p.gap);
  return old.concat(pts.slice(split));
}

/** Union par horodatage : l'historique worker complète la trace locale, sans l'écraser. */
function mergeTrailPoints(local: TrailPt[], server: TrailPt[]): TrailPt[] {
  if (!server.length) return local;
  if (!local.length) return server;
  const byBucket = new Map<number, TrailPt>();
  for (const p of local.concat(server)) {
    if (!Number.isFinite(p.x) || !Number.isFinite(p.y) || !Number.isFinite(p.at)) continue;
    const bucket = Math.round(p.at / 400);
    const prev = byBucket.get(bucket);
    if (!prev) byBucket.set(bucket, p);
  }
  const merged = [...byBucket.values()].sort((a, b) => a.at - b.at);
  return merged.length > TRAIL_MAX_LEN ? thinOldest(merged) : merged;
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

function visibleMapBounds(
  containerW: number,
  containerH: number,
  zoom: number,
  pan: { x: number; y: number },
): MapBounds {
  const { dispW, dispH } = fittedMapSize(containerW, containerH);
  const pad = 48;
  return {
    minX: PF_MAP_W * (0.5 + (-containerW / 2 - pan.x) / (zoom * dispW)) - pad,
    maxX: PF_MAP_W * (0.5 + (containerW / 2 - pan.x) / (zoom * dispW)) + pad,
    minY: PF_MAP_H * (0.5 + (-containerH / 2 - pan.y) / (zoom * dispH)) - pad,
    maxY: PF_MAP_H * (0.5 + (containerH / 2 - pan.y) / (zoom * dispH)) + pad,
  };
}

function tilesInBounds(
  tileZoom: number,
  bounds: MapBounds,
  opts?: { pad?: number; cx?: number; cy?: number },
): MapTile[] {
  const n = 2 ** tileZoom;
  const unit = pfTileUnit(tileZoom);
  const pad = opts?.pad ?? (tileZoom >= 6 ? 1 : 2);
  const x0 = Math.max(0, Math.floor(bounds.minX / unit) - pad);
  const y0 = Math.max(0, Math.floor(bounds.minY / unit) - pad);
  const x1 = Math.min(n - 1, Math.ceil(Math.min(PF_MAP_W, bounds.maxX) / unit) + pad);
  const y1 = Math.min(n - 1, Math.ceil(Math.min(PF_MAP_H, bounds.maxY) / unit) + pad);
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
  if (opts?.cx != null && opts?.cy != null) {
    const { cx, cy } = opts;
    list.sort((a, b) => tileCenterDist(a, cx, cy) - tileCenterDist(b, cx, cy));
  }
  return list;
}

function tileCenterDist(t: MapTile, cx: number, cy: number): number {
  return Math.hypot(t.left + t.width / 2 - cx, t.top + t.height / 2 - cy);
}

function stickyTileZ(prev: number, dispW: number, viewZoom: number, dpr: number): number {
  const raw = Math.log2(Math.max(2, (dispW * viewZoom * dpr) / PF_MAP_W));
  if (raw >= prev + 0.2) return Math.max(1, Math.min(MAX_TILE_Z, Math.ceil(raw)));
  if (raw <= prev - 0.55) return Math.max(1, Math.min(MAX_TILE_Z, Math.ceil(raw)));
  return prev;
}

function preloadTileLayer(z: number, bounds: MapBounds, cx: number, cy: number, cap: number, highCount: number) {
  const extra = tilesInBounds(z, bounds, { cx, cy, pad: 0 });
  const n = Math.min(extra.length, cap);
  for (let i = 0; i < n; i++) {
    const t = extra[i]!;
    const img = new Image();
    img.decoding = 'async';
    img.fetchPriority = i < highCount ? 'high' : 'low';
    img.src = tileUrl(t.z, t.x, t.y);
  }
}

function wheelZoomFactor(e: WheelEvent): number {
  let dy = e.deltaY;
  if (e.deltaMode === 1) dy *= 16;
  if (e.deltaMode === 2) dy *= 120;
  if (e.ctrlKey) return Math.exp(-dy * 0.014);
  if (Math.abs(dy) >= 40) return dy < 0 ? ZOOM_STEP : 1 / ZOOM_STEP;
  return Math.exp(-dy * 0.004);
}

function worldTransform(pan: { x: number; y: number }, zoom: number): string {
  return `translate3d(${pan.x}px, ${pan.y}px, 0) scale(${zoom})`;
}

function zoomSliderValue(zoom: number): string {
  return String(Math.log(zoom / MIN_VIEW_ZOOM) / Math.log(MAX_VIEW_ZOOM / MIN_VIEW_ZOOM));
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

const BASE_TILES = tilesInBounds(1, FULL_BOUNDS);

function revealTile(img: HTMLImageElement, key: string, loaded: Set<string>) {
  loaded.add(key);
  img.style.opacity = '1';
}

function tileHasPixels(img: HTMLImageElement): boolean {
  return img.complete && img.naturalWidth > 0;
}

function BootOverlay({ percent, leaving }: { percent: number; leaving: boolean }) {
  const clamped = Math.max(0, Math.min(100, percent));
  return (
    <div
      className={`absolute inset-0 z-30 flex items-center justify-center bg-slate-950/92 backdrop-blur-[2px] transition-opacity duration-300 ${
        leaving ? 'opacity-0 pointer-events-none' : 'opacity-100'
      }`}
      role="status"
      aria-live="polite"
      aria-busy={!leaving}
    >
      <div className="w-[min(22rem,calc(100%-2rem))] rounded-xl border border-cyan-700/40 bg-slate-900/90 px-5 py-4 shadow-xl shadow-black/40">
        <p className="text-sm font-semibold text-slate-100">Chargement de la carte…</p>
        <p className="mt-1 text-[11px] text-slate-400">Tuiles et trafic Mixou Airlines</p>
        <div
          className="mt-3 h-1.5 overflow-hidden rounded-full bg-slate-800"
          role="progressbar"
          aria-label="Chargement de la carte"
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={clamped}
          aria-valuetext={`${clamped} pour cent`}
        >
          <div
            className="h-full rounded-full bg-cyan-400 transition-[width] duration-200 ease-out"
            style={{ width: `${clamped}%` }}
          />
        </div>
        <p className="mt-1.5 text-right font-mono text-[11px] tabular-nums text-cyan-200">{clamped} %</p>
      </div>
    </div>
  );
}

const TileLayer = memo(function TileLayer({
  tiles,
  focusX,
  focusY,
  targetZ,
  onTileSettled,
}: {
  tiles: MapTile[];
  focusX: number;
  focusY: number;
  targetZ: number;
  onTileSettled?: (key: string) => void;
}) {
  const heldRef = useRef<Map<string, MapTile>>(new Map(BASE_TILES.map((t) => [t.key, t])));
  const loadedRef = useRef(new Set<string>(BASE_TILES.map((t) => t.key)));
  const recentZsRef = useRef<number[]>([1]);
  const [held, setHeld] = useState<MapTile[]>(() => {
    const map = new Map(BASE_TILES.map((t) => [t.key, t]));
    for (const t of tiles) map.set(t.key, t);
    return [...map.values()].sort((a, b) => a.z - b.z);
  });

  useEffect(() => {
    const cache = heldRef.current;
    for (const t of tiles) cache.set(t.key, t);
    const live = new Set(tiles.map((t) => t.key));
    const liveZs = [...new Set(tiles.map((t) => t.z))];
    const maxZ = Math.max(1, targetZ, ...liveZs);
    const hist = recentZsRef.current;
    if (hist[hist.length - 1] !== maxZ) {
      recentZsRef.current = [...hist, maxZ].slice(-6);
    }
    const prevZ = recentZsRef.current.length >= 2
      ? recentZsRef.current[recentZsRef.current.length - 2]!
      : 1;
    const targetReady = tiles.some((t) => t.z === targetZ && loadedRef.current.has(t.key));

    for (const [k, t] of cache) {
      if (live.has(k) || t.z === 1) continue;
      if (Math.abs(t.z - maxZ) <= TILE_Z_KEEP) continue;
      if (!targetReady && Math.abs(t.z - prevZ) <= 1) continue;
      cache.delete(k);
    }
    if (cache.size > TILE_HOLD_MAX) {
      const ranked = [...cache.values()]
        .filter((t) => t.z !== 1)
        .map((t) => ({
          key: t.key,
          live: live.has(t.key),
          target: t.z === targetZ,
          hold: !targetReady && Math.abs(t.z - prevZ) <= 1,
          zGap: Math.abs(t.z - maxZ),
          dist: tileCenterDist(t, focusX, focusY),
        }))
        .sort((a, b) => {
          if (a.live !== b.live) return a.live ? 1 : -1;
          if (a.target !== b.target) return a.target ? 1 : -1;
          if (a.hold !== b.hold) return a.hold ? 1 : -1;
          if (a.zGap !== b.zGap) return b.zGap - a.zGap;
          return b.dist - a.dist;
        });
      for (const row of ranked) {
        if (cache.size <= TILE_HOLD_MAX) break;
        if (row.live && row.target) continue;
        if (row.hold) continue;
        cache.delete(row.key);
      }
    }
    const next = [...cache.values()].sort(
      (a, b) => a.z - b.z || tileCenterDist(a, focusX, focusY) - tileCenterDist(b, focusX, focusY),
    );
    setHeld(next);
  }, [tiles, focusX, focusY, targetZ]);

  return (
    <div className="absolute inset-0 overflow-hidden pointer-events-none">
      {held.map((t) => {
        const near = tileCenterDist(t, focusX, focusY) < t.width * 1.8;
        const high = t.z <= 2 || (t.z === targetZ && near);
        const ready = t.z === 1 || loadedRef.current.has(t.key);
        return (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            key={t.key}
            alt=""
            draggable={false}
            src={tileUrl(t.z, t.x, t.y)}
            decoding={t.z === 1 ? 'sync' : 'async'}
            fetchPriority={high ? 'high' : 'low'}
            className="absolute max-w-none select-none pointer-events-none"
            style={{
              left: `${(t.left / PF_MAP_W) * 100}%`,
              top: `${(t.top / PF_MAP_H) * 100}%`,
              width: `calc(${(t.width / PF_MAP_W) * 100}% + 1px)`,
              height: `calc(${(t.height / PF_MAP_H) * 100}% + 1px)`,
              zIndex: t.z,
              opacity: ready ? 1 : 0,
              transition: 'opacity 90ms linear',
              userSelect: 'none',
            }}
            ref={(el) => {
              if (!el) return;
              if (tileHasPixels(el)) {
                revealTile(el, t.key, loadedRef.current);
                onTileSettled?.(t.key);
              } else if (t.z === 1 || loadedRef.current.has(t.key)) {
                revealTile(el, t.key, loadedRef.current);
              }
            }}
            onLoad={(e) => {
              const img = e.currentTarget;
              const show = () => {
                revealTile(img, t.key, loadedRef.current);
                onTileSettled?.(t.key);
              };
              if (typeof img.decode === 'function') img.decode().then(show).catch(show);
              else show();
            }}
            onDragStart={(e) => e.preventDefault()}
            onError={(e) => {
              e.currentTarget.style.visibility = 'hidden';
              onTileSettled?.(t.key);
            }}
          />
        );
      })}
    </div>
  );
});

function FeedAge({ fetchedAt }: { fetchedAt: number | null }) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);
  if (fetchedAt === null) return null;
  const sec = Math.max(0, Math.round((now - fetchedAt) / 1000));
  return (
    <p className={`text-[11px] font-mono ${sec > 10 ? 'text-amber-300' : 'text-slate-500'}`}>
      position reçue il y a {sec} s
    </p>
  );
}

export default function PfTesterOdwMap() {
  const [aircraft, setAircraft] = useState<PfAircraft[]>([]);
  const [loading, setLoading] = useState(true);
  const [bootPhase, setBootPhase] = useState<'loading' | 'leaving' | 'done'>('loading');
  const [bootPercent, setBootPercent] = useState(0);
  const [layoutReady, setLayoutReady] = useState(false);
  const bootRef = useRef({
    done: false,
    traffic: false,
    expected: null as Set<string> | null,
    settled: new Set<string>(),
  });
  const bootFadeRef = useRef(0);
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
  const worldRef = useRef<HTMLDivElement>(null);
  const zoomLabelRef = useRef<HTMLSpanElement>(null);
  const zoomSliderRef = useRef<HTMLInputElement>(null);
  const scaleBarRef = useRef<HTMLSpanElement>(null);
  const scaleLabelRef = useRef<HTMLSpanElement>(null);
  const [trails, setTrails] = useState<Record<string, TrailPt[]>>({});
  const trailsRef = useRef(trails);
  trailsRef.current = trails;
  const [query, setQuery] = useState('');
  const [viewport, setViewport] = useState({ w: 900, h: 560 });
  const viewRef = useRef<ViewState>({ zoom: FIT_ZOOM, pan: { x: 0, y: 0 } });
  const layoutRef = useRef<Layout>({ w: 900, h: 560, dispW: 900, dispH: 560 * (PF_MAP_H / PF_MAP_W) });
  const dragRef = useRef({ x: 0, y: 0, moved: false });
  const commitTimerRef = useRef(0);
  const wheelIdleRef = useRef(0);
  const gesturingRef = useRef(false);
  const followIdRef = useRef<string | null>(null);
  followIdRef.current = followId;
  const motionRef = useRef<Record<string, Motion>>({});
  const shownRef = useRef<Record<string, { x: number; y: number; hdg: number }>>({});
  const lastDomViewRef = useRef({ zoom: NaN, panX: NaN, panY: NaN });
  const lastPointerRef = useRef<{ x: number; y: number } | null>(null);
  const lastCallsignRef = useRef<Record<string, string>>({});
  const tileZRef = useRef(1);
  const planeElsRef = useRef(new Map<string, { g: SVGGElement; ground: boolean; alt: number }>());
  const labelElsRef = useRef(new Map<string, HTMLDivElement>());
  const trailHeadElsRef = useRef(new Map<string, SVGPolylineElement>());
  const trailTailRef = useRef(new Map<string, TrailPt>());

  const { dispW, dispH } = fittedMapSize(viewport.w, viewport.h);
  layoutRef.current = { w: viewport.w, h: viewport.h, dispW, dispH };

  const flushCommit = useCallback((urgent = false) => {
    if (commitTimerRef.current) {
      window.clearTimeout(commitTimerRef.current);
      commitTimerRef.current = 0;
    }
    const v = viewRef.current;
    const apply = () => {
      setZoom((z) => (z === v.zoom ? z : v.zoom));
      setPan((p) => (p.x === v.pan.x && p.y === v.pan.y ? p : { x: v.pan.x, y: v.pan.y }));
    };
    if (urgent) apply();
    else startTransition(apply);
  }, []);

  const scheduleCommit = useCallback(() => {
    if (commitTimerRef.current) return;
    commitTimerRef.current = window.setTimeout(() => {
      commitTimerRef.current = 0;
      flushCommit(false);
      if (gesturingRef.current || followIdRef.current) scheduleCommit();
    }, VIEW_COMMIT_MS);
  }, [flushCommit]);
  const scheduleCommitRef = useRef(scheduleCommit);
  scheduleCommitRef.current = scheduleCommit;

  const applyView = useCallback((next: ViewState, mode: 'live' | 'commit' = 'commit') => {
    const layout = layoutRef.current;
    const z = clampViewZoom(next.zoom);
    const p = clampPan(next.pan, z, layout.w, layout.h, layout.dispW, layout.dispH);
    viewRef.current = { zoom: z, pan: p };
    if (mode === 'commit') flushCommit(true);
    else scheduleCommit();
  }, [flushCommit, scheduleCommit]);

  const lastAppliedAtRef = useRef(0);
  const applyAircraft = useCallback((next: PfAircraft[], serverId: string, at: number) => {
    lastAppliedAtRef.current = at;
    setAircraft(next);
    setFeedServerId(serverId);
    setFetchedAt(at);
    setError(null);
  }, []);

  const finishBoot = useCallback(() => {
    const b = bootRef.current;
    if (b.done) return;
    b.done = true;
    setBootPercent(100);
    setBootPhase('leaving');
    if (bootFadeRef.current) window.clearTimeout(bootFadeRef.current);
    bootFadeRef.current = window.setTimeout(() => setBootPhase('done'), BOOT_FADE_MS);
  }, []);

  const tryFinishBoot = useCallback(() => {
    const b = bootRef.current;
    if (b.done) return;
    const exp = b.expected;
    const tilePart = !exp ? 0 : exp.size === 0 ? 1 : Math.min(1, b.settled.size / exp.size);
    const pct = Math.min(100, Math.round(tilePart * 80 + (b.traffic ? 20 : 0)));
    setBootPercent((prev) => (prev >= pct ? prev : pct));
    if (exp && b.settled.size >= exp.size && b.traffic) finishBoot();
  }, [finishBoot]);

  const tryFinishBootRef = useRef(tryFinishBoot);
  tryFinishBootRef.current = tryFinishBoot;

  const onTileSettled = useCallback((key: string) => {
    const b = bootRef.current;
    if (b.done || !b.expected?.has(key) || b.settled.has(key)) return;
    b.settled.add(key);
    tryFinishBootRef.current();
  }, []);

  const inFlightRef = useRef(false);

  const liveInFlightRef = useRef(false);

  const fetchLiveFallback = useCallback(async () => {
    if (Date.now() - lastAppliedAtRef.current < 4_000) return;
    if (liveInFlightRef.current) return;
    liveInFlightRef.current = true;
    try {
      const live = await fetch(`/api/pftester-odw/live?t=${Date.now()}`, { cache: 'no-store' });
      if (live.ok) {
        const data = await live.json().catch(() => null);
        if (data && Array.isArray(data.aircraft)) {
          applyAircraft(
            data.aircraft,
            typeof data.serverId === 'string' ? data.serverId : PF_DEFAULT_SERVER_ID,
            typeof data.fetchedAt === 'number' ? data.fetchedAt : Date.now(),
          );
          return;
        }
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
      liveInFlightRef.current = false;
    }
  }, [applyAircraft]);

  const fetchFlights = useCallback(async () => {
    if (inFlightRef.current) return;
    inFlightRef.current = true;
    try {
      const snap = await fetch(`/api/pftester-odw/now?t=${Date.now()}`, { cache: 'no-store' });
      if (snap.ok) {
        const data = await snap.json().catch(() => null);
        const at = typeof data?.fetchedAt === 'number' ? data.fetchedAt : 0;
        const age = at ? Date.now() - at : Infinity;
        if (data && Array.isArray(data.aircraft) && data.aircraft.length && age < 20_000) {
          applyAircraft(data.aircraft, data.serverId || PF_DEFAULT_SERVER_ID, at);
          if (age > 4_000) void fetchLiveFallback();
          return;
        }
      }
      await fetchLiveFallback();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Erreur trafic');
    } finally {
      inFlightRef.current = false;
      setLoading(false);
      if (!bootRef.current.traffic) {
        bootRef.current.traffic = true;
        tryFinishBootRef.current();
      }
    }
  }, [applyAircraft, fetchLiveFallback]);

  const fetchTracks = useCallback(async () => {
    try {
      const res = await fetch(`/api/pftester-odw/tracks?t=${Date.now()}`, { cache: 'no-store' });
      if (!res.ok) return;
      const data = await res.json().catch(() => null);
      if (!data || !data.tracks) return;
      const server = data.tracks as Record<string, TrailPt[]>;
      if (!Object.keys(server).length) return;
      setTrails((prev) => {
        let changed = false;
        const next = { ...prev };
        for (const [key, pts] of Object.entries(server)) {
          if (!Array.isArray(pts) || pts.length < 2) continue;
          const prevPts = prev[key] ?? [];
          const merged = mergeTrailPoints(prevPts, pts);
          if (merged.length > prevPts.length) {
            next[key] = merged;
            changed = true;
          }
        }
        return changed ? next : prev;
      });
    } catch {
      // Worker absent ou route indisponible : l'historique local suffit.
    }
  }, []);

  useEffect(() => {
    setLoading(true);
    setTrails(loadStoredTrails());
    fetchFlights();
    fetchTracks();
    let worker: Worker | null = null;
    let workerUrl = '';
    try {
      workerUrl = URL.createObjectURL(
        new Blob([`setInterval(() => postMessage('tick'), ${REFRESH_MS});`], { type: 'text/javascript' }),
      );
      worker = new Worker(workerUrl);
      worker.onmessage = () => {
        fetchFlights();
      };
    } catch {
      worker = null;
    }
    const liveTimer = worker ? null : setInterval(fetchFlights, REFRESH_MS);
    const backupTimer = setInterval(() => void fetchLiveFallback(), LIVE_BACKUP_MS);
    const tracksTimer = setInterval(fetchTracks, TRAIL_TRACKS_MS);
    const onVisible = () => {
      if (document.visibilityState !== 'visible') return;
      inFlightRef.current = false;
      fetchFlights();
      fetchTracks();
    };
    document.addEventListener('visibilitychange', onVisible);
    window.addEventListener('focus', onVisible);
    return () => {
      if (liveTimer) clearInterval(liveTimer);
      clearInterval(backupTimer);
      clearInterval(tracksTimer);
      worker?.terminate();
      if (workerUrl) URL.revokeObjectURL(workerUrl);
      document.removeEventListener('visibilitychange', onVisible);
      window.removeEventListener('focus', onVisible);
    };
  }, [fetchFlights, fetchLiveFallback, fetchTracks]);

  useEffect(() => {
    const el = mapContainerRef.current;
    if (!el) return;
    const applySize = (width: number, height: number) => {
      if (width <= 0 || height <= 0) return;
      setViewport((prev) => (
        Math.abs(prev.w - width) < 0.5 && Math.abs(prev.h - height) < 0.5
          ? prev
          : { w: width, h: height }
      ));
      setLayoutReady(true);
    };
    const ro = new ResizeObserver(() => {
      const r = el.getBoundingClientRect();
      applySize(r.width, r.height);
    });
    ro.observe(el);
    const r = el.getBoundingClientRect();
    applySize(r.width, r.height);
    return () => ro.disconnect();
  }, []);

  useEffect(() => {
    const v = viewRef.current;
    applyView({ zoom: v.zoom, pan: v.pan }, 'commit');
  }, [viewport.w, viewport.h, dispW, dispH, applyView]);

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
    if (!plotted.length) return;
    setTrails((prev) => {
      const next: Record<string, TrailPt[]> = {};
      const cutoff = Date.now() - TRAIL_GONE_MS;
      const airborne = new Set(plotted.map((a) => trailKey(a)));
      let changed = false;
      // Tant que l'avion est dans le flux, sa trace est gardée : l'onglet en
      // arrière-plan espace les relevés sans que le vol soit pour autant terminé.
      for (const [key, pts] of Object.entries(prev)) {
        if (pts.length > 1 && (airborne.has(key) || pts[pts.length - 1]!.at > cutoff)) next[key] = pts;
        else changed = true;
      }
      for (const a of plotted) {
        const key = trailKey(a);
        const pts = pushTrailPoint(prev[key] ?? [], a.mapX, a.mapY, a.altitude);
        if (pts !== prev[key]) changed = true;
        next[key] = pts;
      }
      if (!changed && Object.keys(prev).length === Object.keys(next).length) return prev;
      return next;
    });
  }, [plotted]);

  useEffect(() => {
    const t = setInterval(() => saveStoredTrails(trailsRef.current), TRAIL_SAVE_MS);
    // L'onglet masqué voit ses minuteurs bridés : on écrit avant de perdre la main.
    const onHide = () => saveStoredTrails(trailsRef.current);
    window.addEventListener('pagehide', onHide);
    document.addEventListener('visibilitychange', onHide);
    return () => {
      clearInterval(t);
      window.removeEventListener('pagehide', onHide);
      document.removeEventListener('visibilitychange', onHide);
      saveStoredTrails(trailsRef.current);
    };
  }, []);

  useEffect(() => {
    const now = performance.now();
    const nextMotion: Record<string, Motion> = {};
    const nextSigns = { ...lastCallsignRef.current };
    for (const a of plotted) {
      const shown = shownRef.current[a.id];
      const jump = !!shown && Math.hypot(shown.x - a.mapX, shown.y - a.mapY) > MOTION_SNAP_STEP;
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

  const syncWorldDom = useCallback((v: ViewState) => {
    const world = worldRef.current;
    const layout = layoutRef.current;
    const prev = lastDomViewRef.current;
    if (prev.zoom === v.zoom && prev.panX === v.pan.x && prev.panY === v.pan.y && world) {
      // HUD échelle peut quand même changer si le viewport a bougé ; ignoré ici.
    } else {
      lastDomViewRef.current = { zoom: v.zoom, panX: v.pan.x, panY: v.pan.y };
      if (world) {
        world.style.transform = worldTransform(v.pan, v.zoom);
        world.style.setProperty('--map-inv-z', String(1 / v.zoom));
      }
      if (zoomLabelRef.current) {
        zoomLabelRef.current.textContent = `×${v.zoom >= 10 ? Math.round(v.zoom) : v.zoom.toFixed(1)}`;
      }
      if (zoomSliderRef.current) zoomSliderRef.current.value = zoomSliderValue(v.zoom);
    }
    const mapNm = (layout.w / Math.max(1, layout.dispW * v.zoom)) * PF_MAP_W / PF_NM_TO_MAP;
    const nm = niceNm(mapNm * 0.18);
    const px = (nm * PF_NM_TO_MAP / PF_MAP_W) * layout.dispW * v.zoom;
    if (scaleBarRef.current) scaleBarRef.current.style.width = `${Math.max(18, Math.min(140, px))}px`;
    if (scaleLabelRef.current) scaleLabelRef.current.textContent = `${nm} NM`;
  }, []);

  useLayoutEffect(() => {
    syncWorldDom(viewRef.current);
  }, [dispW, dispH, syncWorldDom]);

  useEffect(() => {
    let frame = 0;
    const loop = (now: number) => {
      const layout = layoutRef.current;
      const v = viewRef.current;
      const iconS = PF_MAP_W / Math.max(1, layout.dispW * v.zoom);
      const follow = followIdRef.current;
      let followPos: { x: number; y: number } | null = null;

      for (const [id, m] of Object.entries(motionRef.current)) {
        const t = Math.min(1, (now - m.t0) / MOTION_MS);
        const ease = t * t * (3 - 2 * t);
        const x = m.fromX + (m.toX - m.fromX) * ease;
        const y = m.fromY + (m.toY - m.fromY) * ease;
        const hdg = lerpAngle(m.fromHdg, m.toHdg, ease);
        shownRef.current[id] = { x, y, hdg };
        const plane = planeElsRef.current.get(id);
        if (plane) {
          const s = iconS * (plane.ground ? 0.7 : 0.9);
          plane.g.setAttribute('transform', `translate(${x} ${y}) scale(${s}) rotate(${hdg})`);
        }
        const label = labelElsRef.current.get(id);
        if (label) {
          label.style.left = `${(x / PF_MAP_W) * 100}%`;
          label.style.top = `${(y / PF_MAP_H) * 100}%`;
        }
        const head = trailHeadElsRef.current.get(id);
        const tail = trailTailRef.current.get(id);
        if (head && tail) {
          const dist = Math.hypot(x - tail.x, y - tail.y);
          if (isTrailGap(dist, (Date.now() - tail.at) / 1000)) {
            head.setAttribute('points', '');
          } else {
            head.setAttribute('points', `${tail.x.toFixed(2)},${tail.y.toFixed(2)} ${x.toFixed(2)},${y.toFixed(2)}`);
            if (plane) head.setAttribute('stroke', altitudeToTrailColor(Math.round(plane.alt / TRAIL_ALT_STEP) * TRAIL_ALT_STEP));
          }
        }
        if (follow === id) followPos = { x, y };
      }

      if (followPos && !panStartRef.current && !pinchStartRef.current) {
        viewRef.current = {
          zoom: v.zoom,
          pan: clampPan(panToMapPoint(followPos.x, followPos.y, v.zoom, layout.dispW, layout.dispH), v.zoom, layout.w, layout.h, layout.dispW, layout.dispH),
        };
        scheduleCommitRef.current();
      }
      syncWorldDom(viewRef.current);
      frame = requestAnimationFrame(loop);
    };
    frame = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(frame);
  }, [syncWorldDom]);

  const applyZoomAt = useCallback((clientX: number, clientY: number, nextZoom: number) => {
    const z = clampViewZoom(nextZoom);
    const el = mapContainerRef.current;
    const cur = viewRef.current;
    if (!el || cur.zoom === z) {
      applyView({ zoom: z, pan: cur.pan }, 'live');
      return;
    }
    const rect = el.getBoundingClientRect();
    const cx = clientX - rect.left - rect.width / 2;
    const cy = clientY - rect.top - rect.height / 2;
    const k = z / cur.zoom;
    applyView({
      zoom: z,
      pan: { x: cx * (1 - k) + cur.pan.x * k, y: cy * (1 - k) + cur.pan.y * k },
    }, 'live');
  }, [applyView]);

  const updateZoom = useCallback((next: number) => {
    const el = mapContainerRef.current;
    const pointer = lastPointerRef.current;
    if (el && pointer) {
      applyZoomAt(pointer.x, pointer.y, next);
      return;
    }
    if (!el) {
      applyView({ zoom: next, pan: viewRef.current.pan }, 'commit');
      return;
    }
    const r = el.getBoundingClientRect();
    applyZoomAt(r.left + r.width / 2, r.top + r.height / 2, next);
  }, [applyView, applyZoomAt]);

  const nudgePan = useCallback((dx: number, dy: number) => {
    const cur = viewRef.current;
    setFollowId(null);
    applyView({ zoom: cur.zoom, pan: { x: cur.pan.x + dx, y: cur.pan.y + dy } }, 'commit');
  }, [applyView]);

  const posOf = useCallback((a: PfAircraft) => {
    const d = shownRef.current[a.id];
    return { x: d?.x ?? a.mapX, y: d?.y ?? a.mapY, hdg: d?.hdg ?? a.heading };
  }, []);

  const focusAircraft = useCallback((a: PfAircraft, nextZoom = Math.max(viewRef.current.zoom, FOCUS_ZOOM)) => {
    const z = clampViewZoom(nextZoom);
    const p = posOf(a);
    applyView({ zoom: z, pan: panToMapPoint(p.x, p.y, z, dispW, dispH) }, 'commit');
  }, [applyView, dispW, dispH, posOf]);

  const resetView = useCallback(() => {
    setFollowId(null);
    applyView({ zoom: FIT_ZOOM, pan: { x: 0, y: 0 } }, 'commit');
  }, [applyView]);

  useEffect(() => {
    const el = mapContainerRef.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      lastPointerRef.current = { x: e.clientX, y: e.clientY };
      gesturingRef.current = true;
      applyZoomAt(e.clientX, e.clientY, viewRef.current.zoom * wheelZoomFactor(e));
      if (wheelIdleRef.current) window.clearTimeout(wheelIdleRef.current);
      wheelIdleRef.current = window.setTimeout(() => {
        gesturingRef.current = false;
        flushCommit(true);
      }, 140);
    };
    el.addEventListener('wheel', onWheel, { passive: false });
    return () => el.removeEventListener('wheel', onWheel);
  }, [applyZoomAt, flushCommit]);

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
        const down = e.key === 'ArrowDown' || e.key === 's' || e.key === 'D';
        nudgePan(left ? step : right ? -step : 0, up ? step : down ? -step : 0);
      }
    };
    el.addEventListener('keydown', onKey);
    return () => el.removeEventListener('keydown', onKey);
  }, [nudgePan, resetView, selectedId, updateZoom]);

  function startPan(clientX: number, clientY: number) {
    dragRef.current = { x: clientX, y: clientY, moved: false };
    panStartRef.current = { x: viewRef.current.pan.x, y: viewRef.current.pan.y, mouseX: clientX, mouseY: clientY };
    gesturingRef.current = true;
    setIsPanning(true);
  }
  function movePan(clientX: number, clientY: number) {
    if (!panStartRef.current) return;
    if (!dragRef.current.moved && Math.hypot(clientX - dragRef.current.x, clientY - dragRef.current.y) > 5) {
      dragRef.current.moved = true;
      setFollowId(null);
    }
    applyView({
      zoom: viewRef.current.zoom,
      pan: {
        x: panStartRef.current.x + (clientX - panStartRef.current.mouseX),
        y: panStartRef.current.y + (clientY - panStartRef.current.mouseY),
      },
    }, 'live');
  }
  function endPan() {
    panStartRef.current = null;
    gesturingRef.current = pointersRef.current.size > 0;
    setIsPanning(false);
    flushCommit(true);
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
  const tileZ = stickyTileZ(tileZRef.current, dispW, zoom, dpr);
  tileZRef.current = tileZ;
  const midZ = tileZ >= 3 ? tileZ - 1 : 0;
  const coarseZ = tileZ >= 4 ? tileZ - 2 : 0;
  const bounds = useMemo(
    () => visibleMapBounds(viewport.w, viewport.h, zoom, pan),
    [viewport.w, viewport.h, zoom, pan],
  );
  const focusX = (bounds.minX + bounds.maxX) / 2;
  const focusY = (bounds.minY + bounds.maxY) / 2;
  const mapTiles = useMemo(() => {
    const seen = new Set<string>();
    const out: MapTile[] = [];
    const zs = [...new Set([1, coarseZ, midZ, tileZ].filter((z) => z >= 1))].sort((a, b) => a - b);
    for (const z of zs) {
      const layer = z === 1
        ? BASE_TILES
        : tilesInBounds(z, bounds, { cx: focusX, cy: focusY, pad: z === tileZ ? undefined : 1 });
      for (const t of layer) {
        if (seen.has(t.key)) continue;
        seen.add(t.key);
        out.push(t);
      }
    }
    return out;
  }, [tileZ, midZ, coarseZ, bounds, focusX, focusY]);

  useEffect(() => {
    const b = bootRef.current;
    if (b.done || b.expected || !layoutReady) return;
    const expected = new Set(mapTiles.map((t) => t.key));
    b.expected = expected;
    if (expected.size === 0) {
      tryFinishBootRef.current();
      return;
    }
    for (const t of mapTiles) {
      const img = new Image();
      img.decoding = 'async';
      img.fetchPriority = 'high';
      const settle = () => onTileSettled(t.key);
      img.onload = settle;
      img.onerror = settle;
      img.src = tileUrl(t.z, t.x, t.y);
      if (img.complete) settle();
    }
    tryFinishBootRef.current();
  }, [layoutReady, mapTiles, onTileSettled]);

  useEffect(() => {
    const id = window.setTimeout(() => finishBoot(), BOOT_TIMEOUT_MS);
    return () => {
      window.clearTimeout(id);
      if (bootFadeRef.current) window.clearTimeout(bootFadeRef.current);
    };
  }, [finishBoot]);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const nextZ = Math.min(MAX_TILE_Z, tileZ + 1);
    if (nextZ > tileZ) preloadTileLayer(nextZ, bounds, focusX, focusY, 12, 4);
    const underZ = Math.max(1, tileZ - 2);
    if (underZ < tileZ && underZ > 1) preloadTileLayer(underZ, bounds, focusX, focusY, 8, 2);
  }, [tileZ, bounds, focusX, focusY]);

  const selected = plotted.find((a) => a.id === selectedId) ?? null;
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
  const trailStep = trailDecimateStep(zoom);
  const trailShapes = useMemo(() => {
    const tails = trailTailRef.current;
    tails.clear();
    return plotted.flatMap((a) => {
      const trail = trails[trailKey(a)];
      if (!trail || trail.length < 2) return [];
      const pts = decimateTrail(trail, trailStep);
      const last = pts[pts.length - 1]!;
      tails.set(a.id, last);
      return [{ id: a.id, alt: a.altitude, runs: buildTrailRuns(pts).filter((run) => run.points.includes(' ')) }];
    });
  }, [plotted, trails, trailStep]);
  const iconS = PF_MAP_W / Math.max(1, dispW * zoom);

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
    <div className="flex-1 min-h-0 w-full flex flex-col md:flex-row gap-3 md:gap-4 relative">
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
              gesturingRef.current = true;
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
        <div
          ref={worldRef}
          className="absolute pointer-events-none bg-[#0b1c2c]"
          style={{
            left: '50%',
            top: '50%',
            width: dispW,
            height: dispH,
            marginLeft: -dispW / 2,
            marginTop: -dispH / 2,
            transformOrigin: 'center center',
            willChange: 'transform',
            backfaceVisibility: 'hidden',
            ['--map-inv-z' as string]: String(1 / FIT_ZOOM),
          }}
        >
          <TileLayer tiles={mapTiles} focusX={focusX} focusY={focusY} targetZ={tileZ} onTileSettled={onTileSettled} />
          {zoom >= AIRPORT_ZOOM && PF_AIRPORTS.map((ap) => (
            <div
              key={`ap-${ap.code}`}
              className="absolute pointer-events-none font-mono font-bold text-slate-100 z-[1] origin-top-left"
              style={{
                left: `${(ap.mapX / PF_MAP_W) * 100}%`,
                top: `${(ap.mapY / PF_MAP_H) * 100}%`,
                fontSize: 10,
                lineHeight: 1.15,
                textShadow: '0 1px 2px rgba(0,0,0,0.9)',
                transform: 'scale(var(--map-inv-z, 1)) translate(8px, -12px)',
              }}
            >
              {ap.code}
              {zoom >= 4 && <span className="block text-slate-300 font-normal">{ap.name}</span>}
            </div>
          ))}
          {plotted.map((a) => {
            const isSelected = selectedId === a.id;
            if (!isSelected && !showAllLabels && followId !== a.id) return null;
            const p = posOf(a);
            const color = isSelected || followId === a.id ? PLANE_ACTIVE : PLANE_IDLE;
            return (
              <div
                key={`${a.id}-label`}
                ref={(el) => {
                  if (el) labelElsRef.current.set(a.id, el);
                  else labelElsRef.current.delete(a.id);
                }}
                className="absolute pointer-events-none whitespace-nowrap font-mono font-bold z-[1] origin-top-left"
                style={{
                  left: `${(p.x / PF_MAP_W) * 100}%`,
                  top: `${(p.y / PF_MAP_H) * 100}%`,
                  color,
                  fontSize: isSelected ? 11 : 10,
                  lineHeight: 1.15,
                  textShadow: '0 1px 2px rgba(0,0,0,0.9)',
                  transform: 'scale(var(--map-inv-z, 1)) translate(10px, -14px)',
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

          <svg
            className="absolute inset-0 z-[1] overflow-visible pointer-events-none"
            viewBox={`0 0 ${PF_MAP_W} ${PF_MAP_H}`}
            width={dispW}
            height={dispH}
            preserveAspectRatio="none"
          >
            {zoom >= AIRPORT_ZOOM && PF_AIRPORTS.map((ap) => (
              <g
                key={ap.code}
                className="pointer-events-auto"
                style={{ cursor: 'pointer' }}
                transform={`translate(${ap.mapX} ${ap.mapY}) scale(${iconS})`}
                onClick={() => {
                  if (dragRef.current.moved) return;
                  applyView({
                    zoom: Math.max(viewRef.current.zoom, 6),
                    pan: panToMapPoint(ap.mapX, ap.mapY, Math.max(viewRef.current.zoom, 6), dispW, dispH),
                  }, 'commit');
                }}
              >
                <rect x={-4} y={-4} width={8} height={8} fill="#e2e8f0" stroke="#0f172a" strokeWidth={1} />
              </g>
            ))}
            {trailShapes.map((shape) => (
              <g key={`${shape.id}-trail`}>
                {shape.runs.map((run, i) => (
                  <polyline
                    key={`${shape.id}-t${i}`}
                    points={run.points}
                    fill="none"
                    stroke={run.color}
                    strokeWidth={3 * iconS}
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    opacity={0.95}
                  />
                ))}
                <polyline
                  ref={(el) => {
                    if (el) trailHeadElsRef.current.set(shape.id, el);
                    else trailHeadElsRef.current.delete(shape.id);
                  }}
                  points=""
                  fill="none"
                  stroke={altitudeToTrailColor(Math.round(shape.alt / TRAIL_ALT_STEP) * TRAIL_ALT_STEP)}
                  strokeWidth={3 * iconS}
                  strokeLinecap="round"
                  opacity={0.95}
                />
              </g>
            ))}
            {plotted.map((a) => {
              const isSelected = selectedId === a.id;
              const p = posOf(a);
              const color = isSelected || followId === a.id ? PLANE_ACTIVE : PLANE_IDLE;
              const ground = isOnGround(a.altitude, a.speed);
              const s = iconS * (ground ? 0.7 : 0.9);
              return (
                <g
                  key={a.id}
                  className="pointer-events-auto"
                  style={{ cursor: 'pointer' }}
                  ref={(el) => {
                    if (el) planeElsRef.current.set(a.id, { g: el, ground, alt: a.altitude });
                    else planeElsRef.current.delete(a.id);
                  }}
                  transform={`translate(${p.x} ${p.y}) scale(${s}) rotate(${p.hdg})`}
                  onClick={() => {
                    if (dragRef.current.moved) return;
                    selectAircraft(a.id);
                  }}
                >
                  <circle r={16} fill="transparent" />
                  <path
                    d={PLANE_BLIP_D}
                    fill={color}
                    stroke="rgba(15,23,42,0.9)"
                    strokeWidth={0.35}
                    paintOrder="stroke fill"
                  />
                </g>
              );
            })}
          </svg>
        </div>

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
            <span ref={scaleBarRef} className="block h-0.5 bg-slate-200" style={{ width: 36 }} />
            <span ref={scaleLabelRef} className="text-[9px] font-mono text-slate-300">20 NM</span>
          </div>
        </div>

        <div
          className="absolute bottom-3 right-3 flex flex-col items-center gap-1.5 z-10"
          onPointerDown={(e) => e.stopPropagation()}
        >
          <span
            ref={zoomLabelRef}
            className="px-1.5 py-0.5 rounded-md bg-slate-900/90 border border-slate-600 text-[10px] font-mono text-cyan-200 tabular-nums"
          >
            ×{FIT_ZOOM.toFixed(1)}
          </span>
          <input
            ref={zoomSliderRef}
            type="range"
            min={0}
            max={1}
            step={0.002}
            defaultValue={zoomSliderValue(FIT_ZOOM)}
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
          <FeedAge fetchedAt={fetchedAt} />
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
      {bootPhase !== 'done' ? <BootOverlay percent={bootPercent} leaving={bootPhase === 'leaving'} /> : null}
    </div>
  );
}
