import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { redirect } from 'next/navigation';
import Link from 'next/link';
import { formatDateHourUTC } from '@/lib/date-utils';
import { ArrowLeft, FileText, AlertCircle, Bell, Plane, CheckCircle2, XCircle, Timer, ArrowRight, Plus, Radio } from 'lucide-react';
import DerouterButton from './DerouterButton';
import PlanVolCloturerButton from './PlanVolCloturerButton';
import PlanVolAnnulerButton from './PlanVolAnnulerButton';
import PlanVolCopiloteActions from './PlanVolCopiloteActions';
import NePasEnregistrerPlanButton from '../NePasEnregistrerPlanButton';
import TranspondeurInterface from './TranspondeurInterface';
import MedevacPauseBanner from './MedevacPauseBanner';
import ServicesAuSolPanel from './ServicesAuSolPanel';
import type { PlanVol } from '@/lib/types';
import { ARME_MISSIONS } from '@/lib/armee-missions';
import styles from './PilotOperations.module.css';
import { loadUnrecordedClosedPlans } from '@/lib/logbook-registration';
import PilotItineraryProgress, { type PilotItinerarySummary } from '@/components/company/PilotItineraryProgress';

const STATUT_CONFIG: Record<string, { label: string; color: string; bgColor: string }> = {
  depose: { label: 'Déposé', color: 'text-slate-300', bgColor: 'bg-slate-500/20' },
  en_attente: { label: 'En attente ATC', color: 'text-amber-400', bgColor: 'bg-amber-500/20' },
  en_attente_copilote: { label: 'En attente copilote', color: 'text-violet-300', bgColor: 'bg-violet-500/20' },
  accepte: { label: 'Accepté', color: 'text-emerald-400', bgColor: 'bg-emerald-500/20' },
  refuse: { label: 'Refusé', color: 'text-red-400', bgColor: 'bg-red-500/20' },
  en_cours: { label: 'En cours', color: 'text-sky-400', bgColor: 'bg-sky-500/20' },
  automonitoring: { label: 'Autosurveillance', color: 'text-purple-400', bgColor: 'bg-purple-500/20' },
  en_attente_cloture: { label: 'Clôture demandée', color: 'text-orange-400', bgColor: 'bg-orange-500/20' },
  cloture: { label: 'Clôturé', color: 'text-emerald-400', bgColor: 'bg-emerald-500/20' },
  en_pause: { label: 'Pause mission', color: 'text-amber-300', bgColor: 'bg-amber-500/10' },
  planifie_suivant: { label: 'Segment futur', color: 'text-slate-400', bgColor: 'bg-slate-500/10' },
};

