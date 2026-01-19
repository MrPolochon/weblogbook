import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { redirect } from 'next/navigation';
import Link from 'next/link';
import AtcNavBar from '@/components/AtcNavBar';
import AtcModeBg from '@/components/AtcModeBg';
import AutoRefresh from '@/components/AutoRefresh';
import AtcAcceptTransfertSidebar from './AtcAcceptTransfertSidebar';

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
    .select('role, atc')
    .eq('id', user.id)
    .single();

  const isAdmin = profile?.role === 'admin';
  const canAccessAtc = isAdmin || profile?.role === 'atc' || Boolean(profile?.atc);
  if (!canAccessAtc) redirect('/logbook');

  const { data: session } = await supabase.from('atc_sessions').select('id, aeroport, position').eq('user_id', user.id).single();
  const enService = !!session;

  let plansAuto: { id: string; numero_vol: string; aeroport_depart: string; aeroport_arrivee: string }[] = [];
  let plansAAccepter: { id: string; numero_vol: string }[] = [];
  if (enService && session) {
    const admin = createAdminClient();
    const oneMinAgo = new Date(Date.now() - 60000).toISOString();
    await admin.from('plans_vol').update({ pending_transfer_aeroport: null, pending_transfer_position: null, pending_transfer_at: null }).lt('pending_transfer_at', oneMinAgo);

    const [{ data: dataAuto }, { data: dataAccept }] = await Promise.all([
      admin.from('plans_vol').select('id, numero_vol, aeroport_depart, aeroport_arrivee').eq('automonitoring', true).in('statut', ['accepte', 'en_cours']),
      admin.from('plans_vol').select('id, numero_vol').eq('pending_transfer_aeroport', session.aeroport).eq('pending_transfer_position', session.position),
    ]);
    plansAuto = dataAuto ?? [];
    plansAAccepter = dataAccept ?? [];
  }

  return (
    <div className="min-h-screen flex flex-col">
      <AutoRefresh intervalSeconds={8} />
      <AtcModeBg isAdmin={isAdmin} />
      <AtcNavBar isAdmin={isAdmin} enService={enService} />
      <div className="flex flex-1 w-full min-h-0">
        {enService && (
          <aside className="w-44 flex-shrink-0 border-r border-slate-300 bg-slate-100 py-3 px-2 flex flex-col">
            <p className="text-xs font-semibold uppercase tracking-wider text-slate-700 px-2 mb-1.5">Non contrôlés</p>
            {plansAuto.length === 0 ? (
              <span className="text-slate-600 text-sm px-2">Aucun</span>
            ) : (
              <ul className="space-y-0.5">
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
          </aside>
        )}
        <main className="flex-1 min-w-0 mx-auto w-full max-w-6xl px-4 py-6">{children}</main>
        {enService && <AtcAcceptTransfertSidebar plans={plansAAccepter} />}
      </div>
    </div>
  );
}
