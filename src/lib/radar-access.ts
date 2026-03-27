import { createAdminClient } from '@/lib/supabase/admin';

export async function hasApprovedRadarAccessForUser(
  userId: string,
  role?: string | null,
  radarBeta?: boolean | null,
) {
  if (role === 'admin') return true;
  if (!radarBeta) return false;

  try {
    const admin = createAdminClient();
    const { data, error } = await admin
      .from('radar_beta_requests')
      .select('id')
      .eq('user_id', userId)
      .eq('status', 'approved')
      .limit(1)
      .maybeSingle();

    if (error) return false;
    return Boolean(data?.id);
  } catch {
    return false;
  }
}
