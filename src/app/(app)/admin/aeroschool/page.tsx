'use client';

import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  Plus, GraduationCap, Globe, EyeOff, Webhook, Eye, Trash2, Loader2,
} from 'lucide-react';

interface FormSummary {
  id: string;
  title: string;
  description: string;
  is_published: boolean;
  delivery_mode: 'webhook' | 'review';
  sections?: unknown[];
  sectionCount?: number;
  questionCount?: number;
  created_at: string;
  updated_at?: string;
  webhook_url?: string;
  /** Nombre de réponses à vérifier (triche, trashed, time_expired) */
  pending_review_count?: number;
}

export default function AdminAeroSchoolPage() {
  const router = useRouter();
  const [forms, setForms] = useState<FormSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [deleting, setDeleting] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);

  useEffect(() => {
    loadForms();
  }, []);

  async function loadForms() {
    try {
      // Utiliser la route admin qui retourne tous les formulaires
      const res = await fetch('/api/aeroschool/forms');
      if (!res.ok) throw new Error();
      const data = await res.json();
      setForms(data);
    } catch {
      // Fallback
    } finally {
      setLoading(false);
    }
  }

  async function createNew() {
    setCreateError(null);
    setCreating(true);
    try {
      const res = await fetch('/api/aeroschool/forms', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: 'Nouveau formulaire',
          description: '',
          delivery_mode: 'review',
          sections: [{
            id: typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID() : `sec-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
            title: 'Section 1',
            description: '',
            questions: [{
              id: typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID() : `q-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
              type: 'short_text',
              title: '',
              description: '',
              required: false,
              options: [],
              is_graded: false,
              points: 0,
              correct_answers: [],
            }],
          }],
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setCreateError(data?.error || `Erreur ${res.status}`);
        return;
      }
      if (data.id) {
        router.push(`/admin/aeroschool/${data.id}`);
        return;
      }
      setCreateError('Réponse serveur invalide.');
    } catch (e) {
      setCreateError(e instanceof Error ? e.message : 'Impossible de créer le formulaire.');
    } finally {
      setCreating(false);
    }
  }

  async function deleteForm(id: string) {
    if (!confirm('Supprimer ce formulaire et toutes ses réponses ?')) return;
    setDeleting(id);
    try {
      await fetch(`/api/aeroschool/forms/${id}`, { method: 'DELETE' });
      setForms((f) => f.filter((x) => x.id !== id));
    } catch { /* ignore */ }
    setDeleting(null);
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="h-8 w-8 text-sky-400 animate-spin" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <GraduationCap className="h-7 w-7 text-amber-400" />
          <h1 className="text-2xl font-semibold text-slate-100">AeroSchool — Questionnaires</h1>
          <Link
            href="/admin/aeroschool/modules"
            className="px-3 py-1.5 rounded-lg border border-orange-500/50 text-orange-400 hover:bg-orange-500/10 text-sm font-medium transition-colors"
          >
            Modules à questions
          </Link>
        </div>
        <div className="flex flex-col items-end gap-1">
          {createError && (
            <p className="text-sm text-red-400" role="alert">{createError}</p>
          )}
          <button
            type="button"
            onClick={createNew}
            disabled={creating}
            className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-gradient-to-r from-sky-500 to-sky-400 text-white font-bold text-sm shadow-lg shadow-sky-500/30 hover:shadow-sky-500/50 transition-all disabled:opacity-60 disabled:cursor-not-allowed"
          >
            {creating ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Plus className="h-4 w-4" />
            )}
            {creating ? 'Création…' : 'Nouveau formulaire'}
          </button>
        </div>
      </div>

      {forms.length === 0 ? (
        <div className="text-center py-20">
          <GraduationCap className="h-16 w-16 text-slate-600 mx-auto mb-4" />
          <p className="text-slate-400 text-lg">Aucun formulaire créé</p>
          <p className="text-slate-500 text-sm mt-1">Créez votre premier questionnaire AeroSchool</p>
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {forms.map((f) => {
            const sectionCount = typeof f.sectionCount === 'number' ? f.sectionCount : (Array.isArray(f.sections) ? f.sections.length : 0);
            const questionCount = typeof f.questionCount === 'number' ? f.questionCount : 0;
            return (
              <div
                key={f.id}
                className="card flex flex-col gap-3 hover:border-sky-500/50 transition-colors relative group"
              >
                {/* Badge publié/brouillon + point notification à vérifier */}
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    {f.is_published ? (
                      <span className="flex items-center gap-1 text-xs font-medium text-emerald-400 bg-emerald-500/10 px-2 py-0.5 rounded-full">
                        <Globe className="h-3 w-3" /> Publié
                      </span>
                    ) : (
                      <span className="flex items-center gap-1 text-xs font-medium text-slate-500 bg-slate-700/50 px-2 py-0.5 rounded-full">
                        <EyeOff className="h-3 w-3" /> Brouillon
                      </span>
                    )}
                    {(f.pending_review_count ?? 0) > 0 && (
                      <span
                        className="flex items-center gap-1 text-xs font-bold text-amber-400 bg-amber-500/20 px-2 py-0.5 rounded-full border border-amber-500/40"
                        title={`${f.pending_review_count} réponse(s) à vérifier`}
                      >
                        <span className="w-1.5 h-1.5 rounded-full bg-amber-400 animate-pulse" />
                        {f.pending_review_count}
                      </span>
                    )}
                  </div>
                  <span className="flex items-center gap-1 text-xs text-slate-500">
                    {f.delivery_mode === 'webhook' ? (
                      <><Webhook className="h-3 w-3" /> Webhook</>
                    ) : (
                      <><Eye className="h-3 w-3" /> Review</>
                    )}
                  </span>
                </div>

                <Link href={`/admin/aeroschool/${f.id}`} className="flex-1">
                  <h3 className="font-semibold text-slate-200 hover:text-white transition-colors">{f.title}</h3>
                  {f.description && <p className="text-slate-400 text-sm mt-1 line-clamp-2">{f.description}</p>}
                </Link>

                <div className="flex items-center justify-between text-xs text-slate-500">
                  <span>{sectionCount} section{sectionCount > 1 ? 's' : ''} · {questionCount} question{questionCount > 1 ? 's' : ''}</span>
                  <span>{new Date(f.created_at).toLocaleDateString('fr-FR')}</span>
                </div>

                <div className="flex items-center gap-2 pt-2 border-t border-slate-700/50">
                  <Link
                    href={`/admin/aeroschool/${f.id}`}
                    className="flex-1 text-center py-1.5 rounded-lg text-sky-400 hover:bg-sky-500/10 text-sm font-medium transition-colors"
                  >
                    Éditer
                  </Link>
                  <Link
                    href={`/admin/aeroschool/${f.id}/responses`}
                    className="flex-1 text-center py-1.5 rounded-lg text-emerald-400 hover:bg-emerald-500/10 text-sm font-medium transition-colors relative"
                  >
                    Réponses
                    {(f.pending_review_count ?? 0) > 0 && (
                      <span className="absolute -top-0.5 -right-0.5 min-w-[18px] h-[18px] flex items-center justify-center text-[10px] font-bold text-white bg-amber-500 rounded-full">
                        {f.pending_review_count}
                      </span>
                    )}
                  </Link>
                  <button
                    onClick={() => deleteForm(f.id)}
                    disabled={deleting === f.id}
                    className="p-1.5 rounded-lg text-slate-500 hover:text-red-400 hover:bg-red-500/10 transition-colors"
                  >
                    {deleting === f.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
