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
 * Nombre de messages du membre avant lequel on ne propose jamais de fermer : sur
 * les tout premiers échanges, la demande vient à peine d'être exposée.
 */
const MIN_MEMBER_MESSAGES_BEFORE_OFFER = 3;

/**
 * Une réponse qui renvoie vers quelqu'un d'autre ou vers une étape à accomplir
 * plus tard ne peut pas être « réglée » à la seconde où elle est envoyée.
 */
const PENDING_STEP_PATTERNS =
  /\b(staff|instructeur|examinateur|une fois (que |validee?|valide|termine|confirme)|des que|apres (validation|avoir|que)|il faudra|tu devras|tu pourras|il ne reste|en attendant|reviens (me |vers )|previens[- ]moi|tiens[- ]moi au courant|tape la commande|passe le (test|questionnaire|qcm)|remplis le formulaire)\b/;

export interface ResolutionOfferContext {
  /** Le ticket part déjà au staff : on ne propose évidemment pas de fermer. */
  escalate: boolean;
  /** Messages du membre dans ce ticket, celui en cours compris. */
  memberMessages: number;
  /** Le dernier message du membre est une question. */
  memberAsked: boolean;
  /** Une proposition de clôture a déjà été faite dans ce ticket. */
  alreadyOffered: boolean;
}

export function replyLeavesStepPending(reply: string): boolean {
  return PENDING_STEP_PATTERNS.test(normalizeAnswer(reply));
}

/**
 * Seul le marqueur machine peut déclencher la proposition, et encore : elle est
 * refusée tant que la conversation montre qu'elle est en cours. Le membre s'était
 * plaint de la voir arriver à chaque message ; l'objectif est qu'elle soit rare.
 */
export function shouldOfferResolution(rawReply: string, ctx: ResolutionOfferContext): boolean {
  if (ctx.escalate) return false;
  if (!hasResoluMarker(rawReply)) return false;
  // Les premiers échanges servent à comprendre la demande, pas à la clore.
  if (ctx.memberMessages < MIN_MEMBER_MESSAGES_BEFORE_OFFER) return false;
  // La réponse vient de donner une étape à faire ou renvoie au staff.
  if (replyLeavesStepPending(rawReply)) return false;
  // Le membre a enchaîné sur une nouvelle question après une première
  // proposition : c'est le signal le plus net que rien n'est réglé.
  if (ctx.alreadyOffered && ctx.memberAsked) return false;
  return true;
}

/**
 * Ancienne porte d'entrée, conservée le temps que l'appelant bascule sur
 * `shouldOfferResolution` : elle ignore le contexte de la conversation.
 */
export function iaOffersResolution(rawReply: string, escalate: boolean): boolean {
  if (escalate) return false;
  return hasResoluMarker(rawReply) && !replyLeavesStepPending(rawReply);
}

/** Question du membre : point d'interrogation ou tournure interrogative. */
export function messageIsQuestion(text: string): boolean {
  if (text.includes('?')) return true;
  return /^\s*(comment|pourquoi|quand|ou\b|qui\b|quoi|quel|quelle|est-ce|c.est quoi|combien|peux-tu|peut-on|je fais comment)/i.test(
    normalizeAnswer(text),
  );
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
