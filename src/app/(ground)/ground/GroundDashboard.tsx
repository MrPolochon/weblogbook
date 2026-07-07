'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { createClient } from '@/lib/supabase/client';
import {
  Plane, Bell, Gamepad2, LayoutGrid, CheckCircle2,
  AlertCircle, Wrench, Users2,
} from 'lucide-react';
import ServiceRequestCard from './ServiceRequestCard';
import GatesView from './GatesView';
import EquipeTab from './EquipeTab';
import type { AirportGate, GroundServiceRequest } from '@/lib/types';

type PlanActif = {
  id: string;
  numero_vol: string;
  callsign: string | null;
  aeroport_depart: string;
  aeroport_arrivee: string;
  statut: string;
  porte_depart: string | null;
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
  myTeamId: string | null;
  pendingInvitationsCount: number;
  serviceRequests: GroundServiceRequest[];
  gates: AirportGate[];
  plansActifs: PlanActif[];
}

const TABS = ['avions', 'demandes', 'equipe', 'minijeux', 'portes'] as const;
type Tab = (typeof TABS)[number];

const TAB_LABELS: Record<Tab, string> = {
  avions:   'Avions',
  demandes: 'Demandes',
  equipe:   'Mon Équipe',
  minijeux: 'Mini-jeux',
  portes:   'Portes',
};

const TAB_ICONS: Record<Tab, React.ReactNode> = {
  avions:   <Plane className="h-4 w-4" />,
  demandes: <Bell className="h-4 w-4" />,
  equipe:   <Users2 className="h-4 w-4" />,
  minijeux: <Gamepad2 className="h-4 w-4" />,
  portes:   <LayoutGrid className="h-4 w-4" />,
};

