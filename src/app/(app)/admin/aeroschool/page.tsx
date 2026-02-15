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
}

export default function AdminAeroSchoolPage() {
  const router = useRouter();
  const [forms, setForms] = useState<FormSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [deleting, setDeleting] = useState<string | null>(null);

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
    try {
      const res = await fetch('/api/aeroschool/forms', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: 'Nouveau formulaire',
          description: '',
          delivery_mode: 'review',
          sections: [{
            id: crypto.randomUUID(),
            title: 'Section 1',
            description: '',
            questions: [{
              id: crypto.randomUUID(),
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
      const data = await res.json();
      if (data.id) {
        router.push(`/admin/aeroschool/${data.id}`);
      }
    } catch { /* ignore */ }
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
        </div>
        <button
          onClick={createNew}
          className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-gradient-to-r from-sky-500 to-sky-400 text-white font-bold text-sm shadow-lg shadow-sky-500/30 hover:shadow-sky-500/50 transition-all"
        >
          <Plus className="h-4 w-4" />
          Nouveau formulaire
        </button>
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
                {/* Badge publié/brouillon */}
                <div className="flex items-center justify-between">
                  {f.is_published ? (
                    <span className="flex items-center gap-1 text-xs font-medium text-emerald-400 bg-emerald-500/10 px-2 py-0.5 rounded-full">
                      <Globe className="h-3 w-3" /> Publié
                    </span>
                  ) : (
                    <span className="flex items-center gap-1 text-xs font-medium text-slate-500 bg-slate-700/50 px-2 py-0.5 rounded-full">
                      <EyeOff className="h-3 w-3" /> Brouillon
                    </span>
                  )}
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
                    className="flex-1 text-center py-1.5 rounded-lg text-emerald-400 hover:bg-emerald-500/10 text-sm font-medium transition-colors"
                  >
                    Réponses
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
