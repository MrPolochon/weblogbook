'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { X, RefreshCw } from 'lucide-react';
import { toLocaleTimeStringUTC } from '@/lib/date-utils';

type Session = { user_id: string; aeroport: string; position: string; started_at: string; identifiant: string };

function formatDepuis(startedAt: string): string {
  return toLocaleTimeStringUTC(startedAt, { hour: '2-digit', minute: '2-digit' }) + ' UTC';
}

export default function AdminAtcSessionsEnLigne({ sessions }: { sessions: Session[] }) {
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
      const res = await fetch(`/api/atc/session/${userId}`, {
        method: 'DELETE',
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || 'Erreur lors de la déconnexion');
      }

      // Rafraîchir la page
      startTransition(() => router.refresh());
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erreur lors de la déconnexion');
    } finally {
      setDisconnecting(null);
    }
  }
  if (sessions.length === 0) {
    return (
      <div className="card">
        <h2 className="text-lg font-medium text-slate-800 mb-2">Positions et aéroports en ligne</h2>
        <p className="text-slate-600 text-sm">Aucun contrôleur en service.</p>
      </div>
    );
  }

  return (
    <div className="card">
      <h2 className="text-lg font-medium text-slate-800 mb-4">Positions et aéroports en ligne</h2>
      
      {error && (
        <div className="mb-4 p-3 rounded-lg bg-red-500/10 border border-red-500/30">
          <p className="text-red-600 text-sm">{error}</p>
        </div>
      )}

      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-slate-200 text-left text-slate-600">
              <th className="pb-2 pr-4">Aéroport</th>
              <th className="pb-2 pr-4">Position</th>
              <th className="pb-2 pr-4">Contrôleur en service</th>
              <th className="pb-2 pr-4">Depuis</th>
              <th className="pb-2 text-right">Actions</th>
            </tr>
          </thead>
          <tbody>
            {sessions.map((s) => (
              <tr key={`${s.aeroport}-${s.position}`} className="border-b border-slate-100 last:border-0">
                <td className="py-2.5 pr-4 font-medium text-slate-800">{s.aeroport}</td>
                <td className="py-2.5 pr-4 text-slate-700">{s.position}</td>
                <td className="py-2.5 pr-4 text-slate-700">{s.identifiant}</td>
                <td className="py-2.5 pr-4 text-slate-600 tabular-nums">{formatDepuis(s.started_at)}</td>
                <td className="py-2.5 text-right">
                  <button
                    onClick={() => handleForceDisconnect(s.user_id, s.identifiant)}
                    disabled={disconnecting === s.user_id}
                    className="inline-flex items-center gap-1.5 px-2.5 py-1 text-xs font-medium text-red-600 hover:text-red-700 hover:bg-red-50 rounded-md transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                    title="Déconnecter de force cet ATC"
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
