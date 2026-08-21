export const dynamic = 'force-dynamic';
import { NextRequest, NextResponse } from 'next/server';
import { assertSupportBotSecret } from '@/lib/support/bot-auth';
import { openSupportTicket } from '@/lib/support/open-ticket';

export async function POST(req: NextRequest) {
  const denied = assertSupportBotSecret(req);
  if (denied) return denied;

  const body = await req.json().catch(() => ({}));
  const result = await openSupportTicket({
    discordUserId: String(body.discord_user_id || ''),
    discordUsername: String(body.discord_username || ''),
    reason: String(body.reason || ''),
  });

  if (!result.ok) {
    return NextResponse.json(
      {
        error: result.error,
        channel_id: result.channel_id,
        message: result.message,
      },
      { status: result.status }
    );
  }
  return NextResponse.json({ ok: true, channel_id: result.channel_id, motif: result.motif, short_id: result.short_id });
}
