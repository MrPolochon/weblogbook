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
  tma_airports: { icao: string; nom: string; runways: string[] }[];
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

export function airportsInFir(fir: string): { icao: string; nom: string; runways: string[] }[] {
  return Object.entries(AIRPORT_TO_FIR)
    .filter(([, f]) => f === fir)
    .map(([icao]) => {
      const apt = AEROPORTS_PTFS.find((a) => a.code === icao);
      const perf = airportData.find((a) => a.icao === icao);
      return {
        icao,
        nom: apt?.nom ?? getAeroportNom(icao) ?? icao,
        runways: (perf?.runways ?? []).map((r) => r.name),
      };
    })
    .sort((a, b) => a.icao.localeCompare(b.icao));
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
  const tmaAirports = fir ? airportsInFir(fir) : [{ icao, nom: getAeroportNom(icao), runways: airportData.find((a) => a.icao === icao)?.runways.map((r) => r.name) ?? [] }];

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

export type TmaAirportDraft = {
  icao: string;
  nom: string;
  included: boolean;
  runways: string;
  condition: string;
};

export function defaultTmaDraft(primaryIcao: string, airports: { icao: string; nom: string; runways: string[] }[]): TmaAirportDraft[] {
  const primary = primaryIcao.toUpperCase();
  return airports.map((a) => ({
    icao: a.icao,
    nom: a.nom.replace(/\s+Intl\.?$/i, '').replace(/^Greater\s+/i, ''),
    included:
      a.icao === primary ||
      (a.icao === 'IMLR' && primary === 'IRFD') ||
      (a.icao === 'IRFD' && primary === 'IMLR'),
    runways: '',
    condition: 'dry',
  }));
}

export function composeTmaRunwayEn(airports: TmaAirportDraft[]): string {
  return airports
    .filter((a) => a.included && a.runways.trim())
    .map((a) => {
      const cond = RUNWAY_CONDITIONS.find((c) => c.id === a.condition)?.en ?? a.condition;
      return `${a.runways.trim()}, ${cond}, in service at ${a.nom}`;
    })
    .join('. ');
}

export function composeTmaRunwayFr(airports: TmaAirportDraft[]): string {
  return airports
    .filter((a) => a.included && a.runways.trim())
    .map((a) => {
      const cond = RUNWAY_CONDITIONS.find((c) => c.id === a.condition)?.fr ?? a.condition;
      return `${a.runways.trim()}, ${cond}, en service à ${a.nom}`;
    })
    .join('. ');
}

export function tmaIntroPreview(code: string, airports: TmaAirportDraft[]): string {
  const letter = code || 'A';
  const now = new Date();
  const hh = String(now.getUTCHours()).padStart(2, '0');
  const mm = String(now.getUTCMinutes()).padStart(2, '0');
  const pistes = composeTmaRunwayFr(airports) || 'pistes à renseigner';
  return `Bonjour, TMA ATIS information, information ${letter}, enregistré à ${hh}h${mm} zoulou/UTC, piste ${pistes}.`;
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
      tma_airports: included.map((a) => ({
        icao: a.icao,
        name: a.nom,
        runways: a.runways.trim(),
        condition: a.condition,
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
