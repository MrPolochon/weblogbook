import {
  DEFAULT_POSITIONS,
  DEFAULT_WAYPOINTS,
  DEFAULT_VORS,
  DEFAULT_ISLANDS,
  toSVG,
  type Point,
} from '@/lib/cartography-data';

export {
  AIRPORT_NAMES,
  AIRPORT_TO_FIR,
  DEFAULT_FIR_ZONES,
  DEFAULT_ISLANDS,
  DEFAULT_POSITIONS,
  DEFAULT_WAYPOINTS,
  DEFAULT_VORS,
  PTFS_OFFICIAL_CHART_SRC,
  SVG_H,
  SVG_W,
  toSVG,
  type FIRZone,
  type Island,
  type Point,
} from '@/lib/cartography-data';

export function interpolatePosition(from: Point, to: Point, t: number): Point {
  const clamped = Math.max(0, Math.min(1, t));
  return {
    x: from.x + (to.x - from.x) * clamped,
    y: from.y + (to.y - from.y) * clamped,
  };
}

/** Returns heading in degrees (0=N, 90=E, 180=S, 270=W) */
export function calculateHeading(from: Point, to: Point): number {
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  const rad = Math.atan2(dx, -dy);
  return ((rad * 180) / Math.PI + 360) % 360;
}

export function calculateDistance(a: Point, b: Point): number {
  const dx = a.x - b.x;
  const dy = a.y - b.y;
  return Math.sqrt(dx * dx + dy * dy);
}

/** Silhouette avion centrée sur (0,0), nez vers le nord (−Y). Utiliser `rotate(heading)` avec `calculateHeading`. */
export const PLANE_BLIP_D =
  'M0,-5.2 L1.35,-0.85 L2.8,-0.3 L2.8,0.55 L1.15,0.55 L1.15,3.6 L-1.15,3.6 L-1.15,0.55 L-2.8,0.55 L-2.8,-0.3 L-1.35,-0.85 Z';

// ─── Route-based interpolation ───────────────────────────────────────────────

const waypointIndex = new Map<string, Point>();
for (const wp of DEFAULT_WAYPOINTS) {
  waypointIndex.set(wp.code.toUpperCase(), toSVG({ x: wp.x, y: wp.y }));
}
for (const vor of DEFAULT_VORS) {
  waypointIndex.set(vor.code.toUpperCase(), toSVG({ x: vor.x, y: vor.y }));
}
for (const [code, pos] of Object.entries(DEFAULT_POSITIONS)) {
  waypointIndex.set(code.toUpperCase(), toSVG(pos));
}

function resolveWaypoint(code: string): Point | null {
  return waypointIndex.get(code.toUpperCase()) ?? null;
}

// ─── Local flight (same dep/arr): orbit around the nearest island ────────────

const ORBIT_MARGIN = 35;
const ORBIT_SAMPLE_STEP = 4;

function islandCentroid(pts: Point[]): Point {
  let sx = 0, sy = 0;
  for (const p of pts) { sx += p.x; sy += p.y; }
  return { x: sx / pts.length, y: sy / pts.length };
}

function findNearestIsland(svgPt: Point): { points: Point[] } | null {
  let best: { points: Point[] } | null = null;
  let bestDist = Infinity;
  for (const island of DEFAULT_ISLANDS) {
    const c = islandCentroid(island.points);
    const d = calculateDistance(svgPt, c);
    if (d < bestDist) { bestDist = d; best = island; }
  }
  return best;
}

function buildOrbitPath(airportSVG: Point, island: { points: Point[] }): Point[] {
  const center = islandCentroid(island.points);

  const sampled: Point[] = [];
  for (let i = 0; i < island.points.length; i += ORBIT_SAMPLE_STEP) {
    sampled.push(island.points[i]);
  }
  if (sampled.length < 3) return [airportSVG, airportSVG];

  const orbit: Point[] = sampled.map((p) => {
    const dx = p.x - center.x;
    const dy = p.y - center.y;
    const dist = Math.sqrt(dx * dx + dy * dy) || 1;
    return {
      x: p.x + (dx / dist) * ORBIT_MARGIN,
      y: p.y + (dy / dist) * ORBIT_MARGIN,
    };
  });

  let closestIdx = 0;
  let closestDist = Infinity;
  for (let i = 0; i < orbit.length; i++) {
    const d = calculateDistance(airportSVG, orbit[i]);
    if (d < closestDist) { closestDist = d; closestIdx = i; }
  }

  const reordered: Point[] = [];
  for (let i = 0; i < orbit.length; i++) {
    reordered.push(orbit[(closestIdx + i) % orbit.length]);
  }

  return [airportSVG, ...reordered, airportSVG];
}

// ─── Route info with SID/STAR phase boundaries ──────────────────────────────

export type FlightPhase = 'departing' | 'cruising' | 'approaching' | 'arrived';

