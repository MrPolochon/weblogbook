import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { redirect } from 'next/navigation';
import Link from 'next/link';
import { Bell } from 'lucide-react';
import NavBar from '@/components/NavBar';
import AdminModeBg from '@/components/AdminModeBg';
import AutoRefresh from '@/components/AutoRefresh';
import InactivityLogout from '@/components/InactivityLogout';
import { getPendingMedevacReport } from '@/lib/siavi/pending-report';

export default async function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const admin = createAdminClient();
  const uid = user.id;

  const { data: profile } = await supabase
    .from('profiles')
    .select('role, armee, ifsa, siavi')
    .eq('id', uid)
    .single();

  if (profile?.role === 'atc') redirect('/atc');

  // Rapport MEDEVAC obligatoire : rediriger vers le formulaire si un vol clôturé n'a pas de rapport
  const isSiavi = profile?.role === 'admin' || profile?.role === 'siavi' || Boolean(profile?.siavi);
  if (isSiavi) {
    const pendingPlanId = await getPendingMedevacReport(admin, uid);
    if (pendingPlanId) {
      redirect(`/siavi/rapports/nouveau?plan=${pendingPlanId}`);
    }
  }

  const isAdmin = profile?.role === 'admin';
  const isInstructeur = profile?.role === 'instructeur';
  const isArmee = Boolean(profile?.armee);
  const isIfsa = Boolean(profile?.ifsa);

  // All badge/count queries in a single parallel batch
  const [
    compagnieResult,
    userCountsResult,
    adminCountsResult,
    reparateurResult,
    ifsaResult,
  ] = await Promise.all([
    // 1) Compagnie / PDG / co-PDG
    Promise.all([
      admin.from('compagnies').select('id').eq('pdg_id', uid).limit(1),
      admin.from('compagnie_employes').select('id, role').eq('pilote_id', uid).limit(10),
    ]).catch(() => [{ data: null }, { data: null }] as const),

    // 2) User-specific counts (always needed)
    Promise.allSettled([
      supabase.from('vols').select('*', { count: 'exact', head: true }).eq('pilote_id', uid).eq('statut', 'en_attente_confirmation_pilote'),
      supabase.from('vols').select('*', { count: 'exact', head: true }).eq('copilote_id', uid).eq('statut', 'en_attente_confirmation_copilote'),
      admin.from('vols').select('*', { count: 'exact', head: true }).eq('instructeur_id', uid).eq('statut', 'en_attente_confirmation_instructeur'),
      supabase.from('plans_vol').select('*', { count: 'exact', head: true }).eq('pilote_id', uid).in('statut', ['depose', 'en_attente', 'accepte', 'en_cours', 'automonitoring', 'en_attente_cloture']),
      admin.from('messages').select('*', { count: 'exact', head: true }).eq('destinataire_id', uid).eq('lu', false),
      admin.from('compagnie_invitations').select('*', { count: 'exact', head: true }).eq('pilote_id', uid).eq('statut', 'en_attente'),
    ]),

    // 3) Admin-only counts (skip entirely for non-admins)
    isAdmin
      ? Promise.allSettled([
          admin.from('vols').select('*', { count: 'exact', head: true }).eq('statut', 'en_attente'),
          admin.from('plans_vol').select('*', { count: 'exact', head: true }).in('statut', ['depose', 'en_attente']).or('created_by_atc.is.null,created_by_atc.eq.false'),
          admin.from('password_reset_requests').select('*', { count: 'exact', head: true }).eq('status', 'pending'),
          admin.from('aeroschool_responses').select('*', { count: 'exact', head: true }).eq('status', 'submitted'),
        ])
      : Promise.resolve(null),

    // 4) Réparateur check
    Promise.all([
      admin.from('reparation_employes').select('id').eq('user_id', uid).limit(1),
      admin.from('entreprises_reparation').select('id').eq('pdg_id', uid).limit(1),
    ]).catch(() => [{ data: null }, { data: null }] as const),

    // 5) IFSA signalements (admin or ifsa only)
    (isIfsa || isAdmin)
      ? Promise.resolve(admin.from('ifsa_signalements').select('*', { count: 'exact', head: true }).eq('statut', 'nouveau')).then(r => r.count ?? 0).catch(() => 0)
      : Promise.resolve(0),
  ]);

  // Extract compagnie info
  const [pdgResult, employeResult] = compagnieResult as [{ data: { id: string }[] | null }, { data: { id: string; role?: string }[] | null }];
  const pdgData = pdgResult?.data;
  const employeData = employeResult?.data;
  const hasCoPdg = (employeData || []).some((e) => e.role === 'co_pdg');
  const isPdg = (pdgData?.length ?? 0) > 0 || hasCoPdg;
  const hasCompagnie = isPdg || (employeData?.length ?? 0) > 0;

  // Extract user counts
  const safeCount = (r: PromiseSettledResult<{ count?: number | null; error?: unknown }>): number => {
    if (r.status !== 'fulfilled') return 0;
    if ((r.value as { error?: unknown })?.error) return 0;
    return (r.value as { count?: number | null })?.count ?? 0;
  };

  const uc = userCountsResult as PromiseSettledResult<{ count?: number | null; error?: unknown }>[];
  const volsAConfirmerCount = safeCount(uc[0]) + safeCount(uc[1]) + safeCount(uc[2]);
  const plansNonCloturesCount = safeCount(uc[3]);
  const messagesNonLusCount = safeCount(uc[4]);
  const invitationsCount = safeCount(uc[5]);

  // Extract admin counts
  let pendingVolsCount = 0;
  let adminPlansEnAttenteCount = 0;
  let adminPasswordResetCount = 0;
  let adminAeroschoolCount = 0;
  if (adminCountsResult) {
    const ac = adminCountsResult as PromiseSettledResult<{ count?: number | null; error?: unknown }>[];
    pendingVolsCount = safeCount(ac[0]);
    adminPlansEnAttenteCount = safeCount(ac[1]);
    adminPasswordResetCount = safeCount(ac[2]);
    adminAeroschoolCount = safeCount(ac[3]);
  }

  // Extract réparateur
  const [repEmpResult, repPdgResult] = reparateurResult as [{ data: { id: string }[] | null }, { data: { id: string }[] | null }];
  const isReparateur = (repEmpResult?.data?.length ?? 0) > 0 || (repPdgResult?.data?.length ?? 0) > 0;

  const signalementsNouveauxCount = ifsaResult as number;

  // Alliance invitations (depends on compagnie data, so sequential)
  let allianceInvitationsCount = 0;
  if (hasCompagnie) {
    try {
      const [{ data: myPdgComps }, { data: myCoPdgComps }] = await Promise.all([
        admin.from('compagnies').select('id').eq('pdg_id', uid),
        admin.from('compagnie_employes').select('compagnie_id').eq('pilote_id', uid).eq('role', 'co_pdg'),
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

  return (
    <div className="min-h-dvh flex flex-col safe-x" style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}>
      <InactivityLogout />
      <AutoRefresh intervalSeconds={60} />
      <AdminModeBg />
      <NavBar isAdmin={isAdmin} isInstructeur={isInstructeur} isArmee={isArmee} isPdg={isPdg} hasCompagnie={hasCompagnie} isIfsa={isIfsa} isReparateur={isReparateur} pendingVolsCount={pendingVolsCount} adminPlansEnAttenteCount={adminPlansEnAttenteCount} adminPasswordResetCount={adminPasswordResetCount} adminAeroschoolCount={adminAeroschoolCount} volsAConfirmerCount={volsAConfirmerCount} messagesNonLusCount={messagesNonLusCount} invitationsCount={invitationsCount} signalementsNouveauxCount={signalementsNouveauxCount} allianceInvitationsCount={allianceInvitationsCount} />
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
      <main className="flex-1 mx-auto w-full max-w-7xl px-3 sm:px-5 lg:px-6 py-4 sm:py-6 lg:py-8">{children}</main>
    </div>
  );
}
