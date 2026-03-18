'use client';

import { useState, useEffect } from 'react';
import { useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';
import VolForm from './VolForm';

type TypeAvion = { id: string; nom: string; constructeur: string };
type Compagnie = { id: string; nom: string };
type Admin = { id: string; identifiant: string };
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
  admins,
  autresProfiles,
}: {
  closedPlans: PlanClos[];
  typesAvion: TypeAvion[];
  compagnies: Compagnie[];
  admins: Admin[];
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
      <div className="flex items-center gap-4">
        <Link href="/logbook" className="text-slate-400 hover:text-slate-200">
          <ArrowLeft className="h-5 w-5" />
        </Link>
        <h1 className="text-2xl font-semibold text-slate-100">Nouveau vol</h1>
      </div>

      <div className="flex flex-col lg:flex-row gap-6 lg:gap-8">
        <div className="flex-1 min-w-0">
          <VolForm
            typesAvion={typesAvion}
            compagnies={compagnies}
            admins={admins}
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
              <ul className="space-y-2 max-h-[calc(100vh-16rem)] overflow-y-auto">
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
