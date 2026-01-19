import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { redirect, notFound } from 'next/navigation';
import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';
import ConfirmerClotureButton from './ConfirmerClotureButton';

const STATUT_LIB: Record<string, string> = {
  depose: 'Déposé',
  en_attente: 'En attente ATC',
  accepte: 'Accepté',
  refuse: 'Refusé',
  en_cours: 'En cours',
  automonitoring: 'Autosurveillance',
  en_attente_cloture: 'Clôture demandée',
  cloture: 'Clôturé',
};

export default async function AtcPlanPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const admin = createAdminClient();
  const { data: plan } = await admin
    .from('plans_vol')
    .select('id, numero_vol, aeroport_depart, aeroport_arrivee, type_vol, statut, instructions, intentions_vol, sid_depart, star_arrivee, current_holder_user_id')
    .eq('id', id)
    .single();

  if (!plan) notFound();

  const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).single();
  const isAdmin = profile?.role === 'admin';
  const isHolder = plan.current_holder_user_id === user.id;
  const showConfirmerCloture = plan.statut === 'en_attente_cloture' && (isHolder || isAdmin);

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-4">
        <Link href="/atc" className="text-slate-600 hover:text-slate-900">
          <ArrowLeft className="h-5 w-5" />
        </Link>
        <h1 className="text-2xl font-semibold text-slate-900">Plan de vol {plan.numero_vol}</h1>
      </div>
      <div className="card">
        <p className="text-slate-700">{plan.aeroport_depart} → {plan.aeroport_arrivee} · {plan.type_vol} · {STATUT_LIB[plan.statut] ?? plan.statut}</p>
        {plan.instructions && <p className="text-slate-600 mt-2">Instructions : {plan.instructions}</p>}
        {showConfirmerCloture && (
          <div className="mt-4 pt-4 border-t border-slate-200">
            <p className="text-slate-600 text-sm mb-2">Le pilote a demandé la clôture du vol.</p>
            <ConfirmerClotureButton planId={plan.id} />
          </div>
        )}
        {!showConfirmerCloture && plan.statut !== 'en_attente_cloture' && plan.statut !== 'cloture' && (
          <p className="text-slate-500 text-sm mt-4">Actions (accepter, refuser, transférer) à implémenter.</p>
        )}
      </div>
    </div>
  );
}
