import type { TicketTurn } from '@/lib/support/ticket-memory';
import { OFFICIAL_SITE_URL } from '@/lib/site-url';

export { OFFICIAL_SITE_URL } from '@/lib/site-url';

export const CLARIFICATION_ONBOARDING =
  'Choisis simplement ce qui correspond le mieux :\n' +
  '1. **Compte / connexion** — mot de passe, code e-mail ou passkey\n' +
  '2. **Pilote / plan de vol** — logbook, dépôt ou suivi\n' +
  '3. **ATC / formation** — accès, grade, training ou examen\n' +
  '4. **Autre** — décris le bouton ou la page où tu bloques';

const CLARIFICATION_NOTE = /^clarification_failures=(\d+)$/;

function normalize(text: string): string {
  return String(text || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[’'`]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Un ping IFSA ne peut jamais être déclenché par le seul texte du modèle. */
export function isIfsaSubject(text: string): boolean {
  const t = normalize(text);
  return (
    /\bifsa\b|\binternational flight safety authority\b/.test(t) ||
    /\b(?:entrer|rejoindre|candidater|postuler|candidature)\b.{0,35}\b(?:autorite|surete aerienne)\b/.test(t) ||
    /\b(?:contacter|appeler|signaler|signalement)\b.{0,35}\b(?:agent|autorite) de (?:surete|securite) aerienne\b/.test(t)
  );
}

export function shouldHonorIfsaPing(currentMessage: string, ticketTopic: string): boolean {
  return isIfsaSubject(currentMessage) || isIfsaSubject(ticketTopic);
}

/** Les deux flux d'authentification ont des procédures distinctes et autoritaires. */
export function authoritativeSupportReply(message: string): string | null {
  const t = normalize(message);
  if (/\bmot de passe\b.{0,20}\b(?:oublie|perdu)\b|\b(?:oublie|perdu)\b.{0,20}\bmot de passe\b/.test(t)) {
    return (
      'Sur la page de connexion, ouvre **Mot de passe oublié**, puis saisis ton identifiant ou ton e-mail. ' +
      'Le site envoie un e-mail contenant un **lien** `/login?reset=TOKEN`, valable **24 h** : ce flux n’utilise jamais de code à 6 chiffres.'
    );
  }
  if (
    /\b(?:ne )?recois pas\b.{0,45}\b(?:code|e ?mail|mail)\b|\b(?:code|e ?mail|mail)\b.{0,45}\b(?:pas recu|ne recois pas|recois pas)\b/.test(
      t,
    )
  ) {
    return (
      'Le code à 6 chiffres concerne la vérification de connexion. Vérifie l’adresse e-mail du compte et les indésirables, puis demande un nouvel envoi depuis l’écran de connexion ; s’il n’arrive toujours pas, je passe la main à un staff.'
    );
  }
  if (
    /\b(?:quel|quelle)\b.{0,15}\b(?:site|url|adresse)\b|\b(?:site|url|adresse) officiel(?:le)?\b|\bdonne moi (?:le )?(?:site|l url|adresse)\b/.test(
      t,
    )
  ) {
    return `Le seul site officiel est ${OFFICIAL_SITE_URL}`;
  }
  return null;
}

/** Canonicalise les anciennes/fausses variantes qui pourraient encore sortir du modèle. */
export function sanitizeOfficialSiteUrl(reply: string): string {
  return reply
    .replace(/https?:\/\/(?:www\.)?ptfs\.logbook\/?/gi, OFFICIAL_SITE_URL)
    .replace(/\b(?:www\.)?ptfs\.logbook\b/gi, OFFICIAL_SITE_URL.replace(/\/$/, ''))
    .replace(/https?:\/\/www\.mixouairlinesptfsweblogbook\.com\/?/gi, OFFICIAL_SITE_URL);
}

export function isVagueClarificationAnswer(message: string): boolean {
  const t = normalize(message).replace(/[.!?]+$/g, '').trim();
  return /^(tout|tous|toute|toutes|je (?:ne )?comprends (?:rien|pas)|j ai rien compris|aucune idee|je sais pas|jsp|aide moi)$/.test(
    t,
  );
}

/**
 * Compteur léger stocké dans memory_notes, sans migration. Une demande précise
 * retire immédiatement la note afin qu'un nouveau sujet reparte de zéro.
 */
export function updateClarificationMemory(
  memory: string,
  message: string,
): { memory: string; count: number; showOnboarding: boolean } {
  const lines = String(memory || '')
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean);
  const previous = lines.reduce((value, line) => {
    const match = line.match(CLARIFICATION_NOTE);
    return match ? Number(match[1]) || value : value;
  }, 0);
  const kept = lines.filter((line) => !CLARIFICATION_NOTE.test(line));
  if (!isVagueClarificationAnswer(message)) {
    return { memory: kept.join('\n'), count: 0, showOnboarding: false };
  }
  const count = Math.min(previous + 1, 2);
  kept.push(`clarification_failures=${count}`);
  return { memory: kept.join('\n'), count, showOnboarding: count >= 2 };
}

const AUTH_TOPIC =
  /\b(connexion|connecter|login|code e ?mail|code.*mail|e ?mail|passkey|mot de passe|reset|reinitialis)/;
const AUTH_FAILURE =
  /\b(ne recois pas|recois pas|pas recu|toujours pas|marche pas|fonctionne pas|impossible|bloque|expire|invalide|perdu|oublie|erreur)\b/;
const EXPLICIT_SUCCESS =
  /\b(c est bon|ca marche|cela marche|fonctionne maintenant|j ai recu|bien recu|je suis connecte|probleme resolu|c est resolu)\b/;

/** Empêche [[RESOLU]] tant qu'un incident d'authentification reste ouvert. */
export function hasUnresolvedAuthIssue(message: string, history: TicketTurn[] = []): boolean {
  const current = normalize(message);
  if (AUTH_TOPIC.test(current) && EXPLICIT_SUCCESS.test(current) && !AUTH_FAILURE.test(current)) return false;
  if (AUTH_TOPIC.test(current) && AUTH_FAILURE.test(current)) return true;

  for (let index = history.length - 1; index >= Math.max(0, history.length - 12); index -= 1) {
    const turn = history[index];
    if (turn.role !== 'user') continue;
    const text = normalize(turn.content);
    if (AUTH_TOPIC.test(text) && EXPLICIT_SUCCESS.test(text) && !AUTH_FAILURE.test(text)) return false;
    if (AUTH_TOPIC.test(text) && AUTH_FAILURE.test(text)) return true;
  }
  return false;
}
