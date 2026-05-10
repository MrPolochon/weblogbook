// ============================================================
// Marketplace : ruptures de stock aleatoires
// ------------------------------------------------------------
// Chaque type d'avion peut entrer en rupture de stock pour une
// duree aleatoire entre 6h et 3j. Pendant ce temps, l'avion ne
// peut pas etre achete. Le tirage est fait cote serveur lors de
// chaque chargement du marketplace (lazy refresh), throttle a
// un tirage par avion par heure pour eviter le spam.
//
// Probabilite par tirage (toutes les heures) :
//   PROBA_PAR_HEURE = 0.04  → ~1 rupture toutes les ~25h en moyenne
// ============================================================
import type { SupabaseClient } from '@supabase/supabase-js';

const PROBA_PAR_HEURE = 0.04;
const DUREE_MIN_MS = 6 * 60 * 60 * 1000;       // 6h
const DUREE_MAX_MS = 3 * 24 * 60 * 60 * 1000;  // 3j
const THROTTLE_MS  = 60 * 60 * 1000;            // 1h entre 2 tirages par avion

type AvionRow = {
  id: string;
  rupture_fin_at: string | null;
  prochain_check_rupture_at: string | null;
};

/**
 * Met a jour les ruptures de stock du marketplace :
 *  - efface les ruptures expirees (fin_at <= now)
 *  - tire des nouvelles ruptures pour les avions disponibles dont
 *    le prochain_check est echu, avec une probabilite calibree.
 *
 * Idempotent et safe a appeler depuis n'importe quelle requete GET.
 */
export async function refreshMarketplaceRuptures(admin: SupabaseClient): Promise<void> {
  try {
    const { data: avions, error } = await admin
      .from('types_avion')
      .select('id, rupture_fin_at, prochain_check_rupture_at')
      .gt('prix', 0);

    if (error || !avions) return;

    const now = Date.now();
    const updates: Array<Promise<unknown>> = [];

    for (const a of avions as AvionRow[]) {
      const finAt = a.rupture_fin_at ? new Date(a.rupture_fin_at).getTime() : 0;
      const prochainCheck = a.prochain_check_rupture_at
        ? new Date(a.prochain_check_rupture_at).getTime()
        : 0;

      // 1) Rupture en cours : on ne touche a rien (elle expirera toute seule).
      if (finAt > now) continue;

      // 2) Rupture expiree : on nettoie debut/fin si pas deja fait.
      const aRuptureAEffacer = a.rupture_fin_at !== null;

      // 3) Throttle : pas de tirage si on a check il y a moins d'1h.
      const tirageAutorise = prochainCheck === 0 || prochainCheck <= now;

      if (!aRuptureAEffacer && !tirageAutorise) continue;

      // 4) Tirage probabiliste (uniquement si autorise par le throttle).
      let nouvelleRupture: { debut: Date; fin: Date } | null = null;
      if (tirageAutorise && Math.random() < PROBA_PAR_HEURE) {
        const dureeMs = DUREE_MIN_MS + Math.random() * (DUREE_MAX_MS - DUREE_MIN_MS);
        const debut = new Date(now);
        const fin = new Date(now + dureeMs);
        nouvelleRupture = { debut, fin };
      }

      const patch: Record<string, string | null> = {};

      if (aRuptureAEffacer && !nouvelleRupture) {
        patch.rupture_debut_at = null;
        patch.rupture_fin_at = null;
      }
      if (nouvelleRupture) {
        patch.rupture_debut_at = nouvelleRupture.debut.toISOString();
        patch.rupture_fin_at = nouvelleRupture.fin.toISOString();
      }
      if (tirageAutorise) {
        patch.prochain_check_rupture_at = new Date(now + THROTTLE_MS).toISOString();
      }

      if (Object.keys(patch).length === 0) continue;
      updates.push(admin.from('types_avion').update(patch).eq('id', a.id));
    }

    if (updates.length > 0) {
      await Promise.all(updates);
    }
  } catch (e) {
    console.error('[marketplace] refreshMarketplaceRuptures:', e);
  }
}

/**
 * Verifie si un avion est actuellement en rupture de stock (lecture fraiche).
 * Utilise au moment de l'achat pour verrouiller cote serveur.
 */
export async function isTypeAvionEnRupture(
  admin: SupabaseClient,
  typeAvionId: string,
): Promise<{ enRupture: boolean; finAt: string | null }> {
  const { data } = await admin
    .from('types_avion')
    .select('rupture_fin_at')
    .eq('id', typeAvionId)
    .maybeSingle();
  const finAt = (data as { rupture_fin_at: string | null } | null)?.rupture_fin_at ?? null;
  if (!finAt) return { enRupture: false, finAt: null };
  return { enRupture: new Date(finAt).getTime() > Date.now(), finAt };
}
