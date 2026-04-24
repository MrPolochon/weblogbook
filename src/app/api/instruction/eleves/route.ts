import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { identifiantToEmail } from '@/lib/constants';
import { ensureComptePersonnel } from '@/lib/felitz/ensure-comptes';
import { INSTRUCTION_LICENCE_CODES } from '@/lib/instruction-programs';
import type { SupabaseClient } from '@supabase/supabase-js';

type InstructionLinkTarget = {
  id: string;
  role: string | null;
  instructeur_referent_id: string | null;
  formation_instruction_active: boolean;
};

function canManageInstruction(role: string | null | undefined): boolean {
  return role === 'instructeur' || role === 'admin';
}

/** Tout compte non admin peut être inscrit en formation (ex. pilote qui reprend un PPL). */
function canBecomeInstructionStudent(role: string | null | undefined): boolean {
  return role != null && role !== 'admin';
}

async function attachExistingStudent(
  admin: SupabaseClient,
  instructorId: string,
  target: InstructionLinkTarget,
  requestedLicence: string,
): Promise<NextResponse> {
  if (target.id === instructorId) {
    return NextResponse.json({ error: 'Vous ne pouvez pas vous rattacher vous-même comme élève.' }, { status: 400 });
  }
  if (!canBecomeInstructionStudent(target.role)) {
    return NextResponse.json(
      { error: 'Ce type de compte ne peut pas être inscrit comme élève de cette manière.' },
      { status: 400 },
    );
  }
  if (
    target.formation_instruction_active &&
    target.instructeur_referent_id &&
    target.instructeur_referent_id !== instructorId
  ) {
    return NextResponse.json(
      { error: 'Cette personne a déjà une formation active auprès d’un autre instructeur de référence.' },
      { status: 409 },
    );
  }
  const { error: upErr } = await admin
    .from('profiles')
    .update({
      instructeur_referent_id: instructorId,
      formation_instruction_active: true,
      formation_instruction_licence: requestedLicence,
    })
    .eq('id', target.id);
  if (upErr) return NextResponse.json({ error: upErr.message }, { status: 400 });

  const { data: felitzExistants } = await admin
    .from('felitz_comptes')
    .select('id')
    .eq('proprietaire_id', target.id)
    .eq('type', 'personnel')
    .limit(1);
  if (!felitzExistants?.length) {
    await ensureComptePersonnel(admin, target.id);
  }
  return NextResponse.json({ ok: true, id: target.id });
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
    const linkExisting = body.link_existing === true;
    const requestedLicence = String(body.formation_instruction_licence || 'PPL').trim();

    if (!INSTRUCTION_LICENCE_CODES.includes(requestedLicence)) {
      return NextResponse.json({ error: 'Licence de formation invalide.' }, { status: 400 });
    }

    if (linkExisting) {
      const existingUserId = String(body.existing_user_id || '').trim();
      const existingIdent = String(body.existing_identifiant || '').trim().toLowerCase();
      if (!existingUserId && (!existingIdent || existingIdent.length < 2)) {
        return NextResponse.json(
          { error: 'Indiquez l’identifiant du compte existant (ou existing_user_id).' },
          { status: 400 },
        );
      }

      if (existingUserId) {
        const { data: target, error: findErr } = await admin
          .from('profiles')
          .select('id, role, instructeur_referent_id, formation_instruction_active')
          .eq('id', existingUserId)
          .maybeSingle();
        if (findErr) return NextResponse.json({ error: findErr.message }, { status: 400 });
        if (!target) return NextResponse.json({ error: 'Compte introuvable.' }, { status: 404 });
        return attachExistingStudent(admin, user.id, target, requestedLicence);
      }

      const { data: target, error: findErr } = await admin
        .from('profiles')
        .select('id, role, instructeur_referent_id, formation_instruction_active')
        .eq('identifiant', existingIdent)
        .maybeSingle();
      if (findErr) return NextResponse.json({ error: findErr.message }, { status: 400 });
      if (!target) return NextResponse.json({ error: 'Aucun compte avec cet identifiant.' }, { status: 404 });
      return attachExistingStudent(admin, user.id, target, requestedLicence);
    }

    const identifiant = String(body.identifiant || '').trim().toLowerCase();
    const password = String(body.password || '');

    if (!identifiant || identifiant.length < 2) {
      return NextResponse.json({ error: 'Identifiant invalide.' }, { status: 400 });
    }
    if (password.length < 8) {
      return NextResponse.json({ error: 'Le mot de passe doit faire au moins 8 caractères.' }, { status: 400 });
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