export interface RouteInfo {
  path: Point[];
  /** progress (0-1) at which SID waypoints end (0 if no SID) */
  sidEndProgress: number;
  /** progress (0-1) at which STAR waypoints begin (1 if no STAR) */
  starStartProgress: number;
  isLocalFlight: boolean;
}

function tokenize(str: string): string[] {
  return str
    .toUpperCase()
    .split(/[\s.,\-/]+/)
    .filter((t) => t.length >= 2);
}

/**
 * Parse a route string (SID + route + STAR) and return SVG waypoints plus
 * progress boundaries for SID/STAR phases.
 *
 * Rules:
 *  - No SID & no STAR → dep → route_ifr waypoints (if any) → arr, else straight line
 *  - SID only          → dep → SID waypoints → straight to arr
 *  - STAR only         → dep → straight to 1st STAR point → STAR waypoints → arr
 *  - SID + STAR        → dep → SID waypoints → route waypoints → STAR waypoints → arr
 *  - dep === arr       → orbit around nearest island
 */
export function buildRouteInfo(
  depCode: string,
  arrCode: string,
  routeStr: string | null,
  sidStr: string | null,
  starStr: string | null,
): RouteInfo {
  const depPos = DEFAULT_POSITIONS[depCode];
  const arrPos = DEFAULT_POSITIONS[arrCode];
  const straight: RouteInfo = { path: [], sidEndProgress: 0, starStartProgress: 1, isLocalFlight: false };
  if (!depPos || !arrPos) return straight;

  const depSVG = toSVG(depPos);
  const arrSVG = toSVG(arrPos);

  if (depCode === arrCode) {
    const island = findNearestIsland(depSVG);
    const path = island ? buildOrbitPath(depSVG, island) : [depSVG, arrSVG];
    return { path, sidEndProgress: 0, starStartProgress: 1, isLocalFlight: true };
  }

  const depUp = depCode.toUpperCase();
  const arrUp = arrCode.toUpperCase();

  /* Route- only: follow route_ifr waypoints between airports (no SID/STAR). */
  if (!sidStr && !starStr) {
    if (!routeStr) {
      return { path: [depSVG, arrSVG], sidEndProgress: 0, starStartProgress: 1, isLocalFlight: false };
    }
    const path: Point[] = [depSVG];
    let lastPoint = depSVG;
    for (const t of tokenize(routeStr)) {
      if (t === depUp || t === arrUp) continue;
      const wp = resolveWaypoint(t);
      if (!wp) continue;
      if (calculateDistance(wp, lastPoint) < 1) continue;
      path.push(wp);
      lastPoint = wp;
    }
    if (calculateDistance(arrSVG, lastPoint) > 1) path.push(arrSVG);
    if (path.length < 2) {
      return { path: [depSVG, arrSVG], sidEndProgress: 0, starStartProgress: 1, isLocalFlight: false };
    }
    return { path, sidEndProgress: 0, starStartProgress: 1, isLocalFlight: false };
  }

  const hasSid = Boolean(sidStr);
  const hasStar = Boolean(starStr);

  const path: Point[] = [depSVG];
  let lastPoint = depSVG;

  let sidPointCount = 0;
  let starFirstIdx = -1;

  const addToken = (token: string, source: 'sid' | 'route' | 'star') => {
    if (token === depUp || token === arrUp) return;
    const wp = resolveWaypoint(token);
    if (!wp) return;
    if (calculateDistance(wp, lastPoint) < 1) return;
    path.push(wp);
    lastPoint = wp;
    if (source === 'sid') sidPointCount = path.length - 1;
    if (source === 'star' && starFirstIdx === -1) starFirstIdx = path.length - 1;
  };

  if (hasSid) {
    for (const t of tokenize(sidStr!)) addToken(t, 'sid');
  }

  if (hasSid && hasStar && routeStr) {
    for (const t of tokenize(routeStr)) addToken(t, 'route');
  }

  if (hasStar) {
    for (const t of tokenize(starStr!)) addToken(t, 'star');
  }

  if (calculateDistance(arrSVG, lastPoint) > 1) {
    path.push(arrSVG);
  }

  const dists = segmentDistances(path);
  const totalDist = dists[dists.length - 1] || 1;

  const sidEndProgress = sidPointCount > 0
    ? dists[sidPointCount] / totalDist
    : 0;

  const starStartProgress = starFirstIdx > 0
    ? dists[starFirstIdx] / totalDist
    : 1;

  return { path, sidEndProgress, starStartProgress, isLocalFlight: false };
}

/** Backward-compatible wrapper that returns just the path. */
export function buildRoutePath(
  depCode: string,
  arrCode: string,
  routeStr: string | null,
  sidStr: string | null,
  starStr: string | null,
): Point[] {
  return buildRouteInfo(depCode, arrCode, routeStr, sidStr, starStr).path;
}

