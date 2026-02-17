'use client';

import { useState } from 'react';
import { AlertTriangle, X, Check, Clock, Plane, Building2, DollarSign } from 'lucide-react';

type Plan = {
  id: string;
  numero_vol: string;
  aeroport_depart: string;
  aeroport_arrivee: string;
  type_vol: string;
  statut: string;
  temps_prev_min: number;
  created_at: string;
  accepted_at: string | null;
  vol_commercial: boolean;
  vol_ferry: boolean;
  automonitoring: boolean;
  vol_sans_atc: boolean;
  compagnie_id: string | null;
  nature_transport: string | null;
  nb_pax_genere: number | null;
  cargo_kg_genere: number | null;
  revenue_brut: number | null;
  salaire_pilote: number | null;
  current_holder_user_id: string | null;
  current_holder_position: string | null;
  current_holder_aeroport: string | null;
  pilote: { identifiant: string } | null;
  compagnie: { nom: string } | null;
};

const STATUT_CONFIG: Record<string, { label: string; color: string; bg: string }> = {
  depose: { label: 'Déposé', color: 'text-slate-300', bg: 'bg-slate-500/20 border-slate-500/30' },
  en_attente: { label: 'En attente ATC', color: 'text-amber-400', bg: 'bg-amber-500/20 border-amber-500/30' },
  accepte: { label: 'Accepté', color: 'text-emerald-400', bg: 'bg-emerald-500/20 border-emerald-500/30' },
  en_cours: { label: 'En cours', color: 'text-sky-400', bg: 'bg-sky-500/20 border-sky-500/30' },
  automonitoring: { label: 'Autosurveillance', color: 'text-purple-400', bg: 'bg-purple-500/20 border-purple-500/30' },
  en_attente_cloture: { label: 'Clôture demandée', color: 'text-orange-400', bg: 'bg-orange-500/20 border-orange-500/30' },
};

function timeAgo(dateStr: string): string {
  const now = new Date();
  const date = new Date(dateStr);
  const diffMs = now.getTime() - date.getTime();
  const diffMin = Math.floor(diffMs / 60000);
  if (diffMin < 60) return `${diffMin}min`;
  const diffH = Math.floor(diffMin / 60);
  if (diffH < 24) return `${diffH}h${diffMin % 60}min`;
  const diffD = Math.floor(diffH / 24);
  return `${diffD}j ${diffH % 24}h`;
}

function isOver24h(dateStr: string): boolean {
  return (Date.now() - new Date(dateStr).getTime()) > 24 * 3600000;
}

function getAmende(plan: Plan): number {
  const ref = plan.accepted_at || plan.created_at;
  return isOver24h(ref) ? 100000 : 50000;
}

function getActionLabel(plan: Plan): string {
  const ref = plan.accepted_at || plan.created_at;
  const montant = getAmende(plan);
  return isOver24h(ref) ? `Annuler (-${(montant / 1000)}k F$)` : `Clôturer (-${(montant / 1000)}k F$)`;
}