export default function GroundDashboard({
  aeroport, sessionId: _sessionId, userId,
  myTeamId: initialTeamId,
  pendingInvitationsCount: initialInvitationsCount,
  serviceRequests: initialRequests,
  gates,
  plansActifs,
}: Props) {
  const [activeTab, setActiveTab] = useState<Tab>('demandes');
  const [requests, setRequests] = useState<GroundServiceRequest[]>(initialRequests);
  const [alarmPlaying, setAlarmPlaying] = useState(false);
  const [myTeamId, setMyTeamId] = useState<string | null>(initialTeamId);
  const [invitationsCount, setInvitationsCount] = useState(initialInvitationsCount);
  const alarmRef = useRef<HTMLAudioElement | null>(null);

  const handleNewRequest = useCallback((payload: { new: GroundServiceRequest }) => {
    setRequests((prev) => {
      const exists = prev.find((r) => r.id === payload.new.id);
      if (exists) return prev.map((r) => r.id === payload.new.id ? payload.new : r);
      return [payload.new, ...prev];
    });
  }, []);

  useEffect(() => {
    const supabase = createClient();
    const channel = supabase
      .channel(`ground-requests-${aeroport}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'ground_service_requests',
          filter: `aeroport=eq.${aeroport}`,
        },
        (payload) => {
          if (payload.eventType === 'INSERT' || payload.eventType === 'UPDATE') {
            handleNewRequest(payload as unknown as { new: GroundServiceRequest });
          }
        }
      )
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [aeroport, handleNewRequest]);

  // Realtime invitations (badge rouge sur l'onglet équipe)
  useEffect(() => {
    const supabase = createClient();
    const channel = supabase
      .channel(`invitations-${userId}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'ground_crew_team_invitations',
          filter: `to_user_id=eq.${userId}`,
        },
        () => setInvitationsCount((c) => c + 1)
      )
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [userId]);

  // Alarme sonore si demande en attente depuis > 3 minutes
  useEffect(() => {
    const pendingOld = requests.filter((r) => {
      if (r.statut !== 'pending') return false;
      const age = (Date.now() - new Date(r.requested_at).getTime()) / 60000;
      return age >= 3;
    });
    if (pendingOld.length > 0 && !alarmPlaying) {
      setAlarmPlaying(true);
    } else if (pendingOld.length === 0) {
      setAlarmPlaying(false);
    }
  }, [requests, alarmPlaying]);

  // Filtrer les demandes selon l'équipe (exclusivité)
  const myRequests = requests.filter((r) => {
    if (!myTeamId) return !r.team_id; // Solo : voit les demandes sans équipe
    return r.team_id === myTeamId;    // Équipe : voit uniquement les demandes de l'équipe
  });

  const pendingCount = myRequests.filter((r) => r.statut === 'pending').length;

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-xl bg-emerald-900/30 border border-emerald-800/40">
              <Wrench className="h-5 w-5 text-emerald-400" />
            </div>
            <div>
              <h1 className="text-xl font-bold text-slate-100">Ground Crew — {aeroport}</h1>
              <p className="text-slate-400 text-sm">{plansActifs.length} vol(s) actif(s) sur l&apos;aéroport</p>
            </div>
          </div>
        </div>

        {alarmPlaying && (
          <div className="flex items-center gap-2 px-3 py-1.5 rounded-xl bg-red-900/30 border border-red-700/50 text-red-300 text-sm font-semibold animate-pulse">
            <AlertCircle className="h-4 w-4" />
            Demande urgente !
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

      {/* Contenu des onglets */}
      {activeTab === 'avions' && (
        <AvionsAuSolTab
          plans={plansActifs}
          aeroport={aeroport}
          myTeamId={myTeamId}
          requests={requests}
        />
      )}
      {activeTab === 'demandes' && (
        <DemandesTab requests={myRequests} onUpdate={setRequests} allRequests={requests} />
      )}
      {activeTab === 'equipe' && (
        <EquipeTab
          userId={userId}
          aeroport={aeroport}
          myTeamId={myTeamId}
          onTeamChange={setMyTeamId}
        />
      )}
      {activeTab === 'minijeux' && (
        <MinijevxTab aeroport={aeroport} />
      )}
      {activeTab === 'portes' && (
        <GatesView gates={gates} aeroport={aeroport} />
      )}
    </div>
  );
}

// ── Onglet Avions au Sol ──────────────────────────────────────────────────────
function AvionsAuSolTab({
  plans,
  aeroport,
  myTeamId,
  requests,
}: {
  plans: PlanActif[];
  aeroport: string;
  myTeamId: string | null;
  requests: GroundServiceRequest[];
}) {
  const departs = plans.filter((p) => p.aeroport_depart === aeroport);
  const arrivees = plans.filter((p) => p.aeroport_arrivee === aeroport && p.aeroport_depart !== aeroport);

  const allPlans = [
    ...departs.map((p) => ({ ...p, dirType: 'depart' as const })),
    ...arrivees.map((p) => ({ ...p, dirType: 'arrivee' as const })),
  ];

  if (allPlans.length === 0) {
    return (
      <div className="rounded-xl border border-slate-700/40 bg-slate-800/20 p-12 text-center">
        <Plane className="h-10 w-10 text-slate-600 mx-auto mb-3" />
        <p className="text-slate-400">Aucun avion actif sur cet aéroport</p>
      </div>
    );
  }

  function getPlanTeamId(planId: string): string | null {
    const teamReq = requests.find(
      (r) => r.plan_vol_id === planId && r.team_id &&
        !['rejected', 'ground_crew_unavailable', 'completed'].includes(r.statut)
    );
    return teamReq?.team_id ?? null;
  }

  function TeamBadge({ planId }: { planId: string }) {
    const planTeamId = getPlanTeamId(planId);
    if (!planTeamId) {
      return (
        <span className="px-2 py-0.5 rounded-full text-[10px] font-bold border bg-amber-900/30 text-amber-300 border-amber-700/40">
          LIBRE
        </span>
      );
    }
    if (planTeamId === myTeamId) {
      return (
        <span className="px-2 py-0.5 rounded-full text-[10px] font-bold border bg-emerald-900/30 text-emerald-300 border-emerald-700/40">
          MON ÉQUIPE
        </span>
      );
    }
    return (
      <span className="px-2 py-0.5 rounded-full text-[10px] font-bold border bg-slate-700/40 text-slate-400 border-slate-600/40">
        AUTRE ÉQUIPE
      </span>
    );
  }

  return (
    <div className="space-y-2">
      {allPlans.map((plan) => {
        const gateDepart = plan.gate_assignments?.find((g) => g.assignment_type === 'depart');
        const gateArrivee = plan.gate_assignments?.find((g) => g.assignment_type === 'arrivee');
        const planTeamId = getPlanTeamId(plan.id);
        const isMyTeam = planTeamId === myTeamId && !!myTeamId;
        const borderClass = isMyTeam
          ? 'border-emerald-700/40'
          : plan.dirType === 'depart'
          ? 'border-emerald-800/20'
          : 'border-sky-800/20';

        return (
          <div key={plan.id} className={`rounded-xl border ${borderClass} bg-slate-800/30 p-4`}>
            <div className="flex items-center justify-between flex-wrap gap-3">
              <div className="flex items-center gap-3">
                <div className="p-2 rounded-xl bg-slate-700/40">
                  <Plane className={`h-4 w-4 ${plan.dirType === 'depart' ? 'text-emerald-400' : 'text-sky-400'}`} />
                </div>
                <div>
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-bold font-mono text-slate-100">{plan.numero_vol}</span>
                    {plan.callsign && (
                      <span className="text-xs text-slate-400">{plan.callsign}</span>
                    )}
                    <span className={`text-xs px-2 py-0.5 rounded-full border ${
                      plan.dirType === 'depart'
                        ? 'text-emerald-400 border-emerald-800/40'
                        : 'text-sky-400 border-sky-800/40'
                    }`}>
                      {plan.dirType === 'depart' ? 'Départ' : 'Arrivée'}
                    </span>
                    <TeamBadge planId={plan.id} />
                  </div>
                  <p className="text-xs text-slate-400 mt-0.5">
                    {plan.pilote?.identifiant} • {plan.aeroport_depart} → {plan.aeroport_arrivee}
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-2 text-xs">
                {(gateDepart ?? plan.porte_depart) && (
                  <span className="px-2 py-1 rounded-lg bg-emerald-900/30 text-emerald-300 border border-emerald-800/30">
                    Départ : {gateDepart?.gate?.gate_code ?? plan.porte_depart}
                  </span>
                )}
                {gateArrivee && (
                  <span className="px-2 py-1 rounded-lg bg-sky-900/30 text-sky-300 border border-sky-800/30">
                    Arrivée : {gateArrivee?.gate?.gate_code}
                  </span>
                )}
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ── Onglet Demandes ───────────────────────────────────────────────────────────
function DemandesTab({
  requests,
  onUpdate,
  allRequests,
}: {
  requests: GroundServiceRequest[];
  onUpdate: (requests: GroundServiceRequest[]) => void;
  allRequests: GroundServiceRequest[];
}) {
  if (requests.length === 0) {
    return (
      <div className="rounded-xl border border-slate-700/40 bg-slate-800/20 p-12 text-center">
        <CheckCircle2 className="h-10 w-10 text-slate-600 mx-auto mb-3" />
        <p className="text-slate-400">Aucune demande en attente</p>
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
        />
      ))}
    </div>
  );
}

// ── Onglet Mini-jeux ──────────────────────────────────────────────────────────
import type { MinigameType } from '@/lib/ground/minigames';

const GAME_CARDS: { id: MinigameType; name: string; desc: string; emoji: string; color: string }[] = [
  { id: 'bagages',     name: 'Chargement Bagages',  desc: '30s • Colis + fragiles',     emoji: '🧳', color: 'amber'   },
  { id: 'catering',    name: 'Service Catering',     desc: '45s • Mémoriser la séquence', emoji: '🍽️', color: 'emerald' },
  { id: 'fuel',        name: 'Ravitaillement',        desc: '20s • 3 tentatives',         emoji: '⛽', color: 'sky'     },
  { id: 'boarding',    name: 'Boarding Passagers',    desc: 'VIP → Business → Economy',   emoji: '🎫', color: 'purple'  },
  { id: 'degivrage',   name: 'Dégivrage Aile',        desc: '45s • Gratter la glace',     emoji: '❄️', color: 'cyan'    },
  { id: 'checklist',   name: 'Checklist Pré-vol',     desc: '5s mémo • Bon ordre',        emoji: '📋', color: 'violet'  },
  { id: 'marshalling', name: 'Marshalling',            desc: '7 signaux • Flèches',        emoji: '🦺', color: 'orange'  },
];

function MinijevxTab({ aeroport: _aeroport }: { aeroport: string }) {
  const [selected, setSelected] = useState<MinigameType | null>(null);

  if (selected) {
    return (
      <div className="rounded-xl border border-slate-700/40 bg-slate-800/20 p-6">
        <button
          type="button"
          onClick={() => setSelected(null)}
          className="text-sm text-slate-400 hover:text-slate-200 mb-4 flex items-center gap-1"
        >
          ← Retour aux mini-jeux
        </button>
        <MinijeuxGame type={selected} onFinish={() => setSelected(null)} />
      </div>
    );
  }

  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
      {GAME_CARDS.map(game => (
        <button
          key={game.id}
          type="button"
          onClick={() => setSelected(game.id)}
          className="rounded-xl border border-slate-700/40 bg-slate-800/20 p-4 text-left transition-all hover:-translate-y-0.5 hover:shadow-lg hover:border-slate-600/60 hover:bg-slate-800/40 group"
        >
          <div className="text-3xl mb-2">{game.emoji}</div>
          <p className="font-semibold text-slate-200 text-sm group-hover:text-white">{game.name}</p>
          <p className="text-slate-500 text-xs mt-0.5">{game.desc}</p>
        </button>
      ))}
    </div>
  );
}

import dynamic from 'next/dynamic';
const MinijeuBagages    = dynamic(() => import('./minijeux/MinijeuBagages'));
const MinijeuCatering   = dynamic(() => import('./minijeux/MinijeuCatering'));
const MinijeuFuel       = dynamic(() => import('./minijeux/MinijeuFuel'));
const MinijeuBoarding   = dynamic(() => import('./minijeux/MinijeuBoarding'));
const MinijeuDegivrage  = dynamic(() => import('./minijeux/MinijeuDegivrage'));
const MinijeuChecklist  = dynamic(() => import('./minijeux/MinijeuChecklist'));
const MinijeuMarshalling = dynamic(() => import('./minijeux/MinijeuMarshalling'));

function MinijeuxGame({
  type,
  onFinish,
}: {
  type: MinigameType;
  onFinish: (score: number) => void;
}) {
  if (type === 'bagages')      return <MinijeuBagages     onFinish={onFinish} />;
  if (type === 'catering')     return <MinijeuCatering    onFinish={onFinish} />;
  if (type === 'fuel')         return <MinijeuFuel        onFinish={onFinish} />;
  if (type === 'boarding')     return <MinijeuBoarding    paxCount={50} onFinish={onFinish} />;
  if (type === 'degivrage')    return <MinijeuDegivrage   onFinish={onFinish} />;
  if (type === 'checklist')    return <MinijeuChecklist   onFinish={onFinish} />;
  if (type === 'marshalling')  return <MinijeuMarshalling onFinish={onFinish} />;
  return null;
}
