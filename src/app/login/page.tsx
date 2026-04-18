'use client';

import React, { Suspense, useEffect, useRef, useState, useMemo, useTransition } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { identifiantToEmail } from '@/lib/constants';
import { Plane, Radio, Shield, Flame, Download, GraduationCap, AlertTriangle, Mail } from 'lucide-react';

const PENDING_VERIFICATION_COOKIE = 'pending_login_verification';

function setPendingVerificationCookie() {
  if (typeof document !== 'undefined') {
    document.cookie = `${PENDING_VERIFICATION_COOKIE}=1; path=/; max-age=600; SameSite=Lax`;
  }
}

function clearPendingVerificationCookie() {
  if (typeof document !== 'undefined') {
    document.cookie = `${PENDING_VERIFICATION_COOKIE}=; path=/; max-age=0; SameSite=Lax`;
  }
}

// Composant pour les nuages animés
function AnimatedClouds() {
  const clouds = useMemo(() => 
    Array.from({ length: 6 }, (_, i) => ({
      id: i,
      size: 40 + Math.random() * 60,
      top: 10 + Math.random() * 70,
      duration: 25 + Math.random() * 20,
      delay: Math.random() * -30,
      opacity: 0.03 + Math.random() * 0.05,
    })), []
  );

  return (
    <div className="absolute inset-0 overflow-hidden pointer-events-none">
      {clouds.map((cloud) => (
        <div
          key={cloud.id}
          className="absolute animate-cloud"
          style={{
            top: `${cloud.top}%`,
            width: `${cloud.size}px`,
            height: `${cloud.size * 0.6}px`,
            opacity: cloud.opacity,
            animationDuration: `${cloud.duration}s`,
            animationDelay: `${cloud.delay}s`,
          }}
        >
          <svg viewBox="0 0 100 60" className="w-full h-full fill-white">
            <ellipse cx="30" cy="40" rx="25" ry="18" />
            <ellipse cx="55" cy="35" rx="30" ry="22" />
            <ellipse cx="75" cy="42" rx="20" ry="15" />
            <ellipse cx="45" cy="48" rx="28" ry="12" />
          </svg>
        </div>
      ))}
    </div>
  );
}

// Composant pour l'avion animé
function FlyingPlane() {
  const [visible, setVisible] = useState(false);
  
  useEffect(() => {
    // Premier avion après 2s
    const initialTimeout = setTimeout(() => setVisible(true), 2000);
    
    // Répéter toutes les 15-25 secondes
    const interval = setInterval(() => {
      setVisible(true);
      setTimeout(() => setVisible(false), 8000);
    }, 15000 + Math.random() * 10000);
    
    return () => {
      clearTimeout(initialTimeout);
      clearInterval(interval);
    };
  }, []);

  if (!visible) return null;

  return (
    <div className="absolute inset-0 overflow-hidden pointer-events-none">
      <div className="animate-fly-across absolute" style={{ top: '15%' }}>
        <div className="relative">
          {/* Trainée de l'avion */}
          <div className="absolute right-full top-1/2 -translate-y-1/2 w-32 h-0.5 bg-gradient-to-l from-white/30 to-transparent" />
          {/* Icône avion */}
          <Plane className="h-6 w-6 text-white/60 transform -rotate-12" />
        </div>
      </div>
    </div>
  );
}

// Composant pour les étoiles scintillantes
function TwinklingStars() {
  const stars = useMemo(() => 
    Array.from({ length: 20 }, (_, i) => ({
      id: i,
      left: Math.random() * 100,
      top: Math.random() * 60,
      size: 1 + Math.random() * 2,
      duration: 2 + Math.random() * 3,
      delay: Math.random() * 5,
    })), []
  );

  return (
    <div className="absolute inset-0 overflow-hidden pointer-events-none">
      {stars.map((star) => (
        <div
          key={star.id}
          className="absolute rounded-full bg-white animate-twinkle"
          style={{
            left: `${star.left}%`,
            top: `${star.top}%`,
            width: `${star.size}px`,
            height: `${star.size}px`,
            animationDuration: `${star.duration}s`,
            animationDelay: `${star.delay}s`,
          }}
        />
      ))}
    </div>
  );
}

