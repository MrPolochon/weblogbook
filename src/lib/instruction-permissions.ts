import type { SupabaseClient } from '@supabase/supabase-js';
import { isAtcInstructionProgram } from '@/lib/instruction-programs';

/** Qualifications « personne » (table licences_qualifications.type) */
export const LICENCE_FI = 'FI';
export const LICENCE_FE = 'FE';
export const LICENCE_ATC_FI = 'ATC FI';
export const LICENCE_ATC_FE = 'ATC FE';

/** Examens de type contrôle / ATC (assignés à des détenteurs d’ATC FE, pas aux FE vol). */
export const ATC_EXAM_LICENCE_CODES: readonly string[] = [
  'CAL-ATC',
  'PCAL-ATC',
  'CAL-AFIS',
  'PCAL-AFIS',
  'LPAFIS',
  'LATC',
] as const;

export function isAtcSideExamRequest(licenceCode: string): boolean {
  return (ATC_EXAM_LICENCE_CODES as readonly string[]).includes(licenceCode);
}

export function isAtcInitFormation(licence: string | null | undefined): boolean {
  if (!licence) return false;
  return isAtcInstructionProgram(licence);
}

export type InstructionCapabilities = {
  types: Set<string>;
  canManageFlightInstruction: boolean;
  canManageAtcInstruction: boolean;
  canExamineFlight: boolean;
  canExamineAtc: boolean;
  isAtcTrainingInstructor: boolean;
  canViewExaminerInbox: boolean;
};

export async function fetchUserLicenceTypes(admin: SupabaseClient, userId: string): Promise<Set<string>> {
  const { data } = await admin
    .from('licences_qualifications')
    .select('type')
    .eq('user_id', userId);
  return new Set((data || []).map((r) => r.type as string));
}

export function buildInstructionCapabilities(
  role: string | null | undefined,
  licenceTypes: Set<string>,
): InstructionCapabilities {
  const isAdmin = role === 'admin';
  const legacyInstructeur = role === 'instructeur';
  const hasFi = licenceTypes.has(LICENCE_FI);
  const hasFe = licenceTypes.has(LICENCE_FE);
  const hasAtcFi = licenceTypes.has(LICENCE_ATC_FI);
  const hasAtcFe = licenceTypes.has(LICENCE_ATC_FE);

  return {
    types: licenceTypes,
    canManageFlightInstruction: isAdmin || legacyInstructeur || hasFi,
    canManageAtcInstruction: isAdmin || hasAtcFi || hasAtcFe,
    /** Examens vol : exclusivement la licence FE (les admins n’héritent plus du droit d’examen). */
    canExamineFlight: hasFe,
    /** Examens ATC / AFIS : exclusivement la licence ATC FE. */
    canExamineAtc: hasAtcFe,
    /** Training ATC assignable / file reçue : titres ATC FI ou ATC FE uniquement (pas le seul rôle admin). */
    isAtcTrainingInstructor: hasAtcFi || hasAtcFe,
    /** File examinateur reçue : dès qu’on a FE et/ou ATC FE (jamais par le seul rôle admin). */
    canViewExaminerInbox: hasFe || hasAtcFe,
  };
}

export async function getInstructionCapabilities(
  admin: SupabaseClient,
  userId: string,
  role: string | null | undefined,
): Promise<InstructionCapabilities> {
  const types = await fetchUserLicenceTypes(admin, userId);
  return buildInstructionCapabilities(role, types);
}

/** Peut l’instructeur référent gérer cette formation (créer élève, progression, avions) ? */
export function canInstructorManageEleveForFormation(
  cap: InstructionCapabilities,
  formationInstructionLicence: string | null | undefined,
): boolean {
  if (isAtcInitFormation(formationInstructionLicence)) {
    return cap.canManageAtcInstruction;
  }
  return cap.canManageFlightInstruction;
}

/** Droit d’ouvrir / rattacher un élève sur un parcours (vol vs ATC-INIT). */
export function canOpenFormationAsInstructor(
  cap: InstructionCapabilities,
  formationInstructionLicence: string,
): boolean {
  return canInstructorManageEleveForFormation(cap, formationInstructionLicence);
}

export function canAccessInstructionManagerTools(cap: InstructionCapabilities): boolean {
  return cap.canManageFlightInstruction || cap.canManageAtcInstruction;
}

/**
 * Poole les examinateurs assignables pour une demande d’examen.
 * – Vol (PPL, CPL, etc.) : titulaires de la licence **FE** uniquement
 * – ATC (CAL-ATC, etc.) : titulaires de la licence **ATC FE** uniquement
 * Les comptes admin ne sont plus ajoutés automatiquement (ils s’ajoutent la licence en base s’il le faut).
 */
export async function getExaminerPoolUserIds(admin: SupabaseClient, licenceCode: string): Promise<string[]> {
  const isAtc = isAtcSideExamRequest(licenceCode);
  if (isAtc) {
    const { data: atcFe } = await admin.from('licences_qualifications').select('user_id').eq('type', LICENCE_ATC_FE);
    return Array.from(new Set((atcFe || []).map((r) => r.user_id as string)));
  }
  const { data: fe } = await admin.from('licences_qualifications').select('user_id').eq('type', LICENCE_FE);
  return Array.from(new Set((fe || []).map((r) => r.user_id as string)));
}

export async function userCanConcludeThisExam(
  admin: SupabaseClient,
  userId: string,
  role: string | null | undefined,
  licenceCode: string,
): Promise<boolean> {
  const cap = await getInstructionCapabilities(admin, userId, role);
  if (isAtcSideExamRequest(licenceCode)) {
    return cap.canExamineAtc;
  }
  return cap.canExamineFlight;
}

