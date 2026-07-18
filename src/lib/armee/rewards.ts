import type { ArmeeMission, MissionRewardResult } from './types';
import { MISSION_MAX_REFUSALS } from './types';
import { getMissionById } from './missions';

/**
 * Récompense finale = base × max(0.2, 1 − 1% par minute de retard vs arrivee_utc prévue).
 * Le retard est mesuré à l'instant de la validation admin.
 */
export function computeMissionReward(
  base: number,
  arriveeUtc: string | null | undefined,
  validatedAt: Date = new Date(),
): MissionRewardResult {
  const arrivee = arriveeUtc ? new Date(arriveeUtc).getTime() : validatedAt.getTime();
  const delayMinutes = Math.max(0, Math.round((validatedAt.getTime() - arrivee) / 60_000));
  const coeff = Math.max(0.2, 1 - delayMinutes * 0.01);
  const finalReward = Math.max(0, Math.round(base * coeff));
  return { base, finalReward, delayMinutes, coeff };
}

export function resolveRewardBase(
  missionId: string | null | undefined,
  missionRewardBase: number | null | undefined,
): number {
  if (typeof missionRewardBase === 'number' && missionRewardBase > 0) return missionRewardBase;
  const mission = getMissionById(missionId);
  if (!mission) return 0;
  return Math.round((mission.rewardMin + mission.rewardMax) / 2);
}

export function nextMissionStatusOnRefusal(currentRefusals: number): {
  mission_refusals: number;
  mission_status: 'en_attente' | 'echec';
} {
  const next = currentRefusals + 1;
  return {
    mission_refusals: next,
    mission_status: next >= MISSION_MAX_REFUSALS ? 'echec' : 'en_attente',
  };
}

export function missionLabel(mission: ArmeeMission | null | undefined, fallbackId?: string | null): string {
  return mission?.titre || fallbackId || 'Mission';
}
