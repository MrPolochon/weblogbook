/**
 * Décore le site en mode Pâques uniquement pour la zone « pilote » (app).
 * ATC / SIAVI gardent leur thème clair–sombre sans surcouche pastel.
 */
export function pathnameUsesEasterSkin(pathname: string): boolean {
  if (pathname === '/login') return false;
  if (pathname.startsWith('/atc') || pathname.startsWith('/siavi')) return false;
  return true;
}
