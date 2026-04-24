import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { getExaminerPoolUserIds, userCanConcludeThisExam } from '@/lib/instruction-permissions';
import { notifyExamInstructorReassignment } from '@/lib/instruction-exam-reassign-notify';
import { logActivity, getClientIp } from '@/lib/activity-log';

async function getReassignContext(
  admin: ReturnType<typeof createAdminClient>,
  user: { id: string },
  me: { role?: string | null; identifiant?: string | null } | null,
  requestId: string,
): Promise<
  | { error: NextResponse }
  | {
      row: {
        id: string;
        instructeur_id: string | null;
        requester_id: string;
        statut: string;
        licence_code: string;
      };
      me: { role?: string | null; identifiant?: string | null } | null;
      eligible: string[];
    }
> {
  const { data: row } = await admin
    .from('instruction_exam_requests')
    .select('id, instructeur_id, requester_id, statut, licence_code')
    .eq('id', requestId)
    .single();
  if (!row) {
    return { error: NextResponse.json({ error: 'Demande introuvable.' }, { status: 404 }) };
  }
  if (row.instructeur_id !== user.id) {
    return { error: NextResponse.json({ error: 'Seul l’examinateur assigné peut transmettre cette demande.' }, { status: 403 }) };
  }
  if (!(await userCanConcludeThisExam(admin, user.id, me?.role, row.licence_code))) {
    return {
      error: NextResponse.json(
        { error: 'Habilitation requise (licence FE ou ATC FE selon le type d’examen).' },
        { status: 403 },
      ),
    };
  }
  if (row.statut === 'en_cours' || row.statut === 'termine') {
    return {
      error: NextResponse.json(
        { error: 'Impossible de transmettre : terminez la session en cours ou la demande est déjà clôturée.' },
        { status: 400 },
      ),
    };
  }
  if (row.statut !== 'assigne' && row.statut !== 'accepte') {
    return { error: NextResponse.json({ error: 'État de la demande incompatible avec une transmission.' }, { status: 400 }) };
  }
  const pool = await getExaminerPoolUserIds(admin, row.licence_code);
  const eligible = pool.filter((eid) => eid !== user.id);
  return { row, me, eligible };
}

/**
 * GET — Liste des examinateurs pouvant reprendre la demande (même rôle, hors vous-même).
 */
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Non autorisé' }, { status: 401 });

    const admin = createAdminClient();
    const { data: me } = await admin.from('profiles').select('role, identifiant').eq('id', user.id).single();
    const ctx = await getReassignContext(admin, user, me, id);
    if ('error' in ctx) return ctx.error;

    if (ctx.eligible.length === 0) {
      return NextResponse.json({ candidates: [] as Array<{ id: string; identifiant: string }> });
    }
    const { data: profs, error: perr } = await admin
      .from('profiles')
      .select('id, identifiant')
      .in('id', ctx.eligible)
      .order('identifiant', { ascending: true });
    if (perr) return NextResponse.json({ error: perr.message }, { status: 400 });
    return NextResponse.json({ candidates: profs || [] });
  } catch (e) {
    console.error('GET exam-requests/[id]/reassign:', e);
    return NextResponse.json({ error: 'Erreur serveur' }, { status: 500 });
  }
}

/**
 * POST — Transmet la demande à l’examen **instructeur_id** (corps JSON obligatoire).
 * Statut remis en « assigne » pour que le collègue confirme.
 */
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Non autorisé' }, { status: 401 });

    const admin = createAdminClient();
    const { data: me } = await admin.from('profiles').select('role, identifiant').eq('id', user.id).single();
    const ctx = await getReassignContext(admin, user, me, id);
    if ('error' in ctx) return ctx.error;

    const { row, eligible } = ctx;
    if (eligible.length === 0) {
      return NextResponse.json(
        { error: 'Aucun autre examinateur habilité n’est disponible pour reprendre cette demande.' },
        { status: 400 },
      );
    }

    const body = await request.json().catch(() => ({}));
    const targetId = typeof body?.instructeur_id === 'string' ? body.instructeur_id.trim() : '';
    if (!targetId) {
      return NextResponse.json({ error: 'Choisissez un examinateur (instructeur_id).' }, { status: 400 });
    }
    if (!eligible.includes(targetId)) {
      return NextResponse.json(
        { error: 'Cet examinateur ne peut pas recevoir ce type d’examen (ou c’est vous-même).' },
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

    try {
      await notifyExamInstructorReassignment(admin, {
        expediteurId: user.id,
        licenceCode: row.licence_code,
        requesterId: row.requester_id,
        oldInstructorId: row.instructeur_id,
        newInstructorId: targetId,
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
      details: { licence_code: row.licence_code, to: targetId },
      ip: getClientIp(request),
    });

    return NextResponse.json({ ok: true, instructeur_id: targetId });
  } catch (e) {
    console.error('POST exam-requests/[id]/reassign:', e);
    return NextResponse.json({ error: 'Erreur serveur' }, { status: 500 });
  }
}
