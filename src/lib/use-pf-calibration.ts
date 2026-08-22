'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  PF_CALIB_EVENT,
  PF_CALIB_MIN_POINTS,
  PF_OFFICIAL_FIT,
  applyCalibFit,
  clearStoredCalibration,
  loadStoredCalibration,
  saveStoredCalibration,
  solveCalibration,
  type PfCalibFit,
  type PfCalibPoint,
} from '@/lib/pf-calibration';

export function usePfCalibration() {
  const [points, setPoints] = useState<PfCalibPoint[]>([]);
  const [fit, setFit] = useState<PfCalibFit>(PF_OFFICIAL_FIT);
  const [active, setActive] = useState(false);

  useEffect(() => {
    const stored = loadStoredCalibration();
    setPoints(stored.points);
    if (stored.fit && stored.fit.pointCount >= PF_CALIB_MIN_POINTS) {
      setFit(stored.fit);
      setActive(true);
    }
    const sync = () => {
      const next = loadStoredCalibration();
      setPoints(next.points);
      if (next.fit && next.fit.pointCount >= PF_CALIB_MIN_POINTS) {
        setFit(next.fit);
        setActive(true);
      } else {
        setFit(PF_OFFICIAL_FIT);
        setActive(false);
      }
    };
    window.addEventListener(PF_CALIB_EVENT, sync);
    window.addEventListener('storage', sync);
    return () => {
      window.removeEventListener(PF_CALIB_EVENT, sync);
      window.removeEventListener('storage', sync);
    };
  }, []);

  const apply = useCallback((nextPoints: PfCalibPoint[]) => {
    const solved = solveCalibration(nextPoints);
    if (!solved) return null;
    setFit(solved);
    setActive(true);
    saveStoredCalibration(nextPoints, solved);
    return solved;
  }, []);

  const reset = useCallback(() => {
    setPoints([]);
    setFit(PF_OFFICIAL_FIT);
    setActive(false);
    clearStoredCalibration();
  }, []);

  const persistPoints = useCallback((nextPoints: PfCalibPoint[]) => {
    setPoints(nextPoints);
    const solved = solveCalibration(nextPoints);
    if (solved) {
      setFit(solved);
      setActive(true);
      saveStoredCalibration(nextPoints, solved);
    } else {
      saveStoredCalibration(nextPoints, active ? fit : null);
    }
  }, [active, fit]);

  const toMap = useCallback(
    (gameX: number, gameY: number) => applyCalibFit(active ? fit : PF_OFFICIAL_FIT, gameX, gameY),
    [active, fit],
  );

  const readyCount = useMemo(() => points.filter((p) => p.gameX != null && p.gameY != null).length, [points]);

  return { points, setPoints: persistPoints, fit, active, apply, reset, toMap, readyCount };
}
