import { createAdminClient } from '@/lib/supabase/admin';
import { getSupportConfig } from '@/lib/support/bot-auth';
import { discordRenameChannel, discordSendMessage } from '@/lib/support/discord-api';
import { motifUsesInstructor, ticketChannelName } from '@/lib/support/motifs';
import { withResolutionOfferedNote } from '@/lib/support/ticket-actions';

type SupportConfigLike = {
  staff_role_id?: string | null;
  instructor_role_id?: string | null;
  instructor_motifs?: unknown;
  admin_role_ids?: unknown;
} | null;

/**
 * Ligne de ping `@staff` (+ instructeur si le motif le prévoit).
 * Chaîne vide si la config n'a aucun rôle : on n'envoie pas un ping vide.
 */
export function staffPingLine(cfg: SupportConfigLike, motif: string, forceInstructor = false): string {
  const instructorRoleId = cfg?.instructor_role_id ? String(cfg.instructor_role_id) : '';
  const withInstructor = Boolean(
    instructorRoleId && (forceInstructor || motifUsesInstructor(String(motif), cfg?.instructor_motifs as string[] | null)),
  );
  const pings: string[] = [];
  if (cfg?.staff_role_id) pings.push(`<@&${cfg.staff_role_id}>`);
  else if (Array.isArray(cfg?.admin_role_ids)) {
    const fallback = cfg.admin_role_ids.find((id) => /^\d{15,22}$/.test(String(id)));
    if (fallback) pings.push(`<@&${fallback}>`);
  }
  if (withInstructor) pings.push(`<@&${instructorRoleId}>`);
  if (pings.length === 0) return '';
  const who = withInstructor ? 'Un staff / instructeur est requis.' : 'Un staff est requis.';
  return `${[...new Set(pings)].join(' ')} **${who}**`;
}

/** Même réservation pour les boutons, commandes et décisions de l'IA. */
export async function claimStaffAlert(admin: ReturnType<typeof createAdminClient>, ticketId: string): Promise<string | null> {
  const claimedAt = new Date().toISOString();
  const { data, error } = await admin.from('support_tickets')
    .update({ statut: 'staff_needed', staff_pinged_at: claimedAt, resolution_offered: false, updated_at: claimedAt })
    .eq('id', ticketId).is('closed_at', null).is('staff_pinged_at', null).select('id');
  if (error) throw new Error('staff_alert_claim_failed');
  return data?.length ? claimedAt : null;
}

export async function releaseStaffAlert(admin: ReturnType<typeof createAdminClient>, ticketId: string, claimedAt: string): Promise<void> {
  const { error } = await admin.from('support_tickets').update({ staff_pinged_at: null })
    .eq('id', ticketId).eq('staff_pinged_at', claimedAt);
  if (error) throw new Error('staff_alert_release_failed');
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
export async function escalateTicketToStaff(channelId: string, note: string, options: { instructor?: boolean } = {}): Promise<boolean> {
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
  if (alreadyPinged) return true;

  const claimedAt = await claimStaffAlert(admin, ticket.id);
  if (!claimedAt) return true;

  try {
    const { error } = await admin
      .from('support_tickets')
      .update({
        statut: 'staff_needed',
        resolution_offered: false,
        memory_notes: withResolutionOfferedNote(String(ticket.memory_notes || ''), false),
        updated_at: now,
      })
      .eq('id', ticket.id)
      .is('closed_at', null)
      .eq('staff_pinged_at', claimedAt);
    if (error) throw new Error(error.message);

    try {
      await discordRenameChannel(channelId, ticketChannelName('staff_needed', ticket.short_id));
    } catch { /* ignore */ }

    const ping = staffPingLine(cfg, String(ticket.motif), options.instructor);
    const out = `${ping} ${note}`.trim();
    if (out) await discordSendMessage(channelId, out);
  } catch (error) {
    await releaseStaffAlert(admin, ticket.id, claimedAt);
    throw error;
  }
  return true;
}
