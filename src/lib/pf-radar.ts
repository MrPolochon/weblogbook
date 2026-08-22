import { PF_COORD_SCALE } from '@/lib/pftester-odw';
import type { AtcPosition } from '@/lib/atc-positions';

/** 1 NM ≈ 1852 unités jeu ; 1 unité jeu = 0,00072 unité carte (calage PFTracker). */
export const PF_NM_TO_MAP = 1852 * PF_COORD_SCALE;

export type PfRadarScope = {
  nm: number;
  groundOnly: boolean;
  label: string;
};

export function scopeForPosition(position: string | null | undefined): PfRadarScope {
  switch (position) {
    case 'Delivery':
    case 'Clairance':
      return { nm: 4, groundOnly: true, label: 'aire de trafic / rampe' };
    case 'Ground':
      return { nm: 8, groundOnly: true, label: 'sol (taxi + stands)' };
    case 'Tower':
      return { nm: 20, groundOnly: false, label: 'CTR 20 NM' };
    case 'APP':
      return { nm: 60, groundOnly: false, label: 'TMA 60 NM' };
    case 'DEP':
      return { nm: 50, groundOnly: false, label: 'SID / départ 50 NM' };
    case 'Center':
      return { nm: 400, groundOnly: false, label: 'FIR / en-route' };
    default:
      return { nm: 20, groundOnly: false, label: 'CTR 20 NM' };
  }
}

export function isPfOnGround(altitudeFt: number, speedKt: number): boolean {
  if (altitudeFt <= 80) return true;
  return altitudeFt < 1500 && speedKt < 45;
}

export function mapDistanceNm(
  ax: number,
  ay: number,
  bx: number,
  by: number,
): number {
  return Math.hypot(ax - bx, ay - by) / PF_NM_TO_MAP;
}

export function aircraftInScope(opts: {
  mapX: number;
  mapY: number;
  altitude: number;
  speed: number;
  airportX: number;
  airportY: number;
  scope: PfRadarScope;
}): boolean {
  const nm = mapDistanceNm(opts.mapX, opts.mapY, opts.airportX, opts.airportY);
  if (nm > opts.scope.nm) return false;
  if (!opts.scope.groundOnly) return true;
  return isPfOnGround(opts.altitude, opts.speed);
}

export const PF_RADAR_POSITIONS: AtcPosition[] = [
  'Delivery',
  'Clairance',
  'Ground',
  'Tower',
  'APP',
  'DEP',
  'Center',
];
