import { createAdminClient } from '@/lib/supabase/admin';
import { getSupportConfig } from '@/lib/support/bot-auth';
import { discordDeleteChannel, discordGetMessages, discordSendMessage } from '@/lib/support/discord-api';

export async function closeSupportTicket(args: { channelId: string; closedBy: string }) {
  const admin = createAdminClient();
  const { data: ticket } = await admin
    .from('support_tickets')
    .select('*')
    .eq('channel_id', args.channelId)
    .maybeSingle();
  if (!ticket) return { ok: false as const, error: 'introuvable' };
  if (ticket.closed_at) return { ok: true as const, already: true };

  let transcript = `Ticket ${ticket.short_id} | motif ${ticket.motif} | ${ticket.discord_username || ticket.discord_user_id}\nRaison: ${ticket.reason_text || ''}\nFermé par: ${args.closedBy}\n\n`;
  try {
    const msgs = await discordGetMessages(args.channelId, 100);
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
      closed_by: args.closedBy,
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
        `**Transcript ticket \`${ticket.short_id}\`** (${ticket.motif}) fermé par ${args.closedBy}\n\`\`\`\n${chunk}\n\`\`\``
      );
    } catch { /* ignore */ }
  }

  try {
    await discordDeleteChannel(args.channelId);
  } catch { /* ignore */ }

  return { ok: true as const, already: false };
}
