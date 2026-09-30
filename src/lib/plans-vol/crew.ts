import type { SupabaseClient } from '@supabase/supabase-js';

export const STATUTS_PLAN_OCCUPES = [
  'depose',
  'en_attente',
  'en_attente_copilote',
  'accepte',
  'en_cours',
  'automonitoring',
  'en_attente_cloture',
  'en_pause',
  'planifie_suivant',
] as const;

export function isPlanCrew(
  plan: { pilote_id?: string | null; copilote_id?: string | null },
  userId: string,
): boolean {
  return plan.pilote_id === userId || plan.copilote_id === userId;
}

export async function isCompanyMember(
  admin: SupabaseClient,
  userId: string,
  compagnieId: string,
): Promise<boolean> {
  const { data: compagnie } = await admin.from('compagnies').select('pdg_id').eq('id', compagnieId).maybeSingle();
  if (compagnie?.pdg_id === userId) return true;
  const { data: emploi } = await admin
    .from('compagnie_employes')
    .select('id')
    .eq('compagnie_id', compagnieId)
    .eq('pilote_id', userId)
    .maybeSingle();
  return Boolean(emploi);
}

export async function hasOccupiedPlan(
  admin: SupabaseClient,
  userId: string,
): Promise<boolean> {
  const { count } = await admin
    .from('plans_vol')
    .select('*', { count: 'exact', head: true })
    .in('statut', [...STATUTS_PLAN_OCCUPES])
    .or(`pilote_id.eq.${userId},copilote_id.eq.${userId}`);
  return (count ?? 0) > 0;
}
