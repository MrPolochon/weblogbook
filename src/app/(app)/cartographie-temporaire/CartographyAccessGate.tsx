'use client';

import { useState } from 'react';
import { KeyRound } from 'lucide-react';

export default function CartographyAccessGate({ enabled }: { enabled: boolean }) {
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/cartography/access', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'Mot de passe invalide');
      window.location.reload();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erreur');
    } finally {
      setLoading(false);
    }
  };

  if (!enabled) {
    return (
      <div className="rounded-2xl border border-amber-500/30 bg-amber-500/10 p-6">
        <h1 className="text-xl font-semibold text-amber-300">Module temporaire désactivé</h1>
        <p className="mt-2 text-sm text-amber-100/80">
          La cartographie temporaire n&apos;est pas encore ouverte. Demande à un admin d&apos;activer l&apos;accès.
        </p>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-lg rounded-2xl border border-cyan-500/20 bg-slate-900/70 p-6">
      <div className="mb-5 flex items-center gap-3">
        <div className="rounded-xl bg-cyan-500/10 p-3 text-cyan-300">
          <KeyRound className="h-6 w-6" />
        </div>
        <div>
          <h1 className="text-xl font-semibold text-slate-100">Accès cartographie temporaire</h1>
          <p className="text-sm text-slate-400">
            Entre le mot de passe temporaire fourni par un administrateur.
          </p>
        </div>
      </div>
      <div className="space-y-3">
        <input
          type="password"
          value={password}
          onChange={(event) => setPassword(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === 'Enter' && !loading) {
              void submit();
            }
          }}
          className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-slate-100"
          placeholder="Mot de passe temporaire"
        />
        {error && <p className="text-sm text-red-400">{error}</p>}
        <button
          onClick={() => void submit()}
          disabled={loading || !password.trim()}
          className="w-full rounded-lg bg-cyan-600 px-4 py-2 font-medium text-white disabled:opacity-60"
        >
          {loading ? 'Vérification...' : 'Entrer dans l’éditeur'}
        </button>
      </div>
    </div>
  );
}
