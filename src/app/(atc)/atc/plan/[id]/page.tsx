import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { redirect, notFound } from 'next/navigation';
import Link from 'next/link';
import { ArrowLeft, Plane, Clock, FileText, AlertCircle, CheckCircle2, XCircle, Radio, Navigation, Users, Package, Ship, Building2, User, Percent } from 'lucide-react';
import ConfirmerClotureButton from './ConfirmerClotureButton';
import AccepterPlanButton from './AccepterPlanButton';
import RefuserPlanForm from './RefuserPlanForm';
import InstructionsForm from './InstructionsForm';
import TransfererForm from './TransfererForm';
import PrendrePlanButton from './PrendrePlanButton';

export const dynamic = 'force-dynamic';

const STATUT_CONFIG: Record<string, { label: string; color: string; bgColor: string; icon: React.ReactNode }> = {
  depose: { label: 'Déposé', color: 'text-slate-700', bgColor: 'bg-slate-100', icon: <FileText className="h-4 w-4" /> },
  en_attente: { label: 'En attente ATC', color: 'text-amber-700', bgColor: 'bg-amber-100', icon: <Clock className="h-4 w-4" /> },
  accepte: { label: 'Accepté', color: 'text-emerald-700', bgColor: 'bg-emerald-100', icon: <CheckCircle2 className="h-4 w-4" /> },
  refuse: { label: 'Refusé', color: 'text-red-700', bgColor: 'bg-red-100', icon: <XCircle className="h-4 w-4" /> },
  en_cours: { label: 'En vol', color: 'text-sky-700', bgColor: 'bg-sky-100', icon: <Plane className="h-4 w-4" /> },
  automonitoring: { label: 'Autosurveillance', color: 'text-purple-700', bgColor: 'bg-purple-100', icon: <Radio className="h-4 w-4" /> },
  en_attente_cloture: { label: 'Clôture demandée', color: 'text-orange-700', bgColor: 'bg-orange-100', icon: <AlertCircle className="h-4 w-4" /> },
  cloture: { label: 'Clôturé', color: 'text-slate-600', bgColor: 'bg-slate-200', icon: <CheckCircle2 className="h-4 w-4" /> },
};