export default async function MesPlansVolPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const admin = createAdminClient();

  // Profile and plans in parallel
  const [{ data: profile }, { data: raw, error: plansError }, { data: plansClotures, error: closedPlansError }, { data: itineraryRows, error: itinerariesError }] = await Promise.all([
    supabase.from('profiles').select('role, identifiant').eq('id', user.id).single(),
    admin
      .from('plans_vol')
      .select('id, pilote_id, copilote_id, numero_vol, aeroport_depart, aeroport_arrivee, type_vol, statut, created_at, temps_prev_min, refusal_reason, code_transpondeur, mode_transpondeur, accepted_at, current_holder_user_id, current_holder_position, current_holder_aeroport, automonitoring, siavi_avion_id, compagnie_avion_id, inventaire_avion_id, nb_pax_genere, medevac_mission_id, medevac_segment_index, medevac_total_segments, medevac_next_plan_id, armee_mission_id, porte, deroutement_at, deroutement_destination_initiale, copilote:profiles!plans_vol_copilote_id_fkey(identifiant)')
      .or(`pilote_id.eq.${user.id},copilote_id.eq.${user.id}`)
      .in('statut', ['depose', 'en_attente', 'en_attente_copilote', 'accepte', 'refuse', 'en_cours', 'automonitoring', 'en_attente_cloture', 'en_pause', 'planifie_suivant'])
      .order('created_at', { ascending: false }),
    // A pending staff review is already a logbook record, not an unrecorded plan.
    loadUnrecordedClosedPlans(admin, user.id),
    admin.from('company_itineraries')
      .select('id,company_id,flight_number,origin,destination,status,next_leg_index,legs:company_itinerary_legs(id,leg_index,origin,destination,status,plan_id)')
      .eq('pilot_id', user.id)
      .in('status', ['planned', 'active', 'paused', 'diverted'])
      .order('created_at', { ascending: false })
      .limit(10),
  ]);

  if (profile?.role === 'atc') redirect('/logbook');

  if (plansError) return <div className="mx-auto max-w-5xl space-y-5"><h1 className="text-2xl font-semibold text-slate-100">Mes plans de vol</h1><section role="alert" className="rounded-xl border border-amber-700/60 bg-slate-900 p-5"><h2 className="font-semibold text-amber-200">Le suivi des plans est momentanément indisponible</h2><p className="mt-2 text-sm text-slate-300">Vos plans ne peuvent pas être chargés. Cela ne signifie pas qu’aucun vol n’est en cours.</p><Link href="/logbook/plans-vol" className="mt-4 inline-flex min-h-11 items-center rounded-lg border border-slate-600 px-4 text-sm text-slate-200 hover:bg-slate-800">Réessayer</Link></section></div>;

  const allPlans = (raw || []) as unknown as PlanVol[];

  // La liste principale exclut : cloture, annule (terminés), planifie_suivant (segments futurs invisibles)
  // et en_pause (affichés dans un encart dédié "Pause temporaire").
  const plans = allPlans.filter(p => !['cloture', 'annule', 'planifie_suivant', 'en_pause'].includes(p.statut));
  const plansRefuses = plans.filter(p => p.statut === 'refuse');
  const plansNonClotures = plans.filter(p => p.statut !== 'refuse');
  const plansEnCours = plans.filter(p => ['en_cours', 'accepte', 'automonitoring', 'en_attente_cloture'].includes(p.statut));

  const planActif = plans.find(p => ['accepte', 'en_cours', 'automonitoring', 'en_attente_cloture'].includes(p.statut)) as PlanVol | undefined;

  // Détection d'une mission MEDEVAC en pause : segment 'en_pause' avec un segment suivant 'planifie_suivant'
  const segmentsEnPause = allPlans.filter(p => p.statut === 'en_pause' && p.medevac_next_plan_id);
  let medevacPause: { segmentClos: PlanVol; segmentSuivant: PlanVol } | null = null;
  if (segmentsEnPause.length > 0) {
    const segClos = segmentsEnPause[0];
    const segSuiv = allPlans.find(p => p.id === segClos.medevac_next_plan_id && p.statut === 'planifie_suivant') as PlanVol | undefined;
    if (segSuiv) {
      medevacPause = { segmentClos: segClos, segmentSuivant: segSuiv };
    }
  }

  const hasActivePlan = !!planActif || !!medevacPause || plans.some((p) => p.statut === 'en_attente_copilote');

  let controleurIdentifiant: string | null = null;
  if (planActif?.current_holder_user_id) {
    const { data: controleurProfile } = await admin
      .from('profiles')
      .select('identifiant')
      .eq('id', planActif.current_holder_user_id)
      .single();
    controleurIdentifiant = controleurProfile?.identifiant || null;
  }

  // Déterminer si l'avion du plan actif a un transpondeur Mode S.
  // Priorité : compagnie_avion_id → inventaire_avion_id → siavi_avion_id (IDs directs du plan).
  let hasModeSAvion = false;
  if (planActif) {
    const p = planActif as any;
    let typeAvionId: string | null = null;

    // 1. Avion de compagnie (lien direct via compagnie_avion_id sur le plan)
    if (!typeAvionId && p.compagnie_avion_id) {
      const { data: ca } = await admin.from('compagnie_avions').select('type_avion_id').eq('id', p.compagnie_avion_id).single();
      typeAvionId = ca?.type_avion_id ?? null;
    }
    // 2. Avion inventaire personnel
    if (!typeAvionId && p.inventaire_avion_id) {
      const { data: ia } = await admin.from('inventaire_avions').select('type_avion_id').eq('id', p.inventaire_avion_id).single();
      typeAvionId = ia?.type_avion_id ?? null;
    }
    // 3. Avion SIAVI (MEDEVAC, etc.)
    if (!typeAvionId && p.siavi_avion_id) {
      const { data: sa } = await admin.from('siavi_avions').select('type_avion_id').eq('id', p.siavi_avion_id).single();
      typeAvionId = sa?.type_avion_id ?? null;
    }

    if (typeAvionId) {
      const { data: ta } = await admin.from('types_avion').select('has_mode_s').eq('id', typeAvionId).single();
      hasModeSAvion = ta?.has_mode_s ?? false;
    }
  }

  return (
    <div className={`${styles.operations} mx-auto w-full max-w-6xl space-y-6`}>
      <header className="rounded-xl border border-slate-700/70 bg-slate-900/80 p-5 sm:p-6">
        <Link href="/logbook" className="mb-4 inline-flex min-h-10 items-center gap-2 text-sm text-slate-400 hover:text-slate-100"><ArrowLeft aria-hidden className="h-4 w-4"/> Carnet de vol</Link>
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div><p className="mb-2 text-xs font-medium uppercase tracking-widest text-sky-400">Opérations de vol</p><h1 className="flex items-center gap-3 text-2xl font-semibold tracking-tight text-slate-100 sm:text-3xl"><FileText aria-hidden className="h-6 w-6 text-sky-400"/> Mes plans de vol</h1><p className="mt-3 max-w-2xl text-sm leading-relaxed text-slate-400">Préparation, suivi opérationnel et clôture. Les vols terminés sont enregistrés séparément dans votre carnet.</p></div>
          {hasActivePlan ? <a href="#suivi-operationnel" className="inline-flex min-h-11 items-center gap-2 rounded-lg border border-sky-700 bg-sky-950/40 px-4 text-sm font-semibold text-sky-200"><Radio aria-hidden className="h-4 w-4"/> Reprendre le suivi</a> : <Link href="/logbook/depot-plan-vol" className="inline-flex min-h-11 items-center gap-2 rounded-lg bg-sky-600 px-4 text-sm font-semibold text-white hover:bg-sky-500"><Plus aria-hidden className="h-4 w-4"/> Nouveau plan de vol</Link>}
        </div>
      </header>
      <dl className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        {[{label:'En exploitation',value:plansEnCours.length,detail:'Acceptés, en cours ou à clôturer'}, {label:'Plans ouverts',value:plansNonClotures.length,detail:'Dépôts et vols non clôturés'}, {label:'À corriger',value:plansRefuses.length,detail:'Plans refusés par le contrôle'}].map(item=><div key={item.label} className="rounded-xl border border-slate-700/70 bg-slate-900/70 px-5 py-4"><dt className="text-sm text-slate-400">{item.label}</dt><dd className="mt-2 font-mono text-2xl font-semibold tabular-nums text-slate-100">{item.value}</dd><p className="mt-1 text-xs text-slate-500">{item.detail}</p></div>)}
      </dl>
      <div id="suivi-operationnel" className="scroll-mt-28"/>
      {itinerariesError ? <p role="status" className="rounded-lg border border-slate-700 p-4 text-sm text-slate-400">Le suivi des itinéraires commerciaux est temporairement indisponible. <Link href="/logbook/plans-vol" className="text-sky-300 underline">Réessayer</Link></p> : <PilotItineraryProgress itineraries={(itineraryRows ?? []) as unknown as PilotItinerarySummary[]} hasActivePlan={hasActivePlan} />}
      {planActif && <section className="rounded-xl border border-sky-800/70 bg-slate-900 p-4 sm:p-5" aria-labelledby="active-plan-heading"><div className="flex flex-wrap items-center justify-between gap-3"><div><p className="text-xs uppercase tracking-wider text-sky-400">Vol suivi</p><h2 id="active-plan-heading" className="mt-1 font-mono text-xl font-semibold text-slate-100">{planActif.numero_vol} · {planActif.aeroport_depart} → {planActif.aeroport_arrivee}</h2></div><span className="rounded-lg border border-slate-600 px-3 py-1.5 text-sm text-slate-300">{STATUT_CONFIG[planActif.statut]?.label || planActif.statut}</span></div><p className="mt-3 text-sm text-slate-400">{planActif.type_vol} · durée prévue {planActif.temps_prev_min || '—'} min · {planActif.automonitoring ? 'Autosurveillance' : controleurIdentifiant ? `Contrôle : ${controleurIdentifiant}` : 'Prise en charge à confirmer'}</p><a href="#plans-operationnels" className="mt-3 inline-flex min-h-10 items-center gap-2 text-sm font-medium text-sky-300 hover:text-sky-200">Accéder aux actions du plan <ArrowRight aria-hidden className="h-4 w-4"/></a></section>}

      {/* Pause mission MEDEVAC : segment clôturé + segment suivant à activer */}
      {medevacPause && (
        <MedevacPauseBanner
          segmentClos={{
            id: medevacPause.segmentClos.id,
            numero_vol: medevacPause.segmentClos.numero_vol,
            aeroport_depart: medevacPause.segmentClos.aeroport_depart,
            aeroport_arrivee: medevacPause.segmentClos.aeroport_arrivee,
            type_vol: medevacPause.segmentClos.type_vol,
            temps_prev_min: medevacPause.segmentClos.temps_prev_min || 0,
            medevac_segment_index: medevacPause.segmentClos.medevac_segment_index ?? null,
            medevac_total_segments: medevacPause.segmentClos.medevac_total_segments ?? null,
            statut: medevacPause.segmentClos.statut,
          }}
          segmentSuivant={{
            id: medevacPause.segmentSuivant.id,
            numero_vol: medevacPause.segmentSuivant.numero_vol,
            aeroport_depart: medevacPause.segmentSuivant.aeroport_depart,
            aeroport_arrivee: medevacPause.segmentSuivant.aeroport_arrivee,
            type_vol: medevacPause.segmentSuivant.type_vol,
            temps_prev_min: medevacPause.segmentSuivant.temps_prev_min || 0,
            medevac_segment_index: medevacPause.segmentSuivant.medevac_segment_index ?? null,
            medevac_total_segments: medevacPause.segmentSuivant.medevac_total_segments ?? null,
            statut: medevacPause.segmentSuivant.statut,
          }}
        />
      )}

      {/* Panel Services au Sol - Vol actif */}
      {planActif && (
        <ServicesAuSolPanel
          planVolId={planActif.id}
          aeroportDepart={planActif.aeroport_depart}
          aeroportArrivee={planActif.aeroport_arrivee}
          statut={planActif.statut}
          porteDepart={(planActif as unknown as { porte?: string | null }).porte ?? null}
          paxCount={(planActif as unknown as { nb_pax_genere?: number | null }).nb_pax_genere ?? null}
        />
      )}

      {/* Interface Transpondeur - Vol actif */}
      {planActif && (
        <TranspondeurInterface
          planId={planActif.id}
          numeroVol={planActif.numero_vol}
          aeroportDepart={planActif.aeroport_depart}
          aeroportArrivee={planActif.aeroport_arrivee}
          codeTranspondeur={planActif.code_transpondeur ?? null}
          modeTranspondeur={planActif.mode_transpondeur || 'C'}
          acceptedAt={planActif.accepted_at ?? null}
          statut={planActif.statut}
          controleurIdentifiant={controleurIdentifiant}
          controleurPosition={planActif.current_holder_position ?? null}
          controleurAeroport={planActif.current_holder_aeroport ?? null}
          automonitoring={planActif.automonitoring || false}
          hasModeSAvion={hasModeSAvion}
        />
      )}

      {/* Alertes */}
      {plansNonClotures.length > 0 && !hasActivePlan && (
        <div className="relative overflow-hidden rounded-xl border-2 border-amber-500/40 bg-gradient-to-r from-amber-500/10 to-amber-600/5 p-5">
          <div className="absolute top-0 right-0 w-24 h-24 bg-amber-500/10 rounded-full -translate-y-1/2 translate-x-1/2"></div>
          <div className="relative flex items-start gap-4">
            <div className="p-3 rounded-xl bg-amber-500/20 shrink-0">
              <Bell className="h-6 w-6 text-amber-400" />
            </div>
            <div>
              <p className="font-semibold text-amber-200">
                {plansNonClotures.length} plan{plansNonClotures.length > 1 ? 's' : ''} de vol non clôturé{plansNonClotures.length > 1 ? 's' : ''}
              </p>
              <p className="text-sm text-slate-400 mt-1">
                Pensez à clôturer vos plans une fois le vol terminé pour finaliser l&apos;enregistrement.
              </p>
            </div>
          </div>
        </div>
      )}

      {plansRefuses.length > 0 && (
        <div className="relative overflow-hidden rounded-xl border-2 border-red-500/40 bg-gradient-to-r from-red-500/10 to-red-600/5 p-5">
          <div className="absolute top-0 right-0 w-24 h-24 bg-red-500/10 rounded-full -translate-y-1/2 translate-x-1/2"></div>
          <div className="relative flex items-start gap-4">
            <div className="p-3 rounded-xl bg-red-500/20 shrink-0">
              <AlertCircle className="h-6 w-6 text-red-400" />
            </div>
            <div>
              <p className="font-semibold text-red-200">Attention — {plansRefuses.length} plan(s) de vol refusé(s) par l&apos;ATC</p>
              <p className="text-sm text-slate-400 mt-1">Modifiez les éléments indiqués et renvoyez votre plan pour une nouvelle instruction.</p>
            </div>
          </div>
        </div>
      )}

      {/* Liste des plans */}
      <section id="plans-operationnels" aria-labelledby="plans-operationnels-title" className="scroll-mt-28 rounded-xl border border-slate-700/70 bg-slate-900/70 overflow-hidden">
        <div className="px-6 py-4 border-b border-slate-700/50 bg-slate-800/50">
          <h2 id="plans-operationnels-title" className="text-lg font-semibold text-slate-100 flex items-center gap-2">
            <FileText className="h-5 w-5 text-indigo-400" />
            Plans en préparation et en exploitation
            <span className="text-sm font-normal text-slate-500">({plans.length})</span>
          </h2>
        </div>
        
        {!plans || plans.length === 0 ? (
          <div className="p-12 text-center">
            <FileText className="h-12 w-12 text-slate-600 mx-auto mb-4" />
            <p className="text-slate-400 font-medium">Aucun plan de vol actif</p>
            <p className="text-slate-500 text-sm mt-1">Déposez un nouveau plan pour commencer</p>
            <Link href="/logbook/depot-plan-vol" className="inline-flex items-center gap-2 mt-4 px-4 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-medium transition-colors">
              <Plus className="h-4 w-4" />
              Nouveau plan
            </Link>
          </div>
        ) : (
          <div className="divide-y divide-slate-700/30">
            {plans.map((p) => {
              const config = STATUT_CONFIG[p.statut] || { label: p.statut, color: 'text-slate-300', bgColor: 'bg-slate-500/20' };
              return (
                <div key={p.id} className="p-4 hover:bg-slate-800/30 transition-colors">
                  <div className="flex flex-wrap items-center justify-between gap-4">
                    <div className="flex items-center gap-4">
                      <div className="hidden sm:block">
                        <div className="p-3 rounded-xl bg-slate-800/50 border border-slate-700/50">
                          <Plane className="h-5 w-5 text-indigo-400" />
                        </div>
                      </div>
                      <div>
                        <div className="flex items-center gap-3 mb-1 flex-wrap">
                          <span className="font-bold text-slate-100 font-mono">{p.numero_vol}</span>
                          <span className={`px-2.5 py-0.5 rounded-full text-xs font-medium ${config.bgColor} ${config.color}`}>
                            {config.label}
                          </span>
                          {p.armee_mission_id ? (
                            <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold uppercase tracking-wide border border-red-500/40 bg-red-500/10 text-red-300">
                              Mission&nbsp;: {ARME_MISSIONS.find((m) => m.id === p.armee_mission_id)?.titre || p.armee_mission_id}
                            </span>
                          ) : null}
                          {p.copilote_id && (
                            <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold uppercase tracking-wide border border-sky-500/40 bg-sky-500/10 text-sky-300">
                              {p.copilote_id === user.id
                                ? 'Vous êtes copilote'
                                : `Copilote : ${(Array.isArray(p.copilote) ? p.copilote[0] : p.copilote)?.identifiant || '—'}`}
                            </span>
                          )}
                        </div>
                        <div className="flex items-center gap-2 text-sm">
                          <span className="font-mono text-xs px-1.5 py-0.5 rounded bg-sky-500/20 text-sky-400">{p.aeroport_depart}</span>
                          <ArrowRight className="h-3 w-3 text-slate-600" />
                          <span className="font-mono text-xs px-1.5 py-0.5 rounded bg-emerald-500/20 text-emerald-400">{p.aeroport_arrivee}</span>
                          <span className="text-slate-500 ml-2">• {p.type_vol}</span>
                          <span className="text-slate-500">• {p.temps_prev_min} min</span>
                        </div>
                        {p.statut === 'refuse' && (p as { refusal_reason?: string }).refusal_reason && (
                          <p className="text-xs text-red-400/80 mt-2 bg-red-500/10 px-2 py-1 rounded">
                            {(p as { refusal_reason?: string }).refusal_reason}
                          </p>
                        )}
                      </div>
                    </div>
                    <div className="flex flex-wrap items-center gap-3">
                      <span className="text-xs text-slate-500">
                        {formatDateHourUTC(p.created_at)} UTC
                      </span>
                      {p.statut === 'refuse' ? (
                        <div className="flex flex-wrap items-center gap-3">
                          <Link
                            href={`/logbook/plans-vol/${p.id}/modifier`}
                            className="px-3 py-1.5 rounded-lg bg-red-600 hover:bg-red-700 text-white text-sm font-medium transition-colors"
                          >
                            Modifier
                          </Link>
                          <PlanVolAnnulerButton planId={p.id} statut={p.statut} />
                        </div>
                      ) : (
                        <div className="flex flex-wrap items-center gap-3">
                          <PlanVolCopiloteActions planId={p.id} statut={p.statut} isCopilote={p.copilote_id === user.id} />
                          {p.pilote_id === user.id && ['accepte', 'en_cours', 'automonitoring'].includes(p.statut) && !p.deroutement_at && <DerouterButton planId={p.id} destination={p.aeroport_arrivee} />}
                          {p.deroutement_at && <span className="text-orange-300 text-xs">Dérouté vers {p.aeroport_arrivee}</span>}
                          <PlanVolCloturerButton planId={p.id} statut={p.statut} isMedevac={!!p.siavi_avion_id} automonitoring={!!p.automonitoring} />
                          <PlanVolAnnulerButton planId={p.id} statut={p.statut} />
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </section>

      <p className="text-slate-400 text-sm leading-relaxed">
        Lorsque le plan est en autosurveillance ou ne dépend d’aucun contrôleur, la clôture est immédiate. Sinon, l&apos;ATC qui détient le plan doit confirmer la clôture.
      </p>

      {closedPlansError && <p role="alert" className="rounded-lg border border-amber-700/60 bg-slate-900 p-4 text-sm text-amber-200">Les plans clôturés à enregistrer n’ont pas pu être chargés. <Link href="/logbook/plans-vol" className="underline">Réessayer</Link></p>}
      {/* ── Plans clôturés à enregistrer ── */}
      {plansClotures && plansClotures.length > 0 && (
        <div className="rounded-xl border border-emerald-500/25 bg-emerald-500/5 overflow-hidden">
          <div className="px-6 py-4 border-b border-emerald-500/20 bg-emerald-500/10 flex items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <CheckCircle2 className="h-5 w-5 text-emerald-400" />
              <h2 className="text-base font-semibold text-emerald-200">
                Plans clôturés à enregistrer
              </h2>
              <span className="text-xs font-medium text-emerald-400/70 bg-emerald-500/15 px-2 py-0.5 rounded-full">
                {plansClotures.length}
              </span>
            </div>
            <p className="text-xs text-emerald-400/60 hidden sm:block">
              Ces vols restent ici jusqu&apos;à ce que vous les enregistriez ou les supprimiez.
            </p>
          </div>
          <div className="divide-y divide-emerald-500/10">
            {plansClotures.map((p) => (
              <div key={p.id} className="px-6 py-4 flex flex-wrap items-center justify-between gap-4 hover:bg-emerald-500/5 transition-colors">
                <div className="flex items-center gap-4 min-w-0">
                  <div className="p-2.5 rounded-xl bg-emerald-500/15 shrink-0">
                    <CheckCircle2 className="h-4 w-4 text-emerald-400" />
                  </div>
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 flex-wrap mb-1">
                      <span className="font-bold text-slate-100 font-mono">{p.numero_vol}</span>
                      <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-emerald-500/20 text-emerald-300">Clôturé</span>
                    </div>
                    <div className="flex items-center gap-2 text-sm">
                      <span className="font-mono text-xs px-1.5 py-0.5 rounded bg-sky-500/20 text-sky-400">{p.aeroport_depart}</span>
                      <ArrowRight className="h-3 w-3 text-slate-600 shrink-0" />
                      <span className="font-mono text-xs px-1.5 py-0.5 rounded bg-emerald-500/20 text-emerald-400">{p.aeroport_arrivee}</span>
                      <span className="text-slate-500">• {p.type_vol}</span>
                      <span className="text-slate-500">• {p.temps_prev_min} min</span>
                    </div>
                  </div>
                </div>
                <div className="flex items-center gap-2 flex-wrap">
                  <Link href={`/logbook/depot-plan-vol?duplicate=${p.id}`} className="px-3 py-1.5 rounded-lg border border-sky-700 text-sky-200 text-sm">Reprendre cette route</Link>
                  <Link
                    href={`/logbook/nouveau?plan=${p.id}`}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-medium transition-colors"
                  >
                    <Plus className="h-3.5 w-3.5" />
                    Enregistrer le vol
                  </Link>
                  <NePasEnregistrerPlanButton planId={p.id} />
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
