import { AIRPORT_TO_FIR } from '@/lib/cartography-data';
import { AEROPORTS_PTFS, getAeroportNom } from '@/lib/aeroports-ptfs';
import { airportData } from '@/lib/ptfs-perf/data/airports';

/** Plus petit = plus prioritaire. */
export const ATIS_POSITION_RANK: Record<string, number> = {
  Tower: 1,
  DEP: 2,
  APP: 3,
  Center: 4,
  Ground: 5,
  Delivery: 6,
  Clairance: 6,
};

export const ATIS_TMA_POSITIONS = new Set(['DEP', 'APP', 'Center']);
export const ATIS_AIRPORT_POSITIONS = new Set(['Tower', 'Ground', 'Delivery', 'Clairance']);

export type AtisKind = 'airport' | 'tma';

export type OnlineAtcSession = {
  user_id: string;
  aeroport: string;
  position: string;
  identifiant?: string | null;
};

export type AtisEntitlement = {
  kind: AtisKind;
  can_configure: boolean;
  reason: string | null;
  blocked_by: { position: string; aeroport: string; identifiant: string } | null;
  fir: string | null;
  tma_airports: TmaAirportCatalog[];
};

export function atisKindForPosition(position: string): AtisKind {
  return ATIS_TMA_POSITIONS.has(position) ? 'tma' : 'airport';
}

export function atisRank(position: string): number {
  return ATIS_POSITION_RANK[position] ?? 99;
}

export function firOf(icao: string): string | null {
  return AIRPORT_TO_FIR[icao.toUpperCase()] ?? null;
}

/** Terrains réellement desservis par l'ATIS TMA de chaque FIR (pas toute la FIR). */
export const TMA_CORE_BY_FIR: Record<string, readonly string[]> = {
  ROCKFORD: ['IRFD', 'IMLR'],
  TOKYO: ['ITKO'],
  PERTH: ['IPPH'],
  KEFLAVIK: ['IKFL', 'ITEY'],
  SAUTHEMP: ['ISAU'],
  IZOLIRAN: ['IZOL', 'IJAF'],
  'CYPRUS F': ['ILAR', 'IPAP'],
};

/** Terrains optionnels, géographiquement dans la TMA mais hors paires principales. */
export const TMA_SATELLITES_BY_FIR: Record<string, readonly string[]> = {
  ROCKFORD: ['IBTH', 'IBLT', 'IGAR', 'ITRC'],
  IZOLIRAN: ['ISKP'],
};

export type TmaAirportCatalog = {
  icao: string;
  nom: string;
  runways: string[];
  core: boolean;
};

export function runwaysOf(icao: string): string[] {
  return (airportData.find((a) => a.icao === icao.toUpperCase())?.runways ?? []).map((r) => r.name);
}

export function shortAirportName(nom: string): string {
  return nom.replace(/\s+Intl\.?$/i, '').replace(/^Greater\s+/i, '');
}

function airportCatalogEntry(icao: string, core: boolean): TmaAirportCatalog {
  const code = icao.toUpperCase();
  const apt = AEROPORTS_PTFS.find((a) => a.code === code);
  return {
    icao: code,
    nom: apt?.nom ?? getAeroportNom(code) ?? code,
    runways: runwaysOf(code),
    core,
  };
}

export function airportsInFir(fir: string): { icao: string; nom: string; runways: string[] }[] {
  return Object.entries(AIRPORT_TO_FIR)
    .filter(([, f]) => f === fir)
    .map(([icao]) => airportCatalogEntry(icao, false))
    .sort((a, b) => a.icao.localeCompare(b.icao));
}

/** Catalogue TMA : paires principales + satellites, jamais les terrains hors zone. */
export function tmaAirportsFor(icao: string, fir: string | null): TmaAirportCatalog[] {
  const primary = icao.toUpperCase();
  if (!fir) return [airportCatalogEntry(primary, true)];
  const core = TMA_CORE_BY_FIR[fir] ?? [];
  const sats = TMA_SATELLITES_BY_FIR[fir] ?? [];
  const listed = new Set<string>();
  const out: TmaAirportCatalog[] = [];
  for (const code of core) {
    if (listed.has(code)) continue;
    listed.add(code);
    out.push(airportCatalogEntry(code, true));
  }
  for (const code of sats) {
    if (listed.has(code)) continue;
    listed.add(code);
    out.push(airportCatalogEntry(code, false));
  }
  if (!listed.has(primary)) out.push(airportCatalogEntry(primary, core.length === 0));
  return out;
}

