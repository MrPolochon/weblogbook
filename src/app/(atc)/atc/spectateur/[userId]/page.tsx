import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { notFound, redirect } from 'next/navigation';
import SpectatorView from './SpectatorView';

interface Props {
  params: Promise<{ userId: string }>;
}

export default async function SpectatorPage({ params }: Props) {
  const { userId: targetUserId } = await params;
  
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  // Vérifier que l'utilisateur courant est admin (seuls les admins peuvent observer)
  const { data: currentProfile } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .single();

  if (currentProfile?.role !== 'admin') redirect('/atc');

  // Vérifier que l'ATC cible est bien en service
  const admin = createAdminClient();
  const { data: targetSession } = await admin
    .from('atc_sessions')
    .select('id, aeroport, position, started_at, user_id')
    .eq('user_id', targetUserId)
    .single();

  if (!targetSession) {
    notFound();
  }

  // Récupérer les infos du contrôleur observé
  const { data: targetProfile } = await admin
    .from('profiles')
    .select('identifiant')
    .eq('id', targetUserId)
    .single();

  // Récupérer les plans de vol sous contrôle de l'ATC cible
  const { data: plansChezLui } = await admin
    .from('plans_vol')
    .select('*')
    .eq('current_holder_user_id', targetUserId)
    .is('pending_transfer_aeroport', null)
    .in('statut', ['en_cours', 'accepte', 'en_attente_cloture', 'depose', 'en_attente'])
    .order('created_at', { ascending: false });


  // Enrichir les plans avec pilote, compagnie, avion
  const enrichedPlans = await Promise.all((plansChezLui || []).map(async (plan) => {
    let pilote = null;
    let compagnie = null;
    let avion = null;

    if (plan.pilote_id) {
      const { data } = await admin.from('profiles').select('identifiant').eq('id', plan.pilote_id).single();
      pilote = data;
    }
    if (plan.compagnie_id) {
      const { data } = await admin.from('compagnies').select('nom').eq('id', plan.compagnie_id).single();
      compagnie = data;
    }
    if (plan.compagnie_avion_id) {
      const { data } = await admin.from('compagnie_avions').select('immatriculation, nom_bapteme').eq('id', plan.compagnie_avion_id).single();
      avion = data;
    }

    return { ...plan, pilote, compagnie, avion };
  }));

  return (
    <SpectatorView
      targetUserId={targetUserId}
      targetIdentifiant={targetProfile?.identifiant || '—'}
      targetSession={{
        aeroport: targetSession.aeroport,
        position: targetSession.position,
        started_at: targetSession.started_at
      }}
      initialPlans={enrichedPlans}
    />
  );
}
