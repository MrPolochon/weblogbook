'use client';

import React, { Suspense, useEffect, useRef, useState, useMemo, useTransition } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { identifiantToEmail } from '@/lib/constants';
import { Plane, Radio, Shield, Flame, Download, GraduationCap, AlertTriangle, Mail, Sun, Waves, Wind, Clock, User, Lock, Wrench } from 'lucide-react';

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

/* ── Étoiles scintillantes ── */
function TwinklingStars() {
  const stars = useMemo(() =>
    Array.from({ length: 30 }, (_, i) => ({
      id: i,
      left: Math.random() * 100,
      top: Math.random() * 55,
      size: 1 + Math.random() * 1.5,
      duration: 2 + Math.random() * 4,
      delay: Math.random() * 6,
    })), []);
  return (
    <div className="absolute inset-0 overflow-hidden pointer-events-none">
      {stars.map((s) => (
        <div key={s.id} className="absolute rounded-full bg-white animate-twinkle"
          style={{ left: `${s.left}%`, top: `${s.top}%`, width: `${s.size}px`, height: `${s.size}px`, animationDuration: `${s.duration}s`, animationDelay: `${s.delay}s` }} />
      ))}
    </div>
  );
}

/* ── Nuages en deux couches parallax ── */
function ParallaxClouds() {
  const layer1 = useMemo(() => Array.from({ length: 5 }, (_, i) => ({
    id: i, size: 80 + Math.random() * 80, top: 8 + Math.random() * 35,
    duration: 30 + Math.random() * 25, delay: Math.random() * -40, opacity: 0.04 + Math.random() * 0.04,
  })), []);
  const layer2 = useMemo(() => Array.from({ length: 4 }, (_, i) => ({
    id: i + 10, size: 50 + Math.random() * 60, top: 15 + Math.random() * 45,
    duration: 50 + Math.random() * 30, delay: Math.random() * -55, opacity: 0.02 + Math.random() * 0.03,
  })), []);
  const CloudSVG = ({ w, h }: { w: number; h: number }) => (
    <svg viewBox="0 0 160 80" width={w} height={h} className="fill-white">
      <ellipse cx="40" cy="55" rx="35" ry="22" />
      <ellipse cx="75" cy="45" rx="42" ry="28" />
      <ellipse cx="115" cy="52" rx="32" ry="20" />
      <ellipse cx="90" cy="62" rx="38" ry="16" />
      <ellipse cx="55" cy="60" rx="28" ry="14" />
    </svg>
  );
  return (
    <div className="absolute inset-0 overflow-hidden pointer-events-none">
      {[...layer1, ...layer2].map((c) => (
        <div key={c.id} className="absolute animate-cloud"
          style={{ top: `${c.top}%`, opacity: c.opacity, animationDuration: `${c.duration}s`, animationDelay: `${c.delay}s` }}>
          <CloudSVG w={c.size} h={c.size * 0.5} />
        </div>
      ))}
    </div>
  );
}

/* ── Avions multiples avec traînées de condensation ── */
function MultipleAircrafts() {
  const planes = useMemo(() => [
    { id: 1, top: '9%',  size: 18, duration: 22, delay: 0,   dir: 1, angle: -8,  color: 'white/50', contrailW: 180 },
    { id: 2, top: '18%', size: 12, duration: 38, delay: -12, dir: 1, angle: -5,  color: 'cyan-100/40', contrailW: 140 },
    { id: 3, top: '28%', size: 9,  duration: 55, delay: -28, dir: -1, angle: 6, color: 'white/30', contrailW: 100 },
    { id: 4, top: '14%', size: 14, duration: 30, delay: -18, dir: 1, angle: -10, color: 'amber-100/40', contrailW: 160 },
  ], []);

  return (
    <div className="absolute inset-0 overflow-hidden pointer-events-none">
      {planes.map((p) => (
        <div key={p.id} className="absolute w-full"
          style={{ top: p.top, animation: `${p.dir > 0 ? 'plane-drift' : 'plane-drift-rev'} ${p.duration}s linear ${p.delay}s infinite` }}>
          <div className="flex items-center" style={{ transform: `rotate(${p.dir > 0 ? p.angle : -p.angle}deg)` }}>
            {p.dir < 0 && (
              <div className="h-px bg-gradient-to-l from-white/50 to-transparent animate-contrail-fade"
                style={{ width: p.contrailW, animationDuration: `${p.duration}s`, animationDelay: `${p.delay}s` }} />
            )}
            <Plane className={`shrink-0 text-${p.color}`} style={{ width: p.size, height: p.size, transform: p.dir < 0 ? 'scaleX(-1)' : undefined }} />
            {p.dir > 0 && (
              <div className="h-px bg-gradient-to-r from-white/50 to-transparent animate-contrail-fade"
                style={{ width: p.contrailW, animationDuration: `${p.duration}s`, animationDelay: `${p.delay}s` }} />
            )}
          </div>
        </div>
      ))}
    </div>
  );
}

