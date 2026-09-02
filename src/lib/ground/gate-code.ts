/** Normalise un code de porte pour comparaison (casse, espaces Unicode, etc.). */
export function normalizeGateCode(s: string): string {
  return s
    .replace(/[\u00A0\u202F\u2009\u2007\u2008\u200B\s]+/g, ' ')
    .trim()
    .toLowerCase();
}

/** Ex. "Gate 9" → "9", "Parking 12" → "12". */
export function extractGateNumeric(normalized: string): string | null {
  const m = normalized.match(/^(?:gate|porte|parking|fato|apron)\s+(\d+)$/) ?? normalized.match(/^(\d+)$/);
  return m ? m[1] : null;
}

export function gateCodesMatch(a: string | null | undefined, b: string | null | undefined): boolean {
  if (!a || !b) return false;
  const na = normalizeGateCode(a);
  const nb = normalizeGateCode(b);
  if (na === nb) return true;
  if (na.replace(/\s/g, '') === nb.replace(/\s/g, '')) return true;
  const numa = extractGateNumeric(na);
  const numb = extractGateNumeric(nb);
  return Boolean(numa && numb && numa === numb);
}
