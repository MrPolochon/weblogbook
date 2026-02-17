'use client';

import { useState, useMemo, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import {
  Plane, Clock, Building2, Search, ChevronDown, ChevronUp,
  Users, Radio, CheckCircle, XCircle, AlertTriangle, Flame,
} from 'lucide-react';

type ATCControl = {
  user_id: string;
  aeroport: string;
  position: string;
  created_at: string;
  profile: { identifiant: string } | null;
};

type PlanCloture = {
  id: string;
  numero_vol: string;
  aeroport_depart: string;
  aeroport_arrivee: string;
  type_vol: string;
  statut: string;
  created_at: string;
  accepted_at: string | null;
  cloture_at: string | null;
  demande_cloture_at: string | null;
  vol_commercial: boolean;
  vol_ferry: boolean;
  automonitoring: boolean;
  created_by_atc: boolean | null;
  compagnie_id: string | null;
  compagnie_avion_id: string | null;
  pilote: { identifiant: string } | null;
  compagnie: { nom: string } | null;
  compagnie_avion: { id: string; immatriculation: string; detruit: boolean } | null;
  atc_plans_controles: ATCControl[];
};

const PER_PAGE = 30;

function formatDate(dateStr: string | null): string {
  if (!dateStr) return '—';
  const d = new Date(dateStr);
  return d.toLocaleDateString('fr-FR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function duration(start: string, end: string | null): string {
  if (!end) return '—';
  const ms = new Date(end).getTime() - new Date(start).getTime();
  const min = Math.floor(ms / 60000);
  if (min < 60) return `${min}min`;
  const h = Math.floor(min / 60);
  return `${h}h${(min % 60).toString().padStart(2, '0')}`;
}

export default function PlansHistorique({ plans }: { plans: PlanCloture[] }) {
  const router = useRouter();
  const [, startTransition] = useTransition();
  const [search, setSearch] = useState('');
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [page, setPage] = useState(0);
  const [crashingId, setCrashingId] = useState<string | null>(null);
  const [crashConfirmId, setCrashConfirmId] = useState<string | null>(null);

  async function handleCrash(avionId: string) {
    setCrashingId(avionId);
    try {
      const res = await fetch('/api/admin/avions', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: avionId, detruit: true, detruit_raison: 'Crash' }),
      });
      if (!res.ok) {
        const data = await res.json();
        alert(data.error || 'Erreur lors du marquage crash');
        return;
      }
      setCrashConfirmId(null);
      startTransition(() => router.refresh());
    } catch {
      alert('Erreur réseau');
    } finally {
      setCrashingId(null);
    }
  }

  const filtered = useMemo(() => {
    if (!search.trim()) return plans;
    const q = search.toLowerCase();
    return plans.filter(p =>
      p.numero_vol.toLowerCase().includes(q) ||
      p.aeroport_depart.toLowerCase().includes(q) ||
      p.aeroport_arrivee.toLowerCase().includes(q) ||
      (p.pilote?.identifiant || '').toLowerCase().includes(q) ||
      (p.compagnie?.nom || '').toLowerCase().includes(q) ||
      p.atc_plans_controles.some(c =>
        (c.profile?.identifiant || '').toLowerCase().includes(q) ||
        c.aeroport.toLowerCase().includes(q) ||
        c.position.toLowerCase().includes(q)
      )
    );
  }, [plans, search]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / PER_PAGE));
  const paginated = filtered.slice(page * PER_PAGE, (page + 1) * PER_PAGE);

  if (plans.length === 0) {
    return (
      <div className="card text-center py-16">
        <Clock className="h-16 w-16 text-slate-500 mx-auto mb-4" />
        <h2 className="text-xl font-semibold text-slate-200">Aucun plan clôturé</h2>
        <p className="text-slate-400 mt-2">L&apos;historique apparaîtra ici une fois des plans clôturés.</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Search + stats */}
      <div className="flex items-center gap-4 flex-wrap">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
          <input
            type="text"
            placeholder="Rechercher par vol, aéroport, pilote, ATC..."
            value={search}
            onChange={e => { setSearch(e.target.value); setPage(0); }}
            className="w-full pl-10 pr-4 py-2.5 bg-slate-800/50 border border-slate-700/50 rounded-xl text-sm text-slate-200 placeholder-slate-500 focus:outline-none focus:border-sky-500/50 focus:ring-1 focus:ring-sky-500/30"
          />
        </div>
        <span className="text-sm text-slate-400">
          {filtered.length} plan(s) clôturé(s)
        </span>
      </div>

      {/* Plans list */}
      <div className="space-y-3">
        {paginated.map(plan => {
          const isExpanded = expandedId === plan.id;
          const isCloture = plan.statut === 'cloture';
          const isAnnule = plan.statut === 'annule';
          const nbAtc = plan.atc_plans_controles.length;

          return (
            <div
              key={plan.id}
              className={`border rounded-xl overflow-hidden transition-all ${
                isAnnule
                  ? 'bg-red-950/10 border-red-500/20'
                  : 'bg-slate-800/50 border-slate-700/50'
              }`}
            >
              {/* Header row */}
              <button
                onClick={() => setExpandedId(isExpanded ? null : plan.id)}
                className="w-full text-left p-4 hover:bg-slate-700/20 transition-colors"
              >
                <div className="flex items-start gap-3">
                  <div className="flex-1 min-w-0">
                    {/* Top row */}
                    <div className="flex items-center gap-3 flex-wrap">
                      <span className="font-mono font-bold text-lg text-slate-100">
                        {plan.numero_vol}
                      </span>

                      {isCloture && (
                        <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-medium bg-emerald-500/20 border border-emerald-500/30 text-emerald-400">
                          <CheckCircle className="h-3 w-3" /> Clôturé
                        </span>
                      )}
                      {isAnnule && (
                        <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-medium bg-red-500/20 border border-red-500/30 text-red-400">
                          <XCircle className="h-3 w-3" /> Annulé
                        </span>
                      )}
                      {plan.vol_commercial && (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-sky-500/20 border border-sky-500/30 text-sky-400">
                          <Building2 className="h-3 w-3" /> Commercial
                        </span>
                      )}
                      {plan.vol_ferry && (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-amber-500/20 border border-amber-500/30 text-amber-400">
                          Ferry
                        </span>
                      )}
                      {plan.created_by_atc && (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-indigo-500/20 border border-indigo-500/30 text-indigo-400">
                          <Radio className="h-3 w-3" /> Strip manuel
                        </span>
                      )}
                    </div>

                    {/* Route */}
                    <div className="flex items-center gap-2 mt-2">
                      <Plane className="h-4 w-4 text-sky-400" />
                      <span className="font-mono text-sky-300 font-semibold">
                        {plan.aeroport_depart}
                      </span>
                      <span className="text-slate-500">→</span>
                      <span className="font-mono text-sky-300 font-semibold">
                        {plan.aeroport_arrivee}
                      </span>
                      <span className="text-slate-500 text-sm ml-2">{plan.type_vol}</span>
                    </div>

                    {/* Summary info */}
                    <div className="flex items-center gap-4 mt-2 text-sm text-slate-400 flex-wrap">
                      <span>👤 {plan.pilote?.identifiant || (plan.created_by_atc ? 'Strip manuel' : '—')}</span>
                      {plan.compagnie?.nom && <span>🏢 {plan.compagnie.nom}</span>}
                      <span>
                        <Clock className="h-3 w-3 inline mr-1" />
                        {formatDate(plan.cloture_at || plan.created_at)}
                      </span>
                      {nbAtc > 0 && (
                        <span className="inline-flex items-center gap-1 text-violet-400">
                          <Users className="h-3 w-3" />
                          {nbAtc} contrôleur{nbAtc > 1 ? 's' : ''}
                        </span>
                      )}
                      {plan.automonitoring && (
                        <span className="text-purple-400">🔄 Autosurveillance</span>
                      )}
                    </div>
                  </div>

                  {/* Expand chevron */}
                  <div className="flex-shrink-0 mt-1 text-slate-500">
                    {isExpanded ? <ChevronUp className="h-5 w-5" /> : <ChevronDown className="h-5 w-5" />}
                  </div>
                </div>
              </button>

              {/* Expanded details */}
              {isExpanded && (
                <div className="border-t border-slate-700/50 p-4 bg-slate-900/30 space-y-4">
                  {/* Timeline */}
                  <div>
                    <h4 className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">
                      Chronologie
                    </h4>
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                      <div className="bg-slate-800/50 rounded-lg p-3 border border-slate-700/30">
                        <p className="text-xs text-slate-500">Déposé</p>
                        <p className="text-sm text-slate-200 font-medium">{formatDate(plan.created_at)}</p>
                      </div>
                      <div className="bg-slate-800/50 rounded-lg p-3 border border-slate-700/30">
                        <p className="text-xs text-slate-500">Accepté ATC</p>
                        <p className="text-sm text-slate-200 font-medium">{formatDate(plan.accepted_at)}</p>
                      </div>
                      <div className="bg-slate-800/50 rounded-lg p-3 border border-slate-700/30">
                        <p className="text-xs text-slate-500">Clôture demandée</p>
                        <p className="text-sm text-slate-200 font-medium">{formatDate(plan.demande_cloture_at)}</p>
                      </div>
                      <div className="bg-emerald-500/10 rounded-lg p-3 border border-emerald-500/20">
                        <p className="text-xs text-emerald-400">Clôturé</p>
                        <p className="text-sm text-emerald-300 font-medium">{formatDate(plan.cloture_at)}</p>
                      </div>
                    </div>
                    {plan.accepted_at && plan.cloture_at && (
                      <p className="text-xs text-slate-500 mt-2">
                        Durée sous contrôle ATC : <span className="text-slate-300 font-medium">{duration(plan.accepted_at, plan.cloture_at)}</span>
                      </p>
                    )}
                  </div>

                  {/* ATC Controllers */}
                  <div>
                    <h4 className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">
                      Contrôleurs ATC ayant eu le strip
                    </h4>
                    {nbAtc === 0 ? (
                      <p className="text-sm text-slate-500 italic">
                        {plan.automonitoring ? 'Vol en autosurveillance — aucun ATC' : 'Aucun contrôleur enregistré'}
                      </p>
                    ) : (
                      <div className="space-y-2">
                        {plan.atc_plans_controles
                          .sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime())
                          .map((ctrl, idx) => (
                            <div
                              key={`${ctrl.user_id}-${ctrl.aeroport}-${ctrl.position}`}
                              className="flex items-center gap-3 bg-slate-800/60 border border-slate-700/30 rounded-lg px-4 py-2.5"
                            >
                              {/* Order badge */}
                              <div className="flex-shrink-0 w-7 h-7 rounded-full bg-violet-500/20 border border-violet-500/30 flex items-center justify-center">
                                <span className="text-xs font-bold text-violet-400">{idx + 1}</span>
                              </div>

                              {/* Controller info */}
                              <div className="flex-1 min-w-0">
                                <p className="text-sm font-medium text-slate-200">
                                  {ctrl.profile?.identifiant || ctrl.user_id.slice(0, 8)}
                                </p>
                                <p className="text-xs text-slate-400">
                                  {ctrl.position} @ {ctrl.aeroport}
                                </p>
                              </div>

                              {/* Timestamp */}
                              <div className="flex-shrink-0 text-xs text-slate-500">
                                {formatDate(ctrl.created_at)}
                              </div>
                            </div>
                          ))}
                      </div>
                    )}
                  </div>

                  {/* Crash button */}
                  {plan.compagnie_avion && (
                    <div className="border-t border-slate-700/50 pt-4">
                      <div className="flex items-center justify-between">
                        <div className="text-sm text-slate-400">
                          Avion : <span className="font-mono font-semibold text-slate-200">{plan.compagnie_avion.immatriculation}</span>
                          {plan.compagnie_avion.detruit && (
                            <span className="ml-2 inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-red-500/20 border border-red-500/30 text-red-400">
                              <Flame className="h-3 w-3" /> Détruit
                            </span>
                          )}
                        </div>
                        {!plan.compagnie_avion.detruit && (
                          <>
                            {crashConfirmId === plan.compagnie_avion.id ? (
                              <div className="flex items-center gap-2">
                                <span className="text-xs text-red-400">Confirmer la destruction ?</span>
                                <button
                                  onClick={() => handleCrash(plan.compagnie_avion!.id)}
                                  disabled={crashingId === plan.compagnie_avion.id}
                                  className="px-3 py-1.5 rounded-lg text-xs font-semibold bg-red-600 hover:bg-red-700 text-white transition-colors disabled:opacity-50"
                                >
                                  {crashingId === plan.compagnie_avion.id ? 'En cours...' : 'Oui, détruire'}
                                </button>
                                <button
                                  onClick={() => setCrashConfirmId(null)}
                                  className="px-3 py-1.5 rounded-lg text-xs font-medium bg-slate-700 hover:bg-slate-600 text-slate-300 transition-colors"
                                >
                                  Annuler
                                </button>
                              </div>
                            ) : (
                              <button
                                onClick={() => setCrashConfirmId(plan.compagnie_avion!.id)}
                                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold bg-red-500/20 border border-red-500/30 text-red-400 hover:bg-red-500/30 hover:text-red-300 transition-colors"
                              >
                                <Flame className="h-3.5 w-3.5" />
                                Crash
                              </button>
                            )}
                          </>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-center gap-2 pt-2">
          <button
            onClick={() => setPage(p => Math.max(0, p - 1))}
            disabled={page === 0}
            className="px-3 py-1.5 rounded-lg text-sm bg-slate-800 border border-slate-700/50 text-slate-300 hover:bg-slate-700 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
          >
            ← Précédent
          </button>
          <span className="text-sm text-slate-400">
            Page {page + 1} / {totalPages}
          </span>
          <button
            onClick={() => setPage(p => Math.min(totalPages - 1, p + 1))}
            disabled={page >= totalPages - 1}
            className="px-3 py-1.5 rounded-lg text-sm bg-slate-800 border border-slate-700/50 text-slate-300 hover:bg-slate-700 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
          >
            Suivant →
          </button>
        </div>
      )}
    </div>
  );
}
