import type { createAdminClient } from '@/lib/supabase/admin';
import { INSTRUCTION_TITRE_TYPES } from '@/lib/licence-titres-instruction';

type Admin = ReturnType<typeof createAdminClient>;

/**
 * Annuaire consultable par l’IA tickets — LECTURE SEULE, à deux niveaux.
 *
 * Le bot parle dans un salon Discord que des tiers peuvent lire : ce module est
 * volontairement plus étroit que les pages du site.
 *
 * - Niveau PUBLIC (n’importe quel demandeur) : exactement la population de la
 *   page /annuaire, c’est-à-dire les admins et les détenteurs d’un titre
 *   d’instruction (FI, FE, ATC FI, ATC FE), avec identifiant, pseudo Discord,
 *   titres et disponibilité. Ces informations sont déjà visibles par tout membre
 *   connecté sur /annuaire : les publier dans son propre ticket n’ajoute aucune
 *   fuite.
 * - Niveau STAFF (le demandeur est admin, ou détient un titre d’instruction) :
 *   n’importe quel profil, avec en plus son rôle, ses accès d’espace, son grade
 *   ATC et ses licences — de quoi identifier qui est qui pendant un ticket.
 *
 * JAMAIS exposé, quel que soit le niveau : e-mail, mot de passe, jeton, UUID,
 * identifiant Discord numérique (il permettrait de mentionner ou de retrouver
 * quelqu’un hors du site), détail des sanctions, solde Felitz, adresse IP.
 *
 * Deux cloisonnements supplémentaires, demandés par le propriétaire du serveur :
 * - un compte bloqué ou sanctionné n’a pas de fiche du tout, aux DEUX niveaux :
 *   le bot dit que la personne a un dossier en cours avec le staff, sans jamais
 *   dire lequel ni pourquoi ;
 * - l’appartenance à l’IFSA est publique, mais le statut interne d’un agent est
 *   confidentiel par conception : rien ici ne doit permettre de le déduire.
 */

const MAX_RESULTS = 3;
/** Une recherche d’au moins 3 caractères : « al » ramènerait la moitié du serveur. */
const MIN_QUERY_LENGTH = 3;

export interface DirectoryEntry {
  identifiant: string;
  discord: string | null;
  role: string | null;
  titres: string[];
  acces: string[];
  grade: string | null;
  licences: string[];
  indisponible: boolean;
  /** Dossier en cours avec le staff : la fiche n’est pas communiquée. */
  flagged: boolean;
}

export interface DirectoryLookup {
  query: string;
  level: 'public' | 'staff';
  matches: DirectoryEntry[];
}

