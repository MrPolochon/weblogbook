import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { redirect } from 'next/navigation';
import Link from 'next/link';
import SiaviNavBar from './SiaviNavBar';
import SiaviModeBg from './SiaviModeBg';
import AutoRefresh from '@/components/AutoRefresh';
import SiaviTelephone from './SiaviTelephone';

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
  const canAccessSiavi = isAdmin || Boolean(profile?.siavi);
  if (!canAccessSiavi) redirect('/logbook');

  const admin = createAdminClient();

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
  
  if (enService && estAfis) {
    const [{ data: dataAuto }, { data: dataSurveilles }] = await Promise.all([
      admin.from('plans_vol').select('id, numero_vol, aeroport_depart, aeroport_arrivee')
        .eq('automonitoring', true)
        .is('current_afis_user_id', null)
        .in('statut', ['accepte', 'en_cours']),
      admin.from('plans_vol').select('id, numero_vol, aeroport_depart, aeroport_arrivee')
        .eq('current_afis_user_id', user.id)
        .in('statut', ['accepte', 'en_cours', 'en_attente_cloture']),
    ]);
    plansAuto = dataAuto ?? [];
    plansSurveilles = dataSurveilles ?? [];
  }

  return (
    <div className="min-h-screen flex flex-col bg-red-950/5">
      <AutoRefresh intervalSeconds={8} />
      <SiaviModeBg isAdmin={isAdmin} />
      <SiaviNavBar 
        isAdmin={isAdmin} 
        enService={enService} 
        estAfis={estAfis}
        sessionInfo={enService && session ? { aeroport: session.aeroport, started_at: session.started_at } : null} 
        messagesNonLusCount={messagesNonLusCount || 0} 
      />
      <div className="flex flex-1 w-full min-h-0">
        {enService && estAfis && (
          <aside className="w-44 flex-shrink-0 border-r border-red-300/50 bg-red-50/50 py-3 px-2 hidden md:flex flex-col">
            <p className="text-xs font-semibold uppercase tracking-wider text-red-700 px-2 mb-1.5">Non surveillés</p>
            {plansAuto.length === 0 ? (
              <span className="text-red-600/70 text-sm px-2">Aucun</span>
            ) : (
              <ul className="space-y-0.5 mb-3">
                {plansAuto.map((p) => (
                  <li key={p.id}>
                    <Link
                      href={`/siavi/plan/${p.id}`}
                      className="block truncate text-sm font-medium text-red-700 hover:text-red-900 hover:bg-red-100 rounded px-2 py-1"
                      title={`${p.numero_vol} ${p.aeroport_depart} → ${p.aeroport_arrivee}`}
                    >
                      {p.numero_vol} {p.aeroport_depart}→{p.aeroport_arrivee}
                    </Link>
                  </li>
                ))}
              </ul>
            )}
            <p className="text-xs font-semibold uppercase tracking-wider text-red-700 px-2 mb-1.5 mt-3">Mes surveillés</p>
            {plansSurveilles.length === 0 ? (
              <span className="text-red-600/70 text-sm px-2">Aucun</span>
            ) : (
              <ul className="space-y-0.5">
                {plansSurveilles.map((p) => (
                  <li key={p.id}>
                    <Link
                      href={`/siavi/plan/${p.id}`}
                      className="block truncate text-sm font-medium text-red-700 hover:text-red-900 hover:bg-red-100 rounded px-2 py-1"
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
