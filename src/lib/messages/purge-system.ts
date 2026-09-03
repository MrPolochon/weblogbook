import type { SupabaseClient } from '@supabase/supabase-js';

const CHEQUE_PREFIX = 'cheque_';

/**
 * Purge les messages système de plus d'un mois.
 * Les chèques non encaissés (false ou null) ne sont jamais supprimés.
 */
export function purgeOldSystemMessages(admin: SupabaseClient): void {
  const unMoisAgo = new Date();
  unMoisAgo.setMonth(unMoisAgo.getMonth() - 1);
  const cutoff = unMoisAgo.toISOString();

  void admin
    .from('messages')
    .delete()
    .neq('type_message', 'normal')
    .not('type_message', 'like', `${CHEQUE_PREFIX}%`)
    .lt('created_at', cutoff)
    .then(({ error }) => {
      if (error) console.error('[purge messages] non-chèques:', error.message);
    });

  void admin
    .from('messages')
    .delete()
    .like('type_message', `${CHEQUE_PREFIX}%`)
    .eq('cheque_encaisse', true)
    .lt('created_at', cutoff)
    .then(({ error }) => {
      if (error) console.error('[purge messages] chèques encaissés:', error.message);
    });
}
