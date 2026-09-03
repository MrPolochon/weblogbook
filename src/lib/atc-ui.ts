export type StripZoneId = 'sol' | 'depart' | 'arrivee' | 'transit';

export const TRANSFER_HIERARCHY: Record<string, string[]> = {
  Delivery: ['Ground'],
  Ground: ['Delivery', 'Clairance', 'Tower'],
  Clairance: ['Ground'],
  Tower: ['Ground', 'APP', 'DEP'],
  APP: ['Tower', 'Center'],
  DEP: ['Tower', 'Center'],
  Center: ['APP', 'DEP'],
};

/** Phases habituelles par position (avertissement soft, pas de blocage). */
export const POSITION_RECOMMENDED_ZONES: Record<string, StripZoneId[]> = {
  Delivery: ['sol'],
  Clairance: ['sol'],
  Ground: ['sol'],
  Tower: ['sol', 'depart', 'arrivee'],
  APP: ['arrivee'],
  DEP: ['depart'],
  Center: ['sol', 'depart', 'arrivee', 'transit'],
};

export function getVisibleZones(atcPosition?: string): StripZoneId[] {
  const base: StripZoneId[] = ['sol', 'depart', 'arrivee'];
  return atcPosition === 'Center' ? [...base, 'transit'] : base;
}

export function isRecommendedZone(atcPosition: string | undefined, zone: StripZoneId | null): boolean {
  if (!zone || !atcPosition) return true;
  const rec = POSITION_RECOMMENDED_ZONES[atcPosition];
  if (!rec) return true;
  return rec.includes(zone);
}

export const ZONE_LABELS: Record<StripZoneId, string> = {
  sol: 'Sol',
  depart: 'Départ',
  arrivee: 'Arrivée',
  transit: 'Transit',
};

export const ZONE_HINTS: Record<StripZoneId, string> = {
  sol: 'Push, taxi, stands',
  depart: 'Aligné, décollage, SID',
  arrivee: 'Approche, finale, land',
  transit: 'FIR / overflight',
};

export function statutLabel(statut: string): string {
  switch (statut) {
    case 'en_cours': return 'EN VOL';
    case 'en_attente_cloture': return 'CLÔTURE';
    case 'accepte': return 'ACCEPTÉ';
    case 'depose': return 'DÉPOSÉ';
    case 'en_attente': return 'ATTENTE';
    case 'automonitoring': return 'AUTOSURV.';
    default: return statut.replace(/_/g, ' ').toUpperCase();
  }
}

export function statutShort(statut: string): string {
  switch (statut) {
    case 'en_cours': return 'VOL';
    case 'en_attente_cloture': return 'CLO';
    case 'accepte': return 'ACC';
    case 'depose': return 'DEP';
    case 'en_attente': return 'ATT';
    case 'automonitoring': return 'AUTO';
    default: return statut.slice(0, 3).toUpperCase();
  }
}

export function getSquawkColor(code: string | null): 'hijack' | 'radio' | 'emergency' | null {
  if (!code) return null;
  const c = code.trim();
  if (c === '7500') return 'hijack';
  if (c === '7600') return 'radio';
  if (c === '7700') return 'emergency';
  return null;
}

export function getSquawkLabel(code: string | null): string | null {
  if (!code) return null;
  const c = code.trim();
  if (c === '7500') return 'HIJACK';
  if (c === '7600') return 'RADIO FAIL';
  if (c === '7700') return 'EMERGENCY';
  return null;
}

export function formatCtot(iso: string): string {
  try {
    return new Date(iso).toISOString().slice(11, 16);
  } catch {
    return '—';
  }
}

export function formatElapsedClock(startedAt: string, now: Date): string {
  const elapsedSec = Math.max(0, (now.getTime() - new Date(startedAt).getTime()) / 1000);
  const h = Math.floor(elapsedSec / 3600);
  const m = Math.floor((elapsedSec % 3600) / 60);
  const s = Math.floor(elapsedSec % 60);
  const pad = (n: number) => String(n).padStart(2, '0');
  return h > 0 ? `${h}:${pad(m)}:${pad(s)}` : `${pad(m)}:${pad(s)}`;
}
