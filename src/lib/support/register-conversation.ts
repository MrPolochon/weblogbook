import { normalizeIdentifiant } from '@/lib/auth/create-discord-account';

export type RegisterStep = 'idle' | 'identifiant' | 'password';

const STEP_LINE = /^register_step=(identifiant|password)$/;
const ID_LINE = /^register_identifiant=([a-z0-9_]{2,30})$/;

const CANCEL =
  /^(annule|annuler|stop|laisse tomber|oublie|oublie ca|finalement non|j annule|je change d avis)$/i;

const RESERVED = new Set([
  'tout',
  'tous',
  'oui',
  'non',
  'ok',
  'merci',
  'compte',
  'register',
  'identifiant',
  'password',
  'mdp',
  'aide',
  'staff',
]);

export const REGISTER_ASK_IDENTIFIANT =
  'Pour créer ton compte, j’ai besoin de deux infos. Envoie d’abord **l’identifiant** que tu veux (2 à 30 caractères : lettres, chiffres ou `_`).';

export const REGISTER_ASK_PASSWORD =
  'Identifiant noté. Envoie maintenant **uniquement le mot de passe** (8 caractères minimum).\n' +
  'Les staffs de ce ticket peuvent le voir : tu pourras le changer ensuite dans Mon compte. Tu peux aussi utiliser `/register` (formulaire privé) si tu préfères.';

export const REGISTER_CANCELLED = 'D’accord, j’annule la création de compte. Dis-moi si tu veux réessayer plus tard.';

export function readRegisterState(memory: string): { step: RegisterStep; identifiant: string | null } {
  const lines = String(memory || '')
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean);
  let step: RegisterStep = 'idle';
  let identifiant: string | null = null;
  for (const line of lines) {
    const stepMatch = line.match(STEP_LINE);
    if (stepMatch) step = stepMatch[1] as RegisterStep;
    const idMatch = line.match(ID_LINE);
    if (idMatch) identifiant = idMatch[1];
  }
  return { step, identifiant };
}

export function writeRegisterState(memory: string, step: RegisterStep, identifiant?: string | null): string {
  const kept = String(memory || '')
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line && !STEP_LINE.test(line) && !ID_LINE.test(line));
  if (step !== 'idle') kept.push(`register_step=${step}`);
  if (step !== 'idle' && identifiant) kept.push(`register_identifiant=${identifiant}`);
  return kept.join('\n');
}

export function isRegisterCancel(text: string): boolean {
  return CANCEL.test(normalizeLoose(text));
}

export function wantsAccountCreation(text: string, alreadyInFlow: boolean): boolean {
  if (alreadyInFlow) return true;
  const t = normalizeLoose(text);
  if (/\bwebregister\b|\/register\b/.test(t)) return true;
  if (/\b(creer|cree|creation|ouvrir|avoir|faire)\b.{0,20}\bcompte\b/.test(t)) return true;
  if (/\b(m|s)['. ]?inscrire\b|\binscription\b/.test(t)) return true;
  if (/\b(je n.ai|j.ai) pas (encore )?(de |un )?compte\b|\bpas de compte\b/.test(t)) return true;
  if (/^1\b/.test(t) && /\bcompte\b|\bconnexion\b/.test(t)) return true;
  return false;
}

export function extractRegisterIdentifiant(text: string): string | null {
  const labeled = text.match(/(?:identifiant|pseudo|username|login)\s*[:\s]+([A-Za-z0-9_]{2,30})/i);
  if (labeled) return acceptIdentifiant(labeled[1]);
  const compact = normalizeLoose(text).replace(/['’]/g, '');
  if (!/\s/.test(compact)) return acceptIdentifiant(compact);
  return null;
}

export function extractRegisterPassword(text: string): string | null {
  const labeled = text.match(/(?:mot de passe|password|mdp)\s*[:\s]+(\S{8,72})/i);
  if (labeled) return labeled[1];
  const trimmed = text.trim();
  if (/\n/.test(trimmed) || /\s{2,}/.test(trimmed)) return null;
  if (/\s/.test(trimmed) && trimmed.split(/\s+/).length > 3) return null;
  if (/\?$/.test(trimmed) || /^(comment|pourquoi|c est quoi|peux tu)/i.test(trimmed)) return null;
  if (trimmed.length < 8 || trimmed.length > 72) return null;
  if (RESERVED.has(normalizeLoose(trimmed))) return null;
  return trimmed;
}

export function extractRegisterPair(text: string): { identifiant: string | null; password: string | null } {
  return {
    identifiant: extractRegisterIdentifiant(text),
    password: extractRegisterPassword(text),
  };
}

function acceptIdentifiant(raw: string): string | null {
  const id = normalizeIdentifiant(raw);
  if (id.length < 2 || id.length > 30) return null;
  if (RESERVED.has(id)) return null;
  return id;
}

function normalizeLoose(text: string): string {
  return String(text || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[’'`]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}