export default async function AtcPlanPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const admin = createAdminClient();
  
  // Charger le plan de vol
  const { data: planData } = await admin
    .from('plans_vol')
    .select('*')
    .eq('id', id)
    .single();

  if (!planData) notFound();

  // Charger les données liées manuellement pour éviter les problèmes de relation
  let pilote = null;
  let compagnie = null;
  let avion = null;

  if (planData.pilote_id) {
    const { data: piloteData } = await admin
      .from('profiles')
      .select('identifiant')
      .eq('id', planData.pilote_id)
      .single();
    pilote = piloteData;
  }

  if (planData.compagnie_id) {
    const { data: compagnieData } = await admin
      .from('compagnies')
      .select('nom, code_oaci')
      .eq('id', planData.compagnie_id)
      .single();
    compagnie = compagnieData;
  }

  if (planData.compagnie_avion_id) {
    const { data: avionData } = await admin
      .from('compagnie_avions')
      .select('immatriculation, nom_bapteme, usure_percent, type_avion_id')
      .eq('id', planData.compagnie_avion_id)
      .single();
    
    if (avionData) {
      let types_avion = null;
      if (avionData.type_avion_id) {
        const { data: typeData } = await admin
          .from('types_avion')
          .select('nom')
          .eq('id', avionData.type_avion_id)
          .single();
        types_avion = typeData;
      }
      avion = { ...avionData, types_avion };
    }
  }

  const plan = { ...planData, pilote, compagnie, avion };

  const { data: atcSession } = await supabase.from('atc_sessions').select('aeroport, position').eq('user_id', user.id).single();
  if (plan.automonitoring && !atcSession) redirect('/atc');

  const { data: profile } = await supabase.from('profiles').select('role, atc').eq('id', user.id).single();
  const isAdmin = profile?.role === 'admin';
  const isHolder = plan.current_holder_user_id === user.id;
  const showConfirmerCloture = plan.statut === 'en_attente_cloture' && (isHolder || isAdmin);
  const showAccepterRefuser = plan.statut === 'en_attente' || plan.statut === 'depose';
  const showInstructionsTransfer = (plan.statut === 'accepte' || plan.statut === 'en_cours') && (isHolder || isAdmin) && !plan.automonitoring && !plan.pending_transfer_aeroport;

  const statusConfig = STATUT_CONFIG[plan.statut] || { label: plan.statut, color: 'text-slate-700', bgColor: 'bg-slate-100', icon: <FileText className="h-4 w-4" /> };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center gap-4">
        <Link href="/atc" className="p-2 rounded-lg bg-slate-200 text-slate-600 hover:text-slate-900 hover:bg-slate-300 transition-colors">
          <ArrowLeft className="h-5 w-5" />
        </Link>
        <div className="flex-1">
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-bold text-slate-900 font-mono">{plan.numero_vol}</h1>
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
            <h3 className="text-sm font-medium text-slate-600 uppercase tracking-wide mb-3">Route</h3>
            <div className="flex items-center gap-4">
              <div className="text-center">
                <p className="text-3xl font-bold text-sky-600 font-mono">{plan.aeroport_depart}</p>
                <p className="text-xs text-slate-500 mt-1">Départ</p>
              </div>
              <div className="flex-1 flex items-center justify-center">
                <div className="w-full h-px bg-gradient-to-r from-sky-500 via-slate-400 to-emerald-500 relative">
                  <Plane className="h-4 w-4 text-slate-600 absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 bg-white px-1" />
                </div>
              </div>
              <div className="text-center">
                <p className="text-3xl font-bold text-emerald-600 font-mono">{plan.aeroport_arrivee}</p>
                <p className="text-xs text-slate-500 mt-1">Arrivée</p>
              </div>
            </div>
          </div>

          {/* Détails */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <p className="text-xs text-slate-500 uppercase tracking-wide">Type de vol</p>
              <p className="text-lg font-semibold text-slate-800">{plan.type_vol}</p>
            </div>
            {plan.temps_prev_min && (
              <div>
                <p className="text-xs text-slate-500 uppercase tracking-wide">Temps prévu</p>
                <p className="text-lg font-semibold text-slate-800 flex items-center gap-1">
                  <Clock className="h-4 w-4 text-slate-500" />
                  {plan.temps_prev_min} min
                </p>
              </div>
            )}
            {plan.porte && (
              <div>
                <p className="text-xs text-slate-500 uppercase tracking-wide">Porte</p>
                <p className="text-lg font-semibold text-slate-800">{plan.porte}</p>
              </div>
            )}
          </div>
        </div>
        
        {/* Informations pilote, compagnie et avion */}
        <div className="mt-6 pt-6 border-t border-slate-200">
          <h3 className="text-sm font-medium text-slate-600 uppercase tracking-wide mb-3">Informations complémentaires</h3>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {/* Pilote */}
            {(() => {
              const piloteData = (plan as any).pilote;
              const pilote = piloteData ? (Array.isArray(piloteData) ? piloteData[0] : piloteData) : null;
              return pilote?.identifiant ? (
                <div className="flex items-center gap-2 p-3 bg-slate-50 rounded-lg">
                  <User className="h-5 w-5 text-slate-500" />
                  <div>
                    <p className="text-xs text-slate-500">Pilote</p>
                    <p className="font-medium text-slate-800">{pilote.identifiant}</p>
                  </div>
                </div>
              ) : null;
            })()}
            
            {/* Compagnie */}
            {(() => {
              const compagnieData = (plan as any).compagnie;
              const compagnie = compagnieData ? (Array.isArray(compagnieData) ? compagnieData[0] : compagnieData) : null;
              return compagnie?.nom ? (
                <div className="flex items-center gap-2 p-3 bg-slate-50 rounded-lg">
                  <Building2 className="h-5 w-5 text-slate-500" />
                  <div>
                    <p className="text-xs text-slate-500">Compagnie</p>
                    <p className="font-medium text-slate-800">{compagnie.nom} {compagnie.code_oaci && <span className="text-slate-500 text-xs">({compagnie.code_oaci})</span>}</p>
                  </div>
                </div>
              ) : null;
            })()}
            
            {/* Avion */}
            {(() => {
              const avionData = (plan as any).avion;
              const avion = avionData ? (Array.isArray(avionData) ? avionData[0] : avionData) : null;
              const typeAvion = avion?.types_avion ? (Array.isArray(avion.types_avion) ? avion.types_avion[0] : avion.types_avion) : null;
              return avion?.immatriculation ? (
                <div className="flex items-center gap-2 p-3 bg-slate-50 rounded-lg">
                  <Plane className="h-5 w-5 text-slate-500" />
                  <div>
                    <p className="text-xs text-slate-500">Avion</p>
                    <p className="font-medium text-slate-800 font-mono">{avion.immatriculation}</p>
                    {typeAvion?.nom && <p className="text-xs text-slate-500">{typeAvion.nom}</p>}
                  </div>
                </div>
              ) : null;
            })()}
            
            {/* Usure avion */}
            {(() => {
              const avionData = (plan as any).avion;
              const avion = avionData ? (Array.isArray(avionData) ? avionData[0] : avionData) : null;
              return avion?.usure_percent !== undefined ? (
                <div className="flex items-center gap-2 p-3 bg-slate-50 rounded-lg">
                  <Percent className="h-5 w-5 text-slate-500" />
                  <div>
                    <p className="text-xs text-slate-500">État avion</p>
                    <p className={`font-medium ${avion.usure_percent >= 70 ? 'text-emerald-600' : avion.usure_percent >= 30 ? 'text-amber-600' : 'text-red-600'}`}>
                      {avion.usure_percent}%
                    </p>
                  </div>
                </div>
              ) : null;
            })()}
          </div>
          
          {/* Type de vol (commercial, ferry, etc.) */}
          <div className="flex flex-wrap gap-2 mt-4">
            {(plan as any).vol_ferry && (
              <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-amber-100 text-amber-700 text-sm font-medium">
                <Ship className="h-4 w-4" />
                Vol Ferry (repositionnement)
              </span>
            )}
            {(plan as any).vol_commercial && (plan as any).nature_transport === 'passagers' && (
              <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-sky-100 text-sky-700 text-sm font-medium">
                <Users className="h-4 w-4" />
                {(plan as any).nb_pax_genere || 0} passagers
              </span>
            )}
            {(plan as any).vol_commercial && (plan as any).nature_transport === 'cargo' && (
              <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-purple-100 text-purple-700 text-sm font-medium">
                <Package className="h-4 w-4" />
                {(plan as any).cargo_kg_genere || 0} kg de cargo
                {(plan as any).type_cargaison && <span className="text-purple-500 ml-1">({(plan as any).type_cargaison})</span>}
              </span>
            )}
            {!(plan as any).vol_commercial && !(plan as any).vol_ferry && (
              <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-100 text-slate-600 text-sm font-medium">
                <Plane className="h-4 w-4" />
                Vol privé / Instruction
              </span>
            )}
          </div>
        </div>

        {/* Infos IFR/VFR */}
        {plan.type_vol === 'VFR' && plan.intentions_vol && (
          <div className="mt-6 pt-6 border-t border-slate-200">
            <h3 className="text-sm font-medium text-slate-600 uppercase tracking-wide mb-2 flex items-center gap-2">
              <Navigation className="h-4 w-4" />
              Intentions de vol
            </h3>
            <p className="text-slate-700 bg-slate-50 rounded-lg p-3 text-sm">{plan.intentions_vol}</p>
          </div>
        )}

        {plan.type_vol === 'IFR' && (
          <div className="mt-6 pt-6 border-t border-slate-200 space-y-4">
            <div className="grid gap-4 sm:grid-cols-2">
              {plan.sid_depart && (
                <div>
                  <p className="text-xs text-slate-500 uppercase tracking-wide">SID Départ</p>
                  <p className="text-lg font-mono text-sky-600">{plan.sid_depart}</p>
                </div>
              )}
              {plan.star_arrivee && (
                <div>
                  <p className="text-xs text-slate-500 uppercase tracking-wide">STAR Arrivée</p>
                  <p className="text-lg font-mono text-emerald-600">{plan.star_arrivee}</p>
                </div>
              )}
            </div>
            {plan.route_ifr && (
              <div>
                <p className="text-xs text-slate-500 uppercase tracking-wide mb-1">Route IFR</p>
                <p className="text-slate-700 bg-slate-50 rounded-lg p-3 text-sm font-mono">{plan.route_ifr}</p>
              </div>
            )}
          </div>
        )}

        {/* Note ATC */}
        {plan.note_atc && (
          <div className="mt-6 pt-6 border-t border-slate-200">
            <h3 className="text-sm font-medium text-amber-600 uppercase tracking-wide mb-2 flex items-center gap-2">
              <AlertCircle className="h-4 w-4" />
              Note d&apos;attention du pilote
            </h3>
            <p className="text-amber-800 bg-amber-50 border border-amber-200 rounded-lg p-3 text-sm">{plan.note_atc}</p>
          </div>
        )}

        {/* Raison refus */}
        {plan.refusal_reason && (
          <div className="mt-6 pt-6 border-t border-slate-200">
            <h3 className="text-sm font-medium text-red-600 uppercase tracking-wide mb-2 flex items-center gap-2">
              <XCircle className="h-4 w-4" />
              Raison du refus
            </h3>
            <p className="text-red-700 bg-red-50 border border-red-200 rounded-lg p-3 text-sm">{plan.refusal_reason}</p>
          </div>
        )}

        {/* Instructions en lecture seule */}
        {plan.instructions && !showInstructionsTransfer && (
          <div className="mt-6 pt-6 border-t border-slate-200">
            <h3 className="text-sm font-medium text-slate-600 uppercase tracking-wide mb-2">Instructions ATC</h3>
            <p className="text-slate-700 bg-slate-50 rounded-lg p-3 text-sm">
              {plan.instructions}
              {plan.automonitoring && <span className="text-slate-500 ml-2">(lecture seule)</span>}
            </p>
          </div>
        )}
      </div>

      {/* Autosurveillance */}
      {plan.automonitoring && (
        <div className="card border-purple-300 bg-purple-50">
          <div className="flex items-center gap-3 mb-3">
            <Radio className="h-5 w-5 text-purple-600" />
            <h3 className="font-semibold text-slate-900">Vol en autosurveillance</h3>
          </div>
          <p className="text-slate-600 text-sm mb-4">Ce vol n&apos;est actuellement pas contrôlé. Vous pouvez le prendre en charge.</p>
          <div className="flex items-center gap-3">
            <PrendrePlanButton planId={plan.id} aeroport={atcSession!.aeroport} position={atcSession!.position} />
            <Link href="/atc" className="text-sm font-medium text-slate-600 hover:text-slate-900">
              Retour
            </Link>
          </div>
        </div>
      )}

      {/* Clôture demandée */}
      {showConfirmerCloture && (
        <div className="card border-orange-300 bg-orange-50">
          <div className="flex items-center gap-3 mb-3">
            <AlertCircle className="h-5 w-5 text-orange-600" />
            <h3 className="font-semibold text-slate-900">Clôture demandée</h3>
          </div>
          <p className="text-slate-600 text-sm mb-4">Le pilote a demandé la clôture de ce vol.</p>
          <ConfirmerClotureButton planId={plan.id} />
        </div>
      )}

      {/* Accepter / Refuser */}
      {showAccepterRefuser && (
        <div className="card">
          <h3 className="font-semibold text-slate-900 mb-4">Actions</h3>
          <div className="space-y-4">
            <AccepterPlanButton planId={plan.id} />
            <div className="pt-4 border-t border-slate-200">
              <RefuserPlanForm planId={plan.id} />
            </div>
            <div className="pt-4 border-t border-slate-200">
              <p className="text-slate-600 text-sm mb-3">Transférer à une autre position :</p>
              <TransfererForm planId={plan.id} aeroportSession={atcSession?.aeroport ?? ''} allowAutomonitoring={false} />
            </div>
          </div>
        </div>
      )}

      {/* Instructions & Transfert */}
      {showInstructionsTransfer && (
        <div className="card">
          <h3 className="font-semibold text-slate-900 mb-4">Gestion du vol</h3>
          <div className="space-y-6">
            <InstructionsForm planId={plan.id} initial={plan.instructions || ''} />
            <div className="pt-4 border-t border-slate-200">
              <p className="text-slate-600 text-sm mb-3">Transférer le vol :</p>
              <TransfererForm planId={plan.id} aeroportSession={atcSession?.aeroport ?? ''} />
            </div>
          </div>
        </div>
      )}

      {/* Transfert en attente */}
      {plan.pending_transfer_aeroport && (isHolder || isAdmin) && (
        <div className="card border-amber-300 bg-amber-50">
          <div className="flex items-center gap-3 mb-2">
            <Clock className="h-5 w-5 text-amber-600 animate-pulse" />
            <h3 className="font-semibold text-amber-700">Transfert en attente</h3>
          </div>
          <p className="text-slate-700 text-sm">
            Transfert vers <span className="font-mono font-bold text-amber-700">{plan.pending_transfer_position}</span> ({plan.pending_transfer_aeroport})
          </p>
          <p className="text-slate-500 text-xs mt-2">Si non accepté sous 1 minute, le plan sera renvoyé.</p>
        </div>
      )}

      {/* Message si pas d'actions */}
      {!showConfirmerCloture && !showAccepterRefuser && !showInstructionsTransfer && !plan.automonitoring && !plan.pending_transfer_aeroport && plan.statut !== 'cloture' && plan.statut !== 'refuse' && (
        <div className="card bg-slate-50">
          <p className="text-slate-600 text-sm flex items-center gap-2">
            <Radio className="h-4 w-4" />
            Ce plan est géré par un autre contrôleur.
          </p>
        </div>
      )}
    </div>
  );
}
