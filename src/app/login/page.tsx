'use client';

import React, { Suspense, useEffect, useRef, useState, useMemo, useTransition } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { identifiantToEmail } from '@/lib/constants';
import { fetchWithTimeout } from '@/lib/fetch-with-timeout';
import { Plane, Radio, Shield, Flame, Download, GraduationCap, AlertTriangle, Mail, Sun, Clock, User, Lock, Wrench, Fingerprint, ScrollText, CalendarDays, Eye, EyeOff } from 'lucide-react';
import { authenticateWithPasskey, registerPasskeyOnDevice } from '@/components/PasskeysSection';
import PasswordlessLogin from '@/components/PasswordlessLogin';
import HalloweenAmbience from '@/components/HalloweenAmbience';
import HalloweenScene from '@/components/HalloweenScene';

const PENDING_VERIFICATION_COOKIE = 'pending_login_verification';

function setPendingVerificationCookie() {
  if (typeof document !== 'undefined') {
    const secure = typeof window !== 'undefined' && window.location.protocol === 'https:' ? '; Secure' : '';
    document.cookie = `${PENDING_VERIFICATION_COOKIE}=1; path=/; max-age=600; SameSite=Lax${secure}`;
  }
}

function clearPendingVerificationCookie() {
  if (typeof document !== 'undefined') {
    const secure = typeof window !== 'undefined' && window.location.protocol === 'https:' ? '; Secure' : '';
    document.cookie = `${PENDING_VERIFICATION_COOKIE}=; path=/; max-age=0; SameSite=Lax${secure}`;
  }
}

const REDIRECT_STORAGE_KEY = 'pending_login_redirect_to';
function isSafeRedirectPath(p: string | null | undefined): p is string {
  return typeof p === 'string' && p.startsWith('/') && !p.startsWith('//') && !p.includes('\\');
}

/** Fallback local si l'API /login-logo est indisponible */
const LOGIN_LOGO_FALLBACKS = ['/mixou-bg.png', '/ptfs-logo.jpg', '/ptfs-map.png'];
async function fetchLogoImage(): Promise<string> {
  try {
    const res = await fetchWithTimeout(`/api/login-logo?_t=${Date.now()}`, { cache: 'no-store' });
    const data: { url?: string } = await res.json().catch(() => ({}));
    if (data?.url) return data.url;
  } catch { /* ignore */ }
  return LOGIN_LOGO_FALLBACKS[Math.floor(Math.random() * LOGIN_LOGO_FALLBACKS.length)];
}

type LoginMode = 'pilote' | 'atc' | 'siavi' | 'ground_crew';

function LoginPageFallback() {
  return (
    <div className="min-h-screen relative flex items-center justify-center">
      <div className="absolute inset-0 bg-cover bg-center bg-no-repeat" style={{ backgroundImage: 'url(/mixou-bg.png)' }} />
      <div className="absolute inset-0 bg-slate-950/90" />


      <p className="relative z-10 text-amber-100">Chargement…</p>
    </div>
  );
}

type LoginStep = 'form' | 'verify' | 'email' | 'code' | 'passkey-offer' | 'forgot' | 'reset';

function LoginPageContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [, startTransition] = useTransition();
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
  const [showPassword, setShowPassword] = useState(false);
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
  const [logoImg, setLogoImg] = useState<string>('');
  const [logoFade, setLogoFade] = useState(true);
  const [forceEmail, setForceEmail] = useState(false);
  const [hasPasskeys, setHasPasskeys] = useState(false);
  const [registeringPasskey, setRegisteringPasskey] = useState(false);

  useEffect(() => {
    let cancelled = false;
    const rotate = async () => {
      const url = await fetchLogoImage();
      if (cancelled) return;
      setLogoFade(false);
      setTimeout(() => {
        if (cancelled) return;
        setLogoImg(url);
        setLogoFade(true);
      }, 350);
    };
    rotate();
    const interval = setInterval(rotate, 30 * 60 * 1000);
    return () => { cancelled = true; clearInterval(interval); };
  }, []);

  useEffect(() => {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), 10000);
    Promise.allSettled([
      fetch('/api/has-admin', { cache: 'no-store', signal: ctrl.signal }).then((r) => {
        if (!r.ok) throw new Error('Configuration indisponible');
        return r.json();
      }),
      fetch('/api/site-config', { cache: 'no-store', signal: ctrl.signal }).then((r) => {
        if (!r.ok) throw new Error('Configuration indisponible');
        return r.json();
      }),
    ])
      .then(([hasAdminData, siteConfigData]) => {
        clearTimeout(t);
        if (ctrl.signal.aborted) return;
        if (hasAdminData.status === 'fulfilled' && hasAdminData.value?.hasAdmin === false) router.replace('/setup');
        if (siteConfigData.status === 'fulfilled') setLoginAdminOnly(Boolean(siteConfigData.value?.login_admin_only));
      })
      .catch(() => {
        clearTimeout(t);
      });
    return () => {
      clearTimeout(t);
      ctrl.abort();
    };
  }, [router]);

  useEffect(() => {
    const r = searchParams.get('redirect');
    if (isSafeRedirectPath(r)) setRedirectTo(r);
  }, [searchParams]);

  useEffect(() => {
    if (step !== 'form') return;
    if (searchParams.get('step') === 'verify') {
      try {
        const stored = typeof window !== 'undefined' ? window.sessionStorage.getItem(REDIRECT_STORAGE_KEY) : null;
        if (isSafeRedirectPath(stored)) setRedirectTo(stored);
      } catch { /* sessionStorage indispo */ }

      fetchWithTimeout('/api/auth/register-login', { method: 'POST', credentials: 'include' })
        .then(async (regRes) => {
          const regData = await regRes.json().catch(() => ({}));
          const monthlyForce = Boolean(regData.forceEmail);
          const passkeys = Boolean(regData.hasPasskeys);
          setForceEmail(monthlyForce);
          setHasPasskeys(passkeys);

          if (regData.requireCode === false) {
            clearPendingVerificationCookie();
            try { window.sessionStorage.removeItem(REDIRECT_STORAGE_KEY); } catch { /* ignore */ }
            router.replace(redirectTo);
            startTransition(() => router.refresh());
            return;
          }

          if (!monthlyForce && passkeys) {
            setStep('verify');
            setError(null);
            return;
          }

          await beginEmailVerificationFlow();
        })
        .catch(() => setStep('email'));
    }
  }, [searchParams, step, redirectTo, router]);

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
    try { window.sessionStorage.removeItem(REDIRECT_STORAGE_KEY); } catch { /* ignore */ }
    router.replace(redirectTo);
    startTransition(() => router.refresh());
  }

  async function beginEmailVerificationFlow() {
    const codeRes = await fetchWithTimeout('/api/auth/send-login-code', { method: 'POST', credentials: 'include' });
    const codeData = await codeRes.json().catch(() => ({}));
    if (codeRes.ok && codeData.skipCode) {
      await doRedirect();
      return;
    }
    if (codeRes.status === 400) {
      setStep('email');
      setError(null);
      return;
    }
    if (!codeRes.ok) {
      setError(codeData.error || 'Impossible d\'envoyer le code par email.');
      return;
    }
    setEmailMasked(codeData.emailMasked || 'votre adresse');
    setStep('code');
    setError(null);
  }

  async function handleBiometricVerify() {
    setError(null);
    setSubmitting(true);
    try {
      const result = await authenticateWithPasskey();
      if (!result.ok) {
        if (result.forceEmail) {
          setForceEmail(true);
          setError(result.error);
          await beginEmailVerificationFlow();
          return;
        }
        throw new Error(result.error);
      }
      await doRedirect();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Vérification biométrique échouée.');
    } finally {
      setSubmitting(false);
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      const email = identifiantToEmail(identifiant);
      const supabase = createClient();
      const { data: signData, error: signInErr } = await supabase.auth.signInWithPassword({ email, password });
      if (signInErr) {
        const message = signInErr.message?.trim();
        throw new Error(!message || message === '{}' || /fetch|timeout|network/i.test(message)
          ? 'Le service de connexion ne répond pas. Réessayez dans quelques instants.'
          : message === 'Invalid login credentials' ? 'Identifiant ou mot de passe incorrect.' : message);
      }
      const uid = signData?.user?.id;
      if (!uid) { router.replace('/logbook'); startTransition(() => router.refresh()); return; }
      let requireCode = true;
      let monthlyForce = false;
      let passkeysAvailable = false;
      try {
        const regRes = await fetchWithTimeout('/api/auth/register-login', { method: 'POST', credentials: 'include' });
        const regData = await regRes.json().catch(() => ({}));
        requireCode = regData.requireCode !== false;
        monthlyForce = Boolean(regData.forceEmail);
        passkeysAvailable = Boolean(regData.hasPasskeys);
        setForceEmail(monthlyForce);
        setHasPasskeys(passkeysAvailable);
      } catch { /* ignore */ }
      const { data: profile, error: profileError } = await supabase.from('profiles').select('role, atc, siavi').eq('id', uid).abortSignal(AbortSignal.timeout(15_000)).single();
      if (profileError || !profile) throw new Error('Impossible de charger votre compte. Le service est temporairement indisponible.');
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
      } else if (mode === 'ground_crew') {
        // Lire ground_crew de façon optionnelle (colonne absente si migration non encore appliquée)
        let groundCrewAccess = false;
        try {
          const { data: gc } = await supabase.from('profiles')
            .select('ground_crew').eq('id', uid).maybeSingle();
          groundCrewAccess = gc?.ground_crew === true;
        } catch { /* colonne ground_crew absente */ }
        const canGround = profile?.role === 'admin' || profile?.role === 'ground_crew' || groundCrewAccess;
        if (!canGround) throw new Error('Ce compte n\'a pas accès à l\'espace Ground Crew.');
        targetPath = '/ground';
        setRedirectTo('/ground');
      } else {
        if (profile?.role === 'atc') throw new Error('Ce compte est uniquement ATC. Sélectionnez "Contrôleur ATC" pour vous connecter.');
        if (profile?.role === 'siavi') throw new Error('Ce compte est uniquement SIAVI. Sélectionnez "SIAVI" pour vous connecter.');
        targetPath = isSafeRedirectPath(redirectTo) ? redirectTo : '/logbook';
        setRedirectTo(targetPath);
      }
      // Mémorise le mode/destination choisi pour qu'un /login?step=verify (déclenché par le middleware)
      // ne fasse pas atterrir un compte ATC/SIAVI sur /logbook après vérification.
      try {
        if (typeof window !== 'undefined') window.sessionStorage.setItem(REDIRECT_STORAGE_KEY, targetPath);
      } catch { /* sessionStorage indispo */ }
      if (!requireCode) {
        clearPendingVerificationCookie();
        router.replace(targetPath);
        startTransition(() => router.refresh());
        return;
      }
      setPendingVerificationCookie();
      if (!monthlyForce && passkeysAvailable) {
        setStep('verify');
        setError(null);
        return;
      }
      await beginEmailVerificationFlow();
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
      const res = await fetchWithTimeout('/api/auth/send-login-code', {
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
      const res = await fetchWithTimeout('/api/auth/verify-login-code', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code: code.replace(/\s/g, '') }),
        credentials: 'include',
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || 'Code invalide.');
      // Le code email a déjà validé la connexion. On ne propose la passkey
      // que sur téléphone (Face ID) — sur PC, Windows affichait sinon une
      // « clé d'accès » d'un autre compte, puis on entrait quand même.
      const onPhone =
        typeof navigator !== 'undefined' && /iPhone|iPad|iPod|Android/i.test(navigator.userAgent);
      if (typeof window !== 'undefined' && window.PublicKeyCredential && onPhone) {
        setStep('passkey-offer');
        setError(null);
        return;
      }
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
      const res = await fetchWithTimeout('/api/auth/send-login-code', {
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
  const overlay = (
    <div className="absolute inset-0 bg-slate-950/90" />
  );

  return (
    <div className="login-shell min-h-dvh relative flex items-center justify-center px-4 py-3 overflow-x-hidden bg-slate-950">
      <HalloweenAmbience />
      {fond}
      {overlay}
      <HalloweenScene />
      

      
      <div className="login-content relative z-10 w-full max-w-lg">
        <a className="login-join-wanderer" href="https://discord.gg/NfUaC9Kbss" target="_blank" rel="noopener noreferrer">
          <span className="login-join-eyes" aria-hidden="true"><i /><i /></span>
          <span>Nous rejoindre</span>
        </a>
        {messageParam === 'discord-not-linked' && <p role="alert" className="rounded-lg bg-red-950/70 p-3 text-sm text-red-200">Ce Discord n’est lié à aucun compte. Connectez-vous avec votre identifiant puis liez Discord depuis votre profil.</p>}
        {/* Logo / Titre */}
        <div className="login-heading text-center mb-3">
          <div
            className="inline-flex items-center justify-center w-16 h-16 sm:w-20 sm:h-20 mb-3 sm:mb-4  overflow-hidden"
            style={{ border: '1px solid rgba(56,130,255,0.3)', borderRadius: '12px', background: 'rgba(56,130,255,0.15)' }}
          >
            {logoImg ? (
              <img
                key={logoImg}
                src={logoImg}
                alt=""
                aria-hidden="true"
                className="w-full h-full object-cover object-center"
                style={{
                  borderRadius: '11px',
                  opacity: logoFade ? 1 : 0,
                  transition: 'opacity 0.35s ease',
                }}
              />
            ) : (
              <Shield className="h-10 w-10" style={{ color: '#6aa0ff' }} />
            )}
          </div>
          <h1 className="text-2xl sm:text-3xl font-bold text-white tracking-tight animate-init animate-slide-up delay-200">PTFS Logbook</h1>
          <p className="text-cyan-100/80 text-xs sm:text-sm mt-1.5 sm:mt-2 animate-init animate-slide-up delay-300">Saison Halloween · Votre réseau aérien</p>
        </div>

        {/* Sélecteur de mode (masqué lors de l'étape email/code) */}
        {step === 'form' && (
        <div className="login-modes space-y-2 mb-3 animate-init animate-reveal-blur delay-400">
          {/* Ligne principale : Pilote | ATC | SIAVI */}
          <div className="flex gap-2 p-1 bg-slate-900/45 rounded-2xl backdrop-blur-md border border-white/10 shadow-xl shadow-cyan-950/30">
            <button
              type="button"
              onClick={() => setMode('pilote')}
              className={`flex-1 flex items-center justify-center gap-1.5 py-2.5 sm:py-3.5 px-2 sm:px-3 rounded-xl font-semibold transition-all duration-300 ${
                mode === 'pilote'
                  ? 'bg-sky-500 text-white'
                  : 'text-cyan-100/65 hover:text-cyan-50 hover:bg-white/10'
              }`}
            >
              <Plane className="h-4 w-4 sm:h-5 sm:w-5 shrink-0" />
              <span className="text-xs sm:text-sm">Pilote</span>
            </button>
            <button
              type="button"
              onClick={() => setMode('atc')}
              className={`flex-1 flex items-center justify-center gap-1.5 py-2.5 sm:py-3.5 px-2 sm:px-3 rounded-xl font-semibold transition-all duration-300 ${
                mode === 'atc'
                  ? 'bg-sky-500 text-white'
                  : 'text-cyan-100/65 hover:text-cyan-50 hover:bg-white/10'
              }`}
            >
              <Radio className="h-4 w-4 sm:h-5 sm:w-5 shrink-0" />
              <span className="text-xs sm:text-sm">ATC</span>
            </button>
            <button
              type="button"
              onClick={() => setMode('siavi')}
              className={`flex-1 flex items-center justify-center gap-1.5 py-2.5 sm:py-3.5 px-2 sm:px-3 rounded-xl font-semibold transition-all duration-300 ${
                mode === 'siavi'
                  ? 'bg-sky-500 text-white'
                  : 'text-cyan-100/65 hover:text-cyan-50 hover:bg-white/10'
              }`}
            >
              <Flame className="h-4 w-4 sm:h-5 sm:w-5 shrink-0" />
              <span className="text-xs sm:text-sm">SIAVI</span>
            </button>
          </div>
          {/* Ligne secondaire : Ground Crew */}
          <button
            type="button"
            onClick={() => setMode('ground_crew')}
            className={`w-full flex items-center justify-center gap-2 py-2.5 px-4 rounded-xl font-semibold text-sm transition-all duration-300 border ${
              mode === 'ground_crew'
                ? 'bg-orange-500/25 border-orange-500/60 text-orange-200 shadow-lg shadow-orange-500/20'
                : 'bg-orange-500/5 border-orange-500/20 text-orange-300/70 hover:bg-orange-500/15 hover:border-orange-500/40 hover:text-orange-200'
            }`}
          >
            <Wrench className="h-4 w-4 shrink-0" />
            <span>Espace Ground Crew</span>
            {mode === 'ground_crew' && (
              <span className="ml-auto text-[10px] font-bold px-1.5 py-0.5 rounded-full bg-orange-500/30 text-orange-200">
                SÉLECTIONNÉ
              </span>
            )}
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
          <div
            className="mb-4 flex items-center gap-2 animate-init animate-reveal-blur"
            style={{ borderLeft: '2px solid #ffc94a', borderRadius: '0 6px 6px 0', padding: '7px 10px' }}
          >
            <Clock className="shrink-0" style={{ color: '#ffc94a', width: '13px', height: '13px' }} />
            <p style={{ color: '#ffc94a', fontSize: '12px' }}>Session expirée après inactivité.</p>
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
          <div className="login-card card bg-slate-900 border-slate-700">
            <div className="login-intro mb-3 px-1">
              <span
                className="inline-flex items-center gap-1"
                style={{ background: 'rgba(56,130,255,0.1)', border: '0.5px solid rgba(56,130,255,0.2)', borderRadius: '4px', fontSize: '9px', color: '#6aa0ff', letterSpacing: '0.06em', padding: '2px 6px' }}
              >
                <Sun className="shrink-0" style={{ width: '9px', height: '9px' }} />
                CONNEXION SÉCURISÉE
              </span>
              <p className="mt-2 text-sm text-cyan-50/80">Un seul compte pour tous vos espaces.</p>
            </div>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label htmlFor="login-username" className="label text-slate-200">Identifiant</label>
                <div className="relative">
                  <User
                    className="absolute top-1/2 -translate-y-1/2 pointer-events-none"
                    style={{ left: '9px', color: 'rgba(200,210,230,0.25)', width: '13px', height: '13px' }}
                  />
                  <input
                    id="login-username"
                    type="text"
                    autoCapitalize="none"
                    spellCheck={false}
                    className="input bg-slate-900/50 pl-[30px]"
                    value={identifiant}
                    onChange={(e) => setIdentifiant(e.target.value)}
                    placeholder="Votre identifiant"
                    required
                    autoComplete="username"
                  />
                </div>
              </div>
              <div>
                <label htmlFor="login-password" className="label text-slate-200">Mot de passe</label>
                <div className="relative">
                  <Lock
                    className="absolute top-1/2 -translate-y-1/2 pointer-events-none"
                    style={{ left: '9px', color: 'rgba(200,210,230,0.25)', width: '13px', height: '13px' }}
                  />
                  <input
                    id="login-password"
                    type={showPassword ? "text" : "password"}
                    className="input bg-slate-900/50 pl-[30px] pr-12"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="••••••••"
                    required
                    autoComplete="current-password"
                  />
                  <button type="button" onClick={() => setShowPassword(!showPassword)} aria-label={showPassword ? "Masquer le mot de passe" : "Afficher le mot de passe"} aria-pressed={showPassword} className="absolute right-3 top-1/2 -translate-y-1/2 p-1 text-slate-400 hover:text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-sky-400">{showPassword ? <EyeOff className="h-5 w-5" /> : <Eye className="h-5 w-5" />}</button>
                </div>
              </div>
              {error && (
                <div className="p-4 rounded-xl bg-red-500/10 border border-red-500/30 backdrop-blur-sm">
                  <p role="alert" className="text-red-400 text-sm font-medium">{error}</p>
                </div>
              )}
              <button
                type="submit"
                className={`w-full py-3.5 rounded-xl font-medium text-white active:scale-[0.98] transform disabled:opacity-50 transition-colors duration-150 ${
                  mode === 'ground_crew'
                    ? 'bg-orange-500 hover:bg-orange-400 shadow-lg shadow-orange-500/25'
                    : 'bg-[#3882ff] hover:bg-[#2a6ee0]'
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
                    {mode === 'pilote' ? 'Accéder à l\'espace pilote'
                      : mode === 'atc' ? 'Accéder à l\'espace ATC'
                      : mode === 'siavi' ? 'Accéder à l\'espace SIAVI'
                      : 'Accéder à l\'espace Ground Crew'}
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
            <PasswordlessLogin redirectTo={redirectTo} />
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
                      const res = await fetchWithTimeout('/api/auth/forgot-password', {
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
                      const res = await fetchWithTimeout('/api/auth/forgot-password', {
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
                  const res = await fetchWithTimeout('/api/auth/reset-password-with-token', {
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

        {/* Étape : choix Email ou Biométrie */}
        {step === 'verify' && (
          <div className="card backdrop-blur-xl bg-slate-800/60 border-slate-700/50 shadow-2xl animate-init animate-reveal-blur delay-500">
            <h2 className="text-lg font-semibold text-slate-200 mb-2">Vérification de connexion</h2>
            <p className="text-slate-400 text-sm mb-4">
              {forceEmail
                ? 'Reconnexion mensuelle obligatoire : validez votre identité par code email.'
                : 'Choisissez comment confirmer votre identité pour cette connexion.'}
            </p>
            {error && (
              <div className="p-4 rounded-xl bg-red-500/10 border border-red-500/30 backdrop-blur-sm mb-4">
                <p className="text-red-400 text-sm font-medium">{error}</p>
              </div>
            )}
            <div className="space-y-3">
              <button
                type="button"
                onClick={async () => {
                  setError(null);
                  setSubmitting(true);
                  try {
                    await beginEmailVerificationFlow();
                  } finally {
                    setSubmitting(false);
                  }
                }}
                disabled={submitting}
                className="w-full flex items-center justify-center gap-2 py-3.5 rounded-xl font-bold bg-gradient-to-r from-sky-500 to-sky-400 hover:from-sky-400 hover:to-sky-300 text-white shadow-lg shadow-sky-500/30 disabled:opacity-50"
              >
                <Mail className="h-5 w-5" />
                {submitting ? 'Envoi…' : 'Code par email'}
              </button>
              {!forceEmail && hasPasskeys && (
                <button
                  type="button"
                  onClick={handleBiometricVerify}
                  disabled={submitting}
                  className="w-full flex items-center justify-center gap-2 py-3.5 rounded-xl font-bold bg-slate-700/80 hover:bg-slate-600/80 text-slate-100 border border-slate-600/50 disabled:opacity-50"
                >
                  <Fingerprint className="h-5 w-5 text-emerald-400" />
                  {submitting ? 'Vérification…' : 'Passkey (biométrie / QR)'}
                </button>
              )}
            </div>
            <p className="text-slate-500 text-xs mt-4 text-center">
              Sur téléphone : Face ID ou empreinte. Sur PC : Windows Hello ou QR téléphone.
              Le code email reste disponible en secours.
            </p>
          </div>
        )}

        {/* Étape : proposition d'enregistrement passkey après validation email */}
        {step === 'passkey-offer' && (
          <div className="card backdrop-blur-xl bg-slate-800/60 border-slate-700/50 shadow-2xl animate-init animate-reveal-blur delay-500">
            <div className="flex items-center gap-2 text-emerald-300 mb-3">
              <Fingerprint className="h-5 w-5" />
              <h2 className="text-lg font-semibold">Connexion validée</h2>
            </div>
            <p className="text-slate-300 text-sm mb-4">
              Souhaitez-vous enregistrer une passkey pour accélérer les prochaines connexions ?
              Sur PC, utilisez Windows Hello ou scannez un QR avec votre téléphone. Une reconnexion par email
              restera obligatoire une fois par mois.
            </p>
            {error && (
              <div className="p-4 rounded-xl bg-red-500/10 border border-red-500/30 backdrop-blur-sm mb-4">
                <p className="text-red-400 text-sm font-medium">{error}</p>
              </div>
            )}
            <div className="space-y-3">
              <button
                type="button"
                disabled={registeringPasskey}
                onClick={async () => {
                  setError(null);
                  setRegisteringPasskey(true);
                  const result = await registerPasskeyOnDevice();
                  setRegisteringPasskey(false);
                  if (!result.ok) {
                    setError(result.error);
                    return;
                  }
                  await doRedirect();
                }}
                className="w-full py-3.5 rounded-xl font-bold bg-gradient-to-r from-emerald-500 to-emerald-400 hover:from-emerald-400 hover:to-emerald-300 text-white shadow-lg shadow-emerald-500/30 disabled:opacity-50"
              >
                {registeringPasskey ? 'Enregistrement…' : 'Enregistrer une passkey'}
              </button>
              <button
                type="button"
                onClick={() => doRedirect()}
                disabled={registeringPasskey}
                className="w-full py-2 text-slate-400 hover:text-sky-400 text-sm transition-colors"
              >
                Plus tard
              </button>
            </div>
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
                {forceEmail && (
                  <span className="block text-amber-300/90 text-xs mb-2">
                    Reconnexion mensuelle : validation par email obligatoire.
                  </span>
                )}
                Un code de confirmation a été demandé pour <strong className="text-slate-200">{emailMasked || 'votre adresse'}</strong>. Saisissez-le ci-dessous pour valider la connexion. Vérifiez aussi les indésirables et que cette adresse est toujours accessible.
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
                  className="input bg-slate-900/50 text-center text-xl sm:text-2xl tracking-[0.4em] sm:tracking-[0.5em] font-mono"
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
        <div className="login-links mt-3 flex flex-wrap items-center justify-center gap-2 sm:gap-3 animate-init animate-slide-up delay-800">
          <a
            href="https://discord.gg/NfUaC9Kbss"
            target="_blank"
            rel="noopener noreferrer"
            className="login-join-button inline-flex items-center gap-1.5 rounded-xl border border-purple-400/40 bg-purple-500/20 px-3 py-2 font-semibold text-purple-200 transition-colors hover:bg-purple-500/30"
          >
            <span className="login-join-eyes" aria-hidden="true"><i /><i /></span>
            <span>Nous rejoindre</span>
          </a>
          <Link
            href="/aeroschool"
            className="inline-flex items-center gap-1.5 px-3 sm:px-5 py-2 sm:py-2.5 rounded-xl bg-amber-500/10 border border-amber-500/30 text-amber-300 hover:text-amber-200 hover:bg-amber-500/20 hover:border-amber-500/50 transition-all backdrop-blur-sm group cursor-pointer"
          >
            <GraduationCap className="h-4 w-4 sm:h-5 sm:w-5 text-amber-400 group-hover:scale-110 transition-transform shrink-0" />
            <span className="font-semibold text-sm">AeroSchool</span>
          </Link>
          <Link
            href="/calendrier"
            className="inline-flex items-center gap-1.5 px-3 sm:px-5 py-2 sm:py-2.5 rounded-xl bg-violet-500/10 border border-violet-500/30 text-violet-300 hover:text-violet-200 hover:bg-violet-500/20 hover:border-violet-500/50 transition-all backdrop-blur-sm group cursor-pointer"
          >
            <CalendarDays className="h-4 w-4 sm:h-5 sm:w-5 text-violet-400 group-hover:scale-110 transition-transform shrink-0" />
            <span className="font-semibold text-sm">Calendrier</span>
          </Link>
          <Link
            href="/carte-atc"
            className="inline-flex items-center gap-1.5 px-3 sm:px-4 py-2 sm:py-2.5 rounded-xl bg-emerald-500/10 border border-emerald-500/30 text-emerald-300 hover:text-emerald-200 hover:bg-emerald-500/20 hover:border-emerald-500/50 transition-all backdrop-blur-sm group cursor-pointer"
          >
            <Radio className="h-4 w-4 text-emerald-400 group-hover:scale-110 transition-transform shrink-0" />
            <span className="font-semibold text-sm">ODW</span>
          </Link>
          <Link
            href="/download"
            className="inline-flex items-center gap-1.5 px-3 sm:px-4 py-2 sm:py-2.5 rounded-xl bg-sky-500/10 border border-sky-500/30 text-sky-300 hover:text-sky-200 hover:bg-sky-500/20 hover:border-sky-500/50 transition-all backdrop-blur-sm group cursor-pointer"
          >
            <Download className="h-4 w-4 text-sky-400 group-hover:scale-110 transition-transform shrink-0" />
            <span className="font-semibold text-sm">Téléchargements</span>
          </Link>
          <Link
            href="/code-de-conduite"
            className="inline-flex items-center gap-1.5 px-3 sm:px-4 py-2 sm:py-2.5 rounded-xl bg-indigo-500/10 border border-indigo-500/30 text-indigo-300 hover:text-indigo-200 hover:bg-indigo-500/20 hover:border-indigo-500/50 transition-all backdrop-blur-sm group cursor-pointer"
          >
            <ScrollText className="h-4 w-4 text-indigo-400 group-hover:scale-110 transition-transform shrink-0" />
            <span className="font-semibold text-sm">Code de conduite</span>
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
