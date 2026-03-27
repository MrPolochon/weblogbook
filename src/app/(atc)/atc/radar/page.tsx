import { createClient } from '@/lib/supabase/server';
import { redirect } from 'next/navigation';
import RadarClient from './RadarClient';

export default async function RadarPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const { data: profile } = await supabase
    .from('profiles')
    .select('role, radar_beta, identifiant')
    .eq('id', user.id)
    .single();

  const isAdmin = profile?.role === 'admin';
  const hasAccess = isAdmin || profile?.radar_beta;

  if (!hasAccess) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] gap-4">
        <div className="text-6xl opacity-30">📡</div>
        <h1 className="text-xl font-bold text-slate-200">Radar ATC — Version BETA</h1>
        <p className="text-slate-400 text-center max-w-md">
          L&apos;accès au radar est réservé aux testeurs beta.
          Demandez l&apos;accès depuis votre page &quot;Mon compte&quot;.
        </p>
      </div>
    );
  }

  return <RadarClient userId={user.id} />;
}