function normalize(text: string): string {
  return text
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[’'`]/g, '')
    .trim();
}

/**
 * Le message cherche vraiment à identifier quelqu’un. Sans ce filtre, une phrase
 * comme « askip t’as rien inventé » déclenchait une recherche sur un pseudo.
 */
const IDENTITY_INTENT =
  /\bqui est\b|\bc est qui\b|\bcest qui\b|\bqui sont\b|\bqui peut\b|\bqui s occupe\b|\bqui gere\b|\bqui contacter\b|\bconnais[- ]tu\b|\btu connais\b|\bannuaire\b|\bquel(?:le)? (?:est|sont) (?:le |la |les )?(?:compte|pseudo|identifiant|instructeur|referent)\b|\b(?:pseudo|identifiant|compte) (?:de|du|d)\b|\bliste des (?:instructeurs|examinateurs|admins|staffs?)\b|\bquel instructeur\b|\bquel examinateur\b|\bmon referent\b/;

/** Mots à ne jamais prendre pour un pseudo lors de l’extraction. */
const NOT_A_NAME = new Set([
  'qui', 'est', 'sont', 'quoi', 'que', 'quel', 'quelle', 'quels', 'quelles', 'mon', 'ma', 'mes',
  'ton', 'ta', 'tes', 'son', 'sa', 'ses', 'le', 'la', 'les', 'un', 'une', 'des', 'du', 'de', 'ce',
  'cet', 'cette', 'moi', 'toi', 'lui', 'elle', 'nous', 'vous', 'eux', 'sur', 'dans', 'pour', 'avec',
  'compte', 'pseudo', 'identifiant', 'annuaire', 'site', 'discord', 'ticket', 'staff', 'admin',
  'instructeur', 'instructeurs', 'examinateur', 'examinateurs', 'referent', 'referents', 'peut',
  'gere', 'occupe', 'contacter', 'connais', 'liste', 'formateur', 'formateurs', 'personne',
  'atc', 'afis', 'pilote', 'pilotes', 'vol', 'sol', 'militaire', 'ifsa', 'siavi',
]);

/** « Qui sont les instructeurs ? » — une demande de liste, pas de personne précise. */
const LIST_INTENT =
  /\b(?:qui sont|liste des|donne(?:-moi)? les|c est qui) (?:les )?(instructeurs?|formateurs?|examinateurs?|admins?|administrateurs?)\b|\bqui peut (?:me )?(?:former|examiner|instruire)\b|\bquel instructeur\b|\bquel examinateur\b/;

/**
 * Pseudo recherché : une mention Discord `@Pseudo`, un nom entre guillemets, ou
 * à défaut les mots du message qui ressemblent à un pseudo.
 */
export function extractDirectoryQuery(text: string): string | null {
  const mention = text.match(/@([A-Za-z0-9._-]{3,32})/);
  if (mention) return mention[1];

  const quoted = text.match(/[«"']\s*([A-Za-z0-9._ -]{3,32})\s*[»"']/);
  if (quoted) return quoted[1].trim();

  // Tournures où le pseudo suit directement la question, même tout en minuscules.
  const anchored =
    text.match(/(?:pseudo|identifiant|compte|instructeur|référent|referent)\s+(?:de|du|d[’'])\s*([A-Za-z0-9._-]{3,32})/i) ||
    text.match(/\bqui est\s+([A-Za-z0-9._-]{3,32})/i) ||
    text.match(/\bc[’']?est qui\s+([A-Za-z0-9._-]{3,32})/i) ||
    text.match(/\b(?:tu )?connais(?:-tu)?\s+([A-Za-z0-9._-]{3,32})/i);
  if (anchored && !NOT_A_NAME.has(normalize(anchored[1]))) return anchored[1];

  const candidates = normalize(text)
    .replace(/[^a-z0-9._ -]+/g, ' ')
    .split(/\s+/)
    .filter((word) => word.length >= MIN_QUERY_LENGTH && !NOT_A_NAME.has(word));
  // Un pseudo se démarque : chiffres, point, underscore, ou majuscule d’origine.
  const distinctive = candidates.find((word) => /[0-9._-]/.test(word));
  if (distinctive) return distinctive;

  const original = text.match(/\b([A-Z][A-Za-z0-9._-]{2,31})\b/g) || [];
  for (const word of original) {
    if (!NOT_A_NAME.has(normalize(word))) return word;
  }
  return null;
}

/** Le demandeur peut-il interroger l’annuaire complet ? */
async function requesterIsStaff(admin: Admin, requesterId: string): Promise<boolean> {
  const [{ data: profile }, { data: titres }] = await Promise.all([
    admin.from('profiles').select('role').eq('id', requesterId).maybeSingle(),
    admin
      .from('licences_qualifications')
      .select('type')
      .eq('user_id', requesterId)
      .in('type', [...INSTRUCTION_TITRE_TYPES]),
  ]);
  if (profile?.role === 'admin') return true;
  return (titres || []).length > 0;
}

type ProfileRow = {
  id: string;
  identifiant: string | null;
  role: string | null;
  atc: boolean | null;
  armee: boolean | null;
  ifsa: boolean | null;
  siavi: boolean | null;
  ground_crew: boolean | null;
  atc_grade_id: string | null;
  instruction_indisponible: boolean | null;
  blocked_until: string | null;
  sanction_blocage_vol: boolean | null;
};

const PROFILE_SELECT =
  'id, identifiant, role, atc, armee, ifsa, siavi, ground_crew, atc_grade_id, instruction_indisponible, blocked_until, sanction_blocage_vol';

type LinkRow = { user_id: string; discord_username: string | null; status: string | null };

/** Liaisons Discord suspendues : le compte a un dossier ouvert avec le staff. */
const BLOCKED_LINK_STATUS = new Set(['temporary_block', 'permanent_block']);

/**
 * Compte « à problème » : blocage de compte en cours, blocage de vol, ou liaison
 * Discord sanctionnée. On ne cherche pas à savoir laquelle — c’est justement ce
 * qu’il ne faut pas dire.
 */
function hasOpenStaffCase(profile: ProfileRow, link: LinkRow | undefined): boolean {
  if (profile.sanction_blocage_vol) return true;
  if (profile.blocked_until && new Date(profile.blocked_until).getTime() > Date.now()) return true;
  return Boolean(link?.status && BLOCKED_LINK_STATUS.has(link.status));
}

function flaggedEntry(identifiant: string): DirectoryEntry {
  return {
    identifiant,
    discord: null,
    role: null,
    titres: [],
    acces: [],
    grade: null,
    licences: [],
    indisponible: false,
    flagged: true,
  };
}

function accessLabels(profile: ProfileRow): string[] {
  const acces: string[] = [];
  if (profile.atc || profile.role === 'atc') acces.push('ATC');
  if (profile.armee) acces.push('militaire');
  if (profile.ifsa) acces.push('IFSA');
  if (profile.siavi) acces.push('SIAVI');
  if (profile.ground_crew) acces.push('ground crew');
  return acces;
}

/**
 * Encadrants disponibles — exactement ce que la page /annuaire montre déjà à
 * tout membre connecté. Les indisponibles passent en dernier.
 */
async function listInstructionStaff(admin: Admin, staff: boolean): Promise<DirectoryLookup> {
  const { data: titreRows } = await admin
    .from('licences_qualifications')
    .select('user_id, type')
    .in('type', [...INSTRUCTION_TITRE_TYPES]);

  const titresById = new Map<string, string[]>();
  for (const row of titreRows || []) {
    const uid = String(row.user_id);
    if (!titresById.has(uid)) titresById.set(uid, []);
    titresById.get(uid)!.push(String(row.type));
  }
  const ids = Array.from(titresById.keys());
  if (ids.length === 0) return { query: 'instructeurs', level: staff ? 'staff' : 'public', matches: [] };

  const [profilesRes, linksRes] = await Promise.all([
    admin.from('profiles').select(PROFILE_SELECT).in('id', ids),
    admin.from('discord_links').select('user_id, discord_username, status').in('user_id', ids),
  ]);
  const linkById = new Map(
    ((linksRes.data || []) as LinkRow[]).map((row) => [String(row.user_id), row]),
  );

  const matches = ((profilesRes.data || []) as ProfileRow[])
    // Un encadrant au dossier ouvert n'est pas proposé du tout : on ne va pas
    // envoyer un membre vers quelqu'un en délicatesse avec le staff.
    .filter((profile) => !hasOpenStaffCase(profile, linkById.get(profile.id)))
    .map((profile) => ({
      identifiant: profile.identifiant || '?',
      discord: linkById.get(profile.id)?.discord_username || null,
      role: profile.role === 'admin' ? 'admin' : staff ? profile.role : null,
      titres: INSTRUCTION_TITRE_TYPES.filter((t) => (titresById.get(profile.id) || []).includes(t)) as string[],
      acces: [] as string[],
      grade: null,
      licences: [] as string[],
      indisponible: Boolean(profile.instruction_indisponible),
      flagged: false,
    }))
    .sort((a, b) => Number(a.indisponible) - Number(b.indisponible))
    .slice(0, MAX_RESULTS);

  return { query: 'instructeurs et examinateurs', level: staff ? 'staff' : 'public', matches };
}

/**
 * Recherche annuaire. Retourne null quand le message ne cherche personne : dans
 * ce cas aucune requête n’est envoyée à la base.
 */
export async function findDirectoryMatches(
  admin: Admin,
  text: string,
  opts: { requesterId: string | null | undefined },
): Promise<DirectoryLookup | null> {
  // Sans compte lié, le demandeur n'a même pas accès à la page /annuaire du
  // site : le bot ne lui ouvre pas une porte dérobée.
  if (!opts.requesterId) return null;
  const normalized = normalize(text);
  if (!IDENTITY_INTENT.test(normalized)) return null;
  const wantsList = LIST_INTENT.test(normalized);
  const query = extractDirectoryQuery(text);
  if (!wantsList && (!query || query.length < MIN_QUERY_LENGTH)) return null;

  try {
    const staff = await requesterIsStaff(admin, opts.requesterId);
    if (wantsList) return listInstructionStaff(admin, staff);
    if (!query) return null;
    const like = `%${query.replace(/[%_]/g, '')}%`;

    const [byIdentifiant, byDiscord] = await Promise.all([
      admin.from('profiles').select('id').ilike('identifiant', like).limit(MAX_RESULTS * 2),
      admin
        .from('discord_links')
        .select('user_id')
        .ilike('discord_username', like)
        .limit(MAX_RESULTS * 2),
    ]);

    const ids = new Set<string>();
    for (const row of byIdentifiant.data || []) ids.add(String(row.id));
    for (const row of byDiscord.data || []) ids.add(String(row.user_id));
    if (ids.size === 0) return { query, level: staff ? 'staff' : 'public', matches: [] };

    const idList = Array.from(ids);
    const [profilesRes, linksRes, licencesRes] = await Promise.all([
      admin.from('profiles').select(PROFILE_SELECT).in('id', idList),
      admin.from('discord_links').select('user_id, discord_username, status').in('user_id', idList),
      admin.from('licences_qualifications').select('user_id, type').in('user_id', idList),
    ]);

    const linkById = new Map(
      ((linksRes.data || []) as LinkRow[]).map((row) => [String(row.user_id), row]),
    );
    const licencesById = new Map<string, string[]>();
    for (const row of licencesRes.data || []) {
      const uid = String(row.user_id);
      if (!licencesById.has(uid)) licencesById.set(uid, []);
      licencesById.get(uid)!.push(String(row.type));
    }

    const gradeIds = Array.from(
      new Set(
        ((profilesRes.data || []) as ProfileRow[])
          .map((p) => p.atc_grade_id)
          .filter((v): v is string => Boolean(v)),
      ),
    );
    const gradeById = new Map<string, string>();
    if (gradeIds.length > 0 && staff) {
      const { data: grades } = await admin.from('atc_grades').select('id, nom').in('id', gradeIds);
      for (const g of grades || []) gradeById.set(String(g.id), String(g.nom));
    }

    const matches: DirectoryEntry[] = [];
    for (const profile of (profilesRes.data || []) as ProfileRow[]) {
      const licences = licencesById.get(profile.id) || [];
      const titres = INSTRUCTION_TITRE_TYPES.filter((t) => licences.includes(t));
      const inAnnuaire = profile.role === 'admin' || titres.length > 0;
      // Niveau public : strictement la population déjà affichée sur /annuaire.
      if (!staff && !inAnnuaire) continue;
      // Dossier ouvert avec le staff : on nomme la personne (elle a été cherchée
      // par son nom) mais on ne communique rien d'autre, aux deux niveaux. Le
      // salon est lisible par des tiers ; le back-office reste la bonne place.
      if (hasOpenStaffCase(profile, linkById.get(profile.id))) {
        matches.push(flaggedEntry(profile.identifiant || query));
        if (matches.length >= MAX_RESULTS) break;
        continue;
      }
      matches.push({
        identifiant: profile.identifiant || '?',
        discord: linkById.get(profile.id)?.discord_username || null,
        role: staff ? profile.role : profile.role === 'admin' ? 'admin' : null,
        titres: [...titres],
        acces: staff ? accessLabels(profile) : [],
        grade: staff && profile.atc_grade_id ? gradeById.get(profile.atc_grade_id) || null : null,
        licences: staff ? licences.filter((l) => !titres.includes(l as never)) : [],
        indisponible: Boolean(profile.instruction_indisponible),
        flagged: false,
      });
      if (matches.length >= MAX_RESULTS) break;
    }

    return { query, level: staff ? 'staff' : 'public', matches };
  } catch (e) {
    console.error('[support-message] annuaire indisponible', e);
    return null;
  }
}

// ───────────────────────────── Mention d’un agent IFSA ─────────────────────────
//
// Le modèle n’a jamais accès aux identifiants Discord numériques : il exprime
// seulement l’intention avec `[[PING_IFSA]]`, et le serveur choisit la personne
// et écrit la mention. Sans ça, un modèle influençable pourrait mentionner
// n’importe qui, n’importe quand.

const IFSA_PING_MARKER = /\[\[\s*PING_?IFSA\s*\]\]/i;

/** Note posée dans `memory_notes` : une seule mention d’agent IFSA par ticket. */
const IFSA_PING_NOTE = 'ifsa_agent_pinged=1';

export function wantsIfsaPing(reply: string): boolean {
  return IFSA_PING_MARKER.test(reply);
}

/** Filet de sécurité : le marqueur ne doit jamais atteindre le salon Discord. */
export function stripIfsaPingMarker(reply: string): string {
  return reply
    .replace(new RegExp(IFSA_PING_MARKER, 'gi'), '')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

export function ticketAlreadyPingedIfsa(memory: string | null | undefined): boolean {
  return (memory || '')
    .split('\n')
    .some((line) => line.trim() === IFSA_PING_NOTE);
}

export function withIfsaPingNote(memory: string): string {
  if (ticketAlreadyPingedIfsa(memory)) return memory;
  return [memory, IFSA_PING_NOTE].filter(Boolean).join('\n');
}

/**
 * Choisit un agent IFSA joignable et rend la ligne de mention prête à envoyer.
 * Chaîne vide s’il n’y en a aucun : l’appelant retombe alors sur le ping staff.
 *
 * Seuls les comptes portant réellement le flag IFSA sont candidats. Un admin qui
 * déverrouille l’espace IFSA par code n’en est pas un — le mentionner reviendrait
 * à révéler une permission technique comme si c’était une appartenance.
 */
export async function pickIfsaAgentMention(
  admin: Admin,
  opts: { excludeUserId?: string | null } = {},
): Promise<string> {
  try {
    const { data: agents } = await admin
      .from('profiles')
      .select('id, identifiant, instruction_indisponible, blocked_until, sanction_blocage_vol')
      .eq('ifsa', true);
    const candidates = (agents || []).filter((a) => String(a.id) !== String(opts.excludeUserId || ''));
    if (candidates.length === 0) return '';

    const { data: links } = await admin
      .from('discord_links')
      .select('user_id, discord_user_id, status')
      .in(
        'user_id',
        candidates.map((a) => String(a.id)),
      )
      .eq('status', 'active');

    const discordById = new Map(
      (links || [])
        .filter((l) => /^\d+$/.test(String(l.discord_user_id || '')))
        .map((l) => [String(l.user_id), String(l.discord_user_id)]),
    );

    const joignables = candidates.filter(
      (a) =>
        discordById.has(String(a.id)) &&
        !a.sanction_blocage_vol &&
        !(a.blocked_until && new Date(String(a.blocked_until)).getTime() > Date.now()),
    );
    if (joignables.length === 0) return '';

    // Les agents disponibles d'abord ; à défaut, n'importe quel agent joignable.
    const disponibles = joignables.filter((a) => !a.instruction_indisponible);
    const pool = disponibles.length > 0 ? disponibles : joignables;
    // Tirage au sort : sans ça, c'est toujours le même agent qui prend tout.
    const chosen = pool[Math.floor(Math.random() * pool.length)];
    const discordId = discordById.get(String(chosen.id));
    if (!discordId) return '';

    return `<@${discordId}> **Un agent IFSA est appelé sur ce ticket.**`;
  } catch (e) {
    console.error('[support-message] agent IFSA introuvable', e);
    return '';
  }
}

/** Bloc injecté dans le contexte du modèle. Vide quand il n’y a rien à dire. */
export function directoryBlock(lookup: DirectoryLookup | null): string {
  if (!lookup) return '';
  if (lookup.matches.length === 0) {
    return [
      `Annuaire du site : aucune correspondance pour « ${lookup.query} ».`,
      'Dis-le tel quel et passe la main au staff. N’invente aucun rapprochement de pseudo approchant.',
    ].join('\n');
  }

  const lines = lookup.matches.map((entry) => {
    if (entry.flagged) {
      return `- ${entry.identifiant} : dossier en cours avec le staff. Dis seulement que ce membre a un souci en cours avec le staff et que tu ne peux rien communiquer de plus sur lui. Ne donne ni la nature, ni la durée, ni le motif — tu ne les connais pas.`;
    }
    const parts = [entry.identifiant];
    if (entry.discord) parts.push(`Discord ${entry.discord}`);
    if (entry.role) parts.push(entry.role === 'admin' ? 'admin' : `rôle ${entry.role}`);
    if (entry.titres.length) parts.push(entry.titres.join('/'));
    if (entry.grade) parts.push(`grade ATC ${entry.grade}`);
    if (entry.acces.length) parts.push(`accès ${entry.acces.join(', ')}`);
    if (entry.licences.length) parts.push(`licences ${entry.licences.join(', ')}`);
    if (entry.indisponible) parts.push('indisponible pour l’instruction');
    return `- ${parts.join(' | ')}`;
  });

  return [
    `Annuaire du site — correspondances pour « ${lookup.query} » (${lookup.matches.length} max, lecture seule) :`,
    ...lines,
    lookup.level === 'public'
      ? 'Niveau public : seuls les instructeurs, examinateurs et admins figurent ici (comme la page Annuaire du site). Pour tout autre membre, dis que tu n’as pas le droit de communiquer sa fiche et passe la main au staff.'
      : 'Le demandeur est staff/instructeur : tu peux l’aider à identifier ces comptes dans le cadre de ce ticket.',
    // Le modèle voyait « accès IFSA » à côté de « admin » et en faisait un rang.
    lookup.matches.some((entry) => entry.acces.includes('IFSA'))
      ? 'L’accès IFSA ci-dessus dit seulement que la personne est agent de l’IFSA. Son statut interne à l’IFSA est confidentiel : ne le devine pas, et ne présente jamais un rôle site, une permission ou un accès comme une position hiérarchique à l’IFSA.'
      : '',
    'N’invente aucune autre correspondance et ne cite jamais un e-mail ni un identifiant technique.',
  ]
    .filter(Boolean)
    .join('\n');
}
