'use client';

import { useState } from 'react';
import { Shield, Lock } from 'lucide-react';

export default function IfsaAdminUnlock() {
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const res = await fetch('/api/ifsa/admin-unlock', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data.error || 'Mot de passe incorrect.');
        return;
      }
      window.location.reload();
    } catch {
      setError('Erreur réseau.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="max-w-md mx-auto mt-16 card space-y-5">
      <div className="flex items-center gap-3">
        <div className="p-3 rounded-xl bg-indigo-500/15 border border-indigo-400/30">
          <Lock className="h-6 w-6 text-indigo-300" />
        </div>
        <div>
          <h1 className="text-lg font-bold text-slate-100 flex items-center gap-2">
            <Shield className="h-5 w-5 text-indigo-400" />
            Accès IFSA
          </h1>
          <p className="text-sm text-slate-400 mt-0.5">
            Espace réservé aux agents IFSA. Un administrateur doit confirmer avec le mot de passe superadmin.
          </p>
        </div>
      </div>
      <form onSubmit={onSubmit} className="space-y-3">
        <label className="label">Mot de passe superadmin</label>
        <input
          type="password"
          className="input"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          autoComplete="current-password"
          required
        />
        {error && <p className="text-sm text-red-400">{error}</p>}
        <button type="submit" className="btn-primary w-full" disabled={loading || !password.trim()}>
          {loading ? 'Vérification…' : 'Déverrouiller'}
        </button>
      </form>
    </div>
  );
}
