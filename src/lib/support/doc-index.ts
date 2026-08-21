import { ATC_FORMATIONS_IA } from '@/lib/support/atc-formations';
import { CODE_DE_CONDUITE_IA, CODE_DE_CONDUITE_URL } from '@/lib/support/code-de-conduite';
import { LIVRET_PROGRESSION_IA, LIVRET_PROGRESSION_URL } from '@/lib/support/livret-progression';
import { MANUEL_CONTROLEUR_IA, MANUEL_CONTROLEUR_URL } from '@/lib/support/manuel-controleur';
import { SITE_PROCEDURES_IA } from '@/lib/support/site-procedures';
import { GROUND_CREW_IA, IFSA_IA } from '@/lib/support/espaces-site';

/**
 * Index documentaire de l’IA tickets : les documents de référence du site,
 * découpés en petits morceaux interrogeables.
 *
 * Pourquoi une recherche plutôt qu’un collage : Groq plafonne à 8K tokens/minute
 * (prompt + historique + réponse). Coller les trois documents coûterait ~3500
 * tokens à CHAQUE message. On n’injecte donc que les 2 à 4 extraits utiles,
 * soit ~450 tokens au pire.
 *
 * Chaque extrait porte son document d’origine et son lien public : le modèle
 * peut citer « article 3 du code de conduite » avec le bon lien, et n’a le droit
 * d’affirmer que ce qui figure dans les extraits reçus.
 */
export interface DocChunk {
  id: string;
  /** Document d’origine, tel qu’on peut le nommer à un membre. */
  source: string;
  /** Titre court de l’extrait, repris dans le bloc injecté. */
  title: string;
  /** Page publique du site où le membre retrouve le document complet. */
  link: string;
  text: string;
}

export type DocSourceId = 'conduite' | 'pilote' | 'atc' | 'manuel' | 'site' | 'ground' | 'ifsa';

/**
 * Seuil de regroupement : au-dessus, une ligne forme un extrait à elle seule.
 * Trop haut, deux articles se retrouvent dans le même extrait et l’IA cite le
 * mauvais numéro ; trop bas, un extrait perd son contexte.
 */
const CHUNK_MIN_CHARS = 150;

function lineTitle(line: string): string {
  const cleaned = line.replace(/^[-–•\s]+/, '').trim();
  // Séparateurs de titre du corpus : « Art. 3 Comportement — … », « RTA (…) : … ».
  return cleaned.split(/ — | – | : /)[0].replace(/[.,;]$/, '').trim();
}

/**
 * Titre lisible d’un extrait. Quand plusieurs lignes courtes ont été regroupées,
 * le titre les mentionne toutes : sinon l’IA citerait « RS1 » pour un extrait qui
 * parle aussi de RS2.
 */
function deriveTitle(lines: string[]): string {
  const parts: string[] = [];
  for (const line of lines) {
    const title = lineTitle(line);
    if (title && !parts.includes(title)) parts.push(title);
    if (parts.join(' · ').length > 70) break;
  }
  const joined = parts.join(' · ');
  return (joined.length > 70 ? `${joined.slice(0, 67)}…` : joined) || 'Extrait';
}

/**
 * Découpe un document condensé ligne à ligne : ses lignes sont déjà des unités
 * de sens (un article, un grade, une catégorie). Les lignes trop courtes sont
 * regroupées pour éviter des extraits sans contexte.
 */
function chunksFromDocument(opts: {
  prefix: string;
  source: DocSourceId;
  sourceLabel: string;
  link: string;
  body: string;
}): DocChunk[] {
  const lines = opts.body
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean);

  const chunks: DocChunk[] = [];
  let buffer: string[] = [];

  const flush = () => {
    if (buffer.length === 0) return;
    const text = buffer.join('\n');
    chunks.push({
      id: `${opts.prefix}-${chunks.length + 1}`,
      source: opts.sourceLabel,
      title: deriveTitle(buffer),
      link: opts.link,
      text,
    });
    buffer = [];
  };

  for (const line of lines) {
    buffer.push(line);
    if (buffer.join('\n').length >= CHUNK_MIN_CHARS) flush();
  }
  flush();
  return chunks;
}

