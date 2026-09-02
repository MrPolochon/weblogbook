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
          ? 'bg-slate-800 border-slate-600 text-slate-100 hover:border-emerald-500'
          : 'bg-white border-slate-300 text-slate-700 hover:border-emerald-400')
      : (isDark
          ? 'bg-orange-950/50 border-orange-700 text-orange-100 hover:border-orange-500'
          : 'bg-orange-50 border-orange-300 text-orange-800 hover:border-orange-400');
    return (
      <button
        key={p.id}
        type="button"
        onClick={() => prendrePlan(p.id)}
        disabled={takingId !== null}
        className={`flex items-center gap-2 rounded-md border px-2 py-1 text-[11px] font-mono transition-colors disabled:opacity-50 disabled:cursor-not-allowed ${baseColors}`}
        title={`${p.numero_vol} ${p.aeroport_depart} → ${p.aeroport_arrivee} — Cliquer pour prendre ce vol`}
      >
        {isTaking ? <Loader2 className="h-3 w-3 animate-spin shrink-0" /> : (
          variant === 'auto'
            ? <Plane className="h-3 w-3 shrink-0 opacity-70" />
            : <AlertTriangle className="h-3 w-3 shrink-0 opacity-80" />
        )}
        <span className="font-bold">{p.numero_vol}</span>
        <span className="text-[10px] opacity-70">{p.aeroport_depart}→{p.aeroport_arrivee}</span>
      </button>
    );
  };

  if (plansAuto.length === 0 && plansOrphelins.length === 0) return null;

  return (
    <div className={`rounded-xl border shrink-0 ${isDark ? 'border-slate-700 bg-slate-950/40' : 'border-slate-300 bg-white/50'}`}>
      <div className="px-3 py-2 grid grid-cols-1 md:grid-cols-2 gap-3">
        <section>
          <div className="flex items-center gap-1.5 mb-1.5">
            <h3 className={`text-[10px] font-black uppercase tracking-wider flex items-center gap-1.5 ${isDark ? 'text-slate-400' : 'text-slate-600'}`}>
              <Plane className="h-3 w-3" /> Autosurveillance
            </h3>
            <span className={`rounded-full px-1.5 text-[10px] font-bold ${isDark ? 'bg-slate-800 text-slate-200' : 'bg-slate-200 text-slate-700'}`}>{plansAuto.length}</span>
          </div>
          {plansAuto.length === 0 ? (
            <p className={`text-[11px] italic ${isDark ? 'text-slate-600' : 'text-slate-400'}`}>Aucun vol</p>
          ) : (
            <div className="flex flex-wrap gap-1">{plansAuto.map((p) => renderChip(p, 'auto'))}</div>
          )}
        </section>
        <section>
          <div className="flex items-center gap-1.5 mb-1.5">
            <h3 className={`text-[10px] font-black uppercase tracking-wider flex items-center gap-1.5 ${isDark ? 'text-orange-300' : 'text-orange-700'}`}>
              <AlertTriangle className="h-3 w-3" /> Orphelins
            </h3>
            <span className={`rounded-full px-1.5 text-[10px] font-bold ${isDark ? 'bg-orange-900/60 text-orange-200' : 'bg-orange-200 text-orange-800'}`}>{plansOrphelins.length}</span>
          </div>
          {plansOrphelins.length === 0 ? (
            <p className={`text-[11px] italic ${isDark ? 'text-slate-600' : 'text-slate-400'}`}>Aucun plan orphelin</p>
          ) : (
            <div className="flex flex-wrap gap-1">{plansOrphelins.map((p) => renderChip(p, 'orphelin'))}</div>
          )}
        </section>
      </div>
    </div>
  );
}
