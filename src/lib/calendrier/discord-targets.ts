import { discordFetch } from '@/lib/support/discord-api';
import { getDiscordGuildId } from '@/lib/discord-link';
import type { DiscordCalendarTarget } from '@/lib/calendrier/types';

const TEXT_TYPES = new Set([0, 5]); // text + announcements

export async function listDiscordCalendarTargets(): Promise<{
  channels: DiscordCalendarTarget[];
  roles: DiscordCalendarTarget[];
}> {
  const guildId = getDiscordGuildId();
  if (!guildId) return { channels: [], roles: [] };

  const [rawChannels, rawRoles] = await Promise.all([
    discordFetch(`/guilds/${guildId}/channels`),
    discordFetch(`/guilds/${guildId}/roles`),
  ]);

  const channels: DiscordCalendarTarget[] = Array.isArray(rawChannels)
    ? rawChannels
        .filter((c: { type?: number; name?: string; id?: string }) => TEXT_TYPES.has(Number(c.type)) && c.id && c.name)
        .map((c: { id: string; name: string }) => ({ id: String(c.id), name: String(c.name) }))
        .sort((a: DiscordCalendarTarget, b: DiscordCalendarTarget) => a.name.localeCompare(b.name, 'fr'))
    : [];

  const roles: DiscordCalendarTarget[] = Array.isArray(rawRoles)
    ? [
        { id: 'everyone', name: '@everyone' },
        { id: 'here', name: '@here' },
        ...rawRoles
          .filter((r: { id?: string; name?: string }) => r.id && r.name && String(r.id) !== guildId)
          .map((r: { id: string; name: string }) => ({ id: String(r.id), name: String(r.name) }))
          .sort((a: DiscordCalendarTarget, b: DiscordCalendarTarget) => a.name.localeCompare(b.name, 'fr')),
      ]
    : [];

  return { channels, roles };
}
