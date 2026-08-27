import { SUPPORT_MOTIFS, type SupportMotifId } from '@/lib/support/motifs';

/**
 * Protocole voulu par le serveur : `[mention du bot] [demande]`.
 * Exemples : « @PTFR Assistance ferme le ticket », « @PTFR Assistance change le
 * nom du ticket par le pseudo de la personne qui l'a ouvert ».
 *
 * Sans mention, rien ne se déclenche : c'est la mention qui fait la commande.
 *
 * Ce fichier ne fait QUE reconnaître l'intention (aucun appel réseau) ;
 * l'exécution vit dans `mention-commands.ts` et réutilise les chemins existants
 * (`closeSupportTicket` = /ticketdel, `escalateTicketToStaff` = bouton staff…).
 * Ajouter une action = ajouter une entrée dans `MENTION_ACTIONS`.
 */

export type MentionActor = 'staff' | 'requester';

export type MentionIntent =
  | { id: 'close' }
  /** `label` vaut `OPENER_LABEL` pour « le pseudo de celui qui a ouvert ». */
  | { id: 'rename'; label: string }
  | { id: 'move'; motif: SupportMotifId }
  | { id: 'staff' }
  /** Intention reconnue mais pas assez nette : on demande confirmation. */
  | { id: 'unsure'; about: 'close' | 'rename' | 'move' };

export const OPENER_LABEL = '@ouvreur';

type ActionSpec = {
  id: MentionIntent['id'] | 'unsure';
  /** Qui a le droit de déclencher cette action. */
  allowed: MentionActor[];
  /** Reçoit le texte déjà normalisé. */
  detect: (text: string) => MentionIntent | null;
};

export function normalizeCommand(text: string): string {
  return String(text || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[’'`]/g, ' ')
    .replace(/<@[!&]?\d+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

const NEGATION = /\b(pas|jamais|sans)\b/;

// --- fermeture ---------------------------------------------------------
const CLOSE_VERB =
  /\b(ferme|fermes|fermer|fermez|cloture|cloturer|cloturez|clore|close|closed|supprime|supprimer|supprimes|delete|efface|effacer|effaces|effacez|vire|enleve|enlever|archive|archiver|ticketdel)\b/;
const CLOSE_OBJECT = /\b(ticket|salon|channel|conversation|ca|cela|tout)\b/;

// --- renommage ---------------------------------------------------------
/** « renomme » se suffit à lui-même ; « change / modifie » ont besoin d'un objet. */
const RENAME_STRONG_VERB = /\b(renomme|renommes|renommer|rename)\b/;
const RENAME_WEAK_VERB = /\b(change|changer|changes|modifie|modifier|met|mets|mettre)\b/;
const RENAME_OBJECT = /\b(nom|titre|name|appelle|appeler)\b/;
const OPENER_HINT =
  /\b(pseudo|pseudonyme|username|nom d utilisateur)\b|\b(personne|membre|joueur|gars|celui|celle)\b.{0,30}\b(ouvert|cree|creee|ouvre)\b|\b(auteur|demandeur|ouvreur)\b/;
const RENAME_VALUE = /\b(?:en|par|avec)\s+["“«]?([^"”»]{2,60})["”»]?\s*$/;

// --- déplacement -------------------------------------------------------
const MOVE_VERB = /\b(deplace|deplacer|bouge|bouger|move|change|changer|mets|met|mettre|range|ranger)\b/;
const MOVE_OBJECT = /\b(section|categorie|category|salon parent|parent)\b/;

// --- appel humain ------------------------------------------------------
const STAFF_REQUEST = /\b(staff|instructeur|humain|moderateur|admin)\b/;
const STAFF_VERB =
  /\b(appelle|appeler|appelez|call|ping|contacte|contacter|previens|prevenir|passe la main|besoin d un|veux un|voudrais un|il me faut un)\b/;

/** Au-delà, le verbe est probablement incident dans une phrase qui parle d'autre chose. */
const MAX_ACTION_CHARS = 160;

function findMotif(text: string): SupportMotifId | null {
  for (const m of SUPPORT_MOTIFS) {
    const label = normalizeCommand(m.label);
    if (text.includes(m.id) || (label.length > 3 && text.includes(label))) {
      return m.id as SupportMotifId;
    }
  }
  return null;
}

/**
 * Registre des actions. L'ordre compte : « change la section » doit être lu
 * comme un déplacement, pas comme un renommage.
 */
export const MENTION_ACTIONS: ActionSpec[] = [
  {
    id: 'move',
    allowed: ['staff'],
    detect: (t) => {
      if (!MOVE_VERB.test(t) || !MOVE_OBJECT.test(t)) return null;
      if (NEGATION.test(t)) return { id: 'unsure', about: 'move' };
      const motif = findMotif(t);
      return motif ? { id: 'move', motif } : { id: 'unsure', about: 'move' };
    },
  },
  {
    id: 'rename',
    allowed: ['staff'],
    detect: (t) => {
      const wanted = RENAME_STRONG_VERB.test(t) || (RENAME_WEAK_VERB.test(t) && RENAME_OBJECT.test(t));
      if (!wanted) return null;
      if (NEGATION.test(t)) return { id: 'unsure', about: 'rename' };
      if (OPENER_HINT.test(t)) return { id: 'rename', label: OPENER_LABEL };
      const explicit = t.match(RENAME_VALUE);
      if (explicit) return { id: 'rename', label: explicit[1].trim() };
      return { id: 'unsure', about: 'rename' };
    },
  },
  {
    id: 'close',
    allowed: ['staff', 'requester'],
    detect: (t) => {
      if (!CLOSE_VERB.test(t)) return null;
      if (NEGATION.test(t)) return { id: 'unsure', about: 'close' };
      if (t.length <= 20) return { id: 'close' };
      if (t.length <= MAX_ACTION_CHARS && CLOSE_OBJECT.test(t)) return { id: 'close' };
      return { id: 'unsure', about: 'close' };
    },
  },
  {
    id: 'staff',
    allowed: ['staff', 'requester'],
    detect: (t) => {
      if (!STAFF_REQUEST.test(t) || !STAFF_VERB.test(t)) return null;
      if (NEGATION.test(t)) return null;
      return { id: 'staff' };
    },
  },
];

/** `null` = la mention ne porte aucune commande : l'IA répond normalement. */
export function detectMentionIntent(text: string): MentionIntent | null {
  const t = normalizeCommand(text);
  if (!t) return null;
  for (const spec of MENTION_ACTIONS) {
    const hit = spec.detect(t);
    if (hit) return hit;
  }
  return null;
}

/**
 * Fermeture claire sans @mention (« efface le ticket », « ferme ça »).
 * Les autres commandes (staff, rename, move) restent derrière une mention :
 * trop de faux positifs sinon (« j’ai appelé le staff hier »).
 */
export function detectBareCloseIntent(text: string): Extract<MentionIntent, { id: 'close' }> | null {
  const t = normalizeCommand(text);
  if (!t) return null;
  const spec = MENTION_ACTIONS.find((a) => a.id === 'close');
  const hit = spec?.detect(t);
  return hit?.id === 'close' ? hit : null;
}

export function mentionActionAllowed(intent: MentionIntent, actor: MentionActor): boolean {
  const wanted = intent.id === 'unsure' ? intent.about : intent.id;
  const spec = MENTION_ACTIONS.find((a) => a.id === wanted);
  if (!spec) return true;
  return spec.allowed.includes(actor);
}
