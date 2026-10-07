'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { createClient } from '@/lib/supabase/client';
import {
  Plane, Bell, LayoutGrid, Users2, Wrench,
  CheckCircle2, AlertCircle, Trophy, X, Search,
} from 'lucide-react';
import EquipeTab from './EquipeTab';
import ModalAvion from './ModalAvion';
import GatesView from './GatesView';
import type { ServiceType } from '@/lib/types';
import GroundQueueSummary from '@/components/GroundQueueSummary';
import { PLAN_VOL_SOL_SELECT, mapPlanVolSol, type PlanVolSol, type PlanVolSolRow } from '@/lib/ground/plans-vol';

// ── Types exportés ────────────────────────────────────────────────────────────

export type PlanVol = PlanVolSol;

export type ServiceRequest = {
  id: string;
  plan_vol_id: string;
  service_type: ServiceType;
  statut: 'pending' | 'accepted' | 'in_progress' | 'completed' | 'rejected' | 'ground_crew_unavailable';
  accepted_by: string | null;
  direction: 'gauche' | 'droite' | null;
  pilote_confirme: boolean | null;
  pax_count: number | null;
  score_minijeu: number | null;
  aeroport: string;
  requested_at: string;
};

export type Gate = {
  id: string;
  gate_code: string;
  gate_type: string;
  max_aircraft_size: string | null;
  terminal: string | null;
  reserved_for: string | null;
  requires_separation: boolean;
  notes: string | null;
  display_order: number | null;
};

export type Profile = {
  id: string;
  identifiant: string;
  role: string;
};

// ── Constantes services ───────────────────────────────────────────────────────

const SERVICE_LABELS: Record<ServiceType, string> = {
  bagages:     'Chargement bagages',
  catering:    'Service catering',
  fuel:        'Ravitaillement carburant',
  boarding:    'Boarding passagers',
  repoussage:  'Repoussage',
  marshalling: 'Marshalling',
};

const SERVICE_COLORS: Record<ServiceType, string> = {
  bagages:     'border-amber-800/40 bg-amber-900/10',
  catering:    'border-emerald-800/40 bg-emerald-900/10',
  fuel:        'border-sky-800/40 bg-sky-900/10',
  boarding:    'border-purple-800/40 bg-purple-900/10',
  repoussage:  'border-orange-800/40 bg-orange-900/10',
  marshalling: 'border-red-800/40 bg-red-900/10',
};

// ── Props et onglets ──────────────────────────────────────────────────────────

interface Props {
  userId: string;
  sessionId: string;
  aeroport: string;
  sessionStartedAt: string;
  plansInitiaux: PlanVol[];
  demandesInitiales: ServiceRequest[];
  gatesInitiales: Gate[];
  profile: Profile | null;
  gcOnlineCount?: number;
  sessionGains?: number;
  sessionCompletedCount?: number;
}

const TABS = ['avions', 'demandes', 'equipe', 'portes'] as const;
type Tab = (typeof TABS)[number];

const TAB_LABELS: Record<Tab, string> = {
  avions:   'Avions',
  demandes: 'Demandes',
  equipe:   'Mon Équipe',
  portes:   'Portes',
};

const TAB_ICONS: Record<Tab, React.ReactNode> = {
  avions:   <Plane className="h-4 w-4" />,
  demandes: <Bell className="h-4 w-4" />,
  equipe:   <Users2 className="h-4 w-4" />,
  portes:   <LayoutGrid className="h-4 w-4" />,
};

// ── Composant principal ───────────────────────────────────────────────────────

