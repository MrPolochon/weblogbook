import { createAdminClient } from '@/lib/supabase/admin';
import { getSupportConfig } from '@/lib/support/bot-auth';
import {
  discordDeleteChannel,
  discordGetGuild,
  discordGetMessages,
  discordSendMessage,
} from '@/lib/support/discord-api';
import {
  firstStaffClaim,
  formatClosedBy,
  messagesFromConversation,
  motifLabel,
  newTranscriptToken,
  parseDiscordMessages,
  participantsOf,
  textTranscriptDump,
  transcriptPageUrl,
  unixSeconds,
  type TranscriptMessage,
} from '@/lib/support/transcript';

export async function closeSupportTicket(args: { channelId: string; closedBy: string }) {
  const admin = createAdminClient();
  const { data: ticket } = await admin
    .from('support_tickets')
    .select('*')
    .eq('channel_id', args.channelId)
    .maybeSingle();
  if (!ticket) return { ok: false as const, error: 'introuvable' };
  if (ticket.closed_at) return { ok: true as const, already: true };

  let messages: TranscriptMessage[] = [];
  try {
    const raw = await discordGetMessages(args.channelId, 400);
    messages = parseDiscordMessages(raw);
  } catch {
    messages = [];
  }
  if (messages.length === 0) {
    messages = messagesFromConversation(
      ticket.conversation,
      String(ticket.discord_username || ticket.discord_user_id || 'Membre'),
    );
  }

  const openerId = String(ticket.discord_user_id || '');
  const openerName = String(ticket.discord_username || openerId || 'Membre');
  const token = newTranscriptToken();
  const transcript = textTranscriptDump(
    String(ticket.short_id),
    String(ticket.motif),
    openerName,
    String(ticket.reason_text || ''),
    args.closedBy,
    messages,
  );

  const nowIso = new Date().toISOString();
  const { error: saveErr } = await admin
    .from('support_tickets')
    .update({
      closed_at: nowIso,
      closed_by: args.closedBy,
      transcript,
      transcript_token: token,
      transcript_messages: messages,
      updated_at: nowIso,
    })
    .eq('id', ticket.id);
  if (saveErr) {
    console.error('[close-ticket] save transcript', saveErr);
    await admin
      .from('support_tickets')
      .update({
        closed_at: nowIso,
        closed_by: args.closedBy,
        transcript,
        updated_at: nowIso,
      })
      .eq('id', ticket.id);
  }

  const cfg = await getSupportConfig();
  if (cfg?.logs_channel_id) {
    try {
      const guild = cfg.guild_id
        ? await discordGetGuild(String(cfg.guild_id)).catch(() => null)
        : null;
      const guildName = guild?.name || 'PTFR';
      const claimed = firstStaffClaim(messages, openerId);
      const closer = formatClosedBy(args.closedBy, openerId);
      const people = participantsOf(messages);
      const createdTs = unixSeconds(ticket.created_at as string);
      const closedTs = unixSeconds(new Date().toISOString());
      const claimedTs = claimed ? unixSeconds(claimed.at) : null;
      const url = transcriptPageUrl(token);

      const fields = [
        {
          name: 'Type',
          value: `${motifLabel(String(ticket.motif))} · panel tickets`,
          inline: false,
        },
        {
          name: 'Créé par',
          value: `<@${openerId}> — <t:${createdTs}:R>`,
          inline: false,
        },
        ...(claimed
          ? [
              {
                name: 'Pris en charge par',
                value: `<@${claimed.authorId}> — <t:${claimedTs}:R>`,
                inline: false,
              },
            ]
          : []),
        {
          name: 'Fermé par',
          value: `${closer.mention} — <t:${closedTs}:R>`,
          inline: false,
        },
        {
          name: 'Participants',
          value:
            people
              .slice(0, 12)
              .map((p) => {
                const who = p.bot ? `**${p.authorName}**` : `<@${p.authorId}>`;
                const n = p.count === 1 ? '1 message' : `${p.count} messages`;
                return `${n} · \`${p.authorId}\` ${who}`;
              })
              .join('\n')
              .slice(0, 1024) || '—',
          inline: false,
        },
      ];

      await discordSendMessage(cfg.logs_channel_id, '', {
        embeds: [
          {
            title: `Ticket #${ticket.short_id} · ${guildName}`,
            color: 0x5865f2,
            fields,
            timestamp: new Date().toISOString(),
          },
        ],
        components: [
          {
            type: 1,
            components: [
              {
                type: 2,
                style: 5,
                label: 'Transcript',
                url,
              },
            ],
          },
        ],
      });
    } catch (e) {
      console.error('[close-ticket] transcript Discord', e);
    }
  }

  try {
    await discordDeleteChannel(args.channelId);
  } catch { /* ignore */ }

  return { ok: true as const, already: false };
}