export function getFlightPhase(info: RouteInfo, progress: number): FlightPhase {
  if (info.isLocalFlight) {
    if (progress >= 0.97) return 'arrived';
    return 'cruising';
  }
  if (progress >= 0.97) return 'arrived';

  const hasSid = info.sidEndProgress > 0;
  const hasStar = info.starStartProgress < 1;

  if (!hasSid && !hasStar) {
    if (progress < 0.33) return 'departing';
    if (progress < 0.85) return 'cruising';
    return 'approaching';
  }

  if (hasStar && progress >= info.starStartProgress) return 'approaching';
  if (hasSid && progress <= info.sidEndProgress) return 'departing';

  if (!hasSid) {
    const cruiseEnd = info.starStartProgress;
    if (progress < cruiseEnd * 0.33) return 'departing';
    return 'cruising';
  }

  if (!hasStar) {
    const cruiseStart = info.sidEndProgress;
    const remaining = 1 - cruiseStart;
    if (progress > cruiseStart + remaining * 0.85) return 'approaching';
    return 'cruising';
  }

  return 'cruising';
}

export const PHASE_LABELS: Record<FlightPhase, string> = {
  departing: 'Departing',
  cruising: 'Cruising',
  approaching: 'Approaching',
  arrived: 'Arrived',
};

export const PHASE_LABELS_FR: Record<FlightPhase, string> = {
  departing: 'Départ',
  cruising: 'Croisière',
  approaching: 'Approche',
  arrived: 'Arrivée',
};

/** Cumulative distances along route segments. */
function segmentDistances(path: Point[]): number[] {
  const dists: number[] = [0];
  for (let i = 1; i < path.length; i++) {
    dists.push(dists[i - 1] + calculateDistance(path[i - 1], path[i]));
  }
  return dists;
}

/**
 * Interpolate position & heading along a multi-segment route.
 * `t` goes from 0 (departure) to 1 (arrival), proportional to cumulative distance.
 */
export function interpolateAlongRoute(
  path: Point[],
  t: number,
): { position: Point; heading: number } {
  if (path.length < 2) {
    return { position: path[0] ?? { x: 0, y: 0 }, heading: 0 };
  }

  const clamped = Math.max(0, Math.min(1, t));
  const dists = segmentDistances(path);
  const totalDist = dists[dists.length - 1];
  if (totalDist === 0) {
    return { position: path[0], heading: 0 };
  }

  const targetDist = clamped * totalDist;

  for (let i = 1; i < path.length; i++) {
    if (targetDist <= dists[i]) {
      const segLen = dists[i] - dists[i - 1];
      const segT = segLen > 0 ? (targetDist - dists[i - 1]) / segLen : 0;
      const position = interpolatePosition(path[i - 1], path[i], segT);
      const heading = calculateHeading(path[i - 1], path[i]);
      return { position, heading };
    }
  }

  return {
    position: path[path.length - 1],
    heading: calculateHeading(path[path.length - 2], path[path.length - 1]),
  };
}

export interface RadarTarget {
  id: string;
  callsign: string;
  numero_vol: string;
  type_vol: string;
  aeroport_depart: string;
  aeroport_arrivee: string;
  position: Point;
  heading: number;
  progress: number;
  flight_phase: FlightPhase;
  altitude: string | null;
  altitude_unit: string;
  squawk: string | null;
  route: string | null;
  sid: string | null;
  star: string | null;
  assumed_by: string | null;
  assumed_position: string | null;
  assumed_aeroport: string | null;
  on_ground: boolean;
  source: 'interpolation' | 'capture';
  temps_prev_min: number;
  pilote_identifiant: string | null;
  identified: boolean;
  roblox_username: string | null;
}

export interface STCAPair {
  targetA: string;
  targetB: string;
  horizontalDistance: number;
  verticalSeparation: number;
}

/**
 * Detect pairs of targets that are too close together.
 * minSepH = minimum horizontal separation in SVG units
 * minSepV = minimum vertical separation in FL (e.g. 10 = 1000ft)
 */
export function detectSTCA(
  targets: RadarTarget[],
  minSepH: number = 30,
  minSepV: number = 10,
): STCAPair[] {
  const pairs: STCAPair[] = [];
  for (let i = 0; i < targets.length; i++) {
    for (let j = i + 1; j < targets.length; j++) {
      const a = targets[i];
      const b = targets[j];
      if (a.on_ground || b.on_ground) continue;

      const hDist = calculateDistance(a.position, b.position);
      if (hDist >= minSepH) continue;

      const flA = parseFloat(a.altitude ?? '0') || 0;
      const flB = parseFloat(b.altitude ?? '0') || 0;
      const vSep = Math.abs(flA - flB);
      if (vSep >= minSepV) continue;

      pairs.push({
        targetA: a.id,
        targetB: b.id,
        horizontalDistance: hDist,
        verticalSeparation: vSep,
      });
    }
  }
  return pairs;
}
