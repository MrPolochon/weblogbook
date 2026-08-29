/**
 * « Est-ce que ce message attend vraiment une réponse de l’IA ? »
 *
 * Dans un ticket il y a du bavardage : « XD », « merci », « au moins il a pu
 * aider avant d’appeler un staff ». Le bot y répondait par une phrase creuse
 * suivie d’une proposition de clôture. Dans le doute, le silence vaut mieux
 * qu’un message vide de sens.
 */

function normalize(text: string): string {
  return String(text || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[’'`]/g, ' ')
    .replace(/<@!?&?\d+>/g, ' ')
    .replace(/@\S+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * « Toujours là ? », « t’es là ? » : on ping un humain, on ne pose pas une
 * question au bot. Le `?` seul ne doit pas relancer l’IA sur le sujet du ticket.
 */
const PRESENCE_CHECK =
  /^(toujours (?:la|ici|en ligne)|(?:t es|tes|tu es|vous etes) (?:la|ici)|y a quelqu.?un|ya quelqu.?un|il y a quelqu.?un|(?:tu|vous)(?: me)? reponds?)\s*\?*$/;

/** Question posée, explicitement ou par un mot interrogatif. */
const QUESTION_MARKERS =
  /\?|\bcomment\b|\bpourquoi\b|\bquand\b|\bou est\b|\bqui\b|\bquoi\b|\bquel(le)?s?\b|\bcombien\b|\best ce que\b|\bc est quoi\b|\bça veut dire\b|\bca veut dire\b/;

/** Besoin formulé à la première personne, ou demande adressée au bot. */
const NEED_MARKERS =
  /\bje (veux|voudrais|souhaite|aimerais|cherche|dois|peux pas|n arrive pas|arrive pas|comprends pas|sais pas|demande|voulais)\b|\bj ai (besoin|un probleme|une question|pas)\b|\bil me faut\b|\baide moi\b|\bpeux tu\b|\bpouvez vous\b|\bdis moi\b|\bexplique\b|\bmerci de\b|\bsvp\b|\bs il (te|vous) plait\b/;

/** Panne, blocage : ça mérite toujours une réponse. */
const TROUBLE_MARKERS =
  /\b(probleme|souci|bug|erreur|bloque|bloquee|marche pas|fonctionne pas|impossible|refuse|perdu|oublie|plante|introuvable)\b/;

/** Vocabulaire du site : même sans verbe, le sujet est sérieux. */
const TOPIC_MARKERS =
  /\b(licence|licences|cat ?[1-5]|atc|ifsa|siavi|qcm|aeroschool|formation|training|instruction|instructeur|examen|compte|mot de passe|identifiant|site|vol|vols|logbook|heures|compagnie|recrutement|partenariat|ground|crew|felitz|virement|solde|notam|passkey|discord link)\b/;

/**
 * Message court sans aucun marqueur de demande = bavardage. Au-delà de
 * `MAX_CHATTER_CHARS` on répond toujours : un long message est rarement une
 * blague, et se taire à tort coûte plus cher que répondre à tort.
 */
const MAX_CHATTER_CHARS = 140;

export function looksLikeRequest(text: string): boolean {
  const t = normalize(text);
  if (!t) return false;
  if (PRESENCE_CHECK.test(t)) return false;
  if (t.length > MAX_CHATTER_CHARS) return true;
  return (
    QUESTION_MARKERS.test(t) ||
    NEED_MARKERS.test(t) ||
    TROUBLE_MARKERS.test(t) ||
    TOPIC_MARKERS.test(t)
  );
}

/** Rires, réactions, remerciements secs, commentaires entre membres. */
export function isChatter(text: string): boolean {
  return !looksLikeRequest(text);
}
