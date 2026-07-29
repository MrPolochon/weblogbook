import { AEROPORTS_PTFS, CODES_OACI_VALIDES } from '@/lib/aeroports-ptfs';
import { ATC_POSITIONS } from '@/lib/atc-positions';

export type AtcGradeInfo = { id: string; nom: string; ordre: number };

export type AtcGradeForbidden = {
  id: string;
  grade_id: string;
  aeroport: string | null;
  position: string | null;
  applies_to_lower_grades: boolean;
  grade?: AtcGradeInfo;
};

export type AtcPositionMinGrade = {
  id: string;
  aeroport: string | null;
  position: string | null;
  min_grade_id: string;
  min_grade?: AtcGradeInfo;
};

export type AtcAccessContext = {
  bypass: boolean;
  userGrade: AtcGradeInfo | null;
  forbidden: AtcGradeForbidden[];
  minGrades: AtcPositionMinGrade[];
};

export type AtcAirportOption = {
  code: string;
  nom: string;
  label: string;
  known: boolean;
};

export type AtcAccessResult =
  | { allowed: true }
  | { allowed: false; reason: string; code: 'forbidden' | 'min_grade' };

export type RuleTargetKind = 'airport' | 'position' | 'pair';

const ATC_POSITION_SET = new Set<string>(ATC_POSITIONS);
const AIRPORT_NAME_BY_CODE = new Map(AEROPORTS_PTFS.map((airport) => [airport.code, airport.nom]));

export function normalizeAtcAirportCode(value: string | null | undefined): string | null {
  const trimmed = String(value ?? '').trim().toUpperCase();
  return trimmed || null;
}

export function normalizeAtcPosition(value: string | null | undefined): string | null {
  const trimmed = String(value ?? '').trim();
  if (!trimmed) return null;
  const exactMatch = ATC_POSITIONS.find((position) => position.toLowerCase() === trimmed.toLowerCase());
  return exactMatch ?? null;
}

export function buildAtcAirportOptions(extraCodes: Iterable<string> = []): AtcAirportOption[] {
  const knownCodes = [...CODES_OACI_VALIDES].sort((a, b) => a.localeCompare(b));
  const extraNormalized = new Set<string>();
  for (const code of extraCodes) {
    const normalized = normalizeAtcAirportCode(code);
    if (!normalized || CODES_OACI_VALIDES.has(normalized)) continue;
    extraNormalized.add(normalized);
  }

  const combinedCodes = [...knownCodes, ...[...extraNormalized].sort((a, b) => a.localeCompare(b))];
  return combinedCodes.map((code) => {
    const nom = AIRPORT_NAME_BY_CODE.get(code) ?? 'Aéroport ATC supplémentaire';
    const known = AIRPORT_NAME_BY_CODE.has(code);
    return {
      code,
      nom,
      label: `${code} - ${nom}`,
      known,
    };
  });
}

export function isKnownAtcAirportCode(code: string, airportOptions?: AtcAirportOption[]): boolean {
  if (CODES_OACI_VALIDES.has(code)) return true;
  return (airportOptions ?? []).some((airport) => airport.code === code);
}

function matchesTarget(
  aeroport: string,
  position: string,
  ruleAeroport: string | null,
  rulePosition: string | null
): boolean {
  const ap = normalizeAtcAirportCode(aeroport);
  const pos = normalizeAtcPosition(position);
  const rAp = normalizeAtcAirportCode(ruleAeroport);
  const rPos = normalizeAtcPosition(rulePosition);
  if (!ap || !pos) return false;
  if (rAp === ap && rPos === null) return true;
  if (rAp === null && rPos === pos) return true;
  if (rAp === ap && rPos === pos) return true;
  return false;
}

function ruleSpecificity(ruleAeroport: string | null, rulePosition: string | null): number {
  if (ruleAeroport && rulePosition) return 3;
  if (ruleAeroport) return 2;
  if (rulePosition) return 1;
  return 0;
}

function forbiddenAppliesToUser(rule: AtcGradeForbidden, userGrade: AtcGradeInfo | null): boolean {
  if (!userGrade || !rule.grade) return false;
  if (rule.applies_to_lower_grades) {
    return userGrade.ordre <= rule.grade.ordre;
  }
  return userGrade.id === rule.grade_id;
}