type LoginMode = 'pilote' | 'atc' | 'siavi';

function LoginPageFallback() {
  return (
    <div className="min-h-screen relative flex items-center justify-center">
      <div className="absolute inset-0 bg-cover bg-center bg-no-repeat" style={{ backgroundImage: 'url(/mixou-bg.png)' }} />
      <div className="absolute inset-0 bg-slate-900/80" />
      <p className="relative z-10 text-slate-400">Chargement…</p>
    </div>
  );
}

type LoginStep = 'form' | 'email' | 'code' | 'forgot' | 'reset';

function LoginPageContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [, startTransition] = useTransition();
  const [loading, setLoading] = useState(true);
  const messageParam = searchParams.get('message');
  const showTestEchoue = messageParam === 'test_echoue_temps_termine';
  const showCompteCree = messageParam === 'compte_cree';
  const showAdminOnly = messageParam === 'admin_only';
  const showInactivity = messageParam === 'inactivity';
  const showSecurityLogout = messageParam === 'security_logout';
  const showPasswordReset = messageParam === 'password_reset';
  const showDiscordRemoved = messageParam === 'discord_removed';
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [identifiant, setIdentifiant] = useState('');
  const [password, setPassword] = useState('');
  const [mode, setMode] = useState<LoginMode>('pilote');
  const [step, setStep] = useState<LoginStep>('form');
  const [emailMasked, setEmailMasked] = useState<string>('');
  const [loginEmail, setLoginEmail] = useState('');
  const [code, setCode] = useState('');
  const [redirectTo, setRedirectTo] = useState<string>('/logbook');
  const [loginAdminOnly, setLoginAdminOnly] = useState(false);
  const [forgotIdentifiantOrEmail, setForgotIdentifiantOrEmail] = useState('');
  const [forgotMessage, setForgotMessage] = useState<{ type: 'ok' | 'err'; text: string } | null>(null);
  const [resetToken, setResetToken] = useState('');
  const [resetPassword, setResetPassword] = useState('');
  const [resetConfirm, setResetConfirm] = useState('');
  const resetSuccessRef = useRef(false);

  useEffect(() => {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), 10000);
    Promise.all([
      fetch('/api/has-admin', { cache: 'no-store', signal: ctrl.signal }).then((r) => r.json()),
      fetch('/api/site-config', { cache: 'no-store', signal: ctrl.signal }).then((r) => r.json()),
    ])
      .then(([hasAdminData, siteConfigData]) => {
        clearTimeout(t);
        if (!hasAdminData?.hasAdmin) router.replace('/setup');
        else setLoading(false);
        setLoginAdminOnly(Boolean(siteConfigData?.login_admin_only));
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

  useEffect(() => {
    if (loading || step !== 'form') return;
    if (searchParams.get('step') === 'verify') {
      setStep('code');
      fetch('/api/auth/send-login-code', { method: 'POST', credentials: 'include' })
        .then(async (res) => {
          const d = await res.json().catch(() => ({}));
          if (res.ok && d.skipCode) {
            clearPendingVerificationCookie();
            router.replace(redirectTo);
            startTransition(() => router.refresh());
            return;
          }
          if (d.emailMasked) setEmailMasked(d.emailMasked);
          if (res.status === 400) setStep('email');
        })
        .catch(() => setStep('email'));
    }
  }, [loading, searchParams, step, redirectTo, router]);

  useEffect(() => {
    const reset = searchParams.get('reset');
    if (reset && step === 'form') {
      resetSuccessRef.current = false;
      setResetToken(reset);
      setStep('reset');
    }
  }, [searchParams, step]);

  async function doRedirect() {
    clearPendingVerificationCookie();
    router.replace(redirectTo);
    startTransition(() => router.refresh());
  }

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
      if (!uid) { router.replace('/logbook'); startTransition(() => router.refresh()); return; }
      let requireCode = true;
      try {
        const regRes = await fetch('/api/auth/register-login', { method: 'POST', credentials: 'include' });
        const regData = await regRes.json().catch(() => ({}));
        requireCode = regData.requireCode !== false;
      } catch { /* ignore */ }
      const { data: profile } = await supabase.from('profiles').select('role, atc, siavi').eq('id', uid).single();
      if (loginAdminOnly && profile?.role !== 'admin') {
        await supabase.auth.signOut();
        throw new Error('Les connexions sont temporairement réservées aux administrateurs.');
      }
      let targetPath = '/logbook';
      if (mode === 'siavi') {
        const canSiavi = profile?.role === 'admin' || profile?.role === 'siavi' || Boolean(profile?.siavi);
        if (!canSiavi) throw new Error('Ce compte n\'a pas accès à l\'espace SIAVI.');
        targetPath = '/siavi';
        setRedirectTo('/siavi');
      } else if (mode === 'atc') {
        const canAtc = profile?.role === 'admin' || profile?.role === 'atc' || profile?.atc;
        if (!canAtc) throw new Error('Ce compte n\'a pas accès à l\'espace ATC.');
        targetPath = '/atc';
        setRedirectTo('/atc');
      } else {
        if (profile?.role === 'atc') throw new Error('Ce compte est uniquement ATC. Sélectionnez "Contrôleur ATC" pour vous connecter.');
        if (profile?.role === 'siavi') throw new Error('Ce compte est uniquement SIAVI. Sélectionnez "SIAVI" pour vous connecter.');
        setRedirectTo('/logbook');
      }
      if (!requireCode) {
        clearPendingVerificationCookie();
        router.replace(targetPath);
        startTransition(() => router.refresh());
        return;
      }
      setPendingVerificationCookie();
      const codeRes = await fetch('/api/auth/send-login-code', { method: 'POST', credentials: 'include' });
      const codeData = await codeRes.json().catch(() => ({}));
      if (codeRes.ok && codeData.skipCode) {
        await doRedirect();
        return;
      }
      if (codeRes.status === 400) {
        setStep('email');
        setError(null);
      } else if (!codeRes.ok) {
        setError(codeData.error || 'Impossible d\'envoyer le code par email.');
      } else {
        setEmailMasked(codeData.emailMasked || 'votre adresse');
        setStep('code');
        setError(null);
      }
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Erreur de connexion');
    } finally {
      setSubmitting(false);
    }
  }

  async function handleEmailSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      const res = await fetch('/api/auth/send-login-code', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: loginEmail.trim() }),
        credentials: 'include',
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok && data.skipCode) {
        await doRedirect();
        return;
      }
      if (!res.ok) throw new Error(data.error || 'Impossible d\'envoyer le code.');
      setEmailMasked(data.emailMasked || 'votre adresse');
      setStep('code');
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Erreur');
    } finally {
      setSubmitting(false);
    }
  }

  async function handleCodeSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      const res = await fetch('/api/auth/verify-login-code', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code: code.replace(/\s/g, '') }),
        credentials: 'include',
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || 'Code invalide.');
      await doRedirect();
      return;
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Code incorrect ou expiré.');
    } finally {
      setSubmitting(false);
    }
  }

  async function handleResendCode() {
    setError(null);
    setSubmitting(true);
    try {
      const body = step === 'code' && loginEmail.trim() ? { email: loginEmail.trim() } : {};
      const res = await fetch('/api/auth/send-login-code', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
        credentials: 'include',
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok && data.skipCode) {
        await doRedirect();
        return;
      }
      if (res.ok && data.emailMasked) setEmailMasked(data.emailMasked);
      if (!res.ok) setError(data.error || 'Erreur lors de l\'envoi.');
    } catch {
      setError('Erreur réseau.');
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
    <div className="min-h-screen relative flex items-center justify-center p-4 overflow-hidden animate-page-reveal">
      {fond}
      {overlay}
      
      {/* Animations d'arrière-plan */}
      <TwinklingStars />
      <AnimatedClouds />
      <FlyingPlane />
      
      <div className="relative z-10 w-full max-w-md">
        {/* Logo / Titre */}
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-20 h-20 rounded-2xl bg-gradient-to-br from-sky-500/30 to-indigo-500/30 mb-4 shadow-xl shadow-sky-500/20 backdrop-blur-sm border border-sky-500/20 animate-zoom-bounce hover:animate-float">
            <Shield className="h-10 w-10 text-sky-400 drop-shadow-lg" />
          </div>
          <h1 className="text-3xl font-bold text-white tracking-tight animate-init animate-slide-up delay-200">PTFS Logbook</h1>
          <p className="text-slate-400 text-sm mt-2 animate-init animate-slide-up delay-300">Système de gestion des vols</p>
        </div>

        {/* Sélecteur de mode (masqué lors de l'étape email/code) */}
        {step === 'form' && (
        <div className="flex gap-2 mb-6 p-1 bg-slate-800/50 rounded-2xl backdrop-blur-sm animate-init animate-reveal-blur delay-400">
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
        )}

        {showTestEchoue && step === 'form' && (
          <div className="mb-4 p-4 rounded-xl bg-amber-500/20 border border-amber-500/40 flex items-center gap-3 animate-init animate-reveal-blur">
            <AlertTriangle className="h-6 w-6 text-amber-400 shrink-0" />
            <p className="text-amber-200 font-medium">Test échoué : temps terminé.</p>
          </div>
        )}
        {showCompteCree && step === 'form' && (
          <div className="mb-4 p-4 rounded-xl bg-emerald-500/20 border border-emerald-500/40 flex items-center gap-3 animate-init animate-reveal-blur">
            <p className="text-emerald-200 font-medium">Compte créé. Connectez-vous avec vos identifiants puis saisissez le code envoyé à votre email.</p>
          </div>
        )}
        {showAdminOnly && step === 'form' && (
          <div className="mb-4 p-4 rounded-xl bg-amber-500/20 border border-amber-500/40 flex items-center gap-3 animate-init animate-reveal-blur">
            <AlertTriangle className="h-6 w-6 text-amber-400 shrink-0" />
            <p className="text-amber-200 font-medium">Les connexions sont temporairement réservées aux administrateurs.</p>
          </div>
        )}
        {showInactivity && step === 'form' && (
          <div className="mb-4 p-4 rounded-xl bg-amber-500/20 border border-amber-500/40 flex items-center gap-3 animate-init animate-reveal-blur">
            <AlertTriangle className="h-6 w-6 text-amber-400 shrink-0" />
            <p className="text-amber-200 font-medium">Vous avez été déconnecté après une heure sans activité. Reconnectez-vous pour continuer.</p>
          </div>
        )}
        {showSecurityLogout && step === 'form' && (
          <div className="mb-4 p-4 rounded-xl bg-red-500/20 border border-red-500/40 flex items-center gap-3 animate-init animate-reveal-blur">
            <AlertTriangle className="h-6 w-6 text-red-400 shrink-0" />
            <p className="text-red-200 font-medium">Déconnexion de sécurité (code d&apos;approbation incorrect). Reconnectez-vous.</p>
          </div>
        )}
        {showPasswordReset && step === 'form' && (
          <div className="mb-4 p-4 rounded-xl bg-emerald-500/20 border border-emerald-500/40 flex items-center gap-3 animate-init animate-reveal-blur">
            <p className="text-emerald-200 font-medium">Mot de passe réinitialisé. Connectez-vous avec votre nouveau mot de passe.</p>
          </div>
        )}
        {showDiscordRemoved && step === 'form' && (
          <div className="mb-4 p-4 rounded-xl bg-red-500/20 border border-red-500/40 flex items-center gap-3 animate-init animate-reveal-blur">
            <AlertTriangle className="h-6 w-6 text-red-400 shrink-0" />
            <p className="text-red-200 font-medium">Ce compte n&apos;est plus autorisé via le serveur Discord requis.</p>
          </div>
        )}

        {/* Formulaire : identifiant / mot de passe */}
        {step === 'form' && (
          <div className="card backdrop-blur-xl bg-slate-800/60 border-slate-700/50 shadow-2xl animate-init animate-reveal-blur delay-500">
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
              <p className="text-center mt-3">
                <button
                  type="button"
                  onClick={() => { setStep('forgot'); setForgotMessage(null); setForgotIdentifiantOrEmail(''); }}
                  className="text-slate-400 hover:text-sky-400 text-sm underline"
                >
                  Mot de passe oublié ?
                </button>
              </p>
            </form>
          </div>
        )}

        {/* Étape : mot de passe oublié */}
        {step === 'forgot' && (
          <div className="card backdrop-blur-xl bg-slate-800/60 border-slate-700/50 shadow-2xl animate-init animate-reveal-blur">
            <h2 className="text-lg font-semibold text-slate-200 mb-2">Mot de passe oublié</h2>
            <p className="text-slate-400 text-sm mb-4">Indiquez votre identifiant de connexion ou l&apos;adresse email enregistrée sur votre compte.</p>
            <div className="space-y-4">
              <input
                type="text"
                className="input bg-slate-900/50 w-full"
                value={forgotIdentifiantOrEmail}
                onChange={(e) => setForgotIdentifiantOrEmail(e.target.value)}
                placeholder="Identifiant ou email"
                autoComplete="username email"
              />
              {forgotMessage && (
                <p className={forgotMessage.type === 'ok' ? 'text-emerald-400 text-sm' : 'text-red-400 text-sm'}>
                  {forgotMessage.text}
                </p>
              )}
              <div className="flex flex-col gap-2">
                <button
                  type="button"
                  onClick={async () => {
                    setForgotMessage(null);
                    setSubmitting(true);
                    try {
                      const res = await fetch('/api/auth/forgot-password', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ identifiant_or_email: forgotIdentifiantOrEmail.trim(), action: 'send_link' }),
                      });
                      const data = await res.json().catch(() => ({}));
                      if (res.ok) setForgotMessage({ type: 'ok', text: data.message || 'Email envoyé.' });
                      else setForgotMessage({ type: 'err', text: data.error || 'Erreur' });
                    } catch {
                      setForgotMessage({ type: 'err', text: 'Erreur réseau.' });
                    } finally {
                      setSubmitting(false);
                    }
                  }}
                  className="btn-primary w-full"
                  disabled={submitting || !forgotIdentifiantOrEmail.trim()}
                >
                  {submitting ? 'Envoi…' : 'Envoyer un lien de réinitialisation'}
                </button>
                <button
                  type="button"
                  onClick={async () => {
                    setForgotMessage(null);
                    setSubmitting(true);
                    try {
                      const res = await fetch('/api/auth/forgot-password', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ identifiant_or_email: forgotIdentifiantOrEmail.trim(), action: 'request_admin' }),
                      });
                      const data = await res.json().catch(() => ({}));
                      if (res.ok) setForgotMessage({ type: 'ok', text: data.message || 'Demande envoyée.' });
                      else setForgotMessage({ type: 'err', text: data.error || 'Erreur' });
                    } catch {
                      setForgotMessage({ type: 'err', text: 'Erreur réseau.' });
                    } finally {
                      setSubmitting(false);
                    }
                  }}
                  className="btn-secondary w-full"
                  disabled={submitting || !forgotIdentifiantOrEmail.trim()}
                >
                  Demander à un administrateur
                </button>
                <button type="button" onClick={() => { setStep('form'); setForgotMessage(null); }} className="text-slate-400 hover:text-slate-200 text-sm">
                  ← Retour à la connexion
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Étape : réinitialisation avec token (lien reçu par email) */}
        {step === 'reset' && (
          <div className="card backdrop-blur-xl bg-slate-800/60 border-slate-700/50 shadow-2xl animate-init animate-reveal-blur">
            <h2 className="text-lg font-semibold text-slate-200 mb-2">Nouveau mot de passe</h2>
            <p className="text-slate-400 text-sm mb-4">Choisissez un nouveau mot de passe (au moins 8 caractères).</p>
            <form
              onSubmit={async (e) => {
                e.preventDefault();
                if (resetPassword.length < 8) { setError('Le mot de passe doit faire au moins 8 caractères.'); return; }
                if (resetPassword !== resetConfirm) { setError('Les deux mots de passe ne correspondent pas.'); return; }
                setError(null);
                setSubmitting(true);
                try {
                  const res = await fetch('/api/auth/reset-password-with-token', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ token: resetToken, new_password: resetPassword }),
                  });
                  const data = await res.json().catch(() => ({}));
                  if (res.ok) {
                    resetSuccessRef.current = true;
                    router.replace('/login?message=password_reset');
                    startTransition(() => router.refresh());
                    return;
                  }
                  throw new Error(data.error || 'Erreur');
                } catch (err) {
                  if (resetSuccessRef.current) {
                    router.replace('/login?message=password_reset');
                    startTransition(() => router.refresh());
                    return;
                  }
                  setError(err instanceof Error ? err.message : 'Erreur');
                } finally {
                  setSubmitting(false);
                }
              }}
              className="space-y-4"
            >
              <div>
                <label className="label text-slate-200">Nouveau mot de passe</label>
                <input
                  type="password"
                  className="input bg-slate-900/50 w-full"
                  value={resetPassword}
                  onChange={(e) => setResetPassword(e.target.value)}
                  required
                  minLength={8}
                  autoComplete="new-password"
                />
              </div>
              <div>
                <label className="label text-slate-200">Confirmer</label>
                <input
                  type="password"
                  className="input bg-slate-900/50 w-full"
                  value={resetConfirm}
                  onChange={(e) => setResetConfirm(e.target.value)}
                  required
                  minLength={8}
                  autoComplete="new-password"
                />
              </div>
              {error && (
                <div className="space-y-1">
                  <p className="text-red-400 text-sm">{error}</p>
                  {(error.includes('invalide') || error.includes('expiré')) && (
                    <p className="text-slate-400 text-sm">
                      <button
                        type="button"
                        onClick={() => { setStep('forgot'); setError(null); setResetPassword(''); setResetConfirm(''); }}
                        className="text-sky-400 hover:underline"
                      >
                        Demander un nouveau lien par email
                      </button>
                    </p>
                  )}
                </div>
              )}
              <button type="submit" className="btn-primary w-full" disabled={submitting}>
                {submitting ? 'Enregistrement…' : 'Enregistrer le mot de passe'}
              </button>
              <button
                type="button"
                onClick={() => { setStep('form'); setError(null); setResetToken(''); setResetPassword(''); setResetConfirm(''); router.replace('/login'); }}
                className="text-slate-400 hover:text-slate-200 text-sm w-full"
              >
                Retour à la connexion
              </button>
            </form>
          </div>
        )}

        {/* Étape : aucun email défini → demander d'ajouter un email */}
        {step === 'email' && (
          <div className="card backdrop-blur-xl bg-slate-800/60 border-slate-700/50 shadow-2xl animate-init animate-reveal-blur delay-500">
            <p className="text-slate-300 text-sm mb-4">
              Aucune adresse email n&apos;est enregistrée pour ce compte. Indiquez votre email ci-dessous : un code de confirmation vous sera envoyé. Une fois le code saisi, votre email sera enregistré et utilisé à chaque connexion.
            </p>
            <form onSubmit={handleEmailSubmit} className="space-y-5">
              <div>
                <label className="label text-slate-200">Adresse email</label>
                <input
                  type="email"
                  inputMode="email"
                  autoCapitalize="none"
                  autoCorrect="off"
                  spellCheck={false}
                  className="input bg-slate-900/50"
                  value={loginEmail}
                  onChange={(e) => setLoginEmail(e.target.value)}
                  placeholder="vous@exemple.com"
                  required
                  autoComplete="email"
                />
              </div>
              {error && (
                <div className="p-4 rounded-xl bg-red-500/10 border border-red-500/30 backdrop-blur-sm">
                  <p className="text-red-400 text-sm font-medium">{error}</p>
                </div>
              )}
              <button
                type="submit"
                className="w-full py-3.5 rounded-xl font-bold bg-gradient-to-r from-sky-500 to-sky-400 hover:from-sky-400 hover:to-sky-300 text-white shadow-lg shadow-sky-500/30 disabled:opacity-50"
                disabled={submitting}
              >
                {submitting ? 'Envoi…' : 'Envoyer le code'}
              </button>
            </form>
          </div>
        )}

        {/* Étape : saisie du code (email déjà défini ou venant d'être saisi) */}
        {step === 'code' && (
          <div className="card backdrop-blur-xl bg-slate-800/60 border-slate-700/50 shadow-2xl animate-init animate-reveal-blur delay-500">
            <div className="flex items-center gap-2 text-slate-300 mb-4">
              <Mail className="h-5 w-5 text-sky-400" />
              <p className="text-sm">
                Un code de confirmation a été envoyé à <strong className="text-slate-200">{emailMasked || 'votre adresse'}</strong>. Saisissez-le ci-dessous pour valider la connexion.
              </p>
            </div>
            <form onSubmit={handleCodeSubmit} className="space-y-5">
              <div>
                <label className="label text-slate-200">Code de vérification</label>
                <input
                  type="text"
                  inputMode="numeric"
                  pattern="[0-9]*"
                  maxLength={6}
                  className="input bg-slate-900/50 text-center text-2xl tracking-[0.5em] font-mono"
                  value={code}
                  onChange={(e) => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                  placeholder="000000"
                  required
                  autoComplete="one-time-code"
                />
              </div>
              {error && (
                <div className="p-4 rounded-xl bg-red-500/10 border border-red-500/30 backdrop-blur-sm">
                  <p className="text-red-400 text-sm font-medium">{error}</p>
                </div>
              )}
              <button
                type="submit"
                className="w-full py-3.5 rounded-xl font-bold bg-gradient-to-r from-sky-500 to-sky-400 hover:from-sky-400 hover:to-sky-300 text-white shadow-lg shadow-sky-500/30 disabled:opacity-50"
                disabled={submitting || code.length !== 6}
              >
                {submitting ? 'Vérification…' : 'Confirmer la connexion'}
              </button>
              <button
                type="button"
                onClick={handleResendCode}
                disabled={submitting}
                className="w-full py-2 text-slate-400 hover:text-sky-400 text-sm transition-colors"
              >
                Renvoyer le code
              </button>
            </form>
          </div>
        )}


        {/* Boutons secondaires */}
        <div className="mt-6 flex flex-row items-center justify-center gap-3 animate-init animate-slide-up delay-800">
          <Link
            href="/aeroschool"
            className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-amber-500/10 border border-amber-500/30 text-amber-300 hover:text-amber-200 hover:bg-amber-500/20 hover:border-amber-500/50 transition-all backdrop-blur-sm group cursor-pointer"
          >
            <GraduationCap className="h-5 w-5 text-amber-400 group-hover:scale-110 transition-transform" />
            <span className="font-semibold">AeroSchool</span>
          </Link>
          <Link
            href="/carte-atc"
            className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-emerald-500/10 border border-emerald-500/30 text-emerald-300 hover:text-emerald-200 hover:bg-emerald-500/20 hover:border-emerald-500/50 transition-all backdrop-blur-sm group cursor-pointer"
          >
            <Radio className="h-4 w-4 text-emerald-400 group-hover:scale-110 transition-transform" />
            <span className="font-semibold">ODW</span>
          </Link>
          <Link
            href="/download"
            className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-sky-500/10 border border-sky-500/30 text-sky-300 hover:text-sky-200 hover:bg-sky-500/20 hover:border-sky-500/50 transition-all backdrop-blur-sm group cursor-pointer"
          >
            <Download className="h-4 w-4 text-sky-400 group-hover:scale-110 transition-transform" />
            <span className="font-semibold">Téléchargements</span>
          </Link>
        </div>
      </div>
    </div>
  );
}

export default function LoginPage() {
  return (
    <Suspense fallback={<LoginPageFallback />}>
      <LoginPageContent />
    </Suspense>
  );
}