/* ── Radar en coin bas-gauche ── */
function RadarCorner() {
  const blips = useMemo(() => [
    { cx: 48, cy: 32, delay: '0.5s' },
    { cx: 62, cy: 55, delay: '1.8s' },
    { cx: 30, cy: 50, delay: '3.2s' },
    { cx: 55, cy: 42, delay: '2.4s' },
  ], []);
  return (
    <div className="absolute bottom-20 left-6 pointer-events-none hidden sm:block" style={{ opacity: 0.22 }}>
      <svg width="90" height="90" viewBox="0 0 90 90">
        {/* Cercles concentriques */}
        {[40, 30, 20, 10].map((r) => (
          <circle key={r} cx="45" cy="45" r={r} fill="none" stroke="#22d3ee" strokeWidth="0.6" opacity="0.6" />
        ))}
        {/* Crosshairs */}
        <line x1="45" y1="5" x2="45" y2="85" stroke="#22d3ee" strokeWidth="0.5" opacity="0.4" />
        <line x1="5" y1="45" x2="85" y2="45" stroke="#22d3ee" strokeWidth="0.5" opacity="0.4" />
        {/* Sweep */}
        <g style={{ transformOrigin: '45px 45px', animation: 'radar-rotate 4s linear infinite' }}>
          <line x1="45" y1="45" x2="45" y2="5" stroke="#22d3ee" strokeWidth="1.5" opacity="0.9" />
          <path d="M45 45 L55 10 A40 40 0 0 0 45 5 Z" fill="url(#sweep)" opacity="0.35" />
          <defs>
            <radialGradient id="sweep" cx="50%" cy="100%" r="100%">
              <stop offset="0%" stopColor="#22d3ee" stopOpacity="0.8" />
              <stop offset="100%" stopColor="#22d3ee" stopOpacity="0" />
            </radialGradient>
          </defs>
        </g>
        {/* Blips */}
        {blips.map((b, i) => (
          <circle key={i} cx={b.cx} cy={b.cy} r="2.5" fill="#4ade80"
            style={{ animation: `radar-blip 4s ease-out ${b.delay} infinite` }} />
        ))}
        {/* Cadre */}
        <circle cx="45" cy="45" r="42" fill="none" stroke="#22d3ee" strokeWidth="1" opacity="0.5" />
      </svg>
      <p className="text-[8px] font-mono text-cyan-300/60 text-center mt-1 tracking-widest">RADAR</p>
    </div>
  );
}

/* ── HUD overlay : grille, niveaux de vol, indicateurs ── */
function HUDOverlay() {
  return (
    <div className="absolute inset-0 pointer-events-none overflow-hidden">
      {/* Scanline très subtile */}
      <div className="absolute left-0 right-0 h-px bg-gradient-to-r from-transparent via-cyan-400/12 to-transparent animate-hud-scanline" />
      {/* Lignes de niveaux de vol horizontales */}
      {[22, 38, 52, 66].map((pct, i) => (
        <div key={i} className="absolute left-0 right-0 h-px animate-altitude-pulse"
          style={{ top: `${pct}%`, background: 'linear-gradient(90deg,transparent 0%,rgba(34,211,238,0.15) 20%,rgba(34,211,238,0.08) 80%,transparent 100%)',
            animationDelay: `${i * 1.1}s` }} />
      ))}
      {/* Labels FL discrets */}
      <div className="absolute left-3 top-[22%] text-[8px] font-mono text-cyan-400/20 tracking-widest">FL 300</div>
      <div className="absolute left-3 top-[38%] text-[8px] font-mono text-cyan-400/20 tracking-widest">FL 200</div>
      <div className="absolute left-3 top-[52%] text-[8px] font-mono text-cyan-400/20 tracking-widest">FL 100</div>
      {/* Coins HUD */}
      {[
        'top-4 left-4 border-t border-l',
        'top-4 right-4 border-t border-r',
        'bottom-4 left-4 border-b border-l',
        'bottom-4 right-4 border-b border-r',
      ].map((cls, i) => (
        <div key={i} className={`absolute w-8 h-8 border-cyan-400/15 ${cls}`} />
      ))}
      {/* Cap magnétique en haut */}
      <div className="absolute top-3 left-1/2 -translate-x-1/2 flex items-center gap-1 opacity-20">
        {['270','280','290','300','N','310','320','330','340'].map((h, i) => (
          <span key={i} className={`text-[7px] font-mono ${h === 'N' ? 'text-amber-300 text-[9px] font-bold' : 'text-cyan-300'} tracking-wider`}>{h}</span>
        ))}
      </div>
    </div>
  );
}

