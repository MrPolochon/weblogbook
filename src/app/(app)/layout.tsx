import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { redirect } from 'next/navigation';
import Link from 'next/link';
import { Bell } from 'lucide-react';
import NavBar from '@/components/NavBar';
import AdminModeBg from '@/components/AdminModeBg';
import AutoRefresh from '@/components/AutoRefresh';

export default async function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const { data: profile } = await supabase
    .from('profiles')
    .select('role, armee, ifsa')
    .eq('id', user.id)
    .single();

  if (profile?.role === 'atc') redirect('/atc');

  const isAdmin = profile?.role === 'admin';
  const isArmee = Boolean(profile?.armee);
  const isIfsa = Boolean(profile?.ifsa);

  // Vérifier si PDG ou employé d'une compagnie
  let isPdg = false;
  let hasCompagnie = false;
  try {
    const admin = createAdminClient();
    const [{ data: pdgData }, { data: employeData }] = await Promise.all([
      admin.from('compagnies').select('id').eq('pdg_id', user.id).limit(1),
      admin.from('compagnie_employes').select('id').eq('pilote_id', user.id).limit(1),
    ]);
    isPdg = (pdgData?.length ?? 0) > 0;
    hasCompagnie = isPdg || (employeData?.length ?? 0) > 0;
  } catch {
    // Tables may not exist yet
  }

  let pendingVolsCount = 0;
  let volsAConfirmerCount = 0;
  let plansNonCloturesCount = 0;
  let messagesNonLusCount = 0;
  let invitationsCount = 0;
  let signalementsNouveauxCount = 0;
  if (isAdmin) {
    try {
      const admin = createAdminClient();
      const { count } = await admin
        .from('vols')
        .select('*', { count: 'exact', head: true })
        .eq('statut', 'en_attente');
      pendingVolsCount = count ?? 0;
    } catch {
      pendingVolsCount = 0;
    }
  }
  try {
    const admin = createAdminClient();
    const [
      { count: c1 },
      { count: c2 },
      { count: c3 },
      { count: pnc },
      { count: msgCount },
    ] = await Promise.all([
      supabase.from('vols').select('*', { count: 'exact', head: true }).eq('pilote_id', user.id).eq('statut', 'en_attente_confirmation_pilote'),
      supabase.from('vols').select('*', { count: 'exact', head: true }).eq('copilote_id', user.id).eq('statut', 'en_attente_confirmation_copilote'),
      admin.from('vols').select('*', { count: 'exact', head: true }).eq('instructeur_id', user.id).eq('statut', 'en_attente_confirmation_instructeur'),
      supabase.from('plans_vol').select('*', { count: 'exact', head: true }).eq('pilote_id', user.id).in('statut', ['depose', 'en_attente', 'accepte', 'en_cours', 'automonitoring', 'en_attente_cloture']),
      admin.from('messages').select('*', { count: 'exact', head: true }).eq('destinataire_id', user.id).eq('lu', false),
    ]);
    volsAConfirmerCount = (c1 ?? 0) + (c2 ?? 0) + (c3 ?? 0);
    plansNonCloturesCount = pnc ?? 0;
    messagesNonLusCount = msgCount ?? 0;
    
    // Compter les invitations séparément (table peut ne pas exister)
    try {
      const { count: invCount } = await admin.from('compagnie_invitations')
        .select('*', { count: 'exact', head: true })
        .eq('pilote_id', user.id)
        .eq('statut', 'en_attente');
      invitationsCount = invCount ?? 0;
    } catch {
      invitationsCount = 0;
    }
  } catch {
    volsAConfirmerCount = 0;
    plansNonCloturesCount = 0;
    messagesNonLusCount = 0;
    invitationsCount = 0;
  }
  
  // Compter les signalements nouveaux pour IFSA (table peut ne pas exister)
  if (isIfsa || isAdmin) {
    try {
      const admin = createAdminClient();
      const { count, error } = await admin.from('ifsa_signalements')
        .select('*', { count: 'exact', head: true })
        .eq('statut', 'nouveau');
      if (!error) {
        signalementsNouveauxCount = count ?? 0;
      }
    } catch {
      signalementsNouveauxCount = 0;
    }
  }

  return (
    <div className="min-h-screen flex flex-col">
      <AutoRefresh intervalSeconds={12} />
      <AdminModeBg />
      <NavBar isAdmin={isAdmin} isArmee={isArmee} isPdg={isPdg} hasCompagnie={hasCompagnie} isIfsa={isIfsa} pendingVolsCount={pendingVolsCount} volsAConfirmerCount={volsAConfirmerCount} messagesNonLusCount={messagesNonLusCount} invitationsCount={invitationsCount} signalementsNouveauxCount={signalementsNouveauxCount} />
      {plansNonCloturesCount > 0 && (
        <div className="border-b border-amber-500/30 bg-gradient-to-r from-amber-500/10 via-amber-500/15 to-amber-500/10 backdrop-blur-sm">
          <div className="mx-auto max-w-6xl px-4 py-3 flex items-center justify-center gap-3 flex-wrap">
            <div className="flex items-center gap-2 px-3 py-1 rounded-full bg-amber-500/20 border border-amber-500/30">
              <Bell className="h-4 w-4 flex-shrink-0 text-amber-400 animate-pulse-soft" />
              <span className="text-amber-100 text-sm font-medium">
                {plansNonCloturesCount} plan{plansNonCloturesCount > 1 ? 's' : ''} de vol non clôturé{plansNonCloturesCount > 1 ? 's' : ''}
              </span>
            </div>
            <Link href="/logbook/plans-vol" className="text-sm font-semibold text-amber-200 hover:text-amber-100 transition-colors px-3 py-1 rounded-full hover:bg-amber-500/20">
              Clôturer maintenant →
            </Link>
          </div>
        </div>
      )}
      <main className="flex-1 mx-auto w-full max-w-6xl px-4 py-8">{children}</main>
    </div>
  );
}
