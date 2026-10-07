import { createHash } from 'crypto';
import { createAdminClient } from '@/lib/supabase/admin';

/** Atomic counter shared by all deployed instances. Failure denies the attempt. */
export async function rateLimitShared(key: string, maxRequests: number, windowMs: number) {
  const denied = { allowed: false, remaining: 0, resetAt: Date.now() + windowMs };
  try {
    const { data, error } = await createAdminClient().rpc('consume_api_rate_limit', {
      p_key: createHash('sha256').update(key).digest('hex'),
      p_max: maxRequests, p_window_ms: windowMs,
    });
    if (error || typeof data?.allowed !== 'boolean') {
      console.error('[rate-limit] shared counter unavailable:', error?.message ?? 'Invalid response');
      return denied;
    }
    return { allowed: data.allowed as boolean, remaining: Number(data.remaining) || 0, resetAt: Number(data.reset_at) };
  } catch {
    return denied;
  }
}
