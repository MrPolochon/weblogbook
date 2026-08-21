import type { SupabaseClient } from '@supabase/supabase-js';

/**
 * Recherche lecture seule dans le catalogue AeroSchool pour l’IA tickets.
 * `requires_auth` porte la distinction du site : false = questionnaire public,
 * jouable depuis la page de connexion sans compte ; true = questionnaire membre,
 * verrouillé tant que la personne n’est pas connectée.
 */
export interface AeroschoolFormMatch {
  id: string;
  title: string;
  requiresAuth: boolean;
}

const MAX_RESULTS = 3;

const STOPWORDS = new Set([
  'avec', 'pour', 'dans', 'mais', 'donc', 'comment', 'quand', 'quel', 'quelle', 'quels', 'quelles',
  'faire', 'fait', 'veux', 'voudrais', 'souhaite', 'peux', 'peut', 'pouvez', 'besoin', 'aide',
  'bonjour', 'salut', 'merci', 'ticket', 'site', 'svp', 'plait', 'plaît', 'chez', 'vous', 'nous',
  'suis', 'etre', 'être', 'avoir', 'passer', 'passe', 'sais', 'savoir', 'demande', 'demander',
]);

/** Synonymes du langage courant vers le vocabulaire réel des titres de formulaires. */
const ALIASES: Record<string, string[]> = {
  staff: ['staff', 'candidature', 'affectation'],
  moderation: ['staff', 'candidature'],
  moderateur: ['staff', 'candidature'],
  recrutement: ['candidature', 'recrutement'],
  postuler: ['candidature'],
  candidater: ['candidature'],
  compagnie: ['compagnie'],
  airline: ['compagnie'],
  entreprise: ['compagnie'],
  instructeur: ['instructeur'],
  formateur: ['instructeur'],
  siavi: ['siaiv'],
  enquete: ['siaiv'],
  ifsa: ['ifsa'],
  militaire: ['militaire'],
  armee: ['militaire'],
  aeronaval: ['aeronaval'],
  tour: ['tower'],
  tour_de_controle: ['tower'],
  twr: ['tower'],
  sol: ['ground'],
  ground: ['ground'],
  delivery: ['delivery'],
  del: ['delivery'],
  clairance: ['delivery'],
  atc: ['atc'],
  controleur: ['atc', 'controleur'],
  psychologique: ['psychologique'],
  psy: ['psychologique'],
  quadrimoteur: ['quadri', 'moteurs'],
  quadri: ['quadri', 'moteurs'],
  longcourrier: ['long', 'courrier'],
};

function normalize(value: string): string {
  return value
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

function tokenize(value: string): string[] {
  const base = normalize(value)
    .split(' ')
    .filter((word) => word.length >= 3 && !STOPWORDS.has(word));

  const expanded = new Set(base);
  for (const word of base) {
    for (const alias of ALIASES[word] ?? []) expanded.add(alias);
  }
  // « cat 3 », « cat3 » → le titre du site écrit « catégorie 3 » ou « [CAT 4] ».
  const catMatch = normalize(value).match(/\bcat(?:egorie)? ?([1-5])\b/);
  if (catMatch) {
    expanded.add('cat');
    expanded.add('categorie');
    expanded.add(catMatch[1]);
  }
  return [...expanded];
}

/**
 * Le message ressemble-t-il à une démarche ? Sans ce filtre, « est-ce que je peux
 * ping le staff » ramenait le formulaire de candidature staff.
 */
const PROCEDURE_INTENT =
  /\b(devenir|postul|candidat|recrut|rejoindre|entrer|integrer|creer|cree|creation|ouvrir|passer|obtenir|valider|inscri|formulaire|questionnaire|qcm|test|examen|licence|formation|qualification)/;

export function looksLikeProcedureRequest(text: string): boolean {
  return PROCEDURE_INTENT.test(normalize(text));
}

/**
 * Retrouve jusqu’à 3 questionnaires publiés correspondant à la demande.
 * Quand le membre n’a pas de compte lié, les questionnaires « membre » sont
 * écartés au profit des questionnaires publics : l’IA ne doit pas envoyer
 * quelqu’un sans compte vers une page verrouillée.
 */
export async function findAeroschoolForms(
  admin: SupabaseClient,
  text: string,
  options: { hasAccount: boolean }
): Promise<AeroschoolFormMatch[]> {
  if (!looksLikeProcedureRequest(text)) return [];
  const tokens = tokenize(text);
  if (tokens.length === 0) return [];

  const { data, error } = await admin
    .from('aeroschool_forms')
    .select('id, title, description, requires_auth')
    .eq('is_published', true);
  if (error || !data) return [];

  const scored = data
    .map((form) => {
      // Mots entiers : « sur » ne doit pas matcher « assurance ».
      const haystackTitle = ` ${normalize(String(form.title ?? ''))} `;
      const haystackDesc = ` ${normalize(String(form.description ?? ''))} `;
      let points = 0;
      for (const token of tokens) {
        if (haystackTitle.includes(` ${token} `)) points += 3;
        else if (haystackDesc.includes(` ${token} `)) points += 1;
      }
      return {
        id: String(form.id),
        title: String(form.title ?? ''),
        requiresAuth: Boolean(form.requires_auth),
        points,
      };
    })
    .filter((form) => form.points >= 3)
    .sort((a, b) => b.points - a.points || a.title.localeCompare(b.title));

  const usable = options.hasAccount ? scored : scored.filter((form) => !form.requiresAuth);
  return usable.slice(0, MAX_RESULTS).map(({ id, title, requiresAuth }) => ({ id, title, requiresAuth }));
}

/** Bloc de contexte compact (~60 tokens max) listant les questionnaires trouvés. */
export function aeroschoolBlock(matches: AeroschoolFormMatch[], options: { hasAccount: boolean }): string {
  if (matches.length === 0) return '';
  const lines = matches.map(
    (form) => `- « ${form.title} » (${form.requiresAuth ? 'compte requis' : 'accessible sans compte'})`
  );
  const tail = options.hasAccount
    ? ''
    : '\nLe membre n’a pas de compte lié : ne l’envoie que vers un questionnaire accessible sans compte, sinon explique la création de compte.';
  return `Questionnaires AeroSchool correspondants (menu AeroSchool du site) :\n${lines.join('\n')}${tail}`;
}
