import type { SupabaseClient } from '@supabase/supabase-js';
import {
  getAdminAtcTrainingStaffPoolUserIds,
  getAdminPilotTrainingStaffPoolUserIds,
  getUserIdsWithLicenceType,
  isAtcSideExamRequest,
  LICENCE_ATC_FE,
  LICENCE_FE,
} from '@/lib/instruction-permissions';

export type AdminStaffPoolMember = {
  id: string;
  identifiant: string;
  tier?: string;
};

export type AdminStaffReassignPools = {
  pilot_training: AdminStaffPoolMember[];
  atc_training: AdminStaffPoolMember[];
  exam_pilot: AdminStaffPoolMember[];
  exam_atc: AdminStaffPoolMember[];
};

/** Clé `${requester_id}:${licence_code}` → instructeurs ayant formé le candidat. */
export type AdminExamTrainerConflicts = Record<string, string[]>;

const EMPTY_POOLS: AdminStaffReassignPools = {
  pilot_training: [],
  atc_training: [],
  exam_pilot: [],
  exam_atc: [],
};

async function profilesForPool(
  admin: SupabaseClient,
  userIds: string[],
  tier?: string,
): Promise<AdminStaffPoolMember[]> {
  if (userIds.length === 0) return [];
  const { data: profs, error } = await admin
    .from('profiles')
    .select('id, identifiant')
    .in('id', userIds)
    .order('identifiant', { ascending: true });
  if (error) throw new Error(error.message);
  return (profs || []).map((p) => ({
    id: p.id as string,
    identifiant: p.identifiant as string,
    ...(tier ? { tier } : {}),
  }));
}

/** Charge les 4 pools admin (FI, ATC FI, FE, ATC FE) + profils en parallèle. */
export async function loadAdminStaffReassignPools(
  admin: SupabaseClient,
): Promise<AdminStaffReassignPools> {
  const [fiIds, atcFiIds, feIds, atcFeIds] = await Promise.all([
    getAdminPilotTrainingStaffPoolUserIds(admin),
    getAdminAtcTrainingStaffPoolUserIds(admin),
    getUserIdsWithLicenceType(admin, LICENCE_FE),
    getUserIdsWithLicenceType(admin, LICENCE_ATC_FE),
  ]);

  const [pilot_training, atc_training, exam_pilot, exam_atc] = await Promise.all([
    profilesForPool(admin, fiIds, 'FI'),
    profilesForPool(admin, atcFiIds, 'ATC FI'),
    profilesForPool(admin, feIds),
    profilesForPool(admin, atcFeIds),
  ]);

  return { pilot_training, atc_training, exam_pilot, exam_atc };
}

/** Une requête batch pour tous les conflits formateur ≠ examinateur des examens réassignables. */
export async function loadAdminExamTrainerConflicts(
  admin: SupabaseClient,
  exams: Array<{ requester_id: string; licence_code: string }>,
): Promise<AdminExamTrainerConflicts> {
  if (exams.length === 0) return {};

  const requesterIds = Array.from(new Set(exams.map((e) => e.requester_id)));
  const licenceCodes = Array.from(new Set(exams.map((e) => e.licence_code)));

  const { data, error } = await admin
    .from('instruction_training_completions')
    .select('requester_id, licence_code, instructor_id')
    .in('requester_id', requesterIds)
    .in('licence_code', licenceCodes);
  if (error) throw new Error(error.message);

  const result: AdminExamTrainerConflicts = {};
  for (const row of data || []) {
    if (!row.instructor_id) continue;
    const key = `${row.requester_id as string}:${row.licence_code as string}`;
    if (!result[key]) result[key] = [];
    result[key].push(row.instructor_id as string);
  }
  for (const key of Object.keys(result)) {
    result[key] = Array.from(new Set(result[key]));
  }
  return result;
}

export type AdminReassignCandidate = {
  id: string;
  identifiant: string;
  trained_conflict?: boolean;
  currently_assigned?: boolean;
  tier?: string;
};

export function buildAdminReassignCandidates(
  kind: 'exam' | 'pilot_training' | 'atc_training',
  requesterId: string,
  assigneeId: string | null,
  licenceCode: string,
  pools: AdminStaffReassignPools,
  examTrainerConflicts: AdminExamTrainerConflicts,
): AdminReassignCandidate[] {
  let pool: AdminStaffPoolMember[];
  if (kind === 'pilot_training') pool = pools.pilot_training;
  else if (kind === 'atc_training') pool = pools.atc_training;
  else pool = isAtcSideExamRequest(licenceCode) ? pools.exam_atc : pools.exam_pilot;

  const conflictSet =
    kind === 'exam'
      ? new Set(examTrainerConflicts[`${requesterId}:${licenceCode}`] || [])
      : null;

  return pool
    .filter((p) => p.id !== requesterId)
    .map((p) => ({
      id: p.id,
      identifiant: p.identifiant,
      tier: p.tier,
      currently_assigned: p.id === assigneeId,
      ...(conflictSet ? { trained_conflict: conflictSet.has(p.id) } : {}),
    }));
}

export { EMPTY_POOLS };
