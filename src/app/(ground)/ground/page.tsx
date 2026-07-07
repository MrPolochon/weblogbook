import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { redirect } from 'next/navigation';
import GroundDashboard from './GroundDashboard';
import GroundConnexionForm from './GroundConnexionForm';

export const dynamic = 'force-dynamic';

export default async function GroundPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const admin = createAdminClient();

  // Session ground active ?
  const { data: groundSession } = await admin
    .from('ground_sessions')
    .select('id, aeroport, started_at')
    .eq('user_id', user.id)
    .maybeSingle();

  if (!groundSession) {
    return <GroundConnexionForm />;
  }

  // Profil du GC (pour afficher son pseudo dans les modals)
  const { data: gcProfile } = await admin
    .from('profiles')
    .select('identifiant')
    .eq('id', user.id)
    .single();

  // En service : charger toutes les données du dashboard
  const [
    { data: serviceRequests },
    { data: gates },
    { data: plansActifs },
    { data: myTeamMembership },
    { count: pendingInvitationsCount },
  ] = await Promise.all([
    admin.from('ground_service_requests')
      .select(`
        id, plan_vol_id, pilote_id, aeroport, service_type, statut,
        accepted_by, requested_at, accepted_at, completed_at, pax_count, notes, team_id,
        pilote:profiles!ground_service_requests_pilote_id_fkey(identifiant),
        plan_vol:plans_vol!ground_service_requests_plan_vol_id_fkey(numero_vol, callsign, immatriculation, aeroport_depart, aeroport_arrivee)
      `)
      .eq('aeroport', groundSession.aeroport)
      .in('statut', ['pending', 'accepted', 'in_progress'])
      .order('requested_at', { ascending: false }),

    admin.from('airport_gates')
      .select('*')
      .eq('aeroport', groundSession.aeroport)
      .order('display_order'),

    admin.from('plans_vol')
      .select(`
        id, numero_vol, callsign, immatriculation, type_avion, aeroport_depart, aeroport_arrivee, statut, porte,
        pilote:profiles!plans_vol_pilote_id_fkey(identifiant),
        gate_assignments(id, gate_id, assignment_type, status,
          gate:airport_gates!gate_assignments_gate_id_fkey(gate_code, terminal)
        )
      `)
      .eq('aeroport_depart', groundSession.aeroport)
      .in('statut', ['depose', 'en_attente', 'accepte', 'en_cours', 'en_attente_cloture'])
      .order('created_at', { ascending: false })
      .limit(50),

    // Équipe active du GC
    admin.from('ground_crew_team_members')
      .select('team_id')
      .eq('user_id', user.id)
      .is('left_at', null)
      .maybeSingle(),

    // Nombre d'invitations en attente
    admin.from('ground_crew_team_invitations')
      .select('*', { count: 'exact', head: true })
      .eq('to_user_id', user.id)
      .eq('status', 'pending')
      .gt('expires_at', new Date().toISOString()),
  ]);

  const invCount = pendingInvitationsCount ?? 0;

  return (
    <GroundDashboard
      aeroport={groundSession.aeroport}
      sessionId={groundSession.id}
      userId={user.id}
      gcIdentifiant={gcProfile?.identifiant ?? 'GC'}
      myTeamId={myTeamMembership?.team_id ?? null}
      pendingInvitationsCount={invCount}
      serviceRequests={(serviceRequests ?? []) as unknown as import('@/lib/types').GroundServiceRequest[]}
      gates={gates ?? []}
      plansActifs={(plansActifs ?? []) as unknown as Parameters<typeof GroundDashboard>[0]['plansActifs']}
    />
  );
}
