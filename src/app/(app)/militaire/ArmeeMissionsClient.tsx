'use client';

import { useEffect, useState } from 'react';
import { Target, Coins, Timer } from 'lucide-react';

type Mission = {
  id: string;
  titre: string;
  description: string;
  rewardMin: number;
  rewardMax: number;
  cooldownMinutes: number;
};

export default function ArmeeMissionsClient() {
  const [missions, setMissions] = useState<Mission[]>([]);
  const [loadingId, setLoadingId] = useState<string | null>(null);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  useEffect(() => {
    fetch('/api/armee/missions')
      .then((res) => res.json())
      .then((data) => {
        if (Array.isArray(data)) setMissions(data);
      })
      .catch(() => {});
  }, []);

  async function handleMission(missionId: string) {
    setError('');
    setSuccess('');
    setLoadingId(missionId);
    try {
      const res = await fetch('/api/armee/missions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ mission_id: missionId })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Erreur');
      setSuccess(`Mission réussie ! +${data.reward.toLocaleString('fr-FR')} F$ pour l'armée.`);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erreur');
    } finally {
      setLoadingId(null);
    }
  }

  return (
    <div className="card">
      <h2 className="text-lg font-semibold text-slate-200 mb-4 flex items-center gap-2">
        <Target className="h-5 w-5 text-red-400" />
        Missions militaires
      </h2>
      <div className="grid gap-4 sm:grid-cols-2">
        {missions.map((m) => (
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
            <button
              onClick={() => handleMission(m.id)}
              disabled={loadingId === m.id}
              className="mt-4 w-full px-3 py-2 bg-red-600 hover:bg-red-700 disabled:opacity-50 text-white rounded-lg text-sm font-medium"
            >
              {loadingId === m.id ? 'Mission en cours…' : 'Lancer la mission'}
            </button>
          </div>
        ))}
        {missions.length === 0 && (
          <p className="text-sm text-slate-500">Aucune mission disponible.</p>
        )}
      </div>
      {error && <p className="text-red-400 text-sm mt-4">{error}</p>}
      {success && <p className="text-emerald-400 text-sm mt-4">{success}</p>}
    </div>
  );
}
