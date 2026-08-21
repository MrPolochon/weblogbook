export const dynamic = 'force-dynamic';
import { NextRequest, NextResponse } from 'next/server';
import { createHash, timingSafeEqual } from 'crypto';
import { createClient } from '@/lib/supabase/server';
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
    const password = typeof body.password === 'string' ? body.password : '';
    const expected = process.env.SUPERADMIN_PASSWORD;
    if (!expected) {
      return NextResponse.json({ error: 'Mot de passe superadmin non configuré.' }, { status: 500 });
    }
    if (!password) {
      return NextResponse.json({ error: 'Mot de passe incorrect.' }, { status: 401 });
    }

    const hashInput = createHash('sha256').update(password).digest();
    const hashExpected = createHash('sha256').update(expected).digest();
    if (!timingSafeEqual(hashInput, hashExpected)) {
      return NextResponse.json({ error: 'Mot de passe incorrect.' }, { status: 401 });
    }

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
