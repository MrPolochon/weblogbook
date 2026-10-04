export const dynamic = 'force-dynamic';
import { createAdminClient } from '@/lib/supabase/admin';
import { NextResponse } from 'next/server';

export async function GET() {
  try {
    const admin = createAdminClient();
    const { data, error } = await admin
      .from('profiles')
      .select('id')
      .eq('role', 'admin')
      .limit(1)
      .abortSignal(AbortSignal.timeout(5_000));

    if (error) {
      console.error('[has-admin] Supabase error:', error);
      const errRes = NextResponse.json({ error: 'Service temporairement indisponible' }, { status: 503 });
      errRes.headers.set('Cache-Control', 'no-store, no-cache, must-revalidate, max-age=0');
      return errRes;
    }

    const res = NextResponse.json({ hasAdmin: (data?.length ?? 0) > 0 });
    res.headers.set('Cache-Control', 'no-store, no-cache, must-revalidate, max-age=0');
    res.headers.set('Pragma', 'no-cache');
    return res;
  } catch (e) {
    console.error('[has-admin] Error:', e);
    const res = NextResponse.json({ error: 'Service temporairement indisponible' }, { status: 503 });
    res.headers.set('Cache-Control', 'no-store, no-cache, must-revalidate, max-age=0');
    return res;
  }
}
