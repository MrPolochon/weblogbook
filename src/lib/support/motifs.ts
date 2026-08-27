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

/** Mots qui ne peuvent désigner QUE le contrôle aérien, sans contexte supplémentaire. */
const ATC_STRONG_VOCAB =
  /\batc\b|\bcontroleur\b|\bcontroleuse\b|\bcontrole aerien\b|\baiguilleur\b|\btour de controle\b|\blatc\b|\bafis\b|\bp?cal-?(atc|afis)\b|\blpafis\b|\batc ?f[ie]\b/;

const TRAINING_VOCAB =
  /\btraining\b|\bformation\b|\bformer\b|\binstruction\b|\binstructeur\b|\bcours\b|\bstage\b|\bpasser (mon|ma|le|la|un|une)\b|\bapprendre\b|\bentrainement\b|\bs.entrainer\b|\bsession\b|\bexamen\b|\bqualification\b|\bdemande de (training|formation)\b/;

/**
 * Personnel de piste (bagages, repoussage, marshalling…). Le mot « ground » est
 * piégeux : il désigne aussi une position de contrôle aérien. Seul ce vocabulaire
 * de handling tranche sans ambiguïté.
 */
const GROUND_CREW_VOCAB =
  /\bground ?crew\b|\bgroundcrew\b|\bpersonnel (de piste|au sol|de piste)\b|\bagent de piste\b|\bagents de piste\b|\bhandling\b|\bmarshall?ing\b|\brepoussage\b|\bpush ?back\b|\bbagagiste\b|\bavitaillement\b|\bdegivrage\b|\bhandleur\b|\bplacement (des |d.)?avions? (a|aux) (la )?portes?\b|\bserveur ground\b/;

/** Le membre parle du handling au sol, pas du contrôle aérien. */
export function isGroundCrewTopic(text: string): boolean {
  return GROUND_CREW_VOCAB.test(normalize(text));
}

/**
 * « Je veux faire du ground » : impossible de trancher entre le handling et la
 * position de contrôle sol. Le bot doit poser UNE question avant de répondre.
 */
export function isAmbiguousGroundTopic(text: string): boolean {
  const t = normalize(text);
  if (isGroundCrewTopic(t)) return false;
  if (!/\bground\b|\bgnd\b/.test(t)) return false;
  // Un mot du contrôle aérien à côté de « ground » lève déjà le doute.
  return !/\batc\b|\bcontroleur\b|\bcontrole\b|\bcontroler\b|\btwr\b|\btower\b|\bdelivery\b|\bclairance\b|\bfrequence\b|\bradio\b|\bapproach\b|\bcenter\b|\bctr\b/.test(t);
}

/**
 * Le ticket parle de contrôle aérien, quel que soit l’angle (accès à l’espace
 * ATC, grade, position, formation). Sert à choisir la documentation injectée.
 */
export function isAtcTopic(text: string): boolean {
  const t = normalize(text);
  // « ground crew » contient « ground » sans rien avoir à voir avec le contrôle.
  if (isGroundCrewTopic(t)) return false;
  // Pompiers AFIS = SIAVI, pas le parcours contrôleur.
  if (isSiaviTopic(t)) return false;
  return ATC_STRONG_VOCAB.test(t) || ATC_POSITION_VOCAB.test(t);
}

/** Pompiers / sauvetage — pas le logbook pilote. */
export function isSiaviTopic(text: string): boolean {
  return /\bsiavi\b|\bsiaiv\b|\bpompiers?\b|\bincendie\b|\bsauvetage\b|\bfire ?rescue\b|\binformation en vol\b/.test(
    normalize(text),
  );
}

/** Candidature pompier / SIAVI : formation staff, pas la doc ATC. */
export function isSiaviRecruitmentTopic(text: string): boolean {
  const t = normalize(text);
  if (!isSiaviTopic(t)) return false;
  return (
    BECOME_VOCAB.test(t) ||
    /\b(postul|candidat|recrut|rejoindre|entrer|integrer|former|formation)\b/.test(t)
  );
}

/** « Comment devenir contrôleur ? » — une demande de parcours sans le mot « training ». */
const BECOME_VOCAB = /\bdevenir\b|\bdevient\b|\bdeviens\b|\bje veux etre\b|\bcomment (etre|faire pour|on fait)\b|\bpour etre\b/;

/**
 * « Je veux passer mon training Approach », « je demande un training center » :
 * formation / position de CONTRÔLE, jamais une licence CAT pilote.
 */
export function isAtcTrainingTopic(text: string): boolean {
  const t = normalize(text);
  if (isGroundCrewTopic(t)) return false;
  if (isSiaviTopic(t)) return false;
  if (!ATC_VOCAB.test(t)) return false;
  if (TRAINING_VOCAB.test(t)) return true;
  if (ATC_STRONG_VOCAB.test(t) && BECOME_VOCAB.test(t)) return true;
  return ATC_POSITION_VOCAB.test(t);
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
  // La commande s'appelle /register. « webregister » n'est reconnu que parce que
  // des membres l'écrivent ainsi : l'IA, elle, ne doit jamais proposer ce nom.
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
  // Handling : candidature sur le serveur entreprises, pas d’instructeur ATC.
  if (isGroundCrewTopic(t)) return 'assistance';
  // Pompiers SIAVI : formation staff, pas le motif instruction ATC.
  if (isSiaviTopic(t)) return 'assistance';
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
