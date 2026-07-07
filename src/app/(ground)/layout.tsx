import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { redirect } from 'next/navigation';
import GroundNavBar from '@/components/GroundNavBar';
import InactivityLogout from '@/components/InactivityLogout';

export const dynamic = 'force-dynamic';

export default async function GroundLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const admin = createAdminClient();
  const { data: profile } = await admin
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .single();

  const isAdmin = profile?.role === 'admin';
  const isGroundCrew = profile?.role === 'ground_crew';

  if (!isAdmin && !isGroundCrew) {
    redirect('/logbook');
  }

  // Récupérer la session ground active si elle existe
  const { data: groundSession } = await admin
    .from('ground_sessions')
    .select('id, aeroport, started_at')
    .eq('user_id', user.id)
    .maybeSingle();

  return (
    <div className="min-h-dvh flex flex-col bg-[#070b14]" style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}>
      <InactivityLogout />
      <GroundNavBar
        isAdmin={isAdmin}
        sessionInfo={groundSession ? { aeroport: groundSession.aeroport, started_at: groundSession.started_at } : null}
        userId={user.id}
      />
      <main className="flex-1 mx-auto w-full max-w-7xl px-3 sm:px-5 lg:px-6 py-4 sm:py-6 lg:py-8">
        {children}
      </main>
    </div>
  );
}
