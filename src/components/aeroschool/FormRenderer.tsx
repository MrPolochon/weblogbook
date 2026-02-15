'use client';

import React, { useState, useCallback } from 'react';
import { useAntiCheat } from '@/hooks/useAntiCheat';
import { ChevronLeft, ChevronRight, Send, Loader2, AlertTriangle, CheckCircle2, XCircle } from 'lucide-react';

interface Question {
  id: string;
  type: 'short_text' | 'paragraph' | 'radio' | 'checkbox' | 'dropdown' | 'linear_scale';
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
  sections: Section[];
}

interface Props {
  form: FormData;
}

export default function FormRenderer({ form }: Props) {
  const [currentSection, setCurrentSection] = useState(0);
  const [answers, setAnswers] = useState<Record<string, string | string[]>>({});
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [submitResult, setSubmitResult] = useState<{ score?: number; maxScore?: number } | null>(null);
  const [submitError, setSubmitError] = useState<string | null>(null);

  const handleCheat = useCallback(async () => {
    // Soumettre automatiquement avec cheating_detected
    try {
      await fetch(`/api/aeroschool/forms/${form.id}/submit`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ answers, cheating_detected: true }),
      });
    } catch { /* ignore */ }
  }, [form.id, answers]);

  const { cheatingDetected } = useAntiCheat({ enabled: true, onCheatDetected: handleCheat });

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
      if (q.required) {
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
        body: JSON.stringify({ answers, cheating_detected: false }),
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
            onClick={() => window.location.href = '/aeroschool'}
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
      <div className="min-h-screen bg-slate-900 flex items-center justify-center p-4">
        <div className="max-w-lg w-full text-center space-y-6">
          <CheckCircle2 className="h-20 w-20 text-emerald-400 mx-auto" />
          <h2 className="text-3xl font-bold text-white">Réponses envoyées !</h2>
          <p className="text-slate-400">
            Merci d&apos;avoir répondu au formulaire <strong className="text-slate-200">&quot;{form.title}&quot;</strong>.
          </p>
          {submitResult?.maxScore !== undefined && submitResult.maxScore > 0 && (
            <div className="bg-slate-800/60 border border-slate-700/50 rounded-xl p-6">
              <p className="text-slate-400 text-sm mb-2">Votre score</p>
              <p className="text-4xl font-bold text-white">
                {submitResult.score} <span className="text-slate-500 text-2xl">/ {submitResult.maxScore}</span>
              </p>
            </div>
          )}
          <button
            onClick={() => window.location.href = '/aeroschool'}
            className="px-6 py-3 bg-sky-500 text-white font-bold rounded-xl hover:bg-sky-400 transition-colors"
          >
            Retour à AeroSchool
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-900 py-8 px-4">
      <div className="max-w-3xl mx-auto space-y-6">
        {/* Barre de progression */}
        <div className="w-full bg-slate-800 rounded-full h-2 overflow-hidden">
          <div
            className="h-full bg-gradient-to-r from-sky-500 to-emerald-500 transition-all duration-500"
            style={{ width: `${progress}%` }}
          />
        </div>

        {/* En-tête du formulaire */}
        {currentSection === 0 && (
          <div className="bg-slate-800/60 border border-slate-700/50 rounded-xl p-6 border-t-4 border-t-sky-500">
            <h1 className="text-2xl font-bold text-white">{form.title}</h1>
            {form.description && (
              <p className="text-slate-400 mt-2">{form.description}</p>
            )}
            <div className="mt-4 flex items-center gap-2 text-amber-400 text-sm bg-amber-500/10 border border-amber-500/20 rounded-lg p-3">
              <AlertTriangle className="h-4 w-4 shrink-0" />
              <span>Ne changez pas d&apos;onglet et ne quittez pas cette page pendant le questionnaire.</span>
            </div>
          </div>
        )}

        {/* Section courante */}
        <div className="space-y-4">
          {form.sections.length > 1 && (
            <div className="bg-slate-800/60 border border-slate-700/50 rounded-xl p-5 border-l-4 border-l-emerald-500">
              <p className="text-slate-400 text-sm">Section {currentSection + 1} / {form.sections.length}</p>
              <h2 className="text-xl font-semibold text-white mt-1">{section.title}</h2>
              {section.description && <p className="text-slate-400 text-sm mt-1">{section.description}</p>}
            </div>
          )}

          {/* Questions */}
          {section.questions.map((q) => (
            <div key={q.id} className="bg-slate-800/60 border border-slate-700/50 rounded-xl p-5 space-y-3">
              <div className="flex items-start gap-1">
                <h3 className="text-slate-100 font-medium">{q.title}</h3>
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
                  className="w-full bg-transparent border-b border-slate-600 focus:border-sky-500 text-slate-200 py-2 outline-none transition-colors"
                />
              )}

              {/* Paragraphe */}
              {q.type === 'paragraph' && (
                <textarea
                  value={(answers[q.id] as string) || ''}
                  onChange={(e) => updateAnswer(q.id, e.target.value)}
                  placeholder="Votre réponse"
                  rows={4}
                  className="w-full bg-slate-700/30 border border-slate-600 focus:border-sky-500 rounded-lg text-slate-200 p-3 outline-none transition-colors resize-y"
                />
              )}

              {/* Choix unique (radio) */}
              {q.type === 'radio' && q.options && (
                <div className="space-y-2">
                  {q.options.map((opt) => (
                    <label key={opt} className="flex items-center gap-3 p-2 rounded-lg hover:bg-slate-700/30 cursor-pointer transition-colors">
                      <input
                        type="radio"
                        name={q.id}
                        checked={(answers[q.id] as string) === opt}
                        onChange={() => updateAnswer(q.id, opt)}
                        className="w-4 h-4 text-sky-500 accent-sky-500"
                      />
                      <span className="text-slate-200">{opt}</span>
                    </label>
                  ))}
                </div>
              )}

              {/* Cases à cocher */}
              {q.type === 'checkbox' && q.options && (
                <div className="space-y-2">
                  {q.options.map((opt) => (
                    <label key={opt} className="flex items-center gap-3 p-2 rounded-lg hover:bg-slate-700/30 cursor-pointer transition-colors">
                      <input
                        type="checkbox"
                        checked={Array.isArray(answers[q.id]) && (answers[q.id] as string[]).includes(opt)}
                        onChange={() => toggleCheckbox(q.id, opt)}
                        className="w-4 h-4 text-sky-500 accent-sky-500 rounded"
                      />
                      <span className="text-slate-200">{opt}</span>
                    </label>
                  ))}
                </div>
              )}

              {/* Dropdown */}
              {q.type === 'dropdown' && q.options && (
                <select
                  value={(answers[q.id] as string) || ''}
                  onChange={(e) => updateAnswer(q.id, e.target.value)}
                  className="w-full bg-slate-700 border border-slate-600 rounded-lg text-slate-200 px-3 py-2.5 outline-none focus:border-sky-500 transition-colors"
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
                        className={`w-10 h-10 rounded-full border text-sm font-medium transition-all ${
                          (answers[q.id] as string) === String(n)
                            ? 'bg-sky-500 border-sky-400 text-white shadow-lg shadow-sky-500/30'
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
          ))}
        </div>

        {/* Erreur soumission */}
        {submitError && (
          <div className="p-4 rounded-xl bg-red-500/10 border border-red-500/30">
            <p className="text-red-400 text-sm font-medium">{submitError}</p>
          </div>
        )}

        {/* Navigation */}
        <div className="flex items-center justify-between">
          <button
            type="button"
            onClick={handlePrev}
            disabled={isFirst}
            className="flex items-center gap-2 px-5 py-2.5 rounded-lg border border-slate-600 text-slate-300 hover:bg-slate-700/50 disabled:opacity-30 disabled:cursor-not-allowed transition-colors text-sm font-medium"
          >
            <ChevronLeft className="h-4 w-4" />
            Précédent
          </button>

          {isLast ? (
            <button
              type="button"
              onClick={handleSubmit}
              disabled={submitting}
              className="flex items-center gap-2 px-6 py-2.5 rounded-lg bg-gradient-to-r from-emerald-500 to-emerald-400 text-white font-bold text-sm shadow-lg shadow-emerald-500/30 hover:shadow-emerald-500/50 transition-all disabled:opacity-50"
            >
              {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
              {submitting ? 'Envoi…' : 'Envoyer'}
            </button>
          ) : (
            <button
              type="button"
              onClick={handleNext}
              className="flex items-center gap-2 px-5 py-2.5 rounded-lg bg-sky-500 text-white font-bold text-sm shadow-lg shadow-sky-500/30 hover:shadow-sky-500/50 transition-all"
            >
              Suivant
              <ChevronRight className="h-4 w-4" />
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