/** Index statique, construit une fois au chargement du module. */
export const DOC_CHUNKS: DocChunk[] = [
  ...chunksFromDocument({
    prefix: 'cdc',
    source: 'conduite',
    sourceLabel: 'Code de conduite MIXOU AIRLINES PTFS',
    link: CODE_DE_CONDUITE_URL,
    body: CODE_DE_CONDUITE_IA,
  }),
  ...chunksFromDocument({
    prefix: 'livret',
    source: 'pilote',
    sourceLabel: 'Livret de progression pilote (CAT 1 à 5)',
    link: LIVRET_PROGRESSION_URL,
    body: LIVRET_PROGRESSION_IA,
  }),
  ...chunksFromDocument({
    prefix: 'moq',
    source: 'manuel',
    sourceLabel: 'Manuel des opérations et qualifications du contrôleur',
    link: MANUEL_CONTROLEUR_URL,
    body: MANUEL_CONTROLEUR_IA,
  }),
  ...chunksFromDocument({
    prefix: 'atc',
    source: 'atc',
    sourceLabel: 'Parcours des formations ATC du site',
    link: '/instruction',
    body: ATC_FORMATIONS_IA,
  }),
  ...chunksFromDocument({
    prefix: 'site',
    source: 'site',
    sourceLabel: 'Démarches du site',
    link: '/aeroschool',
    body: SITE_PROCEDURES_IA,
  }),
  ...chunksFromDocument({
    prefix: 'gc',
    source: 'ground',
    sourceLabel: 'Espace Ground Crew (personnel de piste)',
    link: '/ground',
    body: GROUND_CREW_IA,
  }),
  ...chunksFromDocument({
    prefix: 'ifsa',
    source: 'ifsa',
    sourceLabel: 'Espace IFSA',
    link: '/ifsa',
    body: IFSA_IA,
  }),
];

const SOURCE_BY_PREFIX: Record<string, DocSourceId> = {
  cdc: 'conduite',
  livret: 'pilote',
  moq: 'manuel',
  atc: 'atc',
  site: 'site',
  gc: 'ground',
  ifsa: 'ifsa',
};

/** Extraits d’une source, pour les cas où le sujet est certain (création de compte). */
export function chunksFromSource(source: DocSourceId, limit = 2): DocChunk[] {
  return DOC_CHUNKS.filter((chunk) => SOURCE_BY_PREFIX[chunk.id.split('-')[0]] === source).slice(0, limit);
}

function sourceOf(chunk: DocChunk): DocSourceId {
  return SOURCE_BY_PREFIX[chunk.id.split('-')[0]] ?? 'conduite';
}

const STOPWORDS = new Set([
  'avec', 'pour', 'dans', 'mais', 'donc', 'comment', 'quand', 'quel', 'quelle', 'quels', 'quelles',
  'faire', 'fait', 'veux', 'voudrais', 'souhaite', 'peux', 'peut', 'pouvez', 'besoin', 'aide',
  'bonjour', 'salut', 'merci', 'ticket', 'site', 'svp', 'plait', 'plaît', 'chez', 'vous', 'nous',
  'suis', 'etre', 'avoir', 'cela', 'tout', 'tous', 'toute', 'plus', 'moins', 'juste', 'alors',
  'sais', 'savoir', 'dire', 'voir', 'mon', 'mes', 'les', 'des', 'une', 'sur', 'par', 'que', 'qui',
  // Mots présents partout dans le corpus : ils ne discriminent rien.
  'site', 'compte', 'membre', 'deja', 'faut', 'combien', 'discord', 'staff', 'page', 'menu',
]);

function normalize(text: string): string {
  return text
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    // « article 3 » et « Art. 3 », « catégorie 4 » et « CAT 4 » désignent la même chose.
    .replace(/\barticles?\b/g, 'art')
    .replace(/\bcategories?\b/g, 'cat')
    // « cat 3 » → « cat3 » : sans ça le chiffre est perdu et toutes les CAT se valent.
    .replace(/\b([a-z]{2,10}) (\d{1,2})\b/g, '$1$2')
    .trim();
}

function tokenize(text: string): string[] {
  return [
    ...new Set(
      normalize(text)
        .split(' ')
        .filter((word) => word.length >= 3 && !STOPWORDS.has(word))
    ),
  ];
}

/** Index pré-normalisé : la recherche ne renormalise rien à chaud. */
const NORMALIZED = DOC_CHUNKS.map((chunk) => ({
  chunk,
  source: sourceOf(chunk),
  title: normalize(chunk.title),
  text: normalize(chunk.text),
}));

/**
 * Poids d’un mot : un terme présent dans la moitié du corpus (« compte »,
 * « site », « atc ») ne dit rien du sujet, un terme rare (« rta », « insulte »)
 * est très discriminant. C’est un IDF classique, calculé une fois au chargement.
 */
