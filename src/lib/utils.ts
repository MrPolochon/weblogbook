/** Détection iOS (Safari iPhone/iPad) pour correctifs spécifiques */
export function isIOS(): boolean {
  if (typeof navigator === 'undefined') return false;
  return /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
}

/**
 * Sanitise le texte pour speechSynthesis (bug iOS 26 : < et > bloquent la synthèse)
 */
export function sanitizeForSpeech(text: string): string {
  return text.replace(/</g, '\uff1c').replace(/>/g, '\uff1e');
}

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

/**
 * Découpe la route pour affichage coloré (SID bleu, STAR magenta).
 * Retourne les parties quand la route correspond à joinSidStarRoute(sid, star).
 */
export function splitRouteForDisplay(
  route: string,
  sidRoute: string | null,
  starRoute: string | null
): { sidPart: string; starPart: string; enRoutePart: string } {
  const r = route.trim();
  if (!r) return { sidPart: '', starPart: '', enRoutePart: '' };
  if (!sidRoute?.trim() && !starRoute?.trim()) return { sidPart: '', starPart: '', enRoutePart: r };
  if (!sidRoute?.trim()) return { sidPart: '', starPart: r, enRoutePart: '' };
  if (!starRoute?.trim()) return { sidPart: r, starPart: '', enRoutePart: '' };

  const norm = (s: string) => s.trim().toLowerCase().replace(/\s+/g, ' ');
  const rn = norm(r);
  const sn = norm(sidRoute);
  const stn = norm(starRoute);
  const joined = norm(joinSidStarRoute(sidRoute.trim(), starRoute.trim()));

  if (rn !== joined) {
    if (rn.startsWith(sn)) {
      const sidLen = route.trim().toLowerCase().indexOf(sn) + sn.length;
      return { sidPart: route.substring(0, sidLen), starPart: '', enRoutePart: route.substring(sidLen).trim() };
    }
    return { sidPart: '', starPart: '', enRoutePart: r };
  }

  const sidLen = rn.indexOf(sn) + sn.length;
  return {
    sidPart: route.substring(0, sidLen).trimEnd(),
    starPart: route.substring(sidLen).trim(),
    enRoutePart: '',
  };
}
