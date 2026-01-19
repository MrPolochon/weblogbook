'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';

export default function RefuserPlanForm({ planId }: { planId: string }) {
  const router = useRouter();
  const [raison, setRaison] = useState('');
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const r = raison.trim();
    if (!r) { alert('Indiquez la raison du refus.'); return; }
    setLoading(true);
    try {
      const res = await fetch(`/api/plans-vol/${planId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'refuser', refusal_reason: r }),
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
    <form onSubmit={handleSubmit} className="flex flex-col gap-2">
      <label className="text-sm font-medium text-slate-700">Raison du refus (obligatoire)</label>
      <textarea value={raison} onChange={(e) => setRaison(e.target.value)} className="input min-h-[80px]" placeholder="Ex. Altitude non conforme, itinéraire non publié…" required />
      <button type="submit" disabled={loading} className="self-start rounded-lg bg-red-600 px-4 py-2 text-sm font-medium text-white hover:bg-red-700 disabled:opacity-50">
        {loading ? '…' : 'Refuser le plan'}
      </button>
    </form>
  );
}
