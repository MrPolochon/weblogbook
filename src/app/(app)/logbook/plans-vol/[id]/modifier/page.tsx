import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { redirect, notFound } from 'next/navigation';
import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';
import ModifierPlanVolForm from './ModifierPlanVolForm';

export default async function ModifierPlanVolPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login');
  const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).single();
  if (profile?.role === 'atc') redirect('/logbook');

  const admin = createAdminClient();
  const { data: plan } = await admin
    .from('plans_vol')
    .select('id, pilote_id, statut, aeroport_depart, aeroport_arrivee, numero_vol, porte, temps_prev_min, type_vol, intentions_vol, sid_depart, star_arrivee, refusal_reason')
    .eq('id', id)
    .single();

  if (!plan || plan.pilote_id !== user.id || plan.statut !== 'refuse') notFound();

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-4">
        <Link href="/logbook/plans-vol" className="text-slate-400 hover:text-slate-200">
          <ArrowLeft className="h-5 w-5" />
        </Link>
        <h1 className="text-2xl font-semibold text-slate-100">Modifier et renvoyer le plan de vol</h1>
      </div>
      <p className="text-slate-400 text-sm">Corrigez les éléments indiqués par l&apos;ATC puis renvoyez le plan.</p>
      <ModifierPlanVolForm plan={plan} />
    </div>
  );
}
