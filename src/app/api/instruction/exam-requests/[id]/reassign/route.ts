import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { getExaminerPoolUserIds, userCanConcludeThisExam } from '@/lib/instruction-permissions';
import { selectExamInstructorByWorkload } from '@/lib/instruction-exam-assign';
import { notifyExamInstructorReassignment } from '@/lib/instruction-exam-reassign-notify';
import { logActivity, getClientIp } from '@/lib/activity-log';

/**
 * POST — L’examinateur actuellement assigné (ou le même rôle de pool) transmet
 * la demande à un autre FE / ATC FE. Statut remis en « assigne » pour que le
 * nouvel examinateur confirme.
 */
export async function POST(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Non autorisé' }, { status: 401 });

    const admin = createAdminClient();
    const { data: me } = await admin.from('profiles').select('role, identifiant').eq('id', user.id).single();

    const { data: row } = await admin
      .from('instruction_exam_requests')
      .select('id, instructeur_id, requester_id, statut, licence_code')
      .eq('id', id)
      .single();
    if (!row) return NextResponse.json({ error: 'Demande introuvable.' }, { status: 404 });

    if (row.instructeur_id !== user.id) {
      return NextResponse.json({ error: 'Seul l’examinateur assigné peut transmettre cette demande.' }, { status: 403 });
    }
    if (!(await userCanConcludeThisExam(admin, user.id, me?.role, row.licence_code))) {
      return NextResponse.json(
        { error: 'Habilitation requise (licence FE ou ATC FE selon le type d’examen).' },
        { status: 403 },
      );
    }
    if (row.statut === 'en_cours' || row.statut === 'termine') {
      return NextResponse.json(
        { error: 'Impossible de transmettre : terminez la session en cours ou la demande est déjà clôturée.' },
        { status: 400 },
      );
    }
    if (row.statut !== 'assigne' && row.statut !== 'accepte') {
      return NextResponse.json({ error: 'État de la demande incompatible avec une transmission.' }, { status: 400 });
    }

    const pool = await getExaminerPoolUserIds(admin, row.licence_code);
    const eligible = pool.filter((eid) => eid !== user.id);
    if (eligible.length === 0) {
      return NextResponse.json(
        { error: 'Aucun autre examinateur habilité n’est disponible pour reprendre cette demande.' },
        { status: 400 },
      );
    }

    const newInstructorId = await selectExamInstructorByWorkload(admin, eligible, row.requester_id, {
      tieBreakKey: row.id,
    });
    if (!newInstructorId) {
      return NextResponse.json({ error: 'Impossible de choisir un autre examinateur.' }, { status: 400 });
    }

    const { error: upErr } = await admin
      .from('instruction_exam_requests')
      .update({
        instructeur_id: newInstructorId,
        statut: 'assigne',
        response_note: null,
        updated_at: new Date().toISOString(),
      })
      .eq('id', id);
    if (upErr) return NextResponse.json({ error: upErr.message }, { status: 400 });

    try {
      await notifyExamInstructorReassignment(admin, {
        expediteurId: user.id,
        licenceCode: row.licence_code,
        requesterId: row.requester_id,
        oldInstructorId: row.instructeur_id,
        newInstructorId,
        raison: 'reassign_examinateur',
      });
    } catch (e) {
      console.error('reassign exam notify:', e);
      return NextResponse.json(
        { error: e instanceof Error ? e.message : 'Demande mise à jour mais échec partiel de la messagerie.' },
        { status: 500 },
      );
    }

    logActivity({
      userId: user.id,
      userIdentifiant: me?.identifiant,
      action: 'exam_reassign_instructor',
      targetType: 'exam_request',
      targetId: id,
      details: { licence_code: row.licence_code, to: newInstructorId },
      ip: getClientIp(_request),
    });

    return NextResponse.json({ ok: true, instructeur_id: newInstructorId });
  } catch (e) {
    console.error('POST exam-requests/[id]/reassign:', e);
    return NextResponse.json({ error: 'Erreur serveur' }, { status: 500 });
  }
}
