import { randomUUID } from 'node:crypto';
import type { createAdminClient } from '@/lib/supabase/admin';
import { FlightSubmissionError, submissionError } from '@/lib/plans-vol/submission';

type Admin = ReturnType<typeof createAdminClient>;
/** Run before storage cleanup, history writes, account deletion or any payment. */
export async function prepareItineraryAccountDeletion(admin: Admin, userId: string) {
  const token = randomUUID();
  const { error } = await admin.rpc('prepare_company_itinerary_account_deletion', { p_user: userId, p_token: token });
  if (error) throw submissionError(error);
  return token;
}
export async function releaseItineraryAccountDeletion(admin: Admin, userId: string, token: string) {
  // A successful profile deletion already removed the marker by FK cascade.
  // A cleanup/network failure must retain the original operation's result;
  // the short expiry also releases abandoned markers after a process crash.
  try {
    const { error } = await admin.from('company_itinerary_account_deletions').delete().eq('pilot_id', userId).eq('token', token);
    if (error) console.error('Itinerary account deletion lock release failed');
  } catch { console.error('Itinerary account deletion lock release failed'); }
}
export async function assertAircraftOutsideItinerary(admin: Admin, aircraftId: string) {
  const { data, error } = await admin.from('company_itineraries').select('id').eq('aircraft_id', aircraftId).in('status', ['planned', 'active', 'paused', 'diverted']).limit(1).maybeSingle();
  if (error) throw submissionError(error);
  if (data) throw new FlightSubmissionError('Appareil réservé à un itinéraire avec correspondance. Annulez les tronçons restants avant un ferry.', 409);
}
