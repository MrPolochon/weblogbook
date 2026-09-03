import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { redirect } from 'next/navigation';
import GroundDashboard from './GroundDashboard';
import GroundConnexion from './GroundConnexion';
import type { PlanVol, ServiceRequest, Gate, Profile } from './GroundDashboard';
import { PLAN_VOL_SOL_SELECT, mapPlanVolSol, type PlanVolSolRow } from '@/lib/ground/plans-vol';

export const dynamic = 'force-dynamic';

export default async function GroundPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const admin = createAdminClient();

  const { data: session } = await admin
    .from('ground_sessions')
    .select('id, aeroport, started_at')
    .eq('user_id', user.id)
    .maybeSingle();

  if (!session) {
    return <GroundConnexion userId={user.id} />;
  }

  const aeroport = session.aeroport.toUpperCase();

  const STATUTS_ACTIFS = ['depose', 'en_attente', 'accepte', 'en_cours', 'en_attente_cloture', 'automonitoring'];

  let plans: PlanVol[] = [];
  try {
    const { data, error } = await admin
      .from('plans_vol')
      .select(PLAN_VOL_SOL_SELECT)
      .or(`aeroport_depart.ilike.${aeroport},aeroport_arrivee.ilike.${aeroport}`)
      .in('statut', STATUTS_ACTIFS)
      .order('created_at', { ascending: false });

    if (error) console.error('[GC page] plans_vol error:', error.message);
    else plans = ((data ?? []) as unknown as PlanVolSolRow[]).map(mapPlanVolSol);
  } catch (e) {
    console.error('[GC page] plans_vol exception:', e);
  }

  let demandes: ServiceRequest[] = [];
  try {
    const { data, error } = await admin
      .from('ground_service_requests')
      .select('id, plan_vol_id, service_type, statut, accepted_by, direction, pilote_confirme, pax_count, aeroport, requested_at')
      .ilike('aeroport', aeroport)
      .in('statut', ['pending', 'accepted', 'in_progress'])
      .order('requested_at', { ascending: true });

    if (error) console.error('[GC page] demandes error:', JSON.stringify(error));
    else demandes = (data ?? []) as ServiceRequest[];
  } catch (e) {
    console.error('[GC page] demandes exception - table probablement manquante:', e);
  }

  // Exclure les demandes liées à des plans déjà clôturés (nettoyage défensif).
  // Les plans actifs sont déjà filtrés par statut dans la requête ci-dessus.
  const planIdsActifs = new Set(plans.map(p => p.id));
  demandes = demandes.filter(d => planIdsActifs.has(d.plan_vol_id));

  const { data: gates } = await admin
    .from('airport_gates')
    .select('id, gate_code, gate_type, max_aircraft_size, terminal, reserved_for, requires_separation, notes, display_order')
    .eq('aeroport', aeroport)
    .order('display_order', { ascending: true });

  const { data: profile } = await admin
    .from('profiles')
    .select('id, identifiant, role')
    .eq('id', user.id)
    .single();

  const [{ count: gcOnlineCount }, contribRes] = await Promise.all([
    admin.from('ground_sessions').select('id', { count: 'exact', head: true }).ilike('aeroport', aeroport),
    admin
      .from('ground_crew_service_contributions')
      .select('montant_percu, completed_at')
      .eq('user_id', user.id)
      .gt('montant_percu', 0)
      .gte('completed_at', session.started_at),
  ]);

  const sessionGains = (contribRes.data ?? []).reduce((s, c) => s + Math.round(Number(c.montant_percu) || 0), 0);
  const sessionCompletedCount = contribRes.data?.length ?? 0;

  return (
    <GroundDashboard
      userId={user.id}
      sessionId={session.id}
      aeroport={aeroport}
      sessionStartedAt={session.started_at}
      plansInitiaux={plans}
      demandesInitiales={demandes}
      gatesInitiales={(gates ?? []) as Gate[]}
      profile={profile as Profile | null}
      gcOnlineCount={gcOnlineCount ?? 1}
      sessionGains={sessionGains}
      sessionCompletedCount={sessionCompletedCount}
    />
  );
}
