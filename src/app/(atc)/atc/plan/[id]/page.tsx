import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { redirect, notFound } from 'next/navigation';
import Link from 'next/link';
import { ArrowLeft, Plane, Clock, MapPin, FileText, AlertCircle, CheckCircle2, XCircle, ArrowRight, Radio, Navigation } from 'lucide-react';
import ConfirmerClotureButton from './ConfirmerClotureButton';
import AccepterPlanButton from './AccepterPlanButton';
import RefuserPlanForm from './RefuserPlanForm';
import InstructionsForm from './InstructionsForm';
import TransfererForm from './TransfererForm';
import PrendrePlanButton from './PrendrePlanButton';

export const dynamic = 'force-dynamic';

const STATUT_CONFIG: Record<string, { label: string; color: string; bgColor: string; icon: React.ReactNode }> = {
  depose: { label: 'Déposé', color: 'text-slate-300', bgColor: 'bg-slate-500/20', icon: <FileText className="h-4 w-4" /> },
  en_attente: { label: 'En attente ATC', color: 'text-amber-300', bgColor: 'bg-amber-500/20', icon: <Clock className="h-4 w-4" /> },
  accepte: { label: 'Accepté', color: 'text-emerald-300', bgColor: 'bg-emerald-500/20', icon: <CheckCircle2 className="h-4 w-4" /> },
  refuse: { label: 'Refusé', color: 'text-red-300', bgColor: 'bg-red-500/20', icon: <XCircle className="h-4 w-4" /> },
  en_cours: { label: 'En vol', color: 'text-sky-300', bgColor: 'bg-sky-500/20', icon: <Plane className="h-4 w-4" /> },
  automonitoring: { label: 'Autosurveillance', color: 'text-purple-300', bgColor: 'bg-purple-500/20', icon: <Radio className="h-4 w-4" /> },
  en_attente_cloture: { label: 'Clôture demandée', color: 'text-orange-300', bgColor: 'bg-orange-500/20', icon: <AlertCircle className="h-4 w-4" /> },
  cloture: { label: 'Clôturé', color: 'text-slate-400', bgColor: 'bg-slate-600/20', icon: <CheckCircle2 className="h-4 w-4" /> },
};

