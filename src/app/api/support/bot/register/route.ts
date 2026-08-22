import { NextRequest, NextResponse } from 'next/server';
import { createSiteAccountFromDiscord } from '@/lib/auth/create-discord-account';
import { assertSupportBotSecret } from '@/lib/support/bot-auth';

export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  const denied = assertSupportBotSecret(req);
  if (denied) return denied;

  const body = await req.json().catch(() => ({}));

  const result = await createSiteAccountFromDiscord({
    identifiant: String(body.identifiant || ''),
    password: String(body.mot_de_passe || body.password || ''),
    discordId: String(body.discord_id || body.discord_user_id || ''),
    discordUsername: String(body.discord_username || ''),
    discordAvatar: String(body.discord_avatar || ''),
  });

  if (!result.ok) {
    return NextResponse.json({ ok: false, error: result.error, ...result.extra }, { status: result.status });
  }
  return NextResponse.json(result);
}
