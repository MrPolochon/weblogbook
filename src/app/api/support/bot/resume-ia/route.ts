export const dynamic = 'force-dynamic';
import { NextRequest, NextResponse } from 'next/server';
import { assertSupportBotSecret } from '@/lib/support/bot-auth';
import { discordSendMessage } from '@/lib/support/discord-api';
import { resumeIaOnTicket } from '@/lib/support/resume-ia';
import { IA_RESUMED_NOTICE } from '@/lib/support/staff-takeover';

/** Filet gateway de `/ticketia` : le bot Python appelle le site quand l'endpoint
 *  HTTP Interactions n'est pas configuré. Même effet que la commande slash. */
export async function POST(req: NextRequest) {
  const denied = assertSupportBotSecret(req);
  if (denied) return denied;

  const body = await req.json().catch(() => ({}));
  const channelId = String(body.channel_id || '');
  if (!channelId) return NextResponse.json({ error: 'channel_id requis' }, { status: 400 });

  const result = await resumeIaOnTicket(channelId);
  if (!result.ok) return NextResponse.json({ error: 'Ticket introuvable' }, { status: 404 });
  if (!result.already) {
    try {
      await discordSendMessage(channelId, IA_RESUMED_NOTICE);
    } catch { /* ignore */ }
  }
  return NextResponse.json({ ok: true, already: result.already, short_id: result.short_id });
}
