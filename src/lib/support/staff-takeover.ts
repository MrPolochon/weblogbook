/** Annonce unique quand un staff (autre que le demandeur) prend le relais. */
export const STAFF_TAKEOVER_NOTICE = 'Un staff a pris le relais. Je me tais.';

/**
 * Relais IA : l’auteur a un rôle staff/instructeur ET n’est pas le demandeur du ticket.
 * `fromStaff` = rôle Discord (staff / instructeur / manage_channels) uniquement.
 * Sans id auteur, on ne relais pas : un demandeur staff (ex. owner) ne doit jamais
 * faire taire l’IA sur son propre ticket. Un bot trop vieux qui n’envoie pas
 * `discord_user_id` continue donc d’assister, au lieu de recréer le bug.
 */
export function isOtherStaffTakeover(
  fromStaff: boolean,
  authorDiscordId: string,
  openerDiscordId: string
): boolean {
  if (!fromStaff) return false;
  const author = String(authorDiscordId || '').trim();
  const opener = String(openerDiscordId || '').trim();
  if (!author || !opener) return false;
  return author !== opener;
}
