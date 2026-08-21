import { createAdminClient } from '@/lib/supabase/admin';
import { getSupportConfig } from '@/lib/support/bot-auth';
import { discordRenameChannel, discordSendMessage } from '@/lib/support/discord-api';
import { motifUsesInstructor, ticketChannelName } from '@/lib/support/motifs';
import { withResolutionOfferedNote } from '@/lib/support/ticket-actions';

/**
 * Remise du ticket au staff (et à l’instructeur si le motif le prévoit) :
 * bouton « Pas résolu », réponse négative écrite, ou ticket resté sans issue.
 * Un seul endroit pour garder le statut, le nom du salon et le ping alignés.
 */
export async function escalateTicketToStaff(channelId: string, note: string): Promise<boolean> {
  const cfg = await getSupportConfig();
  const admin = createAdminClient();
  const { data: ticket } = await admin
    .from('support_tickets')
    .select('id, short_id, motif, memory_notes')
    .eq('channel_id', channelId)
    .is('closed_at', null)
    .maybeSingle();
  if (!ticket) return false;

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

  const withInstructor = Boolean(
    cfg?.instructor_role_id &&
      motifUsesInstructor(String(ticket.motif), cfg.instructor_motifs as string[] | null),
  );
  const pings: string[] = [];
  if (cfg?.staff_role_id) pings.push(`<@&${cfg.staff_role_id}>`);
  if (withInstructor) pings.push(`<@&${cfg.instructor_role_id}>`);

  const who = withInstructor ? 'Un staff / instructeur est requis.' : 'Un staff est requis.';
  await discordSendMessage(channelId, `${[...new Set(pings)].join(' ')} **${who}** ${note}`.trim());
  return true;
}
