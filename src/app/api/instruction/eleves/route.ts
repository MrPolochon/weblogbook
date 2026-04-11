import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { identifiantToEmail } from '@/lib/constants';
import { ensureComptePersonnel } from '@/lib/felitz/ensure-comptes';
import { INSTRUCTION_LICENCE_CODES } from '@/lib/instruction-programs';

function canManageInstruction(role: string | null | undefined): boolean {
  return role === 'instructeur' || role === 'admin';
}

export async function GET() {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Non autorisé' }, { status: 401 });

    const admin = createAdminClient();
    const { data: me } = await admin.from('profiles').select('role').eq('id', user.id).single();
    if (!canManageInstruction(me?.role)) {
      return NextResponse.json({ error: 'Réservé aux instructeurs.' }, { status: 403 });
    }

    const { data: eleves, error } = await admin
      .from('profiles')
      .select('id, identifiant, role, formation_instruction_active, formation_instruction_licence, created_at')
      .eq('instructeur_referent_id', user.id)
      .order('created_at', { ascending: false });

    if (error) return NextResponse.json({ error: error.message }, { status: 400 });
    return NextResponse.json(eleves || []);
  } catch (e) {
    console.error('instruction/eleves GET:', e);
    return NextResponse.json({ error: 'Erreur serveur' }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Non autorisé' }, { status: 401 });

    const admin = createAdminClient();
    const { data: me } = await admin.from('profiles').select('role').eq('id', user.id).single();
    if (!canManageInstruction(me?.role)) {
      return NextResponse.json({ error: 'Réservé aux instructeurs.' }, { status: 403 });
    }

    const body = await request.json();
    const identifiant = String(body.identifiant || '').trim().toLowerCase();
    const password = String(body.password || '');
    const requestedLicence = String(body.formation_instruction_licence || 'PPL').trim();

    if (!identifiant || identifiant.length < 2) {
      return NextResponse.json({ error: 'Identifiant invalide.' }, { status: 400 });
    }
    if (password.length < 8) {
      return NextResponse.json({ error: 'Le mot de passe doit faire au moins 8 caractères.' }, { status: 400 });
    }
    if (!INSTRUCTION_LICENCE_CODES.includes(requestedLicence)) {
      return NextResponse.json({ error: 'Licence de formation invalide.' }, { status: 400 });
    }

    const email = identifiantToEmail(identifiant);
    const { data: created, error: createErr } = await admin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
    });
    if (createErr || !created?.user?.id) {
      return NextResponse.json({ error: createErr?.message || 'Erreur création utilisateur.' }, { status: 400 });
    }

    const userId = created.user.id;
    const payload = {
      id: userId,
      identifiant,
      role: 'pilote',
      heures_initiales_minutes: 0,
      instructeur_referent_id: user.id,
      formation_instruction_active: true,
      formation_instruction_licence: requestedLicence,
    };
    const { error: profileErr } = await admin.from('profiles').upsert(payload, { onConflict: 'id' });
    if (profileErr) {
      await admin.auth.admin.deleteUser(userId);
      return NextResponse.json({ error: profileErr.message || 'Erreur création profil.' }, { status: 400 });
    }

    const { data: felitzExistants } = await admin
      .from('felitz_comptes')
      .select('id')
      .eq('proprietaire_id', userId)
      .eq('type', 'personnel')
      .limit(1);
    if (!felitzExistants?.length) {
      await ensureComptePersonnel(admin, userId);
    }

    return NextResponse.json({ ok: true, id: userId });
  } catch (e) {
    console.error('instruction/eleves POST:', e);
    return NextResponse.json({ error: 'Erreur serveur' }, { status: 500 });
  }
}
