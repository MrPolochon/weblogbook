import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { redirect } from 'next/navigation';
import GroundNavBar from '@/components/GroundNavBar';
import InactivityLogout from '@/components/InactivityLogout';

export const dynamic = 'force-dynamic';

function canAccessGround(profile: Record<string, unknown>): boolean {
  if (profile.role === 'admin') return true;
  if (profile.role === 'ground_crew') return true; // rétrocompatibilité avant migration
  if (profile.ground_crew === true) return true;   // nouveau système booléen
  return false;
}

export default async function GroundLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const admin = createAdminClient();

  // Query résiliente : ground_crew peut ne pas exister en BDD si migration non encore appliquée
  let profile: Record<string, unknown> | null = null;
  try {
    const { data, error } = await admin
      .from('profiles')
      .select('role, ground_crew')
      .eq('id', user.id)
      .single();
    if (error) throw error;
    profile = data;
  } catch {
    // Si ground_crew n'existe pas encore, retry sans cette colonne
    const { data } = await admin
      .from('profiles')
      .select('role')
      .eq('id', user.id)
      .single();
    profile = data;
  }

  if (!profile || !canAccessGround(profile)) {
    redirect('/logbook');
  }

  const isAdmin = profile.role === 'admin';

  // Récupérer la session ground active si elle existe
  const { data: groundSession } = await admin
    .from('ground_sessions')
    .select('id, aeroport, started_at')
    .eq('user_id', user.id)
    .maybeSingle();

  // Compter les messages non lus
  let messagesNonLusCount = 0;
  try {
    const { count, error } = await admin
      .from('messages')
      .select('id', { count: 'exact', head: true })
      .eq('destinataire_id', user.id)
      .eq('lu', false);
    if (!error) messagesNonLusCount = count ?? 0;
  } catch {
    // Graceful fallback si la table est absente
  }

  return (
    <div className="min-h-dvh flex flex-col bg-[#070b14]" style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}>
      <InactivityLogout />
      <GroundNavBar
        isAdmin={isAdmin}
        sessionInfo={groundSession ? { aeroport: groundSession.aeroport, started_at: groundSession.started_at } : null}
        userId={user.id}
        messagesNonLusCount={messagesNonLusCount}
      />
      <main className="flex-1 mx-auto w-full max-w-7xl px-3 sm:px-5 lg:px-6 py-4 sm:py-6 lg:py-8">
        {children}
      </main>
    </div>
  );
}
