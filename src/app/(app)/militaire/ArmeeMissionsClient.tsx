'use client';

import { Target, Coins, Timer } from 'lucide-react';
import Link from 'next/link';
import { ARME_MISSIONS } from '@/lib/armee-missions';

export default function ArmeeMissionsClient() {
  return (
    <div className="card">
      <h2 className="text-lg font-semibold text-slate-200 mb-4 flex items-center gap-2">
        <Target className="h-5 w-5 text-red-400" />
        Missions militaires
      </h2>
      <div className="grid gap-4 sm:grid-cols-2">
        {ARME_MISSIONS.map((m) => (
          <div key={m.id} className="rounded-lg border border-slate-700/50 bg-slate-800/40 p-4">
            <p className="text-slate-100 font-medium">{m.titre}</p>
            <p className="text-sm text-slate-400 mt-1">{m.description}</p>
            <div className="mt-3 flex flex-wrap items-center gap-3 text-xs text-slate-400">
              <span className="inline-flex items-center gap-1">
                <Coins className="h-3.5 w-3.5 text-emerald-400" />
                {m.rewardMin.toLocaleString('fr-FR')} – {m.rewardMax.toLocaleString('fr-FR')} F$
              </span>
              <span className="inline-flex items-center gap-1">
                <Timer className="h-3.5 w-3.5 text-amber-400" />
                Cooldown {m.cooldownMinutes} min
              </span>
            </div>
            <div className="mt-4 flex flex-col gap-2">
              <Link
                href={`/militaire/nouveau?mission=${m.id}`}
                className="w-full inline-flex items-center justify-center px-3 py-2 bg-red-600 hover:bg-red-700 text-white rounded-lg text-sm font-medium"
              >
                Carnet militaire (validation admin)
              </Link>
              <Link
                href={`/logbook/depot-plan-vol?mission=${m.id}`}
                className="w-full inline-flex items-center justify-center px-3 py-2 border border-sky-500/50 text-sky-200 hover:bg-sky-500/10 rounded-lg text-sm font-medium"
              >
                Plan de vol (ATC, comme tout pilote)
              </Link>
            </div>
          </div>
        ))}
        {ARME_MISSIONS.length === 0 && (
          <p className="text-sm text-slate-500">Aucune mission disponible.</p>
        )}
      </div>
      <p className="text-xs text-slate-500 mt-4 space-y-2">
        <span className="block">La récompense finale est ajustée selon le retard par rapport à l&apos;heure d&apos;arrivée prévue.</span>
        <span className="block">
          Utilisez <strong className="text-slate-400">Carnet militaire</strong> pour la validation admin et les récompenses, et le lien{' '}
          <strong className="text-slate-400">Plan de vol</strong> pour le même dépôt que tout pilote (logbook → flotte armée en non commercial).
        </span>
      </p>
    </div>
  );
}
