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

/**
 * Président ou vice-président de l'alliance, via une compagnie dont l'utilisateur est PDG ou co-PDG.
 * Utilisé pour la consultation du compte / transactions d'alliance, etc.
 */
export async function isAlliancePresidentOrVice(
  userId: string,
  allianceId: string,
  adminClient: SupabaseClient
): Promise<boolean> {
  const compIds = await getLeaderCompagnieIds(userId, adminClient);
  if (compIds.length === 0) return false;
  const { data: rows } = await adminClient
    .from('alliance_membres')
    .select('role')
    .eq('alliance_id', allianceId)
    .in('compagnie_id', compIds);
  return (rows || []).some(
    (r: { role: string | null }) => r.role === 'president' || r.role === 'vice_president',
  );
}

/**
 * Virement débit sur le compte Felitz d'alliance : le président peut toujours ; les vices
 * seulement si `alliance_parametres.virement_vice_president_autorise` est true (défaut en base : true).
 */
export async function canVirementCompteAllianceFelitz(
  userId: string,
  allianceId: string,
  adminClient: SupabaseClient
): Promise<boolean> {
  const compIds = await getLeaderCompagnieIds(userId, adminClient);
  if (compIds.length === 0) return false;
  const { data: rows } = await adminClient
    .from('alliance_membres')
    .select('role')
    .eq('alliance_id', allianceId)
    .in('compagnie_id', compIds);
  if (!rows?.length) return false;
  const isPresident = rows.some((r: { role: string | null }) => r.role === 'president');
  if (isPresident) return true;
  const isVice = rows.some((r: { role: string | null }) => r.role === 'vice_president');
  if (!isVice) return false;
  const { data: param } = await adminClient
    .from('alliance_parametres')
    .select('virement_vice_president_autorise')
    .eq('alliance_id', allianceId)
    .maybeSingle();
  return param?.virement_vice_president_autorise !== false;
}
