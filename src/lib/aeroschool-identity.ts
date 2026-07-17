/** Correspondance titre de question → champ profil pour pré-remplissage. */

export interface IdentityPrefillSource {
  identifiant: string;
  discordUsername: string | null;
}

const DISCORD_PATTERNS = [/discord/i, /pseudo\s*discord/i];
const ROBLOX_PATTERNS = [/roblox/i, /pseudo\s*roblox/i];
const IDENTIFIANT_PATTERNS = [
  /identifiant/i,
  /pseudo\s*(?!discord|roblox)/i,
  /nom\s*d['']?utilisateur/i,
  /username/i,
];

function matchesAny(text: string, patterns: RegExp[]): boolean {
  return patterns.some((p) => p.test(text));
}

/** Déduit la valeur profil à injecter pour une question texte courte. */
export function inferIdentityPrefill(
  questionTitle: string,
  profile: IdentityPrefillSource,
): string | null {
  const t = questionTitle.trim();
  if (!t) return null;
  if (matchesAny(t, DISCORD_PATTERNS) && profile.discordUsername) {
    return profile.discordUsername;
  }
  if (matchesAny(t, ROBLOX_PATTERNS)) {
    return profile.identifiant;
  }
  if (matchesAny(t, IDENTIFIANT_PATTERNS)) {
    return profile.identifiant;
  }
  return null;
}

/** Pré-remplit les réponses vides à partir du profil connecté. */
export function buildIdentityPrefills(
  sections: Array<{ questions?: Array<{ id: string; type: string; title: string }> }>,
  profile: IdentityPrefillSource,
): Record<string, string> {
  const out: Record<string, string> = {};
  for (const section of sections) {
    for (const q of section.questions || []) {
      if (q.type !== 'short_text' && q.type !== 'paragraph') continue;
      const value = inferIdentityPrefill(q.title, profile);
      if (value) out[q.id] = value;
    }
  }
  return out;
}
