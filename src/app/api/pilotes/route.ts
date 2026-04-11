import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { NextResponse } from 'next/server';
import { identifiantToEmail } from '@/lib/constants';
import { ensureComptePersonnel } from '@/lib/felitz/ensure-comptes';

export async function POST(request: Request) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Non autorisé' }, { status: 401 });

    const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).single();
    if (profile?.role !== 'admin') return NextResponse.json({ error: 'Réservé aux admins' }, { status: 403 });

    const body = await request.json();
    const { identifiant, password, role: roleParam, armee: armeeParam, atc: atcParam, superadmin_code: superadminCodeBody } = body;
    if (!identifiant || typeof identifiant !== 'string' || !password || typeof password !== 'string') {
      return NextResponse.json({ error: 'Identifiant et mot de passe requis' }, { status: 400 });
    }
    const role = roleParam === 'admin' || roleParam === 'instructeur' ? roleParam : 'pilote';
    const armee = Boolean(armeeParam);
    const atc = Boolean(atcParam);
    const id = String(identifiant).trim().toLowerCase();
    if (!id || id.length < 2) return NextResponse.json({ error: 'Identifiant trop court' }, { status: 400 });
    if (password.length < 8) return NextResponse.json({ error: 'Le mot de passe doit faire au moins 8 caractères' }, { status: 400 });

    const admin = createAdminClient();

    // Créer un admin : exiger mot de passe superadmin + code email
    if (role === 'admin') {
      const code = typeof superadminCodeBody === 'string' ? superadminCodeBody.trim().replace(/\s/g, '') : '';
      if (code.length !== 6 || !/^\d{6}$/.test(code)) {
        return NextResponse.json(
          { code: 'SUPERADMIN_REQUIRED', error: 'Pour créer un administrateur, saisissez le mot de passe superadmin puis le code envoyé à votre email.' },
          { status: 403 }
        );
      }
      const { data: codeRow } = await admin
        .from('superadmin_access_codes')
        .select('user_id')
        .eq('user_id', user.id)
        .eq('code', code)
        .gt('expires_at', new Date().toISOString())
        .single();
      if (!codeRow) {
        return NextResponse.json(
          { code: 'SUPERADMIN_REQUIRED', error: 'Code incorrect ou expiré. Saisissez le mot de passe superadmin puis demandez un nouveau code par email.' },
          { status: 403 }
        );
      }
      await admin.from('superadmin_access_codes').delete().eq('user_id', user.id);
    }

    const email = identifiantToEmail(id);

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

    const profilePayload = {
      id: u.user.id,
      identifiant: id,
      role,
      armee,
      atc,
      heures_initiales_minutes: 0,
    };

    // Souvent un trigger / hook Auth crée déjà une ligne `profiles` → INSERT seul échoue (doublon sur id).
    const { error: profileErr } = await admin.from('profiles').upsert(profilePayload, { onConflict: 'id' });

    if (profileErr) {
      console.error('Create pilot profile upsert:', profileErr.code, profileErr.message, profileErr.details);
      await admin.auth.admin.deleteUser(u.user.id);
      if (profileErr.code === '23505' && String(profileErr.message || '').includes('identifiant')) {
        return NextResponse.json(
          { error: 'Cet identifiant est déjà utilisé par un autre compte.' },
          { status: 400 },
        );
      }
      return NextResponse.json(
        { error: profileErr.message || 'Erreur création profil' },
        { status: 500 },
      );
    }

    // Le trigger AFTER INSERT sur `profiles` crée déjà un compte personnel → ne pas appeler ensure ici systématiquement (sinon doublon sur felitz_comptes_uniq_personnel_proprietaire).
    const { data: felitzExistants, error: felitzQErr } = await admin
      .from('felitz_comptes')
      .select('id')
      .eq('proprietaire_id', u.user.id)
      .eq('type', 'personnel')
      .order('created_at', { ascending: true })
      .limit(1);
    if (felitzQErr) {
      console.error('Create pilot: lecture felitz_comptes', felitzQErr.message);
    }
    if (!felitzExistants?.length) {
      const felitz = await ensureComptePersonnel(admin, u.user.id);
      if (!felitz) {
        console.error('Create pilot: compte Felitz non créé pour', u.user.id);
      }
    }

    return NextResponse.json({ ok: true, id: u.user.id });
  } catch (e) {
    console.error('Create pilot error:', e);
    return NextResponse.json({ error: 'Erreur serveur' }, { status: 500 });
  }
}