export default async function AtcPlanPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const admin = createAdminClient();
  const { data: plan } = await admin
    .from('plans_vol')
    .select('id, numero_vol, aeroport_depart, aeroport_arrivee, type_vol, statut, instructions, intentions_vol, sid_depart, star_arrivee, route_ifr, note_atc, porte, temps_prev_min, refusal_reason, current_holder_user_id, automonitoring, pending_transfer_aeroport, pending_transfer_position, created_at')
    .eq('id', id)
    .single();

  if (!plan) notFound();

  const { data: atcSession } = await supabase.from('atc_sessions').select('aeroport, position').eq('user_id', user.id).single();
  if (plan.automonitoring && !atcSession) redirect('/atc');

  const { data: profile } = await supabase.from('profiles').select('role, atc').eq('id', user.id).single();
  const isAdmin = profile?.role === 'admin';
  const isHolder = plan.current_holder_user_id === user.id;
  const showConfirmerCloture = plan.statut === 'en_attente_cloture' && (isHolder || isAdmin);
  const showAccepterRefuser = plan.statut === 'en_attente' || plan.statut === 'depose';
  const showInstructionsTransfer = (plan.statut === 'accepte' || plan.statut === 'en_cours') && (isHolder || isAdmin) && !plan.automonitoring && !plan.pending_transfer_aeroport;

  const statusConfig = STATUT_CONFIG[plan.statut] || { label: plan.statut, color: 'text-slate-300', bgColor: 'bg-slate-500/20', icon: <FileText className="h-4 w-4" /> };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center gap-4">
        <Link href="/atc" className="p-2 rounded-lg bg-slate-800 text-slate-400 hover:text-slate-200 hover:bg-slate-700 transition-colors">
          <ArrowLeft className="h-5 w-5" />
        </Link>
        <div className="flex-1">
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-bold text-slate-100 font-mono">{plan.numero_vol}</h1>
            <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-sm font-medium ${statusConfig.bgColor} ${statusConfig.color}`}>
              {statusConfig.icon}
              {statusConfig.label}
            </span>
          </div>
        </div>
      </div>

      {/* Info vol principale */}
      <div className="card">
        <div className="grid gap-6 md:grid-cols-2">
          {/* Route */}
          <div>
            <h3 className="text-sm font-medium text-slate-400 uppercase tracking-wide mb-3">Route</h3>
            <div className="flex items-center gap-4">
              <div className="text-center">
                <p className="text-3xl font-bold text-sky-400 font-mono">{plan.aeroport_depart}</p>
                <p className="text-xs text-slate-500 mt-1">Départ</p>
              </div>
              <div className="flex-1 flex items-center justify-center">
                <div className="w-full h-px bg-gradient-to-r from-sky-400 via-slate-600 to-emerald-400 relative">
                  <Plane className="h-4 w-4 text-slate-300 absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 bg-slate-900 px-1" />
                </div>
              </div>
              <div className="text-center">
                <p className="text-3xl font-bold text-emerald-400 font-mono">{plan.aeroport_arrivee}</p>
                <p className="text-xs text-slate-500 mt-1">Arrivée</p>
              </div>
            </div>
          </div>

          {/* Détails */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <p className="text-xs text-slate-500 uppercase tracking-wide">Type de vol</p>
              <p className="text-lg font-semibold text-slate-200">{plan.type_vol}</p>
            </div>
            {plan.temps_prev_min && (
              <div>
                <p className="text-xs text-slate-500 uppercase tracking-wide">Temps prévu</p>
                <p className="text-lg font-semibold text-slate-200 flex items-center gap-1">
                  <Clock className="h-4 w-4 text-slate-400" />
                  {plan.temps_prev_min} min
                </p>
              </div>
            )}
            {plan.porte && (
              <div>
                <p className="text-xs text-slate-500 uppercase tracking-wide">Porte</p>
                <p className="text-lg font-semibold text-slate-200">{plan.porte}</p>
              </div>
            )}
          </div>
        </div>

        {/* Infos IFR/VFR */}
        {plan.type_vol === 'VFR' && plan.intentions_vol && (
          <div className="mt-6 pt-6 border-t border-slate-700">
            <h3 className="text-sm font-medium text-slate-400 uppercase tracking-wide mb-2 flex items-center gap-2">
              <Navigation className="h-4 w-4" />
              Intentions de vol
            </h3>
            <p className="text-slate-300 bg-slate-800/50 rounded-lg p-3 text-sm">{plan.intentions_vol}</p>
          </div>
        )}

        {plan.type_vol === 'IFR' && (
          <div className="mt-6 pt-6 border-t border-slate-700 space-y-4">
            <div className="grid gap-4 sm:grid-cols-2">
              {plan.sid_depart && (
                <div>
                  <p className="text-xs text-slate-500 uppercase tracking-wide">SID Départ</p>
                  <p className="text-lg font-mono text-sky-300">{plan.sid_depart}</p>
                </div>
              )}
              {plan.star_arrivee && (
                <div>
                  <p className="text-xs text-slate-500 uppercase tracking-wide">STAR Arrivée</p>
                  <p className="text-lg font-mono text-emerald-300">{plan.star_arrivee}</p>
                </div>
              )}
            </div>
            {plan.route_ifr && (
              <div>
                <p className="text-xs text-slate-500 uppercase tracking-wide mb-1">Route IFR</p>
                <p className="text-slate-300 bg-slate-800/50 rounded-lg p-3 text-sm font-mono">{plan.route_ifr}</p>
              </div>
            )}
          </div>
        )}

        {/* Note ATC */}
        {plan.note_atc && (
          <div className="mt-6 pt-6 border-t border-slate-700">
            <h3 className="text-sm font-medium text-amber-400 uppercase tracking-wide mb-2 flex items-center gap-2">
              <AlertCircle className="h-4 w-4" />
              Note d&apos;attention du pilote
            </h3>
            <p className="text-amber-200 bg-amber-500/10 border border-amber-500/30 rounded-lg p-3 text-sm">{plan.note_atc}</p>
          </div>
        )}

        {/* Raison refus */}
        {plan.refusal_reason && (
          <div className="mt-6 pt-6 border-t border-slate-700">
            <h3 className="text-sm font-medium text-red-400 uppercase tracking-wide mb-2 flex items-center gap-2">
              <XCircle className="h-4 w-4" />
              Raison du refus
            </h3>
            <p className="text-red-300 bg-red-500/10 border border-red-500/30 rounded-lg p-3 text-sm">{plan.refusal_reason}</p>
          </div>
        )}

        {/* Instructions en lecture seule */}
        {plan.instructions && !showInstructionsTransfer && (
          <div className="mt-6 pt-6 border-t border-slate-700">
            <h3 className="text-sm font-medium text-slate-400 uppercase tracking-wide mb-2">Instructions ATC</h3>
            <p className="text-slate-300 bg-slate-800/50 rounded-lg p-3 text-sm">
              {plan.instructions}
              {plan.automonitoring && <span className="text-slate-500 ml-2">(lecture seule)</span>}
            </p>
          </div>
        )}
      </div>

      {/* Autosurveillance */}
      {plan.automonitoring && (
        <div className="card border-purple-500/30 bg-purple-500/5">
          <div className="flex items-center gap-3 mb-3">
            <Radio className="h-5 w-5 text-purple-400" />
            <h3 className="font-semibold text-slate-100">Vol en autosurveillance</h3>
          </div>
          <p className="text-slate-400 text-sm mb-4">Ce vol n&apos;est actuellement pas contrôlé. Vous pouvez le prendre en charge.</p>
          <div className="flex items-center gap-3">
            <PrendrePlanButton planId={plan.id} aeroport={atcSession!.aeroport} position={atcSession!.position} />
            <Link href="/atc" className="text-sm font-medium text-slate-400 hover:text-slate-200">
              Retour
            </Link>
          </div>
        </div>
      )}

      {/* Clôture demandée */}
      {showConfirmerCloture && (
        <div className="card border-orange-500/30 bg-orange-500/5">
          <div className="flex items-center gap-3 mb-3">
            <AlertCircle className="h-5 w-5 text-orange-400" />
            <h3 className="font-semibold text-slate-100">Clôture demandée</h3>
          </div>
          <p className="text-slate-400 text-sm mb-4">Le pilote a demandé la clôture de ce vol.</p>
          <ConfirmerClotureButton planId={plan.id} />
        </div>
      )}

      {/* Accepter / Refuser */}
      {showAccepterRefuser && (
        <div className="card">
          <h3 className="font-semibold text-slate-100 mb-4">Actions</h3>
          <div className="space-y-4">
            <AccepterPlanButton planId={plan.id} />
            <div className="pt-4 border-t border-slate-700">
              <RefuserPlanForm planId={plan.id} />
            </div>
            <div className="pt-4 border-t border-slate-700">
              <p className="text-slate-400 text-sm mb-3">Transférer à une autre position :</p>
              <TransfererForm planId={plan.id} aeroportSession={atcSession?.aeroport ?? ''} allowAutomonitoring={false} />
            </div>
          </div>
        </div>
      )}

      {/* Instructions & Transfert */}
      {showInstructionsTransfer && (
        <div className="card">
          <h3 className="font-semibold text-slate-100 mb-4">Gestion du vol</h3>
          <div className="space-y-6">
            <InstructionsForm planId={plan.id} initial={plan.instructions || ''} />
            <div className="pt-4 border-t border-slate-700">
              <p className="text-slate-400 text-sm mb-3">Transférer le vol :</p>
              <TransfererForm planId={plan.id} aeroportSession={atcSession?.aeroport ?? ''} />
            </div>
          </div>
        </div>
      )}

      {/* Transfert en attente */}
      {plan.pending_transfer_aeroport && (isHolder || isAdmin) && (
        <div className="card border-amber-500/30 bg-amber-500/5">
          <div className="flex items-center gap-3 mb-2">
            <Clock className="h-5 w-5 text-amber-400 animate-pulse" />
            <h3 className="font-semibold text-amber-300">Transfert en attente</h3>
          </div>
          <p className="text-slate-300 text-sm">
            Transfert vers <span className="font-mono font-bold text-amber-300">{plan.pending_transfer_position}</span> ({plan.pending_transfer_aeroport})
          </p>
          <p className="text-slate-500 text-xs mt-2">Si non accepté sous 1 minute, le plan sera renvoyé.</p>
        </div>
      )}

      {/* Message si pas d'actions */}
      {!showConfirmerCloture && !showAccepterRefuser && !showInstructionsTransfer && !plan.automonitoring && !plan.pending_transfer_aeroport && plan.statut !== 'cloture' && plan.statut !== 'refuse' && (
        <div className="card bg-slate-800/50">
          <p className="text-slate-400 text-sm flex items-center gap-2">
            <Radio className="h-4 w-4" />
            Ce plan est géré par un autre contrôleur.
          </p>
        </div>
      )}
    </div>
  );
}