export function checkAtcAccess(
  aeroport: string,
  position: string,
  ctx: AtcAccessContext
): AtcAccessResult {
  if (ctx.bypass) return { allowed: true };

  const ap = normalizeAtcAirportCode(aeroport);
  const normalizedPosition = normalizeAtcPosition(position);
  if (!ap || !normalizedPosition) {
    return { allowed: false, code: 'forbidden', reason: 'Sélection ATC invalide.' };
  }
  const userOrdre = ctx.userGrade?.ordre ?? 0;
  const userNom = ctx.userGrade?.nom ?? 'Aucun grade';

  for (const rule of ctx.forbidden) {
    if (!forbiddenAppliesToUser(rule, ctx.userGrade)) continue;
    if (!matchesTarget(ap, normalizedPosition, rule.aeroport, rule.position)) continue;

    if (rule.aeroport && !rule.position) {
      return { allowed: false, code: 'forbidden', reason: `Votre grade n'autorise pas la position sur ${rule.aeroport.toUpperCase()}.` };
    }
    if (!rule.aeroport && rule.position) {
      return { allowed: false, code: 'forbidden', reason: `Votre grade n'autorise pas la position ${normalizeAtcPosition(rule.position)}.` };
    }
    return {
      allowed: false,
      code: 'forbidden',
      reason: `Votre grade n'autorise pas la position ${normalizeAtcPosition(rule.position)} sur ${normalizeAtcAirportCode(rule.aeroport)}.`,
    };
  }

  const matchingMin = ctx.minGrades
    .filter((r) => matchesTarget(ap, normalizedPosition, r.aeroport, r.position))
    .sort((a, b) => {
      const specDiff =
        ruleSpecificity(b.aeroport, b.position) - ruleSpecificity(a.aeroport, a.position);
      if (specDiff !== 0) return specDiff;
      return (b.min_grade?.ordre ?? 0) - (a.min_grade?.ordre ?? 0);
    });

  const requirement = matchingMin[0];
  if (requirement?.min_grade) {
    const requiredOrdre = requirement.min_grade.ordre;
    if (userOrdre < requiredOrdre) {
      const label = formatRuleTarget(requirement.aeroport, requirement.position);
      return {
        allowed: false,
        code: 'min_grade',
        reason: `Votre grade (${userNom}) est insuffisant pour ${label} (minimum ${requirement.min_grade.nom}).`,
      };
    }
  }

  return { allowed: true };
}

export function isAirportSelectable(aeroport: string, ctx: AtcAccessContext): boolean {
  if (ctx.bypass) return true;
  return ATC_POSITIONS.some((p) => checkAtcAccess(aeroport, p, ctx).allowed);
}

export function getPositionAvailability(
  aeroport: string,
  position: string,
  ctx: AtcAccessContext
): AtcAccessResult {
  return checkAtcAccess(aeroport, position, ctx);
}

export function formatRuleTarget(aeroport: string | null, position: string | null): string {
  const airportCode = normalizeAtcAirportCode(aeroport);
  const normalizedPosition = normalizeAtcPosition(position);
  if (airportCode && !normalizedPosition) return `${airportCode} (toutes positions)`;
  if (!airportCode && normalizedPosition) return `la position ${normalizedPosition} (tous aéroports)`;
  return `${normalizedPosition} sur ${airportCode!}`;
}

export function formatForbiddenLabel(r: AtcGradeForbidden): string {
  const target = formatRuleTarget(r.aeroport, r.position);
  const scope = r.applies_to_lower_grades
    ? `${r.grade?.nom ?? '?'} et grades inférieurs`
    : (r.grade?.nom ?? '?');
  return `Interdit — ${target} — ${scope}`;
}

export function formatMinGradeLabel(r: AtcPositionMinGrade): string {
  const target = formatRuleTarget(r.aeroport, r.position);
  return `Minimum ${r.min_grade?.nom ?? '?'} — ${target}`;
}

export function validateRuleTarget(body: {
  kind?: string;
  aeroport?: string | null;
  position?: string | null;
}, airportOptions?: AtcAirportOption[]): { aeroport: string | null; position: string | null } | { error: string } {
  const kind = body.kind;
  const aeroport = normalizeAtcAirportCode(body.aeroport);
  const position = normalizeAtcPosition(body.position);

  const ensureAirport = (): { aeroport: string } | { error: string } => {
    if (!aeroport) return { error: 'Aéroport requis.' };
    if (!isKnownAtcAirportCode(aeroport, airportOptions)) {
      return { error: `Aéroport ATC inconnu : ${aeroport}.` };
    }
    return { aeroport };
  };

  if (kind === 'airport') {
    const ensured = ensureAirport();
    if ('error' in ensured) return ensured;
    return { aeroport, position: null };
  }
  if (kind === 'position') {
    if (!position || !ATC_POSITION_SET.has(position)) {
      return { error: 'Position invalide.' };
    }
    return { aeroport: null, position };
  }
  if (kind === 'pair') {
    const ensured = ensureAirport();
    if ('error' in ensured) return ensured;
    if (!position || !ATC_POSITION_SET.has(position)) {
      return { error: 'Position invalide.' };
    }
    return { aeroport, position };
  }
  return { error: 'Type invalide (airport, position, pair).' };
}

