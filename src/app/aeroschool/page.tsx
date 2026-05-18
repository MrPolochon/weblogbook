'use client';

import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import { GraduationCap, ArrowLeft, FileText, Loader2, ClipboardCheck, ShieldCheck, Timer } from 'lucide-react';

interface FormSummary {
  id: string;
  title: string;
  description: string;
  sectionCount: number;
  questionCount: number;
  created_at: string;
}

export default function AeroSchoolPage() {
  const [forms, setForms] = useState<FormSummary[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch('/api/aeroschool/forms')
      .then((r) => r.json())
      .then((data) => setForms(Array.isArray(data) ? data : []))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  return (
    <div className="min-h-screen relative overflow-hidden bg-slate-950">
      <div className="absolute inset-0 bg-gradient-to-br from-sky-950 via-slate-950 to-amber-950/50" />
      <div className="absolute inset-0 bg-cockpit-grid opacity-50" />
      <div className="pointer-events-none absolute -top-24 right-[-10%] h-96 w-96 rounded-full bg-amber-300/15 blur-3xl" />
      <div className="pointer-events-none absolute bottom-[-10%] left-[-8%] h-96 w-96 rounded-full bg-sky-400/15 blur-3xl" />

      <div className="relative z-10 max-w-6xl mx-auto px-4 py-8 sm:py-12 animate-page-reveal">
        {/* Header */}
        <div className="text-center mb-10">
          <Link
            href="/login"
            className="inline-flex items-center gap-2 text-slate-400 hover:text-amber-200 text-sm mb-8 transition-colors"
          >
            <ArrowLeft className="h-4 w-4" />
            Retour à la connexion
          </Link>
          <div className="relative overflow-hidden rounded-3xl border border-amber-200/20 bg-slate-900/60 p-6 sm:p-8 shadow-2xl shadow-sky-950/40 backdrop-blur-xl">
            <div className="pointer-events-none absolute inset-0 bg-gradient-to-br from-amber-300/10 via-sky-400/5 to-transparent" />
            <div className="relative">
              <div className="mx-auto mb-5 flex h-20 w-20 items-center justify-center rounded-2xl border border-amber-200/30 bg-amber-300/15 shadow-[0_0_40px_rgba(251,191,36,0.18)]">
                <GraduationCap className="h-10 w-10 text-amber-200" />
              </div>
              <p className="mb-2 text-[11px] font-bold uppercase tracking-[0.26em] text-sky-200/80">Centre d&apos;évaluation public</p>
              <h1 className="text-4xl sm:text-5xl font-black tracking-tight text-white">AeroSchool</h1>
              <p className="mx-auto mt-3 max-w-2xl text-sm sm:text-base text-slate-300">
                Questionnaires et évaluations aéronautiques accessibles sans compte. Préparez votre test, respectez les consignes et envoyez vos réponses.
              </p>
              <div className="mt-6 grid gap-3 sm:grid-cols-3">
                <div className="rounded-2xl border border-sky-300/15 bg-sky-400/10 px-4 py-3 text-left">
                  <ClipboardCheck className="mb-2 h-5 w-5 text-sky-300" />
                  <p className="text-xs font-semibold uppercase tracking-wide text-sky-200">Tests publiés</p>
                  <p className="text-2xl font-bold text-white">{forms.length}</p>
                </div>
                <div className="rounded-2xl border border-amber-300/15 bg-amber-300/10 px-4 py-3 text-left">
                  <Timer className="mb-2 h-5 w-5 text-amber-200" />
                  <p className="text-xs font-semibold uppercase tracking-wide text-amber-100">Chronométré</p>
                  <p className="text-sm font-medium text-slate-200">Selon le formulaire</p>
                </div>
                <div className="rounded-2xl border border-emerald-300/15 bg-emerald-400/10 px-4 py-3 text-left">
                  <ShieldCheck className="mb-2 h-5 w-5 text-emerald-300" />
                  <p className="text-xs font-semibold uppercase tracking-wide text-emerald-200">Anti-triche</p>
                  <p className="text-sm font-medium text-slate-200">Indiqué avant le test</p>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Liste des formulaires */}
        {loading ? (
          <div className="flex items-center justify-center py-20 rounded-2xl border border-slate-700/50 bg-slate-900/40">
            <Loader2 className="h-8 w-8 text-amber-400 animate-spin" />
          </div>
        ) : forms.length === 0 ? (
          <div className="text-center py-20 rounded-2xl border border-slate-700/50 bg-slate-900/50">
            <FileText className="h-16 w-16 text-slate-600 mx-auto mb-4" />
            <p className="text-slate-400 text-lg">Aucun questionnaire disponible pour le moment</p>
            <p className="text-slate-500 text-sm mt-1">Revenez plus tard</p>
          </div>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 stagger-enter">
            {forms.map((f) => (
              <Link
                key={f.id}
                href={`/aeroschool/${f.id}`}
                className="group relative overflow-hidden rounded-2xl border border-slate-700/60 bg-slate-900/70 p-5 shadow-xl shadow-slate-950/20 backdrop-blur-md transition-all hover:-translate-y-1 hover:border-amber-300/50 hover:bg-slate-900"
              >
                <div className="pointer-events-none absolute inset-0 bg-gradient-to-br from-amber-300/10 via-transparent to-sky-400/10 opacity-0 transition-opacity group-hover:opacity-100" />
                <div className="flex items-start gap-4">
                  <div className="relative p-2.5 rounded-xl bg-amber-500/10 border border-amber-500/20 group-hover:bg-amber-500/20 transition-colors shrink-0">
                    <FileText className="h-6 w-6 text-amber-300" />
                  </div>
                  <div className="relative flex-1 min-w-0">
                    <h3 className="font-semibold text-slate-100 group-hover:text-white transition-colors truncate">
                      {f.title}
                    </h3>
                    {f.description && (
                      <p className="text-slate-400 text-sm mt-1 line-clamp-2">{f.description}</p>
                    )}
                    <div className="flex items-center gap-3 mt-3 text-xs text-slate-500">
                      <span>{f.sectionCount} section{f.sectionCount > 1 ? 's' : ''}</span>
                      <span>·</span>
                      <span>{f.questionCount} question{f.questionCount > 1 ? 's' : ''}</span>
                    </div>
                  </div>
                </div>
                <div className="relative mt-4 text-right">
                  <span className="inline-flex items-center gap-1 text-sm font-bold text-amber-300 group-hover:text-amber-200 transition-colors">
                    Commencer →
                  </span>
                </div>
              </Link>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
