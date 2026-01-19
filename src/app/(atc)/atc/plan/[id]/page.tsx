import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { redirect, notFound } from 'next/navigation';
import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';

export default async function AtcPlanPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const admin = createAdminClient();
  const { data: plan } = await admin
    .from('plans_vol')
    .select('id, numero_vol, aeroport_depart, aeroport_arrivee, type_vol, statut, instructions, intentions_vol, sid_depart, star_arrivee')
    .eq('id', id)
    .single();

  if (!plan) notFound();

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-4">
        <Link href="/atc" className="text-slate-600 hover:text-slate-900">
          <ArrowLeft className="h-5 w-5" />
        </Link>
        <h1 className="text-2xl font-semibold text-slate-900">Plan de vol {plan.numero_vol}</h1>
      </div>
      <div className="card">
        <p className="text-slate-700">{plan.aeroport_depart} → {plan.aeroport_arrivee} · {plan.type_vol} · {plan.statut}</p>
        {plan.instructions && <p className="text-slate-600 mt-2">Instructions : {plan.instructions}</p>}
        <p className="text-slate-500 text-sm mt-4">Actions (accepter, refuser, transférer, clôturer) à implémenter.</p>
      </div>
    </div>
  );
}
