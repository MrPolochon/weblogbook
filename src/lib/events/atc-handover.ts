import { createAdminClient } from '@/lib/supabase/admin';
import { stopAtisIfController } from '@/lib/atis-bot-api';
import { finaliserCloturesEnAttenteSansControleur } from '@/lib/plans-vol/closure';

export async function enforceAtcHandover() {
  const admin = createAdminClient();
  const { error } = await admin.rpc('enforce_atc_reservations');
  if (error) throw error;
}

export async function cleanupAtcHandovers(userId?: string) {
  const admin = createAdminClient();
  let query = admin.from('atc_reservation_evictions').select('session_id,user_id,ended_at').is('cleanup_at',null).order('ended_at').limit(20);
  if (userId) query = query.eq('user_id',userId);
  const {data,error} = await query;
  if(error) throw error;
  for(const item of data || []) {
    await stopAtisIfController(item.user_id,item.ended_at);
    const updated = await admin.from('atc_reservation_evictions').update({cleanup_at:new Date().toISOString()}).eq('session_id',item.session_id);
    if(updated.error) throw updated.error;
  }
  if(data?.length) await finaliserCloturesEnAttenteSansControleur(admin);
}