const IDF = new Map<string, number>();
function weight(token: string): number {
  const cached = IDF.get(token);
  if (cached !== undefined) return cached;
  const df = NORMALIZED.filter((entry) => entry.text.includes(token) || entry.title.includes(token)).length;
  const value = df === 0 ? 0 : Math.log(NORMALIZED.length / df);
  IDF.set(token, value);
  return value;
}

const MIN_SCORE = 3;
/** Un seul mot en commun ne suffit que s’il est rare (présent dans ≲ 4 extraits). */
const RARE_TOKEN_WEIGHT = 2;
/** Bonus accordé à une source que le sujet du ticket désigne déjà. */
const PREFER_BONUS = 1.5;

export interface DocSearchOptions {
  limit?: number;
  /** Sources privilégiées quand le sujet du ticket est déjà identifié. */
  prefer?: DocSourceId[];
  /** Sources à écarter : un ticket ATC ne doit pas ramener le livret pilote. */
  penalize?: DocSourceId[];
  /** Extraits déjà envoyés au modèle, à ne pas répéter au second passage. */
  excludeIds?: string[];
}

/**
 * Recherche lexicale, sans dépendance ni embedding ni appel payant.
 * Chaque mot de la question rapporte son poids IDF, triplé s’il tombe dans le
 * titre de l’extrait ; une source privilégiée par le motif du ticket ajoute 1.
 * Un extrait n’est retenu que s’il croise au moins deux mots de la question, ou
 * un seul mot suffisamment rare — sinon « j’ai un compte » ramènerait la moitié
 * du corpus.
 */
export function searchDocs(query: string, options: DocSearchOptions = {}): DocChunk[] {
  const tokens = tokenize(query);
  if (tokens.length === 0) return [];
  const limit = options.limit ?? 3;
  const prefer = new Set(options.prefer ?? []);
  const penalize = new Set(options.penalize ?? []);
  const exclude = new Set(options.excludeIds ?? []);

  return NORMALIZED
    .filter((entry) => !exclude.has(entry.chunk.id) && !penalize.has(entry.source))
    .map((entry) => {
      let points = 0;
      let matched = 0;
      let bestWeight = 0;
      for (const token of tokens) {
        const inTitle = entry.title.includes(token);
        if (!inTitle && !entry.text.includes(token)) continue;
        const w = weight(token);
        points += inTitle ? w * 3 : w;
        bestWeight = Math.max(bestWeight, w);
        matched += 1;
      }
      const preferred = prefer.has(entry.source);
      if (matched > 0 && preferred) points += PREFER_BONUS;
      // Sur une source déjà identifiée comme la bonne (ticket ATC → doc ATC), un
      // seul mot en commun suffit : « comment devenir contrôleur » ne croise que
      // « contrôleur », et repartait sans aucun extrait.
      const relevant = matched >= 2 || bestWeight >= RARE_TOKEN_WEIGHT || (matched >= 1 && preferred);
      return { chunk: entry.chunk, points: relevant ? points : 0 };
    })
    .filter((entry) => entry.points >= MIN_SCORE)
    .sort((a, b) => b.points - a.points || a.chunk.id.localeCompare(b.chunk.id))
    .slice(0, limit)
    .map((entry) => entry.chunk);
}

const DOC_MARKER = /\[\[\s*DOC\s*:\s*([^\]]{2,120})\]\]/i;

/**
 * Le modèle signale qu’il lui manque de la documentation : `[[DOC: sujet]]`.
 * Renvoie le sujet recherché, ou null si le marqueur est absent.
 */
export function extractDocRequest(reply: string): string | null {
  const match = reply.match(DOC_MARKER);
  if (!match) return null;
  const query = match[1].trim();
  return query.length >= 2 ? query : null;
}

/** Filet de sécurité : le marqueur ne doit jamais atteindre le salon Discord. */
export function stripDocMarker(reply: string): string {
  return reply.replace(new RegExp(DOC_MARKER, 'gi'), '').replace(/\n{3,}/g, '\n\n').trim();
}

/** Bloc de contexte injecté dans le message utilisateur envoyé au modèle. */
export function docsBlock(chunks: DocChunk[]): string {
  if (chunks.length === 0) return '';
  const body = chunks
    .map((chunk) => `[${chunk.source} — ${chunk.title}] (${chunk.link})\n${chunk.text}`)
    .join('\n\n');
  return `Documentation du site (extraits trouvés pour cette demande — tu ne peux affirmer que ce qui s’y trouve) :\n${body}`;
}