export default function PlansNonClotures({ plans: initialPlans }: { plans: Plan[] }) {
  const [plans, setPlans] = useState<Plan[]>(initialPlans);
  const [closing, setClosing] = useState<string | null>(null);
  const [confirmId, setConfirmId] = useState<string | null>(null);
  const [results, setResults] = useState<Record<string, { success: boolean; message: string }>>({});
  const [selectedAll, setSelectedAll] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [bulkClosing, setBulkClosing] = useState(false);

  async function forceClose(planId: string) {
    setClosing(planId);
    setConfirmId(null);
    try {
      const res = await fetch(`/api/plans-vol/${planId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'cloture_forcee' }),
      });
      const data = await res.json();
      if (data.ok) {
        setPlans(prev => prev.filter(p => p.id !== planId));
        const label = data.annule ? 'Annulé' : 'Clôturé';
        setResults(prev => ({ ...prev, [planId]: { success: true, message: `${label} — Amende ${data.amende?.toLocaleString('fr-FR') || ''} F$ ${data.amendeAppliquee ? 'prélevée' : 'non appliquée (aucun compte)'}` } }));
        setSelected(prev => { const n = new Set(prev); n.delete(planId); return n; });
      } else {
        setResults(prev => ({ ...prev, [planId]: { success: false, message: data.error || 'Erreur' } }));
      }
    } catch {
      setResults(prev => ({ ...prev, [planId]: { success: false, message: 'Erreur réseau' } }));
    }
    setClosing(null);
  }

  async function bulkForceClose() {
    if (selected.size === 0) return;
    setBulkClosing(true);
    const ids = Array.from(selected);
    for (const id of ids) {
      await forceClose(id);
    }
    setBulkClosing(false);
    setSelectedAll(false);
  }

  function toggleAll() {
    if (selectedAll) {
      setSelected(new Set());
      setSelectedAll(false);
    } else {
      setSelected(new Set(plans.map(p => p.id)));
      setSelectedAll(true);
    }
  }

  function toggleOne(id: string) {
    setSelected(prev => {
      const n = new Set(prev);
      if (n.has(id)) n.delete(id); else n.add(id);
      return n;
    });
  }

  if (plans.length === 0) {
    return (
      <div className="card text-center py-16">
        <Check className="h-16 w-16 text-emerald-400 mx-auto mb-4" />
        <h2 className="text-xl font-semibold text-slate-200">Aucun plan non clôturé</h2>
        <p className="text-slate-400 mt-2">Tous les plans de vol sont en ordre.</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Bulk actions */}
      <div className="flex items-center justify-between bg-slate-800/50 border border-slate-700/50 rounded-xl px-4 py-3">
        <label className="flex items-center gap-3 cursor-pointer">
          <input type="checkbox" checked={selectedAll} onChange={toggleAll} className="w-4 h-4 rounded border-slate-500 bg-slate-700 text-red-500 focus:ring-red-500" />
          <span className="text-sm text-slate-300">Tout sélectionner ({plans.length})</span>
        </label>
        {selected.size > 0 && (
          <button
            onClick={bulkForceClose}
            disabled={bulkClosing}
            className="flex items-center gap-2 bg-red-600 hover:bg-red-700 disabled:opacity-50 text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors"
          >
            <AlertTriangle className="h-4 w-4" />
            {bulkClosing ? 'Clôture en cours...' : `Clôturer/Annuler ${selected.size} plan(s) — ${plans.filter(p => selected.has(p.id)).reduce((sum, p) => sum + getAmende(p), 0).toLocaleString('fr-FR')} F$ d'amendes`}
          </button>
        )}
      </div>

      {/* Results toast */}
      {Object.entries(results).map(([id, r]) => (
        <div key={id} className={`flex items-center gap-3 px-4 py-3 rounded-lg border ${r.success ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-400' : 'bg-red-500/10 border-red-500/30 text-red-400'}`}>
          {r.success ? <Check className="h-4 w-4 flex-shrink-0" /> : <X className="h-4 w-4 flex-shrink-0" />}
          <span className="text-sm">{r.message}</span>
          <button onClick={() => setResults(prev => { const n = { ...prev }; delete n[id]; return n; })} className="ml-auto text-slate-500 hover:text-slate-300"><X className="h-3 w-3" /></button>
        </div>
      ))}

      {/* Plans list */}
      <div className="space-y-3">
        {plans.map(plan => {
          const config = STATUT_CONFIG[plan.statut] || { label: plan.statut, color: 'text-slate-400', bg: 'bg-slate-500/20 border-slate-500/30' };
          const age = plan.accepted_at ? timeAgo(plan.accepted_at) : timeAgo(plan.created_at);
          const isOld = (() => {
            const ref = plan.accepted_at || plan.created_at;
            return (Date.now() - new Date(ref).getTime()) > 2 * 3600000; // > 2h
          })();

          return (
            <div key={plan.id} className={`relative border rounded-xl p-4 transition-all ${isOld ? 'bg-red-950/20 border-red-500/30' : 'bg-slate-800/50 border-slate-700/50'} ${selected.has(plan.id) ? 'ring-2 ring-red-500/50' : ''}`}>
              <div className="flex items-start gap-3">
                <input
                  type="checkbox"
                  checked={selected.has(plan.id)}
                  onChange={() => toggleOne(plan.id)}
                  className="mt-1 w-4 h-4 rounded border-slate-500 bg-slate-700 text-red-500 focus:ring-red-500"
                />

                <div className="flex-1 min-w-0">
                  {/* Header */}
                  <div className="flex items-center gap-3 flex-wrap">
                    <span className="font-mono font-bold text-lg text-slate-100">{plan.numero_vol}</span>
                    <span className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-medium border ${config.bg} ${config.color}`}>
                      {config.label}
                    </span>
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
                    {isOld && (
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-red-500/20 border border-red-500/30 text-red-400">
                        <AlertTriangle className="h-3 w-3" /> Ancien ({age})
                      </span>
                    )}
                  </div>

                  {/* Route */}
                  <div className="flex items-center gap-2 mt-2">
                    <Plane className="h-4 w-4 text-sky-400" />
                    <span className="font-mono text-sky-300 font-semibold">{plan.aeroport_depart}</span>
                    <span className="text-slate-500">→</span>
                    <span className="font-mono text-sky-300 font-semibold">{plan.aeroport_arrivee}</span>
                    <span className="text-slate-500 text-sm ml-2">{plan.type_vol} • {plan.temps_prev_min}min prévues</span>
                  </div>

                  {/* Details */}
                  <div className="flex items-center gap-4 mt-2 text-sm text-slate-400 flex-wrap">
                    <span>👤 {plan.pilote?.identifiant || '?'}</span>
                    {plan.compagnie?.nom && <span>🏢 {plan.compagnie.nom}</span>}
                    <span><Clock className="h-3 w-3 inline mr-1" />Ouvert depuis {age}</span>
                    {plan.current_holder_position && plan.current_holder_aeroport && (
                      <span>📡 {plan.current_holder_position} @ {plan.current_holder_aeroport}</span>
                    )}
                    {plan.automonitoring && <span className="text-purple-400">🔄 Autosurveillance</span>}
                  </div>

                  {/* Financial info for commercial flights */}
                  {plan.vol_commercial && (plan.revenue_brut || plan.nb_pax_genere || plan.cargo_kg_genere) && (
                    <div className="flex items-center gap-4 mt-2 text-xs text-slate-500">
                      {plan.nature_transport === 'passagers' && plan.nb_pax_genere && <span>👥 {plan.nb_pax_genere} PAX</span>}
                      {plan.nature_transport === 'cargo' && plan.cargo_kg_genere && <span>📦 {plan.cargo_kg_genere} kg</span>}
                      {plan.revenue_brut && <span><DollarSign className="h-3 w-3 inline" />{plan.revenue_brut.toLocaleString('fr-FR')} F$ brut</span>}
                    </div>
                  )}
                </div>

                {/* Action button */}
                <div className="flex-shrink-0">
                  {confirmId === plan.id ? (
                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => forceClose(plan.id)}
                        disabled={closing === plan.id}
                        className="bg-red-600 hover:bg-red-700 disabled:opacity-50 text-white px-3 py-1.5 rounded-lg text-xs font-medium transition-colors"
                      >
                        {closing === plan.id ? '...' : 'Confirmer'}
                      </button>
                      <button
                        onClick={() => setConfirmId(null)}
                        className="text-slate-400 hover:text-slate-200 px-2 py-1.5 rounded-lg text-xs"
                      >
                        Non
                      </button>
                    </div>
                  ) : (
                    <button
                      onClick={() => setConfirmId(plan.id)}
                      className="flex items-center gap-1.5 bg-red-600/20 hover:bg-red-600 border border-red-500/30 hover:border-red-500 text-red-400 hover:text-white px-3 py-1.5 rounded-lg text-xs font-medium transition-all"
                    >
                      <AlertTriangle className="h-3.5 w-3.5" />
                      {getActionLabel(plan)}
                    </button>
                  )}
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
