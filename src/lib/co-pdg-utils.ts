import type { SupabaseClient } from '@supabase/supabase-js';

/**
 * Récupère tous les IDs de compagnies où l'utilisateur est PDG ou co-PDG.
 * Utile pour les routes alliances qui filtrent par compagnie.
 */
export async function getLeaderCompagnieIds(
  userId: string,
  adminClient: SupabaseClient
): Promise<string[]> {
  const [{ data: pdgComps }, { data: coPdgComps }] = await Promise.all([
    adminClient.from('compagnies').select('id').eq('pdg_id', userId),
    adminClient.from('compagnie_employes').select('compagnie_id').eq('pilote_id', userId).eq('role', 'co_pdg'),
  ]);
  const ids = new Set<string>();
  (pdgComps || []).forEach((c: { id: string }) => ids.add(c.id));
  (coPdgComps || []).forEach((c: { compagnie_id: string }) => ids.add(c.compagnie_id));
  return Array.from(ids);
}

/**
 * Vérifie si un utilisateur est co-PDG d'une compagnie donnée.
 * Requiert un client admin (service role) pour bypasser les RLS.
 */
export async function isCoPdg(
  userId: string,
  compagnieId: string,
  adminClient: SupabaseClient
): Promise<boolean> {
  const { data } = await adminClient
    .from('compagnie_employes')
    .select('id')
    .eq('compagnie_id', compagnieId)
    .eq('pilote_id', userId)
    .eq('role', 'co_pdg')
    .maybeSingle();
  return !!data;
}

/**
 * Vérifie si un utilisateur est PDG ou co-PDG d'une compagnie.
 * `compagnie` doit contenir au minimum { pdg_id: string }.
 */
export async function isCompanyLeader(
  userId: string,
  compagnie: { pdg_id: string; id?: string },
  adminClient: SupabaseClient
): Promise<boolean> {
  if (compagnie.pdg_id === userId) return true;
  if (!compagnie.id) return false;
  return isCoPdg(userId, compagnie.id, adminClient);
}

/**
 * Vérifie si un utilisateur est PDG ou co-PDG, en chargeant la compagnie par ID.
 */
export async function isLeaderOfCompany(
  userId: string,
  compagnieId: string,
  adminClient: SupabaseClient
): Promise<boolean> {
  const { data: compagnie } = await adminClient
    .from('compagnies')
    .select('id, pdg_id')
    .eq('id', compagnieId)
    .single();
  if (!compagnie) return false;
  return isCompanyLeader(userId, compagnie, adminClient);
}
