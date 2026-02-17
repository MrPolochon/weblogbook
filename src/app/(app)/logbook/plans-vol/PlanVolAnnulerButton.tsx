'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';

const STATUTS_ANNULABLES = ['depose', 'en_attente', 'refuse'];

type Props = { planId: string; statut: string };

export default function PlanVolAnnulerButton({ planId, statut }: Props) {
  const router = useRouter();
  const [, startTransition] = useTransition();
  const [loading, setLoading] = useState(false);

  if (!STATUTS_ANNULABLES.includes(statut)) return null;

  async function handleAnnuler() {
    if (!confirm('Annuler ce plan de vol ? Aucun revenu ne sera versé.')) return;
    setLoading(true);
    try {
      const res = await fetch(`/api/plans-vol/${planId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'annuler' }),
      });
      const d = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(d.error || 'Erreur');
      startTransition(() => router.refresh());
    } catch (e) {
      alert(e instanceof Error ? e.message : 'Erreur');
    } finally {
      setLoading(false);
    }
  }

  return (
    <button
      type="button"
      onClick={handleAnnuler}
      disabled={loading}
      className="text-sm text-red-400 hover:underline disabled:opacity-50"
    >
      {loading ? '…' : 'Annuler'}
    </button>
  );
}
