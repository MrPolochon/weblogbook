'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { ChevronLeft, ChevronRight, Plane, AlertTriangle, Loader2 } from 'lucide-react';

type PlanInfo = { id: string; numero_vol: string; aeroport_depart: string; aeroport_arrivee: string };

export default function AtcLeftSidebar({
  plansAuto,
  plansOrphelins,
  sessionAeroport,
  sessionPosition,
}: {
  plansAuto: PlanInfo[];
  plansOrphelins: PlanInfo[];
  sessionAeroport: string;
  sessionPosition: string;
}) {
  const router = useRouter();
  const [collapsed, setCollapsed] = useState(false);
  const [takingId, setTakingId] = useState<string | null>(null);

  const total = plansAuto.length + plansOrphelins.length;

  async function prendreplan(planId: string) {
    setTakingId(planId);
    try {
      const res = await fetch(`/api/plans-vol/${planId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'transferer', aeroport: sessionAeroport, position: sessionPosition }),
      });
      const d = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(d.error || 'Erreur');
      router.refresh();
    } catch (e) {
      alert(e instanceof Error ? e.message : 'Erreur');
    } finally {
      setTakingId(null);
    }
  }

  const renderItem = (p: PlanInfo, variant: 'auto' | 'orphelin') => {
    const isTaking = takingId === p.id;
    const colors = variant === 'auto'
      ? 'text-slate-700 hover:bg-emerald-100 hover:text-emerald-800'
      : 'text-orange-700 hover:bg-orange-100 hover:text-orange-800';

    return (
      <li key={p.id}>
        <button
          type="button"
          onClick={() => prendreplan(p.id)}
          disabled={takingId !== null}
          className={`w-full text-left text-xs font-mono rounded px-2 py-1.5 leading-tight transition-colors disabled:opacity-50 ${colors}`}
          title={`${p.numero_vol} ${p.aeroport_depart} → ${p.aeroport_arrivee} — Cliquer pour prendre ce vol`}
        >
          <div className="flex items-center gap-1">
            {isTaking && <Loader2 className="h-3 w-3 animate-spin shrink-0" />}
            <span className="font-bold">{p.numero_vol}</span>
          </div>
          <span className={`text-[10px] ${variant === 'auto' ? 'text-slate-500' : 'text-orange-500'}`}>
            {p.aeroport_depart}→{p.aeroport_arrivee}
          </span>
        </button>
      </li>
    );
  };

  return (
    <aside
      className={`atc-sidebar flex-shrink-0 border-r border-slate-300 bg-slate-100 hidden md:flex flex-col relative transition-all duration-200 ease-in-out ${
        collapsed ? 'w-10' : 'w-44'
      }`}
    >
      {/* Toggle button */}
      <button
        type="button"
        onClick={() => setCollapsed((c) => !c)}
        className="absolute -right-3 top-3 z-10 w-6 h-6 rounded-full bg-slate-200 border border-slate-300 shadow-sm flex items-center justify-center hover:bg-slate-300 transition-colors"
        title={collapsed ? 'Ouvrir la sidebar' : 'Réduire la sidebar'}
      >
        {collapsed ? <ChevronRight className="h-3.5 w-3.5 text-slate-600" /> : <ChevronLeft className="h-3.5 w-3.5 text-slate-600" />}
      </button>

      {collapsed ? (
        <div className="flex flex-col items-center pt-10 gap-3">
          {plansAuto.length > 0 && (
            <div className="relative" title={`${plansAuto.length} vol(s) non contrôlé(s)`}>
              <Plane className="h-4 w-4 text-slate-500" />
              <span className="absolute -top-1.5 -right-2 text-[9px] font-bold bg-slate-500 text-white rounded-full w-4 h-4 flex items-center justify-center">{plansAuto.length}</span>
            </div>
          )}
          {plansOrphelins.length > 0 && (
            <div className="relative" title={`${plansOrphelins.length} plan(s) orphelin(s)`}>
              <AlertTriangle className="h-4 w-4 text-orange-500" />
              <span className="absolute -top-1.5 -right-2 text-[9px] font-bold bg-orange-500 text-white rounded-full w-4 h-4 flex items-center justify-center">{plansOrphelins.length}</span>
            </div>
          )}
          {total === 0 && <span className="text-slate-400 text-[10px]">—</span>}
        </div>
      ) : (
        <div className="py-3 px-2 overflow-y-auto flex-1">
          <p className="text-[10px] font-bold uppercase tracking-wider text-slate-500 px-2 mb-1">
            Non contrôlés ({plansAuto.length})
          </p>
          {plansAuto.length === 0 ? (
            <span className="text-slate-500 text-xs px-2 block mb-2">Aucun</span>
          ) : (
            <ul className="space-y-0.5 mb-3">{plansAuto.map((p) => renderItem(p, 'auto'))}</ul>
          )}

          <p className="text-[10px] font-bold uppercase tracking-wider text-orange-600 px-2 mb-1">
            Orphelins ({plansOrphelins.length})
          </p>
          {plansOrphelins.length === 0 ? (
            <span className="text-slate-500 text-xs px-2 block">Aucun</span>
          ) : (
            <ul className="space-y-0.5">{plansOrphelins.map((p) => renderItem(p, 'orphelin'))}</ul>
          )}
        </div>
      )}
    </aside>
  );
}
