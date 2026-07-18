import { format, subDays } from 'date-fns';

/** Dates UTC (YYYY-MM-DD) triées décroissant, sans doublons. */
export function uniqueUtcDatesDesc(isoTimestamps: string[]): string[] {
  const set = new Set<string>();
  for (const ts of isoTimestamps) {
    const d = new Date(ts);
    if (Number.isNaN(d.getTime())) continue;
    set.add(format(d, 'yyyy-MM-dd'));
  }
  return Array.from(set).sort((a, b) => b.localeCompare(a));
}

/**
 * Série d'opérations : jours consécutifs (UTC) avec au moins une mission validée.
 * Si `includeDate` est fourni, simule l'ajout de ce jour (ex. validation en cours).
 */
export function computeOpsStreak(completionDatesDesc: string[], includeDate?: string): number {
  const set = new Set(completionDatesDesc);
  if (includeDate) set.add(includeDate);

  const sorted = Array.from(set).sort((a, b) => b.localeCompare(a));
  if (sorted.length === 0) return 0;

  const today = format(new Date(), 'yyyy-MM-dd');
  const yesterday = format(subDays(new Date(), 1), 'yyyy-MM-dd');
  const anchor = sorted[0];

  if (anchor !== today && anchor !== yesterday) return 0;

  let streak = 1;
  for (let i = 1; i < sorted.length; i++) {
    const prev = sorted[i - 1];
    const expected = format(subDays(new Date(prev + 'T12:00:00Z'), 1), 'yyyy-MM-dd');
    if (sorted[i] === expected) streak++;
    else break;
  }
  return streak;
}

/** Bonus Felitz en % selon la série (jours consécutifs). */
export function streakBonusPercent(streakDays: number): number {
  if (streakDays >= 7) return 15;
  if (streakDays >= 5) return 10;
  if (streakDays >= 3) return 5;
  return 0;
}

export function applyStreakBonus(baseReward: number, streakDays: number): {
  streakDays: number;
  streakBonusPercent: number;
  streakBonusAmount: number;
  finalReward: number;
} {
  const pct = streakBonusPercent(streakDays);
  const bonus = pct > 0 ? Math.round(baseReward * (pct / 100)) : 0;
  return {
    streakDays,
    streakBonusPercent: pct,
    streakBonusAmount: bonus,
    finalReward: baseReward + bonus,
  };
}
