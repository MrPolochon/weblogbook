// ============================================================
// Helpers TypeScript pour les opérations atomiques Felitz Bank.
//
// Encapsule les RPC SQL `debiter_avec_trace`, `crediter_avec_trace`,
// `virer_avec_trace` (cf. supabase/add_felitz_atomic_helpers.sql).
//
// Ces helpers garantissent que le solde et la ligne `felitz_transactions`
// bougent ENSEMBLE (transaction PG) — terminé les "debit fantôme" /
// "credit sans trace" sur les chemins d'erreur.
//
// La table `felitz_transactions` n'a pas de colonne `description` ; tout
// est stocké dans `libelle`.
// ============================================================
import type { SupabaseClient } from '@supabase/supabase-js';

type AdminClient = SupabaseClient;

/**
 * Débite atomiquement un compte Felitz et insère la ligne d'historique.
 * @returns ok=true si le débit a réussi, ok=false si solde insuffisant ou compte inexistant.
 */
export async function debiterFelitzAvecTrace(
  admin: AdminClient,
  args: { compteId: string; montant: number; libelle: string },
): Promise<{ ok: boolean; error?: string }> {
  if (!Number.isFinite(args.montant) || args.montant <= 0) {
    return { ok: false, error: 'Montant invalide' };
  }
  const { data, error } = await admin.rpc('debiter_avec_trace', {
    p_compte_id: args.compteId,
    p_montant: args.montant,
    p_libelle: args.libelle,
  });
  if (error) {
    console.error('[felitz] debiter_avec_trace error:', error);
    return { ok: false, error: error.message };
  }
  return { ok: data === true };
}

/**
 * Crédite atomiquement un compte Felitz et insère la ligne d'historique.
 */
export async function crediterFelitzAvecTrace(
  admin: AdminClient,
  args: { compteId: string; montant: number; libelle: string },
): Promise<{ ok: boolean; error?: string }> {
  if (!Number.isFinite(args.montant) || args.montant <= 0) {
    return { ok: false, error: 'Montant invalide' };
  }
  const { data, error } = await admin.rpc('crediter_avec_trace', {
    p_compte_id: args.compteId,
    p_montant: args.montant,
    p_libelle: args.libelle,
  });
  if (error) {
    console.error('[felitz] crediter_avec_trace error:', error);
    return { ok: false, error: error.message };
  }
  return { ok: data === true };
}

/**
 * Virement atomique : débit source + crédit dest + 2 lignes d'historique.
 * Si le crédit échoue, le débit est rollback automatiquement (transaction PG).
 */
export async function virerFelitzAvecTrace(
  admin: AdminClient,
  args: {
    compteSourceId: string;
    compteDestId: string;
    montant: number;
    libelleSource: string;
    libelleDest: string;
  },
): Promise<{ ok: boolean; error?: string }> {
  if (!Number.isFinite(args.montant) || args.montant <= 0) {
    return { ok: false, error: 'Montant invalide' };
  }
  if (args.compteSourceId === args.compteDestId) {
    return { ok: false, error: 'Virement vers le même compte impossible' };
  }
  const { data, error } = await admin.rpc('virer_avec_trace', {
    p_compte_source_id: args.compteSourceId,
    p_compte_dest_id: args.compteDestId,
    p_montant: args.montant,
    p_libelle_source: args.libelleSource,
    p_libelle_dest: args.libelleDest,
  });
  if (error) {
    console.error('[felitz] virer_avec_trace error:', error);
    return { ok: false, error: error.message };
  }
  return { ok: data === true };
}
