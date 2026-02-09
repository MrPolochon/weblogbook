'use client';

import React, { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { identifiantToEmail } from '@/lib/constants';
import { Plane, Radio, Shield, Flame } from 'lucide-react';


type LoginMode = 'pilote' | 'atc' | 'siavi';

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
      const { data: profile } = await supabase.from('profiles').select('role, atc, siavi').eq('id', uid).single();
      
      if (mode === 'siavi') {
        // Les admins ont toujours accès à SIAVI, sinon vérifier siavi ou role siavi
        const canSiavi = profile?.role === 'admin' || profile?.role === 'siavi' || Boolean(profile?.siavi);
        if (!canSiavi) throw new Error('Ce compte n\'a pas accès à l\'espace SIAVI.');
        router.replace('/siavi');
      } else if (mode === 'atc') {
        const canAtc = profile?.role === 'admin' || profile?.role === 'atc' || profile?.atc;
        if (!canAtc) throw new Error('Ce compte n\'a pas accès à l\'espace ATC.');
        router.replace('/atc');
      } else {
        // Comptes exclusivement ATC ou SIAVI ne peuvent pas accéder à l'espace pilote
        if (profile?.role === 'atc') throw new Error('Ce compte est uniquement ATC. Sélectionnez "Contrôleur ATC" pour vous connecter.');
        if (profile?.role === 'siavi') throw new Error('Ce compte est uniquement SIAVI. Sélectionnez "SIAVI" pour vous connecter.');
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
      style={{ backgroundImage: 'url(/mixou-bg.png)' }}
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
      <div className="relative z-10 w-full max-w-md animate-fade-in">
        {/* Logo / Titre */}
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-20 h-20 rounded-2xl bg-gradient-to-br from-sky-500/30 to-indigo-500/30 mb-4 shadow-xl shadow-sky-500/20 backdrop-blur-sm border border-sky-500/20">
            <Shield className="h-10 w-10 text-sky-400" />
          </div>
          <h1 className="text-3xl font-bold text-white tracking-tight">PTFS Logbook</h1>
          <p className="text-slate-400 text-sm mt-2">Système de gestion des vols</p>
        </div>

        {/* Sélecteur de mode */}
        <div className="flex gap-2 mb-6 p-1 bg-slate-800/50 rounded-2xl backdrop-blur-sm">
          <button
            type="button"
            onClick={() => setMode('pilote')}
            className={`flex-1 flex items-center justify-center gap-2 py-3.5 px-3 rounded-xl font-semibold transition-all duration-300 ${
              mode === 'pilote'
                ? 'bg-gradient-to-r from-sky-500 to-sky-400 text-white shadow-lg shadow-sky-500/40'
                : 'text-slate-400 hover:text-slate-200 hover:bg-slate-700/50'
            }`}
          >
            <Plane className="h-5 w-5" />
            <span className="hidden sm:inline">Pilote</span>
          </button>
          <button
            type="button"
            onClick={() => setMode('atc')}
            className={`flex-1 flex items-center justify-center gap-2 py-3.5 px-3 rounded-xl font-semibold transition-all duration-300 ${
              mode === 'atc'
                ? 'bg-gradient-to-r from-emerald-500 to-emerald-400 text-white shadow-lg shadow-emerald-500/40'
                : 'text-slate-400 hover:text-slate-200 hover:bg-slate-700/50'
            }`}
          >
            <Radio className="h-5 w-5" />
            <span className="hidden sm:inline">ATC</span>
          </button>
          <button
            type="button"
            onClick={() => setMode('siavi')}
            className={`flex-1 flex items-center justify-center gap-2 py-3.5 px-3 rounded-xl font-semibold transition-all duration-300 ${
              mode === 'siavi'
                ? 'bg-gradient-to-r from-red-500 to-red-400 text-white shadow-lg shadow-red-500/40'
                : 'text-slate-400 hover:text-slate-200 hover:bg-slate-700/50'
            }`}
          >
            <Flame className="h-5 w-5" />
            <span className="hidden sm:inline">SIAVI</span>
          </button>
        </div>

        {/* Formulaire */}
        <div className="card backdrop-blur-xl bg-slate-800/60 border-slate-700/50 shadow-2xl">
          <form onSubmit={handleSubmit} className="space-y-5">
            <div>
              <label className="label text-slate-200">Identifiant</label>
              <input
                type="text"
                className="input bg-slate-900/50"
                value={identifiant}
                onChange={(e) => setIdentifiant(e.target.value)}
                placeholder="Votre identifiant"
                required
                autoComplete="username"
              />
            </div>
            <div>
              <label className="label text-slate-200">Mot de passe</label>
              <input
                type="password"
                className="input bg-slate-900/50"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                required
                autoComplete="current-password"
              />
            </div>
            
            {error && (
              <div className="p-4 rounded-xl bg-red-500/10 border border-red-500/30 backdrop-blur-sm">
                <p className="text-red-400 text-sm font-medium">{error}</p>
              </div>
            )}
            
            <button 
              type="submit" 
              className={`w-full py-3.5 rounded-xl font-bold transition-all duration-300 transform active:scale-[0.98] ${
                mode === 'pilote'
                  ? 'bg-gradient-to-r from-sky-500 to-sky-400 hover:from-sky-400 hover:to-sky-300 text-white shadow-lg shadow-sky-500/30 hover:shadow-sky-500/50'
                  : mode === 'atc'
                    ? 'bg-gradient-to-r from-emerald-500 to-emerald-400 hover:from-emerald-400 hover:to-emerald-300 text-white shadow-lg shadow-emerald-500/30 hover:shadow-emerald-500/50'
                    : 'bg-gradient-to-r from-red-500 to-red-400 hover:from-red-400 hover:to-red-300 text-white shadow-lg shadow-red-500/30 hover:shadow-red-500/50'
              }`}
              disabled={submitting}
            >
              {submitting ? (
                <span className="flex items-center justify-center gap-2">
                  <svg className="animate-spin h-5 w-5" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                  </svg>
                  Connexion…
                </span>
              ) : (
                <>
                  {mode === 'pilote' ? 'Accéder à l\'espace pilote' : mode === 'atc' ? 'Accéder à l\'espace ATC' : 'Accéder à l\'espace SIAVI'}
                  <span className="ml-2">→</span>
                </>
              )}
            </button>
          </form>
        </div>

        <p className="text-slate-500 text-sm mt-8 text-center">
          Premier accès ? <a href="/setup" className="text-sky-400 hover:text-sky-300 font-medium transition-colors">Créer le premier admin</a>
        </p>
      </div>
    </div>
  );
}
