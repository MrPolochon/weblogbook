import type { DiscordCalendarTarget } from '@/lib/calendrier/types';

const ANNOUNCE_OFF = /^(non|no|off|0)$/i;
const ANNOUNCE_ON_PREFIX = /^(oui|yes|on|1)\b/i;
const SNOWFLAKE = /\d{16,22}/g;

function normalizeToken(s: string): string {
  return String(s || '')
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '');
}

/** Retire les mots-clés d’annonce et les mentions de rôle pour isoler le salon. */
function channelHaystack(raw: string): string {
  return String(raw || '')
    .replace(/<@&?\d+>/g, ' ')
    .replace(/@\S+/g, ' ')
    .replace(ANNOUNCE_ON_PREFIX, ' ')
    .trim();
}

export function parseChannelMention(raw: string): string | null {
  const m = String(raw || '').match(/<#(\d+)>/);
  return m?.[1] || null;
}

export function parseRoleMention(raw: string): string | null {
  const t = String(raw || '');
  if (/\b@everyone\b/i.test(t)) return 'everyone';
  if (/\b@here\b/i.test(t)) return 'here';
  const m = t.match(/<@&(\d+)>/);
  return m?.[1] || null;
}

export function resolveChannelByName(raw: string, channels: DiscordCalendarTarget[]): string | null {
  const mentioned = parseChannelMention(raw);
  if (mentioned) return mentioned;

  const text = String(raw || '');
  for (const m of text.matchAll(SNOWFLAKE)) {
    if (channels.some((c) => c.id === m[0])) return m[0];
  }

  const bare = text.trim().match(/^(\d{16,22})$/);
  if (bare?.[1]) return bare[1];

  const hay = channelHaystack(text);
  if (!hay) return null;

  const candidates: string[] = [];
  for (const m of hay.matchAll(/#([^\s#<]{1,120})/g)) candidates.push(m[1]);
  candidates.push(hay);

  const indexed = channels
    .map((c) => ({ c, n: normalizeToken(c.name) }))
    .filter((x) => x.n.length >= 2);

  for (const token of candidates) {
    const n = normalizeToken(token);
    if (n.length < 2) continue;
    const exact = indexed.find((x) => x.n === n);
    if (exact) return exact.c.id;
  }

  for (const token of candidates) {
    const n = normalizeToken(token);
    if (n.length < 2) continue;
    const fuzzy = indexed.find((x) => x.n.endsWith(n) || n.endsWith(x.n));
    if (fuzzy) return fuzzy.c.id;
  }

  const hayN = normalizeToken(hay);
  if (hayN.length >= 2) {
    const contained = indexed.find((x) => hayN.includes(x.n));
    if (contained) return contained.c.id;
  }

  return null;
}

export function resolveRoleByName(raw: string, roles: DiscordCalendarTarget[]): string | null {
  const mentioned = parseRoleMention(raw);
  if (mentioned) return mentioned;

  const text = String(raw || '');
  for (const m of text.matchAll(SNOWFLAKE)) {
    if (roles.some((r) => r.id === m[0])) return m[0];
  }

  const at = text.match(/@([a-z0-9 _-]{2,80})/i)?.[1]?.trim().toLowerCase();
  if (!at || at === 'everyone' || at === 'here') return mentioned;
  const exact = roles.find((r) => r.name.toLowerCase() === at || r.name.toLowerCase() === `@${at}`);
  if (exact) return exact.id;

  const n = normalizeToken(at);
  if (n.length < 2) return null;
  const fuzzy = roles.find((r) => normalizeToken(r.name) === n);
  return fuzzy?.id || null;
}

export function parseAnnounceField(
  raw: string,
  channels: DiscordCalendarTarget[],
  roles: DiscordCalendarTarget[],
): { announce: boolean; channelId: string | null; roleId: string | null } {
  const t = String(raw || '').trim();
  if (!t || ANNOUNCE_OFF.test(t)) {
    return { announce: false, channelId: null, roleId: null };
  }
  return {
    announce: true,
    channelId: resolveChannelByName(t, channels),
    roleId: resolveRoleByName(t, roles),
  };
}
