export type ResetItem = {
  ticket_id: string;
  deleted_at: string | null;
  dm_status: 'pending' | 'sent' | 'unavailable';
};

export type ResetDependencies = {
  validateChannel: () => Promise<void>;
  archive: () => Promise<void>;
  deleteChannel: () => Promise<void>;
  notify: () => Promise<void>;
  isDmUnavailable: (error: unknown) => boolean;
  save: (patch: Record<string, unknown>) => Promise<void>;
};

export const UPDATE_RESET_CUTOFF = '2026-10-01T22:06:31Z';

export function assertResetTarget(
  ticket: { created_at: string; channel_id: string },
  protectedChannels: Array<string | null | undefined>,
) {
  const created = Date.parse(ticket.created_at);
  if (!Number.isFinite(created) || created > Date.parse(UPDATE_RESET_CUTOFF)) {
    throw new Error('Ticket créé après la demande : suppression refusée');
  }
  if (!ticket.channel_id || protectedChannels.includes(ticket.channel_id)) {
    throw new Error('Salon protégé : suppression refusée');
  }
}

/** Chaque étape est enregistrée : une reprise ne supprime jamais un autre ticket. */
export async function executeTicketUpdateReset(item: ResetItem, deps: ResetDependencies) {
  if (!item.deleted_at) {
    await deps.validateChannel();
    await deps.archive();
    await deps.deleteChannel();
    await deps.save({ deleted_at: new Date().toISOString() });
  }
  let dmStatus = item.dm_status;
  if (dmStatus === 'pending') {
    try {
      await deps.notify();
      dmStatus = 'sent';
      await deps.save({ dm_status: dmStatus, dm_error: null });
    } catch (error) {
      // Discord 50007 = MP fermés/bot bloqué ; les autres erreurs se réessaient.
      if (!deps.isDmUnavailable(error)) throw error;
      dmStatus = 'unavailable';
      await deps.save({ dm_status: dmStatus, dm_error: 'Discord refuse les messages privés (50007).' });
    }
  }
  await deps.save({ completed_at: new Date().toISOString(), last_error: null, lease_until: null, lease_token: null });
  return { dm_status: dmStatus };
}
