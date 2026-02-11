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
  const canAccessSiavi = isAdmin || profile?.role === 'siavi' || Boolean(profile?.siavi);
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
    <div className="min-h-screen flex flex-col">
      <AutoRefresh intervalSeconds={15} />
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
          <aside className="w-52 flex-shrink-0 border-r border-red-400/30 bg-gradient-to-b from-red-950/50 to-red-950/30 py-4 px-3 hidden md:flex flex-col backdrop-blur-sm">
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
        <main className="flex-1 min-w-0 mx-auto w-full max-w-6xl px-4 py-8">{children}</main>
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
