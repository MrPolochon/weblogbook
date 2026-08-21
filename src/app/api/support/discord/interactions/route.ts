export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
export const maxDuration = 30;

import { NextResponse } from 'next/server';
import { waitUntil } from '@vercel/functions';
import { createAdminClient } from '@/lib/supabase/admin';
import { getSupportConfig } from '@/lib/support/bot-auth';
import { closeSupportTicket } from '@/lib/support/close-ticket';
import { discordRenameChannel, discordSendMessage } from '@/lib/support/discord-api';
import {
  discordCreateInteractionFollowup,
  discordEditOriginalInteraction,
  getDiscordApplicationId,
  getDiscordPublicKey,
  verifyDiscordSignature,
} from '@/lib/support/discord-verify';
import { motifUsesInstructor, ticketChannelName } from '@/lib/support/motifs';
import { openSupportTicket } from '@/lib/support/open-ticket';
import { withResolutionOfferedNote } from '@/lib/support/ticket-actions';

const PING = 1;
const APPLICATION_COMMAND = 2;
const MESSAGE_COMPONENT = 3;
const MODAL_SUBMIT = 5;
const PONG = 1;
const DEFERRED_CHANNEL_MESSAGE = 5;
const DEFERRED_UPDATE = 6;
const MODAL = 9;
const EPHEMERAL = 64;
const TICKETDEL_COMMAND = 'ticketdel';

const OPEN_TICKET_BUTTON = 'support_open_ticket';
const REASON_MODAL = 'support_ticket_reason';
const REASON_INPUT = 'reason';

type DiscordUser = { id?: string; username?: string; global_name?: string; discriminator?: string };
type DiscordMember = { user?: DiscordUser; roles?: string[]; permissions?: string };
type DiscordInteraction = {
  type: number;
  token: string;
  application_id?: string;
  channel_id?: string;
  guild_id?: string;
  user?: DiscordUser;
  member?: DiscordMember;
  data?: {
    name?: string;
    custom_id?: string;
    component_type?: number;
    components?: Array<{ components?: Array<{ custom_id?: string; value?: string }> }>;
  };
};

function invalidSignature() {
  return new NextResponse('invalid request signature', { status: 401 });
}

function json(data: unknown, status = 200) {
  return NextResponse.json(data, { status });
}

function interactionUser(interaction: DiscordInteraction): DiscordUser | undefined {
  return interaction.member?.user || interaction.user;
}

function modalValue(interaction: DiscordInteraction, fieldId: string): string {
  const rows = interaction.data?.components || [];
  for (const row of rows) {
    for (const c of row.components || []) {
      if (c.custom_id === fieldId) return String(c.value || '').trim();
    }
  }
  for (const row of rows) {
    const first = row.components?.[0];
    if (first?.value) return String(first.value).trim();
  }
  return '';
}

function memberIsStaff(member: DiscordMember | undefined, staffRoleIds: string[]): boolean {
  if (!member) return false;
  const roles = (member.roles || []).map(String);
  if (staffRoleIds.some((id) => id && roles.includes(String(id)))) return true;
  try {
    const perms = BigInt(member.permissions || '0');
    const manageChannels = BigInt(16);
    return (perms & manageChannels) === manageChannels;
  } catch {
    return false;
  }
}

function usernameOf(user: DiscordUser | undefined): string {
  if (!user) return '';
  if (user.global_name) return String(user.global_name);
  const disc = user.discriminator && user.discriminator !== '0' ? `#${user.discriminator}` : '';
  return `${user.username || user.id || ''}${disc}`;
}

function reasonModal() {
  return {
    type: MODAL,
    data: {
      custom_id: REASON_MODAL,
      title: 'Ouvrir un ticket',
      components: [
        {
          type: 1,
          components: [
            {
              type: 4,
              custom_id: REASON_INPUT,
              label: 'Quelle est la raison de votre ticket ?',
              style: 2,
              required: true,
              max_length: 1000,
            },
          ],
        },
      ],
    },
  };
}

async function patchOriginal(interaction: DiscordInteraction, content: string) {
  const appId = await getDiscordApplicationId(interaction.application_id);
  if (!appId) throw new Error('application id manquant');
  await discordEditOriginalInteraction(appId, interaction.token, { content });
}

