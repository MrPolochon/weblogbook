import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { redirect } from 'next/navigation';
import Link from 'next/link';
import AtcNavBar from '@/components/AtcNavBar';
import AtcModeBg from '@/components/AtcModeBg';

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

  const { data: session } = await supabase.from('atc_sessions').select('id').eq('user_id', user.id).single();
  const enService = !!session;

  let plansAuto: { id: string; numero_vol: string; aeroport_depart: string; aeroport_arrivee: string }[] = [];
  if (enService) {
    const admin = createAdminClient();
    const { data } = await admin
      .from('plans_vol')
      .select('id, numero_vol, aeroport_depart, aeroport_arrivee')
      .eq('automonitoring', true)
      .in('statut', ['accepte', 'en_cours']);
    plansAuto = data ?? [];
  }

  return (
    <div className="min-h-screen flex flex-col">
      <AtcModeBg isAdmin={isAdmin} />
      <AtcNavBar isAdmin={isAdmin} />
      <div className="flex flex-1 w-full min-h-0">
        {enService && (
          <aside className="w-44 flex-shrink-0 border-r border-slate-200 bg-slate-50/70 py-3 px-2 flex flex-col">
            <p className="text-[10px] uppercase tracking-wider text-slate-400 px-2 mb-1.5">Non contrôlés</p>
            {plansAuto.length === 0 ? (
              <span className="text-slate-400 text-xs px-2">Aucun</span>
            ) : (
              <ul className="space-y-0.5">
                {plansAuto.map((p) => (
                  <li key={p.id}>
                    <Link
                      href={`/atc/plan/${p.id}`}
                      className="block truncate text-xs text-slate-500 hover:text-slate-800 hover:bg-slate-200/60 rounded px-2 py-1"
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
    </div>
  );
}
