import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { canAccessSiavi } from '@/lib/siavi/permissions';

export async function GET() {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Non authentifié' }, { status: 401 });

    const admin = createAdminClient();

    const { data: profile } = await admin.from('profiles')
      .select('role, siavi, ifsa')
      .eq('id', user.id)
      .single();

    const canView = profile?.role === 'admin' || profile?.siavi || profile?.role === 'siavi' || profile?.ifsa;
    if (!canView) return NextResponse.json({ error: 'Accès refusé' }, { status: 403 });

    const { data, error } = await admin.from('siavi_rapports_medevac')
      .select(`
        id, numero_mission, date_mission, operator_base,
        aircraft_registration, aircraft_type, commander, co_pilot,
        outcome, created_at,
        plan_vol:plan_vol_id(id, numero_vol, aeroport_depart, aeroport_arrivee)
      `)
      .order('numero_mission', { ascending: false });

    if (error) return NextResponse.json({ error: error.message }, { status: 400 });
    return NextResponse.json(data || []);
  } catch (e) {
    console.error('SIAVI rapports GET:', e);
    return NextResponse.json({ error: 'Erreur serveur' }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Non authentifié' }, { status: 401 });

    const admin = createAdminClient();
    const ok = await canAccessSiavi(admin, user.id);
    if (!ok) return NextResponse.json({ error: 'Accès SIAVI requis' }, { status: 403 });

    const body = await request.json();
    const {
      plan_vol_id, commander, co_pilot, medical_team,
      mission_timeline, medical_summary, ground_event,
      outcome, safety_remarks
    } = body;

    if (!plan_vol_id) return NextResponse.json({ error: 'plan_vol_id requis' }, { status: 400 });
    if (!commander?.trim()) return NextResponse.json({ error: 'Commandant de bord requis' }, { status: 400 });
    if (!medical_summary?.trim()) return NextResponse.json({ error: 'Résumé médical requis' }, { status: 400 });
    if (!outcome?.trim()) return NextResponse.json({ error: 'Issue de la mission requise' }, { status: 400 });

    // Vérifier que le plan de vol existe, est un MEDEVAC et est clôturé
    const { data: plan } = await admin.from('plans_vol')
      .select('id, numero_vol, aeroport_depart, aeroport_arrivee, siavi_avion_id, statut, medevac_mission_id, medevac_next_plan_id')
      .eq('id', plan_vol_id)
      .single();

    if (!plan) return NextResponse.json({ error: 'Plan de vol introuvable' }, { status: 404 });
    if (!plan.siavi_avion_id) return NextResponse.json({ error: 'Ce plan de vol n\'est pas un vol MEDEVAC SIAVI' }, { status: 400 });
    if (plan.statut !== 'cloture') {
      return NextResponse.json({ error: 'Le vol doit être clôturé avant d\'enregistrer le rapport.' }, { status: 400 });
    }
    // Segment intermédiaire (clôturé lors de l\'activation du segment suivant) : rapport uniquement sur le dernier segment
    if (plan.medevac_next_plan_id) {
      return NextResponse.json({ error: 'Le rapport MEDEVAC s\'enregistre sur le dernier segment de mission.' }, { status: 400 });
    }

    let missionPlanIds = [plan.id];
    if (plan.medevac_mission_id) {
      const { data: missionSegs } = await admin
        .from('plans_vol')
        .select('id')
        .eq('medevac_mission_id', plan.medevac_mission_id);
      missionPlanIds = (missionSegs || []).map((r) => r.id);
    }
    const { data: existingAny } = await admin.from('siavi_rapports_medevac')
      .select('id')
      .in('plan_vol_id', missionPlanIds)
      .maybeSingle();

    if (existingAny) return NextResponse.json({ error: 'Un rapport existe déjà pour cette mission.' }, { status: 400 });

    // Récupérer les infos de l'avion SIAVI
    const { data: avion } = await admin.from('siavi_avions')
      .select('immatriculation, types_avion:type_avion_id(nom)')
      .eq('id', plan.siavi_avion_id)
      .single();

    const ta = avion?.types_avion as { nom?: string } | { nom?: string }[] | null | undefined;
    const typeName = ta ? (Array.isArray(ta) ? (ta[0]?.nom || 'Unknown') : (ta.nom || 'Unknown')) : 'Unknown';

    const { data: rapport, error } = await admin.from('siavi_rapports_medevac').insert({
      plan_vol_id,
      date_mission: new Date().toISOString().split('T')[0],
      operator_base: `${plan.aeroport_depart}`,
      aircraft_registration: avion?.immatriculation || 'N/A',
      aircraft_type: typeName || 'N/A',
      aircraft_role: 'Medical transport configuration',
      commander: commander.trim(),
      co_pilot: co_pilot?.trim() || null,
      medical_team: medical_team?.trim() || null,
      mission_timeline: Array.isArray(mission_timeline) ? mission_timeline : [],
      medical_summary: medical_summary.trim(),
      ground_event: ground_event?.trim() || null,
      outcome: outcome.trim(),
      safety_remarks: safety_remarks?.trim() || null,
      created_by: user.id,
    }).select('id, numero_mission').single();

    if (error) {
      console.error('SIAVI rapport insert error:', error);
      return NextResponse.json({ error: error.message }, { status: 400 });
    }

    return NextResponse.json({ ok: true, id: rapport.id, numero_mission: rapport.numero_mission });
  } catch (e) {
    console.error('SIAVI rapports POST:', e);
    return NextResponse.json({ error: 'Erreur serveur' }, { status: 500 });
  }
}
