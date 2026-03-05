import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { NextResponse, NextRequest } from 'next/server';

/**
 * PATCH - Met à jour la config site (admin uniquement)
 */
export async function PATCH(req: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Non authentifié' }, { status: 401 });

    const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).single();
    if (profile?.role !== 'admin') return NextResponse.json({ error: 'Réservé aux admins' }, { status: 403 });

    const body = await req.json().catch(() => ({}));
    const login_admin_only = typeof body.login_admin_only === 'boolean' ? body.login_admin_only : undefined;
    if (login_admin_only === undefined) {
      return NextResponse.json({ error: 'login_admin_only (boolean) requis' }, { status: 400 });
    }

    const admin = createAdminClient();
    const { error } = await admin.from('site_config').update({ login_admin_only }).eq('id', 1);
    if (error) return NextResponse.json({ error: error.message }, { status: 400 });

    return NextResponse.json({ ok: true, login_admin_only });
  } catch (e) {
    console.error('[admin/site-config]', e);
    return NextResponse.json({ error: 'Erreur serveur' }, { status: 500 });
  }
}
