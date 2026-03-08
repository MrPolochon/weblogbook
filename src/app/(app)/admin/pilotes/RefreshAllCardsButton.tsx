'use client';

import { useState } from 'react';
import { RefreshCw, Loader2, Check } from 'lucide-react';

export default function RefreshAllCardsButton() {
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<{ updated: number; message: string } | null>(null);

  async function handleClick() {
    if (!confirm('Mettre à jour toutes les cartes : compagnie, logo et type de carte (ATC / Pompier / Pilote / Staff) selon les profils actuels ? La date de délivrance ne sera pas modifiée.')) return;

    setLoading(true);
    setResult(null);

    try {
      const res = await fetch('/api/cartes/refresh-all', { method: 'POST' });
      const data = await res.json();
      if (!res.ok) {
        setResult({ updated: 0, message: data.error || 'Erreur' });
        return;
      }
      setResult({ updated: data.updated ?? 0, message: data.message || `${data.updated} carte(s) mise(s) à jour.` });
    } catch (e) {
      setResult({ updated: 0, message: 'Erreur' });
      console.error(e);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex items-center gap-3">
      <button
        onClick={handleClick}
        disabled={loading}
        className="flex items-center gap-2 px-4 py-2 bg-sky-600 hover:bg-sky-700 text-white rounded-lg transition-colors text-sm font-medium disabled:opacity-50"
      >
        {loading ? (
          <>
            <Loader2 className="h-4 w-4 animate-spin" />
            Mise à jour...
          </>
        ) : (
          <>
            <RefreshCw className="h-4 w-4" />
            Mettre à jour cartes (compagnie, logo, type ATC/Pompier/Pilote/Staff)
          </>
        )}
      </button>

      {result && (
        <span className={`text-sm flex items-center gap-1 ${result.updated > 0 ? 'text-sky-400' : 'text-slate-400'}`}>
          {result.updated > 0 && <Check className="h-4 w-4" />}
          {result.message}
        </span>
      )}
    </div>
  );
}
