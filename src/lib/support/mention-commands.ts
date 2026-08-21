import { createAdminClient } from '@/lib/supabase/admin';
import { getSupportConfig } from '@/lib/support/bot-auth';
import { ticketChannelNameWithLabel } from '@/lib/support/channel-naming';
import { closeSupportTicket } from '@/lib/support/close-ticket';
import {
  discordMoveChannel,
  discordRenameChannel,
  discordSendMessage,
  isDiscordPermissionError,
  isDiscordRateLimit,
} from '@/lib/support/discord-api';
import { escalateTicketToStaff } from '@/lib/support/escalate';
import {
  mentionActionAllowed,
  OPENER_LABEL,
  type MentionActor,
  type MentionIntent,
} from '@/lib/support/mention-actions';
import { SUPPORT_MOTIFS, type SupportStatus } from '@/lib/support/motifs';
import { RESOLUTION_PANEL_TEXT, TICKET_ACTION_COMPONENTS } from '@/lib/support/ticket-actions';

export type MentionCommandTicket = {
  id: string;
  short_id: string;
  statut: string | null;
  motif: string | null;
  discord_username: string | null;
  discord_user_id: string | null;
};

export type MentionCommandResult = {
  /** Le ticket a été fermé : le salon disparaît, plus rien à poster. */
  closed?: boolean;
  escalated?: boolean;
  /** Message déjà posté dans le salon par l'exécuteur. */
  posted: boolean;
  /** Une proposition de clôture avec boutons vient d'être postée. */
  offeredResolution?: boolean;
  action: MentionIntent['id'];
};

const STATUSES: SupportStatus[] = ['ia', 'staff_needed', 'waiting', 'staff'];

function safeStatus(raw: string | null): SupportStatus {
  return STATUSES.includes(raw as SupportStatus) ? (raw as SupportStatus) : 'ia';
}

function motifLabel(id: string): string {
  return SUPPORT_MOTIFS.find((m) => m.id === id)?.label || id;
}

async function post(channelId: string, text: string) {
  try {
    await discordSendMessage(channelId, text);
  } catch (e) {
    console.error('[mention-command] envoi Discord', e);
  }
}

/**
 * Exécute une commande adressée au bot par mention.
 * Chaque branche réutilise un chemin déjà en place ; rien n'est réimplémenté.
 */
export async function runMentionCommand(args: {
  intent: MentionIntent;
  actor: MentionActor;
  channelId: string;
  ticket: MentionCommandTicket;
  authorDiscordId: string;
}): Promise<MentionCommandResult> {
  const { intent, actor, channelId, ticket } = args;

  if (!mentionActionAllowed(intent, actor)) {
    await post(channelId, 'Cette action est réservée au staff.');
    return { posted: true, action: intent.id };
  }

  if (intent.id === 'unsure') {
    if (intent.about === 'close') {
      // Jamais de fermeture sur un doute : on repose la question avec les
      // boutons habituels, qui sont eux sans ambiguïté.
      try {
        await discordSendMessage(channelId, RESOLUTION_PANEL_TEXT, {
          components: TICKET_ACTION_COMPONENTS,
        });
      } catch (e) {
        console.error('[mention-command] panneau de confirmation', e);
      }
      return { posted: true, offeredResolution: true, action: 'unsure' };
    }
    await post(
      channelId,
      intent.about === 'rename'
        ? 'Je n’ai pas compris le nouveau nom. Dis-moi par exemple « change le nom du ticket par le pseudo de celui qui l’a ouvert » ou « renomme le ticket en licence-cat2 ».'
        : `Dans quelle section ? Les sections possibles sont : ${SUPPORT_MOTIFS.map((m) => m.label).join(', ')}.`,
    );
    return { posted: true, action: 'unsure' };
  }

  if (intent.id === 'close') {
    await post(channelId, 'Entendu, je ferme le ticket. Bons vols !');
    // Exactement le chemin de /ticketdel et du bouton « C'est résolu ».
    await closeSupportTicket({
      channelId,
      closedBy: actor === 'staff' ? `staff:${args.authorDiscordId}` : `user:${args.authorDiscordId || 'unknown'}`,
    });
    return { closed: true, posted: true, action: 'close' };
  }

  if (intent.id === 'staff') {
    await escalateTicketToStaff(channelId, 'Le membre demande un staff.');
    return { escalated: true, posted: true, action: 'staff' };
  }

  if (intent.id === 'rename') {
    const raw = intent.label === OPENER_LABEL ? ticket.discord_username || '' : intent.label;
    const name = ticketChannelNameWithLabel(safeStatus(ticket.statut), ticket.short_id, raw);
    if (name === ticketChannelNameWithLabel(safeStatus(ticket.statut), ticket.short_id, '')) {
      await post(
        channelId,
        `Le pseudo « ${raw || '?'} » ne donne aucun caractère utilisable dans un nom de salon Discord. Donne-moi un nom en lettres, par exemple « renomme le ticket en licence-cat2 ».`,
      );
      return { posted: true, action: 'rename' };
    }
    try {
      await discordRenameChannel(channelId, name);
    } catch (e) {
      console.error('[mention-command] renommage', e);
      await post(
        channelId,
        isDiscordRateLimit(e)
          ? 'Discord limite les renommages de salon (environ 2 par 10 minutes). Réessaie dans quelques minutes.'
          : isDiscordPermissionError(e)
            ? 'Je n’ai pas la permission **Gérer les salons** sur ce salon : un admin doit me l’accorder pour que je puisse le renommer.'
            : 'Le renommage a échoué côté Discord. Réessaie dans un instant.',
      );
      return { posted: true, action: 'rename' };
    }
    await post(channelId, `C’est fait, le salon s’appelle maintenant **${name}**.`);
    return { posted: true, action: 'rename' };
  }

  // intent.id === 'move'
  const cfg = await getSupportConfig();
  const categories = (cfg?.category_ids || {}) as Record<string, string>;
  const parentId = categories[intent.motif];
  if (!parentId) {
    await post(
      channelId,
      `La section « ${motifLabel(intent.motif)} » n’existe pas dans la configuration du site. Un admin doit la provisionner depuis la page d’administration du bot.`,
    );
    return { posted: true, action: 'move' };
  }
  try {
    await discordMoveChannel(channelId, parentId);
  } catch (e) {
    console.error('[mention-command] déplacement', e);
    await post(
      channelId,
      isDiscordPermissionError(e)
        ? 'Je n’ai pas la permission **Gérer les salons** : un admin doit me l’accorder pour déplacer ce ticket.'
        : 'Le déplacement a échoué côté Discord. Réessaie dans un instant.',
    );
    return { posted: true, action: 'move' };
  }
  const admin = createAdminClient();
  await admin
    .from('support_tickets')
    .update({ motif: intent.motif, updated_at: new Date().toISOString() })
    .eq('id', ticket.id);
  await post(channelId, `Ticket déplacé dans la section **${motifLabel(intent.motif)}**.`);
  return { posted: true, action: 'move' };
}
