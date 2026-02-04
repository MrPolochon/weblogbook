import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { redirect } from 'next/navigation';
import Link from 'next/link';
import AtcNavBar from '@/components/AtcNavBar';
import AtcModeBg from '@/components/AtcModeBg';
import AutoRefresh from '@/components/AutoRefresh';
import AtcAcceptTransfertSidebar from './AtcAcceptTransfertSidebar';
import { AtcThemeProvider } from '@/contexts/AtcThemeContext';
import AtcTelephone from '@/components/AtcTelephone';

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

  const admin = createAdminClient();
  
  // Récupérer le nombre de messages non lus
  const { count: messagesNonLusCount } = await admin.from('messages')
    .select('id', { count: 'exact', head: true })
    .eq('destinataire_id', user.id)
    .eq('lu', false);

  let plansAuto: { id: string; numero_vol: string; aeroport_depart: string; aeroport_arrivee: string }[] = [];
  let plansOrphelins: { id: string; numero_vol: string; aeroport_depart: string; aeroport_arrivee: string }[] = [];
  let plansAAccepter: { id: string; numero_vol: string }[] = [];
  let plansAccepter: { id: string; numero_vol: string; aeroport_depart: string; aeroport_arrivee: string }[] = [];
  let plansCloture: { id: string; numero_vol: string; aeroport_depart: string; aeroport_arrivee: string }[] = [];
  if (enService && session) {
    // Nettoyer les transferts expirés (plus d'1 minute)
    const oneMinAgo = new Date(Date.now() - 60000).toISOString();
    await admin.from('plans_vol').update({ pending_transfer_aeroport: null, pending_transfer_position: null, pending_transfer_at: null }).lt('pending_transfer_at', oneMinAgo);

    // Note: On ne réassigne PAS les plans orphelins aux autres ATC.
    // Si un plan n'a pas d'ATC assigné, le pilote peut le clôturer seul.
    // Chaque ATC ne voit que les plans qu'IL contrôle (current_holder_user_id === user.id).
    
    const [{ data: dataAuto }, { data: dataAccept }, { data: dataPlansAccepter }, { data: dataCloture }, { data: dataOrphelinsRaw }, { data: sessionsActive }] = await Promise.all([
      admin.from('plans_vol').select('id, numero_vol, aeroport_depart, aeroport_arrivee').eq('automonitoring', true).in('statut', ['accepte', 'en_cours']),
      admin.from('plans_vol').select('id, numero_vol').eq('pending_transfer_aeroport', session.aeroport).eq('pending_transfer_position', session.position),
      admin.from('plans_vol').select('id, numero_vol, aeroport_depart, aeroport_arrivee').eq('current_holder_user_id', user.id).in('statut', ['depose', 'en_attente']),
      admin.from('plans_vol').select('id, numero_vol, aeroport_depart, aeroport_arrivee').eq('current_holder_user_id', user.id).eq('statut', 'en_attente_cloture'),
      admin.from('plans_vol').select('id, numero_vol, aeroport_depart, aeroport_arrivee, current_holder_user_id').in('statut', ['depose', 'en_attente']),
      admin.from('atc_sessions').select('user_id'),
    ]);
    plansAuto = dataAuto ?? [];
    plansAAccepter = dataAccept ?? [];
    plansAccepter = dataPlansAccepter ?? [];
    plansCloture = dataCloture ?? [];
    const sessionsActives = new Set((sessionsActive ?? []).map((s) => s.user_id));
    plansOrphelins = (dataOrphelinsRaw ?? []).filter((p) => !p.current_holder_user_id || !sessionsActives.has(p.current_holder_user_id));
  }

  return (
    <AtcThemeProvider>
      <div className="min-h-screen flex flex-col">
        <AutoRefresh intervalSeconds={8} />
        <AtcModeBg isAdmin={isAdmin} />
        <AtcNavBar isAdmin={isAdmin} enService={enService} gradeNom={gradeNom} sessionInfo={enService && session ? { aeroport: session.aeroport, position: session.position, started_at: session.started_at } : null} messagesNonLusCount={messagesNonLusCount || 0} />
        <div className="flex flex-1 w-full min-h-0">
          {enService && (
            <aside className="atc-sidebar w-44 flex-shrink-0 border-r border-slate-300 bg-slate-100 py-3 px-2 hidden md:flex flex-col">
              <p className="text-xs font-semibold uppercase tracking-wider text-slate-700 px-2 mb-1.5">Non contrôlés</p>
              {plansAuto.length === 0 ? (
                <span className="text-slate-600 text-sm px-2">Aucun</span>
              ) : (
                <ul className="space-y-0.5 mb-3">
                  {plansAuto.map((p) => (
                    <li key={p.id}>
                      <Link
                        href={`/atc/plan/${p.id}`}
                        className="block truncate text-sm font-medium text-slate-700 hover:text-slate-900 hover:bg-slate-200 rounded px-2 py-1"
                        title={`${p.numero_vol} ${p.aeroport_depart} → ${p.aeroport_arrivee}`}
                      >
                        {p.numero_vol} {p.aeroport_depart}→{p.aeroport_arrivee}
                      </Link>
                    </li>
                  ))}
                </ul>
              )}
              <p className="text-xs font-semibold uppercase tracking-wider text-slate-700 px-2 mb-1.5">Plans orphelins</p>
              {plansOrphelins.length === 0 ? (
                <span className="text-slate-600 text-sm px-2">Aucun</span>
              ) : (
                <ul className="space-y-0.5">
                  {plansOrphelins.map((p) => (
                    <li key={p.id}>
                      <Link
                        href={`/atc/plan/${p.id}`}
                        className="block truncate text-sm font-medium text-slate-700 hover:text-slate-900 hover:bg-slate-200 rounded px-2 py-1"
                        title={`${p.numero_vol} ${p.aeroport_depart} → ${p.aeroport_arrivee}`}
                      >
                        {p.numero_vol} {p.aeroport_depart}→{p.aeroport_arrivee}
                      </Link>
                    </li>
                  ))}
                </ul>
              )}
            </aside>
          )}
          <main className="flex-1 min-w-0 mx-auto w-full max-w-6xl px-4 py-6">{children}</main>
          {enService && <AtcAcceptTransfertSidebar plansTransfert={plansAAccepter} plansAccepter={plansAccepter} plansCloture={plansCloture} />}
        </div>
        {enService && session && (
          <AtcTelephone 
            aeroport={session.aeroport} 
            position={session.position} 
            userId={user.id} 
          />
        )}
      </div>
    </AtcThemeProvider>
  );
}
