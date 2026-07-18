import { format, subDays } from 'date-fns';
import { createAdminClient } from '@/lib/supabase/admin';
import { getGradeForMissionCount, type ArmeeGrade } from './grades';
import { computeOpsStreak, uniqueUtcDatesDesc } from './streaks';
import { TYPE_VOL_MILITAIRE } from './types';

export type PilotMilitaryStats = {
  missionsCompleted: number;
  totalFelitzEarned: number;
  grade: ArmeeGrade;
  nextGrade: ArmeeGrade | null;
  missionsToNextGrade: number;
  opsStreak: number;
  successRate: number | null;
  missionsAttempted: number;
  missionsFailed: number;
};

export type HonorBoardEntry = {
  userId: string;
  identifiant: string;
  missionsCount: number;
  totalReward: number;
};

export type HonorBoard = {
  period: 'week' | 'month';
  since: string;
  entries: HonorBoardEntry[];
};

export async function getPilotMilitaryStats(userId: string): Promise<PilotMilitaryStats> {
  const admin = createAdminClient();

  const [
    { data: logs },
    { data: missionVols },
  ] = await Promise.all([
    admin.from('armee_missions_log').select('reward, created_at').eq('user_id', userId),
    admin
      .from('vols')
      .select('mission_status, statut')
      .eq('type_vol', TYPE_VOL_MILITAIRE)
      .eq('pilote_id', userId)
      .not('mission_id', 'is', null),
  ]);

  const missionsCompleted = logs?.length ?? 0;
  const totalFelitzEarned = (logs || []).reduce((s, r) => s + (Number(r.reward) || 0), 0);
  const grade = getGradeForMissionCount(missionsCompleted);
  const allGrades = (await import('./grades')).ARMEE_GRADES;
  const nextIdx = allGrades.findIndex((g) => g.id === grade.id) + 1;
  const nextGrade = nextIdx < allGrades.length ? allGrades[nextIdx] : null;
  const missionsToNextGrade = nextGrade ? Math.max(0, nextGrade.minMissions - missionsCompleted) : 0;

  const dates = uniqueUtcDatesDesc((logs || []).map((l) => l.created_at as string));
  const opsStreak = computeOpsStreak(dates);

  const attempted = missionVols?.length ?? 0;
  const validated = (missionVols || []).filter((v) => v.mission_status === 'valide' || v.statut === 'validé').length;
  const failed = (missionVols || []).filter((v) => v.mission_status === 'echec').length;
  const successRate = attempted > 0 ? Math.round((validated / attempted) * 100) : null;

  return {
    missionsCompleted,
    totalFelitzEarned,
    grade,
    nextGrade,
    missionsToNextGrade,
    opsStreak,
    successRate,
    missionsAttempted: attempted,
    missionsFailed: failed,
  };
}

export async function getHonorBoard(period: 'week' | 'month'): Promise<HonorBoard> {
  const admin = createAdminClient();
  const days = period === 'week' ? 7 : 30;
  const since = subDays(new Date(), days).toISOString();

  const { data: logs } = await admin
    .from('armee_missions_log')
    .select('user_id, reward, profiles:user_id(identifiant)')
    .gte('created_at', since);

  const byUser = new Map<string, { identifiant: string; count: number; total: number }>();

  for (const row of logs || []) {
    const uid = row.user_id as string;
    const prof = row.profiles as { identifiant: string } | { identifiant: string }[] | null;
    const ident = prof
      ? Array.isArray(prof)
        ? prof[0]?.identifiant || uid.slice(0, 8)
        : prof.identifiant
      : uid.slice(0, 8);
    const cur = byUser.get(uid) || { identifiant: ident, count: 0, total: 0 };
    cur.count++;
    cur.total += Number(row.reward) || 0;
    byUser.set(uid, cur);
  }

  const entries: HonorBoardEntry[] = Array.from(byUser.entries())
    .map(([userId, v]) => ({
      userId,
      identifiant: v.identifiant,
      missionsCount: v.count,
      totalReward: v.total,
    }))
    .sort((a, b) => b.missionsCount - a.missionsCount || b.totalReward - a.totalReward)
    .slice(0, 10);

  return {
    period,
    since: format(new Date(since), 'yyyy-MM-dd'),
    entries,
  };
}

export async function countMissionsCompleted(userId: string): Promise<number> {
  const admin = createAdminClient();
  const { count } = await admin
    .from('armee_missions_log')
    .select('*', { count: 'exact', head: true })
    .eq('user_id', userId);
  return count ?? 0;
}
