import type { SupabaseClient } from '@supabase/supabase-js';
import { ALL_LICENCE_TYPES } from '@/lib/licence-types';
import { isAtcSideExamRequest } from '@/lib/instruction-permissions';
import { selectExamInstructorByWorkload } from '@/lib/instruction-exam-assign';
import { tryPreferAssignmentReferent } from '@/lib/instruction-referent';

/** Titres instructeur / examinateur — non demandables en examen. */
export const EXAM_INELIGIBLE_LICENCE_CODES = new Set(['FI', 'FE', 'ATC FI', 'ATC FE']);

export function isExamRequestLicence(licenceCode: string): boolean {
  return (
    (ALL_LICENCE_TYPES as readonly string[]).includes(licenceCode) &&
    !EXAM_INELIGIBLE_LICENCE_CODES.has(licenceCode)
  );
}

export function trainingSideForExamLicence(licenceCode: string): 'atc' | 'pilot' {
  return isAtcSideExamRequest(licenceCode) ? 'atc' : 'pilot';
}

export function examLicencesForTrainingSide(side: 'atc' | 'pilot'): string[] {
  return (ALL_LICENCE_TYPES as readonly string[]).filter((code) => {
    if (EXAM_INELIGIBLE_LICENCE_CODES.has(code)) return false;
    return trainingSideForExamLicence(code) === side;
  });
}

/**
 * Instructeurs ayant déjà formé le candidat pour cette licence d'examen exacte
 * (même `licence_code` qu'une session de training clôturée).
 */
export async function getTrainingInstructorIdsForExam(
  admin: SupabaseClient,
  requesterId: string,
  licenceCode: string,
): Promise<Set<string>> {
  const trainers = new Set<string>();

  const { data: completions } = await admin
    .from('instruction_training_completions')
    .select('instructor_id')
    .eq('requester_id', requesterId)
    .eq('licence_code', licenceCode);
  for (const row of completions || []) {
    if (row.instructor_id) trainers.add(row.instructor_id as string);
  }

  return trainers;
}

export function filterExaminerPoolExcludingTrainers(
  pool: string[],
  trainerIds: Set<string>,
  requesterId: string,
): string[] {
  return pool.filter((id) => id !== requesterId && !trainerIds.has(id));
}

export async function selectExaminerForRequest(
  admin: SupabaseClient,
  pool: string[],
  requesterId: string,
  licenceCode: string,
  options?: { tieBreakKey?: string; simulatedExtraLoad?: Map<string, number> },
): Promise<{ instructorId: string | null; trainerIds: Set<string> }> {
  const trainerIds = await getTrainingInstructorIdsForExam(admin, requesterId, licenceCode);
  const eligible = filterExaminerPoolExcludingTrainers(pool, trainerIds, requesterId);
  if (eligible.length === 0) {
    return { instructorId: null, trainerIds };
  }

  const referentId = await tryPreferAssignmentReferent(admin, requesterId, eligible, {
    requesterId,
    excludeIds: trainerIds,
  });
  if (referentId) {
    return { instructorId: referentId, trainerIds };
  }

  const instructorId = await selectExamInstructorByWorkload(admin, eligible, requesterId, options);
  return { instructorId, trainerIds };
}

export async function recordTrainingCompletion(
  admin: SupabaseClient,
  opts: { requesterId: string; licenceCode: string; instructorId: string },
): Promise<void> {
  const { error } = await admin.from('instruction_training_completions').insert({
    requester_id: opts.requesterId,
    licence_code: opts.licenceCode,
    instructor_id: opts.instructorId,
  });
  if (error) throw new Error(error.message);
}
