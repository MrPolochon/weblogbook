'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Wrench, MapPin, Loader2 } from 'lucide-react';
import { AEROPORTS_VOL_CIVIL } from '@/lib/aeroports-ptfs';

export default function GroundConnexionForm() {
  const router = useRouter();
  const [, startTransition] = useTransition();
  const [aeroport, setAeroport] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!aeroport) return;

    setLoading(true);
    setError(null);

    try {
      const res = await fetch('/api/ground/session', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ aeroport }),
      });

      const data = await res.json() as { error?: string };
      if (!res.ok) {
        setError(data.error ?? 'Erreur lors de la connexion');
        return;
      }

      startTransition(() => router.refresh());
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex items-center justify-center min-h-[60vh]">
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center h-16 w-16 rounded-2xl bg-emerald-900/30 border border-emerald-800/40 mb-4">
            <Wrench className="h-8 w-8 text-emerald-400" />
          </div>
          <h1 className="text-2xl font-bold text-slate-100">Ground Crew</h1>
          <p className="text-slate-400 text-sm mt-2">Choisissez votre aéroport de service pour commencer</p>
        </div>

        <form onSubmit={handleSubmit} className="rounded-2xl border border-slate-700/50 bg-slate-800/30 p-6 space-y-5">
          <div>
            <label htmlFor="aeroport" className="block text-sm font-semibold text-slate-300 mb-2">
              <MapPin className="inline h-4 w-4 mr-1.5 text-emerald-400" />
              Aéroport
            </label>
            <select
              id="aeroport"
              value={aeroport}
              onChange={(e) => setAeroport(e.target.value)}
              required
              className="w-full rounded-xl border border-slate-600/50 bg-slate-900/50 px-3 py-2.5 text-sm text-slate-100 focus:border-emerald-500/60 focus:ring-2 focus:ring-emerald-500/20 outline-none transition-colors"
            >
              <option value="">— Sélectionner un aéroport —</option>
              {AEROPORTS_VOL_CIVIL.map((a) => (
                <option key={a.code} value={a.code}>
                  {a.code} – {a.nom}
                </option>
              ))}
            </select>
          </div>

          {error && (
            <p className="text-sm text-red-400 bg-red-500/10 border border-red-500/20 rounded-lg px-3 py-2">
              {error}
            </p>
          )}

          <button
            type="submit"
            disabled={!aeroport || loading}
            className="w-full flex items-center justify-center gap-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 disabled:bg-slate-700 disabled:text-slate-500 text-white text-sm font-bold py-3 transition-colors"
          >
            {loading ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                Connexion…
              </>
            ) : (
              <>
                <Wrench className="h-4 w-4" />
                Se mettre en service
              </>
            )}
          </button>
        </form>
      </div>
    </div>
  );
}
