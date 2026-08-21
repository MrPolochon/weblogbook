export const dynamic = 'force-dynamic';
import { NextRequest, NextResponse } from 'next/server';
import { assertSupportBotSecret, getSupportConfig } from '@/lib/support/bot-auth';

export async function GET(req: NextRequest) {
  const denied = assertSupportBotSecret(req);
  if (denied) return denied;
  const cfg = await getSupportConfig();
  return NextResponse.json({
    ok: true,
    guild_id: cfg?.guild_id || null,
    staff_role_id: cfg?.staff_role_id || null,
    instructor_role_id: cfg?.instructor_role_id || null,
    category_ids: cfg?.category_ids || {},
    panel_channel_id: cfg?.panel_channel_id || null,
    logs_channel_id: cfg?.logs_channel_id || null,
  });
}
