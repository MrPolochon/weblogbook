import type { SupabaseClient } from '@supabase/supabase-js';

const RINGING_TTL_MS = 60_000;
const CONNECTED_TTL_MS = 600_000;

/** Coupe les appels ringing > 60 s et connected > 10 min pour un utilisateur. */
export async function cleanupExpiredCallsForUser(
  admin: SupabaseClient,
  userId: string,
): Promise<{ ringingCutoff: string }> {
  const nowIso = new Date().toISOString();
  const ringingCutoff = new Date(Date.now() - RINGING_TTL_MS).toISOString();
  const connectedCutoff = new Date(Date.now() - CONNECTED_TTL_MS).toISOString();
  const userOr = `from_user_id.eq.${userId},to_user_id.eq.${userId}`;

  await Promise.all([
    admin
      .from('atc_calls')
      .update({ status: 'ended', ended_at: nowIso })
      .or(userOr)
      .eq('status', 'ringing')
      .lt('started_at', ringingCutoff),
    admin
      .from('atc_calls')
      .update({ status: 'ended', ended_at: nowIso })
      .or(userOr)
      .eq('status', 'connected')
      .lt('started_at', connectedCutoff),
  ]);

  return { ringingCutoff };
}
