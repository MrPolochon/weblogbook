'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { LogOut } from 'lucide-react';

export default function HorsServiceSiaviButton() {
  const router = useRouter();
  const [, startTransition] = useTransition();
  const [loading, setLoading] = useState(false);

  const handleClick = async () => {
    if (!confirm('Êtes-vous sûr de vouloir vous mettre hors service ?')) return;
    
    setLoading(true);
    try {
      const res = await fetch('/api/siavi/session', { method: 'DELETE' });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || 'Erreur');
      }
      startTransition(() => router.refresh());
    } catch (err: any) {
      alert(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <button
      onClick={handleClick}
      disabled={loading}
      className="inline-flex items-center gap-2 px-4 py-2 rounded-lg border border-slate-600 bg-slate-800 hover:bg-slate-700 text-slate-100 min-h-12 font-medium transition-colors disabled:opacity-50"
    >
      <LogOut className="h-4 w-4" />
      {loading ? 'Fin du service…' : 'Terminer mon service'}
    </button>
  );
}
