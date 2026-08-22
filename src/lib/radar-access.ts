import { cookies } from 'next/headers';
import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

export const RADAR_UNLOCK_COOKIE = 'radar_pf_unlock';

export function hasRadarUnlockCookie(): boolean {
  return cookies().get(RADAR_UNLOCK_COOKIE)?.value === '1';
}

/**
 * Radar ATC : verrouillé tant que le code superadmin n’a pas été validé
 * (cookie httpOnly posé par /api/radar/unlock).
 */
export async function hasApprovedRadarAccessForUser(
  _userId?: string,
  _role?: string | null,
  _radarBeta?: boolean | null,
) {
  return hasRadarUnlockCookie();
}

export async function requireRadarUnlock(): Promise<
  { ok: true; userId: string } | { ok: false; response: NextResponse }
> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return { ok: false, response: NextResponse.json({ error: 'Non authentifié' }, { status: 401 }) };
  }
  const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).maybeSingle();
  if (profile?.role !== 'admin' || !hasRadarUnlockCookie()) {
    return { ok: false, response: NextResponse.json({ error: 'Radar verrouillé' }, { status: 403 }) };
  }
  return { ok: true, userId: user.id };
}
