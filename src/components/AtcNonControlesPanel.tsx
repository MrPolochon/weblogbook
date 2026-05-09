'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Plane, AlertTriangle, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { useAtcTheme } from '@/contexts/AtcThemeContext';

type PlanInfo = { id: string; numero_vol: string; aeroport_depart: string; aeroport_arrivee: string };

interface Props {
  plansAuto: PlanInfo[];
  plansOrphelins: PlanInfo[];
  sessionAeroport: string;
  sessionPosition: string;
}

export default function AtcNonControlesPanel({ plansAuto, plansOrphelins, sessionAeroport, sessionPosition }: Props) {
  const router = useRouter();
  const { theme } = useAtcTheme();
  const isDark = theme === 'dark';
  const [, startTransition] = useTransition();
  const [takingId, setTakingId] = useState<string | null>(null);

  async function prendrePlan(planId: string) {
    setTakingId(planId);
    try {
      const res = await fetch(`/api/plans-vol/${planId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'transferer', aeroport: sessionAeroport, position: sessionPosition }),
      });
      const d = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(d.error || 'Erreur');
      startTransition(() => router.refresh());
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Erreur');
    } finally {
      setTakingId(null);
    }
  }

  const renderChip = (p: PlanInfo, variant: 'auto' | 'orphelin') => {
    const isTaking = takingId === p.id;
    const baseColors = variant === 'auto'
      ? (isDark
          ? 'bg-slate-800 border-slate-600 text-slate-100 hover:bg-emerald-900/60 hover:border-emerald-500 hover:text-emerald-100'
          : 'bg-white border-slate-300 text-slate-700 hover:bg-emerald-100 hover:border-emerald-400 hover:text-emerald-800')
      : (isDark
          ? 'bg-orange-950/50 border-orange-700 text-orange-100 hover:bg-orange-900/70 hover:border-orange-500'
          : 'bg-orange-50 border-orange-300 text-orange-800 hover:bg-orange-100 hover:border-orange-400');
    return (
      <button
        key={p.id}
        type="button"
        onClick={() => prendrePlan(p.id)}
        disabled={takingId !== null}
        className={`flex items-center gap-2 rounded-lg border px-3 py-1.5 text-xs font-mono transition-colors disabled:opacity-50 disabled:cursor-not-allowed shadow-sm ${baseColors}`}
        title={`${p.numero_vol} ${p.aeroport_depart} → ${p.aeroport_arrivee} — Cliquer pour prendre ce vol`}
      >
        {isTaking ? <Loader2 className="h-3 w-3 animate-spin shrink-0" /> : (
          variant === 'auto'
            ? <Plane className="h-3 w-3 shrink-0 opacity-70" />
            : <AlertTriangle className="h-3 w-3 shrink-0 opacity-80" />
        )}
        <span className="font-bold">{p.numero_vol}</span>
        <span className={`text-[10px] ${variant === 'auto' ? (isDark ? 'text-slate-400' : 'text-slate-500') : (isDark ? 'text-orange-300' : 'text-orange-600')}`}>
          {p.aeroport_depart}→{p.aeroport_arrivee}
        </span>
      </button>
    );
  };

  const wrapper = isDark
    ? 'border-slate-600 bg-slate-900/40'
    : 'border-slate-300 bg-slate-50/60';

  return (
    <div className={`border-2 rounded-lg ${wrapper}`}>
      <div className={`px-3 py-2 grid grid-cols-1 md:grid-cols-2 gap-3`}>
        {/* Non contrôlés */}
        <section>
          <div className="flex items-center justify-between mb-2">
            <h3 className={`text-xs font-bold uppercase tracking-wider flex items-center gap-1.5 ${isDark ? 'text-slate-300' : 'text-slate-600'}`}>
              <Plane className="h-3.5 w-3.5" />
              Non contrôlés
              <span className={`ml-1 rounded-full px-1.5 py-0.5 text-[10px] ${isDark ? 'bg-slate-700 text-slate-200' : 'bg-slate-200 text-slate-700'}`}>{plansAuto.length}</span>
            </h3>
          </div>
          {plansAuto.length === 0 ? (
            <p className={`text-xs italic ${isDark ? 'text-slate-500' : 'text-slate-400'}`}>Aucun vol en autosurveillance</p>
          ) : (
            <div className="flex flex-wrap gap-1.5">
              {plansAuto.map((p) => renderChip(p, 'auto'))}
            </div>
          )}
        </section>

        {/* Orphelins */}
        <section>
          <div className="flex items-center justify-between mb-2">
            <h3 className={`text-xs font-bold uppercase tracking-wider flex items-center gap-1.5 ${isDark ? 'text-orange-300' : 'text-orange-600'}`}>
              <AlertTriangle className="h-3.5 w-3.5" />
              Orphelins
              <span className={`ml-1 rounded-full px-1.5 py-0.5 text-[10px] ${isDark ? 'bg-orange-900/60 text-orange-200' : 'bg-orange-200 text-orange-700'}`}>{plansOrphelins.length}</span>
            </h3>
          </div>
          {plansOrphelins.length === 0 ? (
            <p className={`text-xs italic ${isDark ? 'text-slate-500' : 'text-slate-400'}`}>Aucun plan orphelin</p>
          ) : (
            <div className="flex flex-wrap gap-1.5">
              {plansOrphelins.map((p) => renderChip(p, 'orphelin'))}
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
