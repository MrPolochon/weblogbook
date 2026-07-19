import type { SupabaseClient } from '@supabase/supabase-js';

export type AssignmentReferentRow = {
  eleve_id: string;
  instructeur_id: string;
  created_at: string;
  updated_at: string;
};

/** Référent d'assignation (table instruction_eleve_referent) pour un élève. */
export async function getAssignmentReferentId(
  admin: SupabaseClient,
  eleveId: string,
): Promise<string | null> {
  const { data } = await admin
    .from('instruction_eleve_referent')
    .select('instructeur_id')
    .eq('eleve_id', eleveId)
    .maybeSingle();
  return (data?.instructeur_id as string | null) ?? null;
}

/** Instructeur disponible (pas en mode indisponible). */
export async function isInstructorAvailable(
  admin: SupabaseClient,
  instructorId: string,
): Promise<boolean> {
  const { data } = await admin
    .from('profiles')
    .select('instruction_indisponible')
    .eq('id', instructorId)
    .maybeSingle();
  if (!data) return false;
  return !Boolean(data.instruction_indisponible);
}

/**
 * Si l'élève a un référent d'assignation disponible et dans le pool éligible,
 * le retourne. Sinon null (fallback least-busy / FI-first).
 */
export async function tryPreferAssignmentReferent(
  admin: SupabaseClient,
  eleveId: string,
  eligiblePool: string[],
  options?: {
    excludeIds?: Set<string>;
    requesterId?: string;
  },
): Promise<string | null> {
  const referentId = await getAssignmentReferentId(admin, eleveId);
  if (!referentId) return null;

  const exclude = options?.excludeIds ?? new Set<string>();
  if (exclude.has(referentId)) return null;
  if (options?.requesterId && referentId === options.requesterId) return null;
  if (!eligiblePool.includes(referentId)) return null;

  const available = await isInstructorAvailable(admin, referentId);
  if (!available) return null;

  return referentId;
}