async function followupEphemeral(interaction: DiscordInteraction, content: string) {
  const appId = await getDiscordApplicationId(interaction.application_id);
  if (!appId) throw new Error('application id manquant');
  await discordCreateInteractionFollowup(appId, interaction.token, { content, flags: EPHEMERAL });
}

async function finishOpenTicket(interaction: DiscordInteraction) {
  try {
    const user = interactionUser(interaction);
    const reason = modalValue(interaction, REASON_INPUT);
    if (!user?.id || !reason) {
      await patchOriginal(interaction, 'Raison manquante — réessaie le bouton du panel.');
      return;
    }
    const result = await openSupportTicket({
      discordUserId: String(user.id),
      discordUsername: usernameOf(user),
      reason,
    });
    if (result.ok) {
      await patchOriginal(interaction, `Ticket créé : <#${result.channel_id}>`);
      return;
    }
    if (result.status === 409) {
      await patchOriginal(
        interaction,
        result.channel_id
          ? `Tu as déjà un ticket ouvert : <#${result.channel_id}>`
          : result.message || 'Ticket déjà ouvert.'
      );
      return;
    }
    await patchOriginal(interaction, result.error || "Impossible d'ouvrir le ticket.");
  } catch (e) {
    console.error('[support-interactions] open ticket', e);
    try {
      await patchOriginal(interaction, "Impossible d'ouvrir le ticket (erreur serveur).");
    } catch { /* ignore */ }
  }
}

async function pingStaff(channelId: string) {
  const cfg = await getSupportConfig();
  const admin = createAdminClient();
  const { data: ticket } = await admin
    .from('support_tickets')
    .select('*')
    .eq('channel_id', channelId)
    .is('closed_at', null)
    .maybeSingle();
  if (ticket) {
    await admin
      .from('support_tickets')
      .update({
        statut: 'staff_needed',
        resolution_offered: false,
        memory_notes: withResolutionOfferedNote(String(ticket.memory_notes || ''), false),
        updated_at: new Date().toISOString(),
      })
      .eq('id', ticket.id);
    try {
      await discordRenameChannel(channelId, ticketChannelName('staff_needed', ticket.short_id));
    } catch { /* ignore */ }
  }
  const pings: string[] = [];
  if (cfg?.staff_role_id) pings.push(`<@&${cfg.staff_role_id}>`);
  if (
    ticket &&
    cfg?.instructor_role_id &&
    motifUsesInstructor(String(ticket.motif), cfg.instructor_motifs as string[] | null)
  ) {
    pings.push(`<@&${cfg.instructor_role_id}>`);
  }
  const who =
    ticket && cfg?.instructor_role_id && motifUsesInstructor(String(ticket.motif), cfg.instructor_motifs as string[] | null)
      ? 'Un staff / instructeur est requis.'
      : 'Un staff est requis.';
  await discordSendMessage(
    channelId,
    `${[...new Set(pings)].join(' ')} **${who}** L'utilisateur indique que ce n'est pas résolu.`.trim()
  );
}

async function finishTicketDel(interaction: DiscordInteraction) {
  try {
    const channelId = String(interaction.channel_id || '');
    const user = interactionUser(interaction);
    const cfg = await getSupportConfig();
    const staffIds = [cfg?.staff_role_id, cfg?.instructor_role_id].filter(Boolean).map(String);
    if (!memberIsStaff(interaction.member, staffIds)) {
      await patchOriginal(interaction, 'Staff uniquement.');
      return;
    }
    if (!channelId) {
      await patchOriginal(interaction, 'Salon introuvable.');
      return;
    }
    const result = await closeSupportTicket({
      channelId,
      closedBy: `staff:${user?.id || 'unknown'}`,
    });
    if (!result.ok) {
      await patchOriginal(interaction, 'Cette commande ne fonctionne que dans un salon ticket.');
      return;
    }
    await patchOriginal(interaction, result.already ? 'Ticket déjà fermé.' : 'Ticket fermé.');
  } catch (e) {
    console.error('[support-interactions] ticketdel', e);
    try {
      await patchOriginal(interaction, 'Impossible de fermer le ticket (erreur serveur).');
    } catch { /* ignore */ }
  }
}

