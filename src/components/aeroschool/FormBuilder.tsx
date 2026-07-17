'use client';

import React, { useState, useCallback, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import {
  Plus, Trash2, Save, Eye, EyeOff, ChevronUp, ChevronDown,
  Globe, Webhook, GripVertical, Loader2, Clock, ShieldCheck, ShieldOff, FolderOpen, Lock,
} from 'lucide-react';
import QuestionEditor, { createEmptyQuestion, type Question } from './QuestionEditor';

function createQuestionModuleBlock(): Question {
  return {
    id: crypto.randomUUID(),
    type: 'question_module',
    title: '',
    description: '',
    required: false,
    options: [],
    is_graded: true,
    points: 0,
    correct_answers: [],
    module_id: '',
    module_count: 10,
  };
}

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
  /** Temps limite en minutes (null = pas de limite) */
  time_limit_minutes: number | null;
  /** Détection de triche activée (changement d'onglet, extensions IA, etc.) */
  antitriche_enabled: boolean;
  /** Accès réservé aux utilisateurs connectés */
  requires_auth: boolean;
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

function SettingSwitch({
  id,
  icon,
  title,
  description,
  checked,
  onChange,
  activeClass,
  switchActiveClass = 'bg-emerald-500 border-emerald-400',
}: {
  id: string;
  icon: React.ReactNode;
  title: string;
  description: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
  activeClass: string;
  switchActiveClass?: string;
}) {
  return (
    <div
      className={`rounded-xl border-2 p-4 transition-all ${
        checked
          ? `${activeClass} shadow-sm`
          : 'border-slate-600/80 bg-slate-800/40'
      }`}
    >
      <label htmlFor={id} className="flex items-start gap-4 cursor-pointer select-none">
        <div className={`mt-0.5 shrink-0 ${checked ? '' : 'opacity-70'}`}>{icon}</div>
        <div className="flex-1 min-w-0 pr-2">
          <span className="text-base font-semibold text-slate-100 block">{title}</span>
          <span className="text-sm text-slate-400 block mt-1 leading-snug">{description}</span>
        </div>
        <button
          id={id}
          type="button"
          role="switch"
          aria-checked={checked}
          onClick={(e) => {
            e.preventDefault();
            onChange(!checked);
          }}
          className={`relative shrink-0 w-14 h-8 rounded-full border-2 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-sky-400 focus-visible:ring-offset-2 focus-visible:ring-offset-slate-900 ${
            checked ? switchActiveClass : 'bg-slate-700 border-slate-500'
          }`}
        >
          <span
            className={`absolute top-0.5 left-0.5 w-6 h-6 rounded-full bg-white shadow transition-transform ${
              checked ? 'translate-x-6' : 'translate-x-0'
            }`}
          />
          <span className="sr-only">{title}</span>
        </button>
      </label>
    </div>
  );
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
    time_limit_minutes: null,
    antitriche_enabled: true,
    requires_auth: false,
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
        time_limit_minutes: form.time_limit_minutes ?? null,
        antitriche_enabled: form.antitriche_enabled,
        requires_auth: form.requires_auth,
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
      if (!res.ok) {
        const msg = data.error || 'Erreur de sauvegarde';
        if (/requires_auth|column.*does not exist/i.test(msg)) {
          throw new Error(
            'Impossible d\'enregistrer « Connexion requise » : exécutez la migration SQL supabase/aeroschool_auth_and_cheat.sql dans Supabase, puis réessayez.'
          );
        }
        throw new Error(msg);
      }

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

  // Calcul du barème total (questions notées + modules à questions : 1 pt par question tirée)
  const totalPoints = form.sections.reduce((acc, s) =>
    acc + s.questions.reduce((qa, q) => {
      if (q.type === 'question_module') return qa + Math.max(1, q.module_count ?? 10);
      return qa + (q.is_graded ? q.points : 0);
    }, 0), 0);

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
      <div className="bg-slate-800/60 border border-slate-700/50 rounded-xl p-5 space-y-6">
        <h3 className="text-slate-200 font-semibold text-lg">Paramètres</h3>

        {/* Visibilité et accès — en premier, bien visible */}
        <div className="space-y-3">
          <div>
            <h4 className="text-slate-300 font-medium text-sm uppercase tracking-wide">Visibilité et accès</h4>
            <p className="text-slate-500 text-xs mt-1">
              Contrôlez si le formulaire apparaît dans la liste publique et qui peut le passer.
            </p>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <SettingSwitch
              id="is-published"
              icon={
                form.is_published ? (
                  <Globe className="h-6 w-6 text-emerald-400" />
                ) : (
                  <EyeOff className="h-6 w-6 text-slate-400" />
                )
              }
              title={form.is_published ? 'Publié' : 'Brouillon'}
              description={
                form.is_published
                  ? 'Visible dans la liste AeroSchool pour les candidats.'
                  : 'Masqué du public — seuls les admins le voient.'
              }
              checked={form.is_published}
              onChange={(checked) => updateForm({ is_published: checked })}
              activeClass="border-emerald-500/60 bg-emerald-500/10"
            />
            <SettingSwitch
              id="requires-auth"
              icon={
                form.requires_auth ? (
                  <Lock className="h-6 w-6 text-sky-400" />
                ) : (
                  <Globe className="h-6 w-6 text-slate-400" />
                )
              }
              title={form.requires_auth ? 'Connexion requise' : 'Accès public'}
              description={
                form.requires_auth
                  ? 'Seuls les membres connectés peuvent ouvrir et soumettre le test.'
                  : 'Tout le monde peut passer le test sans compte.'
              }
              checked={form.requires_auth}
              onChange={(checked) => updateForm({ requires_auth: checked })}
              activeClass="border-sky-500/60 bg-sky-500/10"
              switchActiveClass="bg-sky-500 border-sky-400"
            />
          </div>
        </div>

        <div className="border-t border-slate-700/50 pt-5 space-y-4">
          <h4 className="text-slate-300 font-medium text-sm uppercase tracking-wide">Livraison des réponses</h4>
          <div className="grid sm:grid-cols-2 gap-4">
          {/* Mode de livraison */}
          <div className="sm:col-span-2">
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

          {/* Détection de triche */}
          <div className="sm:col-span-2">
            <SettingSwitch
              id="antitriche-enabled"
              icon={
                form.antitriche_enabled ? (
                  <ShieldCheck className="h-6 w-6 text-amber-400" />
                ) : (
                  <ShieldOff className="h-6 w-6 text-slate-400" />
                )
              }
              title={form.antitriche_enabled ? 'Détection de triche activée' : 'Détection de triche désactivée'}
              description={
                form.antitriche_enabled
                  ? 'Surveille les changements d\'onglet et extensions suspectes pendant le test.'
                  : 'Aucune surveillance anti-triche pendant le passage du test.'
              }
              checked={form.antitriche_enabled}
              onChange={(checked) => updateForm({ antitriche_enabled: checked })}
              activeClass="border-amber-500/60 bg-amber-500/10"
              switchActiveClass="bg-amber-500 border-amber-400"
            />
          </div>

          {/* Temps limite (chrono) */}
          <div className="sm:col-span-2 flex flex-wrap items-center gap-3 p-4 rounded-xl border border-slate-600/80 bg-slate-800/40">
            <div className="flex items-center gap-2">
              <Clock className="h-5 w-5 text-slate-400" />
              <span className="text-slate-400 text-sm">Temps limite</span>
            </div>
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={form.time_limit_minutes == null}
                onChange={(e) => updateForm({ time_limit_minutes: e.target.checked ? null : 30 })}
                className="rounded border-slate-600 bg-slate-700/50 text-sky-500 focus:ring-sky-500"
              />
              <span className="text-sm text-slate-400">Pas de temps limite</span>
            </label>
            {form.time_limit_minutes != null && (
              <div className="flex items-center gap-2">
                <input
                  type="number"
                  min={1}
                  max={480}
                  value={form.time_limit_minutes}
                  onChange={(e) => {
                    const v = parseInt(e.target.value, 10);
                    updateForm({ time_limit_minutes: Number.isNaN(v) || v < 1 ? 1 : Math.min(480, v) });
                  }}
                  className="w-20 bg-slate-700/50 border border-slate-600 rounded-lg text-slate-200 text-sm px-2 py-1.5 text-center"
                />
                <span className="text-sm text-slate-400">minutes</span>
              </div>
            )}
          </div>

          {/* Barème total */}
          {totalPoints > 0 && (
            <div className="sm:col-span-2 flex items-center gap-2">
              <span className="text-amber-400 text-sm font-medium">Barème total : {totalPoints} points</span>
            </div>
          )}
          </div>
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

          {/* Ajouter une question ou un module */}
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => addQuestion(section.id)}
              className="flex-1 flex items-center justify-center gap-2 py-3 border-2 border-dashed border-slate-700 rounded-xl text-slate-400 hover:text-sky-400 hover:border-sky-500/50 transition-all"
            >
              <Plus className="h-5 w-5" />
              Ajouter une question
            </button>
            <button
              type="button"
              onClick={() => {
                setForm((f) => ({
                  ...f,
                  sections: f.sections.map((s) =>
                    s.id === section.id ? { ...s, questions: [...s.questions, createQuestionModuleBlock()] } : s
                  ),
                }));
              }}
              className="flex-1 flex items-center justify-center gap-2 py-3 border-2 border-dashed border-orange-500/50 rounded-xl text-orange-400 hover:bg-orange-500/10 transition-all"
            >
              <FolderOpen className="h-5 w-5" />
              Module à questions
            </button>
          </div>
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