/** Pilotes (vol) : rôle + FI (pas le FE seul, sauf s’il a aussi rôle historique / FI). */
export async function getFlightInstructorProfilesForSelect(
  admin: SupabaseClient,
): Promise<Array<{ id: string; identifiant: string }>> {
  const [{ data: byRole }, { data: fiLics }] = await Promise.all([
    admin.from('profiles').select('id, identifiant').in('role', ['admin', 'instructeur']).order('identifiant'),
    admin.from('licences_qualifications').select('user_id').eq('type', LICENCE_FI),
  ]);
  const fiIds = new Set((fiLics || []).map((r) => r.user_id as string));
  const byId = new Map<string, string>();
  for (const p of byRole || []) {
    if (p.id) byId.set(p.id, p.identifiant as string);
  }
  if (fiIds.size > 0) {
    const { data: fiProfiles } = await admin
      .from('profiles')
      .select('id, identifiant')
      .in('id', Array.from(fiIds))
      .order('identifiant');
    for (const p of fiProfiles || []) {
      if (p.id) byId.set(p.id, p.identifiant as string);
    }
  }
  return Array.from(byId.entries())
    .map(([id, identifiant]) => ({ id, identifiant }))
    .sort((a, b) => a.identifiant.localeCompare(b.identifiant, 'fr'));
}

export async function isQualifiedFlightInstructorInLogbook(
  admin: SupabaseClient,
  userId: string,
  role: string | null | undefined,
): Promise<boolean> {
  if (role === 'admin' || role === 'instructeur') return true;
  const { data } = await admin.from('licences_qualifications').select('id').eq('user_id', userId).eq('type', LICENCE_FI).limit(1);
  return (data?.length ?? 0) > 0;
}

/**
 * Charge minimale du FI le moins occupé : à partir de ce nombre de sessions ouvertes, on peut assigner
 * un FE / ATC FE (s’il en existe) pour délester les FI.
 */
export const TRAINING_FE_FALLBACK_MIN_FI_OPEN_COUNT = 3;

/**
 * Choisit un assignataire : FI le moins chargé tant que cette charge reste sous le seuil ;
 * sinon FE le moins chargé (s’il y en a). Si aucun FI, retombe sur les FE.
 */
export function selectTrainingAssigneeFiFirst(
  tier1FiPool: string[],
  tier2FePool: string[],
  requesterId: string,
  workload: Map<string, number>,
): string | null {
  const fiAvail = tier1FiPool.filter((id) => id !== requesterId);
  const feAvail = tier2FePool.filter((id) => id !== requesterId);

  const pickMin = (pool: string[]): string | null => {
    if (pool.length === 0) return null;
    const sorted = [...pool].sort(
      (a, b) => (workload.get(a) || 0) - (workload.get(b) || 0) || a.localeCompare(b),
    );
    return sorted[0] ?? null;
  };

  if (fiAvail.length === 0) {
    return pickMin(feAvail);
  }

  const bestFi = pickMin(fiAvail);
  if (!bestFi) return pickMin(feAvail);

  const minFiLoad = workload.get(bestFi) || 0;
  if (minFiLoad >= TRAINING_FE_FALLBACK_MIN_FI_OPEN_COUNT && feAvail.length > 0) {
    return pickMin(feAvail);
  }

  return bestFi;
}

/** Training ATC : **ATC FI** uniquement (admin sans titre exclu). */
export async function getAtcTrainingTier1UserIds(admin: SupabaseClient): Promise<string[]> {
  const { data: fiRows } = await admin.from('licences_qualifications').select('user_id').eq('type', LICENCE_ATC_FI);
  const ids = new Set<string>();
  for (const r of fiRows || []) ids.add(r.user_id as string);
  return Array.from(ids);
}

/** **ATC FE** hors pool FI (évite double compte ATC FI + ATC FE). */
export async function getAtcTrainingTier2UserIds(
  admin: SupabaseClient,
  tier1: Set<string>,
): Promise<string[]> {
  const { data: feRows } = await admin.from('licences_qualifications').select('user_id').eq('type', LICENCE_ATC_FE);
  const out = new Set<string>();
  for (const r of feRows || []) {
    const id = r.user_id as string;
    if (!tier1.has(id)) out.add(id);
  }
  return Array.from(out);
}

/** Union des deux pools (ex. listes déroulantes) — l’assignation utilise les tiers + selectTrainingAssigneeFiFirst. */
export async function getAtcTrainingInstructorPoolUserIds(admin: SupabaseClient): Promise<string[]> {
  const t1 = await getAtcTrainingTier1UserIds(admin);
  const t1s = new Set(t1);
  const t2 = await getAtcTrainingTier2UserIds(admin, t1s);
  return Array.from(new Set(t1.concat(t2)));
}

/**
 * Training vol : **FI** uniquement (admin / instructeur sans licence FI exclu).
 * Charge : `instruction_pilot_training_requests`.
 */
export async function getPilotTrainingTier1UserIds(admin: SupabaseClient): Promise<string[]> {
  const { data: fiRows } = await admin.from('licences_qualifications').select('user_id').eq('type', LICENCE_FI);
  const ids = new Set<string>();
  for (const r of fiRows || []) ids.add(r.user_id as string);
  return Array.from(ids);
}

/** Détenteurs **FE** qui ne sont pas déjà en tier 1 (évite double compte FI+FE). */
export async function getPilotTrainingTier2UserIds(
  admin: SupabaseClient,
  tier1: Set<string>,
): Promise<string[]> {
  const { data: feRows } = await admin.from('licences_qualifications').select('user_id').eq('type', LICENCE_FE);
  const out = new Set<string>();
  for (const r of feRows || []) {
    const id = r.user_id as string;
    if (!tier1.has(id)) out.add(id);
  }
  return Array.from(out);
}
