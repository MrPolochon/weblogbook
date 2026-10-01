import { randomUUID } from 'node:crypto';
import { createAdminClient } from '@/lib/supabase/admin';
import { getSupportConfig } from '@/lib/support/bot-auth';
import { closeSupportTicket } from '@/lib/support/close-ticket';
import { discordDeleteChannel, discordFetch } from '@/lib/support/discord-api';
import { assertResetTarget, executeTicketUpdateReset, type ResetItem } from '@/lib/support/update-reset-workflow';

const TABLE = 'support_ticket_update_resets';

/** Un ticket par passage pour respecter les limites Discord et Vercel. */
export async function processTicketUpdateReset() {
  const admin = createAdminClient();
  const now = new Date().toISOString();
  const { data: rows, error } = await admin.from(TABLE).select('*')
    .is('completed_at', null).lte('next_attempt_at', now)
    .or(`lease_until.is.null,lease_until.lt.${now}`)
    .order('requested_at').limit(1);
  // Tant que le SQL n'est pas appliqué, aucune suppression n'est autorisée.
  if (error?.code === '42P01' || error?.code === 'PGRST205') return { status: 'migration_required' };
  if (error) throw new Error(error.message);
  if (!rows?.length) return { status: 'idle' };

  const lease = randomUUID();
  const { data: claimed, error: claimError } = await admin.from(TABLE)
    .update({ lease_token: lease, lease_until: new Date(Date.now() + 5 * 60_000).toISOString() })
    .eq('ticket_id', rows[0].ticket_id).is('completed_at', null).lte('next_attempt_at', now)
    .or(`lease_until.is.null,lease_until.lt.${now}`).select('*');
  if (claimError) throw new Error(claimError.message);
  if (!claimed?.length) return { status: 'busy' };
  // Utiliser les étapes effectivement enregistrées au moment de la prise du verrou.
  const item = claimed[0] as ResetItem;

  const save = async (patch: Record<string, unknown>) => {
    const { data, error: saveError } = await admin.from(TABLE).update(patch)
      .eq('ticket_id', item.ticket_id).eq('lease_token', lease).select('ticket_id');
    if (saveError || !data?.length) throw new Error(saveError?.message || 'Verrou de réinitialisation perdu');
  };
  try {
    const cfg = await getSupportConfig();
    if (!cfg?.guild_id || !cfg.panel_channel_id) throw new Error('Configuration du serveur/panel manquante');
    const { data: ticket, error: ticketError } = await admin.from('support_tickets')
      .select('channel_id, discord_user_id, short_id, created_at').eq('id', item.ticket_id).single();
    if (ticketError || !ticket) throw new Error('Ticket cible introuvable');
    // Borne immuable, indépendante de la date du prochain déploiement/redémarrage.
    assertResetTarget(ticket, [cfg.panel_channel_id, cfg.logs_channel_id, ...Object.values(cfg.category_ids || {})]);
    const link = `https://discord.com/channels/${cfg.guild_id}/${cfg.panel_channel_id}`;
    const result = await executeTicketUpdateReset(item, {
      save,
      validateChannel: async () => {
        try {
          const channel = await discordFetch(`/channels/${ticket.channel_id}`);
          if (String(channel.guild_id) !== String(cfg.guild_id) || channel.type !== 0) {
            throw new Error('Ce salon ne correspond pas à un ticket texte du serveur configuré');
          }
        } catch (error) {
          if ((error as { status?: number }).status !== 404) throw error;
        }
      },
      archive: async () => {
        const result = await closeSupportTicket({
          channelId: ticket.channel_id, closedBy: 'mise_a_jour_bot', deleteChannel: false, requireDiscordHistory: true,
        });
        if (!result.ok) throw new Error('Archivage impossible');
      },
      deleteChannel: async () => {
        try {
          await discordDeleteChannel(ticket.channel_id);
        } catch (error) {
          if ((error as { status?: number }).status !== 404) throw error;
        }
      },
      notify: async () => {
        const dm = await discordFetch('/users/@me/channels', {
          method: 'POST', body: JSON.stringify({ recipient_id: ticket.discord_user_id }),
        });
        await discordFetch(`/channels/${dm.id}/messages`, {
          method: 'POST',
          body: JSON.stringify({
            content: `Bonjour ! Ton ticket #${ticket.short_id} a été supprimé à la suite d’une mise à jour de PTFR Assistance. Merci d’ouvrir un nouveau ticket depuis le panneau d’assistance pour poursuivre ta demande : ${link}`,
            allowed_mentions: { parse: [] },
            nonce: `upd${ticket.channel_id}`, enforce_nonce: true,
          }),
        });
      },
      isDmUnavailable: (error) => (error as { code?: number }).code === 50007,
    });
    console.info('[support-update-reset]', { ticketId: item.ticket_id, ...result });
    return { status: 'processed', ticket_id: item.ticket_id, ...result };
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Erreur de réinitialisation';
    await save({ last_error: message.slice(0, 300), next_attempt_at: new Date(Date.now() + 5 * 60_000).toISOString(), lease_until: null, lease_token: null });
    console.error('[support-update-reset]', { ticketId: item.ticket_id, error: message });
    return { status: 'retry', ticket_id: item.ticket_id, error: message };
  }
}
