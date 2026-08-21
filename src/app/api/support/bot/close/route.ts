export const dynamic = 'force-dynamic';
import { NextRequest, NextResponse } from 'next/server';
import { assertSupportBotSecret } from '@/lib/support/bot-auth';
import { closeSupportTicket } from '@/lib/support/close-ticket';

export async function POST(req: NextRequest) {
  const denied = assertSupportBotSecret(req);
  if (denied) return denied;

  const body = await req.json().catch(() => ({}));
  const channelId = String(body.channel_id || '');
  const closedBy = String(body.closed_by || 'ia');
  if (!channelId) return NextResponse.json({ error: 'channel_id requis' }, { status: 400 });

  const result = await closeSupportTicket({ channelId, closedBy });
  if (!result.ok) return NextResponse.json({ error: 'Ticket introuvable' }, { status: 404 });
  return NextResponse.json({ ok: true, already: result.already });
}
