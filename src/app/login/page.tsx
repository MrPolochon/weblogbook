'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { identifiantToEmail } from '@/lib/constants';
import { Plane, Radio, Shield } from 'lucide-react';

type LoginMode = 'pilote' | 'atc';

export default function LoginPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [identifiant, setIdentifiant] = useState('');
  const [password, setPassword] = useState('');
  const [mode, setMode] = useState<LoginMode>('pilote');

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
      
      if (mode === 'atc') {
        const canAtc = profile?.role === 'admin' || profile?.role === 'atc' || profile?.atc;
        if (!canAtc) throw new Error('Ce compte n\'a pas accès à l\'espace ATC.');
        router.replace('/atc');
      } else {
        if (profile?.role === 'atc') throw new Error('Ce compte est uniquement ATC. Sélectionnez "Contrôleur ATC" pour vous connecter.');
        router.replace('/logbook');
      }
      router.refresh();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Erreur de connexion');
    } finally {
      setSubmitting(false);
    }
  }

  const fond = (
    <div
      className="absolute inset-0 bg-cover bg-center bg-no-repeat"
      style={{ backgroundImage: 'url(/ptfs-logo.png)' }}
    />
  );
  const overlay = <div className="absolute inset-0 bg-slate-900/80" />;

  if (loading) {
    return (
      <div className="min-h-screen relative flex items-center justify-center">
        {fond}
        {overlay}
        <p className="relative z-10 text-slate-400">Chargement…</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen relative flex items-center justify-center p-4">
      {fond}
      {overlay}
      <div className="relative z-10 w-full max-w-md">
        {/* Logo / Titre */}
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-sky-500/20 mb-4">
            <Shield className="h-8 w-8 text-sky-400" />
          </div>
          <h1 className="text-2xl font-bold text-white">PTFS Logbook</h1>
          <p className="text-slate-400 text-sm mt-1">Système de gestion des vols</p>
        </div>

        {/* Sélecteur de mode */}
        <div className="flex gap-2 mb-6">
          <button
            type="button"
            onClick={() => setMode('pilote')}
            className={`flex-1 flex items-center justify-center gap-2 py-3 px-4 rounded-lg font-medium transition-all ${
              mode === 'pilote'
                ? 'bg-sky-500 text-white shadow-lg shadow-sky-500/30'
                : 'bg-slate-800/80 text-slate-400 hover:bg-slate-700/80 hover:text-slate-300'
            }`}
          >
            <Plane className="h-5 w-5" />
            <span>Pilote</span>
          </button>
          <button
            type="button"
            onClick={() => setMode('atc')}
            className={`flex-1 flex items-center justify-center gap-2 py-3 px-4 rounded-lg font-medium transition-all ${
              mode === 'atc'
                ? 'bg-emerald-500 text-white shadow-lg shadow-emerald-500/30'
                : 'bg-slate-800/80 text-slate-400 hover:bg-slate-700/80 hover:text-slate-300'
            }`}
          >
            <Radio className="h-5 w-5" />
            <span>Contrôleur ATC</span>
          </button>
        </div>

        {/* Formulaire */}
        <div className="card">
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
            
            {error && (
              <div className="p-3 rounded-lg bg-red-500/10 border border-red-500/30">
                <p className="text-red-400 text-sm">{error}</p>
              </div>
            )}
            
            <button 
              type="submit" 
              className={`w-full py-3 rounded-lg font-semibold transition-all ${
                mode === 'pilote'
                  ? 'bg-sky-500 hover:bg-sky-600 text-white'
                  : 'bg-emerald-500 hover:bg-emerald-600 text-white'
              }`}
              disabled={submitting}
            >
              {submitting ? 'Connexion…' : mode === 'pilote' ? 'Accéder à l\'espace pilote' : 'Accéder à l\'espace ATC'}
            </button>
          </form>
        </div>

        <p className="text-slate-500 text-xs mt-6 text-center">
          Premier accès ? <a href="/setup" className="text-slate-300 hover:text-white underline">Créer le premier admin</a>
        </p>
      </div>
    </div>
  );
}
