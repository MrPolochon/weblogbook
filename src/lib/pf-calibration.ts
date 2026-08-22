import { PF_COORD_SCALE, PF_MAP_CX, PF_MAP_CY } from '@/lib/pftester-odw';

export const PF_CALIB_MIN_POINTS = 2;
export const PF_CALIB_MAX_POINTS = 10;
export const PF_CALIB_STORAGE_KEY = 'pf-odw-calibration-v1';
export const PF_CALIB_EVENT = 'pf-calib-updated';

export type PfCalibPoint = {
  id: string;
  label: string;
  gameX: number | null;
  gameY: number | null;
  mapX: number;
  mapY: number;
};

export type PfCalibFit = {
  sx: number;
  sy: number;
  ox: number;
  oy: number;
  rms: number;
  pointCount: number;
};

export const PF_OFFICIAL_FIT: PfCalibFit = {
  sx: PF_COORD_SCALE,
  sy: PF_COORD_SCALE,
  ox: PF_MAP_CX,
  oy: PF_MAP_CY,
  rms: 0,
  pointCount: 0,
};

export function applyCalibFit(fit: PfCalibFit, gameX: number, gameY: number): { mapX: number; mapY: number } {
  return {
    mapX: fit.ox + fit.sx * gameX,
    mapY: fit.oy + fit.sy * gameY,
  };
}

export function isCalibPointReady(p: PfCalibPoint): boolean {
  return Number.isFinite(p.gameX) && Number.isFinite(p.gameY) && Number.isFinite(p.mapX) && Number.isFinite(p.mapY);
}

function fitAxis(gs: number[], ms: number[], defaultScale: number): { scale: number; offset: number } {
  const n = gs.length;
  let sumG = 0;
  let sumM = 0;
  let sumGG = 0;
  let sumGM = 0;
  for (let i = 0; i < n; i++) {
    const g = gs[i]!;
    const m = ms[i]!;
    sumG += g;
    sumM += m;
    sumGG += g * g;
    sumGM += g * m;
  }
  const det = n * sumGG - sumG * sumG;
  if (Math.abs(det) < 1e-3) {
    return { scale: defaultScale, offset: sumM / n - defaultScale * (sumG / n) };
  }
  const scale = (n * sumGM - sumG * sumM) / det;
  const offset = (sumM - scale * sumG) / n;
  return { scale, offset };
}

export function solveCalibration(points: PfCalibPoint[]): PfCalibFit | null {
  const ready = points.filter(isCalibPointReady);
  if (ready.length < PF_CALIB_MIN_POINTS) return null;
  const gsX = ready.map((p) => p.gameX as number);
  const gsY = ready.map((p) => p.gameY as number);
  const msX = ready.map((p) => p.mapX);
  const msY = ready.map((p) => p.mapY);
  const x = fitAxis(gsX, msX, PF_COORD_SCALE);
  const y = fitAxis(gsY, msY, PF_COORD_SCALE);
  const fit: PfCalibFit = {
    sx: x.scale,
    sy: y.scale,
    ox: x.offset,
    oy: y.offset,
    rms: 0,
    pointCount: ready.length,
  };
  let err = 0;
  for (const p of ready) {
    const mapped = applyCalibFit(fit, p.gameX as number, p.gameY as number);
    err += (mapped.mapX - p.mapX) ** 2 + (mapped.mapY - p.mapY) ** 2;
  }
  fit.rms = Math.sqrt(err / ready.length);
  return fit;
}

type StoredCalib = { points: PfCalibPoint[]; fit: PfCalibFit | null };

export function loadStoredCalibration(): StoredCalib {
  if (typeof window === 'undefined') return { points: [], fit: null };
  try {
    const raw = window.localStorage.getItem(PF_CALIB_STORAGE_KEY);
    if (!raw) return { points: [], fit: null };
    const parsed = JSON.parse(raw) as StoredCalib;
    const points = Array.isArray(parsed.points) ? parsed.points.slice(0, PF_CALIB_MAX_POINTS) : [];
    const fit = parsed.fit && Number.isFinite(parsed.fit.sx) ? parsed.fit : null;
    return { points, fit };
  } catch {
    return { points: [], fit: null };
  }
}

export function saveStoredCalibration(points: PfCalibPoint[], fit: PfCalibFit | null): void {
  if (typeof window === 'undefined') return;
  window.localStorage.setItem(PF_CALIB_STORAGE_KEY, JSON.stringify({ points, fit }));
  window.dispatchEvent(new Event(PF_CALIB_EVENT));
}

export function clearStoredCalibration(): void {
  if (typeof window === 'undefined') return;
  window.localStorage.removeItem(PF_CALIB_STORAGE_KEY);
  window.dispatchEvent(new Event(PF_CALIB_EVENT));
}
