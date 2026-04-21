import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { redirect, notFound } from 'next/navigation';
import Link from 'next/link';
import { ArrowLeft, Plane, Clock, FileText, Eye, Radio, Navigation, Users, Package, Ship, Building2, User, Percent, AlertTriangle, HeartPulse } from 'lucide-react';
import PrendreVolAfisButton from './PrendreVolAfisButton';
import RelacherVolAfisButton from './RelacherVolAfisButton';
import TranspondeurBadgeAtc from '@/components/TranspondeurBadgeAtc';
import TranspondeurInterface from '@/app/(app)/logbook/plans-vol/TranspondeurInterface';
import PlanVolCloturerButton from '@/app/(app)/logbook/plans-vol/PlanVolCloturerButton';
import PlanVolAnnulerButton from '@/app/(app)/logbook/plans-vol/PlanVolAnnulerButton';
import type { PlanVol } from '@/lib/types';

// Type étendu
type ExtendedPlan = PlanVol & {
  temps_prev_min?: number;
  intentions_vol?: string;
};

export const dynamic = 'force-dynamic';

const STATUT_CONFIG: Record<string, { label: string; color: string; bgColor: string; icon: React.ReactNode }> = {
  depose: { label: 'Déposé', color: 'text-slate-700', bgColor: 'bg-slate-100', icon: <FileText className="h-4 w-4" /> },
  en_attente: { label: 'En attente ATC', color: 'text-amber-700', bgColor: 'bg-amber-100', icon: <Clock className="h-4 w-4" /> },
  accepte: { label: 'Accepté', color: 'text-emerald-700', bgColor: 'bg-emerald-100', icon: <Plane className="h-4 w-4" /> },
  en_cours: { label: 'En vol', color: 'text-sky-700', bgColor: 'bg-sky-100', icon: <Plane className="h-4 w-4" /> },
  automonitoring: { label: 'Autosurveillance', color: 'text-purple-700', bgColor: 'bg-purple-100', icon: <Radio className="h-4 w-4" /> },
  en_attente_cloture: { label: 'Clôture demandée', color: 'text-orange-700', bgColor: 'bg-orange-100', icon: <AlertTriangle className="h-4 w-4" /> },
};

