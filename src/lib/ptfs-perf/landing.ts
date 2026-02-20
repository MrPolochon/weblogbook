import {
  KTS_TO_FPS,
  FLARE_DURATION,
  LDGDIST_SAFETY_MARGIN,
  VREF_FACTOR,
} from './values';
import {
  getAircraftData,
  getAirportData,
  getClosestThrust,
  getDecelerationRate,
  getFlapReduction,
  getRunwayData,
} from './utils';

function calculateActualLandingDistance(Vref: number, decel_fps: number) {
  const Vref_fps = Vref * KTS_TO_FPS;
  const flareLength = Vref_fps * FLARE_DURATION;
  const rolloutLength = Math.abs((Vref_fps * Vref_fps) / (2 * decel_fps));
  return Math.ceil(flareLength + rolloutLength);
}

function calculateLandingPerformanceData(
  lda: number,
  stallSpeed: number,
  flapReduction: number,
  decelerationRate: number
) {
  const Vref = Math.ceil((stallSpeed - flapReduction) * VREF_FACTOR);
  const Vapp = Vref + 5;
  const actualLength = calculateActualLandingDistance(Vref, decelerationRate);
  const ald = Math.ceil(actualLength);
  const ldr = Math.ceil(actualLength * LDGDIST_SAFETY_MARGIN);
  const margin = lda - ldr;
  const canStop = margin > 0;
  return {
    canStop,
    ald,
    lda,
    ldr,
    margin,
    Vref,
    Vapp,
  };
}

export function calculateLandingPerformance(
  type: string,
  airport: string,
  runway: string,
  flaps: number,
  deceleration: string
) {
  const aptData = getAirportData(airport);
  if (!aptData) return undefined;
  const rwyData = getRunwayData(aptData, runway);
  if (!rwyData) return undefined;
  const acftData = getAircraftData(type);
  if (!acftData) return undefined;
  const flapReduction = getFlapReduction(acftData, flaps);
  const Vstall = acftData.speeds.stall;
  const lda = rwyData.lda;
  const decelRate = getDecelerationRate(acftData, deceleration);
  const performance = calculateLandingPerformanceData(
    lda,
    Vstall,
    flapReduction,
    decelRate
  );
  const VappThrust = getClosestThrust(
    acftData.speedData,
    performance.Vapp + flapReduction
  );
  return { ...performance, thrust: VappThrust };
}
