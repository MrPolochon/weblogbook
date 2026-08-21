/** Boutons persistants d’un ticket (custom_id inchangés — handlers Python + HTTP). */
export const TICKET_ACTION_COMPONENTS = [
  {
    type: 1,
    components: [
      { type: 2, style: 3, custom_id: 'support_resolved', label: "C'est résolu" },
      { type: 2, style: 4, custom_id: 'support_need_staff', label: 'Pas résolu — staff' },
      { type: 2, style: 2, custom_id: 'support_staff_close', label: 'Fermer (staff)' },
    ],
  },
];

export const RESOLU_MARKER = '[[RESOLU]]';

const RESOLUTION_NOTE = 'resolution_offered=1';

export function hasResoluMarker(text: string): boolean {
  return /\[\[\s*RESOLU\s*\]\]/i.test(text);
}

export function stripResoluMarker(text: string): string {
  return text
    .replace(/^\s*\[\[\s*RESOLU\s*\]\]\s*$/gim, '')
    .replace(/\s*\[\[\s*RESOLU\s*\]\]\s*/gi, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

/**
 * Seul le marqueur machine décide. L'IA ne doit plus poser la question en toutes
 * lettres : c'est le système qui la pose, et toujours avec les boutons.
 */
export function iaOffersResolution(rawReply: string, escalate: boolean): boolean {
  if (escalate) return false;
  return hasResoluMarker(rawReply);
}

/** Retire une question « c'est résolu ? » écrite par le modèle malgré la consigne. */
export function stripResolutionQuestion(text: string): string {
  return text
    .split('\n')
    .map((line) =>
      line
        .replace(
          /\s*(?:est-ce que\s+)?(?:c[’'`\s]?\s*est|tout est|le (?:probl[eè]me|souci) est)\s+(?:bien\s+)?r[ée]solu\s*\?/gi,
          '',
        )
        .replace(/\s*(?:dis-moi si|n[’'`]h[ée]site pas [aà] me dire si)[^.!?\n]*r[ée]solu[^.!?\n]*[.!?]?/gi, '')
        .trimEnd(),
    )
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

const RESOLUTION_BLOCKERS =
  /\bmais\b|\bcependant\b|\bpar contre\b|\btoutefois\b|\bsauf\b|\bencore\b|\bautre\b|\bjuste\b|\bpourquoi\b|\bcomment\b/;

/** Mots qui, seuls, valent « oui c'est bon ». */
const AFFIRMATIVE_CORE = new Set([
  'oui', 'ouais', 'ouaip', 'ouep', 'yep', 'yes', 'ok', 'oki', 'okay', 'okey',
  'resolu', 'resolue', 'regle', 'reglee', 'nickel', 'parfait', 'impec', 'impeccable',
  'genial', 'top', 'super', 'marche', 'fonctionne', 'roule', 'daccord', 'bon', 'bien',
]);

/** Mots de liaison ou de politesse tolérés autour d'une affirmation. */
const AFFIRMATIVE_FILLER = new Set([
  'c', 'cest', 'est', 'ca', 'sa', 'tout', 'le', 'la', 'les', 'ce', 'probleme', 'souci',
  'plus', 'besoin', 'aide', 'merci', 'mrc', 'beaucoup', 'bcp', 'thanks', 'ty', 'voila',
  'du', 'coup', 'maintenant', 'et', 'a', 'toi', 'vous', 'bonne', 'journee', 'soiree',
  'je', 'te', 'remercie', 'rien', 'de', 'pour',
]);

const NEGATIVE_RESOLUTION =
  /\bnon\b|\bnope\b|\bpas (?:vraiment |encore |du tout )?(?:resolu|regle|bon|ok)\b|\btoujours pas\b|\bmarche pas\b|\bfonctionne pas\b|\bca marche toujours pas\b|\bpas resolu\b/;

function normalizeAnswer(text: string): string {
  return text
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[’'`]/g, '')
    .trim();
}

/** Réponse négative à la proposition de clôture — le staff prend la main. */
export function isNegativeResolutionAnswer(text: string): boolean {
  const t = normalizeAnswer(text);
  if (t.length > 200) return false;
  return NEGATIVE_RESOLUTION.test(t);
}

/**
 * Réponse affirmative *nette* à la proposition de clôture. Volontairement strict :
 * « oui mais j'ai encore un souci » ne doit surtout pas fermer le ticket.
 */
export function isAffirmativeResolutionAnswer(text: string): boolean {
  const t = normalizeAnswer(text);
  if (!t || t.length > 80) return false;
  if (t.includes('?')) return false;
  if (RESOLUTION_BLOCKERS.test(t)) return false;
  if (NEGATIVE_RESOLUTION.test(t)) return false;

  const tokens = t.split(/[^a-z0-9]+/).filter(Boolean);
  if (tokens.length === 0 || tokens.length > 8) return false;
  if (!tokens.every((w) => AFFIRMATIVE_CORE.has(w) || AFFIRMATIVE_FILLER.has(w))) return false;
  return tokens.some((w) => AFFIRMATIVE_CORE.has(w));
}

export function ticketAlreadyOfferedResolution(ticket: {
  resolution_offered?: boolean | null;
  memory_notes?: string | null;
}): boolean {
  if (ticket.resolution_offered === true) return true;
  return (ticket.memory_notes || '')
    .split('\n')
    .some((l) => l.trim() === RESOLUTION_NOTE);
}

export function withResolutionOfferedNote(memory: string, offered: boolean): string {
  const lines = (memory || '')
    .split('\n')
    .map((l) => l.trim())
    .filter((l) => l && l !== RESOLUTION_NOTE);
  if (offered) lines.push(RESOLUTION_NOTE);
  return lines.join('\n');
}

export const RESOLUTION_PANEL_TEXT =
  "C’est réglé pour toi ? Réponds **oui** (ou clique **C'est résolu**) et je ferme le ticket. " +
  "Sinon réponds **non** ou clique **Pas résolu — staff** (Fermer = staff uniquement).";