export function resolveAtisEntitlement(
  userId: string,
  aeroport: string,
  position: string,
  sessions: OnlineAtcSession[],
): AtisEntitlement {
  const icao = aeroport.toUpperCase();
  const kind = atisKindForPosition(position);
  const myRank = atisRank(position);
  const fir = firOf(icao);
  const tmaAirports = tmaAirportsFor(icao, fir);

  if (kind === 'airport') {
    const rivals = sessions.filter(
      (s) =>
        s.aeroport.toUpperCase() === icao &&
        ATIS_AIRPORT_POSITIONS.has(s.position) &&
        s.user_id !== userId,
    );
    const better = rivals
      .filter((s) => atisRank(s.position) < myRank)
      .sort((a, b) => atisRank(a.position) - atisRank(b.position))[0];
    if (better) {
      return {
        kind,
        can_configure: false,
        reason: `L'ATIS de ${icao} est réservé à ${better.position} (${better.identifiant || 'un contrôleur'}).`,
        blocked_by: {
          position: better.position,
          aeroport: better.aeroport,
          identifiant: better.identifiant || 'ATC',
        },
        fir,
        tma_airports: tmaAirports,
      };
    }
    return {
      kind,
      can_configure: true,
      reason: null,
      blocked_by: null,
      fir,
      tma_airports: tmaAirports,
    };
  }

  const rivals = sessions.filter((s) => {
    if (s.user_id === userId) return false;
    if (!ATIS_TMA_POSITIONS.has(s.position)) return false;
    const sFir = firOf(s.aeroport);
    return Boolean(fir && sFir === fir);
  });
  const better = rivals
    .filter((s) => atisRank(s.position) < myRank)
    .sort((a, b) => atisRank(a.position) - atisRank(b.position))[0];
  if (better) {
    return {
      kind,
      can_configure: false,
      reason: `L'ATIS TMA ${fir ?? ''} est réservé à ${better.position} (${better.identifiant || 'un contrôleur'}). DEP prioritaire sur APP, puis Centre.`,
      blocked_by: {
        position: better.position,
        aeroport: better.aeroport,
        identifiant: better.identifiant || 'ATC',
      },
      fir,
      tma_airports: tmaAirports,
    };
  }
  return {
    kind,
    can_configure: true,
    reason: null,
    blocked_by: null,
    fir,
    tma_airports: tmaAirports,
  };
}

export const RUNWAY_CONDITIONS = [
  { id: 'dry', fr: 'sèches', en: 'dry' },
  { id: 'wet', fr: 'mouillé', en: 'wet' },
  { id: 'damp', fr: 'humides', en: 'damp' },
] as const;

export const APPROACH_TYPES = ['ILS', 'ILS Z', 'ILS Y', 'RNAV', 'RNP', 'VOR', 'NDB', 'Visual'] as const;

export type TmaAirportDraft = {
  icao: string;
  nom: string;
  included: boolean;
  runways: string;
  condition: string;
  approach?: string;
};

export function defaultTmaDraft(airports: TmaAirportCatalog[]): TmaAirportDraft[] {
  return airports.map((a) => ({
    icao: a.icao,
    nom: shortAirportName(a.nom),
    included: a.core,
    runways: '',
    condition: 'dry',
    approach: '',
  }));
}

export function mergeTmaDraft(
  existing: TmaAirportDraft[],
  catalog: TmaAirportCatalog[],
  fromPublished = false,
): TmaAirportDraft[] {
  const prev = new Map(existing.map((a) => [a.icao, a]));
  return catalog.map((c) => {
    const old = prev.get(c.icao);
    return {
      icao: c.icao,
      nom: shortAirportName(c.nom),
      included: old?.included ?? (fromPublished ? false : c.core),
      runways: old?.runways ?? '',
      condition: old?.condition ?? 'dry',
      approach: old?.approach ?? '',
    };
  });
}

