/**
 * Convertit une heure UTC au format "HH:MM" en TIMESTAMPTZ ISO.
 * Si l'heure est passée de plus de 4h par rapport à maintenant (UTC),
 * on suppose qu'il s'agit du lendemain.
 * Retourne null si la valeur est vide ou invalide.
 */
export function heureDepartToIso(hhmm: string | undefined | null): string | null {
  if (!hhmm) return null;
  const m = String(hhmm).trim().match(/^(\d{1,2}):(\d{2})$/);
  if (!m) return null;
  const h = parseInt(m[1], 10);
  const min = parseInt(m[2], 10);
  if (h < 0 || h > 23 || min < 0 || min > 59) return null;
  const now = new Date();
  const candidate = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), h, min, 0, 0));
  if (candidate.getTime() < now.getTime() - 4 * 3600 * 1000) {
    candidate.setUTCDate(candidate.getUTCDate() + 1);
  }
  return candidate.toISOString();
}
