import { createAdminClient } from '@/lib/supabase/admin';
import { getSupportConfig } from '@/lib/support/bot-auth';
import { discordRenameChannel, discordSendMessage } from '@/lib/support/discord-api';
import { motifUsesInstructor, ticketChannelName } from '@/lib/support/motifs';
import { withResolutionOfferedNote } from '@/lib/support/ticket-actions';

type SupportConfigLike = {
  staff_role_id?: string | null;
  instructor_role_id?: string | null;
  instructor_motifs?: unknown;
} | null;

/**
 * Ligne de ping `@staff` (+ instructeur si le motif le prévoit).
 * Chaîne vide si la config n'a aucun rôle : on n'envoie pas un ping vide.
 */
export function staffPingLine(cfg: SupportConfigLike, motif: string): string {
  const instructorRoleId = cfg?.instructor_role_id ? String(cfg.instructor_role_id) : '';
  const withInstructor = Boolean(
    instructorRoleId && motifUsesInstructor(String(motif), cfg?.instructor_motifs as string[] | null),
  );
  const pings: string[] = [];
  if (cfg?.staff_role_id) pings.push(`<@&${cfg.staff_role_id}>`);
  if (withInstructor) pings.push(`<@&${instructorRoleId}>`);
  if (pings.length === 0) return '';
  const who = withInstructor ? 'Un staff / instructeur est requis.' : 'Un staff est requis.';
  return `${[...new Set(pings)].join(' ')} **${who}**`;
}

/**
 * Remise du ticket au staff (et à l’instructeur si le motif le prévoit) :
 * bouton « Pas résolu », réponse négative écrite, ou ticket resté sans issue.
 * Un seul endroit pour garder le statut, le nom du salon et le ping alignés.
 *
 * Le ping ne part qu'une fois par situation : `staff_pinged_at` est posé ici et
 * remis à null dès que le ticket repart en mode IA. Sans ça, deux escalades
 * successives réveillaient le staff deux fois pour la même demande.
 */
export async function escalateTicketToStaff(channelId: string, note: string): Promise<boolean> {
  const cfg = await getSupportConfig();
  const admin = createAdminClient();
  const { data: ticket } = await admin
    .from('support_tickets')
    .select('id, short_id, motif, memory_notes, staff_pinged_at')
    .eq('channel_id', channelId)
    .is('closed_at', null)
    .maybeSingle();
  if (!ticket) return false;

  const now = new Date().toISOString();
  const alreadyPinged = Boolean(ticket.staff_pinged_at);

  await admin
    .from('support_tickets')
    .update({
      statut: 'staff_needed',
      resolution_offered: false,
      memory_notes: withResolutionOfferedNote(String(ticket.memory_notes || ''), false),
      staff_pinged_at: ticket.staff_pinged_at || now,
      updated_at: now,
    })
    .eq('id', ticket.id);

  try {
    await discordRenameChannel(channelId, ticketChannelName('staff_needed', ticket.short_id));
  } catch { /* ignore */ }

  const ping = alreadyPinged ? '' : staffPingLine(cfg, String(ticket.motif));
  const out = `${ping} ${note}`.trim();
  if (out) await discordSendMessage(channelId, out);
  return true;
}