export default async function SiaviPlanPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const admin = createAdminClient();
  
  // Vérifier que l'utilisateur a accès SIAVI et est en service AFIS
  const [{ data: profile }, { data: afisSession }] = await Promise.all([
    supabase.from('profiles').select('role, siavi').eq('id', user.id).single(),
    supabase.from('afis_sessions').select('id, est_afis').eq('user_id', user.id).single(),
  ]);

  const canSiavi = profile?.role === 'admin' || profile?.role === 'siavi' || Boolean(profile?.siavi);
  if (!canSiavi) redirect('/logbook');

  // Charger le plan de vol
  const { data: planData } = await admin
    .from('plans_vol')
    .select('*')
    .eq('id', id)
    .single();

  if (!planData) notFound();

  // Charger les données liées
  let pilote = null;
  let compagnie = null;
  let avion = null;

  if (planData.pilote_id) {
    const { data } = await admin.from('profiles').select('identifiant').eq('id', planData.pilote_id).single();
    pilote = data;
  }

  if (planData.compagnie_id) {
    const { data } = await admin.from('compagnies').select('nom, code_oaci').eq('id', planData.compagnie_id).single();
    compagnie = data;
  }

  if (planData.compagnie_avion_id) {
    const { data: avionData } = await admin.from('compagnie_avions')
      .select('immatriculation, nom_bapteme, usure_percent, type_avion_id')
      .eq('id', planData.compagnie_avion_id)
      .single();
    
    if (avionData?.type_avion_id) {
      const { data: typeData } = await admin.from('types_avion').select('nom').eq('id', avionData.type_avion_id).single();
      avion = { ...avionData, types_avion: typeData };
    } else {
      avion = avionData;
    }
  }

  const plan = { ...planData, pilote, compagnie, avion };
  const statusConfig = STATUT_CONFIG[plan.statut] || { label: plan.statut, color: 'text-slate-700', bgColor: 'bg-slate-100', icon: <FileText className="h-4 w-4" /> };

  const estEnService = !!afisSession;
  const estAfis = afisSession?.est_afis ?? false;
  const estSurveillePar = plan.current_afis_user_id;
  const estMonVol = estSurveillePar === user.id;
  const peutPrendre = estAfis && plan.automonitoring && !estSurveillePar && !plan.current_holder_user_id;
  const peutRelacher = estAfis && estMonVol;

  // L'utilisateur est le pilote/créateur du vol : il peut le gérer directement
  // (transpondeur, clôture, annulation) sans passer par /logbook/plans-vol.
  const estLePilote = plan.pilote_id === user.id;
  const statutActif = ['accepte', 'en_cours', 'automonitoring', 'en_attente_cloture', 'en_pause'].includes(plan.statut);
  const statutOuvrable = ['depose', 'en_attente', 'accepte', 'en_cours', 'automonitoring', 'en_attente_cloture', 'refuse', 'planifie_suivant', 'en_pause'].includes(plan.statut);

  // Identifiant du contrôleur en charge pour l'interface transpondeur
  let controleurIdentifiant: string | null = null;
  if (estLePilote && plan.current_holder_user_id) {
    const { data: ctrl } = await admin.from('profiles').select('identifiant').eq('id', plan.current_holder_user_id).single();
    controleurIdentifiant = ctrl?.identifiant || null;
  }

  // Si le plan est en pause, charger le segment suivant pour proposer la reprise
  let segmentSuivantId: string | null = null;
  if (estLePilote && plan.statut === 'en_pause' && plan.medevac_next_plan_id) {
    const { data: next } = await admin.from('plans_vol')
      .select('id, statut')
      .eq('id', plan.medevac_next_plan_id)
      .maybeSingle();
    if (next?.statut === 'planifie_suivant') segmentSuivantId = next.id;
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center gap-4">
        <Link href="/siavi" className="p-2 rounded-lg bg-red-100 text-red-600 hover:text-red-900 hover:bg-red-200 transition-colors">
          <ArrowLeft className="h-5 w-5" />
        </Link>
        <div className="flex-1">
          <div className="flex items-center gap-3 flex-wrap">
            <h1 className="text-2xl font-bold text-red-900 font-mono">{plan.numero_vol}</h1>
            <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-sm font-medium ${statusConfig.bgColor} ${statusConfig.color}`}>
              {statusConfig.icon}
              {statusConfig.label}
            </span>
            {/* Transpondeur */}
            {plan.code_transpondeur && (
              <TranspondeurBadgeAtc 
                code={plan.code_transpondeur} 
                mode={plan.mode_transpondeur || 'C'} 
                size="md"
              />
            )}
          </div>
        </div>
      </div>

      {/* Bandeau contextuel : mode pilote (votre vol) OU mode observation SIAVI */}
      {estLePilote ? (
        <div className="rounded-xl border-2 border-red-400 bg-red-50 p-4">
          <div className="flex items-center gap-3">
            <HeartPulse className="h-5 w-5 text-red-600" />
            <div>
              <p className="font-semibold text-red-900">Votre vol MEDEVAC</p>
              <p className="text-red-700 text-sm">Vous êtes le pilote de ce vol. Gérez le transpondeur et clôturez directement depuis cette page.</p>
            </div>
          </div>
        </div>
      ) : (
        <div className="rounded-xl border-2 border-amber-400 bg-amber-50 p-4">
          <div className="flex items-center gap-3">
            <Eye className="h-5 w-5 text-amber-600" />
            <div>
              <p className="font-semibold text-amber-800">Mode observation SIAVI</p>
              <p className="text-amber-700 text-sm">Vous pouvez visualiser les informations du vol mais pas le modifier.</p>
            </div>
          </div>
        </div>
      )}

      {/* Interface pilote complète : transpondeur (si vol actif) */}
      {estLePilote && statutActif && plan.statut !== 'en_pause' && (
        <TranspondeurInterface
          planId={plan.id}
          numeroVol={plan.numero_vol || ''}
          aeroportDepart={plan.aeroport_depart || ''}
          aeroportArrivee={plan.aeroport_arrivee || ''}
          codeTranspondeur={plan.code_transpondeur ?? null}
          modeTranspondeur={plan.mode_transpondeur || 'C'}
          acceptedAt={plan.accepted_at ?? null}
          statut={plan.statut}
          controleurIdentifiant={controleurIdentifiant}
          controleurPosition={plan.current_holder_position ?? null}
          controleurAeroport={plan.current_holder_aeroport ?? null}
          automonitoring={plan.automonitoring || false}
        />
      )}

      {/* Actions pilote : reprendre (si en pause), clôturer, annuler */}
      {estLePilote && statutOuvrable && (
        <div className="rounded-xl border border-red-200 bg-white p-4 shadow-sm">
          <div className="flex items-center justify-between flex-wrap gap-3">
            <div>
              <p className="text-sm font-medium text-red-900">Actions sur votre vol</p>
              <p className="text-xs text-slate-500 mt-0.5">
                {plan.statut === 'en_pause' && segmentSuivantId
                  ? 'Mission en pause — activez le segment suivant pour reprendre le vol.'
                  : plan.statut === 'en_pause'
                  ? 'Mission en pause.'
                  : 'Clôturez ce segment quand le vol est terminé, ou annulez s\'il n\'a pas décollé.'}
              </p>
            </div>
            <div className="flex items-center gap-3 flex-wrap">
              {plan.statut === 'en_pause' && segmentSuivantId && (
                <Link
                  href={`/siavi/plan/${segmentSuivantId}/reprendre`}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-amber-600 hover:bg-amber-700 text-white text-sm font-medium transition-colors"
                >
                  <Navigation className="h-3.5 w-3.5" />
                  Reprendre la mission
                </Link>
              )}
              <PlanVolCloturerButton planId={plan.id} statut={plan.statut} isMedevac={!!plan.siavi_avion_id} />
              <PlanVolAnnulerButton planId={plan.id} statut={plan.statut} />
            </div>
          </div>
        </div>
      )}

      {/* Info vol principale */}
      <div className="rounded-xl border border-red-200 bg-white p-6 shadow-sm">
        <div className="grid gap-6 md:grid-cols-2">
          {/* Route */}
          <div>
            <h3 className="text-sm font-medium text-red-600 uppercase tracking-wide mb-3">Route</h3>
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
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
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
          </div>
        </div>
        
        {/* Informations pilote, compagnie et avion */}
        <div className="mt-6 pt-6 border-t border-slate-200">
          <h3 className="text-sm font-medium text-red-600 uppercase tracking-wide mb-3">Informations complémentaires</h3>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {pilote?.identifiant && (
              <div className="flex items-center gap-2 p-3 bg-slate-50 rounded-lg">
                <User className="h-5 w-5 text-slate-500" />
                <div>
                  <p className="text-xs text-slate-500">Pilote</p>
                  <p className="font-medium text-slate-800">{pilote.identifiant}</p>
                </div>
              </div>
            )}
            
            {compagnie?.nom && (
              <div className="flex items-center gap-2 p-3 bg-slate-50 rounded-lg">
                <Building2 className="h-5 w-5 text-slate-500" />
                <div>
                  <p className="text-xs text-slate-500">Compagnie</p>
                  <p className="font-medium text-slate-800">{compagnie.nom}</p>
                </div>
              </div>
            )}
            
            {avion?.immatriculation && (
              <div className="flex items-center gap-2 p-3 bg-slate-50 rounded-lg">
                <Plane className="h-5 w-5 text-slate-500" />
                <div>
                  <p className="text-xs text-slate-500">Avion</p>
                  <p className="font-medium text-slate-800 font-mono">{avion.immatriculation}</p>
                </div>
              </div>
            )}

            {avion?.usure_percent !== undefined && (
              <div className="flex items-center gap-2 p-3 bg-slate-50 rounded-lg">
                <Percent className="h-5 w-5 text-slate-500" />
                <div>
                  <p className="text-xs text-slate-500">État avion</p>
                  <p className={`font-medium ${avion.usure_percent >= 70 ? 'text-emerald-600' : avion.usure_percent >= 30 ? 'text-amber-600' : 'text-red-600'}`}>
                    {avion.usure_percent}%
                  </p>
                </div>
              </div>
            )}
          </div>
          
          {/* Type de vol (commercial, ferry, etc.) */}
          <div className="flex flex-wrap gap-2 mt-4">
            {plan.vol_ferry && (
              <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-amber-100 text-amber-700 text-sm font-medium">
                <Ship className="h-4 w-4" />
                Vol Ferry
              </span>
            )}
            {plan.vol_commercial && plan.nature_transport === 'passagers' && (
              <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-sky-100 text-sky-700 text-sm font-medium">
                <Users className="h-4 w-4" />
                {plan.nb_pax_genere || 0} passagers
              </span>
            )}
            {plan.vol_commercial && plan.nature_transport === 'cargo' && (
              <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-purple-100 text-purple-700 text-sm font-medium">
                <Package className="h-4 w-4" />
                {plan.cargo_kg_genere || 0} kg cargo
              </span>
            )}
          </div>
        </div>

        {/* Infos VFR/IFR */}
        {plan.type_vol === 'VFR' && plan.intentions_vol && (
          <div className="mt-6 pt-6 border-t border-slate-200">
            <h3 className="text-sm font-medium text-red-600 uppercase tracking-wide mb-2 flex items-center gap-2">
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
          </div>
        )}

        {/* Instructions ATC */}
        {plan.instructions && (
          <div className="mt-6 pt-6 border-t border-slate-200">
            <h3 className="text-sm font-medium text-slate-600 uppercase tracking-wide mb-2">Instructions ATC</h3>
            <p className="text-slate-700 bg-slate-50 rounded-lg p-3 text-sm">{plan.instructions}</p>
          </div>
        )}
      </div>

      {/* Actions AFIS (uniquement si ce n'est pas son propre vol) */}
      {estEnService && estAfis && !estLePilote && (
        <div className="rounded-xl border border-red-200 bg-white p-6 shadow-sm">
          <h3 className="font-semibold text-red-900 mb-4 flex items-center gap-2">
            <Eye className="h-5 w-5 text-red-600" />
            Actions AFIS
          </h3>
          
          {peutPrendre && (
            <div className="space-y-3">
              <p className="text-slate-600 text-sm">Ce vol est en autosurveillance. Vous pouvez le prendre sous votre surveillance.</p>
              <PrendreVolAfisButton planId={plan.id} />
            </div>
          )}

          {estMonVol && (
            <div className="space-y-3">
              <p className="text-slate-600 text-sm">Ce vol est sous votre surveillance. Vous pouvez le relâcher pour qu&apos;il retourne en autosurveillance.</p>
              <RelacherVolAfisButton planId={plan.id} />
            </div>
          )}

          {estSurveillePar && !estMonVol && (
            <p className="text-amber-600 text-sm">Ce vol est surveillé par un autre agent AFIS.</p>
          )}

          {!plan.automonitoring && plan.current_holder_user_id && (
            <p className="text-slate-600 text-sm">Ce vol est contrôlé par un ATC. Mode observation uniquement.</p>
          )}
        </div>
      )}

      {/* Message si pas en service */}
      {!estEnService && (
        <div className="rounded-xl border border-amber-300 bg-amber-50 p-4">
          <p className="text-amber-700 text-sm">Mettez-vous en service pour pouvoir prendre des vols sous surveillance.</p>
        </div>
      )}

      {estEnService && !estAfis && (
        <div className="rounded-xl border border-amber-300 bg-amber-50 p-4">
          <p className="text-amber-700 text-sm">Vous êtes en mode Pompier. Les fonctions AFIS ne sont pas disponibles car un ATC est en ligne.</p>
        </div>
      )}
    </div>
  );
}