export default function GroundDashboard({
  userId, sessionId, aeroport,
  plansInitiaux, demandesInitiales, gatesInitiales, profile,
  gcOnlineCount = 1,
  sessionGains = 0,
  sessionCompletedCount = 0,
}: Props) {
  const [plans, setPlans] = useState<PlanVol[]>(plansInitiaux);
  const [demandes, setDemandes] = useState<ServiceRequest[]>(demandesInitiales);
  const [selectedPlan, setSelectedPlan] = useState<PlanVol | null>(null);
  const [activeTab, setActiveTab] = useState<Tab>('avions');
  const [myTeamId, setMyTeamId] = useState<string | null>(null);
  const [gameToast, setGameToast] = useState<{ score: number; montant: number } | null>(null);
  const [liveGains, setLiveGains] = useState(sessionGains);
  const [liveCompleted, setLiveCompleted] = useState(sessionCompletedCount);

  const plansRef = useRef<PlanVol[]>(plansInitiaux);
  useEffect(() => { plansRef.current = plans; }, [plans]);

  // Fallback client-side via API service-role si le SSR n'a retourné aucun plan
  useEffect(() => {
    if (plansInitiaux.length > 0) return;
    fetch(`/api/ground/avions?aeroport=${encodeURIComponent(aeroport)}`)
      .then(r => r.json())
      .then(({ plans: fetchedPlans }: { plans: PlanVol[] }) => {
        if (fetchedPlans?.length > 0) setPlans(fetchedPlans);
      })
      .catch(console.error);
  }, [aeroport, plansInitiaux.length]);

  const gcIdentifiant = profile?.identifiant ?? 'GC';

  const fetchPlanIfMissing = useCallback(async (planVolId: string) => {
    if (plansRef.current.find(p => p.id === planVolId)) return;
    const supabase = createClient();
    const { data } = await supabase
      .from('plans_vol')
      .select(PLAN_VOL_SOL_SELECT)
      .eq('id', planVolId)
      .single();
    if (data) {
      const plan = mapPlanVolSol(data as unknown as PlanVolSolRow);
      setPlans(prev => {
        if (prev.find(p => p.id === planVolId)) return prev;
        return [...prev, plan];
      });
    }
  }, []);

  useEffect(() => {
    const supabase = createClient();
    const channel = supabase
      .channel('ground_demandes_' + sessionId)
      .on('postgres_changes', {
        event: '*',
        schema: 'public',
        table: 'ground_service_requests',
        filter: `aeroport=eq.${aeroport}`,
      }, (payload) => {
        const row = payload.new as ServiceRequest;
        if (payload.eventType === 'INSERT') {
          setDemandes(prev => {
            if (prev.find(d => d.id === row.id)) return prev;
            return [...prev, row];
          });
          void fetchPlanIfMissing(row.plan_vol_id);
        }
        if (payload.eventType === 'UPDATE') {
          setDemandes(prev => prev.some(d => d.id === row.id)
            ? prev.map(d => d.id === row.id ? row : d)
            : [...prev, row]);
          void fetchPlanIfMissing(row.plan_vol_id);
        }
        if (payload.eventType === 'DELETE') {
          const deleted = payload.old as { id?: string };
          setDemandes(prev => prev.filter(d => d.id !== deleted.id));
        }
      })
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [sessionId, aeroport, fetchPlanIfMissing]);

  useEffect(() => {
    const supabase = createClient();
    let refreshTimer: ReturnType<typeof setTimeout> | undefined;
    let refreshController: AbortController | undefined;
    let disposed = false;
    const refreshPlans = () => {
      if (refreshTimer) clearTimeout(refreshTimer);
      refreshTimer = setTimeout(() => {
        refreshController?.abort();
        const controller = new AbortController();
        refreshController = controller;
        fetch(`/api/ground/avions?aeroport=${encodeURIComponent(aeroport)}`, { signal: controller.signal })
          .then(r => { if (!r.ok) throw new Error('Chargement indisponible'); return r.json(); })
          .then(({ plans: fetched }: { plans: PlanVol[] }) => {
            if (!disposed && !controller.signal.aborted && Array.isArray(fetched)) {
              plansRef.current = fetched;
              setPlans(fetched);
              setSelectedPlan(previous => previous ? fetched.find(p => p.id === previous.id) ?? null : null);
            }
          })
          .catch(() => {});
      }, 300);
    };
    const channel = supabase
      .channel('ground_plans_' + sessionId)
      .on('postgres_changes', {
        event: '*',
        schema: 'public',
        table: 'plans_vol',
      }, (payload) => {
        const row = (payload.eventType === 'DELETE' ? payload.old : payload.new) as { aeroport_depart?: string; aeroport_arrivee?: string } | null;
        const dep = String(row?.aeroport_depart || '').toUpperCase();
        const arr = String(row?.aeroport_arrivee || '').toUpperCase();
        const id = (payload.eventType === 'DELETE' ? payload.old : payload.new)?.id;
        if (dep !== aeroport && arr !== aeroport && !plansRef.current.some(p => p.id === id)) return;
        refreshPlans();
      })
      .subscribe();
    return () => {
      disposed = true;
      refreshController?.abort();
      if (refreshTimer) clearTimeout(refreshTimer);
      supabase.removeChannel(channel);
    };
  }, [sessionId, aeroport]);

  const activePlanIds = new Set(plans.map(p => p.id));
  const pendingCount = demandes.filter(d => d.statut === 'pending' && activePlanIds.has(d.plan_vol_id)).length;

  const handleServiceComplete = useCallback((score: number, serviceType: ServiceType, paxCount: number | null) => {
    const bases: Record<ServiceType, number> = {
      bagages: 2000, catering: 1500, fuel: 1800, boarding: 100,
      repoussage: 2500, marshalling: 1200,
    };
    const base = serviceType === 'boarding'
      ? bases.boarding * (paxCount ?? 1)
      : bases[serviceType];
    const montant = Math.round(base * (0.5 + Math.max(0, Math.min(1, score)) * 0.5));
    setGameToast({ score, montant });
    setLiveGains((n) => n + montant);
    setLiveCompleted((n) => n + 1);
    setTimeout(() => setGameToast(null), 6000);
  }, []);

  return (
    <div className="space-y-4">
      <GroundQueueSummary aeroport={aeroport} gateQueue={Object.entries(demandes.filter(d=>d.statut==='pending').reduce<Record<string,number>>((counts,d)=>{const gate=plans.find(p=>p.id===d.plan_vol_id)?.porte || 'Porte non renseignée';counts[gate]=(counts[gate]??0)+1;return counts;},{})).map(([gate,pending])=>({gate,pending}))} />
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-3">
          <div className="p-2.5 rounded-xl bg-emerald-900/30 border border-emerald-800/40">
            <Wrench className="h-5 w-5 text-emerald-400" />
          </div>
          <div>
            <h1 className="text-xl font-bold text-slate-100">Ground Crew — {aeroport}</h1>
            <p className="text-slate-400 text-sm">{plans.length} vol(s) actif(s)</p>
            <p className="text-emerald-300 text-xs font-semibold mt-0.5">
              {gcOnlineCount} GC en ligne à {aeroport}
            </p>
          </div>
        </div>
        {pendingCount > 0 && (
          <div className="flex items-center gap-2 px-3 py-1.5 rounded-xl bg-red-900/30 border border-red-700/50 text-red-300 text-sm font-semibold animate-pulse">
            <AlertCircle className="h-4 w-4" />
            {pendingCount} demande(s) en attente
          </div>
        )}
      </div>

      {(liveCompleted > 0 || liveGains > 0) && (
        <div className="rounded-xl border border-amber-800 bg-slate-900 px-4 py-3 text-sm text-slate-200">
          Session : <span className="font-bold text-amber-300">{liveCompleted}</span> service(s) payé(s)
          {' · '}
          Gains estimés : <span className="font-bold text-emerald-300">{liveGains.toLocaleString('fr-FR')} F$</span>
          <span className="text-slate-400"> (chèques à encaisser en messagerie)</span>
        </div>
      )}

      {/* Onglets */}
      <div className="flex gap-1 rounded-xl border border-slate-700 bg-slate-900 p-1">
        {TABS.map(tab => (
          <button
            key={tab}
            type="button"
            aria-label={TAB_LABELS[tab]}
            aria-pressed={activeTab === tab}
            onClick={() => setActiveTab(tab)}
            className={`flex-1 flex items-center justify-center gap-1.5 rounded-lg px-2 py-2 text-xs sm:text-sm font-semibold transition-colors relative ${
              activeTab === tab
                ? 'bg-emerald-600 text-white'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            {TAB_ICONS[tab]}
            <span>{TAB_LABELS[tab]}</span>
            {tab === 'demandes' && pendingCount > 0 && (
              <span className="absolute -top-1 -right-1 flex h-4 w-4 items-center justify-center rounded-full bg-red-500 text-[9px] font-bold text-white">
                {pendingCount}
              </span>
            )}
          </button>
        ))}
      </div>

      {/* Contenu */}
      {activeTab === 'avions' && (
        <AvionsTab
          plans={plans}
          demandes={demandes}
          aeroport={aeroport}
          onSelectPlan={setSelectedPlan}
        />
      )}
      {activeTab === 'demandes' && (
        <DemandesTab
          demandes={demandes}
          plans={plans}
          onOpenModal={setSelectedPlan}
        />
      )}
      {activeTab === 'equipe' && (
        <EquipeTab
          userId={userId}
          aeroport={aeroport}
          myTeamId={myTeamId}
          onTeamChange={setMyTeamId}
        />
      )}
      {activeTab === 'portes' && (
        <GatesView gates={gatesInitiales} aeroport={aeroport} />
      )}

      {/* Modal Avion */}
      {selectedPlan && (
        <ModalAvion
          plan={selectedPlan}
          requests={demandes.filter(d => d.plan_vol_id === selectedPlan.id)}
          userId={userId}
          gcIdentifiant={gcIdentifiant}
          onClose={() => setSelectedPlan(null)}
          onUpdateRequest={updated =>
            setDemandes(prev => prev.map(d => d.id === updated.id ? updated : d))
          }
          onServiceComplete={handleServiceComplete}
        />
      )}

      {/* Toast mini-jeu */}
      {gameToast && (
        <div className="fixed bottom-6 right-6 z-50 flex items-center gap-3 rounded-2xl border border-emerald-700/50 bg-slate-900 px-5 py-4 shadow-2xl">
          <Trophy className="h-6 w-6 text-emerald-400 shrink-0" />
          <div>
            <p className="font-bold text-slate-100 text-sm">Service complété !</p>
            <p className="text-slate-400 text-xs mt-0.5">
              Score : <span className="text-emerald-300 font-semibold">{Math.round(gameToast.score * 100)}%</span>
              {' · '}Gain : <span className="text-amber-300 font-semibold">{gameToast.montant.toLocaleString()} F$</span>
            </p>
          </div>
          <button
            type="button"
            onClick={() => setGameToast(null)}
            className="ml-2 text-slate-500 hover:text-slate-300"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      )}
    </div>
  );
}

// ── Onglet Avions ─────────────────────────────────────────────────────────────

function AvionsTab({
  plans, demandes, aeroport, onSelectPlan,
}: {
  plans: PlanVol[];
  demandes: ServiceRequest[];
  aeroport: string;
  onSelectPlan: (plan: PlanVol) => void;
}) {
  const [search, setSearch] = useState('');
  const [direction, setDirection] = useState<'tous' | 'depart' | 'arrivee'>('tous');
  const norm = (s: string) => s.trim().toUpperCase();
  const aeroportNorm = norm(aeroport);

  const allPlans = [
    ...plans
      .filter(p => norm(p.aeroport_depart) === aeroportNorm)
      .map(p => ({ ...p, dirType: 'depart' as const })),
    ...plans
      .filter(p => norm(p.aeroport_arrivee) === aeroportNorm && norm(p.aeroport_depart) !== aeroportNorm)
      .map(p => ({ ...p, dirType: 'arrivee' as const })),
  ];
  const pendingByPlan = new Map<string, number>();
  for (const request of demandes) {
    if (request.statut === 'pending') pendingByPlan.set(request.plan_vol_id, (pendingByPlan.get(request.plan_vol_id) ?? 0) + 1);
  }
  const visiblePlans = allPlans
    .filter(plan => (direction === 'tous' || plan.dirType === direction) && norm([plan.callsign, plan.immatriculation, plan.porte, plan.aeroport_depart, plan.aeroport_arrivee].join(' ')).includes(norm(search)))
    .sort((a, b) => (pendingByPlan.get(b.id) ?? 0) - (pendingByPlan.get(a.id) ?? 0));

  if (allPlans.length === 0) {
    return (
      <div className="rounded-xl border border-slate-700/40 bg-slate-800/20 p-12 text-center">
        <Plane className="h-10 w-10 text-slate-600 mx-auto mb-3" />
        <p className="text-slate-400">Aucun avion actif sur cet aéroport</p>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      <div className="flex flex-col sm:flex-row gap-2">
        <label className="flex flex-1 items-center gap-2 rounded-xl border border-slate-700 bg-slate-900 px-3">
          <Search className="h-4 w-4 text-slate-400" aria-hidden="true" />
          <input aria-label="Rechercher un avion" value={search} onChange={e => setSearch(e.target.value)} placeholder="Vol, immatriculation ou porte…" className="w-full bg-transparent py-3 text-sm text-slate-100 outline-none" />
        </label>
        <select aria-label="Filtrer les mouvements" value={direction} onChange={e => setDirection(e.target.value as typeof direction)} className="rounded-xl border border-slate-700 bg-slate-900 px-3 py-3 text-sm text-slate-200">
          <option value="tous">Tous les mouvements</option>
          <option value="depart">Départs</option>
          <option value="arrivee">Arrivées</option>
        </select>
      </div>
      <p className="text-xs text-slate-400" role="status">{visiblePlans.length} avion(s) affiché(s) sur {allPlans.length}</p>
      {visiblePlans.length === 0 && <p className="rounded-xl border border-slate-700 p-6 text-center text-sm text-slate-400">Aucun avion ne correspond. Modifiez votre recherche ou le filtre.</p>}
      {visiblePlans.map(plan => {
        const planDemandes = demandes.filter(d => d.plan_vol_id === plan.id);
        const pendingCount = planDemandes.filter(d => d.statut === 'pending').length;
        const hasMarshallingAlert = planDemandes.some(
          d => d.service_type === 'marshalling' && d.statut === 'pending'
        );
        const hasRepoussageAlert = planDemandes.some(
          d => d.service_type === 'repoussage' && d.statut === 'pending'
        );

        const borderClass = hasMarshallingAlert
          ? 'border-red-600/60 animate-pulse'
          : hasRepoussageAlert
          ? 'border-orange-600/60 animate-pulse'
          : plan.dirType === 'depart'
          ? 'border-emerald-800/20'
          : 'border-sky-800/20';

        return (
          <button
            key={plan.id}
            type="button"
            onClick={() => onSelectPlan(plan)}
            className={`w-full rounded-xl border ${borderClass} bg-slate-800/30 p-4 text-left transition-all hover:bg-slate-800/50 hover:border-slate-600/60`}
          >
            <div className="flex items-center justify-between flex-wrap gap-3">
              <div className="flex items-center gap-3">
                <div className={`p-2 rounded-xl ${
                  hasMarshallingAlert ? 'bg-red-900/40'
                  : hasRepoussageAlert ? 'bg-orange-900/30'
                  : 'bg-slate-700/40'
                }`}>
                  <Plane className={`h-4 w-4 ${
                    hasMarshallingAlert ? 'text-red-400'
                    : hasRepoussageAlert ? 'text-orange-400'
                    : plan.dirType === 'depart' ? 'text-emerald-400'
                    : 'text-sky-400'
                  }`} />
                </div>
                <div>
                  <div className="text-2xl font-bold text-white tracking-wider">
                    {plan.callsign || plan.immatriculation || '—'}
                  </div>
                  {plan.callsign && plan.immatriculation && (
                    <div className="text-sm text-slate-400">{plan.immatriculation}</div>
                  )}
                  <div className="flex items-center gap-2 flex-wrap mt-1">
                    <span className={`text-xs px-2 py-0.5 rounded-full border ${
                      plan.dirType === 'depart'
                        ? 'text-emerald-400 border-emerald-800/40'
                        : 'text-sky-400 border-sky-800/40'
                    }`}>
                      {plan.dirType === 'depart' ? 'Départ' : 'Arrivée'}
                    </span>
                    {hasMarshallingAlert && (
                      <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-red-900/40 text-red-300 border border-red-700/50 animate-pulse">
                        MARSHALLING
                      </span>
                    )}
                    {hasRepoussageAlert && (
                      <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-orange-900/40 text-orange-300 border border-orange-700/50 animate-pulse">
                        PUSHBACK
                      </span>
                    )}
                    {pendingCount > 0 && (
                      <span className="flex h-5 w-5 items-center justify-center rounded-full bg-red-500 text-[9px] font-bold text-white">
                        {pendingCount}
                      </span>
                    )}
                  </div>
                  <p className="text-xs text-slate-400 mt-0.5">
                    {plan.aeroport_depart} → {plan.aeroport_arrivee}
                  </p>
                </div>
              </div>
              {plan.porte && (
                <span className="px-2 py-1 rounded-lg bg-emerald-900/30 text-emerald-300 border border-emerald-800/30 text-xs font-semibold">
                  Porte {plan.porte}
                </span>
              )}
            </div>
          </button>
        );
      })}
    </div>
  );
}

// ── Onglet Demandes ───────────────────────────────────────────────────────────

function DemandesTab({
  demandes, plans, onOpenModal,
}: {
  demandes: ServiceRequest[];
  plans: PlanVol[];
  onOpenModal: (plan: PlanVol) => void;
}) {
  const active = demandes.filter(d => ['pending', 'accepted', 'in_progress'].includes(d.statut) && plans.some(p => p.id === d.plan_vol_id))
    .sort((a, b) => Number(b.statut === 'pending') - Number(a.statut === 'pending') || Date.parse(a.requested_at) - Date.parse(b.requested_at));

  if (active.length === 0) {
    return (
      <div className="rounded-xl border border-slate-700/40 bg-slate-800/20 p-12 text-center">
        <CheckCircle2 className="h-10 w-10 text-slate-600 mx-auto mb-3" />
        <p className="text-slate-400">Aucune demande à traiter</p>
        <p className="text-slate-500 text-sm mt-1">Les nouvelles demandes apparaissent en temps réel</p>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {active.map(req => {
        const plan = plans.find(p => p.id === req.plan_vol_id);
        const colorClass = SERVICE_COLORS[req.service_type] ?? 'border-slate-700/40';
        return (
          <div key={req.id} className={`rounded-xl border p-4 ${colorClass}`}>
            <div className="flex items-center justify-between flex-wrap gap-3">
              <div>
                <div className="flex items-center gap-2">
                  <span className="font-semibold text-sm text-slate-200">
                    {SERVICE_LABELS[req.service_type]}
                  </span>
                  <span className={`px-2 py-0.5 rounded-full text-[10px] font-semibold ${
                    req.statut === 'pending' ? 'bg-amber-500/20 text-amber-300' : req.statut === 'accepted'
                      ? 'bg-sky-500/20 text-sky-300'
                      : 'bg-purple-500/20 text-purple-300'
                  }`}>
                    {req.statut === 'pending' ? 'À prendre en charge' : req.statut === 'accepted' ? 'Pris en charge' : 'En cours'}
                  </span>
                </div>
                {plan && (
                  <p className="text-xs text-slate-400 mt-0.5">
                    {plan.callsign || plan.immatriculation} · {plan.aeroport_depart} → {plan.aeroport_arrivee}
                  </p>
                )}
              </div>
              {plan && (
                <button
                  type="button"
                  onClick={() => onOpenModal(plan)}
                  className="text-xs px-3 py-1.5 rounded-lg border border-slate-600/50 text-slate-300 hover:text-slate-100 hover:border-slate-500/50 transition-colors"
                >
                  Ouvrir les services →
                </button>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}

