/** Chemin affiché dans la barre d’adresse pendant l’écran d’erreur (poisson d’avril). */

export const APRIL_FOOL_ERROR_PATH_APP = '/erreur404accnotfound';
export const APRIL_FOOL_ERROR_PATH_ATC = '/atc/erreur404accnotfound';
export const APRIL_FOOL_ERROR_PATH_SIAVI = '/siavi/erreur404accnotfound';

export const APRIL_FOOL_RETURN_PATH_KEY = 'weblogbook_april_fool_return';

export function getAprilFoolErrorPathForPathname(pathname: string): string {
  if (pathname.startsWith('/atc')) return APRIL_FOOL_ERROR_PATH_ATC;
  if (pathname.startsWith('/siavi')) return APRIL_FOOL_ERROR_PATH_SIAVI;
  return APRIL_FOOL_ERROR_PATH_APP;
}

export function getAprilFoolDefaultHomeForPathname(pathname: string): string {
  if (pathname.startsWith('/atc')) return '/atc';
  if (pathname.startsWith('/siavi')) return '/siavi';
  return '/logbook';
}

export function isAprilFoolErrorPath(pathname: string): boolean {
  return (
    pathname === APRIL_FOOL_ERROR_PATH_APP ||
    pathname === APRIL_FOOL_ERROR_PATH_ATC ||
    pathname === APRIL_FOOL_ERROR_PATH_SIAVI
  );
}

/** Évite de restaurer une URL hors segment ou la page erreur elle-même. */
export function resolveAprilFoolReturnPath(pathname: string, stored: string | null): string {
  const fallback = getAprilFoolDefaultHomeForPathname(pathname);
  if (!stored || isAprilFoolErrorPath(stored)) return fallback;
  if (pathname.startsWith('/atc')) {
    return stored.startsWith('/atc') ? stored : fallback;
  }
  if (pathname.startsWith('/siavi')) {
    return stored.startsWith('/siavi') ? stored : fallback;
  }
  if (stored.startsWith('/atc') || stored.startsWith('/siavi')) return fallback;
  return stored;
}
