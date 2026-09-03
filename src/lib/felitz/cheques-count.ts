import type { SupabaseClient } from '@supabase/supabase-js';
import { CHEQUE_MESSAGE_TYPES } from '@/lib/felitz/encaisser-cheque';

export async function countChequesAEncaisser(
  admin: SupabaseClient,
  userId: string,
): Promise<number> {
  const { count, error } = await admin
    .from('messages')
    .select('id', { count: 'exact', head: true })
    .eq('destinataire_id', userId)
    .in('type_message', [...CHEQUE_MESSAGE_TYPES])
    .or('cheque_encaisse.is.null,cheque_encaisse.eq.false');

  if (error) {
    console.error('[cheques-count]', error.message);
    return 0;
  }
  return count ?? 0;
}
