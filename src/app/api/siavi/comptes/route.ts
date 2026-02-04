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
    if (profile?.role !== 'admin') return NextResponse.json({ error: 'Accès refusé' }, { status: 403 });

    const body = await request.json();
    const { identifiant, password, grade_id, mode, aussi_pilote } = body;

    if (!identifiant?.trim()) {
      return NextResponse.json({ error: 'Identifiant requis' }, { status: 400 });
    }

    const admin = createAdminClient();
    const id = String(identifiant).trim().toLowerCase();

    // Mode "nouveau" : créer un nouveau compte exclusivement SIAVI
    if (mode === 'nouveau') {
      if (!password || typeof password !== 'string') {
        return NextResponse.json({ error: 'Mot de passe requis' }, { status: 400 });
      }
      if (password.length < 8) {
        return NextResponse.json({ error: 'Le mot de passe doit faire au moins 8 caractères.' }, { status: 400 });
      }
      if (id.length < 2) {
        return NextResponse.json({ error: 'Identifiant trop court.' }, { status: 400 });
      }

      const role = aussi_pilote ? 'pilote' : 'siavi';
      const email = identifiantToEmail(id);

      // Créer l'utilisateur dans Auth
      const { data: newUser, error: createErr } = await admin.auth.admin.createUser({
        email,
        password,
        email_confirm: true,
      });

      if (createErr) {
        if (createErr.message?.includes('already been registered')) {
          return NextResponse.json({ error: 'Cet identifiant est déjà utilisé.' }, { status: 400 });
        }
        return NextResponse.json({ error: createErr.message || 'Erreur création' }, { status: 400 });
      }

      if (!newUser?.user?.id) {
        return NextResponse.json({ error: 'Erreur création' }, { status: 500 });
      }

      // Créer le profil
      const { error: profileErr } = await admin.from('profiles').insert({
        id: newUser.user.id,
        identifiant: id,
        role,
        siavi: true,
        siavi_grade_id: grade_id && typeof grade_id === 'string' ? grade_id : null,
        armee: false,
        heures_initiales_minutes: 0,
      });

      if (profileErr) {
        // Supprimer l'utilisateur auth si le profil échoue
        await admin.auth.admin.deleteUser(newUser.user.id);
        return NextResponse.json({ error: 'Erreur création profil' }, { status: 500 });
      }

      // Créer le compte Felitz pour l'agent
      const vban = `MIXOU${id.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 20)}`;
      await admin.from('felitz_comptes').insert({
        proprietaire_id: newUser.user.id,
        type: 'personnel',
        vban,
        solde: 0,
      });

      return NextResponse.json({ ok: true, id: newUser.user.id });
    }

    // Mode "existant" : ajouter le rôle SIAVI à un compte existant
    const { data: targetProfile } = await admin.from('profiles')
      .select('id, siavi')
      .eq('identifiant', id)
      .single();

    if (!targetProfile) {
      return NextResponse.json({ error: 'Pilote non trouvé' }, { status: 404 });
    }

    if (targetProfile.siavi) {
      return NextResponse.json({ error: 'Ce pilote est déjà agent SIAVI' }, { status: 400 });
    }

    // Activer SIAVI et assigner le grade
    const { error } = await admin.from('profiles').update({
      siavi: true,
      siavi_grade_id: grade_id || null,
    }).eq('id', targetProfile.id);

    if (error) throw error;

    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error('SIAVI comptes POST:', err);
    return NextResponse.json({ error: 'Erreur serveur' }, { status: 500 });
  }
}
