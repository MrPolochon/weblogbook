import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import {
  getAtcTrainingTier1UserIds,
  getAtcTrainingTier2UserIds,
  selectTrainingAssigneeFiFirst,
} from '@/lib/instruction-permissions';
import { logActivity } from '@/lib/activity-log';

export async function GET() {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Non autorisé' }, { status: 401 });

    const admin = createAdminClient();
    const { data: mineRows } = await admin
      .from('instruction_atc_training_requests')
      .select('id, requester_id, assignee_id, message, created_at, updated_at')
      .eq('requester_id', user.id)
      .order('created_at', { ascending: false });
    const assigneeFromMine = new Set((mineRows || []).map((r) => r.assignee_id as string).filter(Boolean));
    const { data: aProfiles } = assigneeFromMine.size
      ? await admin.from('profiles').select('id, identifiant').in('id', Array.from(assigneeFromMine))
      : { data: [] as Array<{ id: string; identifiant: string }> };
    const aMap = new Map((aProfiles || []).map((p) => [p.id, p.identifiant]));
    const mine = (mineRows || []).map((r) => ({
      ...r,
      assignee_identifiant: aMap.get(r.assignee_id as string) || null,
    }));

    const { data: toMe } = await admin
      .from('instruction_atc_training_requests')
      .select('id, requester_id, assignee_id, message, created_at, updated_at')
      .eq('assignee_id', user.id)
      .order('created_at', { ascending: false });
    const reqIds = new Set((toMe || []).map((r) => r.requester_id as string).filter(Boolean));
    const { data: rProfiles } = reqIds.size
      ? await admin.from('profiles').select('id, identifiant').in('id', Array.from(reqIds))
      : { data: [] as Array<{ id: string; identifiant: string }> };
    const rMap = new Map((rProfiles || []).map((p) => [p.id, p.identifiant]));
    const assigned = (toMe || []).map((r) => ({
      ...r,
      requester_identifiant: rMap.get(r.requester_id as string) || null,
    }));

    return NextResponse.json({ mine, assigned });
  } catch (e) {
    console.error('instruction/atc-trainings GET:', e);
    return NextResponse.json({ error: 'Erreur serveur' }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Non autorisé' }, { status: 401 });

    const admin = createAdminClient();
    const { count: openMine } = await admin
      .from('instruction_atc_training_requests')
      .select('*', { count: 'exact', head: true })
      .eq('requester_id', user.id);
    if ((openMine ?? 0) > 0) {
      return NextResponse.json(
        { error: 'Vous avez déjà une demande de session training en cours. Terminez ou annulez-la avant d’en créer une autre.' },
        { status: 400 },
      );
    }

    const body = await request.json();
    const message = body.message != null ? String(body.message).trim() : null;

    const tier1 = await getAtcTrainingTier1UserIds(admin);
    const tier1Set = new Set(tier1);
    const tier2 = await getAtcTrainingTier2UserIds(admin, tier1Set);
    const combinedPool = Array.from(new Set(tier1.concat(tier2)));
    if (combinedPool.length === 0) {
      return NextResponse.json(
        { error: 'Aucun titulaire des licences ATC FI ou ATC FE disponible pour l’instant.' },
        { status: 400 },
      );
    }

    const workload = new Map<string, number>();
    for (const id of combinedPool) workload.set(id, 0);
    const { data: asAssignee } = await admin
      .from('instruction_atc_training_requests')
      .select('assignee_id')
      .in('assignee_id', combinedPool);
    for (const r of asAssignee || []) {
      if (!r.assignee_id) continue;
      workload.set(r.assignee_id, (workload.get(r.assignee_id) || 0) + 1);
    }

    const assigneeId = selectTrainingAssigneeFiFirst(tier1, tier2, user.id, workload);
    if (!assigneeId) {
      return NextResponse.json({ error: 'Aucun instructeur assignable.' }, { status: 400 });
    }

    const { data: row, error: insErr } = await admin
      .from('instruction_atc_training_requests')
      .insert({
        requester_id: user.id,
        assignee_id: assigneeId,
        message: message || null,
        updated_at: new Date().toISOString(),
      })
      .select('id')
      .single();
    if (insErr) return NextResponse.json({ error: insErr.message }, { status: 400 });

    logActivity({
      userId: user.id,
      action: 'atc_training_request',
      targetType: 'atc_training',
      targetId: row.id,
      details: { assignee_id: assigneeId },
    });
    return NextResponse.json({ ok: true, id: row.id, assignee_id: assigneeId });
  } catch (e) {
    console.error('instruction/atc-trainings POST:', e);
    return NextResponse.json({ error: 'Erreur serveur' }, { status: 500 });
  }
}
