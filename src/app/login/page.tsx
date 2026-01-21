'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Image from 'next/image';
import { createClient } from '@/lib/supabase/client';
import { identifiantToEmail } from '@/lib/constants';

export default function LoginPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [identifiant, setIdentifiant] = useState('');
  const [password, setPassword] = useState('');
  const [espaceAtc, setEspaceAtc] = useState(false);
  const [logoError, setLogoError] = useState(false);

  useEffect(() => {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), 10000);
    fetch('/api/has-admin', { cache: 'no-store', signal: ctrl.signal })
      .then((r) => r.json())
      .then((d) => {
        clearTimeout(t);
        if (!d.hasAdmin) router.replace('/setup');
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
      const email = identifiantToEmail(identifiant);
      const supabase = createClient();
      const { data: signData, error: signInErr } = await supabase.auth.signInWithPassword({ email, password });
      if (signInErr) throw new Error(signInErr.message || 'Identifiant ou mot de passe incorrect.');
      const uid = signData?.user?.id;
      if (!uid) { router.replace('/logbook'); router.refresh(); return; }
      const { data: profile } = await supabase.from('profiles').select('role, atc').eq('id', uid).single();
      if (espaceAtc) {
        const canAtc = profile?.role === 'admin' || profile?.role === 'atc' || profile?.atc;
        if (!canAtc) throw new Error('Ce compte n\'a pas accès à l\'espace ATC.');
        router.replace('/atc');
      } else {
        if (profile?.role === 'atc') throw new Error('Ce compte est uniquement ATC. Cochez « Espace ATC » pour vous connecter.');
        router.replace('/logbook');
      }
      router.refresh();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Erreur de connexion');
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
        {!logoError && (
          <div className="flex justify-center mb-6">
            <Image
              src="/ptfs-logo.png"
              alt="PTFS"
              width={140}
              height={140}
              className="rounded-full object-cover"
              priority
              onError={() => setLogoError(true)}
            />
          </div>
        )}
        <h1 className="text-xl font-semibold text-slate-100 mb-2">Connexion</h1>
        <p className="text-slate-400 text-sm mb-6">Identifiant et mot de passe fournis par votre administrateur.</p>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="label">Identifiant</label>
            <input
              type="text"
              className="input"
              value={identifiant}
              onChange={(e) => setIdentifiant(e.target.value)}
              placeholder="Votre identifiant"
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
              autoComplete="current-password"
            />
          </div>
          <label className="flex items-center gap-2 text-sm text-slate-400 cursor-pointer">
            <input type="checkbox" checked={espaceAtc} onChange={(e) => setEspaceAtc(e.target.checked)} className="rounded" />
            Espace ATC
          </label>
          {error && <p className="text-red-400 text-sm">{error}</p>}
          <button type="submit" className="btn-primary w-full" disabled={submitting}>
            {submitting ? 'Connexion…' : 'Se connecter'}
          </button>
          <p className="text-slate-500 text-xs mt-4 text-center">
            Premier accès ? <a href="/setup" className="text-slate-300 underline">Créer le premier admin</a>
          </p>
        </form>
      </div>
    </div>
  );
}
