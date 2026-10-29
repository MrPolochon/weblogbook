/** Civil pilot workspace only. Other operational spaces keep their own shell. */
const PILOT_ROOTS = [
  '/pilote', '/logbook', '/inventaire', '/marche-passagers', '/marche-cargo',
  '/felitz-bank', '/felitz', '/ma-compagnie', '/alliance', '/hangar-market',
  '/marketplace', '/notams', '/documents', '/perf-ptfs', '/calendrier',
  '/app/calendrier', '/compte', '/messagerie', '/signalement',
] as const;

export function isPilotWorkspacePath(pathname: string): boolean {
  return PILOT_ROOTS.some(root => pathname === root || pathname.startsWith(`${root}/`));
}

export const PILOT_SECTIONS = [
  { href: '/pilote', label: 'Salle de préparation du vol', description: 'Situation et prochaines actions' },
  { href: '/logbook/plans-vol', label: 'Opérations', description: 'Suivi des plans de vol' },
  { href: '/logbook', label: 'Carnet de vol', description: 'Historique et confirmations' },
  { href: '/inventaire', label: 'Mes avions', description: 'Appareils personnels et équipements' },
  { href: '/felitz-bank', label: 'Finances', description: 'Compte et règlements' },
] as const;

export function activePilotSection(pathname: string): string | null {
  if (pathname === '/logbook/depot-plan-vol' || pathname.startsWith('/logbook/plans-vol')) return '/logbook/plans-vol';
  if (pathname === '/logbook' || pathname.startsWith('/logbook/')) return '/logbook';
  if (pathname === '/inventaire' || pathname.startsWith('/inventaire/')) return '/inventaire';
  if (pathname === '/felitz-bank' || pathname.startsWith('/felitz-bank/') || pathname === '/felitz') return '/felitz-bank';
  return pathname === '/pilote' ? '/pilote' : null;
}
