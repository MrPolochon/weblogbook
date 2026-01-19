import { createClient } from '@/lib/supabase/server';
import { redirect } from 'next/navigation';
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

  const canAccessPilote = profile?.role !== 'atc';

  return (
    <div className="min-h-screen flex flex-col">
      <AtcModeBg isAdmin={isAdmin} />
      <AtcNavBar isAdmin={isAdmin} canAccessPilote={canAccessPilote} />
      <main className="flex-1 mx-auto w-full max-w-6xl px-4 py-6">{children}</main>
    </div>
  );
}
