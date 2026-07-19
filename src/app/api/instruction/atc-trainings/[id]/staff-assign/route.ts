export const dynamic = 'force-dynamic';
import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { getAdminAtcTrainingStaffPoolUserIds } from '@/lib/instruction-permissions';
import { trainingSideForExamLicence } from '@/lib/instruction-exam-rules';
import { logActivity, getClientIp } from '@/lib/activity-log';

type TrainingRow = {
  id: string;
  assignee_id: string;
  requester_id: string;
  licence_code: string | null;
};

async function requireAdminAndOpenTraining(
  requestId: string,
): Promise<
  | { error: NextResponse }
  | {
      user: { id: string };
      me: { role: string; identifiant: string | null };
      admin: ReturnType<typeof createAdminClient>;
      row: TrainingRow;
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
    .from('instruction_atc_training_requests')
    .select('id, assignee_id, requester_id, licence_code')
    .eq('id', requestId)
    .single();
  if (!row) {
    return { error: NextResponse.json({ error: 'Demande introuvable.' }, { status: 404 }) };
  }
  if (!row.licence_code || trainingSideForExamLicence(row.licence_code) !== 'atc') {
    return { error: NextResponse.json({ error: 'Demande de training ATC invalide.' }, { status: 400 }) };
  }

  return {
    user,
    me: { role: me.role, identifiant: me.identifiant ?? null },
    admin,
    row: row as TrainingRow,
  };
}

/**
 * GET — Admin : tous les instructeurs ATC FI pour réassigner une session training ATC.
 */
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const ctx = await requireAdminAndOpenTraining(id);
    if ('error' in ctx) return ctx.error;

    const { admin, row } = ctx;
    const candidateIds = (await getAdminAtcTrainingStaffPoolUserIds(admin)).filter(
      (eid) => eid !== row.requester_id,
    );
    if (candidateIds.length === 0) {
      return NextResponse.json({ candidates: [] as Array<{ id: string; identifiant: string; tier: string; currently_assigned: boolean }> });
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
      tier: 'ATC FI',
      currently_assigned: p.id === row.assignee_id,
    }));

    return NextResponse.json({
      candidates,
      current_assignee_id: row.assignee_id,
      licence_code: row.licence_code,
    });
  } catch (e) {
    console.error('GET atc-trainings/[id]/staff-assign:', e);
    return NextResponse.json({ error: 'Erreur serveur' }, { status: 500 });
  }
}

/**
 * POST — Admin : change l'instructeur assigné à une session training ATC.
 * Body : { assignee_id: string }
 */
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const ctx = await requireAdminAndOpenTraining(id);
    if ('error' in ctx) return ctx.error;

    const { user, me, admin, row } = ctx;
    const body = await request.json().catch(() => ({}));
    const targetId = typeof body?.assignee_id === 'string' ? body.assignee_id.trim() : '';
    if (!targetId) {
      return NextResponse.json({ error: 'Choisissez un instructeur (assignee_id).' }, { status: 400 });
    }
    if (targetId === row.requester_id) {
      return NextResponse.json({ error: 'Le demandeur ne peut pas être son propre instructeur.' }, { status: 400 });
    }
    if (targetId === row.assignee_id) {
      return NextResponse.json({ error: 'Cet instructeur est déjà assigné à cette demande.' }, { status: 400 });
    }

    const pool = new Set(await getAdminAtcTrainingStaffPoolUserIds(admin));
    if (!pool.has(targetId)) {
      return NextResponse.json(
        { error: 'Cet utilisateur n’est pas titulaire de la licence ATC FI.' },
        { status: 400 },
      );
    }

    const { error: upErr } = await admin
      .from('instruction_atc_training_requests')
      .update({
        assignee_id: targetId,
        updated_at: new Date().toISOString(),
      })
      .eq('id', id);
    if (upErr) return NextResponse.json({ error: upErr.message }, { status: 400 });

    logActivity({
      userId: user.id,
      userIdentifiant: me.identifiant,
      action: 'atc_training_staff_reassign',
      targetType: 'atc_training',
      targetId: id,
      details: {
        licence_code: row.licence_code,
        to: targetId,
        from: row.assignee_id,
      },
      ip: getClientIp(request),
    });

    return NextResponse.json({ ok: true, assignee_id: targetId });
  } catch (e) {
    console.error('POST atc-trainings/[id]/staff-assign:', e);
    return NextResponse.json({ error: 'Erreur serveur' }, { status: 500 });
  }
}
