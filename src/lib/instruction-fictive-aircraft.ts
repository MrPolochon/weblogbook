import type { createAdminClient } from '@/lib/supabase/admin';

export type InstructionSessionKind = 'pilot_training' | 'exam';

export const OPEN_EXAM_STATUTS = ['assigne', 'accepte', 'en_cours'] as const;
export const OPEN_PILOT_TRAINING_STATUTS = ['assigne', 'accepte', 'en_cours'] as const;

const STATUTS_PLANS_OUVERTS = [
  'depose',
  'en_attente',
  'accepte',
  'en_cours',
  'automonitoring',
  'en_attente_cloture',
] as const;

type AdminClient = ReturnType<typeof createAdminClient>;

export type InventaireAvionRow = {
  instruction_actif?: boolean | null;
  instruction_lifecycle?: string | null;
};

/** Avion visible dans l'inventaire personnel de l'élève / pilote. */
export function isFictiveVisibleInStudentInventory(row: InventaireAvionRow): boolean {
  if (!row.instruction_actif) return true;
  return row.instruction_lifecycle === 'actif';
}

export function filterStudentInventory<T extends InventaireAvionRow>(rows: T[]): T[] {
  return rows.filter(isFictiveVisibleInStudentInventory);
}

/** Active les avions fictifs d'une session (accepte → en_cours). */
export async function activateFictiveAircraftForSession(
  admin: AdminClient,
  sessionKind: InstructionSessionKind,
  sessionId: string,
): Promise<void> {
  const { error } = await admin
    .from('inventaire_avions')
    .update({ instruction_lifecycle: 'actif' })
    .eq('instruction_actif', true)
    .eq('instruction_session_kind', sessionKind)
    .eq('instruction_session_id', sessionId)
    .eq('instruction_lifecycle', 'brouillon');
  if (error) throw new Error(error.message);
}

/** Met à jour l'instructeur propriétaire des avions fictifs d'une session (réassignation). */
export async function transferFictiveAircraftInstructorForSession(
  admin: AdminClient,
  sessionKind: InstructionSessionKind,
  sessionId: string,
  newInstructorId: string,
): Promise<void> {
  const { error } = await admin
    .from('inventaire_avions')
    .update({ instruction_instructeur_id: newInstructorId })
    .eq('instruction_session_kind', sessionKind)
    .eq('instruction_session_id', sessionId)
    .eq('instruction_actif', true)
    .in('instruction_lifecycle', ['brouillon', 'actif']);
  if (error) throw new Error(error.message);
}

/** Supprime les avions fictifs liés à une session (fin, annulation, refus). */
export async function removeFictiveAircraftForSession(
  admin: AdminClient,
  sessionKind: InstructionSessionKind,
  sessionId: string,
): Promise<void> {
  const { data: planes, error: selErr } = await admin
    .from('inventaire_avions')
    .select('id')
    .eq('instruction_actif', true)
    .eq('instruction_session_kind', sessionKind)
    .eq('instruction_session_id', sessionId)
    .in('instruction_lifecycle', ['brouillon', 'actif']);
  if (selErr) throw new Error(selErr.message);

  const ids = (planes || []).map((p) => p.id as string);
  if (ids.length === 0) return;

  const { count: plansOuverts } = await admin
    .from('plans_vol')
    .select('*', { count: 'exact', head: true })
    .in('inventaire_avion_id', ids)
    .in('statut', [...STATUTS_PLANS_OUVERTS]);
  if ((plansOuverts ?? 0) > 0) {
    throw new Error('Un avion fictif de cette session est utilisé dans un plan de vol en cours.');
  }

  const { error: delErr } = await admin.from('inventaire_avions').delete().in('id', ids);
  if (delErr) throw new Error(delErr.message);
}

/** Supprime les avions fictifs orphelins (session absente ou déjà close). */
export async function cleanupOrphanedFictiveAircraft(admin: AdminClient): Promise<number> {
  const { data: candidates, error } = await admin
    .from('inventaire_avions')
    .select('id, instruction_session_kind, instruction_session_id, instruction_lifecycle')
    .eq('instruction_actif', true)
    .not('instruction_session_id', 'is', null)
    .in('instruction_lifecycle', ['brouillon', 'actif']);
  if (error) throw new Error(error.message);
  if (!candidates?.length) return 0;

  const examIds = candidates.filter((c) => c.instruction_session_kind === 'exam').map((c) => c.instruction_session_id as string);
  const trainingIds = candidates
    .filter((c) => c.instruction_session_kind === 'pilot_training')
    .map((c) => c.instruction_session_id as string);

  const closedExamIds = new Set<string>();
  if (examIds.length > 0) {
    const { data: exams } = await admin
      .from('instruction_exam_requests')
      .select('id, statut')
      .in('id', examIds);
    for (const e of exams || []) {
      if (['termine', 'refuse'].includes(String(e.statut))) closedExamIds.add(e.id as string);
    }
    for (const id of examIds) {
      if (!(exams || []).some((e) => e.id === id)) closedExamIds.add(id);
    }
  }

  const closedTrainingIds = new Set<string>();
  if (trainingIds.length > 0) {
    const { data: trainings } = await admin
      .from('instruction_pilot_training_requests')
      .select('id, statut')
      .in('id', trainingIds);
    for (const t of trainings || []) {
      if (['termine', 'refuse'].includes(String(t.statut))) closedTrainingIds.add(t.id as string);
    }
    for (const id of trainingIds) {
      if (!(trainings || []).some((t) => t.id === id)) closedTrainingIds.add(id);
    }
  }

  const toDelete = candidates
    .filter((c) => {
      const sid = c.instruction_session_id as string;
      if (c.instruction_session_kind === 'exam') return closedExamIds.has(sid);
      if (c.instruction_session_kind === 'pilot_training') return closedTrainingIds.has(sid);
      return true;
    })
    .map((c) => c.id as string);

  if (toDelete.length === 0) return 0;

  const { error: delErr } = await admin.from('inventaire_avions').delete().in('id', toDelete);
  if (delErr) throw new Error(delErr.message);
  return toDelete.length;
}
