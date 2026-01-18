import { createAdminClient } from '@/lib/supabase/admin';
import { NextResponse } from 'next/server';

export async function GET() {
  try {
    const admin = createAdminClient();
    const { count, error } = await admin
      .from('profiles')
      .select('*', { count: 'exact', head: true })
      .eq('role', 'admin');

    if (error) {
      console.error('[has-admin] Supabase error:', error);
      const errRes = NextResponse.json({ hasAdmin: false }, { status: 200 });
      errRes.headers.set('Cache-Control', 'no-store, no-cache, must-revalidate, max-age=0');
      return errRes;
    }

    const res = NextResponse.json({ hasAdmin: (count ?? 0) > 0 });
    res.headers.set('Cache-Control', 'no-store, no-cache, must-revalidate, max-age=0');
    res.headers.set('Pragma', 'no-cache');
    return res;
  } catch (e) {
    console.error('[has-admin] Error:', e);
    const res = NextResponse.json({ hasAdmin: false });
    res.headers.set('Cache-Control', 'no-store, no-cache, must-revalidate, max-age=0');
    return res;
  }
}
