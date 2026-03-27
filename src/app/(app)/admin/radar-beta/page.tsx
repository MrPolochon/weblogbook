import { createClient } from '@/lib/supabase/server';
import { redirect } from 'next/navigation';
import RadarBetaClient from './RadarBetaClient';

export default async function RadarBetaAdminPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const { data: profile } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .single();

  if (profile?.role !== 'admin') redirect('/logbook');

  return (
    <div className="space-y-6 max-w-3xl">
      <h1 className="text-2xl font-semibold text-slate-100">Radar BETA — Gestion des accès</h1>
      <RadarBetaClient />
    </div>
  );
}
