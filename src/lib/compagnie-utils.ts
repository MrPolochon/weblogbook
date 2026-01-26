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