/* ── Lumières de navigation (bord de piste) ── */
function NavigationLights() {
  const lights = useMemo(() => Array.from({ length: 22 }, (_, i) => {
    const type = i % 4 === 0 ? 'red' : i % 4 === 2 ? 'green' : 'white';
    return { id: i, left: (i / 21) * 100, type, delay: `${(i * 0.15) % 2}s` };
  }), []);
  const colorMap = { red: '#ef4444', green: '#22c55e', white: '#e2e8f0' };
  const animMap = { red: 'animate-nav-red', green: 'animate-nav-green', white: 'animate-nav-white' };
  return (
    <div className="absolute bottom-0 left-0 right-0 h-12 pointer-events-none">
      <div className="absolute bottom-4 left-0 right-0 flex justify-between px-4">
        {lights.map((l) => (
          <div key={l.id} className={`rounded-full ${animMap[l.type as keyof typeof animMap]}`}
            style={{ width: 3, height: 3, background: colorMap[l.type as keyof typeof colorMap],
              boxShadow: `0 0 6px 2px ${colorMap[l.type as keyof typeof colorMap]}`, animationDelay: l.delay }} />
        ))}
      </div>
    </div>
  );
}

/* ── Balises VOR ── */
function VORBeacons() {
  const beacons = useMemo(() => [
    { left: '12%', top: '72%', label: 'IRF' },
    { left: '82%', top: '65%', label: 'ITK' },
    { left: '48%', top: '80%', label: 'IPP' },
  ], []);
  return (
    <div className="absolute inset-0 pointer-events-none hidden sm:block">
      {beacons.map((b) => (
        <div key={b.label} className="absolute" style={{ left: b.left, top: b.top }}>
          <div className="relative flex items-center justify-center">
            <div className="absolute rounded-full border border-cyan-400/30 w-8 h-8 animate-vor-pulse" style={{ animationDelay: `${Math.random()}s` }} />
            <div className="absolute rounded-full border border-cyan-400/20 w-8 h-8 animate-vor-pulse" style={{ animationDelay: `${0.8 + Math.random()}s` }} />
            <div className="w-1.5 h-1.5 rounded-full bg-cyan-400/50" />
          </div>
          <p className="text-[7px] font-mono text-cyan-300/30 text-center mt-1 tracking-widest">{b.label}</p>
        </div>
      ))}
    </div>
  );
}

