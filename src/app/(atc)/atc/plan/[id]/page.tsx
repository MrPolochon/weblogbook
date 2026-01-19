import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { redirect, notFound } from 'next/navigation';
import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';
import ConfirmerClotureButton from './ConfirmerClotureButton';
import AccepterPlanButton from './AccepterPlanButton';
import RefuserPlanForm from './RefuserPlanForm';

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
    .select('id, numero_vol, aeroport_depart, aeroport_arrivee, type_vol, statut, instructions, intentions_vol, sid_depart, star_arrivee, porte, temps_prev_min, refusal_reason, current_holder_user_id')
    .eq('id', id)
    .single();

  if (!plan) notFound();

  const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).single();
  const isAdmin = profile?.role === 'admin';
  const isHolder = plan.current_holder_user_id === user.id;
  const showConfirmerCloture = plan.statut === 'en_attente_cloture' && (isHolder || isAdmin);
  const showAccepterRefuser = plan.statut === 'en_attente' && (isHolder || isAdmin);

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
        {(plan.porte || plan.temps_prev_min) && (
          <p className="text-slate-600 mt-2 text-sm">{plan.porte && <>Porte : {plan.porte}</>}{plan.porte && plan.temps_prev_min && ' · '}{plan.temps_prev_min != null && <>Temps prévu : {plan.temps_prev_min} min</>}</p>
        )}
        {plan.type_vol === 'VFR' && plan.intentions_vol && <p className="text-slate-600 mt-2"><span className="font-medium text-slate-700">Intentions de vol :</span><br /><span className="text-sm">{plan.intentions_vol}</span></p>}
        {plan.type_vol === 'IFR' && (plan.sid_depart || plan.star_arrivee) && (
          <p className="text-slate-600 mt-2 text-sm"><span className="font-medium text-slate-700">SID départ :</span> {plan.sid_depart || '—'} · <span className="font-medium text-slate-700">STAR arrivée :</span> {plan.star_arrivee || '—'}</p>
        )}
        {plan.refusal_reason && <p className="text-red-600 mt-2 text-sm"><span className="font-medium">Raison du refus :</span> {plan.refusal_reason}</p>}
        {plan.instructions && <p className="text-slate-600 mt-2">Instructions : {plan.instructions}</p>}
        {showConfirmerCloture && (
          <div className="mt-4 pt-4 border-t border-slate-200">
            <p className="text-slate-600 text-sm mb-2">Le pilote a demandé la clôture du vol.</p>
            <ConfirmerClotureButton planId={plan.id} />
          </div>
        )}
        {showAccepterRefuser && (
          <div className="mt-4 pt-4 border-t border-slate-200 space-y-4">
            <p className="text-slate-700 font-medium">Accepter ou refuser le plan</p>
            <AccepterPlanButton planId={plan.id} />
            <div className="border-t border-slate-100 pt-3">
              <RefuserPlanForm planId={plan.id} />
            </div>
            <p className="text-slate-500 text-sm">Transférer vers une autre position : à venir.</p>
          </div>
        )}
        {!showConfirmerCloture && !showAccepterRefuser && plan.statut !== 'cloture' && plan.statut !== 'refuse' && (
          <p className="text-slate-500 text-sm mt-4">Ce plan n&apos;est plus en attente. Transférer : à venir.</p>
        )}
      </div>
    </div>
  );
}
