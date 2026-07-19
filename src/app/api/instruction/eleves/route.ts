export const dynamic = 'force-dynamic';
import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { ensureComptePersonnel } from '@/lib/felitz/ensure-comptes';
import { logActivity } from '@/lib/activity-log';
import { INSTRUCTION_LICENCE_CODES } from '@/lib/instruction-programs';
import {
  canAccessInstructionManagerTools,
  canOpenFormationAsInstructor,
  getInstructionCapabilities,
} from '@/lib/instruction-permissions';
import { notifyUser } from '@/lib/notifications';
import type { SupabaseClient } from '@supabase/supabase-js';

type InstructionLinkTarget = {
  id: string;
  role: string | null;
  instructeur_referent_id: string | null;
  formation_instruction_active: boolean;
};

/** Tout compte non admin peut être inscrit en formation (ex. pilote qui reprend un PPL). */
function canBecomeInstructionStudent(role: string | null | undefined): boolean {
  return role != null && role !== 'admin';
}

async function attachExistingStudent(
  admin: SupabaseClient,
  instructorId: string,
  instructorIdentifiant: string | null | undefined,
  target: InstructionLinkTarget & { identifiant?: string | null },
  requestedLicence: string,
  setAssignmentReferent: boolean,
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

  if (setAssignmentReferent) {
    const { data: existingReferent } = await admin
      .from('instruction_eleve_referent')
      .select('instructeur_id')
      .eq('eleve_id', target.id)
      .maybeSingle();
    if (existingReferent && existingReferent.instructeur_id !== instructorId) {
      return NextResponse.json(
        {
          error:
            'Cet élève a déjà un instructeur référent d\'assignation. Contactez un administrateur pour réassigner.',
        },
        { status: 409 },
      );
    }
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

  if (setAssignmentReferent) {
    const now = new Date().toISOString();
    const { error: refErr } = await admin.from('instruction_eleve_referent').upsert(
      {
        eleve_id: target.id,
        instructeur_id: instructorId,
        updated_at: now,
      },
      { onConflict: 'eleve_id' },
    );
    if (refErr) return NextResponse.json({ error: refErr.message }, { status: 400 });
    logActivity({
      userId: instructorId,
      userIdentifiant: instructorIdentifiant,
      action: 'add_assignment_referent',
      targetType: 'profile',
      targetId: target.id,
      details: { instructeur_id: instructorId, eleve_identifiant: target.identifiant },
    });
  }

  const { data: felitzExistants } = await admin
    .from('felitz_comptes')
    .select('id')
    .eq('proprietaire_id', target.id)
    .eq('type', 'personnel')
    .limit(1);
  if (!felitzExistants?.length) {
    await ensureComptePersonnel(admin, target.id);
  }

  try {
    const { data: instr } = await admin
      .from('profiles').select('identifiant').eq('id', instructorId).maybeSingle();
    await notifyUser(target.id, {
      type: 'transfer_in',
      title: `Formation ${requestedLicence} ouverte`,
      body: `${instr?.identifiant ?? 'Un instructeur'} vous a inscrit en formation ${requestedLicence} et est votre instructeur referent.`,
      link: '/instruction',
    });
  } catch (e) { console.error('notifyUser eleves attach:', e); }

  return NextResponse.json({ ok: true, id: target.id });
}

export async function GET() {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Non autorisé' }, { status: 401 });

    const admin = createAdminClient();
    const { data: me } = await admin.from('profiles').select('role').eq('id', user.id).single();
    const cap = await getInstructionCapabilities(admin, user.id, me?.role);
    if (!canAccessInstructionManagerTools(cap)) {
      return NextResponse.json({ error: 'Réservé aux instructeurs (FI) ou formateurs ATC (ATC FI).' }, { status: 403 });
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
    const { data: me } = await admin.from('profiles').select('role, identifiant').eq('id', user.id).single();
    const cap = await getInstructionCapabilities(admin, user.id, me?.role);
    if (!canAccessInstructionManagerTools(cap)) {
      return NextResponse.json({ error: 'Réservé aux instructeurs (FI) ou formateurs ATC (ATC FI).' }, { status: 403 });
    }

    const body = await request.json();
    const requestedLicence = String(body.formation_instruction_licence || 'ATC-INIT').trim();

    if (!INSTRUCTION_LICENCE_CODES.includes(requestedLicence)) {
      return NextResponse.json({ error: 'Licence de formation invalide.' }, { status: 400 });
    }
    if (!canOpenFormationAsInstructor(cap, requestedLicence)) {
      return NextResponse.json(
        {
          error:
            'Vous n’êtes pas autorisé à ouvrir ce parcours (formation vol : FI ou rôle instructeur ; parcours ATC-INIT : ATC FI).',
        },
        { status: 403 },
      );
    }

    const existingUserId = String(body.existing_user_id || '').trim();
    const existingIdent = String(body.existing_identifiant || body.identifiant || '').trim().toLowerCase();
    if (!existingUserId && (!existingIdent || existingIdent.length < 2)) {
      return NextResponse.json(
        { error: 'Indiquez l’identifiant du compte existant à rattacher.' },
        { status: 400 },
      );
    }
    const setAssignmentReferent = body.set_assignment_referent !== false;

    if (existingUserId) {
      const { data: target, error: findErr } = await admin
        .from('profiles')
        .select('id, identifiant, role, instructeur_referent_id, formation_instruction_active')
        .eq('id', existingUserId)
        .maybeSingle();
      if (findErr) return NextResponse.json({ error: findErr.message }, { status: 400 });
      if (!target) return NextResponse.json({ error: 'Compte introuvable.' }, { status: 404 });
      return attachExistingStudent(
        admin,
        user.id,
        me?.identifiant,
        target,
        requestedLicence,
        setAssignmentReferent,
      );
    }

    const { data: target, error: findErr } = await admin
      .from('profiles')
      .select('id, identifiant, role, instructeur_referent_id, formation_instruction_active')
      .eq('identifiant', existingIdent)
      .maybeSingle();
    if (findErr) return NextResponse.json({ error: findErr.message }, { status: 400 });
    if (!target) return NextResponse.json({ error: 'Aucun compte avec cet identifiant.' }, { status: 404 });
    return attachExistingStudent(
      admin,
      user.id,
      me?.identifiant,
      target,
      requestedLicence,
      setAssignmentReferent,
    );
  } catch (e) {
    console.error('instruction/eleves POST:', e);
    return NextResponse.json({ error: 'Erreur serveur' }, { status: 500 });
  }
}
