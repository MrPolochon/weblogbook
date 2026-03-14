/**
 * Affichage durée: < 60 min → "45 min", >= 60 min → "6 h 15"
 */
export function formatDuree(minutes: number): string {
  if (minutes < 60) return `${minutes} min`;
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return m === 0 ? `${h} h 00` : `${h} h ${m}`;
}

export function cn(...classes: (string | undefined | false)[]): string {
  return classes.filter(Boolean).join(' ');
}

/**
 * Joint les routes SID et STAR en supprimant le waypoint dupliqué
 * quand la fin de la SID correspond au début de la STAR (ex: WELSH / welsh).
 */
export function joinSidStarRoute(sidRoute: string, starRoute: string): string {
  const sid = sidRoute.trim();
  const star = starRoute.trim();
  if (!sid || !star) return [sid, star].filter(Boolean).join(' ');

  const parts = (s: string) => s.split(/\s+(?:dct|DCT)\s+/i).map((p) => p.trim()).filter(Boolean);
  const sidParts = parts(sid);
  const starParts = parts(star);
  const lastSid = sidParts[sidParts.length - 1];
  const firstStar = starParts[0];

  if (lastSid && firstStar && lastSid.toLowerCase() === firstStar.toLowerCase()) {
    const starWithoutFirst = starParts.slice(1).join(' dct ');
    if (!starWithoutFirst) return sid;
    return `${sid} dct ${starWithoutFirst}`.trim();
  }

  return `${sid} ${star}`.trim();
}
