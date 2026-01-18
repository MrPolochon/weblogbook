import { createAdminClient } from '@/lib/supabase/admin';
import { NextResponse } from 'next/server';

import { EMAIL_DOMAIN } from '@/lib/constants';

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { identifiant, password } = body;
    if (!identifiant || typeof identifiant !== 'string' || !password || typeof password !== 'string') {
      return NextResponse.json({ error: 'Identifiant et mot de passe requis' }, { status: 400 });
    }
    const id = String(identifiant).trim().toLowerCase();
    if (!id || id.length < 2) {
      return NextResponse.json({ error: 'Identifiant trop court' }, { status: 400 });
    }
    if (password.length < 8) {
      return NextResponse.json({ error: 'Le mot de passe doit faire au moins 8 caractères' }, { status: 400 });
    }

    const admin = createAdminClient();

    const { count, error: countErr } = await admin
      .from('profiles')
      .select('*', { count: 'exact', head: true })
      .eq('role', 'admin');

    if (countErr || (count ?? 0) > 0) {
      return NextResponse.json({ error: 'Un administrateur existe déjà' }, { status: 403 });
    }

    const email = `${id}@${EMAIL_DOMAIN}`;
    const { data: user, error: createErr } = await admin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
    });

    if (createErr) {
      if (createErr.message?.includes('already been registered')) {
        return NextResponse.json({ error: 'Cet identifiant est déjà utilisé' }, { status: 400 });
      }
      return NextResponse.json({ error: createErr.message || 'Erreur création utilisateur' }, { status: 400 });
    }

    if (!user?.user?.id) {
      return NextResponse.json({ error: 'Erreur création utilisateur' }, { status: 500 });
    }

    const { error: profileErr } = await admin.from('profiles').insert({
      id: user.user.id,
      identifiant: id,
      role: 'admin',
      heures_initiales_minutes: 0,
    });

    if (profileErr) {
      await admin.auth.admin.deleteUser(user.user.id);
      return NextResponse.json({ error: 'Erreur création profil' }, { status: 500 });
    }

    return NextResponse.json({ ok: true, email });
  } catch (e) {
    console.error('Setup error:', e);
    return NextResponse.json({ error: 'Erreur serveur' }, { status: 500 });
  }
}
