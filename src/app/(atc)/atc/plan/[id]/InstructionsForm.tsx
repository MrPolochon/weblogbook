'use client';

import { useState, useEffect, useTransition } from 'react';
import { useRouter } from 'next/navigation';

export default function InstructionsForm({ planId, initial }: { planId: string; initial: string }) {
  const router = useRouter();
  const [, startTransition] = useTransition();
  const [val, setVal] = useState(initial);
  useEffect(() => { setVal(initial); }, [initial]);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    try {
      const res = await fetch(`/api/plans-vol/${planId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'instructions', instructions: val }),
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
    <form onSubmit={handleSubmit} className="flex flex-col gap-2">
      <label className="text-sm font-semibold text-slate-900">Instructions</label>
      <p className="text-slate-700 text-sm">Chaque ATC qui détient le plan peut modifier ou compléter les instructions de la position précédente (ex. Tower → APP).</p>
      <textarea value={val} onChange={(e) => setVal(e.target.value)} className="input min-h-[100px]" placeholder="Ex. Attendre autorisation towering, QNH 1013…" />
      <button type="submit" disabled={loading} className="self-start rounded-lg bg-sky-600 px-4 py-2 text-sm font-medium text-white hover:bg-sky-700 disabled:opacity-50">
        {loading ? '…' : 'Enregistrer les instructions'}
      </button>
    </form>
  );
}
