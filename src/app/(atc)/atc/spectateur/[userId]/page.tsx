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

  // Récupérer les transferts entrants vers la position de l'ATC cible
  const { data: transfertsEntrants } = await admin
    .from('plans_vol')
    .select('id, numero_vol, aeroport_depart, aeroport_arrivee')
    .eq('pending_transfer_aeroport', targetSession.aeroport)
    .eq('pending_transfer_position', targetSession.position);


  return (
    <SpectatorView
      targetUserId={targetUserId}
      targetIdentifiant={targetProfile?.identifiant || '—'}
      targetSession={{
        aeroport: targetSession.aeroport,
        position: targetSession.position,
        started_at: targetSession.started_at
      }}
      transfertsEntrants={transfertsEntrants || []}
    />
  );
}
