'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Power, Loader2 } from 'lucide-react';

export default function HorsServiceButton() {
  const router = useRouter();
  const [, startTransition] = useTransition();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleClick() {
    setError(null);
    setLoading(true);
    try {
      const res = await fetch('/api/atc/session', { method: 'DELETE' });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || 'Erreur');
      startTransition(() => router.refresh());
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Erreur');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex items-center gap-2">
      <button
        type="button"
        onClick={handleClick}
        className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-red-950/70 text-red-200 hover:bg-red-900 border border-red-800/70 transition-colors font-bold text-[11px] uppercase tracking-wide"
        disabled={loading}
      >
        {loading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Power className="h-3.5 w-3.5" />}
        {loading ? '…' : 'Hors service'}
      </button>
      {error && <p className="text-red-400 text-xs">{error}</p>}
    </div>
  );
}
