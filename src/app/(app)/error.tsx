'use client';

import { useEffect } from 'react';
import { AlertTriangle, RefreshCw } from 'lucide-react';

export default function AppError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    console.error('Erreur Espace Pilote:', error);
  }, [error]);

  return (
    <div className="min-h-[60vh] flex flex-col items-center justify-center gap-6 px-4">
      <div className="flex flex-col items-center gap-3 text-center">
        <div className="h-16 w-16 rounded-full bg-red-500/10 flex items-center justify-center">
          <AlertTriangle className="h-8 w-8 text-red-400" />
        </div>
        <h2 className="text-xl font-semibold text-slate-100">Une erreur est survenue</h2>
        <p className="text-sm text-slate-400 max-w-md">
          Quelque chose s&apos;est mal passé. Essayez de rafraîchir la page ou revenez plus tard.
        </p>
      </div>
      <button
        onClick={reset}
        className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-sky-600 hover:bg-sky-700 text-white font-medium text-sm transition-colors"
      >
        <RefreshCw className="h-4 w-4" />
        Réessayer
      </button>
    </div>
  );
}
