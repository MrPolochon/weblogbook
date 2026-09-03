import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { redirect } from 'next/navigation';
import Link from 'next/link';
import SiaviNavBar from './SiaviNavBar';
import SiaviModeBg from './SiaviModeBg';
import AutoRefresh from '@/components/AutoRefresh';
import SiaviTelephone from './SiaviTelephone';
import InactivityLogout from '@/components/InactivityLogout';
import { getPendingMedevacReport } from '@/lib/siavi/pending-report';
import PendingReportGuard from './PendingReportGuard';
import SiaviAcceptTransfertButton from './SiaviAcceptTransfertButton';
import SiaviMaintenanceNotice from './SiaviMaintenanceNotice';
import { SIAVI_SPACE_MAINTENANCE } from '@/lib/siavi/space-status';
export default async function SiaviLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const { data: profile } = await supabase
    .from('profiles')
    .select('role, siavi')
    .eq('id', user.id)
    .single();

  const isAdmin = profile?.role === 'admin';
  if (SIAVI_SPACE_MAINTENANCE && !isAdmin) {
    return (
      <div className="min-h-dvh flex flex-col">
        <SiaviModeBg isAdmin={false} />
        <SiaviMaintenanceNotice />
      </div>
    );
  }
  const canAccessSiavi = isAdmin || profile?.role === 'siavi' || Boolean(profile?.siavi);
  if (!canAccessSiavi) redirect('/logbook');

  const admin = createAdminClient();

  // Rapport MEDEVAC obligatoire : si l'agent a un vol clôturé sans rapport, le forcer
  const pendingPlanId = await getPendingMedevacReport(admin, user.id);

  // Récupérer la session AFIS
  const { data: session } = await supabase.from('afis_sessions').select('id, aeroport, est_afis, started_at').eq('user_id', user.id).single();
  const enService = !!session;
  const estAfis = session?.est_afis ?? false;

  // Récupérer le nombre de messages non lus
  const { count: messagesNonLusCount } = await admin.from('messages')
    .select('id', { count: 'exact', head: true })
    .eq('destinataire_id', user.id)
    .eq('lu', false);

  // Plans en autosurveillance et plans surveillés par cet AFIS
  let plansAuto: { id: string; numero_vol: string; aeroport_depart: string; aeroport_arrivee: string }[] = [];
  let plansSurveilles: { id: string; numero_vol: string; aeroport_depart: string; aeroport_arrivee: string }[] = [];
  let plansTransfertAfis: { id: string; numero_vol: string; aeroport_depart: string; aeroport_arrivee: string }[] = [];
  
  if (enService && estAfis && session) {
    const [{ data: dataAuto }, { data: dataSurveilles }, { data: dataTransfert }] = await Promise.all([
      admin.from('plans_vol').select('id, numero_vol, aeroport_depart, aeroport_arrivee')
        .eq('automonitoring', true)
        .is('current_afis_user_id', null)
        .in('statut', ['accepte', 'en_cours']),
      admin.from('plans_vol').select('id, numero_vol, aeroport_depart, aeroport_arrivee')
        .eq('current_afis_user_id', user.id)
        .in('statut', ['accepte', 'en_cours', 'en_attente_cloture']),
      admin.from('plans_vol').select('id, numero_vol, aeroport_depart, aeroport_arrivee')
        .eq('pending_transfer_aeroport', session.aeroport)
        .eq('pending_transfer_position', 'AFIS'),
    ]);
    plansAuto = dataAuto ?? [];
    plansSurveilles = dataSurveilles ?? [];
    plansTransfertAfis = dataTransfert ?? [];
  }

  return (
    <div className="min-h-dvh flex flex-col safe-x" style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}>
      {pendingPlanId && <PendingReportGuard pendingPlanId={pendingPlanId} />}
      <InactivityLogout />
      <AutoRefresh
        intervalSeconds={15}
        pauseRefreshWhenPathStartsWith={['/siavi/rapports']}
      />
      <SiaviModeBg isAdmin={isAdmin} />
      <SiaviNavBar 
        isAdmin={isAdmin} 
        enService={enService} 
        estAfis={estAfis}
        sessionInfo={enService && session ? { aeroport: session.aeroport, started_at: session.started_at } : null} 
        messagesNonLusCount={messagesNonLusCount || 0} 
      />
      {enService && estAfis && (
        <div className="md:hidden border-b border-red-800 bg-[#3a0f18] px-3 py-2 space-y-2">
          {plansTransfertAfis.length > 0 && (
            <div className="space-y-1.5">
              <p className="text-[10px] font-black uppercase tracking-wider text-amber-300">
                Transferts ATC · {plansTransfertAfis.length}
              </p>
              <div className="flex gap-2 overflow-x-auto">
                {plansTransfertAfis.map((p) => (
                  <div key={p.id} className="shrink-0 flex items-center gap-1.5 rounded-lg border border-amber-700 bg-amber-950 px-2 py-1">
                    <Link href={`/siavi/plan/${p.id}`} className="text-xs font-semibold text-amber-100">
                      {p.numero_vol}
                    </Link>
                    <SiaviAcceptTransfertButton planId={p.id} />
                  </div>
                ))}
              </div>
            </div>
          )}
          <p className="text-[10px] font-black uppercase tracking-wider text-red-300">
            Non surveillés · {plansAuto.length}
          </p>
          {plansAuto.length === 0 ? (
            <p className="text-xs text-red-200/70">Aucun vol</p>
          ) : (
            <div className="flex gap-2 overflow-x-auto">
              {plansAuto.map((p) => (
                <Link
                  key={p.id}
                  href={`/siavi/plan/${p.id}`}
                  className="shrink-0 rounded-lg border border-red-700 bg-red-950 px-2.5 py-1.5 text-xs font-semibold text-red-100"
                >
                  {p.numero_vol}
                </Link>
              ))}
            </div>
          )}
        </div>
      )}
      <div className="flex flex-1 w-full min-h-0">
        {enService && estAfis && (
          <aside className="w-52 flex-shrink-0 border-r border-red-400/30 bg-gradient-to-b from-red-950/50 to-red-950/30 py-4 px-3 hidden md:flex flex-col backdrop-blur-sm">
            {plansTransfertAfis.length > 0 && (
              <div className="mb-4">
                <p className="text-xs font-bold uppercase tracking-wider text-amber-400 px-2 mb-2 flex items-center gap-2">
                  <span className="w-2 h-2 rounded-full bg-amber-400 animate-pulse"></span>
                  Transferts ATC
                </p>
                <ul className="space-y-1">
                  {plansTransfertAfis.map((p) => (
                    <li key={p.id} className="flex items-center gap-2 rounded-lg px-2 py-1.5 bg-amber-500/10">
                      <Link
                        href={`/siavi/plan/${p.id}`}
                        className="flex-1 min-w-0 truncate text-sm font-medium text-amber-100 hover:text-white"
                        title={`${p.numero_vol} ${p.aeroport_depart} → ${p.aeroport_arrivee}`}
                      >
                        {p.numero_vol}
                      </Link>
                      <SiaviAcceptTransfertButton planId={p.id} />
                    </li>
                  ))}
                </ul>
              </div>
            )}
            <div className="mb-4">
              <p className="text-xs font-bold uppercase tracking-wider text-red-400 px-2 mb-2 flex items-center gap-2">
                <span className="w-2 h-2 rounded-full bg-red-500 animate-pulse"></span>
                Non surveillés
              </p>
              {plansAuto.length === 0 ? (
                <span className="text-red-300/60 text-sm px-2 italic">Aucun vol</span>
              ) : (
                <ul className="space-y-1">
                  {plansAuto.map((p) => (
                    <li key={p.id}>
                      <Link
                        href={`/siavi/plan/${p.id}`}
                        className="block truncate text-sm font-medium text-red-200 hover:text-white hover:bg-red-500/30 rounded-lg px-3 py-2 transition-all duration-200"
                        title={`${p.numero_vol} ${p.aeroport_depart} → ${p.aeroport_arrivee}`}
                      >
                        <span className="font-semibold">{p.numero_vol}</span>
                        <span className="text-red-300/80 ml-1">{p.aeroport_depart}→{p.aeroport_arrivee}</span>
                      </Link>
                    </li>
                  ))}
                </ul>
              )}
            </div>
            <div className="border-t border-red-500/20 pt-4">
              <p className="text-xs font-bold uppercase tracking-wider text-emerald-400 px-2 mb-2 flex items-center gap-2">
                <span className="w-2 h-2 rounded-full bg-emerald-500"></span>
                Mes surveillés
              </p>
              {plansSurveilles.length === 0 ? (
                <span className="text-red-300/60 text-sm px-2 italic">Aucun vol</span>
              ) : (
                <ul className="space-y-1">
                  {plansSurveilles.map((p) => (
                    <li key={p.id}>
                      <Link
                        href={`/siavi/plan/${p.id}`}
                        className="block truncate text-sm font-medium text-emerald-200 hover:text-white hover:bg-emerald-500/30 rounded-lg px-3 py-2 transition-all duration-200"
                        title={`${p.numero_vol} ${p.aeroport_depart} → ${p.aeroport_arrivee}`}
                      >
                        <span className="font-semibold">{p.numero_vol}</span>
                        <span className="text-emerald-300/80 ml-1">{p.aeroport_depart}→{p.aeroport_arrivee}</span>
                      </Link>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </aside>
        )}
        <main className="flex-1 min-w-0 mx-auto w-full max-w-7xl px-4 sm:px-5 lg:px-6 py-8">{children}</main>
      </div>
      {enService && session && (
        <SiaviTelephone 
          aeroport={session.aeroport} 
          estAfis={estAfis}
          userId={user.id} 
        />
      )}
    </div>
  );
}
