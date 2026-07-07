'use client';

import { useState, useEffect, useCallback } from 'react';
import { createClient } from '@/lib/supabase/client';
import {
  ChevronLeft, Package, Utensils, Fuel, Users, Loader2,
  MapPin, CheckCircle2, Clock, AlertTriangle, X, Users2,
  ArrowLeftRight, Navigation,
} from 'lucide-react';
import type { GroundServiceRequest, ServiceType, BoardingStatus } from '@/lib/types';

interface Props {
  planVolId: string;
  aeroportDepart: string;
  aeroportArrivee: string;
  statut: string;
  porteDepart: string | null;
  paxCount?: number | null;
}

type RepoussageDirection = 'gauche' | 'droite';

const SERVICE_CONFIG: Partial<Record<ServiceType, { label: string; icon: React.ReactNode; color: string }>> = {
  bagages:  { label: 'Bagages',   icon: <Package className="h-4 w-4" />,       color: 'amber' },
  catering: { label: 'Catering',  icon: <Utensils className="h-4 w-4" />,      color: 'emerald' },
  fuel:     { label: 'Carburant', icon: <Fuel className="h-4 w-4" />,          color: 'sky' },
  boarding: { label: 'Boarding',  icon: <Users className="h-4 w-4" />,         color: 'purple' },
  repoussage:  { label: 'Repoussage',  icon: <ArrowLeftRight className="h-4 w-4" />, color: 'orange' },
  marshalling: { label: 'Marshalling', icon: <Navigation className="h-4 w-4" />,     color: 'red' },
};

