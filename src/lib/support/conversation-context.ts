import type { TicketTurn } from '@/lib/support/ticket-memory';

function normalize(text: string): string {
  return text.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/[’']/g, ' ').replace(/\s+/g, ' ').trim();
}

const SUBJECT = /\b(atc|controleur|ground|personnel de piste|bagages|repoussage|siavi|siaiv|pompier|ifsa|cat\s?[1-5]|licence|qcm|aeroschool|plans? de vol|copilote|inventaire|marketplace|notams?|calendrier|compagnie|felitz|virement|connexion|connecter|mot de passe|passkey|identifiant)\b/;
const FOLLOW_UP = /^(et (apres|ensuite|pour ca)|ensuite|pourquoi|comment|ou|combien|ca|cela|oui|non|toujours pas|pareil|c est fait|je l ai fait|j ai deja|je ne trouve pas|je trouve pas|je ne vois pas|je vois pas)\b/;
const CHANGE_TOPIC = /\b(autre (question|sujet|probleme)|changeons de sujet|maintenant je veux)\b/;

function needsAnchor(text: string): boolean {
  const t = normalize(text);
  if (CHANGE_TOPIC.test(t) || SUBJECT.test(t)) return false;
  return FOLLOW_UP.test(t) || t.split(' ').length <= 5;
}

/** Une relance reprend le dernier sujet du membre, jamais une supposition du bot. */
export function supportTopic(
  current: string,
  turns: TicketTurn[],
  ticket: { motif?: string | null; reason_text?: string | null },
): string {
  if (!needsAnchor(current)) return current;
  const anchor = turns.slice(-12).reverse().find((turn) =>
    turn.role === 'user' && !needsAnchor(turn.content));
  const previous = anchor?.content || ticket.reason_text || ticket.motif || '';
  return `${previous.slice(0, 800)}\n${current}`.trim();
}

/** « Oui », « sur mobile », « 403 » répondent à un diagnostic ; « merci/MDR » restent silencieux. */
export function isAnswerToBotQuestion(current: string, turns: TicketTurn[]): boolean {
  const previous = turns.at(-1);
  if (previous?.role !== 'assistant' || !previous.content.includes('?')) return false;
  const t = normalize(current).replace(/[.!?]+$/g, '').trim();
  if (!t || t.length > 240) return false;
  if (/^(merci|mrc|mdr|lol|xd|ok|okay|salut|bonjour|super|parfait)(\s|$)/.test(t)) return false;
  return true;
}

export function stripStaffMarker(text: string): string {
  return text.replace(/\[\[\s*STAFF\s*\]\]/gi, '').replace(/\n{3,}/g, '\n\n').trim();
}

export function replyRequestsStaff(text: string): boolean {
  if (/\[\[\s*STAFF\s*\]\]/i.test(text)) return true;
  // Compatibilité avec les anciennes réponses ; une éventualité ne vaut pas un transfert.
  return text.split(/(?<=[.!?])\s+|\n/).some((sentence) => {
    const t = normalize(sentence);
    if (/\b(si|s il|s ils|sinon|au cas ou|pourrait|pourrais)\b/.test(t)) return false;
    return /\b(?:j appelle|je contacte|je passe la main a|je transmets (?:au|a un|a une))\b.{0,35}\b(staff|admin|administrateur|instructeur|equipe)\b|\bun staff (va|sera) (etre )?(appele|contacte|prevenu)/.test(t);
  });
}
