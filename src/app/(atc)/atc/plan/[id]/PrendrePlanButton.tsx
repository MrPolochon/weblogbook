'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';

export default function PrendrePlanButton({ planId, aeroport, position }: { planId: string; aeroport: string; position: string }) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);

  async function handleTake() {
    setLoading(true);
    try {
      const res = await fetch(`/api/plans-vol/${planId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'transferer', aeroport, position }),
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
    <button
      type="button"
      onClick={handleTake}
      disabled={loading}
      className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-700 disabled:opacity-50"
    >
      {loading ? '…' : 'Prendre le plan'}
    </button>
  );
}
