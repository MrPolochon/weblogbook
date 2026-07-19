export const dynamic = 'force-dynamic';
import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { logActivity } from '@/lib/activity-log';
import { recordTrainingCompletion } from '@/lib/instruction-exam-rules';

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Non autorisé' }, { status: 401 });

    const body = await request.json();
    const action = String(body.action || '').trim();
    if (action !== 'termine') {
      return NextResponse.json({ error: 'Action inconnue (utilisez termine).' }, { status: 400 });
    }

    const admin = createAdminClient();
    const { data: row } = await admin
      .from('instruction_atc_training_requests')
      .select('id, requester_id, assignee_id, licence_code')
      .eq('id', id)
      .maybeSingle();
    if (!row) return NextResponse.json({ error: 'Demande introuvable.' }, { status: 404 });
    if (row.assignee_id !== user.id) {
      return NextResponse.json({ error: 'Seul l’instructeur assigné peut clôturer la session.' }, { status: 403 });
    }
    if (!row.licence_code) {
      return NextResponse.json(
        { error: 'Cette session n’a pas de licence associée. Annulez-la et demandez une nouvelle session avec la licence visée.' },
        { status: 400 },
      );
    }

    await recordTrainingCompletion(admin, {
      requesterId: row.requester_id as string,
      licenceCode: row.licence_code as string,
      instructorId: row.assignee_id as string,
    });

    const { error: delErr } = await admin.from('instruction_atc_training_requests').delete().eq('id', id);
    if (delErr) return NextResponse.json({ error: delErr.message }, { status: 400 });

    logActivity({
      userId: user.id,
      action: 'atc_training_completed',
      targetType: 'atc_training',
      targetId: id,
      details: { requester_id: row.requester_id, licence_code: row.licence_code },
    });
    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error('instruction/atc-trainings/[id] PATCH:', e);
    return NextResponse.json({ error: 'Erreur serveur' }, { status: 500 });
  }
}

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Non autorisé' }, { status: 401 });

    const admin = createAdminClient();
    const { data: row } = await admin
      .from('instruction_atc_training_requests')
      .select('id, requester_id, assignee_id, licence_code')
      .eq('id', id)
      .maybeSingle();
    if (!row) return NextResponse.json({ error: 'Demande introuvable.' }, { status: 404 });

    const { data: me } = await admin.from('profiles').select('role, identifiant').eq('id', user.id).single();
    const isAdmin = me?.role === 'admin';
    if (row.requester_id !== user.id && !isAdmin) {
      return NextResponse.json({ error: 'Seul le demandeur ou un administrateur peut annuler.' }, { status: 403 });
    }

    const { error } = await admin.from('instruction_atc_training_requests').delete().eq('id', id);
    if (error) return NextResponse.json({ error: error.message }, { status: 400 });

    logActivity({
      userId: user.id,
      userIdentifiant: me?.identifiant,
      action: isAdmin ? 'admin_cancel_atc_training' : 'cancel_atc_training',
      targetType: 'atc_training',
      targetId: id,
      details: {
        requester_id: row.requester_id,
        assignee_id: row.assignee_id,
        licence_code: row.licence_code,
      },
    });

    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error('instruction/atc-trainings/[id] DELETE:', e);
    return NextResponse.json({ error: 'Erreur serveur' }, { status: 500 });
  }
}
