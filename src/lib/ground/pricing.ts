import { createAdminClient } from '@/lib/supabase/admin';

/** Tarif de base mensuel pour un abonnement priorité porte (F$) */
const TARIF_BASE_ABONNEMENT = 50_000;

/** Durée d'un abonnement en millisecondes (30 jours) */
export const DUREE_ABONNEMENT_MS = 30 * 24 * 60 * 60 * 1000;

/**
 * Calcule le prix d'un abonnement priorité porte.
 *
 * Formule :
 *  - Base : 50 000 F$/mois
 *  - Multiplicateur exponentiel par porte déjà achetée sur le même aéroport :
 *    `prix = base * 2^(nb_portes_deja_achetees)`
 *  - Réduction hub : -50% si l'aéroport est un hub de la compagnie
 *
 * Exemple : 1ère porte = 50k, 2ème = 100k, 3ème = 200k…
 */
export async function calculerPrixAbonnement(
  compagnieId: string,
  aeroportId: string,
  gateId: string
): Promise<{ prix: number; estHub: boolean; portesExistantes: number }> {
  const admin = createAdminClient();
  const now = new Date().toISOString();

  // Compter les abonnements actifs de cette compagnie sur cet aéroport (hors celui qu'on s'apprête à acheter)
  const { count: portesExistantes } = await admin
    .from('company_gate_priority')
    .select('*', { count: 'exact', head: true })
    .eq('compagnie_id', compagnieId)
    .eq('aeroport', aeroportId)
    .neq('gate_id', gateId)
    .gt('expires_at', now);

  const nbExistantes = portesExistantes ?? 0;

  // Vérifier si l'aéroport est un hub de la compagnie
  let estHub = false;
  try {
    const { data: hubData } = await admin
      .from('compagnie_hubs')
      .select('id')
      .eq('compagnie_id', compagnieId)
      .eq('aeroport', aeroportId)
      .limit(1);
    estHub = (hubData?.length ?? 0) > 0;
  } catch {
    // Table compagnie_hubs peut ne pas exister encore
    estHub = false;
  }

  const prixBrut = TARIF_BASE_ABONNEMENT * Math.pow(2, nbExistantes);
  const prix = estHub ? Math.floor(prixBrut * 0.5) : prixBrut;

  return { prix, estHub, portesExistantes: nbExistantes };
}

/**
 * Calcule le montant de paiement d'un service ground crew selon le type et le score mini-jeu.
 */
export function calculerPaiementService(
  serviceType: 'bagages' | 'catering' | 'fuel' | 'boarding' | 'repoussage' | 'marshalling',
  score: number,
  paxCount?: number
): number {
  const scores: Record<string, number> = {
    bagages:     2000,
    catering:    1500,
    fuel:        1800,
    boarding:    100,  // par passager
    repoussage:  2500,
    marshalling: 1200,
  };

  const base = serviceType === 'boarding'
    ? (scores.boarding * (paxCount ?? 1))
    : (scores[serviceType] ?? 1500);

  // Score entre 0.5 et 1.0 — on interpole sur 50%→100% du base
  const clampedScore = Math.max(0, Math.min(1, score));
  const facteur = 0.5 + clampedScore * 0.5;

  return Math.round(base * facteur);
}

/**
 * Distribue le montant d'un service entre les membres de l'équipe
 * proportionnellement à leurs scores de mini-jeu.
 * Si la somme des scores est 0 → parts égales entre tous les membres.
 */
export function distribuerPaiementEquipe(
  contributions: Array<{ user_id: string; score_minijeu: number }>,
  montantTotal: number
): Array<{ user_id: string; montant: number }> {
  if (contributions.length === 0) return [];
  if (montantTotal <= 0) return contributions.map((c) => ({ user_id: c.user_id, montant: 0 }));

  const totalScore = contributions.reduce((sum, c) => sum + Number(c.score_minijeu), 0);

  if (totalScore === 0) {
    const partEgale = Math.floor(montantTotal / contributions.length);
    return contributions.map((c) => ({ user_id: c.user_id, montant: partEgale }));
  }

  return contributions.map((c) => ({
    user_id: c.user_id,
    montant: Math.round((Number(c.score_minijeu) / totalScore) * montantTotal),
  }));
}

/**
 * Calcule le malus de revenu pour boarding incomplet.
 * boarding incomplet → malus proportionnel au % de pax non embarqués × 0.3 (max 30%)
 */
export function calculerMalusBoarding(
  totalPax: number,
  paxEmbarques: number
): { malus: number; pourcentage: number } {
  if (totalPax <= 0 || paxEmbarques >= totalPax) {
    return { malus: 0, pourcentage: 0 };
  }
  const ratioManquant = (totalPax - paxEmbarques) / totalPax;
  const pourcentageMalus = Math.min(0.3, ratioManquant * 0.3);
  return { malus: pourcentageMalus, pourcentage: Math.round(pourcentageMalus * 100) };
}
