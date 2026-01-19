import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { redirect } from 'next/navigation';
import NavBar from '@/components/NavBar';
import AdminModeBg from '@/components/AdminModeBg';

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
    .select('role')
    .eq('id', user.id)
    .single();

  const isAdmin = profile?.role === 'admin';

  let pendingVolsCount = 0;
  let volsAConfirmerCount = 0;
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
    const [{ count: c1 }, { count: c2 }, { count: c3 }] = await Promise.all([
      supabase.from('vols').select('*', { count: 'exact', head: true }).eq('pilote_id', user.id).eq('statut', 'en_attente_confirmation_pilote'),
      supabase.from('vols').select('*', { count: 'exact', head: true }).eq('copilote_id', user.id).eq('statut', 'en_attente_confirmation_copilote'),
      admin.from('vols').select('*', { count: 'exact', head: true }).eq('instructeur_id', user.id).eq('statut', 'en_attente_confirmation_instructeur'),
    ]);
    volsAConfirmerCount = (c1 ?? 0) + (c2 ?? 0) + (c3 ?? 0);
  } catch {
    volsAConfirmerCount = 0;
  }

  return (
    <div className="min-h-screen flex flex-col">
      <AdminModeBg />
      <NavBar isAdmin={isAdmin} pendingVolsCount={pendingVolsCount} volsAConfirmerCount={volsAConfirmerCount} />
      <main className="flex-1 mx-auto w-full max-w-6xl px-4 py-6">{children}</main>
    </div>
  );
}
