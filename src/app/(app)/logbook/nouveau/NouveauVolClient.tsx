'use client';

import { useState, useEffect } from 'react';
import { useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { ArrowLeft, BookOpen, Plane, ClipboardList, CheckCircle2 } from 'lucide-react';
import VolForm from './VolForm';

type TypeAvion = { id: string; nom: string; constructeur: string };
type Compagnie = { id: string; nom: string };
type Instructeur = { id: string; identifiant: string };
type Profil = { id: string; identifiant: string };

type PlanClos = {
  id: string;
  aeroport_depart: string;
  aeroport_arrivee: string;
  type_vol: string;
  numero_vol: string;
  accepted_at: string;
  cloture_at: string;
};

export type PlanPreFill = {
  aeroport_depart: string;
  aeroport_arrivee: string;
  duree_minutes: number;
  heure_utc: string;
  type_vol: 'VFR' | 'IFR';
  callsign: string;
};

function toPlanPreFill(p: PlanClos): PlanPreFill {
  const d = new Date(p.accepted_at);
  const duree = Math.max(1, Math.round((new Date(p.cloture_at).getTime() - d.getTime()) / 60000));
  const heure_utc = `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-${String(d.getUTCDate()).padStart(2, '0')}T${String(d.getUTCHours()).padStart(2, '0')}:${String(d.getUTCMinutes()).padStart(2, '0')}`;
  return {
    aeroport_depart: p.aeroport_depart,
    aeroport_arrivee: p.aeroport_arrivee,
    duree_minutes: duree,
    heure_utc,
    type_vol: (p.type_vol === 'IFR' ? 'IFR' : 'VFR') as 'VFR' | 'IFR',
    callsign: p.numero_vol || '',
  };
}

export default function NouveauVolClient({
  closedPlans,
  typesAvion,
  compagnies,
  instructeurs,
  autresProfiles,
}: {
  closedPlans: PlanClos[];
  typesAvion: TypeAvion[];
  compagnies: Compagnie[];
  instructeurs: Instructeur[];
  autresProfiles: Profil[];
}) {
  const searchParams = useSearchParams();
  const planIdFromUrl = searchParams.get('plan');

  const [planId, setPlanId] = useState<string | null>(null);
  const [planPreFill, setPlanPreFill] = useState<PlanPreFill | null>(null);

  // Au chargement : si ?plan=id et le plan existe dans closedPlans, pré-remplir
  useEffect(() => {
    if (planIdFromUrl && closedPlans.length > 0 && !planId) {
      const p = closedPlans.find((x) => x.id === planIdFromUrl);
      if (p) {
        setPlanId(p.id);
        setPlanPreFill(toPlanPreFill(p));
      }
    }
  }, [planIdFromUrl, closedPlans, planId]);

  function handleClearPlan() {
    setPlanId(null);
    setPlanPreFill(null);
  }

  function selectPlan(p: PlanClos) {
    setPlanId(p.id);
    setPlanPreFill(toPlanPreFill(p));
  }

  return (
    <div className="space-y-6">
      {/* ── Hero header — même style que le logbook ── */}
      <div className="relative overflow-hidden rounded-2xl shadow-xl animate-reveal-blur">
        <div className="pointer-events-none absolute inset-0 bg-gradient-to-br from-emerald-700 via-emerald-800 to-indigo-900">
          <div className="absolute inset-0 bg-cockpit-grid opacity-30" />
          <div className="absolute -top-10 -right-10 h-48 w-48 rounded-full bg-emerald-400/10 blur-3xl" />
        </div>
        <div className="relative z-10 flex flex-wrap items-start justify-between gap-4 p-6">
          <div className="flex items-start gap-4">
            <Link href="/logbook"
              className="mt-1 inline-flex h-9 w-9 items-center justify-center rounded-xl border border-white/20 bg-white/10 text-white hover:bg-white/20 transition-colors shrink-0"
              aria-label="Retour au logbook"
            >
              <ArrowLeft className="h-4 w-4" />
            </Link>
            <div>
              <div className="flex items-center gap-3 mb-1">
                <div className="relative">
                  <div className="absolute inset-0 rounded-xl bg-emerald-300/30 blur-md animate-halo-pulse" aria-hidden />
                  <div className="relative p-2.5 rounded-xl bg-white/10 backdrop-blur border border-white/20">
                    <BookOpen className="h-5 w-5 text-white" />
                  </div>
                </div>
                <h1 className="text-2xl font-bold text-white tracking-tight">Enregistrer un vol</h1>
              </div>
              <p className="text-emerald-100/80 text-sm">Saisissez les données du vol pour l&apos;ajouter à votre carnet.</p>
              {planPreFill && (
                <div className="mt-2 inline-flex items-center gap-1.5 rounded-full bg-emerald-400/20 border border-emerald-400/30 px-3 py-1 text-xs text-emerald-200">
                  <CheckCircle2 className="h-3.5 w-3.5" />
                  Formulaire pré-rempli depuis un plan de vol clôturé
                </div>
              )}
            </div>
          </div>
          <div className="hidden sm:flex items-center gap-2">
            {planPreFill ? (
              <div className="flex items-center gap-2 px-3 py-1.5 rounded-xl bg-emerald-500/20 border border-emerald-500/30">
                <ClipboardList className="h-4 w-4 text-emerald-300" />
                <span className="text-sm text-emerald-200 font-medium">{planPreFill.callsign || 'Plan clôturé'}</span>
                <span className="text-xs text-emerald-400/70">{planPreFill.aeroport_depart} → {planPreFill.aeroport_arrivee}</span>
              </div>
            ) : (
              <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-white/10 border border-white/15">
                <Plane className="h-4 w-4 text-white/70" />
                <span className="text-sm text-white/70">Vol manuel</span>
              </div>
            )}
          </div>
        </div>
      </div>

      <div className="flex flex-col lg:flex-row gap-6 lg:gap-8">
        <div className="flex-1 min-w-0">
          <VolForm
            typesAvion={typesAvion}
            compagnies={compagnies}
            instructeurs={instructeurs}
            autresProfiles={autresProfiles}
            planPreFill={planPreFill}
            planId={planId}
            onClearPlan={handleClearPlan}
          />
        </div>

        {closedPlans.length > 0 && (
          <div className="lg:w-80 shrink-0">
            <div className="card sticky top-4">
              <h2 className="text-sm font-medium text-slate-300 mb-3">
                Plans de vol à enregistrer ({closedPlans.length})
              </h2>
              <p className="text-xs text-slate-500 mb-3">
                Cliquez sur un plan pour pré-remplir le formulaire.
              </p>
              <ul className="space-y-2 max-h-[calc(100dvh-16rem)] overflow-y-auto">
                {closedPlans.map((p) => (
                  <li key={p.id}>
                    <button
                      type="button"
                      onClick={() => selectPlan(p)}
                      className={`w-full text-left rounded-lg px-3 py-2 text-sm transition-colors ${
                        planId === p.id
                          ? 'bg-sky-500/30 border border-sky-500/60 text-sky-200'
                          : 'border border-slate-600/60 bg-slate-800/50 text-slate-300 hover:bg-slate-700/50 hover:border-slate-500'
                      }`}
                    >
                      <span className="font-mono font-medium">{p.numero_vol || '—'}</span>
                      <span className="text-slate-500 mx-1">•</span>
                      <span>{p.aeroport_depart} → {p.aeroport_arrivee}</span>
                      <span className="text-slate-500 ml-1">({p.type_vol})</span>
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
