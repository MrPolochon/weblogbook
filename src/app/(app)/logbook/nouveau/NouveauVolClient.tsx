'use client';

import { useState, useEffect } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { ArrowLeft, FileText } from 'lucide-react';
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
  const router = useRouter();
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

  function handleRemplissage() {
    const p = planIdFromUrl ? closedPlans.find((x) => x.id === planIdFromUrl) : closedPlans[0];
    if (p) {
      setPlanId(p.id);
      setPlanPreFill(toPlanPreFill(p));
    }
  }

  function handleClearPlan() {
    setPlanId(null);
    setPlanPreFill(null);
  }

  const showRemplissage = closedPlans.length > 0 && !planId;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-4">
          <Link href="/logbook" className="text-slate-400 hover:text-slate-200">
            <ArrowLeft className="h-5 w-5" />
          </Link>
          <h1 className="text-2xl font-semibold text-slate-100">Nouveau vol</h1>
        </div>
        {showRemplissage && (
          <button
            type="button"
            onClick={handleRemplissage}
            className="inline-flex items-center gap-2 rounded-lg border border-sky-500/60 bg-sky-500/20 px-4 py-2 text-sm font-medium text-sky-300 hover:bg-sky-500/30"
          >
            <FileText className="h-4 w-4" />
            Remplissage plan de vol
          </button>
        )}
      </div>

      {showRemplissage && (
        <div className="card border-sky-500/40 bg-sky-500/10 py-3 px-4">
          <p className="text-sm text-slate-300">
            {closedPlans.length} plan{closedPlans.length > 1 ? 's' : ''} de vol clôturé{closedPlans.length > 1 ? 's' : ''} {closedPlans.length > 1 ? 'peuvent' : 'peut'} remplir le formulaire. Cliquez sur &laquo; Remplissage plan de vol &raquo;.
          </p>
        </div>
      )}

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
  );
}