async function finishTicketAction(interaction: DiscordInteraction, customId: string) {
  try {
    const channelId = String(interaction.channel_id || '');
    const user = interactionUser(interaction);
    if (!channelId) {
      await followupEphemeral(interaction, 'Salon introuvable.');
      return;
    }
    if (customId === 'support_resolved') {
      const result = await closeSupportTicket({
        channelId,
        closedBy: `user:${user?.id || 'unknown'}`,
      });
      await followupEphemeral(interaction, result.ok ? 'Ticket fermé. Merci !' : 'Ticket introuvable.');
      return;
    }
    if (customId === 'support_need_staff') {
      await pingStaff(channelId);
      await followupEphemeral(interaction, 'Un staff a été appelé.');
      return;
    }
    if (customId === 'support_staff_close') {
      const cfg = await getSupportConfig();
      const staffIds = [cfg?.staff_role_id, cfg?.instructor_role_id].filter(Boolean).map(String);
      if (!memberIsStaff(interaction.member, staffIds)) {
        await followupEphemeral(interaction, 'Staff uniquement.');
        return;
      }
      const result = await closeSupportTicket({
        channelId,
        closedBy: `staff:${user?.id || 'unknown'}`,
      });
      await followupEphemeral(interaction, result.ok ? 'Ticket fermé.' : 'Ticket introuvable.');
    }
  } catch (e) {
    console.error('[support-interactions] ticket action', customId, e);
    try {
      await followupEphemeral(interaction, 'Action impossible (erreur serveur).');
    } catch { /* ignore */ }
  }
}

export async function GET() {
  return NextResponse.json({
    ok: true,
    service: 'discord-interactions',
    configured: Boolean(getDiscordPublicKey()),
  });
}

export async function POST(req: Request) {
  const signature = req.headers.get('x-signature-ed25519') || '';
  const timestamp = req.headers.get('x-signature-timestamp') || '';
  const rawBody = await req.text();

  const publicKey = getDiscordPublicKey();
  if (!publicKey) {
    console.error(
      '[support-interactions] DISCORD_PUBLIC_KEY manquant ou invalide. Collez la Public Key hex (General Information), pas le token bot.'
    );
    return invalidSignature();
  }
  if (!signature || !timestamp || !verifyDiscordSignature(publicKey, signature, timestamp, rawBody)) {
    return invalidSignature();
  }

  let interaction: DiscordInteraction;
  try {
    interaction = JSON.parse(rawBody) as DiscordInteraction;
  } catch {
    return invalidSignature();
  }

  if (interaction.type === PING) {
    return json({ type: PONG });
  }

  const customId = String(interaction.data?.custom_id || '');
  const commandName = String(interaction.data?.name || '');

  if (interaction.type === APPLICATION_COMMAND && commandName === TICKETDEL_COMMAND) {
    waitUntil(finishTicketDel(interaction));
    return json({ type: DEFERRED_CHANNEL_MESSAGE, data: { flags: EPHEMERAL } });
  }

  if (interaction.type === MESSAGE_COMPONENT && customId === OPEN_TICKET_BUTTON) {
    return json(reasonModal());
  }

  if (interaction.type === MODAL_SUBMIT && customId === REASON_MODAL) {
    waitUntil(finishOpenTicket(interaction));
    return json({ type: DEFERRED_CHANNEL_MESSAGE, data: { flags: EPHEMERAL } });
  }

  if (
    interaction.type === MESSAGE_COMPONENT &&
    (customId === 'support_resolved' || customId === 'support_need_staff' || customId === 'support_staff_close')
  ) {
    waitUntil(finishTicketAction(interaction, customId));
    // Type 6 = ACK du bouton (< 3 s) sans toucher au message. Follow-up éphémère ensuite.
    // Si l’Interactions Endpoint URL est configuré, Discord envoie ces clics ici ;
    // sinon le View Python persistant (TicketActions) les gère sur le gateway.
    return json({ type: DEFERRED_UPDATE });
  }

  return json({
    type: 4,
    data: { content: 'Action non reconnue.', flags: EPHEMERAL },
  });
}
