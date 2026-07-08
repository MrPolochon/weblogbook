'use client';

import { useState, useCallback } from 'react';
import dynamic from 'next/dynamic';
import {
  X, Package, Utensils, Fuel, Users, Loader2,
  CheckCircle2, AlertTriangle, ArrowLeftRight, Navigation, Clock,
} from 'lucide-react';
import type { ServiceType } from '@/lib/types';
import type { PlanVol, ServiceRequest } from './GroundDashboard';

// Mini-jeux chargés dynamiquement
const MinijeuBagages  = dynamic(() => import('./minijeux/MinijeuBagages'));
const MinijeuCatering = dynamic(() => import('./minijeux/MinijeuCatering'));
const MinijeuFuel     = dynamic(() => import('./minijeux/MinijeuFuel'));
const MinijeuBoarding = dynamic(() => import('./minijeux/MinijeuBoarding'));

// ── Constantes ────────────────────────────────────────────────────────────────

const SERVICE_ICONS: Partial<Record<ServiceType, React.ReactNode>> = {
  bagages:     <Package className="h-4 w-4" />,
  catering:    <Utensils className="h-4 w-4" />,
  fuel:        <Fuel className="h-4 w-4" />,
  boarding:    <Users className="h-4 w-4" />,
  repoussage:  <ArrowLeftRight className="h-4 w-4" />,
  marshalling: <Navigation className="h-4 w-4" />,
};

const SERVICE_LABELS: Record<ServiceType, string> = {
  bagages:     'Chargement bagages',
  catering:    'Service catering',
  fuel:        'Ravitaillement carburant',
  boarding:    'Boarding passagers',
  repoussage:  'Repoussage',
  marshalling: 'Marshalling',
};

const SERVICE_COLORS: Record<ServiceType, string> = {
  bagages:     'text-amber-400 bg-amber-900/20 border-amber-800/40',
  catering:    'text-emerald-400 bg-emerald-900/20 border-emerald-800/40',
  fuel:        'text-sky-400 bg-sky-900/20 border-sky-800/40',
  boarding:    'text-purple-400 bg-purple-900/20 border-purple-800/40',
  repoussage:  'text-orange-400 bg-orange-900/20 border-orange-800/40',
  marshalling: 'text-red-400 bg-red-900/20 border-red-800/40',
};

const MINIGAME_TYPES: ServiceType[] = ['bagages', 'catering', 'fuel', 'boarding'];
const CONFIRM_ONLY_TYPES: ServiceType[] = ['marshalling', 'repoussage'];

function formatAge(dateStr: string): string {
  const mins = Math.floor((Date.now() - new Date(dateStr).getTime()) / 60000);
  if (mins < 1) return "à l'instant";
  if (mins < 60) return `${mins} min`;
  return `${Math.floor(mins / 60)}h${mins % 60 > 0 ? String(mins % 60).padStart(2, '0') : ''}`;
}

// ── Props ─────────────────────────────────────────────────────────────────────

interface Props {
  plan: PlanVol;
  requests: ServiceRequest[];
  userId: string;
  gcIdentifiant: string;
  onClose: () => void;
  onUpdateRequest: (updated: ServiceRequest) => void;
  onServiceComplete: (score: number, serviceType: ServiceType, paxCount: number | null) => void;
}

// ── Composant ─────────────────────────────────────────────────────────────────

