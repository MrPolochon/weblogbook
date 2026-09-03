import type { SupabaseClient } from '@supabase/supabase-js';
import { rateLimit } from '@/lib/rate-limit';

const MIN_MS = 60_000;
const MAX_MS = 5 * 60_000;

function randomDurationMs(): number {
  return MIN_MS + Math.floor(Math.random() * (MAX_MS - MIN_MS));
}

export async function consumeBriaCooldown(
  admin: SupabaseClient,
  userId: string,
): Promise<{ allowed: boolean; remainingMs: number; until?: string }> {
  const now = Date.now();
  try {
    const { data, error } = await admin
      .from('bria_cooldowns')
      .select('until')
      .eq('user_id', userId)
      .maybeSingle();
    if (!error && data?.until) {
      const untilMs = new Date(data.until).getTime();
      if (untilMs > now) {
        return { allowed: false, remainingMs: untilMs - now, until: data.until };
      }
    }
    const until = new Date(now + randomDurationMs()).toISOString();
    const { error: upsertErr } = await admin.from('bria_cooldowns').upsert(
      { user_id: userId, until, updated_at: new Date().toISOString() },
      { onConflict: 'user_id' },
    );
    if (upsertErr) throw upsertErr;
    return { allowed: true, remainingMs: 0, until };
  } catch {
    const rl = rateLimit(`bria:${userId}`, 1, MIN_MS);
    if (!rl.allowed) {
      return { allowed: false, remainingMs: Math.max(0, rl.resetAt - now) };
    }
    return { allowed: true, remainingMs: 0 };
  }
}

export async function peekBriaCooldown(
  admin: SupabaseClient,
  userId: string,
): Promise<{ remainingMs: number; until: string | null }> {
  try {
    const { data } = await admin
      .from('bria_cooldowns')
      .select('until')
      .eq('user_id', userId)
      .maybeSingle();
    if (!data?.until) return { remainingMs: 0, until: null };
    const remainingMs = Math.max(0, new Date(data.until).getTime() - Date.now());
    return { remainingMs, until: remainingMs > 0 ? data.until : null };
  } catch {
    return { remainingMs: 0, until: null };
  }
}