/* ── Déco été (soleil + vagues + palmiers) ── */
function SummerUpdateDecor() {
  return (
    <div className="absolute inset-0 overflow-hidden pointer-events-none">
      <div className="absolute -top-20 -right-16 h-72 w-72 rounded-full bg-gradient-to-br from-amber-200/35 via-orange-300/20 to-transparent blur-2xl" />
      <div className="absolute right-8 top-10 hidden sm:flex h-24 w-24 items-center justify-center rounded-full border border-amber-200/30 bg-amber-300/10 shadow-[0_0_80px_rgba(251,191,36,0.35)] backdrop-blur-sm">
        <Sun className="h-12 w-12 text-amber-200/80 animate-pulse-soft" />
      </div>
      <div className="absolute -bottom-20 left-0 right-0 h-48 bg-gradient-to-t from-cyan-500/25 via-sky-400/10 to-transparent" />
      <div className="absolute bottom-6 left-1/2 flex w-[120vw] -translate-x-1/2 items-center justify-center gap-8 text-cyan-100/20">
        {Array.from({ length: 9 }, (_, i) => (
          <Waves key={i} className="h-10 w-24 animate-float" style={{ animationDelay: `${i * 0.18}s` }} />
        ))}
      </div>
      {/* Palmiers décoratifs */}
      <div
        className="animate-palm-sway"
        aria-hidden="true"
        style={{ position: 'absolute', bottom: 0, left: '-8px', fontSize: '64px', opacity: 0.18, transformOrigin: 'bottom center' }}
      >🌴</div>
      <div
        className="animate-palm-sway"
        aria-hidden="true"
        style={{ position: 'absolute', bottom: 0, right: '-8px', fontSize: '64px', opacity: 0.18, transform: 'scaleX(-1)', transformOrigin: 'bottom center', animationDelay: '1.5s' }}
      >🌴</div>
      {/* Traînées de condensation */}
      <div className="contrail c1" aria-hidden="true" />
      <div className="contrail c2" aria-hidden="true" />
    </div>
  );
}

