'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';

type RequestRow = {
  id: string;
  identifiant_or_email: string;
  user_id: string | null;
  identifiant: string | null;
  created_at: string;
  status: string;
  handled_by: string | null;
};

export default function PasswordResetRequestsClient({ initialRequests }: { initialRequests: RequestRow[] }) {
  const router = useRouter();
  const [, startTransition] = useTransition();
  const [requests, setRequests] = useState(initialRequests);
  const [loadingId, setLoadingId] = useState<string | null>(null);

  async function handleMarkDone(id: string) {
    setLoadingId(id);
    try {
      const res = await fetch('/api/admin/password-reset-requests', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, status: 'done' }),
      });
      if (!res.ok) return;
      setRequests((prev) => prev.map((r) => (r.id === id ? { ...r, status: 'done' as const } : r)));
      startTransition(() => router.refresh());
    } finally {
      setLoadingId(null);
    }
  }

  const pending = requests.filter((r) => r.status === 'pending');

  if (requests.length === 0) {
    return (
      <div className="card">
        <p className="text-slate-400">Aucune demande.</p>
      </div>
    );
  }

  return (
    <div className="card overflow-x-auto">
      <table className="w-full text-left">
        <thead>
          <tr className="border-b border-slate-700">
            <th className="py-2 pr-4 text-slate-400 font-medium">Saisi par l&apos;utilisateur</th>
            <th className="py-2 pr-4 text-slate-400 font-medium">Compte (identifiant)</th>
            <th className="py-2 pr-4 text-slate-400 font-medium">Date</th>
            <th className="py-2 pr-4 text-slate-400 font-medium">Statut</th>
            <th className="py-2 pr-4 text-slate-400 font-medium">Actions</th>
          </tr>
        </thead>
        <tbody>
          {requests.map((r) => (
            <tr key={r.id} className="border-b border-slate-700/50">
              <td className="py-3 pr-4 text-slate-200 font-mono text-sm">{r.identifiant_or_email}</td>
              <td className="py-3 pr-4">
                {r.user_id ? (
                  <Link href={`/admin/pilotes/${r.user_id}`} className="text-sky-400 hover:underline">
                    {r.identifiant ?? r.user_id.slice(0, 8)}
                  </Link>
                ) : (
                  <span className="text-slate-500">—</span>
                )}
              </td>
              <td className="py-3 pr-4 text-slate-400 text-sm">
                {new Date(r.created_at).toLocaleString('fr-FR')}
              </td>
              <td className="py-3 pr-4">
                <span className={r.status === 'pending' ? 'text-amber-400' : 'text-slate-500'}>
                  {r.status === 'pending' ? 'En attente' : 'Traité'}
                </span>
              </td>
              <td className="py-3 pr-4 flex gap-2">
                {r.user_id && (
                  <Link
                    href={`/admin/pilotes/${r.user_id}`}
                    className="btn-secondary text-sm"
                  >
                    Ouvrir la fiche pilote
                  </Link>
                )}
                {r.status === 'pending' && (
                  <button
                    type="button"
                    onClick={() => handleMarkDone(r.id)}
                    disabled={loadingId === r.id}
                    className="btn-primary text-sm"
                  >
                    {loadingId === r.id ? '…' : 'Marquer comme traité'}
                  </button>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      {pending.length > 0 && (
        <p className="mt-4 text-slate-400 text-sm">{pending.length} demande(s) en attente.</p>
      )}
    </div>
  );
}
