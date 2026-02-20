import type { AircraftData, RunwayData } from './types';
import {
  KTS_TO_FPS,
  FPS_TO_KTS,
  TORA_SAFETY_MARGIN,
  CLIMBOUT_SPEED_LOSS,
  ROTATE_DURATION,
  SECONDS_PER_THRUST_SETTING,
  VMCG_VR_FACTOR,
} from './values';
import {
  getAccelerationRate,
  getAircraftData,
  getAirportData,
  getFlapReduction,
  getMaxSpeed,
  getMinimumThrust,
  getRunwayData,
} from './utils';

function calculateV1(
  VR_kts: number,
  thrust: number,
  accRate: number,
  decelRate: number,
  asda: number
) {
  const minimumV1_kts = Math.ceil(VR_kts * VMCG_VR_FACTOR);
  let V1_kts = VR_kts;
  let totalDistanceToStop = 0;
  while (V1_kts >= minimumV1_kts) {
    const V1_fps = V1_kts * KTS_TO_FPS;
    const accelerateDistance = (V1_fps * V1_fps) / (2 * accRate);
    const timeToDecreaseThrust = thrust * SECONDS_PER_THRUST_SETTING;
    const speedAtIdleThrust_fps =
      V1_fps + (timeToDecreaseThrust * (accRate + decelRate)) / 2;
    const switcherooDistance =
      V1_fps * timeToDecreaseThrust +
      (timeToDecreaseThrust * (2 * speedAtIdleThrust_fps + accRate * timeToDecreaseThrust)) / 6;
    const decelerateDistance = Math.abs(
      (speedAtIdleThrust_fps * speedAtIdleThrust_fps) / (2 * decelRate)
    );
    const decisionDistance = 2 * V1_fps;
    totalDistanceToStop = Math.ceil(
      accelerateDistance + decisionDistance + switcherooDistance + decelerateDistance
    );
    if (totalDistanceToStop < asda) {
      return { asdist: totalDistanceToStop, v1: V1_kts };
    }
    V1_kts--;
  }
  return { asdist: totalDistanceToStop, v1: -1 };
}

function calculateLiftoffDistance(
  VR_kts: number,
  thrustMax_kts: number,
  accRate: number
) {
  const VR_fps = VR_kts * KTS_TO_FPS;
  const accelerateDistance = (VR_fps * VR_fps) / (accRate * 2);
  const speedAfterRotation = Math.min(
    thrustMax_kts * KTS_TO_FPS,
    VR_fps + accRate * ROTATE_DURATION
  );
  const rotateDistance =
    ROTATE_DURATION * VR_fps +
    (ROTATE_DURATION * (speedAfterRotation - VR_fps)) / 2;
  return accelerateDistance + rotateDistance;
}

function calculateTakeoffPerformanceData(
  aircraftData: AircraftData,
  asda: number,
  tora: number,
  flapReduction: number
) {
  const V_R = aircraftData.speeds.rotate - flapReduction;
  const V_2 = V_R + 4;
  const climboutSpeed = V_2 + 10 + CLIMBOUT_SPEED_LOSS;
  const minimumThrust = getMinimumThrust(
    aircraftData.speedData,
    climboutSpeed + flapReduction
  );
  let V_1 = -1;
  let canAccStop = false;
  let canLiftoff = false;
  let liftoffDistance = 0;
  let takeoffRun = 0;
  let accelerateStopDistance = 0;
  let thrust = minimumThrust - 1;
  while (thrust < 100 && (!canAccStop || !canLiftoff)) {
    thrust++;
    const accRate = getAccelerationRate(aircraftData.accelerationData, thrust);
    const maxSpeedAtThrust = getMaxSpeed(aircraftData.speedData, thrust);
    liftoffDistance = Math.ceil(
      calculateLiftoffDistance(V_R, maxSpeedAtThrust, accRate)
    );
    takeoffRun = Math.ceil(liftoffDistance * TORA_SAFETY_MARGIN);
    canLiftoff = tora > takeoffRun;
    const decelRate = KTS_TO_FPS * aircraftData.deceleration.noReversers;
    const result = calculateV1(V_R, thrust, accRate, decelRate, asda);
    V_1 = result.v1;
    accelerateStopDistance = result.asdist;
    canAccStop = V_1 !== -1;
  }
  return {
    canLiftoff,
    canAccelStop: canAccStop,
    thrust,
    v1: V_1,
    vr: V_R,
    v2: V_2,
    atod: liftoffDistance,
    torun: takeoffRun,
    asdist: accelerateStopDistance,
  };
}

export function calculateTakeoffPerformance(
  type: string,
  airport: string,
  runway: string,
  intersection: string,
  flaps: number
) {
  const aptData = getAirportData(airport);
  if (!aptData) return undefined;
  const rwyData = getRunwayData(aptData, runway);
  if (!rwyData) return undefined;
  const takeoffShift =
    rwyData.intersections.find((hold) => hold.name === intersection)?.shift ?? 0;
  const asda = rwyData.asda - takeoffShift;
  const tora = rwyData.tora - takeoffShift;
  const acftData = getAircraftData(type);
  if (!acftData) return undefined;
  const flapReduction = getFlapReduction(acftData, flaps);
  const performance = calculateTakeoffPerformanceData(
    acftData,
    asda,
    tora,
    flapReduction
  );
  return { ...performance, asda, tora };
}
