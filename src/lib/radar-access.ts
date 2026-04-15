/**
 * Le radar est désormais accessible à tous les utilisateurs ATC.
 * L'accès ATC est garanti par le layout (atc) qui redirige les non-ATC.
 * Cette fonction est conservée pour compatibilité avec les routes API existantes.
 */
export async function hasApprovedRadarAccessForUser(
  _userId: string,
  _role?: string | null,
  _radarBeta?: boolean | null,
) {
  return true;
}
