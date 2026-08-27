export const dynamic = 'force-dynamic';
import { NextRequest, NextResponse } from 'next/server';
import { getDiscordGuildId, getDiscordRequiredRoleId } from '@/lib/discord-link';
import { createAdminClient } from '@/lib/supabase/admin';
import { assertSupportBotSecret, getSupportConfig } from '@/lib/support/bot-auth';
import { discordGetMe } from '@/lib/support/discord-api';

let cachedBotUser: { id: string; at: number } | null = null;
const BOT_ME_TTL_MS = 5 * 60 * 1000;

export async function GET(req: NextRequest) {
  const denied = assertSupportBotSecret(req);
  if (denied) return denied;
  const cfg = await getSupportConfig();
  const admin = createAdminClient();
  const { data: openRows } = await admin
    .from('support_tickets')
    .select('channel_id')
    .is('closed_at', null)
    .limit(500);
  const open_channel_ids = (openRows || []).map((r) => String(r.channel_id)).filter(Boolean);

  let bot_user_id: string | null = cachedBotUser && Date.now() - cachedBotUser.at < BOT_ME_TTL_MS
    ? cachedBotUser.id
    : null;
  if (!bot_user_id) {
    try {
      const me = await discordGetMe();
      bot_user_id = String(me.id || '') || null;
      if (bot_user_id) cachedBotUser = { id: bot_user_id, at: Date.now() };
    } catch { /* ignore */ }
  }

  const guildId = getDiscordGuildId() || cfg?.guild_id || null;

  return NextResponse.json({
    ok: true,
    guild_id: guildId,
    staff_role_id: cfg?.staff_role_id || null,
    instructor_role_id: cfg?.instructor_role_id || null,
    required_role_id: getDiscordRequiredRoleId() || null,
    category_ids: cfg?.category_ids || {},
    panel_channel_id: cfg?.panel_channel_id || null,
    panel_message_id: cfg?.panel_message_id || null,
    logs_channel_id: cfg?.logs_channel_id || null,
    open_channel_ids,
    bot_user_id,
  });
}
