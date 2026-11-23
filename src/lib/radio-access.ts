import { createAdminClient } from '@/lib/supabase/admin';
export const RADIO_ACTIVE_FLIGHT_STATUSES = ['accepte', 'en_cours', 'automonitoring', 'en_attente_cloture'];
export async function hasRadioFlight(userId: string): Promise<boolean> {
  const { data, error } = await createAdminClient().from('plans_vol').select('id')
    .or('pilote_id.eq.' + userId + ',copilote_id.eq.' + userId)
    .in('statut', RADIO_ACTIVE_FLIGHT_STATUSES).limit(1);
  if (error) throw new Error('Vérification du vol radio indisponible.');
  return Boolean(data?.length);
}
export async function canTransmitRadio(userId: string): Promise<boolean> {
  const admin = createAdminClient();
  const [flight, atc, afis] = await Promise.all([
    hasRadioFlight(userId),
    admin.from('atc_sessions').select('id').eq('user_id', userId).limit(1),
    admin.from('afis_sessions').select('id').eq('user_id', userId).eq('est_afis', true).limit(1),
  ]);
  if (atc.error || afis.error) throw new Error('Vérification du poste radio indisponible.');
  return flight || Boolean(atc.data?.length || afis.data?.length);
}
