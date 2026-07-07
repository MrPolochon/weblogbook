import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { assignerEquipeADemande, creerContributions } from '@/lib/ground/teams';
import type { ServiceType } from '@/lib/types';

export async function GET(request: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Non authentifié' }, { status: 401 });

  const admin = createAdminClient();
  const { searchParams } = new URL(request.url);
  const aeroport = searchParams.get('aeroport');
  const planVolId = searchParams.get('plan_vol_id');
  const statut = searchParams.get('statut');

  let query = admin
    .from('ground_service_requests')
    .select(`
      id, plan_vol_id, pilote_id, aeroport, service_type, statut,
      accepted_by, requested_at, accepted_at, completed_at,
      pax_count, score_minijeu, montant_paye, notes, team_id,
      pilote:profiles!ground_service_requests_pilote_id_fkey(identifiant),
      plan_vol:plans_vol!ground_service_requests_plan_vol_id_fkey(numero_vol, aeroport_depart, aeroport_arrivee)
    `)
    .order('requested_at', { ascending: false });

  if (aeroport) query = query.eq('aeroport', aeroport);
  if (planVolId) query = query.eq('plan_vol_id', planVolId);
  if (statut) query = query.eq('statut', statut);

  const { data: requests, error } = await query;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ requests });
}

export async function POST(request: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Non authentifié' }, { status: 401 });

  const admin = createAdminClient();

  // Seul un pilote (ou admin) peut créer une demande — jamais un ground crew
  const { data: profile } = await admin
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .single();

  if (!profile || profile.role === 'ground_crew') {
    return NextResponse.json(
      { error: 'Seul un pilote peut créer une demande de service au sol' },
      { status: 403 }
    );
  }

  const body = await request.json() as {
    plan_vol_id?: string;
    aeroport?: string;
    service_type?: ServiceType;
    pax_count?: number;
    notes?: string;
  };

  if (!body.plan_vol_id || !body.aeroport || !body.service_type) {
    return NextResponse.json({ error: 'plan_vol_id, aeroport et service_type requis' }, { status: 400 });
  }

  const validTypes: ServiceType[] = ['bagages', 'catering', 'fuel', 'boarding'];
  if (!validTypes.includes(body.service_type)) {
    return NextResponse.json({ error: 'service_type invalide' }, { status: 400 });
  }

  // Vérifier qu'au moins un GC est en service sur cet aéroport
  const { data: groundSession } = await admin
    .from('ground_sessions')
    .select('id')
    .eq('aeroport', body.aeroport)
    .limit(1);

  if (!groundSession || groundSession.length === 0) {
    return NextResponse.json({ error: 'Aucun ground crew en service sur cet aéroport' }, { status: 422 });
  }

  // Vérifier que le plan de vol appartient à l'utilisateur
  const { data: plan } = await admin
    .from('plans_vol')
    .select('id, pilote_id')
    .eq('id', body.plan_vol_id)
    .single();

  if (!plan || plan.pilote_id !== user.id) {
    return NextResponse.json({ error: 'Plan de vol introuvable ou non autorisé' }, { status: 403 });
  }

  // Éviter les doublons (même service_type en cours pour ce plan)
  const { data: existing } = await admin
    .from('ground_service_requests')
    .select('id')
    .eq('plan_vol_id', body.plan_vol_id)
    .eq('service_type', body.service_type)
    .in('statut', ['pending', 'accepted', 'in_progress'])
    .limit(1);

  if (existing && existing.length > 0) {
    return NextResponse.json({ error: 'Une demande de ce type est déjà en cours' }, { status: 409 });
  }

  // Assigner automatiquement à la meilleure équipe/GC disponible
  const teamId = await assignerEquipeADemande(admin, body.plan_vol_id, body.aeroport);

  const { data: req, error } = await admin
    .from('ground_service_requests')
    .insert({
      plan_vol_id: body.plan_vol_id,
      pilote_id: user.id,
      aeroport: body.aeroport,
      service_type: body.service_type,
      pax_count: body.pax_count ?? null,
      notes: body.notes ?? null,
      team_id: teamId ?? null,
    })
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // Créer les entrées de contribution pour chaque membre de l'équipe
  if (teamId && req) {
    try {
      await creerContributions(admin, req.id, teamId);
    } catch {
      // Non bloquant
    }
  }

  return NextResponse.json({ request: req }, { status: 201 });
}
