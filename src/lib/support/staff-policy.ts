import { isGroundCrewTopic, isSiaviTopic, isTrainingRequest } from '@/lib/support/motifs';

function normalize(text: string): string {
  return text.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/[’']/g, ' ').replace(/<@[!&]?\d+>/g, '').replace(/\s+/g, ' ').trim();
}

/** Une demande actuelle, pas une question sur le rôle, une citation ou une hypothèse. */
export function explicitlyRequestsStaff(text: string): boolean {
  const t = normalize(text.replace(/«[^»]*»|"[^"]*"|`[^`]*`/g, ''));
  return t.split(/[.!?;\n]/).some((part) => {
    if (/^(?:mais )?je (?:ne )?(?:veux|souhaite) (?:plus|pas) (?:parler|discuter) (?:a|avec) (?:un |le |ce )?(?:bot|bote|robot|ia)\b/.test(part.trim())) return true;
    // Le refus du robot n'est pas un refus d'aide humaine (tickets 9kpt/u801).
    // Retirer seulement cette comparaison, sans effacer « pas de staff ».
    part = part.replace(/\b(?:et |mais )?(?:pas|plutot qu[e]?) (?:avec |a |a un |un |une |le |la )*(?:bot|bote|robot|ia)\b/g, '').trim();
    if (/\b(pas|jamais|sans|si|quand|comment|pourquoi|devenir|deja|hier|exemple|citation)\b/.test(part)) return false;
    const person = '(?:un |une |le |la |l |les |des |au |aux |a un |a une |a l )?(?:staff|admin(?:istrateur)?s?|moderateur|humain|instructeur|responsable|personne humaine)';
    return new RegExp(`\\b(?:ap{1,2}el{1,2}(?:e|ez|er)|contacte|contactez|contacter|ping|previens|prevenez|passe la main a)\\s+(?:moi )?${person}\\b`).test(part) ||
      new RegExp(`\\b(?:je (?:veux|voudrais|souhaite|prefere|demande)|j aimerais|j ai besoin d[e]?)\\s+(?:(?:parler|discuter) (?:a|avec) )?${person}\\b`).test(part) ||
      new RegExp(`\\b(?:possible|possibilite|puis je|peux je|pourrais je)\\s+(?:de )?(?:parler|discuter) (?:a|avec) ${person}\\b`).test(part) ||
      new RegExp(`^(?:parler|discuter) (?:a|avec) ${person}\\s*(?:svp|stp|s il te plait|s il vous plait)?$`).test(part);
  });
}

/** Expliquer un virement reste du support ; corriger un débit requiert une décision humaine. */
export function memberNeedsStaff(text: string): boolean {
  const t = normalize(text);
  if (explicitlyRequestsStaff(text)) return true;
  return /\b(rembours|annul|corrig|contest)[a-z]*\b.{0,55}\b(virement|debit|paiement|solde|sanction)\b/.test(t) ||
    /\b(virement|paiement|debit)\b.{0,45}\b(double|doublon|non autorise|inconnu)\b/.test(t) ||
    /\b(solde|mot de passe|compte|sanctions?) d un autre\b/.test(t) ||
    /\b(supprim|chang|modifi)[a-z]*\b.{0,45}\b(identifiant|grade|licence|sanction)\b/.test(t);
}

export function needsInstructorHandoff(text: string): boolean {
  const t = normalize(text);
  if (isGroundCrewTopic(t) || isSiaviTopic(t)) return false;
  if (/\b(comment|pourquoi|qu est ce|c est quoi|difference|pas|jamais)\b/.test(t)) return false;
  return isTrainingRequest(t) || (explicitlyRequestsStaff(t) && /\binstructeur\b/.test(t));
}

/** Une simple relance ne supprime pas un appel humain encore en attente. */
export function staffHandoffPending(ticket: { statut?: string | null; staff_pinged_at?: string | null }, resumed: boolean): boolean {
  return !resumed && (ticket.statut === 'staff_needed' || Boolean(ticket.staff_pinged_at));
}
