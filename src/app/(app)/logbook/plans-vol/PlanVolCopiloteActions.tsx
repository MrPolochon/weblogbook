'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';

type Props = { planId: string; statut: string; isCopilote: boolean };

export default function PlanVolCopiloteActions({ planId, statut, isCopilote }: Props) {
  const router = useRouter();
  const [, startTransition] = useTransition();
  const [loading, setLoading] = useState<'valider' | 'refuser' | null>(null);

  if (statut !== 'en_attente_copilote') return null;

  async function run(action: 'valider_copilote' | 'refuser_copilote') {
    if (loading) return;
    setLoading(action === 'valider_copilote' ? 'valider' : 'refuser');
    try {
      const res = await fetch(`/api/plans-vol/${planId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action }),
      });
      const d = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(d.error || 'Erreur');
      startTransition(() => router.refresh());
    } catch (e) {
      alert(e instanceof Error ? e.message : 'Erreur');
    } finally {
      setLoading(null);
    }
  }

  if (!isCopilote) {
    return <span className="text-amber-400 text-sm">En attente du copilote</span>;
  }

  return (
    <div className="flex items-center gap-3">
      <button
        type="button"
        onClick={() => run('valider_copilote')}
        disabled={loading !== null}
        className="text-sm text-emerald-400 hover:underline disabled:opacity-50"
      >
        {loading === 'valider' ? '…' : 'Valider'}
      </button>
      <button
        type="button"
        onClick={() => {
          if (confirm('Refuser ce plan de vol ? Il sera annulé.')) {
            void run('refuser_copilote');
          }
        }}
        disabled={loading !== null}
        className="text-sm text-red-400 hover:underline disabled:opacity-50"
      >
        {loading === 'refuser' ? '…' : 'Refuser'}
      </button>
    </div>
  );
}
