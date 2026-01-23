import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { NextResponse } from 'next/server';
import { identifiantToEmail } from '@/lib/constants';

export async function POST(request: Request) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Non autorisé' }, { status: 401 });

    const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).single();
    if (profile?.role !== 'admin') return NextResponse.json({ error: 'Réservé aux admins' }, { status: 403 });

    const body = await request.json();
    const { identifiant, password, role: roleParam, armee: armeeParam, atc: atcParam } = body;
    if (!identifiant || typeof identifiant !== 'string' || !password || typeof password !== 'string') {
      return NextResponse.json({ error: 'Identifiant et mot de passe requis' }, { status: 400 });
    }
    const role = roleParam === 'admin' ? 'admin' : 'pilote';
    const armee = Boolean(armeeParam);
    const atc = Boolean(atcParam);
    const id = String(identifiant).trim().toLowerCase();
    if (!id || id.length < 2) return NextResponse.json({ error: 'Identifiant trop court' }, { status: 400 });
    if (password.length < 8) return NextResponse.json({ error: 'Le mot de passe doit faire au moins 8 caractères' }, { status: 400 });

    const email = identifiantToEmail(id);
    const admin = createAdminClient();

    const { data: u, error: createErr } = await admin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
    });

    if (createErr) {
      if (createErr.message?.includes('already been registered')) {
        return NextResponse.json({ error: 'Cet identifiant est déjà utilisé' }, { status: 400 });
      }
      return NextResponse.json({ error: createErr.message || 'Erreur création' }, { status: 400 });
    }
    if (!u?.user?.id) return NextResponse.json({ error: 'Erreur création' }, { status: 500 });

    const { error: profileErr } = await admin.from('profiles').insert({
      id: u.user.id,
      identifiant: id,
      role,
      armee,
      atc,
      heures_initiales_minutes: 0,
    });

    if (profileErr) {
      await admin.auth.admin.deleteUser(u.user.id);
      return NextResponse.json({ error: 'Erreur création profil' }, { status: 500 });
    }

    return NextResponse.json({ ok: true, id: u.user.id });
  } catch (e) {
    console.error('Create pilot error:', e);
    return NextResponse.json({ error: 'Erreur serveur' }, { status: 500 });
  }
}
