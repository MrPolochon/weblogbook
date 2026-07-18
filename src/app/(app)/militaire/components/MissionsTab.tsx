'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Target, Coins, Timer, Plane, FileText, MapPin, Loader2, Lock, Award } from 'lucide-react';
import {
  ARME_MISSIONS,
  LIB_DIFFICULTE,
  LIB_NATURE_VOL,
  type ArmeeMission,
  type MissionCooldownInfo,
} from '@/lib/armee';

type MissionWithCooldown = ArmeeMission & {
  cooldown?: MissionCooldownInfo;
  gradeLocked?: boolean;
  requiredGradeLabel?: string;
};

const MISSION_STYLES: Record<string, string> = {
  'patrouille-frontiere': 'border-sky-500/30 bg-sky-500/5',
  'escorte-convoi': 'border-amber-500/30 bg-amber-500/5',
  reconnaissance: 'border-violet-500/30 bg-violet-500/5',
  sauvetage: 'border-emerald-500/30 bg-emerald-500/5',
};

export default function MissionsTab() {
  const [missions, setMissions] = useState<MissionWithCooldown[]>(ARME_MISSIONS);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch('/api/armee/missions');
        if (!res.ok) return;
        const data = (await res.json()) as MissionWithCooldown[];
        if (!cancelled && Array.isArray(data)) setMissions(data);
      } catch {
        /* catalogue statique en fallback */
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <div className="space-y-6">
      <div className="rounded-xl border border-slate-700/50 bg-slate-800/20 px-4 py-3 text-sm text-slate-400 space-y-1">
        <p>
          Récompenses Felitz ajustées selon le retard à la validation.
          Cooldown <strong className="text-slate-300 font-medium">par pilote</strong>, bonus de série à partir de 3 jours d&apos;ops.
        </p>
        <p>Certaines missions exigent un grade minimum (progression par missions validées).</p>
      </div>

      {loading && (
        <div className="flex items-center gap-2 text-sm text-slate-500">
          <Loader2 className="h-4 w-4 animate-spin" />
          Chargement des disponibilités…
        </div>
      )}

      <div className="grid gap-4 sm:grid-cols-2">
        {missions.map((m) => {
          const gradeLocked = Boolean(m.gradeLocked);
          const cooldownBlocked = m.cooldown?.available === false && !gradeLocked;
          const available = !gradeLocked && m.cooldown?.available !== false;
          const remaining = m.cooldown?.remainingMinutes ?? 0;
          return (
            <article
              key={m.id}
              className={`rounded-xl border p-5 transition-all duration-200 ${
                available
                  ? `hover:shadow-lg hover:shadow-slate-900/30 ${MISSION_STYLES[m.id] || 'border-slate-700/50 bg-slate-800/30'}`
                  : 'border-slate-700/40 bg-slate-900/40 opacity-80'
              }`}
            >
              <div className="flex items-start gap-3 mb-3">
                <div className="p-2 rounded-lg bg-red-500/10 border border-red-500/20">
                  {available ? (
                    <Target className="h-4 w-4 text-red-400" />
                  ) : (
                    <Lock className="h-4 w-4 text-slate-500" />
                  )}
                </div>
                <div className="flex-1 min-w-0">
                  <h3 className="font-semibold text-slate-100">{m.titre}</h3>
                  <p className="text-sm text-slate-400 mt-0.5 leading-relaxed">{m.description}</p>
                </div>
              </div>

              <div className="flex flex-wrap gap-2 text-xs text-slate-400 mb-4">
                <span className="inline-flex items-center gap-1.5 px-2 py-1 rounded-md bg-slate-800/60 border border-slate-700/40">
                  <MapPin className="h-3 w-3 text-sky-400" />
                  {m.aeroport_depart} → {m.aeroport_arrivee}
                </span>
                <span className="inline-flex items-center gap-1.5 px-2 py-1 rounded-md bg-slate-800/60 border border-slate-700/40">
                  <Plane className="h-3 w-3 text-slate-400" />
                  {m.duree_minutes} min · {LIB_NATURE_VOL[m.nature_vol_militaire]}
                </span>
                <span className="inline-flex items-center gap-1.5 px-2 py-1 rounded-md bg-slate-800/60 border border-slate-700/40">
                  {LIB_DIFFICULTE[m.difficulty] || m.difficulty}
                </span>
                <span className="inline-flex items-center gap-1.5 px-2 py-1 rounded-md bg-violet-500/10 border border-violet-500/20 text-violet-300">
                  <Award className="h-3 w-3" />
                  {m.requiredGradeLabel || 'Recrue'}+
                </span>
                <span className="inline-flex items-center gap-1.5 px-2 py-1 rounded-md bg-emerald-500/10 border border-emerald-500/20">
                  <Coins className="h-3 w-3 text-emerald-400" />
                  {m.rewardMin.toLocaleString('fr-FR')} – {m.rewardMax.toLocaleString('fr-FR')} F$
                </span>
                <span
                  className={`inline-flex items-center gap-1.5 px-2 py-1 rounded-md border ${
                    available
                      ? 'bg-amber-500/10 border-amber-500/20'
                      : 'bg-slate-800/60 border-slate-600/40 text-amber-300'
                  }`}
                >
                  <Timer className="h-3 w-3 text-amber-400" />
                  {gradeLocked
                    ? `Grade ${m.requiredGradeLabel} requis`
                    : cooldownBlocked
                      ? `Disponible dans ${remaining} min`
                      : `Cooldown ${m.cooldownMinutes} min`}
                </span>
              </div>

              <div className="flex flex-col sm:flex-row gap-2">
                {available ? (
                  <>
                    <Link
                      href={`/militaire/nouveau?mission=${m.id}`}
                      className="flex-1 inline-flex items-center justify-center gap-2 px-4 py-2.5 bg-red-600/90 hover:bg-red-600 text-white rounded-lg text-sm font-medium transition-colors"
                    >
                      <Target className="h-3.5 w-3.5" />
                      Carnet militaire
                    </Link>
                    <Link
                      href={`/logbook/depot-plan-vol?mission=${m.id}`}
                      className="flex-1 inline-flex items-center justify-center gap-2 px-4 py-2.5 border border-sky-500/40 text-sky-200 hover:bg-sky-500/10 rounded-lg text-sm font-medium transition-colors"
                    >
                      <FileText className="h-3.5 w-3.5" />
                      Plan de vol ATC
                    </Link>
                  </>
                ) : (
                  <div className="flex-1 inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg border border-slate-700/50 text-slate-500 text-sm">
                    <Lock className="h-3.5 w-3.5" />
                    {gradeLocked ? 'Grade insuffisant' : 'Cooldown en cours'}
                  </div>
                )}
              </div>
            </article>
          );
        })}
      </div>
    </div>
  );
}
