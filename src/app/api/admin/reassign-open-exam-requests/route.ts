import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { logActivity, getClientIp } from '@/lib/activity-log';
import { getCachedExaminerPool, notifyExamInstructorReassignment } from '@/lib/instruction-exam-reassign-notify';
import { selectExamInstructorByWorkload } from '@/lib/instruction-exam-assign';

type ExamRow = {
  id: string;
  requester_id: string;
  licence_code: string;
  instructeur_id: string | null;
  created_at: string | null;
};

/**
 * POST — Admin uniquement.
 * Réattribue les demandes ouvertes en répartissant la charge entre les FE / ATC FE
 * (même algorithme que la création d’une demande : file d’attente + élèves en formation).
 *
 * Body JSON optionnel : { "dryRun": true } — prévisualise sans écrire (simule la charge au fil de la file).
 */
export async function POST(request: Request) {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Non authentifié' }, { status: 401 });

    const { data: profile } = await supabase.from('profiles').select('role, identifiant').eq('id', user.id).single();
    if (profile?.role !== 'admin') {
      return NextResponse.json({ error: 'Réservé aux administrateurs' }, { status: 403 });
    }

    const body = await request.json().catch(() => ({}));
    const dryRun = Boolean(body?.dryRun);

    const admin = createAdminClient();

    const { data: examRows, error: examErr } = await admin
      .from('instruction_exam_requests')
      .select('id, requester_id, licence_code, instructeur_id, statut, created_at')
      .in('statut', ['assigne', 'accepte', 'en_cours']);
    if (examErr) return NextResponse.json({ error: examErr.message }, { status: 400 });

    const rows = (examRows || ([] as ExamRow[])).sort((a, b) => {
      const ca = a.created_at || '';
      const cb = b.created_at || '';
      return ca.localeCompare(cb);
    });

    if (rows.length === 0) {
      return NextResponse.json({ ok: true, dryRun, changed: 0, preview: [] });
    }

    const poolCache = { flight: null as string[] | null, atc: null as string[] | null };

    if (dryRun) {
      const simulatedExtra = new Map<string, number>();
      const preview: Array<{
        id: string;
        licence_code: string;
        old_instructeur_id: string | null;
        new_instructeur_id: string;
      }> = [];

      for (const r of rows) {
        const pool = await getCachedExaminerPool(admin, r.licence_code, poolCache);
        const newId = await selectExamInstructorByWorkload(admin, pool, r.requester_id, {
          simulatedExtraLoad: simulatedExtra,
          tieBreakKey: r.id,
        });
        if (!newId || newId === r.instructeur_id) continue;
        preview.push({
          id: r.id,
          licence_code: r.licence_code,
          old_instructeur_id: r.instructeur_id,
          new_instructeur_id: newId,
        });
        simulatedExtra.set(newId, (simulatedExtra.get(newId) || 0) + 1);
      }

      return NextResponse.json({
        ok: true,
        dryRun: true,
        wouldChange: preview.length,
        preview,
      });
    }

    let changed = 0;
    for (const r of rows) {
      const pool = await getCachedExaminerPool(admin, r.licence_code, poolCache);
      const newId = await selectExamInstructorByWorkload(admin, pool, r.requester_id, { tieBreakKey: r.id });
      if (!newId || newId === r.instructeur_id) continue;

      const { error: upErr } = await admin
        .from('instruction_exam_requests')
        .update({ instructeur_id: newId, updated_at: new Date().toISOString() })
        .eq('id', r.id);
      if (upErr) {
        return NextResponse.json({ error: `Mise à jour ${r.id}: ${upErr.message}` }, { status: 400 });
      }
      try {
        await notifyExamInstructorReassignment(admin, {
          expediteurId: user.id,
          licenceCode: r.licence_code,
          requesterId: r.requester_id,
          oldInstructorId: r.instructeur_id,
          newInstructorId: newId,
          raison: 'admin_batch',
        });
        changed += 1;
      } catch (e) {
        console.error('reassign-open-exam-requests notify failed', r.id, e);
        return NextResponse.json(
          {
            error: e instanceof Error ? e.message : 'Erreur envoi messages',
            partial: changed,
            failedAt: r.id,
          },
          { status: 500 },
        );
      }
    }

    logActivity({
      userId: user.id,
      userIdentifiant: profile.identifiant,
      action: 'admin_reassign_exam_requests',
      targetType: 'batch',
      details: { changed },
      ip: getClientIp(request),
    });

    return NextResponse.json({ ok: true, dryRun: false, changed, notified: changed });
  } catch (e) {
    console.error('[admin/reassign-open-exam-requests]', e);
    return NextResponse.json({ error: 'Erreur serveur' }, { status: 500 });
  }
}
