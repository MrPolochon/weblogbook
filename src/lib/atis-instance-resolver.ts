import { createAdminClient } from '@/lib/supabase/admin';

/**
 * Trouve l'instance de bot ATIS contrôlée par un utilisateur donné.
 * Retourne null si l'utilisateur ne contrôle aucun ATIS actif.
 */
export async function getControlledInstance(userId: string): Promise<number | null> {
  const admin = createAdminClient();
  const { data } = await admin
    .from('atis_broadcast_state')
    .select('id')
    .eq('controlling_user_id', userId)
    .eq('broadcasting', true)
    .maybeSingle();
  if (!data) return null;
  const id = parseInt(String(data.id), 10);
  return Number.isFinite(id) ? id : null;
}
