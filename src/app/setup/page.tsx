'use client';

import { useEffect, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';

export default function SetupPage() {
  const router = useRouter();
  const [, startTransition] = useTransition();
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [identifiant, setIdentifiant] = useState('');
  const [password, setPassword] = useState('');

  useEffect(() => {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), 10000);
    fetch('/api/has-admin', { cache: 'no-store', signal: ctrl.signal })
      .then((r) => r.json())
      .then((d) => {
        clearTimeout(t);
        if (d.hasAdmin) router.replace('/login');
        else setLoading(false);
      })
      .catch(() => {
        clearTimeout(t);
        setLoading(false);
      });
    return () => {
      clearTimeout(t);
      ctrl.abort();
    };
  }, [router]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      const res = await fetch('/api/setup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ identifiant: identifiant.trim(), password }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || data.error) {
        throw new Error(data.error || 'Erreur lors de la création');
      }
      const supabase = createClient();
      const { error: signInErr } = await supabase.auth.signInWithPassword({
        email: data.email,
        password,
      });
      if (signInErr) throw new Error('Compte créé. Connectez-vous avec vos identifiants.');
      router.replace('/logbook');
      startTransition(() => router.refresh());
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Erreur');
    } finally {
      setSubmitting(false);
    }
  }

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <p className="text-slate-400">Chargement…</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center p-4">
      <div className="card w-full max-w-md">
        <h1 className="text-xl font-semibold text-slate-100 mb-2">
          Création du premier administrateur
        </h1>
        <p className="text-slate-400 text-sm mb-6">
          Aucun administrateur n&apos;existe. Créez le premier pour accéder au logbook.
        </p>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="label">Identifiant</label>
            <input
              type="text"
              className="input"
              value={identifiant}
              onChange={(e) => setIdentifiant(e.target.value)}
              placeholder="ex: admin"
              required
              autoComplete="username"
            />
          </div>
          <div>
            <label className="label">Mot de passe</label>
            <input
              type="password"
              className="input"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••"
              required
              minLength={8}
              autoComplete="new-password"
            />
            <p className="text-slate-500 text-xs mt-1">Minimum 8 caractères</p>
          </div>
          {error && (
            <p className="text-red-400 text-sm">{error}</p>
          )}
          <button type="submit" className="btn-primary w-full" disabled={submitting}>
            {submitting ? 'Création…' : 'Créer l\'administrateur'}
          </button>
        </form>
      </div>
    </div>
  );
}
