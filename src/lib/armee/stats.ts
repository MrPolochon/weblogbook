import { format, subDays } from 'date-fns';
import { createAdminClient } from '@/lib/supabase/admin';
import { getGradeForMissionCount, type ArmeeGrade } from './grades';
import { computeOpsStreak } from './streaks';

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

  const { data, error } = await admin.rpc('get_armee_pilot_stats', { p_user: userId });
  if (error || !data) throw new Error('Impossible de charger la progression Armée. Vérifiez la mise à jour de la base.');
  const summary = data as { completed: number; reward: number; dates: string[]; attempted: number; validated: number; failed: number };
  const missionsCompleted = Number(summary.completed);
  const totalFelitzEarned = Number(summary.reward);
  const grade = getGradeForMissionCount(missionsCompleted);
  const allGrades = (await import('./grades')).ARMEE_GRADES;
  const nextIdx = allGrades.findIndex((g) => g.id === grade.id) + 1;
  const nextGrade = nextIdx < allGrades.length ? allGrades[nextIdx] : null;
  const missionsToNextGrade = nextGrade ? Math.max(0, nextGrade.minMissions - missionsCompleted) : 0;

  const opsStreak = computeOpsStreak(summary.dates || []);
  const attempted = Number(summary.attempted);
  const validated = Number(summary.validated);
  const failed = Number(summary.failed);
  const decided = validated + failed;
  const successRate = decided > 0 ? Math.round((validated / decided) * 100) : null;

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

  const { data, error } = await admin.rpc('get_armee_honor_board', { p_days: days });
  if (error) throw new Error('Impossible de charger le tableau d’honneur Armée.');
  const entries = (data || []) as HonorBoardEntry[];

  return {
    period,
    since: format(new Date(since), 'yyyy-MM-dd'),
    entries,
  };
}

export async function countMissionsCompleted(userId: string): Promise<number> {
  const admin = createAdminClient();
  const { count, error } = await admin
    .from('armee_missions_log')
    .select('*', { count: 'exact', head: true })
    .eq('user_id', userId);
  if (error) throw new Error('Impossible de vérifier votre progression militaire.');
  return count ?? 0;
}