export default function ModalAvion({
  plan, requests, userId, gcIdentifiant,
  onClose, onUpdateRequest, onServiceComplete,
}: Props) {
  const [activeGameReqId, setActiveGameReqId] = useState<string | null>(null);
  const [loadingReqId, setLoadingReqId] = useState<string | null>(null);

  const activeGameReq = activeGameReqId
    ? requests.find(r => r.id === activeGameReqId) ?? null
    : null;

  const marshallingReq = requests.find(
    r => r.service_type === 'marshalling' && ['pending', 'accepted'].includes(r.statut)
  ) ?? null;
  const repoussageReq = requests.find(
    r => r.service_type === 'repoussage' && ['pending', 'accepted'].includes(r.statut)
  ) ?? null;

  const patchRequest = useCallback(async (
    reqId: string,
    body: Record<string, unknown>
  ): Promise<ServiceRequest | null> => {
    const res = await fetch(`/api/ground/service-requests/${reqId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    const data = await res.json() as { request?: ServiceRequest };
    if (res.ok && data.request) {
      onUpdateRequest(data.request);
      return data.request;
    }
    return null;
  }, [onUpdateRequest]);

  async function handleAccepter(req: ServiceRequest) {
    setLoadingReqId(req.id);
    try {
      const updated = await patchRequest(req.id, {
        statut: 'accepted',
        accepted_by: userId,
      });
      if (updated && MINIGAME_TYPES.includes(req.service_type)) {
        setActiveGameReqId(req.id);
      }
    } finally {
      setLoadingReqId(null);
    }
  }

  async function handleMinigameFinish(score: number) {
    if (!activeGameReq) return;
    const req = activeGameReq;
    setActiveGameReqId(null);
    setLoadingReqId(req.id);
    try {
      await patchRequest(req.id, { statut: 'completed', score_minijeu: score });
      onServiceComplete(score, req.service_type, req.pax_count);
    } finally {
      setLoadingReqId(null);
    }
  }

  async function handlePrendreEnCharge(req: ServiceRequest) {
    setLoadingReqId(req.id);
    try {
      await patchRequest(req.id, { statut: 'accepted', accepted_by: userId });
    } finally {
      setLoadingReqId(null);
    }
  }

  async function handleGCConfirme(req: ServiceRequest) {
    setLoadingReqId(req.id);
    try {
      await patchRequest(req.id, { statut: 'completed' });
      onServiceComplete(1.0, req.service_type, null);
    } finally {
      setLoadingReqId(null);
    }
  }

  return (
    <div className="fixed inset-0 bg-black/75 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <div className="bg-slate-900 border border-slate-700/60 rounded-2xl max-w-3xl w-full mx-4 max-h-[92vh] flex flex-col shadow-2xl">

        {/* Header */}
        <div className="flex items-start justify-between p-5 border-b border-slate-700/50">
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-xl bg-slate-800 border border-slate-700/50">
              <span className="text-2xl">✈️</span>
            </div>
            <div>
              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-xl font-black font-mono text-slate-100">
                  {plan.callsign || plan.immatriculation || '—'}
                </span>
                {plan.callsign && plan.immatriculation && (
                  <span className="text-sm text-slate-400 font-medium">{plan.immatriculation}</span>
                )}
                {plan.porte && (
                  <span className="px-2.5 py-1 rounded-xl bg-emerald-900/30 border border-emerald-800/40 text-emerald-300 text-xs font-bold">
                    Porte {plan.porte}
                  </span>
                )}
              </div>
              <p className="text-slate-500 text-sm mt-0.5">
                {plan.aeroport_depart} → {plan.aeroport_arrivee}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-2 rounded-xl border border-slate-700/50 text-slate-400 hover:text-slate-200 hover:bg-slate-800 transition-colors shrink-0"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Corps scrollable */}
        <div className="flex-1 overflow-y-auto p-5 space-y-5">

          {/* Mini-jeu inline */}
          {activeGameReq && (
            <div className="rounded-xl border border-slate-600/50 bg-slate-800/40 p-5">
              <div className="flex items-center justify-between mb-4">
                <h3 className="font-bold text-slate-100 text-sm">
                  {SERVICE_LABELS[activeGameReq.service_type]}
                </h3>
                <button
                  type="button"
                  onClick={async () => {
                    await patchRequest(activeGameReq.id, { statut: 'pending' });
                    setActiveGameReqId(null);
                  }}
                  className="text-xs text-slate-500 hover:text-slate-300 flex items-center gap-1"
                >
                  <X className="h-3 w-3" /> Annuler
                </button>
              </div>
              {activeGameReq.service_type === 'bagages'  && <MinijeuBagages  onFinish={handleMinigameFinish} />}
              {activeGameReq.service_type === 'catering' && <MinijeuCatering onFinish={handleMinigameFinish} />}
              {activeGameReq.service_type === 'fuel'     && <MinijeuFuel     onFinish={handleMinigameFinish} />}
              {activeGameReq.service_type === 'boarding' && (
                <MinijeuBoarding paxCount={activeGameReq.pax_count ?? 50} onFinish={handleMinigameFinish} />
              )}
            </div>
          )}

          {/* Alerte Marshalling */}
          {marshallingReq && marshallingReq.statut === 'pending' && (
            <div className="rounded-xl border-2 border-red-600/60 bg-red-950/30 p-4 space-y-3">
              <div className="flex items-center gap-2">
                <AlertTriangle className="h-5 w-5 text-red-400 animate-pulse" />
                <p className="font-bold text-red-200 text-sm tracking-wide uppercase">
                  MARSHALLING DEMANDÉ — ACCUSÉ DE RÉCEPTION
                </p>
              </div>
              <p className="text-red-300/80 text-xs">
                Le pilote demande un marshalling au parking. Vous devez vous rendre sur le taxiway.
              </p>
              <button
                type="button"
                disabled={loadingReqId === marshallingReq.id}
                onClick={() => handlePrendreEnCharge(marshallingReq)}
                className="flex items-center gap-2 px-4 py-2 rounded-xl bg-red-700 hover:bg-red-600 text-white font-bold text-sm transition-colors disabled:opacity-50"
              >
                {loadingReqId === marshallingReq.id
                  ? <Loader2 className="h-4 w-4 animate-spin" />
                  : <Navigation className="h-4 w-4" />
                }
                Je prends en charge — {gcIdentifiant}
              </button>
            </div>
          )}

          {marshallingReq && marshallingReq.statut === 'accepted' && (
            <div className="rounded-xl border border-red-700/40 bg-red-950/20 p-4 space-y-3">
              <div className="flex items-center gap-2">
                <Navigation className="h-4 w-4 text-red-400" />
                <p className="font-semibold text-red-200 text-sm">
                  Marshalling en cours — {gcIdentifiant}
                </p>
              </div>
              {marshallingReq.pilote_confirme ? (
                <div className="space-y-2">
                  <p className="text-emerald-300 text-xs font-semibold">
                    ✓ Pilote a confirmé la fin du marshalling
                  </p>
                  <button
                    type="button"
                    disabled={loadingReqId === marshallingReq.id}
                    onClick={() => handleGCConfirme(marshallingReq)}
                    className="flex items-center gap-2 px-4 py-2 rounded-xl bg-emerald-700 hover:bg-emerald-600 text-white font-bold text-sm transition-colors disabled:opacity-50"
                  >
                    {loadingReqId === marshallingReq.id
                      ? <Loader2 className="h-4 w-4 animate-spin" />
                      : <CheckCircle2 className="h-4 w-4" />
                    }
                    Confirmer terminé
                  </button>
                </div>
              ) : (
                <p className="text-slate-400 text-xs flex items-center gap-1">
                  <Clock className="h-3 w-3" /> En attente de confirmation du pilote…
                </p>
              )}
            </div>
          )}

          {/* Alerte Repoussage */}
          {repoussageReq && repoussageReq.statut === 'pending' && (
            <div className="rounded-xl border-2 border-orange-600/60 bg-orange-950/30 p-4 space-y-3">
              <div className="flex items-center gap-2">
                <AlertTriangle className="h-5 w-5 text-orange-400 animate-pulse" />
                <p className="font-bold text-orange-200 text-sm tracking-wide uppercase">
                  PUSHBACK {repoussageReq.direction === 'gauche' ? 'LEFT ←' : repoussageReq.direction === 'droite' ? 'RIGHT →' : ''} DEMANDÉ
                </p>
              </div>
              <p className="text-orange-300/80 text-xs">
                Repoussage {repoussageReq.direction === 'gauche' ? 'vers la gauche' : repoussageReq.direction === 'droite' ? 'vers la droite' : ''} demandé par le pilote.
              </p>
              <button
                type="button"
                disabled={loadingReqId === repoussageReq.id}
                onClick={() => handlePrendreEnCharge(repoussageReq)}
                className="flex items-center gap-2 px-4 py-2 rounded-xl bg-orange-700 hover:bg-orange-600 text-white font-bold text-sm transition-colors disabled:opacity-50"
              >
                {loadingReqId === repoussageReq.id
                  ? <Loader2 className="h-4 w-4 animate-spin" />
                  : <ArrowLeftRight className="h-4 w-4" />
                }
                Je prends en charge — {gcIdentifiant}
              </button>
            </div>
          )}

          {repoussageReq && repoussageReq.statut === 'accepted' && (
            <div className="rounded-xl border border-orange-700/40 bg-orange-950/20 p-4 space-y-3">
              <div className="flex items-center gap-2">
                <ArrowLeftRight className="h-4 w-4 text-orange-400" />
                <p className="font-semibold text-orange-200 text-sm">
                  Pushback {repoussageReq.direction === 'gauche' ? 'LEFT' : 'RIGHT'} en cours — {gcIdentifiant}
                </p>
              </div>
              {repoussageReq.pilote_confirme ? (
                <div className="space-y-2">
                  <p className="text-emerald-300 text-xs font-semibold">
                    ✓ Pilote a confirmé la fin du repoussage
                  </p>
                  <button
                    type="button"
                    disabled={loadingReqId === repoussageReq.id}
                    onClick={() => handleGCConfirme(repoussageReq)}
                    className="flex items-center gap-2 px-4 py-2 rounded-xl bg-emerald-700 hover:bg-emerald-600 text-white font-bold text-sm transition-colors disabled:opacity-50"
                  >
                    {loadingReqId === repoussageReq.id
                      ? <Loader2 className="h-4 w-4 animate-spin" />
                      : <CheckCircle2 className="h-4 w-4" />
                    }
                    Confirmer terminé
                  </button>
                </div>
              ) : (
                <p className="text-slate-400 text-xs flex items-center gap-1">
                  <Clock className="h-3 w-3" /> En attente de confirmation du pilote…
                </p>
              )}
            </div>
          )}

          {/* Liste de tous les services */}
          {!activeGameReq && (
            <section>
              <h3 className="text-xs font-bold uppercase tracking-wider text-slate-500 mb-3">
                Services demandés
              </h3>
              {requests.length === 0 ? (
                <div className="rounded-xl border border-slate-700/40 bg-slate-800/20 p-6 text-center">
                  <CheckCircle2 className="h-8 w-8 text-slate-600 mx-auto mb-2" />
                  <p className="text-slate-400 text-sm">Aucun service demandé pour ce vol</p>
                </div>
              ) : (
                <div className="space-y-2">
                  {requests.map(req => {
                    const colorClass = SERVICE_COLORS[req.service_type];
                    const isMinigame = MINIGAME_TYPES.includes(req.service_type);
                    const isConfirmOnly = CONFIRM_ONLY_TYPES.includes(req.service_type);
                    const isLoading = loadingReqId === req.id;

                    return (
                      <div
                        key={req.id}
                        className={`rounded-xl border p-3.5 ${colorClass}`}
                      >
                        <div className="flex items-center justify-between gap-3 flex-wrap">
                          <div className="flex items-center gap-2.5">
                            <div className="opacity-80">{SERVICE_ICONS[req.service_type]}</div>
                            <div>
                              <div className="flex items-center gap-2 flex-wrap">
                                <span className="font-semibold text-sm text-slate-200">
                                  {SERVICE_LABELS[req.service_type]}
                                </span>
                                {req.service_type === 'repoussage' && req.direction && (
                                  <span className="text-[10px] font-bold text-orange-300">
                                    {req.direction === 'gauche' ? '← GAUCHE' : '→ DROITE'}
                                  </span>
                                )}
                                <StatutBadge statut={req.statut} />
                              </div>
                              <p className="text-xs opacity-60 mt-0.5 flex items-center gap-1">
                                <Clock className="h-3 w-3" />
                                {formatAge(req.requested_at)}
                                {req.pax_count != null && ` · ${req.pax_count} pax`}
                              </p>
                            </div>
                          </div>

                          <div className="shrink-0">
                            {req.statut === 'pending' && isMinigame && !isConfirmOnly && (
                              <button
                                type="button"
                                disabled={isLoading || !!activeGameReqId}
                                onClick={() => handleAccepter(req)}
                                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold transition-colors disabled:opacity-50"
                              >
                                {isLoading && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
                                Effectuer
                              </button>
                            )}
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </section>
          )}
        </div>
      </div>
    </div>
  );
}

function StatutBadge({ statut }: { statut: string }) {
  const config: Record<string, { label: string; cls: string }> = {
    pending:     { label: 'En attente',      cls: 'bg-amber-500/20 text-amber-300' },
    accepted:    { label: 'Pris en charge',  cls: 'bg-sky-500/20 text-sky-300' },
    in_progress: { label: 'En cours',        cls: 'bg-purple-500/20 text-purple-300' },
    completed:   { label: 'Terminé',         cls: 'bg-emerald-500/20 text-emerald-300' },
    rejected:    { label: 'Rejeté',          cls: 'bg-red-500/20 text-red-300' },
    ground_crew_unavailable: { label: 'GC indisponible', cls: 'bg-slate-500/20 text-slate-400' },
  };
  const c = config[statut] ?? config.pending;
  return (
    <span className={`px-2 py-0.5 rounded-full text-[10px] font-semibold ${c.cls}`}>
      {c.label}
    </span>
  );
}
