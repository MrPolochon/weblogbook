export const dynamic = 'force-dynamic';
import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { getDiscordGuildId } from '@/lib/discord-link';
import {
  discordGetGuild,
  discordListGuildChannels,
  discordListGuildRoles,
} from '@/lib/support/discord-api';

async function requireAdmin() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: NextResponse.json({ error: 'Non authentifié' }, { status: 401 }) };
  const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).maybeSingle();
  if (profile?.role !== 'admin') {
    return { error: NextResponse.json({ error: 'Admin requis' }, { status: 403 }) };
  }
  return { user };
}

export async function GET() {
  const gate = await requireAdmin();
  if ('error' in gate && gate.error) return gate.error;

  const guildId = getDiscordGuildId();
  if (!guildId) {
    return NextResponse.json(
      { error: 'DISCORD_GUILD_ID manquant sur Vercel.' },
      { status: 503 }
    );
  }

  try {
    const [guild, channels, roles] = await Promise.all([
      discordGetGuild(guildId),
      discordListGuildChannels(guildId),
      discordListGuildRoles(guildId),
    ]);
    return NextResponse.json({
      guild,
      channels,
      roles,
    });
  } catch (e) {
    return NextResponse.json(
      {
        error:
          e instanceof Error
            ? e.message
            : 'Impossible de lister Discord (token bot / invitation ?)',
        guild: { id: guildId, name: guildId },
        channels: [],
        roles: [],
      },
      { status: 502 }
    );
  }
}
