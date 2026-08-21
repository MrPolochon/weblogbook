/**
 * Mise en forme finale d’une réponse IA avant envoi Discord.
 *
 * Le modèle peut s’arrêter net (`finish_reason === 'length'`) ou dépasser la
 * longueur qu’on s’autorise : dans les deux cas la réponse ne doit jamais partir
 * coupée au milieu d’un mot ou d’une phrase (« - a la f », « ta progres »).
 */

/** Discord accepte 2000 caractères ; on garde de la marge pour le ping staff. */
export const MAX_REPLY_CHARS = 1400;

const SENTENCE_END = /[.!?…](?:\s|$)/g;
/** Fins de ligne acceptables : ponctuation forte, guillemet ou parenthèse fermante. */
const COMPLETE_LINE_END = /[.!?…»"')\]]$/;

function lastSentenceEnd(text: string): number {
  let end = -1;
  SENTENCE_END.lastIndex = 0;
  let m: RegExpExecArray | null;
  while ((m = SENTENCE_END.exec(text)) !== null) {
    end = m.index + 1;
  }
  return end;
}

/** Coupe proprement : dernière phrase complète, sinon dernière ligne, sinon dernier mot. */
export function trimToLastSentence(text: string): string {
  const t = text.trimEnd();
  const sentence = lastSentenceEnd(t);
  if (sentence > t.length * 0.4) return t.slice(0, sentence).trimEnd();

  const line = t.lastIndexOf('\n');
  if (line > t.length * 0.4) return t.slice(0, line).trimEnd();

  const word = t.lastIndexOf(' ');
  return `${(word > 0 ? t.slice(0, word) : t).trimEnd()}…`;
}

/** Réponse arrêtée par max_tokens : la dernière ligne est presque toujours le fragment. */
function dropIncompleteTail(text: string): string {
  const lines = text.split('\n');
  const last = (lines[lines.length - 1] || '').trim();
  if (!last) return lines.slice(0, -1).join('\n').trimEnd();
  if (COMPLETE_LINE_END.test(last)) return text;
  if (lines.length > 1) return lines.slice(0, -1).join('\n').trimEnd();
  return trimToLastSentence(text);
}

export function finalizeReply(raw: string, truncated: boolean): string {
  let text = raw.replace(/\r/g, '').replace(/\n{3,}/g, '\n\n').trim();
  if (!text) return text;

  if (truncated) text = dropIncompleteTail(text);
  if (text.length > MAX_REPLY_CHARS) text = trimToLastSentence(text.slice(0, MAX_REPLY_CHARS));

  return text.trim();
}