function tmaRunwayPhrase(a: TmaAirportDraft, lang: 'en' | 'fr'): string {
  const cond = RUNWAY_CONDITIONS.find((c) => c.id === a.condition)?.[lang] ?? a.condition;
  const bits = [a.runways.trim(), cond];
  if (a.approach?.trim()) bits.push(a.approach.trim());
  const loc = lang === 'fr' ? `en service à ${a.nom}` : `in service at ${a.nom}`;
  return `${bits.join(', ')}, ${loc}`;
}

export function composeTmaRunwayEn(airports: TmaAirportDraft[]): string {
  return airports
    .filter((a) => a.included && a.runways.trim())
    .map((a) => tmaRunwayPhrase(a, 'en'))
    .join('. ');
}

export function composeTmaRunwayFr(airports: TmaAirportDraft[]): string {
  return airports
    .filter((a) => a.included && a.runways.trim())
    .map((a) => tmaRunwayPhrase(a, 'fr'))
    .join('. ');
}

export function tmaIntroPreview(code: string, airports: TmaAirportDraft[]): string {
  const letter = code || 'A';
  const now = new Date();
  const hh = String(now.getUTCHours()).padStart(2, '0');
  const mm = String(now.getUTCMinutes()).padStart(2, '0');
  const included = airports.filter((a) => a.included && a.runways.trim());
  const pistes = composeTmaRunwayFr(airports) || 'pistes à renseigner';
  const word = included.length > 1 ? 'pistes' : 'piste';
  return `Bonjour, TMA ATIS information, information ${letter}, enregistré à ${hh}h${mm} zoulou/UTC, ${word} ${pistes}.`;
}

export function firDisplayName(fir: string | null): string {
  if (!fir) return '';
  if (fir === 'CYPRUS F') return 'Cyprus';
  return fir
    .split(/\s+/)
    .map((w) => w.charAt(0) + w.slice(1).toLowerCase())
    .join(' ');
}

export function tmaAirportName(fir: string | null, fallbackNom: string): string {
  const label = firDisplayName(fir) || fallbackNom.replace(/^Greater\s+/i, '');
  return `${label} TMA`;
}

export function identifiantFromJoin(raw: unknown): string | null {
  if (!raw) return null;
  const profile = Array.isArray(raw) ? raw[0] : raw;
  return (profile as { identifiant?: string | null } | null)?.identifiant ?? null;
}

export function isAtisDraftReady(kind: AtisKind, runway: string | undefined, tmaAirports: TmaAirportDraft[]): boolean {
  if (kind === 'tma') {
    return tmaAirports.some((a) => a.included && a.runways.trim().length > 0);
  }
  return Boolean(runway?.trim());
}

export type AtisDraftFields = {
  runway?: string;
  expected_approach?: string;
  expected_runway?: string;
  runway_condition?: string;
  wind?: string;
  visibility?: string;
  sky_condition?: string;
  temperature?: string;
  dewpoint?: string;
  qnh?: string;
  transition_level?: string;
  remarks?: string;
  cavok?: boolean;
  bilingual_mode?: boolean;
  information_code?: string;
};

export function buildAtisPatchBody(opts: {
  aeroport: string;
  kind: AtisKind;
  fir: string | null;
  draft: AtisDraftFields;
  tmaAirports: TmaAirportDraft[];
}): Record<string, unknown> {
  const icao = opts.aeroport.toUpperCase();
  const aptNom = getAeroportNom(icao);
  const draft: Record<string, unknown> = {
    ...opts.draft,
    information_code: opts.draft.information_code || 'A',
  };

  if (opts.kind === 'tma') {
    const included = opts.tmaAirports.filter((a) => a.included && a.runways.trim());
    return {
      ...draft,
      airport: icao,
      airport_name: tmaAirportName(opts.fir, aptNom),
      atis_type: 'tma',
      tma: true,
      information_prefix: 'TMA ATIS',
      expected_approach: '',
      expected_runway: '',
      runway_condition: '',
      tma_airports: included.map((a) => ({
        icao: a.icao,
        name: a.nom,
        runways: a.runways.trim(),
        condition: a.condition,
        approach: a.approach?.trim() || undefined,
      })),
      runway: composeTmaRunwayEn(opts.tmaAirports),
      runway_fr: composeTmaRunwayFr(opts.tmaAirports),
    };
  }

  return {
    ...draft,
    airport: icao,
    airport_name: aptNom,
    atis_type: 'airport',
    tma: false,
  };
}
