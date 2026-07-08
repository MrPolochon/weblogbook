'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { createClient } from '@/lib/supabase/client';
import {
  Plane, Bell, LayoutGrid, CheckCircle2,
  AlertCircle, Wrench, Users2, X, Trophy,
} from 'lucide-react';
import ServiceRequestCard from './ServiceRequestCard';
import GatesView from './GatesView';
import EquipeTab from './EquipeTab';
import ModalAvion from './ModalAvion';
import type { AirportGate, GroundServiceRequest, ServiceType } from '@/lib/types';

function estimerMontant(serviceType: ServiceType, score: number, paxCount?: number | null): number {
  const bases: Record<ServiceType, number> = {
    bagages: 2000, catering: 1500, fuel: 1800, boarding: 100,
    repoussage: 2500, marshalling: 1200,
  };
  const base = serviceType === 'boarding' ? bases.boarding * (paxCount ?? 1) : bases[serviceType];
  return Math.round(base * (0.5 + Math.max(0, Math.min(1, score)) * 0.5));
}

type PlanActif = {
  id: string;
  numero_vol: string;
  callsign: string | null;
  immatriculation: string | null;
  type_avion: string | null;
  aeroport_depart: string;
  aeroport_arrivee: string;
  statut: string;
  porte: string | null;
  pilote: { identifiant: string } | null;
  gate_assignments: Array<{
    id: string;
    gate_id: string;
    assignment_type: string;
    status: string;
    gate: { gate_code: string; terminal: string | null } | null;
  }>;
};

