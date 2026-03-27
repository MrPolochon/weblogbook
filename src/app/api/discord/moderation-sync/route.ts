import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { getDiscordSyncSecret } from '@/lib/discord-link';
import { upsertDiscordLinkState } from '@/lib/discord-link-service';

export const dynamic = 'force-dynamic';

type ModerationPayload = {
  discord_user_id?: string;
  discord_username?: string | null;
  guild_member?: boolean;
  has_required_role?: boolean;
  sanction_type?: string | null;
  sanction_reason?: string | null;
  sanction_started_at?: string | null;
  sanction_ends_at?: string | null;
  is_permanent?: boolean;
};

function verifySyncSecret(request: NextRequest) {
  const expected = getDiscordSyncSecret();
  if (!expected) return false;
  const auth = request.headers.get('authorization');
  const direct = request.headers.get('x-discord-sync-secret');
  return auth === `Bearer ${expected}` || direct === expected;
}

export async function POST(request: NextRequest) {
  if (!verifySyncSecret(request)) {
    return NextResponse.json({ error: 'Secret invalide' }, { status: 401 });
  }

  try {
    const body = (await request.json().catch(() => ({}))) as ModerationPayload;
    const discordUserId = body.discord_user_id?.trim();
    if (!discordUserId) {
      return NextResponse.json({ error: 'discord_user_id requis' }, { status: 400 });
    }

    const admin = createAdminClient();
    const { data: link } = await admin
      .from('discord_links')
      .select('user_id')
      .eq('discord_user_id', discordUserId)
      .maybeSingle();

    if (!link?.user_id) {
      return NextResponse.json({ ok: true, ignored: true });
    }

    const result = await upsertDiscordLinkState(link.user_id, {
      discord_user_id: discordUserId,
      discord_username: body.discord_username ?? undefined,
      guild_member: body.guild_member,
      has_required_role: body.has_required_role,
      sanction_type: body.sanction_type ?? null,
      sanction_reason: body.sanction_reason ?? null,
      sanction_started_at: body.sanction_started_at ?? null,
      sanction_ends_at: body.sanction_ends_at ?? null,
      is_permanent: Boolean(body.is_permanent),
      last_sync_at: new Date().toISOString(),
    });

    return NextResponse.json({ ok: true, deleted: result === null });
  } catch (error) {
    console.error('Discord moderation sync error:', error);
    return NextResponse.json({ error: 'Erreur serveur' }, { status: 500 });
  }
}
