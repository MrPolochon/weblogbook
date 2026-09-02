'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { FilePlus, Loader2 } from 'lucide-react';

export default function CreateManualStripButton() {
  const router = useRouter();
  const [, startTransition] = useTransition();
  const [loading, setLoading] = useState(false);

  async function handleCreate() {
    setLoading(true);
    try {
      const res = await fetch('/api/atc/creer-strip', { method: 'POST' });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Erreur');
      startTransition(() => router.refresh());
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Erreur lors de la création du strip');
    } finally {
      setLoading(false);
    }
  }

  return (
    <button
      onClick={handleCreate}
      disabled={loading}
      className="inline-flex items-center gap-1.5 px-2.5 py-1.5 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white text-[11px] font-black uppercase tracking-wide rounded-lg transition-colors"
    >
      {loading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <FilePlus className="h-3.5 w-3.5" />}
      {loading ? '…' : 'Strip'}
    </button>
  );
}
