'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';

export default function NePasEnregistrerPlanButton({ planId }: { planId: string }) {
  const router = useRouter();
  const [, startTransition] = useTransition();
  const [loading, setLoading] = useState(false);

  async function handleClick() {
    if (!confirm('Ne pas enregistrer ce vol et supprimer définitivement le plan de vol ?')) return;
    setLoading(true);
    try {
      const res = await fetch(`/api/plans-vol/${planId}`, { method: 'DELETE' });
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
      onClick={handleClick}
      disabled={loading}
      className="rounded-lg border border-slate-500/60 bg-slate-700/50 px-4 py-2 text-sm font-medium text-slate-300 hover:bg-slate-600/50 hover:text-slate-200 disabled:opacity-50"
    >
      {loading ? '…' : 'Ne pas enregistrer ce vol'}
    </button>
  );
}
