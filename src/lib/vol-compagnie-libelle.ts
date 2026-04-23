/**
 * Libellé enregistré en base pour un vol opéré dans le cadre SIAVI / MEDEVAC
 * (pas de compagnie aérienne commerciale dans la liste `compagnies`).
 */
export const COMPAGNIE_MEDEVAC_SIAVI = 'MEDEVAC SIAVI';

export function isCompagnieMedevacSiavi(libelle: string | null | undefined): boolean {
  return String(libelle ?? '').trim() === COMPAGNIE_MEDEVAC_SIAVI;
}
