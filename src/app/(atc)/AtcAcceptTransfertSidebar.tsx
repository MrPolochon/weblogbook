'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';

export default function AtcAcceptTransfertSidebar({ plans }: { plans: { id: string; numero_vol: string }[] }) {
  const router = useRouter();
  const [loadingId, setLoadingId] = useState<string | null>(null);

  async function handleAccept(planId: string) {
    setLoadingId(planId);
    try {
      const res = await fetch(`/api/plans-vol/${planId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'accepter_transfert' }),
      });
      const d = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(d.error || 'Erreur');
      router.refresh();
    } catch (e) {
      alert(e instanceof Error ? e.message : 'Erreur');
    } finally {
      setLoadingId(null);
    }
  }

  if (plans.length === 0) return null;

  return (
    <aside className="w-44 flex-shrink-0 border-l border-amber-300 bg-amber-50/80 py-3 px-2 flex flex-col">
      <p className="text-xs font-semibold uppercase tracking-wider text-amber-800 px-2 mb-1.5">À accepter</p>
      <p className="text-[10px] text-amber-700 px-2 mb-2">Cliquez pour accepter (1 min)</p>
      <ul className="space-y-1">
        {plans.map((p) => (
          <li key={p.id}>
            <button
              type="button"
              onClick={() => handleAccept(p.id)}
              disabled={loadingId !== null}
              className="w-full text-left truncate text-sm font-semibold text-amber-800 bg-amber-100 border border-amber-400 rounded px-2 py-1.5 animate-pulse hover:bg-amber-200 hover:border-amber-500 disabled:opacity-50"
              title="Cliquer pour accepter le transfert"
            >
              {loadingId === p.id ? '…' : p.numero_vol}
            </button>
          </li>
        ))}
      </ul>
    </aside>
  );
}
