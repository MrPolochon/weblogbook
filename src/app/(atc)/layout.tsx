import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { redirect } from 'next/navigation';
import AtcNavBar from '@/components/AtcNavBar';
import AtcModeBg from '@/components/AtcModeBg';
import AutoRefresh from '@/components/AutoRefresh';
import AtcAcceptTransfertSidebar from './AtcAcceptTransfertSidebar';
import { AtcThemeProvider } from '@/contexts/AtcThemeContext';
import AtcAtisTicker from '@/components/AtcAtisTicker';
import InactivityLogout from '@/components/InactivityLogout';
import AtcSessionRealtimeGuard from '@/components/AtcSessionRealtimeGuard';
import AtcPlansRealtimeRefresh from '@/components/AtcPlansRealtimeRefresh';
import AtcMain from '@/components/AtcMain';

export const dynamic = 'force-dynamic';

export default async function AtcLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const { data: profile } = await supabase
    .from('profiles')
    .select('role, atc, atc_grade_id')
    .eq('id', user.id)
    .single();

  const isAdmin = profile?.role === 'admin';
  const canAccessAtc = isAdmin || profile?.role === 'atc' || Boolean(profile?.atc);
  if (!canAccessAtc) redirect('/logbook');

  let gradeNom: string | null = null;
  if (profile?.atc_grade_id) {
    const { data: g } = await supabase.from('atc_grades').select('nom').eq('id', profile.atc_grade_id).single();
    gradeNom = g?.nom ?? null;
  }

  const { data: session } = await supabase.from('atc_sessions').select('id, aeroport, position, started_at').eq('user_id', user.id).single();
  const enService = !!session;

  let messagesNonLusCount = 0;
  try {
    const admin = createAdminClient();
    const { count, error } = await admin.from('messages')
      .select('id', { count: 'exact', head: true })
      .eq('destinataire_id', user.id)
      .eq('lu', false);
    if (!error) messagesNonLusCount = count ?? 0;
  } catch {
    // Env admin manquant ou table messages absente
  }

  let plansAAccepter: { id: string; numero_vol: string }[] = [];
  let plansAccepter: { id: string; numero_vol: string; aeroport_depart: string; aeroport_arrivee: string }[] = [];
  let plansCloture: { id: string; numero_vol: string; aeroport_depart: string; aeroport_arrivee: string }[] = [];
  let plansOutbound: { id: string; numero_vol: string; pending_transfer_aeroport: string | null; pending_transfer_position: string | null }[] = [];
  let reseauAtc: { aeroport: string; position: string; identifiant: string }[] = [];
  let reseauAfis: { aeroport: string; est_afis: boolean; identifiant: string }[] = [];
  if (enService && session) {
    try {
      const admin = createAdminClient();

      // Note: les plans en autosurveillance et orphelins sont désormais affichés
      // sous le tableau de strips dans la page ATC (composant AtcNonControlesPanel),
      // donc pas besoin de les charger ici.
      const [{ data: dataAccept }, { data: dataPlansAccepter }, { data: dataCloture }, { data: dataOutbound }, { data: dataSessions }, { data: dataAfis }] = await Promise.all([
        admin.from('plans_vol').select('id, numero_vol').eq('pending_transfer_aeroport', session.aeroport).eq('pending_transfer_position', session.position),
        admin.from('plans_vol').select('id, numero_vol, aeroport_depart, aeroport_arrivee').eq('current_holder_user_id', user.id).in('statut', ['depose', 'en_attente']),
        admin.from('plans_vol').select('id, numero_vol, aeroport_depart, aeroport_arrivee').eq('current_holder_user_id', user.id).eq('statut', 'en_attente_cloture'),
        admin.from('plans_vol').select('id, numero_vol, pending_transfer_aeroport, pending_transfer_position').eq('current_holder_user_id', user.id).not('pending_transfer_aeroport', 'is', null),
        admin.from('atc_sessions').select('aeroport, position, profiles!atc_sessions_user_id_fkey(identifiant)').order('aeroport').order('position'),
        admin.from('afis_sessions').select('aeroport, est_afis, profiles!afis_sessions_user_id_fkey(identifiant)').order('aeroport'),
      ]);
      plansAAccepter = dataAccept ?? [];
      plansAccepter = dataPlansAccepter ?? [];
      plansCloture = dataCloture ?? [];
      plansOutbound = dataOutbound ?? [];
      reseauAtc = (dataSessions ?? []).map((s) => {
        const profileData = s.profiles;
        const profile = profileData ? (Array.isArray(profileData) ? profileData[0] : profileData) : null;
        return {
          aeroport: s.aeroport,
          position: s.position,
          identifiant: (profile as { identifiant?: string } | null)?.identifiant || '—',
        };
      });
      reseauAfis = (dataAfis ?? []).map((s) => {
        const profileData = s.profiles;
        const profile = profileData ? (Array.isArray(profileData) ? profileData[0] : profileData) : null;
        return {
          aeroport: s.aeroport,
          est_afis: Boolean(s.est_afis),
          identifiant: (profile as { identifiant?: string } | null)?.identifiant || '—',
        };
      });
    } catch {
      // createAdminClient ou tables manquantes
    }
  }

  return (
    <AtcThemeProvider>
      <div className="h-dvh flex flex-col overflow-hidden safe-x" style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}>
        <AtcSessionRealtimeGuard userId={user.id} enService={enService} />
        <AtcPlansRealtimeRefresh
          userId={user.id}
          enService={enService}
          aeroport={session?.aeroport ?? null}
          position={session?.position ?? null}
        />
        <InactivityLogout />
        <AutoRefresh intervalSeconds={60} />
        <AtcModeBg isAdmin={isAdmin} />
        <AtcNavBar isAdmin={isAdmin} enService={enService} gradeNom={gradeNom} sessionInfo={enService && session ? { aeroport: session.aeroport, position: session.position, started_at: session.started_at } : null} messagesNonLusCount={messagesNonLusCount || 0} userId={user.id} />
        <AtcAtisTicker />
        <div className="flex flex-1 w-full min-h-0">
          <AtcMain>{children}</AtcMain>
          {enService && (
            <AtcAcceptTransfertSidebar
              plansTransfert={plansAAccepter}
              plansAccepter={plansAccepter}
              plansCloture={plansCloture}
              plansOutbound={plansOutbound}
              reseauAtc={reseauAtc}
              reseauAfis={reseauAfis}
            />
          )}
        </div>
      </div>
    </AtcThemeProvider>
  );
}
