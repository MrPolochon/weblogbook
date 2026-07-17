'use client';

import React, { useState, useCallback, useEffect, useRef } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useAntiCheat } from '@/hooks/useAntiCheat';
import { formatModuleAnswerKey } from '@/lib/aeroschool-module-answers';
import { buildIdentityPrefills } from '@/lib/aeroschool-identity';
import { ChevronLeft, ChevronRight, Send, Loader2, AlertTriangle, CheckCircle2, XCircle, Clock, Lock, User } from 'lucide-react';

interface ModuleQuestion {
  id: string;
  title: string;
  options: string[];
}

interface RespondentSession {
  authenticated: boolean;
  identifiant?: string;
  discordUsername?: string | null;
}

interface Question {
  id: string;
  type: 'short_text' | 'paragraph' | 'radio' | 'checkbox' | 'dropdown' | 'linear_scale' | 'question_module';
  title: string;
  description?: string;
  required?: boolean;
  options?: string[];
  is_graded?: boolean;
  points?: number;
  scale_min?: number;
  scale_max?: number;
  scale_min_label?: string;
  scale_max_label?: string;
  module_id?: string;
  module_count?: number;
}

interface Section {
  id: string;
  title: string;
  description?: string;
  questions: Question[];
}

interface FormData {
  id: string;
  title: string;
  description?: string;
  /** Temps limite en minutes (null = pas de limite) */
  time_limit_minutes?: number | null;
  /** Détection de triche activée (false = désactivée par l'admin) */
  antitriche_enabled?: boolean;
  /** Connexion obligatoire pour accéder au formulaire */
  requires_auth?: boolean;
  sections: Section[];
}

interface Props {
  form: FormData;
}

function AeroSchoolBackdrop() {
  return (
    <>
      <div className="absolute inset-0 bg-gradient-to-br from-sky-950 via-slate-950 to-amber-950/45" />
      <div className="absolute inset-0 bg-cockpit-grid opacity-45" />
      <div className="pointer-events-none absolute -top-28 right-[-8%] h-96 w-96 rounded-full bg-amber-300/15 blur-3xl" />
      <div className="pointer-events-none absolute bottom-[-12%] left-[-10%] h-96 w-96 rounded-full bg-sky-400/15 blur-3xl" />
    </>
  );
}

