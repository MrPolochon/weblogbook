import { createAdminClient } from '@/lib/supabase/admin';
import { discordRenameChannel } from '@/lib/support/discord-api';
import { ticketChannelName } from '@/lib/support/motifs';

/** Remise à zéro de l'état de relais : le bot redevient actif sur le ticket. */
export const IA_RESUME_PATCH = {
  staff_takeover_at: null as string | null,
  staff_takeover_notified: false,
};

export type ResumeIaResult =
  | { ok: false }
  | { ok: true; already: boolean; short_id: string };

/**
 * Rend la main à l'IA sur un ticket (commande `/ticketia`).
 * `already` = l'IA n'était pas muette, la commande n'a rien changé.
 */
export async function resumeIaOnTicket(channelId: string): Promise<ResumeIaResult> {
  const admin = createAdminClient();
  const { data: ticket } = await admin
    .from('support_tickets')
    .select('id, short_id, staff_takeover_at')
    .eq('channel_id', channelId)
    .is('closed_at', null)
    .maybeSingle();
  if (!ticket) return { ok: false };

  const already = !ticket.staff_takeover_at;
  await admin
    .from('support_tickets')
    .update({
      ...IA_RESUME_PATCH,
      statut: 'ia',
      staff_pinged_at: null,
      updated_at: new Date().toISOString(),
    })
    .eq('id', ticket.id);

  try {
    await discordRenameChannel(channelId, ticketChannelName('ia', String(ticket.short_id)));
  } catch { /* ignore */ }

  return { ok: true, already, short_id: String(ticket.short_id) };
}
