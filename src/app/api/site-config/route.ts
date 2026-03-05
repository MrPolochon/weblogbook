import { createAdminClient } from '@/lib/supabase/admin';
import { NextResponse } from 'next/server';

/**
 * GET - Retourne la config site (public pour que la page login puisse l'utiliser)
 */
export async function GET() {
  try {
    const admin = createAdminClient();
    const { data, error } = await admin
      .from('site_config')
      .select('login_admin_only')
      .eq('id', 1)
      .single();
    if (error || !data) {
      return NextResponse.json({ login_admin_only: false });
    }
    return NextResponse.json({ login_admin_only: Boolean(data.login_admin_only) });
  } catch {
    return NextResponse.json({ login_admin_only: false });
  }
}
