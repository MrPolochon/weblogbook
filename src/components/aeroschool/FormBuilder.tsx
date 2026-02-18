'use client';

import React, { useState, useCallback, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import {
  Plus, Trash2, Save, Eye, EyeOff, ChevronUp, ChevronDown,
  Globe, Webhook, GripVertical, Loader2,
} from 'lucide-react';
import QuestionEditor, { createEmptyQuestion, type Question } from './QuestionEditor';

export interface Section {
  id: string;
  title: string;
  description: string;
  questions: Question[];
}

export interface FormData {
  id?: string;
  title: string;
  description: string;
  delivery_mode: 'webhook' | 'review';
  webhook_url: string;
  webhook_role_id: string;
  is_published: boolean;
  sections: Section[];
}

interface Props {
  initial?: FormData;
}

function createEmptySection(): Section {
  return {
    id: crypto.randomUUID(),
    title: 'Nouvelle section',
    description: '',
    questions: [createEmptyQuestion()],
  };
}

export default function FormBuilder({ initial }: Props) {
  const router = useRouter();
  const [, startTransition] = useTransition();
  const [saving, setSaving] = useState(false);
  const [testingWebhook, setTestingWebhook] = useState(false);
  const [webhookTestResult, setWebhookTestResult] = useState<{ ok: boolean; message: string } | null>(null);
  const [error, setError] = useState<string | null>(null);

  const [form, setForm] = useState<FormData>(() => initial || {
    title: '',
    description: '',
    delivery_mode: 'review',
    webhook_url: '',
    webhook_role_id: '',
    is_published: false,
    sections: [createEmptySection()],
  });

  const updateForm = (partial: Partial<FormData>) => setForm((f) => ({ ...f, ...partial }));

  const updateSection = useCallback((sectionId: string, partial: Partial<Section>) => {
    setForm((f) => ({
      ...f,
      sections: f.sections.map((s) => s.id === sectionId ? { ...s, ...partial } : s),
    }));
  }, []);

  const addSection = () => {
    setForm((f) => ({ ...f, sections: [...f.sections, createEmptySection()] }));
  };

  const removeSection = (sectionId: string) => {
    setForm((f) => ({
      ...f,
      sections: f.sections.filter((s) => s.id !== sectionId),
    }));
  };

  const moveSection = (idx: number, dir: -1 | 1) => {
    setForm((f) => {
      const arr = [...f.sections];
      const target = idx + dir;
      if (target < 0 || target >= arr.length) return f;
      [arr[idx], arr[target]] = [arr[target], arr[idx]];
      return { ...f, sections: arr };
    });
  };

  const updateQuestion = useCallback((sectionId: string, questionId: string, updated: Question) => {
    setForm((f) => ({
      ...f,
      sections: f.sections.map((s) =>
        s.id === sectionId
          ? { ...s, questions: s.questions.map((q) => q.id === questionId ? updated : q) }
          : s
      ),
    }));
  }, []);

  const addQuestion = (sectionId: string) => {
    setForm((f) => ({
      ...f,
      sections: f.sections.map((s) =>
        s.id === sectionId
          ? { ...s, questions: [...s.questions, createEmptyQuestion()] }
          : s
      ),
    }));
  };

  const removeQuestion = (sectionId: string, questionId: string) => {
    setForm((f) => ({
      ...f,
      sections: f.sections.map((s) =>
        s.id === sectionId
          ? { ...s, questions: s.questions.filter((q) => q.id !== questionId) }
          : s
      ),
    }));
  };

  const handleTestWebhook = async () => {
    if (!form.webhook_url.trim()) return;
    setTestingWebhook(true);
    setWebhookTestResult(null);
    try {
      const res = await fetch('/api/aeroschool/test-webhook', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          webhook_url: form.webhook_url.trim(),
          webhook_role_id: form.webhook_role_id?.trim() || null,
        }),
      });
      const data = await res.json();
      if (res.ok) {
        setWebhookTestResult({ ok: true, message: 'Message envoyé dans Discord !' });
      } else {
        setWebhookTestResult({ ok: false, message: data.error || 'Erreur inconnue' });
      }
    } catch {
      setWebhookTestResult({ ok: false, message: 'Erreur réseau' });
    } finally {
      setTestingWebhook(false);
    }
  };

  const handleSave = async () => {
    setError(null);
    if (!form.title.trim()) { setError('Le titre est requis'); return; }
    if (form.delivery_mode === 'webhook' && !form.webhook_url.trim()) { setError('URL webhook requise'); return; }
    if (form.sections.length === 0) { setError('Au moins une section est requise'); return; }

    setSaving(true);
    try {
      const payload = {
        title: form.title.trim(),
        description: form.description.trim(),
        delivery_mode: form.delivery_mode,
        webhook_url: form.delivery_mode === 'webhook' ? form.webhook_url.trim() : null,
        webhook_role_id: form.delivery_mode === 'webhook' && form.webhook_role_id?.trim() ? form.webhook_role_id.trim() : null,
        is_published: form.is_published,
        sections: form.sections,
      };

      const url = form.id ? `/api/aeroschool/forms/${form.id}` : '/api/aeroschool/forms';
      const method = form.id ? 'PUT' : 'POST';

      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Erreur de sauvegarde');

      if (!form.id && data.id) {
        // Rediriger vers l'éditeur du nouveau formulaire
        router.push(`/admin/aeroschool/${data.id}`);
      } else {
        router.push('/admin/aeroschool');
      }
      startTransition(() => router.refresh());
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Erreur');
    } finally {
      setSaving(false);
    }
  };

  // Calcul du barème total
  const totalPoints = form.sections.reduce((acc, s) =>
    acc + s.questions.reduce((qa, q) => qa + (q.is_graded ? q.points : 0), 0), 0);

  return (
    <div className="space-y-6 max-w-4xl mx-auto">
      {/* En-tête du formulaire */}
      <div className="bg-slate-800/60 border border-slate-700/50 rounded-xl p-6 space-y-4 border-t-4 border-t-sky-500">
        <input
          type="text"
          value={form.title}
          onChange={(e) => updateForm({ title: e.target.value })}
          placeholder="Titre du formulaire"
          className="w-full bg-transparent text-2xl font-bold text-slate-100 border-b border-slate-600 focus:border-sky-500 py-2 outline-none transition-colors"
        />
        <input
          type="text"
          value={form.description}
          onChange={(e) => updateForm({ description: e.target.value })}
          placeholder="Description du formulaire"
          className="w-full bg-transparent text-slate-400 border-b border-slate-700 focus:border-slate-500 py-1 outline-none transition-colors"
        />
      </div>

      {/* Paramètres */}
      <div className="bg-slate-800/60 border border-slate-700/50 rounded-xl p-5 space-y-4">
        <h3 className="text-slate-200 font-semibold">Paramètres</h3>
        <div className="grid sm:grid-cols-2 gap-4">
          {/* Mode de livraison */}
          <div>
            <label className="text-slate-400 text-sm mb-2 block">Mode de livraison des réponses</label>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => updateForm({ delivery_mode: 'review' })}
                className={`flex-1 flex items-center justify-center gap-2 py-2.5 rounded-lg border text-sm font-medium transition-all ${
                  form.delivery_mode === 'review'
                    ? 'bg-sky-500/20 border-sky-500/50 text-sky-300'
                    : 'border-slate-600 text-slate-400 hover:border-slate-500'
                }`}
              >
                <Eye className="h-4 w-4" />
                Consultation admin
              </button>
              <button
                type="button"
                onClick={() => updateForm({ delivery_mode: 'webhook' })}
                className={`flex-1 flex items-center justify-center gap-2 py-2.5 rounded-lg border text-sm font-medium transition-all ${
                  form.delivery_mode === 'webhook'
                    ? 'bg-purple-500/20 border-purple-500/50 text-purple-300'
                    : 'border-slate-600 text-slate-400 hover:border-slate-500'
                }`}
              >
                <Webhook className="h-4 w-4" />
                Webhook
              </button>
            </div>
          </div>

          {/* URL Webhook + Rôle à ping */}
          {form.delivery_mode === 'webhook' && (
            <>
              <div>
                <label className="text-slate-400 text-sm mb-2 block">URL du Webhook</label>
                <div className="flex gap-2">
                  <input
                    type="url"
                    value={form.webhook_url}
                    onChange={(e) => { updateForm({ webhook_url: e.target.value }); setWebhookTestResult(null); }}
                    placeholder="https://discord.com/api/webhooks/..."
                    className="flex-1 bg-slate-700/50 border border-slate-600 rounded-lg text-slate-200 text-sm px-3 py-2 outline-none focus:border-purple-500 transition-colors"
                  />
                  <button
                    type="button"
                    onClick={handleTestWebhook}
                    disabled={testingWebhook || !form.webhook_url.trim()}
                    className="px-3 py-2 rounded-lg bg-purple-500/20 border border-purple-500/50 text-purple-300 text-sm font-medium hover:bg-purple-500/30 transition-all disabled:opacity-40 disabled:cursor-not-allowed flex items-center gap-1.5 whitespace-nowrap"
                  >
                    {testingWebhook ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Webhook className="h-3.5 w-3.5" />}
                    Tester
                  </button>
                </div>
                {webhookTestResult && (
                  <p className={`text-xs mt-1.5 ${webhookTestResult.ok ? 'text-emerald-400' : 'text-red-400'}`}>
                    {webhookTestResult.ok ? '✅' : '❌'} {webhookTestResult.message}
                  </p>
                )}
              </div>
              <div>
                <label className="text-slate-400 text-sm mb-2 block">ID du rôle Discord à mentionner <span className="text-slate-500">(optionnel)</span></label>
                <input
                  type="text"
                  value={form.webhook_role_id || ''}
                  onChange={(e) => updateForm({ webhook_role_id: e.target.value.replace(/\D/g, '') })}
                  placeholder="123456789012345678"
                  className="w-full bg-slate-700/50 border border-slate-600 rounded-lg text-slate-200 text-sm px-3 py-2 outline-none focus:border-purple-500 transition-colors font-mono"
                />
                <p className="text-slate-500 text-xs mt-1">Clic droit sur le rôle Discord → Copier l&apos;identifiant du rôle</p>
              </div>
            </>
          )}

          {/* Publié */}
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={() => updateForm({ is_published: !form.is_published })}
              className="flex items-center gap-2"
            >
              {form.is_published ? (
                <Globe className="h-5 w-5 text-emerald-400" />
              ) : (
                <EyeOff className="h-5 w-5 text-slate-500" />
              )}
              <span className={`text-sm font-medium ${form.is_published ? 'text-emerald-400' : 'text-slate-500'}`}>
                {form.is_published ? 'Publié — visible par tous' : 'Brouillon — non visible'}
              </span>
            </button>
          </div>

          {/* Barème total */}
          {totalPoints > 0 && (
            <div className="flex items-center gap-2">
              <span className="text-amber-400 text-sm font-medium">Barème total : {totalPoints} points</span>
            </div>
          )}
        </div>
      </div>

      {/* Sections */}
      {form.sections.map((section, sIdx) => (
        <div key={section.id} className="space-y-3">
          {/* En-tête section */}
          <div className="bg-slate-800/60 border border-slate-700/50 rounded-xl p-5 space-y-3 border-l-4 border-l-emerald-500">
            <div className="flex items-start gap-3">
              <GripVertical className="h-5 w-5 text-slate-500 mt-1 cursor-grab shrink-0" />
              <div className="flex-1 space-y-2">
                <input
                  type="text"
                  value={section.title}
                  onChange={(e) => updateSection(section.id, { title: e.target.value })}
                  placeholder="Titre de la section"
                  className="w-full bg-transparent text-lg font-semibold text-slate-100 border-b border-slate-600 focus:border-emerald-500 py-1 outline-none transition-colors"
                />
                <input
                  type="text"
                  value={section.description}
                  onChange={(e) => updateSection(section.id, { description: e.target.value })}
                  placeholder="Description de la section (optionnel)"
                  className="w-full bg-transparent text-slate-400 text-sm border-b border-slate-700 focus:border-slate-500 py-1 outline-none transition-colors"
                />
              </div>
              <div className="flex items-center gap-1">
                <button type="button" onClick={() => moveSection(sIdx, -1)} disabled={sIdx === 0}
                  className="p-1 text-slate-500 hover:text-slate-300 disabled:opacity-30 transition-colors">
                  <ChevronUp className="h-4 w-4" />
                </button>
                <button type="button" onClick={() => moveSection(sIdx, 1)} disabled={sIdx === form.sections.length - 1}
                  className="p-1 text-slate-500 hover:text-slate-300 disabled:opacity-30 transition-colors">
                  <ChevronDown className="h-4 w-4" />
                </button>
                {form.sections.length > 1 && (
                  <button type="button" onClick={() => removeSection(section.id)}
                    className="p-1 text-slate-500 hover:text-red-400 transition-colors">
                    <Trash2 className="h-4 w-4" />
                  </button>
                )}
              </div>
            </div>
          </div>

          {/* Questions de la section */}
          {section.questions.map((q) => (
            <QuestionEditor
              key={q.id}
              question={q}
              onChange={(updated) => updateQuestion(section.id, q.id, updated)}
              onDelete={() => removeQuestion(section.id, q.id)}
            />
          ))}

          {/* Ajouter une question */}
          <button
            type="button"
            onClick={() => addQuestion(section.id)}
            className="w-full flex items-center justify-center gap-2 py-3 border-2 border-dashed border-slate-700 rounded-xl text-slate-400 hover:text-sky-400 hover:border-sky-500/50 transition-all"
          >
            <Plus className="h-5 w-5" />
            Ajouter une question
          </button>
        </div>
      ))}

      {/* Ajouter une section */}
      <button
        type="button"
        onClick={addSection}
        className="w-full flex items-center justify-center gap-2 py-4 border-2 border-dashed border-slate-600 rounded-xl text-slate-400 hover:text-emerald-400 hover:border-emerald-500/50 transition-all"
      >
        <Plus className="h-5 w-5" />
        Ajouter une section
      </button>

      {/* Erreur */}
      {error && (
        <div className="p-4 rounded-xl bg-red-500/10 border border-red-500/30">
          <p className="text-red-400 text-sm font-medium">{error}</p>
        </div>
      )}

      {/* Actions */}
      <div className="flex items-center justify-end gap-3 sticky bottom-4 bg-slate-900/80 backdrop-blur-sm p-4 rounded-xl border border-slate-700/50">
        <button
          type="button"
          onClick={() => router.push('/admin/aeroschool')}
          className="px-5 py-2.5 rounded-lg border border-slate-600 text-slate-300 hover:bg-slate-700/50 transition-colors text-sm font-medium"
        >
          Annuler
        </button>
        <button
          type="button"
          onClick={handleSave}
          disabled={saving}
          className="px-6 py-2.5 rounded-lg bg-gradient-to-r from-sky-500 to-sky-400 text-white font-bold text-sm shadow-lg shadow-sky-500/30 hover:shadow-sky-500/50 transition-all disabled:opacity-50 flex items-center gap-2"
        >
          {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
          {saving ? 'Sauvegarde…' : 'Sauvegarder'}
        </button>
      </div>
    </div>
  );
}
