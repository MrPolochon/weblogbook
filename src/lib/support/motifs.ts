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

export function classifyMotifFromText(text: string): SupportMotifId {
  const t = text.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  if (/\bnouveau|\bnew player|\bje (suis|commence)|debutant|débutant|bienvenue|comment (commencer|jouer|s.inscrire)/.test(t)) {
    return 'nouveau';
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
