import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { redirect } from 'next/navigation';
import Link from 'next/link';
import { formatDateHourUTC } from '@/lib/date-utils';
import { ArrowLeft, FileText, AlertCircle, Bell, Plane, Clock, CheckCircle2, XCircle, Timer, ArrowRight, Plus, Radio } from 'lucide-react';
import PlanVolCloturerButton from './PlanVolCloturerButton';
import PlanVolAnnulerButton from './PlanVolAnnulerButton';
import TranspondeurInterface from './TranspondeurInterface';
import type { PlanVol } from '@/lib/types';

const STATUT_CONFIG: Record<string, { label: string; color: string; bgColor: string }> = {
  depose: { label: 'Déposé', color: 'text-slate-300', bgColor: 'bg-slate-500/20' },
  en_attente: { label: 'En attente ATC', color: 'text-amber-400', bgColor: 'bg-amber-500/20' },
  accepte: { label: 'Accepté', color: 'text-emerald-400', bgColor: 'bg-emerald-500/20' },
  refuse: { label: 'Refusé', color: 'text-red-400', bgColor: 'bg-red-500/20' },
  en_cours: { label: 'En cours', color: 'text-sky-400', bgColor: 'bg-sky-500/20' },
  automonitoring: { label: 'Autosurveillance', color: 'text-purple-400', bgColor: 'bg-purple-500/20' },
  en_attente_cloture: { label: 'Clôture demandée', color: 'text-orange-400', bgColor: 'bg-orange-500/20' },
  cloture: { label: 'Clôturé', color: 'text-emerald-400', bgColor: 'bg-emerald-500/20' },
};