export default function FormRenderer({ form }: Props) {
  const router = useRouter();
  const [testStarted, setTestStarted] = useState(false);
  const [currentSection, setCurrentSection] = useState(0);
  const [answers, setAnswers] = useState<Record<string, string | string[]>>({});
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [submitResult, setSubmitResult] = useState<{ score?: number; maxScore?: number } | null>(null);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [moduleQuestions, setModuleQuestions] = useState<Record<string, ModuleQuestion[]>>({});
  const [moduleLoading, setModuleLoading] = useState(true);
  const [session, setSession] = useState<RespondentSession | null>(null);
  const [sessionLoading, setSessionLoading] = useState(true);
  const [testToken, setTestToken] = useState<string | null>(null);
  const [startingTest, setStartingTest] = useState(false);
  const [startError, setStartError] = useState<string | null>(null);

  const testTokenRef = useRef<string | null>(null);
  useEffect(() => { testTokenRef.current = testToken; }, [testToken]);

  useEffect(() => {
    fetch('/api/aeroschool/session')
      .then((r) => r.json())
      .then((data) => setSession(data))
      .catch(() => setSession({ authenticated: false }))
      .finally(() => setSessionLoading(false));
  }, []);

  const requiresAuth = form.requires_auth === true;
  const isLoggedIn = session?.authenticated === true;
  const canAccess = !requiresAuth || isLoggedIn;

  const buildSubmitPayload = useCallback((extra: Record<string, unknown>) => ({
    ...extra,
    ...(testTokenRef.current ? { test_token: testTokenRef.current } : {}),
  }), []);

  const timeLimitMinutes = form.time_limit_minutes ?? null;
  const totalSeconds = timeLimitMinutes != null ? timeLimitMinutes * 60 : 0;
  const [remainingSeconds, setRemainingSeconds] = useState(totalSeconds);
  const timeExpiredHandled = useRef(false);
  /** Zone « légitime » pour l’anti-triche : clics en dehors (extensions, overlay) déclenchent la triche. */
  const antiCheatShellRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!testStarted || timeLimitMinutes == null || totalSeconds <= 0) return;
    setRemainingSeconds(totalSeconds);
    const interval = setInterval(() => {
      setRemainingSeconds((prev) => {
        if (prev <= 1) {
          clearInterval(interval);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
    return () => clearInterval(interval);
  }, [testStarted, timeLimitMinutes, totalSeconds]);

  useEffect(() => {
    if (remainingSeconds !== 0 || timeExpiredHandled.current || timeLimitMinutes == null) return;
    timeExpiredHandled.current = true;
    (async () => {
      try {
        await fetch(`/api/aeroschool/forms/${form.id}/submit`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(buildSubmitPayload({ answers, time_expired: true })),
        });
      } catch { /* ignore */ }
      router.replace('/login?message=test_echoue_temps_termine');
    })();
  }, [remainingSeconds, timeLimitMinutes, form.id, answers, router, buildSubmitPayload]);

  const handleCheat = useCallback(async (reason: string) => {
    try {
      await fetch(`/api/aeroschool/forms/${form.id}/submit`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(buildSubmitPayload({ answers, cheating_detected: true, cheat_reason: reason })),
      });
    } catch { /* ignore */ }
  }, [form.id, answers, buildSubmitPayload]);

  /** Toast d'avertissement non bloquant (anti-triche) */
  const [warningToast, setWarningToast] = useState<{ msg: string; key: number } | null>(null);
  const handleWarning = useCallback((message: string) => {
    setWarningToast({ msg: message, key: Date.now() });
  }, []);
  useEffect(() => {
    if (!warningToast) return;
    const t = setTimeout(() => {
      setWarningToast((w) => (w && w.key === warningToast.key ? null : w));
    }, 5000);
    return () => clearTimeout(t);
  }, [warningToast]);

  /** Refs miroirs des states utilisés par le handler `pagehide` (sinon stale closures). */
  const answersRef = useRef(answers);
  const submittedRef = useRef(false);
  const submittingRef = useRef(false);
  useEffect(() => { answersRef.current = answers; }, [answers]);
  useEffect(() => { submittedRef.current = submitted; }, [submitted]);
  useEffect(() => { submittingRef.current = submitting; }, [submitting]);

  // Charger les questions des blocs question_module au démarrage du test
  useEffect(() => {
    if (!testStarted) return;
    const blocks: { blockId: string; moduleId: string; count: number }[] = [];
    for (const sec of form.sections || []) {
      for (const q of sec.questions || []) {
        if (q.type === 'question_module' && q.module_id?.trim()) {
          blocks.push({
            blockId: q.id,
            moduleId: q.module_id.trim(),
            count: Math.max(1, q.module_count ?? 10),
          });
        }
      }
    }
    if (blocks.length === 0) {
      setModuleLoading(false);
      return;
    }
    let cancelled = false;
    (async () => {
      const results = await Promise.all(
        blocks.map(async ({ blockId, moduleId, count }) => {
          try {
            const res = await fetch(`/api/aeroschool/modules/${moduleId}/random?count=${count}`);
            if (res.ok) {
              const data = await res.json();
              return { blockId, questions: data.questions || [] };
            }
          } catch { /* ignore */ }
          return { blockId, questions: [] };
        })
      );
      if (!cancelled) {
        const loaded: Record<string, ModuleQuestion[]> = {};
        for (const { blockId, questions } of results) {
          loaded[blockId] = questions;
        }
        setModuleQuestions(loaded);
      }
      setModuleLoading(false);
    })();
    return () => { cancelled = true; };
  }, [testStarted, form.sections]);

  const antitricheEnabled = form.antitriche_enabled !== false;
  const { cheatingDetected, presencePromptVisible, confirmPresence } = useAntiCheat({
    enabled: testStarted && antitricheEnabled,
    onCheatDetected: handleCheat,
    onWarning: handleWarning,
    graceMs: 5000,
    allowedInteractionRootRef: antiCheatShellRef,
    debug: process.env.NODE_ENV !== 'production',
  });

  /** Ref miroir de cheatingDetected pour le handler pagehide (évite stale closure). */
  const cheatingRef = useRef(false);
  useEffect(() => { cheatingRef.current = cheatingDetected; }, [cheatingDetected]);

  /**
   * Fermeture du navigateur / onglet pendant le test : envoyer un signal
   * "abandoned" au serveur via navigator.sendBeacon (garanti par le navigateur
   * même quand la page se décharge). Le statut est distinct de "trashed"
   * (triche) pour que l'admin puisse différencier.
   */
  useEffect(() => {
    if (!testStarted || !antitricheEnabled) return;

    const sendAbandonBeacon = () => {
      if (submittedRef.current || submittingRef.current || cheatingRef.current) return;
      const currentAnswers = answersRef.current;
      if (!currentAnswers || Object.keys(currentAnswers).length === 0) return;
      try {
        const blob = new Blob(
          [JSON.stringify(buildSubmitPayload({ answers: currentAnswers, status_override: 'abandoned' }))],
          { type: 'application/json' },
        );
        navigator.sendBeacon(`/api/aeroschool/forms/${form.id}/submit`, blob);
      } catch { /* best effort */ }
    };

    const handlePageHide = (e: PageTransitionEvent) => {
      if (e.persisted) return;
      sendAbandonBeacon();
    };

    window.addEventListener('pagehide', handlePageHide);
    return () => window.removeEventListener('pagehide', handlePageHide);
  }, [testStarted, antitricheEnabled, form.id, buildSubmitPayload]);

  const handleStartTest = async () => {
    setStartError(null);
    setStartingTest(true);
    try {
      const res = await fetch(`/api/aeroschool/forms/${form.id}/start`, { method: 'POST' });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Impossible de démarrer le test');

      setTestToken(data.test_token);
      testTokenRef.current = data.test_token;

      if (isLoggedIn && session?.identifiant) {
        const prefills = buildIdentityPrefills(form.sections, {
          identifiant: session.identifiant,
          discordUsername: session.discordUsername ?? null,
        });
        if (Object.keys(prefills).length > 0) {
          setAnswers((prev) => {
            const merged = { ...prev };
            for (const [key, value] of Object.entries(prefills)) {
              const existing = merged[key];
              if (!existing || (typeof existing === 'string' && !existing.trim())) {
                merged[key] = value;
              }
            }
            return merged;
          });
        }
      }

      setTestStarted(true);
    } catch (e) {
      setStartError(e instanceof Error ? e.message : 'Erreur au démarrage');
    } finally {
      setStartingTest(false);
    }
  };

  const section = form.sections[currentSection];
  const isLast = currentSection === form.sections.length - 1;
  const isFirst = currentSection === 0;
  const progress = form.sections.length > 1
    ? ((currentSection + 1) / form.sections.length) * 100
    : submitted ? 100 : 50;

  const updateAnswer = (questionId: string, value: string | string[]) => {
    setAnswers((a) => ({ ...a, [questionId]: value }));
    setErrors((e) => {
      const next = { ...e };
      delete next[questionId];
      return next;
    });
  };

  const toggleCheckbox = (questionId: string, option: string) => {
    setAnswers((a) => {
      const current = Array.isArray(a[questionId]) ? [...(a[questionId] as string[])] : [];
      const idx = current.indexOf(option);
      if (idx >= 0) current.splice(idx, 1);
      else current.push(option);
      return { ...a, [questionId]: current };
    });
    setErrors((e) => {
      const next = { ...e };
      delete next[questionId];
      return next;
    });
  };

  const validateSection = (): boolean => {
    const newErrors: Record<string, string> = {};
    for (const q of section.questions) {
      if (q.type === 'question_module') {
        const mqs = moduleQuestions[q.id] || [];
        for (const mq of mqs) {
          const key = formatModuleAnswerKey(q.id, q.module_id, mq.id);
          const ans = answers[key];
          if (!ans || (typeof ans === 'string' && !ans.trim())) {
            newErrors[key] = 'Cette question est obligatoire';
          }
        }
      } else if (q.required) {
        const ans = answers[q.id];
        if (!ans || (typeof ans === 'string' && !ans.trim()) || (Array.isArray(ans) && ans.length === 0)) {
          newErrors[q.id] = 'Cette question est obligatoire';
        }
      }
    }
    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleNext = () => {
    if (!validateSection()) return;
    setCurrentSection((s) => Math.min(s + 1, form.sections.length - 1));
  };

  const handlePrev = () => {
    setCurrentSection((s) => Math.max(s - 1, 0));
  };

  const handleSubmit = async () => {
    if (!validateSection()) return;
    setSubmitting(true);
    setSubmitError(null);
    try {
      const res = await fetch(`/api/aeroschool/forms/${form.id}/submit`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(buildSubmitPayload({ answers, cheating_detected: false })),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Erreur lors de la soumission');
      setSubmitted(true);
      setSubmitResult({ score: data.score, maxScore: data.maxScore });
    } catch (e) {
      setSubmitError(e instanceof Error ? e.message : 'Erreur');
    } finally {
      setSubmitting(false);
    }
  };

  // Page d'avertissement avant de commencer le test
  if (!testStarted) {
    if (sessionLoading) {
      return (
        <div className="min-h-screen relative overflow-hidden flex items-center justify-center">
          <AeroSchoolBackdrop />
          <Loader2 className="relative z-10 h-10 w-10 text-amber-400 animate-spin" />
        </div>
      );
    }

    if (!canAccess) {
      return (
        <div className="min-h-screen relative overflow-hidden flex flex-col items-center justify-center p-6">
          <AeroSchoolBackdrop />
          <div className="relative z-10 max-w-lg w-full text-center space-y-6 animate-page-reveal">
            <div className="rounded-3xl border border-sky-300/25 bg-slate-900/75 p-8 shadow-2xl backdrop-blur-xl">
              <Lock className="h-16 w-16 text-sky-300 mx-auto mb-4" />
              <h2 className="text-2xl font-black text-white">Connexion requise</h2>
              <p className="text-slate-400 mt-3 text-sm leading-relaxed">
                Le formulaire <strong className="text-slate-200">&quot;{form.title}&quot;</strong> est réservé aux membres connectés.
              </p>
              <Link
                href={`/login?redirect=${encodeURIComponent(`/aeroschool/${form.id}`)}`}
                className="mt-6 inline-flex items-center justify-center gap-2 px-8 py-3.5 bg-gradient-to-r from-sky-400 to-amber-300 text-slate-950 font-black rounded-2xl shadow-lg hover:brightness-110 transition"
              >
                Se connecter
              </Link>
              <Link href="/aeroschool" className="block mt-4 text-sm text-slate-500 hover:text-slate-300 transition-colors">
                ← Retour à AeroSchool
              </Link>
            </div>
          </div>
        </div>
      );
    }

    return (
      <div className="min-h-screen relative overflow-hidden flex flex-col items-center justify-center p-4 sm:p-6">
        <AeroSchoolBackdrop />
        <div className="relative z-10 max-w-2xl w-full text-center space-y-6 animate-page-reveal">
          <div className="rounded-3xl border border-amber-200/25 bg-slate-900/75 p-6 sm:p-8 space-y-5 shadow-2xl shadow-slate-950/40 backdrop-blur-xl">
            <div className="mx-auto flex h-20 w-20 items-center justify-center rounded-2xl border border-amber-200/30 bg-amber-300/15">
              <AlertTriangle className="h-10 w-10 text-amber-200" />
            </div>
            <div>
              <p className="text-[11px] font-bold uppercase tracking-[0.24em] text-sky-200/80">Briefing candidat</p>
              <h2 className="mt-2 text-2xl font-black text-white">Avant de commencer</h2>
              <p className="mt-1 text-sm text-slate-400">{form.title}</p>
            </div>
            {isLoggedIn && session?.identifiant && (
              <div className="flex items-center justify-center gap-2 rounded-2xl border border-emerald-300/20 bg-emerald-400/10 px-4 py-3 text-sm text-emerald-100">
                <User className="h-4 w-4 shrink-0" />
                <span>Connecté en tant que <strong>{session.identifiant}</strong></span>
                {session.discordUsername && (
                  <span className="text-emerald-200/70">· Discord : {session.discordUsername}</span>
                )}
              </div>
            )}
            <p className="text-slate-300 text-left leading-relaxed rounded-2xl border border-slate-700/60 bg-slate-950/40 p-4 text-sm sm:text-base">
              {antitricheEnabled ? (
                <>
                  Fermez toutes les applications en arrière-plan et tous les autres onglets du navigateur.
                  <br /><br />
                  Pendant le test, ne changez pas d&apos;onglet et ne quittez pas cette page, sous peine de détection de triche.
                </>
              ) : (
                <>Vous pouvez remplir le formulaire à votre rythme.</>
              )}
            </p>
            {timeLimitMinutes != null && (
              <div className="rounded-2xl border border-sky-300/20 bg-sky-400/10 px-4 py-3 text-sm text-sky-100">
                Temps limite : <strong>{timeLimitMinutes} min</strong>
              </div>
            )}
            {startError && (
              <p className="text-red-400 text-sm font-medium">{startError}</p>
            )}
          </div>
          <button
            type="button"
            onClick={handleStartTest}
            disabled={startingTest}
            className="w-full sm:w-auto px-10 py-4 min-h-[3.25rem] bg-gradient-to-r from-sky-400 via-cyan-400 to-amber-300 hover:brightness-110 text-slate-950 font-black text-lg rounded-2xl shadow-lg shadow-sky-500/25 transition disabled:opacity-60 flex items-center justify-center gap-2 mx-auto"
          >
            {startingTest ? <Loader2 className="h-5 w-5 animate-spin" /> : null}
            {startingTest ? 'Préparation…' : 'Commencer'}
          </button>
        </div>
      </div>
    );
  }

  // Écran TRICHERIE DÉTECTÉE
  if (cheatingDetected) {
    return (
      <div className="fixed inset-0 z-[9999] bg-red-600 flex flex-col items-center justify-center p-8">
        <div className="text-center space-y-8">
          <XCircle className="h-32 w-32 text-white mx-auto animate-pulse" />
          <h1 className="text-5xl sm:text-7xl font-black text-white tracking-wider uppercase">
            TRICHERIE DÉTECTÉE
          </h1>
          <p className="text-xl text-red-100 max-w-md mx-auto">
            Votre formulaire a été annulé et mis à la poubelle.
          </p>
          <button
            onClick={() => router.push('/aeroschool')}
            className="px-8 py-4 bg-white text-red-600 font-bold text-lg rounded-xl shadow-2xl hover:bg-red-50 transition-colors"
          >
            Fermer le formulaire
          </button>
        </div>
      </div>
    );
  }

  // Écran de confirmation
  if (submitted) {
    return (
      <div className="min-h-screen relative overflow-hidden flex items-center justify-center p-4">
        <AeroSchoolBackdrop />
        <div className="relative z-10 max-w-lg w-full text-center space-y-6 rounded-3xl border border-emerald-300/25 bg-slate-900/75 p-8 shadow-2xl shadow-slate-950/40 backdrop-blur-xl">
          <CheckCircle2 className="h-20 w-20 text-emerald-300 mx-auto" />
          <h2 className="text-3xl font-black text-white">Réponses envoyées</h2>
          <p className="text-slate-400">
            Merci d&apos;avoir répondu au formulaire <strong className="text-slate-200">&quot;{form.title}&quot;</strong>.
          </p>
          {submitResult?.maxScore !== undefined && submitResult.maxScore > 0 && (
            <div className="bg-slate-950/50 border border-slate-700/50 rounded-2xl p-6">
              <p className="text-slate-400 text-sm mb-2">Votre score</p>
              <p className="text-4xl font-bold text-white">
                {submitResult.score} <span className="text-slate-500 text-2xl">/ {submitResult.maxScore}</span>
              </p>
            </div>
          )}
          <button
            onClick={() => router.push('/aeroschool')}
            className="px-6 py-3 bg-sky-500 text-white font-bold rounded-xl hover:bg-sky-400 transition-colors"
          >
            Retour à AeroSchool
          </button>
        </div>
      </div>
    );
  }

  const formatTime = (sec: number) => {
    const m = Math.floor(sec / 60);
    const s = sec % 60;
    return `${m}:${s.toString().padStart(2, '0')}`;
  };

  return (
    <div ref={antiCheatShellRef} className="min-h-screen relative overflow-x-hidden py-24 sm:py-28 px-3 sm:px-4 pb-32">
      <AeroSchoolBackdrop />

      {/* Barre fixe : progression + chrono */}
      <div className="fixed top-0 inset-x-0 z-50 border-b border-slate-700/60 bg-slate-950/92 backdrop-blur-xl safe-x">
        <div className="max-w-4xl mx-auto px-3 sm:px-4 py-3 space-y-2">
          <div className="flex items-center justify-between gap-3 text-xs text-slate-400">
            <span>Section {currentSection + 1} / {form.sections.length}</span>
            {timeLimitMinutes != null && (
              <div className="flex items-center gap-1.5 font-mono font-bold tabular-nums text-sm">
                <Clock className={`h-4 w-4 ${remainingSeconds <= 60 ? 'text-amber-400' : 'text-sky-300'}`} />
                <span className={remainingSeconds <= 60 ? 'text-amber-400' : 'text-slate-200'}>
                  {formatTime(Math.max(0, remainingSeconds))}
                </span>
              </div>
            )}
          </div>
          <div className="w-full bg-slate-800/80 rounded-full h-2 overflow-hidden">
            <div
              className="h-full bg-gradient-to-r from-sky-400 via-cyan-400 to-amber-300 transition-all duration-500 ease-out"
              style={{ width: `${progress}%` }}
            />
          </div>
        </div>
      </div>

      <form className="relative z-10 max-w-4xl mx-auto space-y-5 sm:space-y-6 animate-page-reveal" autoComplete="off" onSubmit={(e) => e.preventDefault()}>

        {/* En-tête du formulaire */}
        {currentSection === 0 && (
          <div className="bg-slate-900/75 border border-sky-300/20 rounded-3xl p-6 sm:p-7 shadow-2xl shadow-slate-950/30 backdrop-blur-xl border-t-4 border-t-sky-400">
            <p className="text-[11px] font-bold uppercase tracking-[0.24em] text-sky-200/80">AeroSchool</p>
            <h1 className="mt-2 text-2xl sm:text-3xl font-black text-white">{form.title}</h1>
            {form.description && (
              <p className="text-slate-400 mt-2">{form.description}</p>
            )}
            {antitricheEnabled && (
            <div className="mt-4 flex items-center gap-2 text-amber-200 text-sm bg-amber-500/10 border border-amber-500/20 rounded-2xl p-3">
              <AlertTriangle className="h-4 w-4 shrink-0" />
              <span>Ne changez pas d&apos;onglet et ne quittez pas cette page pendant le questionnaire.</span>
            </div>
          )}
          </div>
        )}

        {/* Section courante */}
        <div className="space-y-4">
          {form.sections.length > 1 && (
            <div className="bg-slate-900/70 border border-slate-700/60 rounded-2xl p-5 backdrop-blur-md border-l-4 border-l-emerald-400">
              <p className="text-slate-400 text-sm">Section {currentSection + 1} / {form.sections.length}</p>
              <h2 className="text-xl font-semibold text-white mt-1">{section.title}</h2>
              {section.description && <p className="text-slate-400 text-sm mt-1">{section.description}</p>}
            </div>
          )}

          {/* Questions */}
          {section.questions.map((q) => {
            if (q.type === 'question_module') {
              const mqs = moduleQuestions[q.id];
              if (moduleLoading && !mqs) {
                return (
                  <div key={q.id} className="bg-orange-500/10 border-2 border-orange-500/30 rounded-2xl p-6 flex items-center justify-center gap-2">
                    <Loader2 className="h-6 w-6 text-orange-400 animate-spin" />
                    <span className="text-orange-400">Chargement des questions…</span>
                  </div>
                );
              }
              const questionsToShow = mqs || [];
              if (questionsToShow.length === 0 && q.module_id) {
                return (
                  <div key={q.id} className="bg-orange-500/10 border-2 border-orange-500/30 rounded-2xl p-6 text-orange-400 text-center">
                    Module introuvable ou vide.
                  </div>
                );
              }
              return (
                <div key={q.id} className="space-y-4">
                  {q.title && (
                    <div className="bg-orange-500/10 border border-orange-500/30 rounded-2xl px-4 py-2">
                      <h3 className="text-orange-300 font-semibold">{q.title}</h3>
                    </div>
                  )}
                  {questionsToShow.map((mq) => {
                    const answerKey = formatModuleAnswerKey(q.id, q.module_id, mq.id);
                    return (
                      <div key={mq.id} className="bg-slate-900/70 border border-slate-700/60 rounded-2xl p-5 space-y-3 shadow-xl shadow-slate-950/20 backdrop-blur-md">
                        <h3 className="text-slate-100 font-medium">{mq.title}</h3>
                        <div className="space-y-2">
                          {(mq.options || []).map((opt) => (
                            <label key={opt} className="flex items-center gap-3 p-3.5 sm:p-4 min-h-[3rem] rounded-xl border border-transparent hover:border-sky-400/20 hover:bg-sky-400/5 active:scale-[0.99] cursor-pointer transition-all">
                              <input
                                type="radio"
                                name={answerKey}
                                checked={(answers[answerKey] as string) === opt}
                                onChange={() => updateAnswer(answerKey, opt)}
                                className="w-5 h-5 shrink-0 text-sky-500 accent-sky-500"
                              />
                              <span className="text-slate-200 text-sm sm:text-base break-words">{opt}</span>
                            </label>
                          ))}
                        </div>
                        {errors[answerKey] && (
                          <p className="text-red-400 text-sm flex items-center gap-1">
                            <AlertTriangle className="h-3.5 w-3.5" />
                            {errors[answerKey]}
                          </p>
                        )}
                      </div>
                    );
                  })}
                </div>
              );
            }

            return (
            <div key={q.id} className="bg-slate-900/70 border border-slate-700/60 rounded-2xl p-4 sm:p-5 space-y-3 shadow-xl shadow-slate-950/20 backdrop-blur-md transition-colors hover:border-sky-300/20 animate-fade-in">
              <div className="flex items-start gap-1">
                <h3 className="text-slate-100 font-medium text-base sm:text-lg break-words">{q.title}</h3>
                {q.required && <span className="text-red-400 text-sm">*</span>}
              </div>
              {q.description && <p className="text-slate-400 text-sm">{q.description}</p>}

              {/* Texte court */}
              {q.type === 'short_text' && (
                <input
                  type="text"
                  value={(answers[q.id] as string) || ''}
                  onChange={(e) => updateAnswer(q.id, e.target.value)}
                  placeholder="Votre réponse"
                  autoComplete="off"
                  autoCorrect="off"
                  autoCapitalize="off"
                  spellCheck={false}
                  name={q.id}
                  className="w-full bg-slate-950/35 border border-slate-700/70 focus:border-sky-400 text-slate-100 rounded-xl px-4 py-3 outline-none transition-colors"
                />
              )}

              {/* Paragraphe */}
              {q.type === 'paragraph' && (
                <textarea
                  value={(answers[q.id] as string) || ''}
                  onChange={(e) => updateAnswer(q.id, e.target.value)}
                  placeholder="Votre réponse"
                  rows={4}
                  autoComplete="off"
                  autoCorrect="off"
                  autoCapitalize="off"
                  spellCheck={false}
                  name={q.id}
                  className="w-full bg-slate-950/35 border border-slate-700/70 focus:border-sky-400 rounded-xl text-slate-100 p-4 outline-none transition-colors resize-y"
                />
              )}

              {/* Choix unique (radio) */}
              {q.type === 'radio' && q.options && (
                <div className="space-y-2">
                  {q.options.map((opt) => (
                    <label key={opt} className="flex items-center gap-3 p-3.5 sm:p-4 min-h-[3rem] rounded-xl border border-transparent hover:border-sky-400/20 hover:bg-sky-400/5 active:scale-[0.99] cursor-pointer transition-all">
                      <input
                        type="radio"
                        name={q.id}
                        checked={(answers[q.id] as string) === opt}
                        onChange={() => updateAnswer(q.id, opt)}
                        className="w-5 h-5 shrink-0 text-sky-500 accent-sky-500"
                      />
                      <span className="text-slate-200 text-sm sm:text-base break-words">{opt}</span>
                    </label>
                  ))}
                </div>
              )}

              {/* Cases à cocher */}
              {q.type === 'checkbox' && q.options && (
                <div className="space-y-2">
                  {q.options.map((opt) => (
                    <label key={opt} className="flex items-center gap-3 p-3.5 sm:p-4 min-h-[3rem] rounded-xl border border-transparent hover:border-sky-400/20 hover:bg-sky-400/5 active:scale-[0.99] cursor-pointer transition-all">
                      <input
                        type="checkbox"
                        checked={Array.isArray(answers[q.id]) && (answers[q.id] as string[]).includes(opt)}
                        onChange={() => toggleCheckbox(q.id, opt)}
                        className="w-5 h-5 shrink-0 text-sky-500 accent-sky-500 rounded"
                      />
                      <span className="text-slate-200 text-sm sm:text-base break-words">{opt}</span>
                    </label>
                  ))}
                </div>
              )}

              {/* Dropdown */}
              {q.type === 'dropdown' && q.options && (
                <select
                  value={(answers[q.id] as string) || ''}
                  onChange={(e) => updateAnswer(q.id, e.target.value)}
                  className="w-full bg-slate-950/50 border border-slate-700 rounded-xl text-slate-200 px-3 py-3 outline-none focus:border-sky-400 transition-colors"
                >
                  <option value="">Sélectionner…</option>
                  {q.options.map((opt) => (
                    <option key={opt} value={opt}>{opt}</option>
                  ))}
                </select>
              )}

              {/* Échelle linéaire */}
              {q.type === 'linear_scale' && (
                <div className="space-y-2">
                  <div className="flex items-center justify-between text-sm text-slate-400 px-1">
                    <span>{q.scale_min_label || ''}</span>
                    <span>{q.scale_max_label || ''}</span>
                  </div>
                  <div className="flex items-center justify-center gap-2 flex-wrap">
                    {Array.from(
                      { length: (q.scale_max ?? 5) - (q.scale_min ?? 0) + 1 },
                      (_, i) => (q.scale_min ?? 0) + i
                    ).map((n) => (
                      <button
                        key={n}
                        type="button"
                        onClick={() => updateAnswer(q.id, String(n))}
                        className={`w-11 h-11 rounded-full border text-sm font-bold transition-all ${
                          (answers[q.id] as string) === String(n)
                            ? 'bg-gradient-to-br from-sky-400 to-amber-300 border-sky-300 text-slate-950 shadow-lg shadow-sky-500/20'
                            : 'border-slate-600 text-slate-400 hover:border-slate-500 hover:text-slate-200'
                        }`}
                      >
                        {n}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {/* Erreur */}
              {errors[q.id] && (
                <p className="text-red-400 text-sm flex items-center gap-1">
                  <AlertTriangle className="h-3.5 w-3.5" />
                  {errors[q.id]}
                </p>
              )}
            </div>
          );
          })}
        </div>

        {/* Erreur soumission */}
        {submitError && (
          <div className="p-4 rounded-xl bg-red-500/10 border border-red-500/30">
            <p className="text-red-400 text-sm font-medium">{submitError}</p>
          </div>
        )}

        {/* Navigation — sticky en bas sur mobile */}
        <div className="fixed bottom-0 inset-x-0 z-40 border-t border-slate-700/60 bg-slate-950/95 backdrop-blur-xl safe-x sm:relative sm:border sm:rounded-2xl sm:bg-slate-900/65">
          <div className="max-w-4xl mx-auto flex items-center justify-between gap-2 p-3 sm:p-3">
          <button
            type="button"
            onClick={handlePrev}
            disabled={isFirst}
            className="flex items-center gap-2 px-4 sm:px-5 py-3 min-h-[3rem] rounded-xl border border-slate-600 text-slate-300 hover:bg-slate-700/50 disabled:opacity-30 disabled:cursor-not-allowed transition-colors text-sm font-medium"
          >
            <ChevronLeft className="h-4 w-4" />
            <span className="hidden sm:inline">Précédent</span>
          </button>

          {isLast ? (
            <button
              type="button"
              onClick={handleSubmit}
              disabled={submitting}
              className="flex items-center gap-2 px-5 sm:px-6 py-3 min-h-[3rem] rounded-xl bg-gradient-to-r from-emerald-400 to-sky-400 text-slate-950 font-black text-sm shadow-lg shadow-emerald-500/20 hover:brightness-110 transition-all disabled:opacity-50"
            >
              {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
              {submitting ? 'Envoi…' : 'Envoyer'}
            </button>
          ) : (
            <button
              type="button"
              onClick={handleNext}
              className="flex items-center gap-2 px-4 sm:px-5 py-3 min-h-[3rem] rounded-xl bg-gradient-to-r from-sky-400 to-amber-300 text-slate-950 font-black text-sm shadow-lg shadow-sky-500/20 hover:brightness-110 transition-all"
            >
              Suivant
              <ChevronRight className="h-4 w-4" />
            </button>
          )}
          </div>
        </div>
      </form>

      {/* Toast d'avertissement anti-triche (1ʳᵉ infraction ambiguë) */}
      {antitricheEnabled && warningToast && (
        <div
          key={warningToast.key}
          className="fixed top-20 left-1/2 -translate-x-1/2 z-[9999] animate-fade-in max-w-md w-[90vw]"
        >
          <div className="flex items-start gap-3 px-5 py-3 rounded-xl bg-amber-500/95 text-white font-medium shadow-2xl border border-amber-400 backdrop-blur-sm">
            <AlertTriangle className="h-5 w-5 shrink-0 mt-0.5" />
            <span className="text-sm leading-snug">{warningToast.msg}</span>
          </div>
        </div>
      )}

      {/* Notification flottante de confirmation de présence */}
      {antitricheEnabled && presencePromptVisible && confirmPresence && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-[9998] animate-fade-in">
          <button
            type="button"
            onClick={confirmPresence}
            className="flex items-center gap-3 px-6 py-4 rounded-2xl bg-sky-600 hover:bg-sky-500 text-white font-semibold shadow-xl shadow-sky-900/50 border border-sky-500/50 transition-colors"
          >
            <CheckCircle2 className="h-6 w-6 shrink-0" />
            <span>Je suis toujours là — Cliquez pour confirmer</span>
          </button>
        </div>
      )}
    </div>
  );
}
