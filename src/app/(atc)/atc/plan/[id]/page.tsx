import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { redirect, notFound } from 'next/navigation';
import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';
import ConfirmerClotureButton from './ConfirmerClotureButton';
import AccepterPlanButton from './AccepterPlanButton';
import RefuserPlanForm from './RefuserPlanForm';
import InstructionsForm from './InstructionsForm';
import TransfererForm from './TransfererForm';
import PrendrePlanButton from './PrendrePlanButton';

export const dynamic = 'force-dynamic';

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
    .select('id, numero_vol, aeroport_depart, aeroport_arrivee, type_vol, statut, instructions, intentions_vol, sid_depart, star_arrivee, route_ifr, note_atc, vol_commercial, nature_cargo, porte, temps_prev_min, refusal_reason, current_holder_user_id, automonitoring, pending_transfer_aeroport, pending_transfer_position')
    .eq('id', id)
    .single();

  if (!plan) notFound();

  const { data: atcSession } = await supabase.from('atc_sessions').select('aeroport, position').eq('user_id', user.id).single();
  if (plan.automonitoring && !atcSession) redirect('/atc');

  const { data: profile } = await supabase.from('profiles').select('role, atc').eq('id', user.id).single();
  const isAdmin = profile?.role === 'admin';
  const isHolder = plan.current_holder_user_id === user.id;
  const showConfirmerCloture = plan.statut === 'en_attente_cloture' && (isHolder || isAdmin);
  // Toujours afficher Accepter/Refuser quand le plan est en attente (l’API impose holder ou admin)
  const showAccepterRefuser = plan.statut === 'en_attente' || plan.statut === 'depose';
  // En autosurveillance : pas de formulaire d’instructions (lecture seule), pas de transfer classique
  const showInstructionsTransfer = (plan.statut === 'accepte' || plan.statut === 'en_cours') && (isHolder || isAdmin) && !plan.automonitoring && !plan.pending_transfer_aeroport;

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-4">
        <Link href="/atc" className="text-slate-700 hover:text-slate-900">
          <ArrowLeft className="h-5 w-5" />
        </Link>
        <h1 className="text-2xl font-semibold text-slate-900">Plan de vol {plan.numero_vol}</h1>
      </div>
      <div className="card">
        <p className="text-slate-900 font-medium">{plan.aeroport_depart} → {plan.aeroport_arrivee} · {plan.type_vol} · {STATUT_LIB[plan.statut] ?? plan.statut}</p>
        {(plan.porte || plan.temps_prev_min) && (
          <p className="text-slate-800 mt-2 text-sm">{plan.porte && <>Porte : {plan.porte}</>}{plan.porte && plan.temps_prev_min && ' · '}{plan.temps_prev_min != null && <>Temps prévu : {plan.temps_prev_min} min</>}</p>
        )}
        {plan.type_vol === 'VFR' && plan.intentions_vol && <p className="text-slate-800 mt-2"><span className="font-medium text-slate-900">Intentions de vol :</span><br /><span className="text-sm text-slate-800">{plan.intentions_vol}</span></p>}
        {plan.type_vol === 'IFR' && (plan.sid_depart || plan.star_arrivee) && (
          <p className="text-slate-800 mt-2 text-sm"><span className="font-medium text-slate-900">SID départ :</span> {plan.sid_depart || '—'} · <span className="font-medium text-slate-900">STAR arrivée :</span> {plan.star_arrivee || '—'}</p>
        )}
        {plan.type_vol === 'IFR' && plan.route_ifr && (
          <p className="text-slate-800 mt-2"><span className="font-medium text-slate-900">Route IFR :</span><br /><span className="text-sm text-slate-800 font-mono">{plan.route_ifr}</span></p>
        )}
        {plan.note_atc && (
          <p className="text-slate-800 mt-2"><span className="font-medium text-slate-900">Note à l&apos;attention de l&apos;ATC :</span><br /><span className="text-sm text-slate-800">{plan.note_atc}</span></p>
        )}
        {plan.vol_commercial && (
          <p className="text-slate-800 mt-2 text-sm"><span className="font-medium text-slate-900">Vol commercial</span>{plan.nature_cargo && <> · {plan.nature_cargo}</>}</p>
        )}
        {plan.refusal_reason && <p className="text-red-700 mt-2 text-sm"><span className="font-medium">Raison du refus :</span> {plan.refusal_reason}</p>}
        {plan.instructions && !showInstructionsTransfer && <p className="text-slate-800 mt-2">Instructions : {plan.instructions}{plan.automonitoring && <span className="text-slate-600 text-sm ml-1">(lecture seule)</span>}</p>}
        {plan.automonitoring && (
          <div className="mt-4 pt-4 border-t border-slate-200 flex flex-wrap items-center gap-3">
            <p className="text-slate-800 text-sm">En autosurveillance · les instructions ne sont pas modifiables.</p>
            <PrendrePlanButton planId={plan.id} aeroport={atcSession!.aeroport} position={atcSession!.position} />
            <Link href="/atc" className="text-sm font-medium text-slate-700 hover:text-slate-900">Sortir</Link>
          </div>
        )}
        {showConfirmerCloture && (
          <div className="mt-4 pt-4 border-t border-slate-200">
            <p className="text-slate-800 text-sm mb-2">Le pilote a demandé la clôture du vol.</p>
            <ConfirmerClotureButton planId={plan.id} />
          </div>
        )}
        {showAccepterRefuser && (
          <div className="mt-4 pt-4 border-t border-slate-200 space-y-4">
            <p className="text-slate-900 font-semibold">Accepter ou refuser le plan</p>
            <AccepterPlanButton planId={plan.id} />
            <div className="border-t border-slate-100 pt-3">
              <RefuserPlanForm planId={plan.id} />
            </div>
            <div className="border-t border-slate-100 pt-3">
              <p className="text-slate-800 text-sm mb-2">Si le plan vous a été attribué par erreur, transférez-le à la bonne position.</p>
              <TransfererForm planId={plan.id} aeroportSession={atcSession?.aeroport ?? ''} allowAutomonitoring={false} />
            </div>
          </div>
        )}
        {showInstructionsTransfer && (
          <div className="mt-4 pt-4 border-t border-slate-200 space-y-4">
            <InstructionsForm planId={plan.id} initial={plan.instructions || ''} />
            <div className="border-t border-slate-100 pt-3">
              <TransfererForm planId={plan.id} aeroportSession={atcSession?.aeroport ?? ''} />
            </div>
          </div>
        )}
        {plan.pending_transfer_aeroport && (isHolder || isAdmin) && (
          <div className="mt-4 pt-4 border-t border-amber-200 bg-amber-50/50 rounded-lg p-3">
            <p className="text-amber-900 font-medium text-sm">Transfert en attente vers {plan.pending_transfer_position} ({plan.pending_transfer_aeroport})</p>
            <p className="text-amber-800 text-xs mt-1">Si non accepté sous 1 min, le plan sera renvoyé à l&apos;ATC précédent, qui pourra le retransférer ou le mettre en autosurveillance.</p>
          </div>
        )}
        {!showConfirmerCloture && !showAccepterRefuser && !showInstructionsTransfer && !plan.automonitoring && !plan.pending_transfer_aeroport && plan.statut !== 'cloture' && plan.statut !== 'refuse' && (
          <p className="text-slate-700 text-sm mt-4">Ce plan est géré par un autre ATC.</p>
        )}
      </div>
    </div>
  );
}
