/**
 * Utilitaires pour la gestion des compagnies
 */

/**
 * Calcule le prix d'un hub en fonction du nombre de hubs existants
 * 1er hub = gratuit, 2e = 500k, puis x2 à chaque fois
 */
export function calculerPrixHub(numHub: number): number {
  if (numHub === 1) return 0;
  if (numHub === 2) return 500000;
  return 500000 * Math.pow(2, numHub - 2);
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
 * Coût fixe d'un vol ferry
 */
export const COUT_VOL_FERRY = 10000;

/**
 * Coût pour affréter des techniciens (réparation sur place)
 */
export const COUT_AFFRETER_TECHNICIENS = 50000;

/**
 * Temps d'attente en minutes pour l'affrètement des techniciens
 */
export const TEMPS_AFFRETER_TECHNICIENS_MIN = 60;

/**
 * Calcule l'usure d'un vol normal (entre 2% et 6% selon le temps de vol)
 * @param tempsVolMin Temps de vol en minutes
 */
export function calculerUsureVol(tempsVolMin: number): number {
  // Usure minimale de 2%, maximale de 6%
  // Un vol de 30 min = 2%, un vol de 180 min = 6%
  const base = 2;
  const max = 6;
  const facteur = Math.min(tempsVolMin / 180, 1);
  return Math.round(base + facteur * (max - base));
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