import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { redirect } from 'next/navigation';
import Link from 'next/link';
import { Bell } from 'lucide-react';
import NavBar from '@/components/NavBar';
import AdminModeBg from '@/components/AdminModeBg';
import AutoRefresh from '@/components/AutoRefresh';
import InactivityLogout from '@/components/InactivityLogout';
import AprilFoolGate from '@/components/AprilFoolGate';

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

  // Vérifier si PDG, co-PDG ou employé d'une compagnie
  let isPdg = false;
  let hasCompagnie = false;
  try {
    const admin = createAdminClient();
    const [{ data: pdgData }, { data: employeData }] = await Promise.all([
      admin.from('compagnies').select('id').eq('pdg_id', user.id).limit(1),
      admin.from('compagnie_employes').select('id, role').eq('pilote_id', user.id).limit(10),
    ]);
    const hasCoPdg = (employeData || []).some((e: { role?: string }) => e.role === 'co_pdg');
    isPdg = (pdgData?.length ?? 0) > 0 || hasCoPdg;
    hasCompagnie = isPdg || (employeData?.length ?? 0) > 0;
  } catch {
    // Tables may not exist yet
  }

  let pendingVolsCount = 0;
  let adminPlansEnAttenteCount = 0; // plans depose/en_attente uniquement (badge = actions à faire)
  let adminPasswordResetCount = 0;
  let adminAeroschoolCount = 0;
  let volsAConfirmerCount = 0;
  let plansNonCloturesCount = 0;
  let messagesNonLusCount = 0;
  let invitationsCount = 0;
  let signalementsNouveauxCount = 0;
  if (isAdmin) {
    try {
      const admin = createAdminClient();
      const results = await Promise.allSettled([
        admin.from('vols').select('*', { count: 'exact', head: true }).eq('statut', 'en_attente'),
        admin.from('plans_vol').select('*', { count: 'exact', head: true }).in('statut', ['depose', 'en_attente']).or('created_by_atc.is.null,created_by_atc.eq.false'),
        admin.from('password_reset_requests').select('*', { count: 'exact', head: true }).eq('status', 'pending'),
        admin.from('aeroschool_responses').select('*', { count: 'exact', head: true }).eq('status', 'submitted'),
      ]);
      pendingVolsCount = (results[0].status === 'fulfilled' && !(results[0].value as { error?: unknown })?.error) ? ((results[0].value as { count?: number })?.count ?? 0) : 0;
      adminPlansEnAttenteCount = (results[1].status === 'fulfilled' && !(results[1].value as { error?: unknown })?.error) ? ((results[1].value as { count?: number })?.count ?? 0) : 0;
      adminPasswordResetCount = (results[2].status === 'fulfilled' && !(results[2].value as { error?: unknown })?.error) ? ((results[2].value as { count?: number })?.count ?? 0) : 0;
      adminAeroschoolCount = (results[3].status === 'fulfilled' && !(results[3].value as { error?: unknown })?.error) ? ((results[3].value as { count?: number })?.count ?? 0) : 0;
    } catch {
      pendingVolsCount = 0;
      adminPlansEnAttenteCount = 0;
      adminPasswordResetCount = 0;
      adminAeroschoolCount = 0;
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
  
  // Vérifier si l'utilisateur est employé d'une entreprise de réparation
  let isReparateur = false;
  try {
    const admin = createAdminClient();
    const { data: repEmp } = await admin.from('reparation_employes').select('id').eq('user_id', user.id).limit(1);
    const { data: repPdg } = await admin.from('entreprises_reparation').select('id').eq('pdg_id', user.id).limit(1);
    isReparateur = (repEmp?.length ?? 0) > 0 || (repPdg?.length ?? 0) > 0;
  } catch {
    isReparateur = false;
  }

  // Compter les invitations alliance en attente
  let allianceInvitationsCount = 0;
  if (hasCompagnie) {
    try {
      const admin = createAdminClient();
      const [{ data: myPdgComps }, { data: myCoPdgComps }] = await Promise.all([
        admin.from('compagnies').select('id').eq('pdg_id', user.id),
        admin.from('compagnie_employes').select('compagnie_id').eq('pilote_id', user.id).eq('role', 'co_pdg'),
      ]);
      const compIds = [
        ...(myPdgComps || []).map((c: { id: string }) => c.id),
        ...(myCoPdgComps || []).map((c: { compagnie_id: string }) => c.compagnie_id),
      ];
      if (compIds.length > 0) {
        const { count } = await admin.from('alliance_invitations')
          .select('*', { count: 'exact', head: true })
          .eq('statut', 'en_attente')
          .in('compagnie_id', compIds);
        allianceInvitationsCount = count ?? 0;
      }
    } catch {
      allianceInvitationsCount = 0;
    }
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
    <AprilFoolGate>
      <div className="min-h-screen flex flex-col">
        <InactivityLogout />
        <AutoRefresh intervalSeconds={30} />
        <AdminModeBg />
        <NavBar isAdmin={isAdmin} isArmee={isArmee} isPdg={isPdg} hasCompagnie={hasCompagnie} isIfsa={isIfsa} isReparateur={isReparateur} pendingVolsCount={pendingVolsCount} adminPlansEnAttenteCount={adminPlansEnAttenteCount} adminPasswordResetCount={adminPasswordResetCount} adminAeroschoolCount={adminAeroschoolCount} volsAConfirmerCount={volsAConfirmerCount} messagesNonLusCount={messagesNonLusCount} invitationsCount={invitationsCount} signalementsNouveauxCount={signalementsNouveauxCount} allianceInvitationsCount={allianceInvitationsCount} />
        {plansNonCloturesCount > 0 && (
          <div className="border-b border-amber-400/35 bg-gradient-to-r from-amber-500/10 via-orange-400/15 to-amber-500/10 backdrop-blur-md">
            <div className="mx-auto max-w-7xl px-4 py-3 flex items-center justify-center gap-3 flex-wrap">
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
        <main className="flex-1 mx-auto w-full max-w-7xl px-4 sm:px-5 lg:px-6 py-8">{children}</main>
      </div>
    </AprilFoolGate>
  );
}
