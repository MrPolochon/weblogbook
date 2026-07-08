import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { redirect } from 'next/navigation';
import GroundDashboard from './GroundDashboard';
import GroundConnexion from './GroundConnexion';
import type { PlanVol, ServiceRequest, Gate, Profile } from './GroundDashboard';

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

  console.log(`[GC page] aeroport avant query=${aeroport}`);

  // Test sans filtre pour vérifier que la table contient des données
  const { data: testPlans } = await admin
    .from('plans_vol')
    .select('id, callsign, aeroport_depart, aeroport_arrivee, statut')
    .limit(10);
  console.log('[GC DEBUG] plans sans filtre (10 premiers):',
    testPlans?.length ?? 0,
    testPlans?.map(p => `${p.aeroport_depart}→${p.aeroport_arrivee} [${p.statut}]`),
  );

  let plans: PlanVol[] = [];
  try {
    const { data, error } = await admin
      .from('plans_vol')
      .select('id, callsign, immatriculation, porte, statut, aeroport_depart, aeroport_arrivee, type_avion, pilote_id, created_at')
      .or(`aeroport_depart.eq.${aeroport},aeroport_arrivee.eq.${aeroport}`)
      .in('statut', ['depose', 'en_attente', 'accepte', 'en_cours', 'en_attente_cloture', 'automonitoring'])
      .order('created_at', { ascending: false });

    if (error) {
      console.error('[GC page] plans_vol error:', JSON.stringify(error));
      if (error.message?.includes('porte')) {
        const { data: data2 } = await admin
          .from('plans_vol')
          .select('id, callsign, immatriculation, statut, aeroport_depart, aeroport_arrivee, type_avion, pilote_id, created_at')
          .or(`aeroport_depart.eq.${aeroport},aeroport_arrivee.eq.${aeroport}`)
          .in('statut', ['depose', 'en_attente', 'accepte', 'en_cours', 'en_attente_cloture', 'automonitoring'])
          .order('created_at', { ascending: false });
        plans = (data2 ?? []) as PlanVol[];
      }
    } else {
      plans = (data ?? []) as PlanVol[];
    }
    console.log(`[GC page] aeroport=${aeroport} plans trouvés:`, plans.length, plans.map(p => ({ id: p.id, callsign: p.callsign, statut: p.statut, dep: p.aeroport_depart })));
  } catch (e) {
    console.error('[GC page] plans_vol exception:', e);
  }

  let demandes: ServiceRequest[] = [];
  try {
    const { data, error } = await admin
      .from('ground_service_requests')
      .select('id, plan_vol_id, service_type, statut, accepted_by, direction, pilote_confirme, pax_count, aeroport, requested_at')
      .eq('aeroport', aeroport)
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
    />
  );
}
