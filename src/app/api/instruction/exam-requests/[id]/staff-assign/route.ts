export const dynamic = 'force-dynamic';
import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { getAdminExaminerPoolUserIds } from '@/lib/instruction-permissions';
import { getTrainingInstructorIdsForExam } from '@/lib/instruction-exam-rules';
import { notifyExamInstructorReassignment } from '@/lib/instruction-exam-reassign-notify';
import { logActivity, getClientIp } from '@/lib/activity-log';

type ExamRow = {
  id: string;
  instructeur_id: string | null;
  requester_id: string;
  statut: string;
  licence_code: string;
};

async function requireAdminAndOpenExam(
  requestId: string,
): Promise<
  | { error: NextResponse }
  | {
      user: { id: string };
      me: { role: string; identifiant: string | null };
      admin: ReturnType<typeof createAdminClient>;
      row: ExamRow;
    }
> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: NextResponse.json({ error: 'Non autorisé' }, { status: 401 }) };

  const admin = createAdminClient();
  const { data: me } = await admin.from('profiles').select('role, identifiant').eq('id', user.id).single();
  if (me?.role !== 'admin') {
    return { error: NextResponse.json({ error: 'Réservé aux administrateurs.' }, { status: 403 }) };
  }

  const { data: row } = await admin
    .from('instruction_exam_requests')
    .select('id, instructeur_id, requester_id, statut, licence_code')
    .eq('id', requestId)
    .single();
  if (!row) {
    return { error: NextResponse.json({ error: 'Demande introuvable.' }, { status: 404 }) };
  }
  if (row.statut === 'en_cours' || row.statut === 'termine' || row.statut === 'refuse') {
    return {
      error: NextResponse.json(
        { error: 'Seules les demandes en attente (assigne / accepte) peuvent être réassignées.' },
        { status: 400 },
      ),
    };
  }
  if (row.statut !== 'assigne' && row.statut !== 'accepte') {
    return { error: NextResponse.json({ error: 'État de la demande incompatible.' }, { status: 400 }) };
  }

  return {
    user,
    me: { role: me.role, identifiant: me.identifiant ?? null },
    admin,
    row: row as ExamRow,
  };
}

/**
 * GET — Admin : tous les examinateurs habilités (FE / ATC FE) pour cette demande,
 * avec indication de conflit training (même licence) — sans filtrer indisponibles.
 */
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const ctx = await requireAdminAndOpenExam(id);
    if ('error' in ctx) return ctx.error;

    const { admin, row } = ctx;
    const pool = await getAdminExaminerPoolUserIds(admin, row.licence_code);
    const trainerIds = await getTrainingInstructorIdsForExam(admin, row.requester_id, row.licence_code);
    const candidateIds = pool.filter((eid) => eid !== row.requester_id);
    if (candidateIds.length === 0) {
      return NextResponse.json({ candidates: [] as Array<{ id: string; identifiant: string; trained_conflict: boolean }> });
    }

    const { data: profs, error: perr } = await admin
      .from('profiles')
      .select('id, identifiant')
      .in('id', candidateIds)
      .order('identifiant', { ascending: true });
    if (perr) return NextResponse.json({ error: perr.message }, { status: 400 });

    const candidates = (profs || []).map((p) => ({
      id: p.id as string,
      identifiant: p.identifiant as string,
      trained_conflict: trainerIds.has(p.id as string),
      currently_assigned: p.id === row.instructeur_id,
    }));

    return NextResponse.json({
      candidates,
      current_instructeur_id: row.instructeur_id,
      licence_code: row.licence_code,
    });
  } catch (e) {
    console.error('GET exam-requests/[id]/staff-assign:', e);
    return NextResponse.json({ error: 'Erreur serveur' }, { status: 500 });
  }
}

/**
 * POST — Admin : change l’examinateur assigné.
 * Body : { instructeur_id: string, force?: boolean }
 * Par défaut, un instructeur ayant formé le candidat sur cette licence est refusé.
 * `force: true` permet le contournement (cas exceptionnel, confirmation côté UI).
 */
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const ctx = await requireAdminAndOpenExam(id);
    if ('error' in ctx) return ctx.error;

    const { user, me, admin, row } = ctx;
    const body = await request.json().catch(() => ({}));
    const targetId = typeof body?.instructeur_id === 'string' ? body.instructeur_id.trim() : '';
    const force = Boolean(body?.force);
    if (!targetId) {
      return NextResponse.json({ error: 'Choisissez un examinateur (instructeur_id).' }, { status: 400 });
    }
    if (targetId === row.requester_id) {
      return NextResponse.json({ error: 'Le candidat ne peut pas être son propre examinateur.' }, { status: 400 });
    }
    if (targetId === row.instructeur_id) {
      return NextResponse.json({ error: 'Cet examinateur est déjà assigné à cette demande.' }, { status: 400 });
    }

    const pool = await getAdminExaminerPoolUserIds(admin, row.licence_code);
    if (!pool.includes(targetId)) {
      return NextResponse.json(
        { error: 'Cet utilisateur n’est pas un examinateur habilité pour ce type d’examen (FE / ATC FE).' },
        { status: 400 },
      );
    }

    const trainerIds = await getTrainingInstructorIdsForExam(admin, row.requester_id, row.licence_code);
    if (trainerIds.has(targetId) && !force) {
      return NextResponse.json(
        {
          error:
            'Cet instructeur a formé le candidat sur cette licence : il ne peut pas être examinateur. Cochez « forcer » uniquement en cas exceptionnel.',
          trained_conflict: true,
        },
        { status: 400 },
      );
    }

    const { error: upErr } = await admin
      .from('instruction_exam_requests')
      .update({
        instructeur_id: targetId,
        statut: 'assigne',
        response_note: null,
        updated_at: new Date().toISOString(),
      })
      .eq('id', id);
    if (upErr) return NextResponse.json({ error: upErr.message }, { status: 400 });

    await admin
      .from('inventaire_avions')
      .update({ instruction_instructeur_id: targetId })
      .eq('instruction_session_kind', 'exam')
      .eq('instruction_session_id', id)
      .eq('instruction_actif', true)
      .in('instruction_lifecycle', ['brouillon', 'actif']);

    try {
      await notifyExamInstructorReassignment(admin, {
        expediteurId: user.id,
        licenceCode: row.licence_code,
        requesterId: row.requester_id,
        oldInstructorId: row.instructeur_id,
        newInstructorId: targetId,
        raison: 'admin_batch',
      });
    } catch (e) {
      console.error('staff-assign exam notify:', e);
      return NextResponse.json(
        { error: e instanceof Error ? e.message : 'Demande mise à jour mais échec partiel de la messagerie.' },
        { status: 500 },
      );
    }

    logActivity({
      userId: user.id,
      userIdentifiant: me.identifiant,
      action: 'exam_staff_reassign_instructor',
      targetType: 'exam_request',
      targetId: id,
      details: {
        licence_code: row.licence_code,
        to: targetId,
        from: row.instructeur_id,
        force,
        trained_conflict: trainerIds.has(targetId),
      },
      ip: getClientIp(request),
    });

    return NextResponse.json({ ok: true, instructeur_id: targetId, forced: force && trainerIds.has(targetId) });
  } catch (e) {
    console.error('POST exam-requests/[id]/staff-assign:', e);
    return NextResponse.json({ error: 'Erreur serveur' }, { status: 500 });
  }
}
