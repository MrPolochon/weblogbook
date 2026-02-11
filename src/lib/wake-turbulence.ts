/**
 * Wake turbulence category mapping for PTFS aircraft types.
 * Categories: L = Light, M = Medium, H = Heavy, J = Super
 */

const WAKE_BY_ICAO: Record<string, string> = {
  // Super
  A388: 'J', A225: 'J',
  // Heavy
  B744: 'H', B74F: 'H', B763: 'H', B76F: 'H', B77W: 'H', B77F: 'H', B788: 'H',
  A333: 'H', A346: 'H', A359: 'H', BLXL: 'H', BLCF: 'H',
  MD11: 'H', MD1F: 'H', AN22: 'H', CONC: 'H',
  C130: 'H', C17: 'H', KC10: 'H',
  // Medium
  AT72: 'M', B727: 'M', B72F: 'M', B738: 'M', B752: 'M', B75F: 'M',
  BCS3: 'M', A320: 'M', CRJ7: 'M', DH8D: 'M', E190: 'M', MD90: 'M',
  DHC6: 'M', LJ45: 'M', C402: 'M', SF50: 'M', C208: 'M',
  // Light
  E300: 'L', P28A: 'L', J3: 'L', C172: 'L', C182: 'L', WRGT: 'L',
  // Military — default Medium
  F14: 'M', F15: 'M', F16: 'M', F18S: 'M', F22: 'M', F35: 'M',
  A10: 'M', B2: 'H', EUFI: 'M', HAWK: 'L', SU27: 'M',
  P51: 'L', SPIT: 'L', ME09: 'L', P38: 'L', B17: 'H', P40: 'L',
};

export function getWakeCategory(codeOaci: string | null | undefined): string {
  if (!codeOaci) return '?';
  return WAKE_BY_ICAO[codeOaci.toUpperCase()] || 'M';
}

/**
 * Build the Type/W string shown on strips, e.g. "B738/M"
 */
export function getTypeWake(codeOaci: string | null | undefined): string {
  if (!codeOaci) return '?/?';
  const wake = getWakeCategory(codeOaci);
  return `${codeOaci}/${wake}`;
}
