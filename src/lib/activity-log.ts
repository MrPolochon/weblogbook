import { createAdminClient } from '@/lib/supabase/admin';

export interface LogEntry {
  userId?: string | null;
  userIdentifiant?: string | null;
  action: string;
  targetType?: string;
  targetId?: string;
  details?: Record<string, unknown>;
  ip?: string | null;
}

export async function logActivity(entry: LogEntry): Promise<void> {
  try {
    const admin = createAdminClient();
    await admin.from('activity_logs').insert({
      user_id: entry.userId || null,
      user_identifiant: entry.userIdentifiant || null,
      action: entry.action,
      target_type: entry.targetType || null,
      target_id: entry.targetId || null,
      details: entry.details || {},
      ip: entry.ip || null,
    });
  } catch (e) {
    console.error('[activity-log] Failed to log:', e);
  }
}

export function getClientIp(request: Request): string | null {
  const forwarded = request.headers.get('x-forwarded-for');
  if (forwarded) return forwarded.split(',')[0].trim();
  const real = request.headers.get('x-real-ip');
  if (real) return real;
  return null;
}
