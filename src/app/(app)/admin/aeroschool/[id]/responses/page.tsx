'use client';

import React, { useEffect, useState, useCallback } from 'react';
import { useParams, useRouter } from 'next/navigation';
import {
  ArrowLeft, Loader2, Trash2, AlertTriangle, CheckCircle2, XCircle, ChevronDown, ChevronUp,
} from 'lucide-react';

interface Question {
  id: string;
  title: string;
  type: string;
  is_graded?: boolean;
  points?: number;
  correct_answers?: string[];
}

interface Section {
  id: string;
  title: string;
  questions: Question[];
}

interface FormInfo {
  id: string;
  title: string;
  sections: Section[];
}

interface Response {
  id: string;
  form_id: string;
  submitted_at: string;
  answers: Record<string, string | string[]>;
  score: number | null;
  max_score: number | null;
  cheating_detected: boolean;
  status: string;
}

export default function AdminResponsesPage() {
  const params = useParams();
  const router = useRouter();
  const formId = params.id as string;
  const [form, setForm] = useState<FormInfo | null>(null);
  const [responses, setResponses] = useState<Response[]>([]);
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [deleting, setDeleting] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const [formRes, respRes] = await Promise.all([
        fetch(`/api/aeroschool/forms/${formId}`),
        fetch(`/api/aeroschool/forms/${formId}/responses`),
      ]);
      if (formRes.ok) {
        const fd = await formRes.json();
        setForm({ id: fd.id, title: fd.title, sections: fd.sections || [] });
      }
      if (respRes.ok) {
        setResponses(await respRes.json());
      }
    } catch { /* ignore */ }
    setLoading(false);
  }, [formId]);

  useEffect(() => { load(); }, [load]);

  const deleteResponse = async (id: string) => {
    if (!confirm('Marquer comme "examiné" et supprimer définitivement cette réponse ?')) return;
    setDeleting(id);
    try {
      await fetch(`/api/aeroschool/responses/${id}`, { method: 'DELETE' });
      setResponses((r) => r.filter((x) => x.id !== id));
    } catch { /* ignore */ }
    setDeleting(null);
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="h-8 w-8 text-sky-400 animate-spin" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <button onClick={() => router.push('/admin/aeroschool')} className="text-slate-400 hover:text-white transition-colors">
          <ArrowLeft className="h-5 w-5" />
        </button>
        <div>
          <h1 className="text-2xl font-semibold text-slate-100">Réponses</h1>
          <p className="text-slate-400 text-sm">{form?.title || 'Formulaire'}</p>
        </div>
      </div>

      {responses.length === 0 ? (
        <div className="text-center py-20">
          <p className="text-slate-400 text-lg">Aucune réponse pour le moment</p>
        </div>
      ) : (
        <div className="space-y-3">
          {responses.map((resp) => (
            <div
              key={resp.id}
              className={`border rounded-xl overflow-hidden transition-colors ${
                resp.cheating_detected || resp.status === 'trashed'
                  ? 'border-red-500/50 bg-red-500/5'
                  : 'border-slate-700/50 bg-slate-800/60'
              }`}
            >
              {/* En-tête */}
              <div
                className="flex items-center justify-between p-4 cursor-pointer hover:bg-slate-700/20 transition-colors"
                onClick={() => setExpanded(expanded === resp.id ? null : resp.id)}
              >
                <div className="flex items-center gap-3">
                  {resp.cheating_detected ? (
                    <XCircle className="h-5 w-5 text-red-400 shrink-0" />
                  ) : (
                    <CheckCircle2 className="h-5 w-5 text-emerald-400 shrink-0" />
                  )}
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="text-slate-200 font-medium text-sm">
                        {new Date(resp.submitted_at).toLocaleString('fr-FR')}
                      </span>
                      {resp.cheating_detected && (
                        <span className="text-xs font-bold text-red-400 bg-red-500/10 px-2 py-0.5 rounded-full flex items-center gap-1">
                          <AlertTriangle className="h-3 w-3" /> TRICHE
                        </span>
                      )}
                    </div>
                    {resp.max_score !== null && resp.max_score > 0 && (
                      <span className="text-sm text-slate-400">
                        Score : <span className="text-white font-medium">{resp.score ?? 0}</span> / {resp.max_score}
                      </span>
                    )}
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    onClick={(e) => { e.stopPropagation(); deleteResponse(resp.id); }}
                    disabled={deleting === resp.id}
                    className="px-3 py-1.5 rounded-lg border border-slate-600 text-slate-400 hover:text-red-400 hover:border-red-500/50 text-sm font-medium transition-colors flex items-center gap-1.5"
                    title="Questionnaire examiné — suppression définitive"
                  >
                    {deleting === resp.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Trash2 className="h-3.5 w-3.5" />}
                    Examiné
                  </button>
                  {expanded === resp.id ? <ChevronUp className="h-4 w-4 text-slate-500" /> : <ChevronDown className="h-4 w-4 text-slate-500" />}
                </div>
              </div>

              {/* Détail des réponses */}
              {expanded === resp.id && (
                <div className="border-t border-slate-700/50 p-4 space-y-4">
                  {form?.sections.map((section) => (
                    <div key={section.id} className="space-y-3">
                      <h4 className="text-slate-300 font-semibold text-sm border-b border-slate-700/50 pb-1">{section.title}</h4>
                      {section.questions.map((q) => {
                        const answer = resp.answers[q.id];
                        const displayAnswer = Array.isArray(answer) ? answer.join(', ') : (answer || '—');
                        
                        // Vérifier si la réponse est correcte pour les questions notées
                        let isCorrect: boolean | null = null;
                        if (q.is_graded && q.correct_answers && q.correct_answers.length > 0) {
                          if (Array.isArray(answer)) {
                            const correctSet = new Set(q.correct_answers);
                            const answerSet = new Set(answer as string[]);
                            isCorrect = correctSet.size === answerSet.size && Array.from(correctSet).every((a) => answerSet.has(a));
                          } else {
                            isCorrect = q.correct_answers.includes(String(answer || ''));
                          }
                        }

                        return (
                          <div key={q.id} className="bg-slate-700/20 rounded-lg p-3 space-y-1">
                            <div className="flex items-center justify-between">
                              <span className="text-slate-300 text-sm font-medium">{q.title}</span>
                              {q.is_graded && q.points && (
                                <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${
                                  isCorrect === true
                                    ? 'bg-emerald-500/10 text-emerald-400'
                                    : isCorrect === false
                                      ? 'bg-red-500/10 text-red-400'
                                      : 'bg-slate-600/30 text-slate-400'
                                }`}>
                                  {isCorrect ? q.points : 0} / {q.points} pts
                                </span>
                              )}
                            </div>
                            <p className={`text-sm ${
                              isCorrect === false ? 'text-red-300' : isCorrect === true ? 'text-emerald-300' : 'text-slate-400'
                            }`}>
                              {displayAnswer}
                            </p>
                            {isCorrect === false && q.correct_answers && (
                              <p className="text-xs text-emerald-400/70">Réponse attendue : {q.correct_answers.join(', ')}</p>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
