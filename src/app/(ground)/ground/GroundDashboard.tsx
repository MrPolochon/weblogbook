'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { createClient } from '@/lib/supabase/client';
import {
  Plane, Bell, LayoutGrid, Users2, Wrench,
  CheckCircle2, AlertCircle, Trophy, X,
} from 'lucide-react';
import EquipeTab from './EquipeTab';
import ModalAvion from './ModalAvion';
import type { ServiceType } from '@/lib/types';

// ── Types exportés ────────────────────────────────────────────────────────────

export type PlanVol = {
  id: string;
  callsign: string | null;
  immatriculation: string | null;
  porte: string | null;
  statut: string;
  aeroport_depart: string;
  aeroport_arrivee: string;
  type_avion: string | null;
  pilote_id: string;
  created_at: string;
};

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
}: Props) {
  const [plans, setPlans] = useState<PlanVol[]>(plansInitiaux);
  const [demandes, setDemandes] = useState<ServiceRequest[]>(demandesInitiales);
  const [selectedPlan, setSelectedPlan] = useState<PlanVol | null>(null);
  const [activeTab, setActiveTab] = useState<Tab>('avions');
  const [myTeamId, setMyTeamId] = useState<string | null>(null);
  const [gameToast, setGameToast] = useState<{ score: number; montant: number } | null>(null);

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
      .select('id, callsign, immatriculation, porte, statut, aeroport_depart, aeroport_arrivee, type_avion, pilote_id, created_at')
      .eq('id', planVolId)
      .single();
    if (data) {
      setPlans(prev => {
        if (prev.find(p => p.id === planVolId)) return prev;
        return [...prev, data as PlanVol];
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
          setDemandes(prev => prev.map(d => d.id === row.id ? row : d));
          // Mettre à jour le plan sélectionné si besoin
          setSelectedPlan(prev => prev?.id === row.plan_vol_id ? prev : prev);
        }
      })
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [sessionId, aeroport, fetchPlanIfMissing]);

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
    setTimeout(() => setGameToast(null), 6000);
  }, []);

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-3">
          <div className="p-2.5 rounded-xl bg-emerald-900/30 border border-emerald-800/40">
            <Wrench className="h-5 w-5 text-emerald-400" />
          </div>
          <div>
            <h1 className="text-xl font-bold text-slate-100">Ground Crew — {aeroport}</h1>
            <p className="text-slate-400 text-sm">{plans.length} vol(s) actif(s)</p>
          </div>
        </div>
        {pendingCount > 0 && (
          <div className="flex items-center gap-2 px-3 py-1.5 rounded-xl bg-red-900/30 border border-red-700/50 text-red-300 text-sm font-semibold animate-pulse">
            <AlertCircle className="h-4 w-4" />
            {pendingCount} demande(s) en attente
          </div>
        )}
      </div>

      {/* Onglets */}
      <div className="flex gap-1 rounded-xl border border-slate-700/40 bg-slate-800/30 p-1">
        {TABS.map(tab => (
          <button
            key={tab}
            type="button"
            onClick={() => setActiveTab(tab)}
            className={`flex-1 flex items-center justify-center gap-1.5 rounded-lg px-2 py-2 text-xs sm:text-sm font-semibold transition-colors relative ${
              activeTab === tab
                ? 'bg-emerald-600 text-white'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            {TAB_ICONS[tab]}
            <span className="hidden sm:inline">{TAB_LABELS[tab]}</span>
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
        <PortesTab gates={gatesInitiales} plans={plans} aeroport={aeroport} />
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
      {allPlans.map(plan => {
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
  const active = demandes.filter(d => ['accepted', 'in_progress'].includes(d.statut));

  if (active.length === 0) {
    return (
      <div className="rounded-xl border border-slate-700/40 bg-slate-800/20 p-12 text-center">
        <CheckCircle2 className="h-10 w-10 text-slate-600 mx-auto mb-3" />
        <p className="text-slate-400">Aucune demande en cours</p>
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
                    req.statut === 'accepted'
                      ? 'bg-sky-500/20 text-sky-300'
                      : 'bg-purple-500/20 text-purple-300'
                  }`}>
                    {req.statut === 'accepted' ? 'Pris en charge' : 'En cours'}
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
                  Voir le plan →
                </button>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ── Onglet Portes ─────────────────────────────────────────────────────────────

function PortesTab({
  gates, plans, aeroport,
}: {
  gates: Gate[];
  plans: PlanVol[];
  aeroport: string;
}) {
  if (gates.length === 0) {
    return (
      <div className="rounded-xl border border-slate-700/40 bg-slate-800/20 p-12 text-center">
        <LayoutGrid className="h-10 w-10 text-slate-600 mx-auto mb-3" />
        <p className="text-slate-400">Aucune porte configurée pour cet aéroport</p>
      </div>
    );
  }

  const activePlans = plans.filter(
    p => p.aeroport_depart === aeroport || p.aeroport_arrivee === aeroport
  );

  const normalizeGate = (s: string) =>
    s.trim().toLowerCase().replace(/\s+/g, ' ');

  const matchesGate = (planPorte: string | null | undefined, gateCode: string) => {
    if (!planPorte || !gateCode) return false;
    const pNorm = normalizeGate(planPorte);
    const gNorm = normalizeGate(gateCode);
    return pNorm === gNorm || pNorm === gNorm.replace(/^(gate|parking)\s+/i, '');
  };

  const hasPorteData = activePlans.some(p => p.porte != null && p.porte.trim() !== '');

  const libreCount = gates.filter(
    g => !activePlans.find(p => matchesGate(p.porte, g.gate_code))
  ).length;
  const terminals = Array.from(new Set(gates.map(g => g.terminal ?? 'Hors terminal')));

  return (
    <div className="space-y-4">
      <p className="text-sm text-slate-400">
        {gates.length} porte(s) — {libreCount} disponible(s)
      </p>
      {activePlans.length > 0 && !hasPorteData && (
        <div className="rounded-xl border border-amber-800/40 bg-amber-950/20 px-4 py-3 text-amber-300 text-sm flex items-center gap-2">
          <span>⚠</span>
          <span>Données de porte non disponibles — migration SQL requise.</span>
        </div>
      )}
      {terminals.map(terminal => {
        const terminalGates = gates.filter(g => (g.terminal ?? 'Hors terminal') === terminal);
        return (
          <div key={terminal} className="rounded-xl border border-slate-700/40 bg-slate-800/20 overflow-hidden">
            <div className="px-4 py-2.5 bg-slate-800/40 border-b border-slate-700/40">
              <h3 className="text-sm font-semibold text-slate-200">{terminal}</h3>
            </div>
            <div className="p-3 grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-2">
              {terminalGates.map(gate => {
                const occupant = activePlans.find(p => matchesGate(p.porte, gate.gate_code));
                const isOccupied = !!occupant;
                return (
                  <div
                    key={gate.id}
                    className={`rounded-xl border p-3 ${
                      isOccupied
                        ? 'border-amber-700/40 bg-amber-950/20'
                        : 'border-slate-700/40 bg-slate-700/20'
                    }`}
                  >
                    <div className="flex items-start justify-between gap-1">
                      <span className="font-bold text-slate-100 text-sm">{gate.gate_code}</span>
                      <span className="text-[10px] px-1 py-0.5 rounded border border-slate-600/30 text-slate-400">
                        {gate.gate_type}
                      </span>
                    </div>
                    {isOccupied ? (
                      <p className="text-[10px] text-amber-400 mt-1 font-medium">
                        ↑ {occupant.callsign || occupant.immatriculation}
                      </p>
                    ) : (
                      <p className="text-[10px] text-emerald-400 mt-1 font-medium">✓ Libre</p>
                    )}
                    {gate.requires_separation && (
                      <p className="text-[10px] text-orange-400/80 mt-0.5">⚠ Séparation</p>
                    )}
                    {gate.reserved_for && (
                      <p className="text-[10px] text-indigo-400 mt-0.5">★ {gate.reserved_for}</p>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        );
      })}
    </div>
  );
}
