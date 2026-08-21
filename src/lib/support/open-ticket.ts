import { createAdminClient } from '@/lib/supabase/admin';
import { getSupportConfig } from '@/lib/support/bot-auth';
import { classifyMotifFromText, motifUsesInstructor, ticketChannelName, type SupportMotifId } from '@/lib/support/motifs';
import { discordCreateTextChannel, discordGetMe, discordSendMessage, DISCORD_TICKET_ALLOW } from '@/lib/support/discord-api';
import { extractFacts } from '@/lib/support/ticket-memory';

function shortId(): string {
  return Math.random().toString(36).slice(2, 6);
}

/** Premier message IA : accueil + « comment je peux t’aider ? » — le motif reste interne (catégorie). */
function ticketGreeting(discordUserId: string, reason: string): string {
  const snippet = reason.slice(0, 300);
  return `Salut <@${discordUserId}> ! Je suis l’assistance PTFR. Tu as indiqué : *${snippet}* — dis-moi comment je peux t’aider.`;
}

export type OpenTicketOk = { ok: true; channel_id: string; motif: string; short_id: string };
export type OpenTicketErr = {
  ok: false;
  status: number;
  error: string;
  channel_id?: string;
  message?: string;
};
export type OpenTicketResult = OpenTicketOk | OpenTicketErr;

export async function openSupportTicket(args: {
  discordUserId: string;
  discordUsername: string;
  reason: string;
}): Promise<OpenTicketResult> {
  const discordUserId = String(args.discordUserId || '');
  const discordUsername = String(args.discordUsername || '');
  const reason = String(args.reason || '').trim();
  if (!discordUserId || !reason) {
    return { ok: false, status: 400, error: 'discord_user_id et reason requis' };
  }

  const cfg = await getSupportConfig();
  if (!cfg?.guild_id || !cfg.staff_role_id) {
    return { ok: false, status: 400, error: 'Bot non configuré sur le site' };
  }

  const admin = createAdminClient();
  const { data: existing } = await admin
    .from('support_tickets')
    .select('channel_id, short_id, motif')
    .eq('discord_user_id', discordUserId)
    .is('closed_at', null)
    .maybeSingle();
  if (existing) {
    return {
      ok: false,
      status: 409,
      error: 'already_open',
      channel_id: existing.channel_id,
      message: 'Vous avez déjà un ticket ouvert.',
    };
  }

  const motif = classifyMotifFromText(reason) as SupportMotifId;
  const categoryIds = (cfg.category_ids || {}) as Record<string, string>;
  const parentId = categoryIds[motif] || categoryIds.assistance;
  if (!parentId) {
    return { ok: false, status: 400, error: 'Sections Discord manquantes — re-provisionnez la config' };
  }

  const sid = shortId();
  const everyone = cfg.guild_id;
  let botId = '';
  try {
    const me = await discordGetMe();
    botId = String(me.id || '');
  } catch { /* ignore */ }
  const overwrites = [
    { id: everyone, type: 0, deny: '1024' },
    { id: discordUserId, type: 1, allow: DISCORD_TICKET_ALLOW },
    { id: cfg.staff_role_id, type: 0, allow: DISCORD_TICKET_ALLOW },
    ...(cfg.instructor_role_id &&
    String(cfg.instructor_role_id) !== String(cfg.staff_role_id) &&
    motifUsesInstructor(motif, cfg.instructor_motifs as string[] | null)
      ? [{ id: String(cfg.instructor_role_id), type: 0, allow: DISCORD_TICKET_ALLOW }]
      : []),
    ...(botId ? [{ id: botId, type: 1, allow: DISCORD_TICKET_ALLOW }] : []),
  ];

  try {
    const ch = await discordCreateTextChannel({
      guildId: cfg.guild_id,
      name: ticketChannelName('ia', sid),
      parentId,
      topic: reason.slice(0, 200),
      overwrites,
    });

    const { data: link } = await admin
      .from('discord_links')
      .select('user_id')
      .eq('discord_user_id', discordUserId)
      .eq('status', 'active')
      .maybeSingle();

    const greeting = ticketGreeting(discordUserId, reason);

    await admin.from('support_tickets').insert({
      short_id: sid,
      discord_user_id: discordUserId,
      discord_username: discordUsername,
      channel_id: ch.id,
      motif,
      statut: 'ia',
      reason_text: reason,
      user_id: link?.user_id ?? null,
      conversation: [
        { role: 'user', content: reason },
        { role: 'assistant', content: greeting },
      ],
      memory_notes: extractFacts(reason).join('\n') || null,
      last_human_at: new Date().toISOString(),
      inactivity_nudge: 0,
    });

    // Pas de boutons ici : le panneau n'apparaît que lorsque l'IA croit avoir résolu.
    await discordSendMessage(ch.id, greeting);

    return { ok: true, channel_id: ch.id, motif, short_id: sid };
  } catch (e) {
    return {
      ok: false,
      status: 502,
      error: e instanceof Error ? e.message : 'Création salon impossible',
    };
  }
}
