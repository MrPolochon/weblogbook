export const dynamic = 'force-dynamic';
import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { IFSA_ADMIN_COOKIE } from '@/lib/ifsa-access';

export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Non authentifié' }, { status: 401 });

    const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).maybeSingle();
    if (profile?.role !== 'admin') {
      return NextResponse.json({ error: 'Réservé aux administrateurs.' }, { status: 403 });
    }

    const body = await request.json().catch(() => ({}));
    const code = typeof body.code === 'string' ? body.code.trim().replace(/\s/g, '') : '';
    if (code.length !== 6 || !/^\d{6}$/.test(code)) {
      return NextResponse.json({ error: 'Code superadmin invalide (6 chiffres).' }, { status: 401 });
    }

    const admin = createAdminClient();
    const { data: codeRow } = await admin
      .from('superadmin_access_codes')
      .select('user_id')
      .eq('user_id', user.id)
      .eq('code', code)
      .gt('expires_at', new Date().toISOString())
      .maybeSingle();

    if (!codeRow) {
      return NextResponse.json(
        { error: 'Code superadmin incorrect ou expiré. Demandez un nouveau code par email.' },
        { status: 401 }
      );
    }

    await admin.from('superadmin_access_codes').delete().eq('user_id', user.id);

    const res = NextResponse.json({ ok: true });
    res.cookies.set(IFSA_ADMIN_COOKIE, '1', {
      httpOnly: true,
      sameSite: 'lax',
      secure: process.env.NODE_ENV === 'production',
      path: '/',
      maxAge: 60 * 60 * 4,
    });
    return res;
  } catch {
    return NextResponse.json({ error: 'Erreur serveur' }, { status: 500 });
  }
}
