'use client';

import { useState } from 'react';
import { Sparkles, Loader2, Check } from 'lucide-react';

export default function GenerateAllCardsButton() {
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<{ generated: number; message: string } | null>(null);

  async function handleClick() {
    if (!confirm('Générer les cartes pour tous les utilisateurs qui n\'en ont pas ?')) return;
    
    setLoading(true);
    setResult(null);
    
    try {
      const res = await fetch('/api/cartes/generate-all', { method: 'POST' });
      const data = await res.json();
      setResult({ generated: data.generated || 0, message: data.message || data.error });
    } catch (e) {
      setResult({ generated: 0, message: 'Erreur' });
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
        className="flex items-center gap-2 px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg transition-colors text-sm font-medium disabled:opacity-50"
      >
        {loading ? (
          <>
            <Loader2 className="h-4 w-4 animate-spin" />
            Génération...
          </>
        ) : (
          <>
            <Sparkles className="h-4 w-4" />
            Générer toutes les cartes manquantes
          </>
        )}
      </button>
      
      {result && (
        <span className={`text-sm flex items-center gap-1 ${result.generated > 0 ? 'text-emerald-400' : 'text-slate-400'}`}>
          {result.generated > 0 && <Check className="h-4 w-4" />}
          {result.message}
        </span>
      )}
    </div>
  );
}
