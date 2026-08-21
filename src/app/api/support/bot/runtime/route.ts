export const dynamic = 'force-dynamic';
import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { assertSupportBotSecret, getSupportConfig } from '@/lib/support/bot-auth';
import { discordGetMe, ensureTicketDelGuildCommand } from '@/lib/support/discord-api';

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

  let bot_user_id: string | null = null;
  try {
    const me = await discordGetMe();
    bot_user_id = String(me.id || '') || null;
  } catch { /* ignore */ }

  await ensureTicketDelGuildCommand(cfg?.guild_id);

  return NextResponse.json({
    ok: true,
    guild_id: cfg?.guild_id || null,
    staff_role_id: cfg?.staff_role_id || null,
    instructor_role_id: cfg?.instructor_role_id || null,
    category_ids: cfg?.category_ids || {},
    panel_channel_id: cfg?.panel_channel_id || null,
    panel_message_id: cfg?.panel_message_id || null,
    logs_channel_id: cfg?.logs_channel_id || null,
    open_channel_ids,
    bot_user_id,
  });
}
