/** The celebration follows UTC, including for visitors in other time zones. */
export function halloweenCalendar(now: Date) {
  const day = now.getUTCDate();
  const stage = now.getUTCMonth() === 9 && day >= 26 ? Math.min(day - 25, 6) : 0;
  return { stage, finale: stage === 6, decorations: stage * 6 };
}

export function untilNextUtcDay(now: Date) {
  return Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + 1) - now.getTime();
}
