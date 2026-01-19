'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';

const STATUTS_OUVERTS = ['depose', 'en_attente', 'accepte', 'en_cours', 'automonitoring'];

type Props = { planId: string; statut: string };

export default function PlanVolCloturerButton({ planId, statut }: Props) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);

  const peutCloturer = STATUTS_OUVERTS.includes(statut);
  const enAttenteConfirmation = statut === 'en_attente_cloture';

  if (enAttenteConfirmation) {
    return <span className="text-amber-400 text-sm">En attente de confirmation ATC</span>;
  }
  if (!peutCloturer) return null;

  async function handleCloture() {
    setLoading(true);
    try {
      const res = await fetch(`/api/plans-vol/${planId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'cloture' }),
      });
      const d = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(d.error || 'Erreur');
      router.refresh();
    } catch (e) {
      alert(e instanceof Error ? e.message : 'Erreur');
    } finally {
      setLoading(false);
    }
  }

  return (
    <button type="button" onClick={handleCloture} disabled={loading} className="text-sm text-sky-400 hover:underline disabled:opacity-50">
      {loading ? '…' : 'Clôturer le vol'}
    </button>
  );
}
