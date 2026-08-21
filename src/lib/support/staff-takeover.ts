/** Annonce unique quand un staff (autre que le demandeur) prend le relais. */
export const STAFF_TAKEOVER_NOTICE = 'Un staff a pris le relais. Je me tais.';

/** Confirmation courte quand on rend la main à l’IA (mention du bot ou /ticketia). */
export const IA_RESUMED_NOTICE = 'Je reprends la main sur ce ticket.';

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

function normalize(text: string): string {
  return String(text || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[’'`]/g, ' ')
    .trim();
}

/** Prise en charge dite en toutes lettres : ça suffit toujours, quelle que soit la longueur. */
const TAKEOVER_PHRASES =
  /\bje (m en occupe|men occupe|prends? (le )?(relais|ticket|la main)|gere|regarde ca|traite|verifie|check)\b|\bje vais (regarder|voir|verifier|te repondre|m en occuper|gerer)\b|\bje te reponds\b|\bje reprends\b|\bon s en occupe\b|\blaisse moi (voir|regarder|faire)\b|\bc est moi qui\b/;

/**
 * Réactions de couloir : le message n’est qu’un enchaînement d’interjections,
 * de rires ou de politesses. « trop styleee », « nonnn », « wsh », « mdr »…
 */
const REACTION_ONLY =
  /^(?:(?:a+h+|o+h+|e+h+|lo+l+|mdr+|ptdr+|xd+|ha(?:ha)+|hi(?:hi)+|wsh+|wesh+|yo+|slt|salut|hey|coucou|ok(?:ay|i|ey)?|dac+ord?|dacc?|oui+|non+|si|bah|ben|euh+|hm+|bref|enfin|voila|tkt|jsp|jpp|bg|tuff|stylee*|trop|clean|nice|top|gg|cool|merci+|mrc|thanks|ty|de rien|dsl|desolee?|pardon|sorry|pas de soucis?|nop|yep|yes|no)\W*)+$/;

/**
 * Signes que le staff s’adresse vraiment au ticket : question, consigne,
 * interpellation du demandeur, ou vocabulaire du dossier.
 */
const INTERVENTION_SIGNALS =
  /\?|<@!?\d+>|\b(tu|te|toi|ton|ta|tes|vous|votre|vos)\b|\b(peux|peut|pouvez|dois|doit|faut|envoie|envoyez|donne|donnez|clique|cliquez|ouvre|ouvrez|regarde|regardez|essaie|essaye|essayez|fais|faites|verifie|verifiez|contacte|contactez|attends|attendez|reponds|repondez|remplis|remplissez)\b|\b(licence|ticket|compte|dossier|formation|training|instruction|examen|qcm|vol|demande|probleme|souci|erreur|site|page|form(?:ulaire)?)\b/;

/**
 * Un vrai relais staff, pas une remarque de couloir.
 *
 * Critères, volontairement conservateurs (dans le doute, l’IA continue) :
 *  - une formule de prise en charge explicite (« je m’en occupe ») suffit ;
 *  - sinon il faut un message d’au moins 25 caractères ET 5 mots, qui ne soit
 *    pas une simple réaction, et qui porte un signe d’échange avec le demandeur
 *    (question, consigne, interpellation, vocabulaire du dossier).
 *
 * Conséquence voulue : « trop styleee », « désolé du ping tout le monde »,
 * « nonnn / enfin » ne coupent plus l’IA.
 */
export function isRealStaffIntervention(text: string): boolean {
  const t = normalize(text);
  if (!t) return false;
  if (TAKEOVER_PHRASES.test(t)) return true;
  if (REACTION_ONLY.test(t)) return false;
  if (t.length < 25) return false;
  if (t.split(/\s+/).filter(Boolean).length < 5) return false;
  return INTERVENTION_SIGNALS.test(t);
}

/** État persistant : tant que `staff_takeover_at` est posé, l’IA ne parle plus. */
export function iaIsMuted(ticket: { staff_takeover_at?: string | null }): boolean {
  return Boolean(ticket.staff_takeover_at);
}