export default async function MesPlansVolPage() {
  const supabase = await createClient();
  const admin = createAdminClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login');
  const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).single();
  if (profile?.role === 'atc') redirect('/logbook');

  const { data: raw } = await supabase
    .from('plans_vol')
    .select('id, numero_vol, aeroport_depart, aeroport_arrivee, type_vol, statut, created_at, temps_prev_min, refusal_reason, code_transpondeur, mode_transpondeur, accepted_at, current_holder_user_id, current_holder_position, current_holder_aeroport, automonitoring')
    .eq('pilote_id', user.id)
    .order('created_at', { ascending: false });
  
  const plans = (raw || []).filter((p: { statut: string }) => !['cloture', 'annule'].includes(p.statut));
  const plansRefuses = plans.filter((p: { statut: string }) => p.statut === 'refuse');
  const plansNonClotures = plans.filter((p: { statut: string }) => p.statut !== 'refuse');
  const plansEnCours = plans.filter((p: { statut: string }) => ['en_cours', 'accepte', 'automonitoring', 'en_attente_cloture'].includes(p.statut));
  
  // Plan actif avec transpondeur (accepté, en cours, automonitoring ou en attente de clôture)
  const planActif = plans.find((p: { statut: string }) => ['accepte', 'en_cours', 'automonitoring', 'en_attente_cloture'].includes(p.statut)) as PlanVol | undefined;
  const hasActivePlan = !!planActif;

  // Récupérer l'identifiant du contrôleur en charge si plan actif
  let controleurIdentifiant: string | null = null;
  if (planActif?.current_holder_user_id) {
    const { data: controleurProfile } = await admin
      .from('profiles')
      .select('identifiant')
      .eq('id', planActif.current_holder_user_id)
      .single();
    controleurIdentifiant = controleurProfile?.identifiant || null;
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-indigo-600 via-indigo-700 to-purple-800 p-6 shadow-xl">
        <div className="absolute inset-0 bg-[url('data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iNjAiIGhlaWdodD0iNjAiIHZpZXdCb3g9IjAgMCA2MCA2MCIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj48ZyBmaWxsPSJub25lIiBmaWxsLXJ1bGU9ImV2ZW5vZGQiPjxnIGZpbGw9IiNmZmYiIGZpbGwtb3BhY2l0eT0iMC4wNSI+PHBhdGggZD0iTTM2IDM0djItSDI0di0yaDEyek0zNiAyNHYySDI0di0yaDEyeiIvPjwvZz48L2c+PC9zdmc+')] opacity-30"></div>
        <div className="relative flex flex-wrap items-start justify-between gap-4">
          <div className="flex items-center gap-4">
            <Link href="/logbook" className="p-2 rounded-xl bg-white/10 hover:bg-white/20 transition-colors">
              <ArrowLeft className="h-5 w-5 text-white" />
            </Link>
            <div>
              <div className="flex items-center gap-3 mb-1">
                <div className="p-2 rounded-xl bg-white/10 backdrop-blur">
                  <FileText className="h-6 w-6 text-white" />
                </div>
                <h1 className="text-2xl font-bold text-white">Mes plans de vol</h1>
              </div>
              <p className="text-indigo-100/80 text-sm">Gérez et suivez vos plans de vol</p>
            </div>
          </div>
          {hasActivePlan ? (
            <div className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-white/20 text-white/60 text-sm font-medium cursor-not-allowed">
              <Radio className="h-4 w-4" />
              Vol en cours
            </div>
          ) : (
            <Link 
              href="/logbook/depot-plan-vol" 
              className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-white hover:bg-indigo-50 text-indigo-700 text-sm font-bold transition-all shadow-lg"
            >
              <Plus className="h-4 w-4" />
              Nouveau plan de vol
            </Link>
          )}
        </div>
      </div>

      {/* Statistiques */}
      <div className="grid gap-4 sm:grid-cols-3">
        <div className="rounded-xl bg-gradient-to-br from-sky-500/10 to-sky-600/5 border border-sky-500/20 p-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sky-400/80 text-sm">En cours</p>
              <p className="text-2xl font-bold text-sky-400">{plansEnCours.length}</p>
            </div>
            <Plane className="h-8 w-8 text-sky-400/30" />
          </div>
        </div>
        <div className="rounded-xl bg-gradient-to-br from-amber-500/10 to-amber-600/5 border border-amber-500/20 p-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-amber-400/80 text-sm">Non clôturés</p>
              <p className="text-2xl font-bold text-amber-400">{plansNonClotures.length}</p>
            </div>
            <Timer className="h-8 w-8 text-amber-400/30" />
          </div>
        </div>
        <div className="rounded-xl bg-gradient-to-br from-red-500/10 to-red-600/5 border border-red-500/20 p-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-red-400/80 text-sm">Refusés</p>
              <p className="text-2xl font-bold text-red-400">{plansRefuses.length}</p>
            </div>
            <XCircle className="h-8 w-8 text-red-400/30" />
          </div>
        </div>
      </div>

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
      <div className="rounded-xl border border-slate-700/50 bg-slate-800/30 overflow-hidden">
        <div className="px-6 py-4 border-b border-slate-700/50 bg-slate-800/50">
          <h2 className="text-lg font-semibold text-slate-100 flex items-center gap-2">
            <FileText className="h-5 w-5 text-indigo-400" />
            Plans de vol actifs
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
                        <div className="flex items-center gap-3 mb-1">
                          <span className="font-bold text-slate-100 font-mono">{p.numero_vol}</span>
                          <span className={`px-2.5 py-0.5 rounded-full text-xs font-medium ${config.bgColor} ${config.color}`}>
                            {config.label}
                          </span>
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
                    <div className="flex items-center gap-3">
                      <span className="text-xs text-slate-500">
                        {formatDateHourUTC(p.created_at)} UTC
                      </span>
                      {p.statut === 'refuse' ? (
                        <div className="flex items-center gap-3">
                          <Link
                            href={`/logbook/plans-vol/${p.id}/modifier`}
                            className="px-3 py-1.5 rounded-lg bg-red-600 hover:bg-red-700 text-white text-sm font-medium transition-colors"
                          >
                            Modifier
                          </Link>
                          <PlanVolAnnulerButton planId={p.id} statut={p.statut} />
                        </div>
                      ) : (
                        <div className="flex items-center gap-3">
                          <PlanVolCloturerButton planId={p.id} statut={p.statut} />
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
      </div>

      <p className="text-slate-500 text-sm text-center">
        Si aucun ATC n&apos;a accepté le plan ou s&apos;il est en autosurveillance, la clôture est immédiate. Sinon, l&apos;ATC qui détient le plan doit confirmer la clôture.
      </p>
    </div>
  );
}
