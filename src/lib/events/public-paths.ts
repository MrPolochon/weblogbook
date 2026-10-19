/** Consultation publique uniquement ; les écritures gardent les contrôles de session. */
export function isPublicMajorEventPath(pathname: string, method: string): boolean {
  return method === 'GET' && (
    /^\/evenements\/[a-f0-9-]{36}$/i.test(pathname) ||
    pathname === '/api/evenements/bandeau' ||
    pathname === '/api/evenements/reservations'
  );
}