/** Fallback local si l'API /login-logo est indisponible */
const LOGIN_LOGO_FALLBACKS = ['/mixou-bg.png', '/ptfs-logo.jpg', '/ptfs-map.png'];
async function fetchLogoImage(): Promise<string> {
  try {
    const res = await fetch(`/api/login-logo?_t=${Date.now()}`, { cache: 'no-store' });
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
      <div className="absolute inset-0 bg-gradient-to-br from-sky-950/80 via-cyan-950/55 to-orange-950/45" />
      <SummerUpdateDecor />
      <HUDOverlay />
      <p className="relative z-10 text-amber-100">Chargement…</p>
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
  const [logoImg, setLogoImg] = useState<string>('');
  const [logoFade, setLogoFade] = useState(true);

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
      // On reprend le returnTo stocké lors du précédent submit (ATC/SIAVI ne tombent plus sur /logbook).
      try {
        const stored = typeof window !== 'undefined' ? window.sessionStorage.getItem(REDIRECT_STORAGE_KEY) : null;
        if (isSafeRedirectPath(stored)) setRedirectTo(stored);
      } catch { /* sessionStorage indispo */ }
      setStep('code');
      fetch('/api/auth/send-login-code', { method: 'POST', credentials: 'include' })
        .then(async (res) => {
          const d = await res.json().catch(() => ({}));
          if (res.ok && d.skipCode) {
            clearPendingVerificationCookie();
            try { window.sessionStorage.removeItem(REDIRECT_STORAGE_KEY); } catch { /* ignore */ }
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
    try { window.sessionStorage.removeItem(REDIRECT_STORAGE_KEY); } catch { /* ignore */ }
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
      const { data: profile } = await supabase.from('profiles').select('role, atc, siavi, ground_crew').eq('id', uid).single();
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
        const canGround = profile?.role === 'admin' || Boolean(profile?.ground_crew);
        if (!canGround) throw new Error('Ce compte n\'a pas accès à l\'espace Ground Crew.');
        targetPath = '/ground';
        setRedirectTo('/ground');
      } else {
        if (profile?.role === 'atc') throw new Error('Ce compte est uniquement ATC. Sélectionnez "Contrôleur ATC" pour vous connecter.');
        if (profile?.role === 'siavi') throw new Error('Ce compte est uniquement SIAVI. Sélectionnez "SIAVI" pour vous connecter.');
        setRedirectTo('/logbook');
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
  const overlay = (
    <div className="absolute inset-0 bg-gradient-to-br from-sky-950/80 via-cyan-950/55 to-orange-950/45" />
  );

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
    <div className="min-h-dvh relative flex items-start sm:items-center justify-center px-4 pt-8 pb-6 sm:p-4 overflow-x-hidden animate-page-reveal">
      {fond}
      {overlay}
      
      {/* Animations d'arrière-plan — thème aviation réaliste */}
      <SummerUpdateDecor />
      <TwinklingStars />
      <ParallaxClouds />
      <MultipleAircrafts />
      <HUDOverlay />
      <RadarCorner />
      <VORBeacons />
      <NavigationLights />
      
      <div className="relative z-10 w-full max-w-md">
        {/* Logo / Titre */}
        <div className="text-center mb-4 sm:mb-8">
          <div
            className="inline-flex items-center justify-center w-16 h-16 sm:w-20 sm:h-20 mb-3 sm:mb-4 animate-zoom-bounce hover:animate-float overflow-hidden"
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
          <p className="text-cyan-100/80 text-xs sm:text-sm mt-1.5 sm:mt-2 animate-init animate-slide-up delay-300">Système de gestion des vols · Saison estivale</p>
        </div>

        {/* Sélecteur de mode (masqué lors de l'étape email/code) */}
        {step === 'form' && (
        <div className="space-y-2 mb-4 sm:mb-6 animate-init animate-reveal-blur delay-400">
          {/* Ligne principale : Pilote | ATC | SIAVI */}
          <div className="flex gap-2 p-1 bg-slate-900/45 rounded-2xl backdrop-blur-md border border-white/10 shadow-xl shadow-cyan-950/30">
            <button
              type="button"
              onClick={() => setMode('pilote')}
              className={`flex-1 flex items-center justify-center gap-1.5 py-2.5 sm:py-3.5 px-2 sm:px-3 rounded-xl font-semibold transition-all duration-300 ${
                mode === 'pilote'
                  ? 'bg-gradient-to-r from-cyan-400 via-sky-400 to-amber-300 text-slate-950 shadow-lg shadow-cyan-400/30'
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
                  ? 'bg-gradient-to-r from-cyan-400 via-sky-400 to-amber-300 text-slate-950 shadow-lg shadow-cyan-400/30'
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
                  ? 'bg-gradient-to-r from-cyan-400 via-sky-400 to-amber-300 text-slate-950 shadow-lg shadow-cyan-400/30'
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
          <div className="card backdrop-blur-xl bg-slate-900/60 border-cyan-200/15 shadow-2xl shadow-cyan-950/40 animate-init animate-reveal-blur delay-500">
            <div className="mb-5 px-1 py-2">
              <span
                className="inline-flex items-center gap-1"
                style={{ background: 'rgba(56,130,255,0.1)', border: '0.5px solid rgba(56,130,255,0.2)', borderRadius: '4px', fontSize: '9px', color: '#6aa0ff', letterSpacing: '0.06em', padding: '2px 6px' }}
              >
                <Sun className="shrink-0" style={{ width: '9px', height: '9px' }} />
                BRIEFING ÉTÉ
              </span>
              <p className="mt-2 text-sm text-cyan-50/80">Bienvenue à bord. Choisissez votre espace et connectez-vous pour rejoindre le réseau.</p>
            </div>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label className="label text-slate-200">Identifiant</label>
                <div className="relative">
                  <User
                    className="absolute top-1/2 -translate-y-1/2 pointer-events-none"
                    style={{ left: '9px', color: 'rgba(200,210,230,0.25)', width: '13px', height: '13px' }}
                  />
                  <input
                    type="text"
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
                <label className="label text-slate-200">Mot de passe</label>
                <div className="relative">
                  <Lock
                    className="absolute top-1/2 -translate-y-1/2 pointer-events-none"
                    style={{ left: '9px', color: 'rgba(200,210,230,0.25)', width: '13px', height: '13px' }}
                  />
                  <input
                    type="password"
                    className="input bg-slate-900/50 pl-[30px]"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="••••••••"
                    required
                    autoComplete="current-password"
                  />
                </div>
              </div>
              {error && (
                <div className="p-4 rounded-xl bg-red-500/10 border border-red-500/30 backdrop-blur-sm">
                  <p className="text-red-400 text-sm font-medium">{error}</p>
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
        <div className="mt-4 sm:mt-6 flex flex-wrap items-center justify-center gap-2 sm:gap-3 animate-init animate-slide-up delay-800">
          <Link
            href="/aeroschool"
            className="inline-flex items-center gap-1.5 px-3 sm:px-5 py-2 sm:py-2.5 rounded-xl bg-amber-500/10 border border-amber-500/30 text-amber-300 hover:text-amber-200 hover:bg-amber-500/20 hover:border-amber-500/50 transition-all backdrop-blur-sm group cursor-pointer"
          >
            <GraduationCap className="h-4 w-4 sm:h-5 sm:w-5 text-amber-400 group-hover:scale-110 transition-transform shrink-0" />
            <span className="font-semibold text-sm">AeroSchool</span>
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
