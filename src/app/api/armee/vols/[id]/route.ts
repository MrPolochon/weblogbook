export const dynamic = 'force-dynamic';

import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import {
  applyMissionOnAdminDecision,
  canValidateVolMilitaire,
  submitMissionAar,
  TYPE_VOL_MILITAIRE,
  updateVolMilitaire,
  type UpdateVolMilitaireInput,
} from '@/lib/armee';
import { createAdminClient } from '@/lib/supabase/admin';

/** PATCH — modifier un vol, déposer un AAR, ou valider/refuser (PDG/admin). */
export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Non authentifié' }, { status: 401 });

    const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).single();
    const isAdmin = profile?.role === 'admin';
    const body = await request.json();

    if (body.statut === 'validé' || body.statut === 'refusé') {
      if (!(await canValidateVolMilitaire(user.id, profile))) {
        return NextResponse.json({ error: 'Réservé au PDG militaire ou aux administrateurs' }, { status: 403 });
      }
      const admin = createAdminClient();
      const { data: vol } = await admin
        .from('vols')
        .select('id, pilote_id, statut, type_vol, mission_id, mission_titre, mission_reward_base, mission_reward_final, mission_refusals, refusal_count, depart_utc, arrivee_utc')
        .eq('id', id)
        .single();
      if (!vol) return NextResponse.json({ error: 'Vol introuvable' }, { status: 404 });
      if (vol.type_vol !== TYPE_VOL_MILITAIRE) {
        return NextResponse.json({ error: 'Ce vol n\'est pas militaire' }, { status: 400 });
      }

      const updates: Record<string, unknown> = {
        statut: body.statut,
        editing_by_pilot_id: null,
        editing_started_at: null,
      };
      if (body.statut === 'refusé') {
        updates.refusal_reason = body.refusal_reason ?? null;
        updates.refusal_count = ((vol as { refusal_count?: number }).refusal_count ?? 0) + 1;
      }

      const missionFx = await applyMissionOnAdminDecision(vol, body.statut);
      if (!missionFx.ok) {
        return NextResponse.json({ error: missionFx.error }, { status: missionFx.status });
      }
      Object.assign(updates, missionFx.data);

      const { error } = await admin.from('vols').update(updates).eq('id', id);
      if (error) return NextResponse.json({ error: error.message }, { status: 400 });
      return NextResponse.json({ ok: true });
    }

    if (body.aar === true || body.mission_aar_notes !== undefined || body.mission_aar_tags !== undefined) {
      const result = await submitMissionAar(
        id,
        { notes: body.mission_aar_notes, tags: body.mission_aar_tags },
        { userId: user.id, isAdmin: Boolean(isAdmin) },
      );
      if (!result.ok) return NextResponse.json({ error: result.error }, { status: result.status });
      return NextResponse.json({ ok: true, id: result.data.id });
    }

    const result = await updateVolMilitaire(id, body as UpdateVolMilitaireInput, {
      userId: user.id,
      isAdmin: Boolean(isAdmin),
    });
    if (!result.ok) return NextResponse.json({ error: result.error }, { status: result.status });

    return NextResponse.json({ ok: true, id: result.data.id });
  } catch (e) {
    console.error('PATCH /api/armee/vols/[id]:', e);
    return NextResponse.json({ error: 'Erreur serveur' }, { status: 500 });
  }
}
