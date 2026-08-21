const DISCORD_API = 'https://discord.com/api/v10';

function botToken(): string {
  const t = process.env.SUPPORT_BOT_TOKEN || process.env.DISCORD_SUPPORT_BOT_TOKEN || '';
  if (!t) throw new Error('SUPPORT_BOT_TOKEN manquant');
  return t;
}

export async function discordFetch(path: string, init?: RequestInit) {
  const res = await fetch(`${DISCORD_API}${path}`, {
    ...init,
    headers: {
      Authorization: `Bot ${botToken()}`,
      'Content-Type': 'application/json',
      ...(init?.headers || {}),
    },
  });
  const text = await res.text();
  const json = text ? JSON.parse(text) : {};
  if (!res.ok) {
    throw new Error(typeof json.message === 'string' ? json.message : `Discord HTTP ${res.status}`);
  }
  return json;
}

export async function discordGetMe() {
  return discordFetch('/users/@me');
}

export type DiscordGuildChannel = {
  id: string;
  name: string;
  type: number;
  parent_id: string | null;
  position: number;
};

export type DiscordGuildRole = {
  id: string;
  name: string;
  position: number;
  managed: boolean;
};

export async function discordGetGuild(guildId: string): Promise<{ id: string; name: string }> {
  const g = await discordFetch(`/guilds/${guildId}`);
  return { id: String(g.id), name: String(g.name || guildId) };
}

export async function discordListGuildChannels(guildId: string): Promise<DiscordGuildChannel[]> {
  const raw = await discordFetch(`/guilds/${guildId}/channels`);
  if (!Array.isArray(raw)) return [];
  return raw.map((c: Record<string, unknown>) => ({
    id: String(c.id),
    name: String(c.name || ''),
    type: Number(c.type || 0),
    parent_id: c.parent_id ? String(c.parent_id) : null,
    position: Number(c.position || 0),
  }));
}

export async function discordListGuildRoles(guildId: string): Promise<DiscordGuildRole[]> {
  const raw = await discordFetch(`/guilds/${guildId}/roles`);
  if (!Array.isArray(raw)) return [];
  return raw
    .map((r: Record<string, unknown>) => ({
      id: String(r.id),
      name: String(r.name || ''),
      position: Number(r.position || 0),
      managed: Boolean(r.managed),
    }))
    .filter((r) => r.id !== guildId)
    .sort((a, b) => b.position - a.position);
}

/** Voir + écrire + historique + embeds + fichiers */
export const DISCORD_TICKET_ALLOW = '117760';

export async function discordCreateCategory(guildId: string, name: string) {
  return discordFetch(`/guilds/${guildId}/channels`, {
    method: 'POST',
    body: JSON.stringify({ name, type: 4 }),
  });
}

export async function discordCreateTextChannel(args: {
  guildId: string;
  name: string;
  parentId: string;
  topic?: string;
  overwrites: Array<{ id: string; type: number; allow?: string; deny?: string }>;
}) {
  return discordFetch(`/guilds/${args.guildId}/channels`, {
    method: 'POST',
    body: JSON.stringify({
      name: args.name,
      type: 0,
      parent_id: args.parentId,
      topic: args.topic?.slice(0, 1024),
      permission_overwrites: args.overwrites,
    }),
  });
}

export async function discordRenameChannel(channelId: string, name: string) {
  return discordFetch(`/channels/${channelId}`, {
    method: 'PATCH',
    body: JSON.stringify({ name: name.slice(0, 100) }),
  });
}

export async function discordMoveChannel(channelId: string, parentId: string) {
  return discordFetch(`/channels/${channelId}`, {
    method: 'PATCH',
    body: JSON.stringify({ parent_id: parentId }),
  });
}

export async function discordSendMessage(channelId: string, content: string, extras?: Record<string, unknown>) {
  return discordFetch(`/channels/${channelId}/messages`, {
    method: 'POST',
    body: JSON.stringify({ content: content.slice(0, 2000), ...extras }),
  });
}

export async function discordDeleteChannel(channelId: string) {
  return discordFetch(`/channels/${channelId}`, { method: 'DELETE' });
}

export async function discordGetMessages(channelId: string, limit = 100) {
  return discordFetch(`/channels/${channelId}/messages?limit=${Math.min(limit, 100)}`);
}
