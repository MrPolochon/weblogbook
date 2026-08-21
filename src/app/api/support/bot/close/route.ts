export const dynamic = 'force-dynamic';
import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { assertSupportBotSecret, getSupportConfig } from '@/lib/support/bot-auth';
import { discordDeleteChannel, discordGetMessages, discordSendMessage } from '@/lib/support/discord-api';

export async function POST(req: NextRequest) {
  const denied = assertSupportBotSecret(req);
  if (denied) return denied;

  const body = await req.json().catch(() => ({}));
  const channelId = String(body.channel_id || '');
  const closedBy = String(body.closed_by || 'ia');
  if (!channelId) return NextResponse.json({ error: 'channel_id requis' }, { status: 400 });

  const admin = createAdminClient();
  const { data: ticket } = await admin
    .from('support_tickets')
    .select('*')
    .eq('channel_id', channelId)
    .maybeSingle();
  if (!ticket) return NextResponse.json({ error: 'Ticket introuvable' }, { status: 404 });
  if (ticket.closed_at) return NextResponse.json({ ok: true, already: true });

  let transcript = `Ticket ${ticket.short_id} | motif ${ticket.motif} | ${ticket.discord_username || ticket.discord_user_id}\nRaison: ${ticket.reason_text || ''}\nFermé par: ${closedBy}\n\n`;
  try {
    const msgs = await discordGetMessages(channelId, 100);
    if (Array.isArray(msgs)) {
      const ordered = [...msgs].reverse();
      for (const m of ordered) {
        const who = m.author?.bot ? '[BOT]' : (m.author?.username || m.author?.id);
        transcript += `[${m.timestamp}] ${who}: ${m.content || ''}\n`;
      }
    }
  } catch {
    transcript += '(messages Discord illisibles)\n';
  }

  await admin
    .from('support_tickets')
    .update({
      closed_at: new Date().toISOString(),
      closed_by: closedBy,
      transcript,
      updated_at: new Date().toISOString(),
    })
    .eq('id', ticket.id);

  const cfg = await getSupportConfig();
  if (cfg?.logs_channel_id) {
    try {
      const chunk = transcript.slice(0, 1800);
      await discordSendMessage(
        cfg.logs_channel_id,
        `**Transcript ticket \`${ticket.short_id}\`** (${ticket.motif}) fermé par ${closedBy}\n\`\`\`\n${chunk}\n\`\`\``
      );
    } catch { /* ignore */ }
  }

  try {
    await discordDeleteChannel(channelId);
  } catch { /* ignore */ }

  return NextResponse.json({ ok: true });
}