interface Props {
  aeroport: string;
  sessionId: string;
  userId: string;
  gcIdentifiant: string;
  myTeamId: string | null;
  pendingInvitationsCount: number;
  serviceRequests: GroundServiceRequest[];
  gates: AirportGate[];
  plansActifs: PlanActif[];
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

export default function GroundDashboard({
  aeroport, sessionId: _sessionId, userId, gcIdentifiant,
  myTeamId: initialTeamId,
  pendingInvitationsCount: initialInvitationsCount,
  serviceRequests: initialRequests,
  gates,
  plansActifs,
}: Props) {
  const [activeTab, setActiveTab] = useState<Tab>('avions');
  const [requests, setRequests] = useState<GroundServiceRequest[]>(initialRequests);
  const [plans, setPlans] = useState<PlanActif[]>(plansActifs);
  const [alarmPlaying, setAlarmPlaying] = useState(false);
  const [myTeamId, setMyTeamId] = useState<string | null>(initialTeamId);
  const [invitationsCount, setInvitationsCount] = useState(initialInvitationsCount);
  const alarmRef = useRef<HTMLAudioElement | null>(null);
  const plansRef = useRef<PlanActif[]>(plansActifs);
  const [selectedPlanId, setSelectedPlanId] = useState<string | null>(null);
  const [gameToast, setGameToast] = useState<{ score: number; montant: number; serviceType: ServiceType } | null>(null);

  useEffect(() => { plansRef.current = plans; }, [plans]);

  const fetchMissingPlan = useCallback(async (planId: string) => {
    const supabase = createClient();
    const { data } = await supabase.from('plans_vol')
      .select(`
        id, numero_vol, callsign, immatriculation, type_avion, aeroport_depart, aeroport_arrivee, statut, porte,
        pilote:profiles!plans_vol_pilote_id_fkey(identifiant),
        gate_assignments(id, gate_id, assignment_type, status,
          gate:airport_gates!gate_assignments_gate_id_fkey(gate_code, terminal)
        )
      `)
      .eq('id', planId)
      .single();
    if (data) {
      setPlans((prev) => {
        if (prev.find((p) => p.id === planId)) return prev;
        const next = [data as unknown as PlanActif, ...prev];
        plansRef.current = next;
        return next;
      });
    }
  }, []);

  const handleNewRequest = useCallback((payload: { new: GroundServiceRequest }) => {
    setRequests((prev) => {
      const exists = prev.find((r) => r.id === payload.new.id);
      if (exists) return prev.map((r) => r.id === payload.new.id ? payload.new : r);
      return [payload.new, ...prev];
    });
    if (!plansRef.current.find((p) => p.id === payload.new.plan_vol_id)) {
      void fetchMissingPlan(payload.new.plan_vol_id);
    }
  }, [fetchMissingPlan]);

  useEffect(() => {
    const supabase = createClient();
    const channel = supabase
      .channel(`ground-requests-${aeroport}`)
      .on('postgres_changes', {
        event: '*', schema: 'public', table: 'ground_service_requests',
        filter: `aeroport=eq.${aeroport}`,
      }, (payload) => {
        if (payload.eventType === 'INSERT' || payload.eventType === 'UPDATE') {
          handleNewRequest(payload as unknown as { new: GroundServiceRequest });
        }
      })
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [aeroport, handleNewRequest]);

  useEffect(() => {
    const supabase = createClient();
    const channel = supabase
      .channel(`invitations-${userId}`)
      .on('postgres_changes', {
        event: 'INSERT', schema: 'public', table: 'ground_crew_team_invitations',
        filter: `to_user_id=eq.${userId}`,
      }, () => setInvitationsCount((c) => c + 1))
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [userId]);

  // Alarme si demande urgente (marshalling/repoussage ou > 3 min en pending)
  useEffect(() => {
    const urgents = requests.filter((r) => {
      if (!['pending', 'accepted'].includes(r.statut)) return false;
      if (['marshalling', 'repoussage'].includes(r.service_type)) return true;
      const age = (Date.now() - new Date(r.requested_at).getTime()) / 60000;
      return age >= 3;
    });
    if (urgents.length > 0 && !alarmPlaying) {
      setAlarmPlaying(true);
    } else if (urgents.length === 0) {
      setAlarmPlaying(false);
    }
  }, [requests, alarmPlaying]);

  const handleServiceComplete = useCallback((score: number, serviceType: ServiceType, paxCount: number | null) => {
    const montant = estimerMontant(serviceType, score, paxCount);
    setGameToast({ score, montant, serviceType });
    setTimeout(() => setGameToast(null), 6000);
  }, []);

  const myRequests = requests.filter((r) => {
    if (!myTeamId) return !r.team_id;
    return r.team_id === myTeamId;
  });

  const pendingCount = myRequests.filter((r) => r.statut === 'pending').length;

  // Bug 2 : seules les demandes acceptées/en cours apparaissent dans l'onglet Demandes
  const activeRequests = myRequests.filter((r) => ['accepted', 'in_progress'].includes(r.statut));

  // Bug 3 : chercher dans plans (state) pour inclure les plans fetchés dynamiquement
  const selectedPlan = selectedPlanId ? plans.find(p => p.id === selectedPlanId) ?? null : null;
  const selectedPlanRequests = selectedPlanId
    ? requests.filter(r => r.plan_vol_id === selectedPlanId)
    : [];

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="p-2.5 rounded-xl bg-emerald-900/30 border border-emerald-800/40">
            <Wrench className="h-5 w-5 text-emerald-400" />
          </div>
          <div>
            <h1 className="text-xl font-bold text-slate-100">Ground Crew — {aeroport}</h1>
            <p className="text-slate-400 text-sm">{plans.length} vol(s) actif(s)</p>
          </div>
        </div>

        {alarmPlaying && (
          <div className="flex items-center gap-2 px-3 py-1.5 rounded-xl bg-red-900/30 border border-red-700/50 text-red-300 text-sm font-semibold animate-pulse">
            <AlertCircle className="h-4 w-4" />
            Alerte — Action requise !
          </div>
        )}
      </div>

      {/* Onglets */}
      <div className="flex gap-1 rounded-xl border border-slate-700/40 bg-slate-800/30 p-1">
        {TABS.map((tab) => (
          <button
            key={tab}
            type="button"
            onClick={() => {
              setActiveTab(tab);
              if (tab === 'equipe') setInvitationsCount(0);
            }}
            className={`flex-1 flex items-center justify-center gap-1.5 rounded-lg px-2 py-2 text-xs sm:text-sm font-semibold transition-colors relative ${
              activeTab === tab
                ? 'bg-emerald-600/20 border border-emerald-600/30 text-emerald-200'
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
            {tab === 'equipe' && invitationsCount > 0 && (
              <span className="absolute -top-1 -right-1 flex h-4 w-4 items-center justify-center rounded-full bg-red-500 text-[9px] font-bold text-white">
                {invitationsCount}
              </span>
            )}
          </button>
        ))}
      </div>

      {/* Contenu */}
      {activeTab === 'avions' && (
        <AvionsTab
          plans={plans}
          aeroport={aeroport}
          myTeamId={myTeamId}
          requests={myRequests}
          onSelectPlan={setSelectedPlanId}
        />
      )}
      {activeTab === 'demandes' && (
        <DemandesTab
          requests={activeRequests}
          onUpdate={setRequests}
          allRequests={requests}
          onOpenModal={setSelectedPlanId}
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
        <GatesView gates={gates} aeroport={aeroport} />
      )}

      {/* Modal Avion */}
      {selectedPlan && (
        <ModalAvion
          plan={selectedPlan}
          requests={selectedPlanRequests}
          gcIdentifiant={gcIdentifiant}
          onClose={() => setSelectedPlanId(null)}
          onUpdateRequest={(updated) => {
            setRequests((prev) => prev.map(r => r.id === updated.id ? updated : r));
          }}
          onServiceComplete={handleServiceComplete}
        />
      )}

      {/* Toast résultat */}
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
          <button type="button" onClick={() => setGameToast(null)} className="ml-2 text-slate-500 hover:text-slate-300">
            <X className="h-4 w-4" />
          </button>
        </div>
      )}
    </div>
  );
}

// ── Onglet Avions ─────────────────────────────────────────────────────────────
function AvionsTab({
  plans, aeroport, myTeamId, requests, onSelectPlan,
}: {
  plans: PlanActif[];
  aeroport: string;
  myTeamId: string | null;
  requests: GroundServiceRequest[];
  onSelectPlan: (planId: string) => void;
}) {
  console.log('[GC Avions] aeroportSession (client):', aeroport);
  console.log('[GC Avions] plans reçus (client):', plans.length, plans.map(p => ({ id: p.id, numero_vol: p.numero_vol, statut: p.statut, dep: p.aeroport_depart, arr: p.aeroport_arrivee })));

  const allPlans = [
    ...plans.filter(p => p.aeroport_depart === aeroport).map(p => ({ ...p, dirType: 'depart' as const })),
    ...plans.filter(p => p.aeroport_arrivee === aeroport && p.aeroport_depart !== aeroport).map(p => ({ ...p, dirType: 'arrivee' as const })),
  ];

  console.log('[GC Avions] allPlans après filtre:', allPlans.length);

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
      {allPlans.map((plan) => {
        const planReqs = requests.filter(r => r.plan_vol_id === plan.id);
        const pendingReqs = planReqs.filter(r => r.statut === 'pending');
        const hasMarshallingAlert = pendingReqs.some(r => r.service_type === 'marshalling');
        const hasRepoussageAlert = pendingReqs.some(r => r.service_type === 'repoussage');
        const pendingMinigameCount = pendingReqs.filter(r =>
          !['marshalling', 'repoussage'].includes(r.service_type)
        ).length;

        const gateDepart = plan.gate_assignments?.find(g => g.assignment_type === 'depart');
        const gateArrivee = plan.gate_assignments?.find(g => g.assignment_type === 'arrivee');

        const planTeamId = planReqs.find(r => r.team_id && !['rejected','completed','ground_crew_unavailable'].includes(r.statut))?.team_id ?? null;
        const isMyTeam = planTeamId === myTeamId && !!myTeamId;

        const borderClass = hasMarshallingAlert
          ? 'border-red-600/60 animate-pulse'
          : hasRepoussageAlert
          ? 'border-orange-600/60 animate-pulse'
          : isMyTeam
          ? 'border-emerald-700/40'
          : plan.dirType === 'depart'
          ? 'border-emerald-800/20'
          : 'border-sky-800/20';

        return (
          <button
            key={plan.id}
            type="button"
            onClick={() => onSelectPlan(plan.id)}
            className={`w-full rounded-xl border ${borderClass} bg-slate-800/30 p-4 text-left transition-all hover:bg-slate-800/50 hover:border-slate-600/60 group`}
          >
            <div className="flex items-center justify-between flex-wrap gap-3">
              <div className="flex items-center gap-3">
                <div className={`p-2 rounded-xl ${hasMarshallingAlert ? 'bg-red-900/40' : hasRepoussageAlert ? 'bg-orange-900/30' : 'bg-slate-700/40'}`}>
                  <Plane className={`h-4 w-4 ${hasMarshallingAlert ? 'text-red-400' : hasRepoussageAlert ? 'text-orange-400' : plan.dirType === 'depart' ? 'text-emerald-400' : 'text-sky-400'}`} />
                </div>
                <div>
                  <div className="text-2xl font-bold text-white tracking-wider">
                    {plan.callsign || plan.immatriculation || plan.numero_vol}
                  </div>
                  {plan.immatriculation && (
                    <div className="text-sm text-slate-400">{plan.immatriculation}</div>
                  )}
                  <div className="flex items-center gap-2 flex-wrap mt-1">
                    <span className={`text-xs px-2 py-0.5 rounded-full border ${plan.dirType === 'depart' ? 'text-emerald-400 border-emerald-800/40' : 'text-sky-400 border-sky-800/40'}`}>
                      {plan.dirType === 'depart' ? 'Départ' : 'Arrivée'}
                    </span>
                    {hasMarshallingAlert && (
                      <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-red-900/40 text-red-300 border border-red-700/50 animate-pulse">MARSHALLING</span>
                    )}
                    {hasRepoussageAlert && (
                      <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-orange-900/40 text-orange-300 border border-orange-700/50 animate-pulse">PUSHBACK</span>
                    )}
                    {pendingMinigameCount > 0 && (
                      <span className="flex h-5 w-5 items-center justify-center rounded-full bg-red-500 text-[9px] font-bold text-white">
                        {pendingMinigameCount}
                      </span>
                    )}
                  </div>
                  <p className="text-xs text-slate-400 mt-0.5">
                    {plan.pilote?.identifiant} • {plan.aeroport_depart} → {plan.aeroport_arrivee}
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-2 text-xs">
                {(gateDepart ?? plan.porte) && (
                  <span className="px-2 py-1 rounded-lg bg-emerald-900/30 text-emerald-300 border border-emerald-800/30">
                    {gateDepart?.gate?.gate_code ?? plan.porte}
                  </span>
                )}
                {gateArrivee && (
                  <span className="px-2 py-1 rounded-lg bg-sky-900/30 text-sky-300 border border-sky-800/30">
                    Arr : {gateArrivee?.gate?.gate_code}
                  </span>
                )}
                <span className="text-slate-500 group-hover:text-slate-300 text-xs">→</span>
              </div>
            </div>
          </button>
        );
      })}
    </div>
  );
}

// ── Onglet Demandes ───────────────────────────────────────────────────────────
function DemandesTab({
  requests, onUpdate, allRequests, onOpenModal,
}: {
  requests: GroundServiceRequest[];
  onUpdate: (requests: GroundServiceRequest[]) => void;
  allRequests: GroundServiceRequest[];
  onOpenModal: (planId: string) => void;
}) {
  if (requests.length === 0) {
    return (
      <div className="rounded-xl border border-slate-700/40 bg-slate-800/20 p-12 text-center">
        <CheckCircle2 className="h-10 w-10 text-slate-600 mx-auto mb-3" />
        <p className="text-slate-400">Aucune demande en cours</p>
        <p className="text-slate-500 text-sm mt-1">Les demandes apparaissent ici en temps réel</p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {requests.map((req) => (
        <ServiceRequestCard
          key={req.id}
          request={req}
          onUpdate={(updated) => {
            onUpdate(allRequests.map((r) => r.id === updated.id ? updated : r));
          }}
          onOpenModal={() => onOpenModal(req.plan_vol_id)}
        />
      ))}
    </div>
  );
}