type AdminClient = ReturnType<typeof import('@/lib/supabase/admin').createAdminClient>;

export async function loadAtcAccessContext(admin: AdminClient, userId: string): Promise<AtcAccessContext> {
  const { data: profile } = await admin
    .from('profiles')
    .select('role, atc_grade_id')
    .eq('id', userId)
    .single();

  if (!profile || profile.role === 'admin') {
    return { bypass: true, userGrade: null, forbidden: [], minGrades: [] };
  }

  const [{ data: grades }, { data: forbiddenRaw }, { data: minGradesRaw }] = await Promise.all([
    admin.from('atc_grades').select('id, nom, ordre').order('ordre', { ascending: true }),
    admin.from('atc_grade_forbidden').select('id, grade_id, aeroport, position, applies_to_lower_grades'),
    admin.from('atc_position_min_grades').select('id, aeroport, position, min_grade_id'),
  ]);

  const gradeById = new Map((grades ?? []).map((g) => [g.id, g]));
  const userGrade = profile.atc_grade_id ? gradeById.get(profile.atc_grade_id) ?? null : null;

  const forbidden: AtcGradeForbidden[] = (forbiddenRaw ?? []).map((r) => ({
    ...r,
    grade: gradeById.get(r.grade_id),
  }));

  const minGrades: AtcPositionMinGrade[] = (minGradesRaw ?? []).map((r) => ({
    ...r,
    min_grade: gradeById.get(r.min_grade_id),
  }));

  return { bypass: false, userGrade, forbidden, minGrades };
}

export async function loadAllAtcAccessRules(admin: AdminClient) {
  const [{ data: grades }, { data: forbiddenRaw }, { data: minGradesRaw }, { data: vhfAirports }, { data: activeSessions }] = await Promise.all([
    admin.from('atc_grades').select('id, nom, ordre').order('ordre', { ascending: true }),
    admin.from('atc_grade_forbidden').select('id, grade_id, aeroport, position, applies_to_lower_grades').order('created_at'),
    admin.from('atc_position_min_grades').select('id, aeroport, position, min_grade_id').order('created_at'),
    admin.from('vhf_position_frequencies').select('aeroport'),
    admin.from('atc_sessions').select('aeroport'),
  ]);

  const gradeById = new Map((grades ?? []).map((g) => [g.id, g]));
  const airportOptions = buildAtcAirportOptions([
    ...((forbiddenRaw ?? []).map((rule) => rule.aeroport).filter(Boolean) as string[]),
    ...((minGradesRaw ?? []).map((rule) => rule.aeroport).filter(Boolean) as string[]),
    ...((vhfAirports ?? []).map((row) => row.aeroport).filter(Boolean) as string[]),
    ...((activeSessions ?? []).map((row) => row.aeroport).filter(Boolean) as string[]),
  ]);

  return {
    grades: grades ?? [],
    airportOptions,
    forbidden: (forbiddenRaw ?? []).map((r) => ({ ...r, grade: gradeById.get(r.grade_id) })),
    minGrades: (minGradesRaw ?? []).map((r) => ({ ...r, min_grade: gradeById.get(r.min_grade_id) })),
  };
}

export function serializeAccessContext(ctx: AtcAccessContext) {
  return {
    bypass: ctx.bypass,
    userGrade: ctx.userGrade,
    forbidden: ctx.forbidden.map((r) => ({
      id: r.id,
      grade_id: r.grade_id,
      aeroport: r.aeroport,
      position: r.position,
      applies_to_lower_grades: r.applies_to_lower_grades,
      grade: r.grade,
    })),
    minGrades: ctx.minGrades.map((r) => ({
      id: r.id,
      aeroport: r.aeroport,
      position: r.position,
      min_grade_id: r.min_grade_id,
      min_grade: r.min_grade,
    })),
  };
}
