'use client';

import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import { GraduationCap, ArrowLeft, FileText, Loader2 } from 'lucide-react';

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
    <div className="min-h-screen bg-slate-900 relative">
      {/* Background gradient */}
      <div className="absolute inset-0 bg-gradient-to-br from-slate-900 via-slate-900 to-amber-900/20" />

      <div className="relative z-10 max-w-4xl mx-auto px-4 py-12">
        {/* Header */}
        <div className="text-center mb-12">
          <Link
            href="/login"
            className="inline-flex items-center gap-2 text-slate-400 hover:text-white text-sm mb-8 transition-colors"
          >
            <ArrowLeft className="h-4 w-4" />
            Retour à la connexion
          </Link>
          <div className="flex items-center justify-center gap-3 mb-4">
            <div className="p-3 rounded-2xl bg-amber-500/10 border border-amber-500/20">
              <GraduationCap className="h-10 w-10 text-amber-400" />
            </div>
          </div>
          <h1 className="text-4xl font-bold text-white tracking-tight">AeroSchool</h1>
          <p className="text-slate-400 mt-2">Questionnaires et évaluations aéronautiques</p>
        </div>

        {/* Liste des formulaires */}
        {loading ? (
          <div className="flex items-center justify-center py-20">
            <Loader2 className="h-8 w-8 text-amber-400 animate-spin" />
          </div>
        ) : forms.length === 0 ? (
          <div className="text-center py-20">
            <FileText className="h-16 w-16 text-slate-600 mx-auto mb-4" />
            <p className="text-slate-400 text-lg">Aucun questionnaire disponible pour le moment</p>
            <p className="text-slate-500 text-sm mt-1">Revenez plus tard</p>
          </div>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2">
            {forms.map((f) => (
              <Link
                key={f.id}
                href={`/aeroschool/${f.id}`}
                className="group block bg-slate-800/60 backdrop-blur-sm border border-slate-700/50 rounded-xl p-6 hover:border-amber-500/50 hover:bg-slate-800/80 transition-all"
              >
                <div className="flex items-start gap-4">
                  <div className="p-2.5 rounded-xl bg-amber-500/10 border border-amber-500/20 group-hover:bg-amber-500/20 transition-colors shrink-0">
                    <FileText className="h-6 w-6 text-amber-400" />
                  </div>
                  <div className="flex-1 min-w-0">
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
                <div className="mt-4 text-right">
                  <span className="inline-flex items-center gap-1 text-sm font-medium text-amber-400 group-hover:text-amber-300 transition-colors">
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
