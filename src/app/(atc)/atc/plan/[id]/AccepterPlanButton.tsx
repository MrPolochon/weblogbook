'use client';

import { useRef, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';

export default function AccepterPlanButton({ planId }: { planId: string }) {
  const router = useRouter();
  const [, startTransition] = useTransition();
  const [loading, setLoading] = useState(false);
  // Garde synchrone : empêche le 2e clic d'envoyer un PATCH avant que React
  // ait re-rendu avec disabled={loading}.
  const busyRef = useRef(false);

  async function handleClick() {
    if (busyRef.current) return;
    busyRef.current = true;
    setLoading(true);
    try {
      const res = await fetch(`/api/plans-vol/${planId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'accepter' }),
      });
      const d = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(d.error || 'Erreur');
      startTransition(() => router.refresh());
    } catch (e) {
      alert(e instanceof Error ? e.message : 'Erreur');
    } finally {
      setLoading(false);
      busyRef.current = false;
    }
  }

  return (
    <button type="button" onClick={handleClick} disabled={loading} className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-700 disabled:opacity-50">
      {loading ? '…' : 'Accepter le plan'}
    </button>
  );
}
