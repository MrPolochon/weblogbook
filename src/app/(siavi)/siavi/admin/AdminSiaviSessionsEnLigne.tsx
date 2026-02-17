'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { X, RefreshCw, Flame, Radio } from 'lucide-react';
import { toLocaleTimeStringUTC } from '@/lib/date-utils';

type Session = { user_id: string; aeroport: string; est_afis: boolean; started_at: string; identifiant: string };

function formatDepuis(startedAt: string): string {
  return toLocaleTimeStringUTC(startedAt, { hour: '2-digit', minute: '2-digit' }) + ' UTC';
}

export default function AdminSiaviSessionsEnLigne({ sessions }: { sessions: Session[] }) {
  const router = useRouter();
  const [, startTransition] = useTransition();
  const [disconnecting, setDisconnecting] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function handleForceDisconnect(userId: string, identifiant: string) {
    if (!confirm(`Êtes-vous sûr de vouloir déconnecter de force ${identifiant} ?`)) {
      return;
    }

    setDisconnecting(userId);
    setError(null);

    try {
      const res = await fetch(`/api/siavi/session/${userId}`, {
        method: 'DELETE',
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || 'Erreur lors de la déconnexion');
      }

      startTransition(() => router.refresh());
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erreur lors de la déconnexion');
    } finally {
      setDisconnecting(null);
    }
  }

  if (sessions.length === 0) {
    return (
      <div className="rounded-xl border border-red-200 bg-white p-4">
        <h2 className="text-lg font-medium text-red-800 mb-2">Agents en service</h2>
        <p className="text-slate-600 text-sm">Aucun agent SIAVI en service.</p>
      </div>
    );
  }

  return (
    <div className="rounded-xl border border-red-200 bg-white p-4">
      <h2 className="text-lg font-medium text-red-800 mb-4">Agents en service</h2>
      
      {error && (
        <div className="mb-4 p-3 rounded-lg bg-red-500/10 border border-red-500/30">
          <p className="text-red-600 text-sm">{error}</p>
        </div>
      )}

      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-red-200 text-left text-red-700">
              <th className="pb-2 pr-4">Aéroport</th>
              <th className="pb-2 pr-4">Mode</th>
              <th className="pb-2 pr-4">Agent</th>
              <th className="pb-2 pr-4">Depuis</th>
              <th className="pb-2 text-right">Actions</th>
            </tr>
          </thead>
          <tbody>
            {sessions.map((s) => (
              <tr key={`${s.aeroport}-${s.user_id}`} className="border-b border-red-100 last:border-0">
                <td className="py-2.5 pr-4 font-medium text-slate-800">{s.aeroport}</td>
                <td className="py-2.5 pr-4">
                  {s.est_afis ? (
                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-green-100 text-green-700 text-xs font-medium">
                      <Flame className="h-3 w-3" />
                      AFIS
                    </span>
                  ) : (
                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-amber-100 text-amber-700 text-xs font-medium">
                      <Radio className="h-3 w-3" />
                      Pompier
                    </span>
                  )}
                </td>
                <td className="py-2.5 pr-4 text-slate-700">{s.identifiant}</td>
                <td className="py-2.5 pr-4 text-slate-600 tabular-nums">{formatDepuis(s.started_at)}</td>
                <td className="py-2.5 text-right">
                  <button
                    onClick={() => handleForceDisconnect(s.user_id, s.identifiant)}
                    disabled={disconnecting === s.user_id}
                    className="inline-flex items-center gap-1.5 px-2.5 py-1 text-xs font-medium text-red-600 hover:text-red-700 hover:bg-red-50 rounded-md transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                    title="Déconnecter de force cet agent"
                  >
                    {disconnecting === s.user_id ? (
                      <>
                        <RefreshCw className="h-3.5 w-3.5 animate-spin" />
                        Déconnexion...
                      </>
                    ) : (
                      <>
                        <X className="h-3.5 w-3.5" />
                        Déconnecter
                      </>
                    )}
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
