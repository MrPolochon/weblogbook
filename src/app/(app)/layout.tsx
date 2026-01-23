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
    .select('role, armee')
    .eq('id', user.id)
    .single();

  if (profile?.role === 'atc') redirect('/atc');

  const isAdmin = profile?.role === 'admin';
  const isArmee = Boolean(profile?.armee);

  let hasCompagniePDG = false;
  let hasCompagnie = false;
  try {
    const [{ count: countPDG }, { count: countEmp }] = await Promise.all([
      supabase.from('compagnies').select('*', { count: 'exact', head: true }).eq('pdg_user_id', user.id),
      supabase.from('compagnies_employes').select('*', { count: 'exact', head: true }).eq('user_id', user.id),
    ]);
    hasCompagniePDG = (countPDG ?? 0) > 0;
    hasCompagnie = (countEmp ?? 0) > 0 || hasCompagniePDG;
  } catch {
    hasCompagniePDG = false;
    hasCompagnie = false;
  }

  let pendingVolsCount = 0;
  let volsAConfirmerCount = 0;
  let plansNonCloturesCount = 0;
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
    ] = await Promise.all([
      supabase.from('vols').select('*', { count: 'exact', head: true }).eq('pilote_id', user.id).eq('statut', 'en_attente_confirmation_pilote'),
      supabase.from('vols').select('*', { count: 'exact', head: true }).eq('copilote_id', user.id).eq('statut', 'en_attente_confirmation_copilote'),
      admin.from('vols').select('*', { count: 'exact', head: true }).eq('instructeur_id', user.id).eq('statut', 'en_attente_confirmation_instructeur'),
      supabase.from('plans_vol').select('*', { count: 'exact', head: true }).eq('pilote_id', user.id).in('statut', ['depose', 'en_attente', 'accepte', 'en_cours', 'automonitoring', 'en_attente_cloture']),
    ]);
    volsAConfirmerCount = (c1 ?? 0) + (c2 ?? 0) + (c3 ?? 0);
    plansNonCloturesCount = pnc ?? 0;
  } catch {
    volsAConfirmerCount = 0;
    plansNonCloturesCount = 0;
  }

  return (
    <div className="min-h-screen flex flex-col">
      <AutoRefresh intervalSeconds={12} />
      <AdminModeBg />
      <NavBar isAdmin={isAdmin} isArmee={isArmee} pendingVolsCount={pendingVolsCount} volsAConfirmerCount={volsAConfirmerCount} hasCompagniePDG={hasCompagniePDG} hasCompagnie={hasCompagnie} />
      {plansNonCloturesCount > 0 && (
        <div className="border-b border-amber-500/40 bg-amber-500/15">
          <div className="mx-auto max-w-6xl px-4 py-2 flex items-center justify-center gap-2 flex-wrap">
            <Bell className="h-4 w-4 flex-shrink-0 text-amber-400" />
            <span className="text-amber-100 text-sm">
              {plansNonCloturesCount} plan{plansNonCloturesCount > 1 ? 's' : ''} de vol non clôturé{plansNonCloturesCount > 1 ? 's' : ''}.
            </span>
            <Link href="/logbook/plans-vol" className="text-sm font-semibold text-amber-200 hover:text-amber-100 underline">
              Clôturer mes plans de vol
            </Link>
          </div>
        </div>
      )}
      <main className="flex-1 mx-auto w-full max-w-6xl px-4 py-6">{children}</main>
    </div>
  );
}
