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

  const aeroport = session.aeroport;

  const { data: plans, error: plansError } = await admin
    .from('plans_vol')
    .select('id, callsign, immatriculation, porte, statut, aeroport_depart, aeroport_arrivee, type_avion, pilote_id, created_at')
    .or(`aeroport_depart.eq.${aeroport},aeroport_arrivee.eq.${aeroport}`)
    .in('statut', ['depose', 'en_attente', 'accepte', 'en_cours', 'en_attente_cloture', 'automonitoring'])
    .order('created_at', { ascending: false });

  if (plansError) console.error('[GC page] plans_vol error:', plansError);

  const { data: demandes } = await admin
    .from('ground_service_requests')
    .select('id, plan_vol_id, service_type, statut, accepted_by, direction, pilote_confirme, pax_count, score_minijeu, aeroport, requested_at')
    .eq('aeroport', aeroport)
    .in('statut', ['pending', 'accepted', 'in_progress'])
    .order('requested_at', { ascending: true });

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
      plansInitiaux={(plans ?? []) as PlanVol[]}
      demandesInitiales={(demandes ?? []) as ServiceRequest[]}
      gatesInitiales={(gates ?? []) as Gate[]}
      profile={profile as Profile | null}
    />
  );
}
