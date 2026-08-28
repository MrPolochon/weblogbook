'use client';

import { memo, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { flushSync } from 'react-dom';
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

type PfHealth = {
  source: string | null;
  tickMs: number;
  aircraft: number;
  points: number;
  wsOk30s: number;
  wsMiss30s: number;
  wsFailTotal: number;
  workerFresh: boolean;
  cronLastStatus: string | null;
};

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

const MIN_VIEW_ZOOM = 0.85;
const MAX_VIEW_ZOOM = 48;
const MAX_TILE_Z = 8;
const FIT_ZOOM = 1;
const FOCUS_ZOOM = 8;
const KEEP_MAP_PX = 48;
const ZOOM_STEP = 1.28;
const MAX_TILE_PX = 520;
/** Marge de tuiles autour du viewport — pas un pad en unités carte (ça explose à z élevé). */
const TILE_MARGIN = 1;
/** Filet de sécurité : au-delà, on garde les tuiles les plus proches du centre. */
const MAX_DOM_TILES = 96;
/** Recommit React du pan (culling) hors drag : suivi avion, ~8 Hz. */
const VIEW_COMMIT_MS = 125;
const TILE_Z_THROTTLE_MS = 90;
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
const BOOT_TIMEOUT_MS = 30_000;
const BOOT_FADE_MS = 280;
/** Aligné sur REFRESH_MS : l'interpolation doit couvrir l'intervalle sans le devancer. */
const MOTION_MS = REFRESH_MS;
const AIRPORT_ZOOM = 1.7;
const LABEL_ZOOM = 1.8;
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

type TrailRun = { color: string; points: { x: number; y: number }[] };

/**
 * Regroupe la trace en polylignes de même palier d'altitude. Un segment SVG par
 * point deviendrait ingérable sur un vol entier échantillonné à la seconde.
 */
function buildTrailRuns(
  trail: TrailPt[],
  project: (pt: TrailPt) => { x: number; y: number },
  head: { x: number; y: number },
  headAlt: number,
  headMap: { x: number; y: number },
): TrailRun[] {
  const runs: TrailRun[] = [];
  let current: TrailRun | null = null;
  let prev: TrailPt | null = null;
  for (const pt of trail) {
    const color = altitudeToTrailColor(Math.round(pt.alt / TRAIL_ALT_STEP) * TRAIL_ALT_STEP);
    const xy = project(pt);
    const dist = prev ? Math.hypot(pt.x - prev.x, pt.y - prev.y) : 0;
    const dt = prev ? (pt.at - prev.at) / 1000 : 1;
    // Recalcul : les anciens points (page fermée, cron 60 s) n'ont pas le flag gap.
    const broken = !!(prev && (pt.gap || isTrailGap(dist, dt)));
    if (!current || broken || color !== current.color) {
      if (current && !broken) current.points.push(xy);
      current = { color, points: [xy] };
      runs.push(current);
    } else {
      current.points.push(xy);
    }
    prev = pt;
  }
  const last = trail[trail.length - 1];
  const headBroken = !!(
    last &&
    isTrailGap(Math.hypot(headMap.x - last.x, headMap.y - last.y), (Date.now() - last.at) / 1000)
  );
  if (headBroken) return runs;
  const headColor = altitudeToTrailColor(Math.round(headAlt / TRAIL_ALT_STEP) * TRAIL_ALT_STEP);
  if (current && current.color === headColor) current.points.push(head);
  else if (current) {
    runs.push({ color: headColor, points: [current.points[current.points.length - 1]!, head] });
  }
  return runs;
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
  return {
    minX: PF_MAP_W * (0.5 + (-containerW / 2 - pan.x) / (zoom * dispW)),
    maxX: PF_MAP_W * (0.5 + (containerW / 2 - pan.x) / (zoom * dispW)),
    minY: PF_MAP_H * (0.5 + (-containerH / 2 - pan.y) / (zoom * dispH)),
    maxY: PF_MAP_H * (0.5 + (containerH / 2 - pan.y) / (zoom * dispH)),
  };
}

function tilesInBounds(tileZoom: number, bounds: MapBounds): MapTile[] {
  const n = 2 ** tileZoom;
  const unit = pfTileUnit(tileZoom);
  const x0 = Math.max(0, Math.floor(bounds.minX / unit) - TILE_MARGIN);
  const y0 = Math.max(0, Math.floor(bounds.minY / unit) - TILE_MARGIN);
  const x1 = Math.min(n - 1, Math.floor(Math.min(PF_MAP_W, bounds.maxX) / unit) + TILE_MARGIN);
  const y1 = Math.min(n - 1, Math.floor(Math.min(PF_MAP_H, bounds.maxY) / unit) + TILE_MARGIN);
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
  if (list.length <= MAX_DOM_TILES) return list;
  const cx = (bounds.minX + bounds.maxX) / 2;
  const cy = (bounds.minY + bounds.maxY) / 2;
  list.sort((a, b) => {
    const da = Math.hypot(a.left + a.width / 2 - cx, a.top + a.height / 2 - cy);
    const db = Math.hypot(b.left + b.width / 2 - cx, b.top + b.height / 2 - cy);
    return da - db;
  });
  list.length = MAX_DOM_TILES;
  return list;
}

/** Trace : uniquement les points dans le viewport (+ 1 sommet hors champ) et un pas min. en px. */
function trailVisible(trail: TrailPt[], bounds: MapBounds, pad: number, minStep: number): TrailPt[] {
  if (trail.length < 2) return trail;
  const minX = bounds.minX - pad;
  const maxX = bounds.maxX + pad;
  const minY = bounds.minY - pad;
  const maxY = bounds.maxY + pad;
  const inside = (p: TrailPt) => p.x >= minX && p.x <= maxX && p.y >= minY && p.y <= maxY;
  const kept: TrailPt[] = [];
  let skipped = false;
  for (let i = 0; i < trail.length; i++) {
    const pt = trail[i]!;
    const vis = inside(pt) || (i > 0 && inside(trail[i - 1]!)) || (i + 1 < trail.length && inside(trail[i + 1]!));
    if (!vis) {
      skipped = true;
      continue;
    }
    const last = kept[kept.length - 1];
    const gap = !!(pt.gap || skipped);
    if (last && !gap && minStep > 0 && Math.hypot(pt.x - last.x, pt.y - last.y) < minStep) continue;
    kept.push(gap && !pt.gap ? { ...pt, gap: true } : pt);
    skipped = false;
  }
  return kept;
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

function BootOverlay({ percent, leaving }: { percent: number; leaving: boolean }) {
  const clamped = Math.max(0, Math.min(100, percent));
  return (
    <div
      className={`absolute inset-0 z-30 flex items-center justify-center bg-slate-950 transition-opacity duration-300 ${
        leaving ? 'opacity-0 pointer-events-none' : 'opacity-100 pointer-events-auto'
      }`}
      role="status"
      aria-live="polite"
      aria-busy={!leaving}
      onPointerDown={(e) => e.stopPropagation()}
      onPointerMove={(e) => e.stopPropagation()}
      onPointerUp={(e) => e.stopPropagation()}
      onWheel={(e) => {
        e.preventDefault();
        e.stopPropagation();
      }}
      onDoubleClick={(e) => e.stopPropagation()}
      onContextMenu={(e) => e.preventDefault()}
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
  zoom,
  pan,
  containerW,
  containerH,
  dispW,
  dispH,
  onTileSettled,
}: {
  tiles: MapTile[];
  zoom: number;
  pan: { x: number; y: number };
  containerW: number;
  containerH: number;
  dispW: number;
  dispH: number;
  onTileSettled?: (key: string) => void;
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
            decoding="async"
            src={tileUrl(t.z, t.x, t.y)}
            className="absolute max-w-none select-none pointer-events-none"
            style={{
              left: tl.x,
              top: tl.y,
              width: Math.max(1, br.x - tl.x) + 1,
              height: Math.max(1, br.y - tl.y) + 1,
              userSelect: 'none',
            }}
            ref={(el) => {
              if (el && el.complete) onTileSettled?.(t.key);
            }}
            onLoad={() => onTileSettled?.(t.key)}
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

const TrailLayer = memo(function TrailLayer({
  plotted,
  trails,
  selectedId,
  zoom,
  pan,
  containerW,
  containerH,
  dispW,
  dispH,
  bounds,
}: {
  plotted: PfAircraft[];
  trails: Record<string, TrailPt[]>;
  selectedId: string | null;
  zoom: number;
  pan: { x: number; y: number };
  containerW: number;
  containerH: number;
  dispW: number;
  dispH: number;
  bounds: MapBounds;
}) {
  if (!selectedId) return null;
  const pad = Math.max(0.35, (40 / Math.max(1, dispW * zoom)) * PF_MAP_W);
  const minStep = (2.5 / Math.max(1, dispW * zoom)) * PF_MAP_W;
  return (
    <>
      {plotted.map((a) => {
        if (a.id !== selectedId) return null;
        const trail = trails[trailKey(a)];
        if (!trail || trail.length < 2) return null;
        const vis = trailVisible(trail, bounds, pad, minStep);
        if (vis.length < 2) return null;
        const p = { x: a.mapX, y: a.mapY };
        const now = mapToScreen(p.x, p.y, zoom, pan, containerW, containerH, dispW, dispH);
        const runs = buildTrailRuns(
          vis,
          (pt) => mapToScreen(pt.x, pt.y, zoom, pan, containerW, containerH, dispW, dispH),
          now,
          a.altitude,
          p,
        );
        return (
          <g key={`${a.id}-trail`}>
            {runs.filter((run) => run.points.length >= 2).map((run, i) => (
              <polyline
                key={`${a.id}-t${i}`}
                points={run.points.map((pt) => `${pt.x},${pt.y}`).join(' ')}
                fill="none"
                stroke={run.color}
                strokeWidth={3}
                strokeLinecap="round"
                strokeLinejoin="round"
                opacity={0.95}
              />
            ))}
          </g>
        );
      })}
    </>
  );
});

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
  const [health, setHealth] = useState<PfHealth | null>(null);
  const [fetchedAt, setFetchedAt] = useState<number | null>(null);
  const [nowTick, setNowTick] = useState(() => Date.now());
  const [feedServerId, setFeedServerId] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [followId, setFollowId] = useState<string | null>(null);
  const [zoom, setZoom] = useState(FIT_ZOOM);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [tileZ, setTileZ] = useState(() => {
    const { dispW: w } = fittedMapSize(900, 560);
    const px = typeof window === 'undefined' ? 1 : Math.min(2, window.devicePixelRatio || 1);
    return Math.max(1, Math.min(MAX_TILE_Z, Math.ceil(Math.log2(Math.max(2, (w * FIT_ZOOM * px) / PF_MAP_W)))));
  });
  const [underZ, setUnderZ] = useState<number | null>(null);
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
  const [trails, setTrails] = useState<Record<string, TrailPt[]>>({});
  const trailsRef = useRef(trails);
  trailsRef.current = trails;
  const [query, setQuery] = useState('');
  const [display, setDisplay] = useState<Record<string, { x: number; y: number; hdg: number }>>({});
  const [viewport, setViewport] = useState({ w: 900, h: 560 });
  const viewRef = useRef<ViewState>({ zoom: FIT_ZOOM, pan: { x: 0, y: 0 } });
  const layoutRef = useRef<ViewState>({ zoom: FIT_ZOOM, pan: { x: 0, y: 0 } });
  const dragRef = useRef({ x: 0, y: 0, moved: false });
  const panRafRef = useRef(0);
  const commitRafRef = useRef(0);
  const lastCommitAtRef = useRef(0);
  const pendingCommitRef = useRef(false);
  const motionRef = useRef<Record<string, Motion>>({});
  const shownRef = useRef<Record<string, { x: number; y: number; hdg: number }>>({});
  const lastPaintRef = useRef(0);
  const lastPointerRef = useRef<{ x: number; y: number } | null>(null);
  const lastCallsignRef = useRef<Record<string, string>>({});
  const followIdRef = useRef<string | null>(null);
  followIdRef.current = followId;
  const loadedTilesRef = useRef(new Set<string>());

  const { dispW, dispH } = fittedMapSize(viewport.w, viewport.h);

  const writeWorldPan = useCallback(() => {
    const el = worldRef.current;
    if (!el) return;
    const dx = viewRef.current.pan.x - layoutRef.current.pan.x;
    const dy = viewRef.current.pan.y - layoutRef.current.pan.y;
    el.style.transform = dx === 0 && dy === 0 ? 'none' : `translate3d(${dx}px,${dy}px,0)`;
  }, []);

  const flushCommit = useCallback((sync: boolean) => {
    commitRafRef.current = 0;
    pendingCommitRef.current = false;
    if (panRafRef.current) {
      cancelAnimationFrame(panRafRef.current);
      panRafRef.current = 0;
    }
    const v = viewRef.current;
    const laid = layoutRef.current;
    if (v.zoom === laid.zoom && v.pan.x === laid.pan.x && v.pan.y === laid.pan.y) {
      writeWorldPan();
      return;
    }
    lastCommitAtRef.current = performance.now();
    const apply = () => {
      setZoom(v.zoom);
      setPan({ x: v.pan.x, y: v.pan.y });
    };
    if (sync) flushSync(apply);
    else apply();
  }, [writeWorldPan]);

  const scheduleCommit = useCallback((immediate: boolean) => {
    if (panStartRef.current && !immediate) return;
    if (immediate) {
      pendingCommitRef.current = true;
      if (commitRafRef.current) return;
      commitRafRef.current = requestAnimationFrame(() => flushCommit(true));
      return;
    }
    if (pendingCommitRef.current) return;
    if (performance.now() - lastCommitAtRef.current < VIEW_COMMIT_MS) return;
    pendingCommitRef.current = true;
    if (commitRafRef.current) return;
    commitRafRef.current = requestAnimationFrame(() => flushCommit(false));
  }, [flushCommit]);

  const applyView = useCallback((next: ViewState, mode: 'now' | 'pan' = 'now') => {
    const z = clampViewZoom(next.zoom);
    const p = clampPan(next.pan, z, viewport.w, viewport.h, dispW, dispH);
    const zoomChanged = Math.abs(z - layoutRef.current.zoom) > 1e-4;
    viewRef.current = { zoom: z, pan: p };
    if (mode === 'now' || zoomChanged) {
      scheduleCommit(true);
      return;
    }
    if (!panRafRef.current) {
      panRafRef.current = requestAnimationFrame(() => {
        panRafRef.current = 0;
        writeWorldPan();
      });
    }
    if (!panStartRef.current) scheduleCommit(false);
  }, [viewport.w, viewport.h, dispW, dispH, scheduleCommit, writeWorldPan]);

  useLayoutEffect(() => {
    layoutRef.current = { zoom, pan };
    writeWorldPan();
  }); // chaque render : réapplique le translate (React ne doit pas laisser un frame à pan stale + transform none)

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
    if (!exp) return;
    let got = 0;
    for (const k of exp) if (b.settled.has(k)) got++;
    const tilePart = exp.size === 0 ? 1 : got / exp.size;
    const ready = (exp.size === 0 || got >= exp.size) && b.traffic;
    const pct = ready ? 100 : Math.min(99, Math.round(tilePart * 80 + (b.traffic ? 19 : 0)));
    setBootPercent((prev) => (prev >= pct ? prev : pct));
    if (ready) finishBoot();
  }, [finishBoot]);

  const tryFinishBootRef = useRef(tryFinishBoot);
  tryFinishBootRef.current = tryFinishBoot;

  const underZRef = useRef<number | null>(null);
  const tileZLiveRef = useRef(1);
  const mapTilesRef = useRef<MapTile[]>([]);
  const dropUnderlayIfReady = useCallback(() => {
    if (underZRef.current == null) return;
    const z = tileZLiveRef.current;
    const current = mapTilesRef.current.filter((t) => t.z === z);
    if (!current.length) return;
    for (const t of current) {
      if (!loadedTilesRef.current.has(t.key)) return;
    }
    underZRef.current = null;
    setUnderZ(null);
  }, []);

  const onTileSettled = useCallback((key: string) => {
    loadedTilesRef.current.add(key);
    const b = bootRef.current;
    if (!b.done && !b.settled.has(key)) {
      b.settled.add(key);
      tryFinishBootRef.current();
    }
    dropUnderlayIfReady();
  }, [dropUnderlayIfReady]);

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
        if (data?.health && typeof data.health === 'object') setHealth(data.health as PfHealth);
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
    const id = setInterval(() => setNowTick(Date.now()), 1000);
    return () => clearInterval(id);
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
    const ro = new ResizeObserver(() => {
      const r = el.getBoundingClientRect();
      if (r.width > 0 && r.height > 0) {
        setViewport({ w: r.width, h: r.height });
        setLayoutReady(true);
      }
    });
    ro.observe(el);
    const r = el.getBoundingClientRect();
    if (r.width > 0 && r.height > 0) {
      setViewport({ w: r.width, h: r.height });
      setLayoutReady(true);
    }
    return () => ro.disconnect();
  }, []);

  useEffect(() => () => {
    if (panRafRef.current) cancelAnimationFrame(panRafRef.current);
    if (commitRafRef.current) cancelAnimationFrame(commitRafRef.current);
    if (bootFadeRef.current) window.clearTimeout(bootFadeRef.current);
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

  const applyViewRef = useRef(applyView);
  applyViewRef.current = applyView;
  const dispRef = useRef({ w: dispW, h: dispH });
  dispRef.current = { w: dispW, h: dispH };

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
        const prevShown = shownRef.current;
        shownRef.current = next;
        const fid = followIdRef.current;
        if (fid && next[fid]) {
          const p = next[fid]!;
          const { w, h } = dispRef.current;
          applyViewRef.current(
            { zoom: viewRef.current.zoom, pan: panToMapPoint(p.x, p.y, viewRef.current.zoom, w, h) },
            'pan',
          );
        }
        let same = Object.keys(next).length === Object.keys(prevShown).length;
        if (same) {
          for (const id of Object.keys(next)) {
            const a = next[id]!;
            const b = prevShown[id];
            if (!b || a.x !== b.x || a.y !== b.y || a.hdg !== b.hdg) {
              same = false;
              break;
            }
          }
        }
        if (!same) setDisplay(next);
      }
      frame = requestAnimationFrame(loop);
    };
    frame = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(frame);
  }, []);

  const applyZoomAt = useCallback((clientX: number, clientY: number, nextZoom: number) => {
    if (!bootRef.current.done) return;
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
    followIdRef.current = null;
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
    followIdRef.current = null;
    setFollowId(null);
    applyView({ zoom: FIT_ZOOM, pan: { x: 0, y: 0 } });
  }, [applyView]);

  useEffect(() => {
    if (!followId) return;
    if (!plotted.some((p) => p.id === followId)) {
      followIdRef.current = null;
      setFollowId(null);
    }
  }, [followId, plotted]);

  useEffect(() => {
    const el = mapContainerRef.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      if (!bootRef.current.done) return;
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
        if (selectedId) {
          const next = followIdRef.current === selectedId ? null : selectedId;
          followIdRef.current = next;
          setFollowId(next);
        }
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
    if (commitRafRef.current) {
      cancelAnimationFrame(commitRafRef.current);
      commitRafRef.current = 0;
    }
    pendingCommitRef.current = false;
    setIsPanning(true);
  }
  function movePan(clientX: number, clientY: number) {
    if (!panStartRef.current) return;
    if (!dragRef.current.moved && Math.hypot(clientX - dragRef.current.x, clientY - dragRef.current.y) > 5) {
      dragRef.current.moved = true;
      if (followIdRef.current) {
        followIdRef.current = null;
        setFollowId(null);
      }
    }
    applyView(
      {
        zoom: viewRef.current.zoom,
        pan: {
          x: panStartRef.current.x + (clientX - panStartRef.current.mouseX),
          y: panStartRef.current.y + (clientY - panStartRef.current.mouseY),
        },
      },
      'pan',
    );
  }
  function endPan() {
    panStartRef.current = null;
    if (commitRafRef.current) {
      cancelAnimationFrame(commitRafRef.current);
      commitRafRef.current = 0;
    }
    pendingCommitRef.current = false;
    flushCommit(true);
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
  const liveTileZ = Math.max(
    1,
    Math.min(MAX_TILE_Z, Math.ceil(Math.log2(Math.max(2, (dispW * zoom * dpr) / PF_MAP_W)))),
  );
  const bounds = useMemo(
    () => visibleMapBounds(viewport.w, viewport.h, zoom, pan),
    [viewport.w, viewport.h, zoom, pan],
  );

  useEffect(() => {
    if (liveTileZ === tileZ) return;
    if (liveTileZ < tileZ) {
      underZRef.current = null;
      tileZLiveRef.current = liveTileZ;
      setUnderZ(null);
      setTileZ(liveTileZ);
      return;
    }
    const prev = tileZ;
    const t = window.setTimeout(() => {
      const keepUnder = liveTileZ === prev + 1 && prev >= 1;
      underZRef.current = keepUnder ? prev : null;
      tileZLiveRef.current = liveTileZ;
      setUnderZ(keepUnder ? prev : null);
      setTileZ(liveTileZ);
    }, TILE_Z_THROTTLE_MS);
    return () => window.clearTimeout(t);
  }, [liveTileZ, tileZ]);

  const mapTiles = useMemo(() => {
    const seen = new Set<string>();
    const out: MapTile[] = [];
    const add = (layer: MapTile[]) => {
      for (const t of layer) {
        if (seen.has(t.key)) continue;
        seen.add(t.key);
        out.push(t);
      }
    };
    if (tileZ < 6 && tileScreenPx(1, dispW, zoom) <= MAX_TILE_PX) {
      add(tilesInBounds(1, { minX: 0, minY: 0, maxX: PF_MAP_W, maxY: PF_MAP_H }));
    }
    if (underZ != null && underZ >= tileZ - 1 && underZ < tileZ) {
      add(tilesInBounds(underZ, bounds));
    }
    add(tilesInBounds(tileZ, bounds));
    return out;
  }, [tileZ, underZ, bounds, dispW, zoom]);
  mapTilesRef.current = mapTiles;
  tileZLiveRef.current = tileZ;
  underZRef.current = underZ;

  useEffect(() => {
    dropUnderlayIfReady();
  }, [mapTiles, dropUnderlayIfReady]);

  useEffect(() => {
    if (!layoutReady) return;
    const b = bootRef.current;
    if (b.done) return;
    if (!b.expected) {
      b.expected = new Set(mapTiles.map((t) => t.key));
    }
    tryFinishBootRef.current();
    const hang = window.setTimeout(() => {
      const cur = bootRef.current;
      if (cur.done) return;
      if (cur.expected) {
        for (const k of cur.expected) cur.settled.add(k);
      } else {
        cur.expected = new Set();
      }
      cur.traffic = true;
      tryFinishBootRef.current();
    }, BOOT_TIMEOUT_MS);
    return () => window.clearTimeout(hang);
  }, [layoutReady, mapTiles]);
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
  const feedAgeSec = fetchedAt === null ? null : Math.max(0, Math.round((nowTick - fetchedAt) / 1000));
  const mapNm = (viewport.w / Math.max(1, dispW * zoom)) * PF_MAP_W / PF_NM_TO_MAP;
  const scaleNm = niceNm(mapNm * 0.18);
  const scalePx = (scaleNm * PF_NM_TO_MAP / PF_MAP_W) * dispW * zoom;

  function selectAircraft(id: string, fromList = false) {
    setSelectedId((prev) => {
      const next = prev === id ? null : id;
      if (!next) {
        followIdRef.current = null;
        setFollowId(null);
      }
      return next;
    });
    if (fromList) {
      const a = plotted.find((p) => p.id === id);
      if (a && selectedId !== id) {
        followIdRef.current = null;
        setFollowId(null);
        focusAircraft(a);
      }
    }
  }

  return (
    <div className="flex-1 min-h-0 w-full flex flex-col md:flex-row gap-3 md:gap-4">
      <div
        className={`flex-1 min-h-0 relative rounded-xl border border-cyan-700/40 bg-slate-950 overflow-hidden isolate touch-none outline-none overscroll-none select-none${
          bootPhase === 'loading' ? ' [&>:not([role=status])]:opacity-0' : ''
        }`}
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
        style={{
          cursor: isPanning ? 'grabbing' : 'grab',
          clipPath: 'inset(0)',
          pointerEvents: bootPhase === 'loading' ? 'none' : undefined,
        }}
      >
        <div
          ref={worldRef}
          className="absolute inset-0 z-0"
          style={{ pointerEvents: 'none', willChange: 'transform' }}
        >
        <TileLayer
          tiles={mapTiles}
          zoom={zoom}
          pan={pan}
          containerW={viewport.w}
          containerH={viewport.h}
          dispW={dispW}
          dispH={dispH}
          onTileSettled={onTileSettled}
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
          <TrailLayer
            plotted={plotted}
            trails={trails}
            selectedId={selectedId}
            zoom={zoom}
            pan={pan}
            containerW={viewport.w}
            containerH={viewport.h}
            dispW={dispW}
            dispH={dispH}
            bounds={bounds}
          />
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
                onClick={() => {
                  const next = followIdRef.current === selected.id ? null : selected.id;
                  followIdRef.current = next;
                  setFollowId(next);
                }}
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
        {bootPhase !== 'done' ? <BootOverlay percent={bootPercent} leaving={bootPhase === 'leaving'} /> : null}
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
          {health && (
            <p className={`text-[11px] font-mono ${health.workerFresh ? 'text-slate-500' : 'text-amber-300'}`}>
              {health.workerFresh ? 'worker' : 'worker arrêté'}
              {health.workerFresh && health.aircraft === 0 ? ' · aucun trafic Mixou' : ` · ${health.aircraft} av`}
              {` · collecte ${health.tickMs} ms`}
              {` · +${health.points} pts`}
              {` · WS ${health.wsOk30s} ok / ${health.wsMiss30s} vides`}
              {health.wsFailTotal ? ` · ${health.wsFailTotal} échecs` : ''}
              {!health.workerFresh && health.cronLastStatus ? ` · cron ${health.cronLastStatus}` : ''}
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
