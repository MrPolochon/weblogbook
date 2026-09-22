import type { DiscordCalendarTarget } from '@/lib/calendrier/types';

export function parseChannelMention(raw: string): string | null {
  const m = String(raw || '').match(/<#(\d{5,})>/);
  return m?.[1] || null;
}

export function parseRoleMention(raw: string): string | null {
  const t = String(raw || '');
  if (/\b@everyone\b/i.test(t)) return 'everyone';
  if (/\b@here\b/i.test(t)) return 'here';
  const m = t.match(/<@&(\d{5,})>/);
  return m?.[1] || null;
}

export function resolveChannelByName(raw: string, channels: DiscordCalendarTarget[]): string | null {
  const mentioned = parseChannelMention(raw);
  if (mentioned) return mentioned;
  const hash = raw.match(/#([a-z0-9_-]{2,100})/i)?.[1]?.toLowerCase();
  if (!hash) return null;
  const found = channels.find((c) => c.name.toLowerCase() === hash);
  return found?.id || null;
}

export function resolveRoleByName(raw: string, roles: DiscordCalendarTarget[]): string | null {
  const mentioned = parseRoleMention(raw);
  if (mentioned) return mentioned;
  const at = raw.match(/@([a-z0-9 _-]{2,80})/i)?.[1]?.trim().toLowerCase();
  if (!at || at === 'everyone' || at === 'here') return mentioned;
  const found = roles.find((r) => r.name.toLowerCase() === at);
  return found?.id || null;
}

export function parseAnnounceField(
  raw: string,
  channels: DiscordCalendarTarget[],
  roles: DiscordCalendarTarget[],
): { announce: boolean; channelId: string | null; roleId: string | null } {
  const t = String(raw || '').trim();
  if (!t || /^(non|no|off|0)$/i.test(t)) {
    return { announce: false, channelId: null, roleId: null };
  }
  return {
    announce: true,
    channelId: resolveChannelByName(t, channels),
    roleId: resolveRoleByName(t, roles),
  };
}
