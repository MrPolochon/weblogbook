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

/**
 * Parse a route string (SID + route) and return SVG waypoints that exist on the map.
 * Tokens are separated by spaces, dots, dashes, or commas.
 * Departure and arrival airports are automatically placed at the start and end.
 * If departure === arrival, generates an orbit around the nearest island.
 */
export function buildRoutePath(
  depCode: string,
  arrCode: string,
  routeStr: string | null,
  sidStr: string | null,
  starStr: string | null,
): Point[] {
  const depPos = DEFAULT_POSITIONS[depCode];
  const arrPos = DEFAULT_POSITIONS[arrCode];
  if (!depPos || !arrPos) return [];

  const depSVG = toSVG(depPos);
  const arrSVG = toSVG(arrPos);

  if (depCode === arrCode) {
    const island = findNearestIsland(depSVG);
    if (island) return buildOrbitPath(depSVG, island);
    return [depSVG, arrSVG];
  }

  if (!routeStr && !sidStr && !starStr) {
    return [depSVG, arrSVG];
  }

  const combined = [sidStr, routeStr, starStr].filter(Boolean).join(' ');
  const tokens = combined
    .toUpperCase()
    .split(/[\s.,\-/]+/)
    .filter((t) => t.length >= 2);

  const depUp = depCode.toUpperCase();
  const arrUp = arrCode.toUpperCase();

  const path: Point[] = [depSVG];
  let lastPoint = depSVG;

  for (const token of tokens) {
    if (token === depUp || token === arrUp) continue;
    const wp = resolveWaypoint(token);
    if (!wp) continue;
    if (calculateDistance(wp, lastPoint) < 1) continue;
    path.push(wp);
    lastPoint = wp;
  }

  if (calculateDistance(arrSVG, lastPoint) > 1) {
    path.push(arrSVG);
  }

  return path;
}

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
