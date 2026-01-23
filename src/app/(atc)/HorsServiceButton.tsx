'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Power, Loader2 } from 'lucide-react';

export default function HorsServiceButton() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleClick() {
    setError(null);
    setLoading(true);
    try {
      const res = await fetch('/api/atc/session', { method: 'DELETE' });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || 'Erreur');
      router.refresh();
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
        className="flex items-center gap-2 px-4 py-2 rounded-lg bg-red-100 text-red-700 hover:bg-red-200 border border-red-300 transition-colors font-medium text-sm" 
        disabled={loading}
      >
        {loading ? (
          <Loader2 className="h-4 w-4 animate-spin" />
        ) : (
          <Power className="h-4 w-4" />
        )}
        {loading ? 'Déconnexion...' : 'Hors service'}
      </button>
      {error && <p className="text-red-600 text-sm">{error}</p>}
    </div>
  );
}
