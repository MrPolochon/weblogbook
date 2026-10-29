import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { redirect, notFound } from 'next/navigation';
import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';
import ModifierPlanVolForm from './ModifierPlanVolForm';
import styles from '../../PilotOperations.module.css';

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
    .select('id, pilote_id, statut, aeroport_depart, aeroport_arrivee, numero_vol, porte, temps_prev_min, type_vol, intentions_vol, niveau_croisiere, sid_depart, star_arrivee, refusal_reason, heure_depart_estimee')
    .eq('id', id)
    .single();

  if (!plan || plan.pilote_id !== user.id || plan.statut !== 'refuse') notFound();

  return (
    <div className={`${styles.operations} mx-auto w-full max-w-5xl space-y-6`}>
      <header className="flex items-start gap-4 rounded-xl border border-slate-700/70 bg-slate-900/80 p-5">
        <Link href="/logbook/plans-vol" aria-label="Retour à mes plans de vol" className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-lg border border-slate-700 text-slate-400 hover:bg-slate-800 hover:text-slate-200">
          <ArrowLeft aria-hidden className="h-5 w-5" />
        </Link>
        <h1 className="text-2xl font-semibold text-slate-100">Modifier et renvoyer le plan de vol</h1>
      </header>
      <p className="text-slate-400 text-sm">Corrigez les éléments indiqués par l&apos;ATC puis renvoyez le plan.</p>
      <ModifierPlanVolForm plan={plan} />
    </div>
  );
}
