export const SUPPORT_MOTIFS = [
  { id: 'cat1', label: 'Licence CAT 1' },
  { id: 'cat2', label: 'Licence CAT 2' },
  { id: 'cat3', label: 'Licence CAT 3' },
  { id: 'cat4', label: 'Licence CAT 4' },
  { id: 'cat5', label: 'Licence CAT 5' },
  { id: 'recrutement', label: 'Recrutement en compagnie' },
  { id: 'nouveau', label: 'Nouveau joueur' },
  { id: 'assistance', label: 'Assistance générale' },
  { id: 'partenariat', label: 'Partenariat' },
  { id: 'instruction', label: 'Instruction' },
  { id: 'aeroschool', label: 'AeroSchool' },
] as const;

export type SupportMotifId = (typeof SUPPORT_MOTIFS)[number]['id'];

export const DEFAULT_INSTRUCTOR_MOTIFS: SupportMotifId[] = [
  'cat1',
  'cat2',
  'cat3',
  'cat4',
  'cat5',
  'instruction',
  'aeroschool',
];

export function motifUsesInstructor(motif: string, selected?: string[] | null): boolean {
  const list = selected && selected.length > 0 ? selected : DEFAULT_INSTRUCTOR_MOTIFS;
  return list.includes(motif as SupportMotifId);
}

export const SUPPORT_STATUSES = {
  ia: { emoji: '🤖', label: "Géré par l'IA" },
  staff_needed: { emoji: '🔴', label: 'Requiert un staff' },
  waiting: { emoji: '🟠', label: 'En attente de réponse' },
  staff: { emoji: '🟢', label: 'Géré par un staff' },
} as const;

export type SupportStatus = keyof typeof SUPPORT_STATUSES;

export function ticketChannelName(status: SupportStatus, shortId: string): string {
  return `${SUPPORT_STATUSES[status].emoji}-${shortId}`.slice(0, 100);
}

function normalize(text: string): string {
  return text.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
}

/**
 * Vocabulaire du contrôle aérien. « center » / « approach » ne sont retenus que
 * collés au contexte ATC (position, training, contrôle) — voir isAtcTrainingTopic.
 */
const ATC_VOCAB =
  /\batc\b|\bcontroleur\b|\bcontrole aerien\b|\baiguilleur\b|\btour de controle\b|\btwr\b|\btower\b|\bground\b|\bgnd\b|\bdelivery\b|\bclairance\b|\bdel\b|\bapproach\b|\bapproche\b|\bapp\b|\bdeparture\b|\bdep\b|\bcenter\b|\bcentre\b|\bctr\b|\blatc\b|\bafis\b|\bp?cal-?(atc|afis)\b|\blpafis\b|\batc ?f[ie]\b/;

/** Positions de contrôle : suffisent à lever l’ambiguïté même sans le mot « ATC ». */
const ATC_POSITION_VOCAB =
  /\btwr\b|\btower\b|\bground\b|\bgnd\b|\bdelivery\b|\bclairance\b|\bapproach\b|\bapproche\b|\bapp\b|\bctr\b|\bcenter\b|\blatc\b|\bafis\b/;

const TRAINING_VOCAB =
  /\btraining\b|\bformation\b|\bformer\b|\binstruction\b|\binstructeur\b|\bcours\b|\bstage\b|\bpasser (mon|ma|le|la|un|une)\b|\bapprendre\b|\bentrainement\b|\bs.entrainer\b|\bsession\b|\bexamen\b|\bqualification\b|\bdemande de (training|formation)\b/;

/**
 * « Je veux passer mon training Approach », « je demande un training center » :
 * formation / position de CONTRÔLE, jamais une licence CAT pilote.
 */
export function isAtcTrainingTopic(text: string): boolean {
  const t = normalize(text);
  if (!ATC_VOCAB.test(t)) return false;
  if (!TRAINING_VOCAB.test(t)) return ATC_POSITION_VOCAB.test(t);
  return true;
}

/**
 * Le membre demande explicitement une séance de formation / d’examen pratique.
 * Aucun bot ne peut poser le créneau : c’est un instructeur qui le fait.
 */
export function isTrainingRequest(text: string): boolean {
  const t = normalize(text);
  if (!/\btraining\b|\bformation\b|\binstruction\b|\bcours\b|\bexamen pratique\b|\bsession\b/.test(t)) {
    return false;
  }
  return /\bje (veux|voudrais|souhaite|demande|aimerais|cherche)\b|\bdemande de\b|\bpasser (mon|ma|le|la|un|une)\b|\b(faire|obtenir|reserver|planifier|prendre|commencer) (mon|ma|le|la|un|une)\b|\bpossible d.avoir\b/.test(
    t,
  );
}

/**
 * Création du compte site : elle passe par la commande Discord du bot ATIS, pas
 * par une page. Le sujet est routé vers « nouveau », le motif d’accueil.
 */
export function isAccountCreationTopic(text: string): boolean {
  const t = normalize(text);
  if (/\bwebregister\b|\/register\b/.test(t)) return true;
  if (/\b(creer|cree|creation|ouvrir|avoir|faire)\b.{0,20}\bcompte\b/.test(t)) return true;
  if (/\b(m|s)['. ]?inscrire\b|\binscription\b/.test(t)) return true;
  if (/\b(je n.ai|j.ai) pas (encore )?(de |un )?compte\b|\bpas de compte\b/.test(t)) return true;
  return false;
}

export function classifyMotifFromText(text: string): SupportMotifId {
  const t = normalize(text);
  if (isAccountCreationTopic(t)) return 'nouveau';
  if (/\bnouveau|\bnew player|\bje (suis|commence)|debutant|débutant|bienvenue|comment (commencer|jouer|s.inscrire)/.test(t)) {
    return 'nouveau';
  }
  // Avant AeroSchool / CAT : un training ATC part chez les instructeurs, pas sur
  // le parcours CAT pilote. Un QCM ATC explicite reste un sujet AeroSchool.
  if (isAtcTrainingTopic(t) && !/\bqcm\b|\bquestionnaire\b|\bformulaire\b/.test(t)) {
    return 'instruction';
  }
  if (/aeroschool|qcm|questionnaire|examen (theorique|théorique)|corriger (le |mon )?test/.test(t)) {
    return 'aeroschool';
  }
  if (/instruction|instructeur|formateur|fi\b|fe\b|training|examen pratique/.test(t)) {
    return 'instruction';
  }
  if (/recrut|embauche|rejoindre (une )?compagnie|candidature/.test(t)) {
    return 'recrutement';
  }
  if (/partenariat|sponsor|collaboration|partenaire/.test(t)) {
    return 'partenariat';
  }
  const cat = t.match(/\bcat(?:egorie)?\s*([1-5])\b/) || t.match(/\blicence\s*cat\s*([1-5])\b/);
  if (cat) return `cat${cat[1]}` as SupportMotifId;
  return 'assistance';
}