export default function ServicesAuSolPanel({
  planVolId, aeroportDepart, aeroportArrivee, statut, porteDepart, paxCount,
}: Props) {
  const [open, setOpen] = useState(false);
  const [requests, setRequests] = useState<GroundServiceRequest[]>([]);
  const [boarding, setBoarding] = useState<BoardingStatus | null>(null);
  const [porteArrivee, setPorteArrivee] = useState<string | null>(null);
  const [groundAvailable, setGroundAvailable] = useState<Record<string, boolean>>({});
  const [groundUnavailableReason, setGroundUnavailableReason] = useState<'no_gc' | 'gc_unavailable' | null>(null);
  const [assignedTeamInfo, setAssignedTeamInfo] = useState<{ nb_membres: number } | null>(null);
  const [loading, setLoading] = useState<Partial<Record<ServiceType | 'repoussage_gauche' | 'repoussage_droite', boolean>>>({});
  const [groundCheckDone, setGroundCheckDone] = useState(false);
  const [repoussageMenuOpen, setRepoussageMenuOpen] = useState(false);
  const [confirmLoading, setConfirmLoading] = useState<string | null>(null);

  const currentAeroport = aeroportDepart;

  const loadData = useCallback(async () => {
    const [reqRes, boardingRes, gateRes, groundRes] = await Promise.all([
      fetch(`/api/ground/service-requests?plan_vol_id=${planVolId}`),
      fetch(`/api/ground/boarding?plan_vol_id=${planVolId}`),
      fetch(`/api/ground/gates?aeroport=${currentAeroport}`),
      fetch(`/api/ground/session?aeroport=${currentAeroport}`),
    ]);

    if (reqRes.ok) {
      const d = await reqRes.json() as { requests?: GroundServiceRequest[] };
      const reqs = d.requests ?? [];
      setRequests(reqs);

      const hasUnavailable = reqs.some(r => r.statut === 'ground_crew_unavailable');
      setGroundUnavailableReason(prev => hasUnavailable ? 'gc_unavailable' : prev === 'gc_unavailable' ? null : prev);

      const assignedReq = reqs.find(r => r.team_id && r.statut !== 'ground_crew_unavailable');
      setAssignedTeamInfo(assignedReq?.team_id ? { nb_membres: 1 } : null);
    }
    if (boardingRes.ok) {
      const d = await boardingRes.json() as { boarding?: BoardingStatus };
      setBoarding(d.boarding ?? null);
    }
    if (gateRes.ok) {
      const d = await gateRes.json() as { gates?: Array<{ gate_code?: string; assignment?: { assignment_type: string } | null }> };
      const assigned = (d.gates ?? []).find(g => g.assignment?.assignment_type === 'arrivee');
      if (assigned) setPorteArrivee(assigned.gate_code ?? null);
    }
    if (groundRes.ok) {
      const d = await groundRes.json() as { session?: { aeroport: string } | null };
      const available = !!d.session;
      setGroundAvailable({ [currentAeroport]: available });
      if (!available) setGroundUnavailableReason(prev => prev ?? 'no_gc');
      else setGroundUnavailableReason(null);
    }
    setGroundCheckDone(true);
  }, [planVolId, currentAeroport]);

  useEffect(() => {
    if (!open) return;
    loadData();
    const supabase = createClient();
    const channel = supabase
      .channel(`pilot-service-${planVolId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'ground_service_requests', filter: `plan_vol_id=eq.${planVolId}` }, () => { loadData(); })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'boarding_status', filter: `plan_vol_id=eq.${planVolId}` }, () => { loadData(); })
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [open, loadData]);

  async function requestService(type: ServiceType, direction?: RepoussageDirection) {
    const key = direction ? `repoussage_${direction}` as const : type;
    setLoading(prev => ({ ...prev, [key]: true }));
    setRepoussageMenuOpen(false);
    try {
      await fetch('/api/ground/service-requests', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          plan_vol_id: planVolId,
          aeroport: currentAeroport,
          service_type: type,
          pax_count: type === 'boarding' ? (paxCount ?? undefined) : undefined,
          direction: direction ?? undefined,
        }),
      });
      await loadData();
    } finally {
      setLoading(prev => ({ ...prev, [key]: false }));
    }
  }

  // Pilote confirme la fin d'un service (marshalling / repoussage)
  async function confirmServiceDone(reqId: string) {
    setConfirmLoading(reqId);
    try {
      await fetch(`/api/ground/service-requests/${reqId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ pilote_confirme: true }),
      });
      await loadData();
    } finally {
      setConfirmLoading(null);
    }
  }

  async function startBoarding() {
    if (!paxCount || paxCount <= 0) return;
    await fetch('/api/ground/boarding', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ plan_vol_id: planVolId, action: 'start', total_pax: paxCount }),
    });
    await loadData();
  }

  const isGroundAvailable = groundAvailable[currentAeroport] ?? false;
  const boardingPct = boarding && boarding.total_pax > 0 ? Math.round((boarding.pax_embarques / boarding.total_pax) * 100) : 0;
  const boardingIncomplet = boarding && boarding.statut !== 'completed' && boarding.pax_embarques < (boarding?.total_pax ?? 0);
  const malusBoarding = boardingIncomplet && boarding ? Math.round(((boarding.total_pax - boarding.pax_embarques) / boarding.total_pax) * 0.3 * 100) : 0;

  // Demandes actives par type
  const activeReq = (type: ServiceType) =>
    requests.find(r => r.service_type === type && ['pending', 'accepted', 'in_progress'].includes(r.statut));

  const marshallingActive = activeReq('marshalling');
  const repoussageActive = activeReq('repoussage');

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        title="Services au Sol"
        className="fixed right-0 top-1/2 -translate-y-1/2 z-30 flex flex-col items-center justify-center gap-1 rounded-l-xl border border-r-0 border-emerald-700/50 bg-emerald-900/30 px-2 py-4 hover:bg-emerald-900/50 transition-colors shadow-xl"
      >
        <Wrench className="h-4 w-4 text-emerald-400" />
        <ChevronLeft className="h-3 w-3 text-emerald-400" />
        <span className="text-[9px] font-bold text-emerald-400" style={{ writingMode: 'vertical-rl', transform: 'rotate(180deg)' }}>
          Sol
        </span>
      </button>

      {open && (
        <>
          <div className="fixed inset-0 z-40 bg-black/40 backdrop-blur-sm" onClick={() => setOpen(false)} />
          <div className="fixed right-0 top-0 bottom-0 z-50 w-full max-w-sm bg-[#0a0f1c] border-l border-slate-700/50 shadow-2xl flex flex-col">
            {/* Header */}
            <div className="flex items-center justify-between px-4 py-3 border-b border-slate-700/50 bg-slate-800/30">
              <div className="flex items-center gap-2">
                <Wrench className="h-4 w-4 text-emerald-400" />
                <span className="font-bold text-slate-100 text-sm">Services au Sol</span>
              </div>
              <button type="button" onClick={() => setOpen(false)} className="flex items-center justify-center h-8 w-8 rounded-lg border border-slate-700/50 text-slate-400 hover:text-slate-200">
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto p-4 space-y-5">

              {/* Portes */}
              <section>
                <h3 className="text-xs font-bold uppercase tracking-wider text-slate-500 mb-2">Portes</h3>
                <div className="grid grid-cols-2 gap-2">
                  <div className="rounded-xl border border-emerald-800/40 bg-emerald-900/10 p-3">
                    <p className="text-[10px] text-emerald-400/80 uppercase font-medium">DÃ©part</p>
                    <p className="text-lg font-bold text-emerald-300 mt-0.5">
                      {porteDepart ?? <span className="text-slate-500 text-sm">Non assignÃ©e</span>}
                    </p>
                    <div className="flex items-center gap-1 text-[10px] text-slate-500 mt-1">
                      <MapPin className="h-2.5 w-2.5" />{aeroportDepart}
                    </div>
                  </div>
                  <div className="rounded-xl border border-sky-800/40 bg-sky-900/10 p-3">
                    <p className="text-[10px] text-sky-400/80 uppercase font-medium">ArrivÃ©e</p>
                    <p className="text-lg font-bold text-sky-300 mt-0.5">
                      {porteArrivee ?? <span className="text-slate-500 text-sm">En attente</span>}
                    </p>
                    <div className="flex items-center gap-1 text-[10px] text-slate-500 mt-1">
                      <MapPin className="h-2.5 w-2.5" />{aeroportArrivee}
                    </div>
                  </div>
                </div>
              </section>

              {/* Ã‰quipe */}
              {assignedTeamInfo && (
                <div className="flex items-center gap-2 rounded-xl border border-emerald-800/40 bg-emerald-900/10 px-3 py-2.5 text-sm text-emerald-300">
                  <Users2 className="h-4 w-4 shrink-0" />Pris en charge par le ground crew
                </div>
              )}

              {/* DisponibilitÃ© */}
              {groundCheckDone && groundUnavailableReason === 'gc_unavailable' && (
                <div className="flex items-center gap-2 rounded-xl border border-amber-700/40 bg-amber-900/10 px-3 py-2.5 text-sm text-amber-300">
                  <AlertTriangle className="h-4 w-4 shrink-0" />Aucun ground crew disponible
                </div>
              )}
              {groundCheckDone && !isGroundAvailable && groundUnavailableReason === 'no_gc' && (
                <div className="flex items-center gap-2 rounded-xl border border-slate-700/40 bg-slate-800/20 px-3 py-2.5 text-sm text-slate-400">
                  <AlertTriangle className="h-4 w-4 text-amber-400 shrink-0" />Aucun ground crew en service sur {currentAeroport}
                </div>
              )}

              {/* Services de base (bagages / catering / fuel / boarding) */}
              <section>
                <h3 className="text-xs font-bold uppercase tracking-wider text-slate-500 mb-2">Services</h3>
                <div className="grid grid-cols-2 gap-2">
                  {(Object.keys(SERVICE_CONFIG) as ServiceType[]).map((type) => {
                    const cfg = SERVICE_CONFIG[type]!;
                    const existing = activeReq(type);
                    const isLoadingBtn = loading[type];
                    const disabled = !isGroundAvailable || !!existing || !!isLoadingBtn;
                    return (
                      <button
                        key={type}
                        type="button"
                        disabled={disabled}
                        onClick={() => !disabled && requestService(type)}
                        className={`relative rounded-xl border p-3 text-left transition-colors ${
                          existing ? `border-${cfg.color}-800/40 bg-${cfg.color}-900/10`
                          : disabled ? 'border-slate-700/30 bg-slate-800/20 opacity-50 cursor-not-allowed'
                          : `border-slate-700/40 bg-slate-800/20 hover:border-${cfg.color}-700/50 hover:bg-${cfg.color}-900/10 cursor-pointer`
                        }`}
                      >
                        <div className="flex items-center gap-2 mb-1">
                          <span className={`text-${cfg.color}-400`}>{cfg.icon}</span>
                          <span className="text-xs font-semibold text-slate-200">{cfg.label}</span>
                        </div>
                        {isLoadingBtn ? <Loader2 className="h-3.5 w-3.5 animate-spin text-slate-400" />
                          : existing ? <StatusBadge statut={existing.statut} />
                          : null}
                      </button>
                    );
                  })}
                </div>
              </section>

              {/* Marshalling */}
              <section>
                <h3 className="text-xs font-bold uppercase tracking-wider text-slate-500 mb-2">OpÃ©rations avion</h3>
                <div className="space-y-2">
                  {/* Marshalling */}
                  {marshallingActive ? (
                    <div className={`rounded-xl border p-3 space-y-2 ${
                      marshallingActive.statut === 'pending' ? 'border-red-700/50 bg-red-900/10' : 'border-sky-700/50 bg-sky-900/10'
                    }`}>
                      <div className="flex items-center gap-2">
                        <Navigation className="h-4 w-4 text-red-400" />
                        <span className="text-xs font-semibold text-slate-200">Marshalling</span>
                        <StatusBadge statut={marshallingActive.statut} />
                      </div>
                      {marshallingActive.statut === 'accepted' && !marshallingActive.pilote_confirme && (
                        <button
                          type="button"
                          disabled={confirmLoading === marshallingActive.id}
                          onClick={() => confirmServiceDone(marshallingActive.id)}
                          className="w-full flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-lg bg-emerald-700 hover:bg-emerald-600 text-white text-xs font-bold transition-colors disabled:opacity-50"
                        >
                          {confirmLoading === marshallingActive.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <CheckCircle2 className="h-3.5 w-3.5" />}
                          Confirmer terminÃ©
                        </button>
                      )}
                      {marshallingActive.pilote_confirme && (
                        <p className="text-xs text-emerald-400 flex items-center gap-1">
                          <CheckCircle2 className="h-3.5 w-3.5" />Confirmation envoyÃ©e au GC
                        </p>
                      )}
                    </div>
                  ) : (
                    <button
                      type="button"
                      disabled={!isGroundAvailable || !!loading.marshalling}
                      onClick={() => requestService('marshalling')}
                      className="w-full flex items-center gap-2 rounded-xl border border-red-800/40 bg-red-900/10 hover:bg-red-900/20 p-3 text-sm font-semibold text-red-300 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      {loading.marshalling ? <Loader2 className="h-4 w-4 animate-spin" /> : <Navigation className="h-4 w-4" />}
                      Demander Marshalling
                    </button>
                  )}

                  {/* Repoussage */}
                  {repoussageActive ? (
                    <div className={`rounded-xl border p-3 space-y-2 ${
                      repoussageActive.statut === 'pending' ? 'border-orange-700/50 bg-orange-900/10' : 'border-sky-700/50 bg-sky-900/10'
                    }`}>
                      <div className="flex items-center gap-2">
                        <ArrowLeftRight className="h-4 w-4 text-orange-400" />
                        <span className="text-xs font-semibold text-slate-200">
                          Repoussage {repoussageActive.direction === 'gauche' ? 'â† Gauche' : 'â†’ Droite'}
                        </span>
                        <StatusBadge statut={repoussageActive.statut} />
                      </div>
                      {repoussageActive.statut === 'accepted' && !repoussageActive.pilote_confirme && (
                        <button
                          type="button"
                          disabled={confirmLoading === repoussageActive.id}
                          onClick={() => confirmServiceDone(repoussageActive.id)}
                          className="w-full flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-lg bg-emerald-700 hover:bg-emerald-600 text-white text-xs font-bold transition-colors disabled:opacity-50"
                        >
                          {confirmLoading === repoussageActive.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <CheckCircle2 className="h-3.5 w-3.5" />}
                          Confirmer terminÃ©
                        </button>
                      )}
                      {repoussageActive.pilote_confirme && (
                        <p className="text-xs text-emerald-400 flex items-center gap-1">
                          <CheckCircle2 className="h-3.5 w-3.5" />Confirmation envoyÃ©e au GC
                        </p>
                      )}
                    </div>
                  ) : (
                    <div className="relative">
                      <button
                        type="button"
                        disabled={!isGroundAvailable || !!loading.repoussage_gauche || !!loading.repoussage_droite}
                        onClick={() => setRepoussageMenuOpen(v => !v)}
                        className="w-full flex items-center gap-2 rounded-xl border border-orange-800/40 bg-orange-900/10 hover:bg-orange-900/20 p-3 text-sm font-semibold text-orange-300 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                      >
                        <ArrowLeftRight className="h-4 w-4" />
                        Demander Repoussage
                        <span className="ml-auto text-slate-500 text-xs">â–¾</span>
                      </button>
                      {repoussageMenuOpen && (
                        <div className="absolute left-0 right-0 top-full mt-1 z-10 rounded-xl border border-orange-800/40 bg-slate-900 shadow-xl overflow-hidden">
                          <button
                            type="button"
                            onClick={() => requestService('repoussage', 'gauche')}
                            className="w-full flex items-center gap-2 px-4 py-3 text-sm text-orange-300 hover:bg-orange-900/20 transition-colors"
                          >
                            {loading.repoussage_gauche ? <Loader2 className="h-4 w-4 animate-spin" /> : <span>â†</span>}
                            Pushback Left (Gauche)
                          </button>
                          <button
                            type="button"
                            onClick={() => requestService('repoussage', 'droite')}
                            className="w-full flex items-center gap-2 px-4 py-3 text-sm text-orange-300 hover:bg-orange-900/20 transition-colors border-t border-orange-800/30"
                          >
                            {loading.repoussage_droite ? <Loader2 className="h-4 w-4 animate-spin" /> : <span>â†’</span>}
                            Pushback Right (Droite)
                          </button>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              </section>

              {/* Boarding */}
              {paxCount && paxCount > 0 && (
                <section>
                  <h3 className="text-xs font-bold uppercase tracking-wider text-slate-500 mb-2">Boarding ({paxCount} pax)</h3>
                  {boarding ? (
                    <div className="rounded-xl border border-purple-800/40 bg-purple-900/10 p-3 space-y-2">
                      <div className="flex items-center justify-between text-sm">
                        <span className="text-slate-300 font-medium">{boarding.pax_embarques}/{boarding.total_pax} embarquÃ©s</span>
                        <span className={`text-xs font-semibold ${boarding.statut === 'completed' ? 'text-emerald-400' : boarding.statut === 'in_progress' ? 'text-purple-400' : 'text-slate-400'}`}>
                          {boarding.statut === 'completed' ? 'âœ“ TerminÃ©' : boarding.statut === 'in_progress' ? 'En cours' : 'Non dÃ©marrÃ©'}
                        </span>
                      </div>
                      <div className="h-2 rounded-full bg-slate-700 overflow-hidden">
                        <div className={`h-full ${boarding.statut === 'completed' ? 'bg-emerald-500' : 'bg-purple-500'} transition-all`} style={{ width: `${boardingPct}%` }} />
                      </div>
                      {boardingIncomplet && malusBoarding > 0 && (
                        <div className="flex items-center gap-1.5 text-xs text-amber-400">
                          <AlertTriangle className="h-3.5 w-3.5" />DÃ©part anticipÃ© : malus -{malusBoarding}%
                        </div>
                      )}
                    </div>
                  ) : (
                    <button
                      type="button"
                      onClick={startBoarding}
                      className="w-full rounded-xl border border-purple-800/40 bg-purple-900/10 hover:bg-purple-900/20 p-3 text-sm font-semibold text-purple-300 transition-colors flex items-center justify-center gap-2"
                    >
                      <Users className="h-4 w-4" />DÃ©marrer le boarding
                    </button>
                  )}
                </section>
              )}

              {/* Historique */}
              {requests.length > 0 && (
                <section>
                  <h3 className="text-xs font-bold uppercase tracking-wider text-slate-500 mb-2">Historique</h3>
                  <div className="space-y-1.5">
                    {requests.slice(0, 6).map((req) => {
                      const type = req.service_type as ServiceType;
                      const icons: Partial<Record<ServiceType, React.ReactNode>> = {
                        bagages: <Package className="h-3 w-3 text-amber-400" />,
                        catering: <Utensils className="h-3 w-3 text-emerald-400" />,
                        fuel: <Fuel className="h-3 w-3 text-sky-400" />,
                        boarding: <Users className="h-3 w-3 text-purple-400" />,
                        repoussage: <ArrowLeftRight className="h-3 w-3 text-orange-400" />,
                        marshalling: <Navigation className="h-3 w-3 text-red-400" />,
                      };
                      const labels: Record<ServiceType, string> = {
                        bagages: 'Bagages', catering: 'Catering', fuel: 'Carburant',
                        boarding: 'Boarding', repoussage: 'Repoussage', marshalling: 'Marshalling',
                      };
                      return (
                        <div key={req.id} className="flex items-center gap-2 rounded-lg border border-slate-700/30 bg-slate-800/20 px-3 py-2">
                          {icons[type]}
                          <span className="text-xs text-slate-300 flex-1">{labels[type]}</span>
                          <StatusBadge statut={req.statut} />
                          {req.montant_paye && (
                            <span className="text-xs text-emerald-400">{req.montant_paye.toLocaleString()} F$</span>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </section>
              )}
            </div>
          </div>
        </>
      )}
    </>
  );
}

function StatusBadge({ statut }: { statut: string }) {
  const config: Record<string, { label: string; color: string; icon: React.ReactNode }> = {
    pending:     { label: 'En attente',    color: 'text-amber-400',  icon: <Clock className="h-3 w-3" /> },
    accepted:    { label: 'Pris en charge',color: 'text-sky-400',    icon: <CheckCircle2 className="h-3 w-3" /> },
    in_progress: { label: 'En cours',      color: 'text-purple-400', icon: <Loader2 className="h-3 w-3" /> },
    completed:   { label: 'TerminÃ©',       color: 'text-emerald-400',icon: <CheckCircle2 className="h-3 w-3" /> },
    rejected:    { label: 'RejetÃ©',        color: 'text-red-400',    icon: <X className="h-3 w-3" /> },
  };
  const c = config[statut] ?? config.pending;
  return (
    <span className={`flex items-center gap-1 text-[10px] font-semibold ${c.color}`}>
      {c.icon}{c.label}
    </span>
  );
}

function Wrench({ className }: { className?: string }) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className={className}>
      <path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z" />
    </svg>
  );
}
