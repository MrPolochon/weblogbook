import type { Point } from '@/lib/cartography-data';

export {
  AIRPORT_NAMES,
  AIRPORT_TO_FIR,
  DEFAULT_FIR_ZONES,
  DEFAULT_ISLANDS,
  DEFAULT_POSITIONS,
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
  // SVG y increases downward, so positive dy = southward
  const rad = Math.atan2(dx, -dy);
  return ((rad * 180) / Math.PI + 360) % 360;
}

export function calculateDistance(a: Point, b: Point): number {
  const dx = a.x - b.x;
  const dy = a.y - b.y;
  return Math.sqrt(dx * dx + dy * dy);
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
