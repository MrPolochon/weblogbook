/**
 * Utilitaires pour la gestion des compagnies
 */

/**
 * Calcule le prix d'un hub en fonction du nombre de hubs existants
 * 1er hub = gratuit, 2e = 500k, puis x2 à chaque fois
 */
export function calculerPrixHub(numHub: number): number {
  return calculerPrixHangar(numHub, 1, 500000, 2);
}

/**
 * Calcule le prix d'un hangar (prix × capacité)
 * - 1er hangar : 50 000 F$ × capacité
 * - 2e+ : base × mult^(n-2) × capacité
 */
export function calculerPrixHangar(
  numHangar: number,
  capacite: number,
  base = 500000,
  mult = 2
): number {
  const cap = Math.max(1, Math.min(20, capacite));
  if (numHangar === 1) return 50000 * cap;
  if (numHangar === 2) return Math.round(base * cap);
  return Math.round(base * Math.pow(mult, numHangar - 2) * cap);
}

/**
 * Calcule l'usure d'un vol ferry (entre 3% et 8% selon la distance)
 */
export function calculerUsureFerry(distance: number): number {
  const base = 3;
  const max = 8;
  const facteur = Math.min(distance / 1000, 1);
  return Math.round(base + facteur * (max - base));
}

/**
 * Coût fixe d'un vol ferry MANUEL (fait par un pilote)
 */
export const COUT_VOL_FERRY = 10000;

// ============================================================
// VOL FERRY AUTOMATIQUE (sans pilote)
// ============================================================

/**
 * Coût d'un vol ferry automatique (entre 50K et 300K F$)
 */
export const COUT_VOL_FERRY_AUTO_MIN = 50_000;
export const COUT_VOL_FERRY_AUTO_MAX = 300_000;

/**
 * Durée d'un vol ferry automatique (entre 30 min et 3h)
 */
export const DUREE_VOL_FERRY_AUTO_MIN = 30; // minutes
export const DUREE_VOL_FERRY_AUTO_MAX = 180; // minutes (3h)

/**
 * Calcule le coût et la durée d'un vol ferry automatique (aléatoire)
 */
export function calculerVolFerryAuto(): { cout: number; dureeMin: number } {
  const cout = Math.floor(Math.random() * (COUT_VOL_FERRY_AUTO_MAX - COUT_VOL_FERRY_AUTO_MIN + 1)) + COUT_VOL_FERRY_AUTO_MIN;
  const dureeMin = Math.floor(Math.random() * (DUREE_VOL_FERRY_AUTO_MAX - DUREE_VOL_FERRY_AUTO_MIN + 1)) + DUREE_VOL_FERRY_AUTO_MIN;
  return { cout, dureeMin };
}

// ============================================================
// RÉPARATION AU HUB (payante)
// ============================================================

export const FRACTION_REPARATION_HUB = 0.5;

/** Statuts DB traités comme « au sol » pour la flotte compagnie (`disponible` = legacy). */
export const STATUTS_AVION_COMPAGNIE_AU_SOL = ['ground', 'disponible'] as const;

/**
 * Avion flotte considéré « au sol » pour l’UI et les règles métier.
 * `disponible` est une valeur legacy encore présente en base (CHECK élargi).
 */
export function isAvionCompagnieAuSol(statut: string): boolean {
  return (STATUTS_AVION_COMPAGNIE_AU_SOL as readonly string[]).includes(statut);
}

// ============================================================
// MAINTENANCE (techniciens)
// ============================================================

/**
 * Coût pour affréter des techniciens (réparation sur place)
 */
export const COUT_AFFRETER_TECHNICIENS = 50000;

/**
 * Durée de la maintenance (entre 30 min et 1h30)
 */
export const TEMPS_MAINTENANCE_MIN = 30; // minutes
export const TEMPS_MAINTENANCE_MAX = 90; // minutes (1h30)

/**
 * Calcule la durée de maintenance (aléatoire entre 30 et 90 min)
 */
export function calculerDureeMaintenance(): number {
  return Math.floor(Math.random() * (TEMPS_MAINTENANCE_MAX - TEMPS_MAINTENANCE_MIN + 1)) + TEMPS_MAINTENANCE_MIN;
}

// DEPRECATED - gardé pour compatibilité
export const TEMPS_AFFRETER_TECHNICIENS_MIN = 60;

/**
 * Calcule l'usure d'un vol normal : 2% par tranche de 15 minutes (minimum 2%)
 * 15 min → 2%, 30 min → 4%, 45 min → 6%, 60 min → 8%, etc.
 */
export function calculerUsureVol(tempsVolMin: number): number {
  const tranches = Math.max(1, Math.floor(tempsVolMin / 15));
  return tranches * 2;
}

// ============================================================
// SYSTÈME DE PRÊTS BANCAIRES
// ============================================================

/**
 * Options de prêts disponibles pour les PDG
 * Taux d'intérêt croissant avec le montant emprunté
 */
export const OPTIONS_PRETS = [
  { montant: 200_000, tauxInteret: 1.5 },   // 200K à 1.5% = 3K d'intérêts = 203K à rembourser
  { montant: 500_000, tauxInteret: 5 },     // 500K à 5% = 25K d'intérêts = 525K à rembourser
  { montant: 1_000_000, tauxInteret: 10 },  // 1M à 10% = 100K d'intérêts = 1.1M à rembourser
  { montant: 5_000_000, tauxInteret: 20 },  // 5M à 20% = 1M d'intérêts = 6M à rembourser
] as const;

/**
 * Pourcentage des revenus de vol prélevé pour rembourser le prêt
 */
export const TAUX_PRELEVEMENT_PRET = 30; // 30% des revenus bruts de chaque vol

/**
 * Délai de remboursement par montant emprunté (en jours).
 * Plus le prêt est gros, plus le PDG a de temps.
 */
export const ECHEANCE_PRETS: Record<number, number> = {
  200_000: 14,   // 2 semaines
  500_000: 28,   // 4 semaines
  1_000_000: 42, // 6 semaines
  5_000_000: 56, // 8 semaines
};

export function getEcheanceJours(montant: number): number {
  return ECHEANCE_PRETS[montant] ?? 28;
}

/**
 * Délai (jours) accordé au PDG pour sortir du découvert après échéance
 */
export const DELAI_DECOUVERT_JOURS = 7;

/**
 * Montant crédité par hub vendu automatiquement lors de la procédure de découvert
 */
export const PRIX_VENTE_HUB_FORCE = 200_000;

/**
 * Calcule le montant total à rembourser pour un prêt
 */
export function calculerMontantTotalPret(montant: number, tauxInteret: number): number {
  return Math.round(montant * (1 + tauxInteret / 100));
}

/**
 * Trouve les détails d'un prêt par montant
 */
export function getOptionPret(montant: number) {
  return OPTIONS_PRETS.find(p => p.montant === montant);
}