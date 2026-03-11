'use client';

import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import {
  Loader2, Plus, Trash2, GripVertical, Save, Copy, Check, CircleDot,
} from 'lucide-react';

interface ModuleQuestion {
  id: string;
  title: string;
  options: string[];
  correct_answers: string[];
}

interface ModuleData {
  id: string;
  title: string;
  questions: ModuleQuestion[];
}

export default function AdminAeroSchoolModuleEditPage() {
  const params = useParams();
  const id = params.id as string;
  const [module, setModule] = useState<ModuleData | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copiedId, setCopiedId] = useState(false);

  useEffect(() => {
    loadModule();
  }, [id]);

  async function loadModule() {
    try {
      const res = await fetch(`/api/aeroschool/modules/${id}`);
      if (!res.ok) throw new Error('Module introuvable');
      const data = await res.json();
      setModule(data);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Erreur');
    } finally {
      setLoading(false);
    }
  }

  async function save() {
    if (!module) return;
    setSaving(true);
    setError(null);
    try {
      const res = await fetch(`/api/aeroschool/modules/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title: module.title, questions: module.questions }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || 'Erreur de sauvegarde');
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Erreur');
    } finally {
      setSaving(false);
    }
  }

  function copyId() {
    navigator.clipboard.writeText(id);
    setCopiedId(true);
    setTimeout(() => setCopiedId(false), 2000);
  }

  function updateQuestion(idx: number, partial: Partial<ModuleQuestion>) {
    if (!module) return;
    const qs = [...module.questions];
    qs[idx] = { ...qs[idx], ...partial };
    setModule({ ...module, questions: qs });
  }

  function updateOption(qIdx: number, optIdx: number, value: string) {
    if (!module) return;
    const qs = [...module.questions];
    const opts = [...qs[qIdx].options];
    opts[optIdx] = value;
    qs[qIdx] = { ...qs[qIdx], options: opts };
    setModule({ ...module, questions: qs });
  }

  function addOption(qIdx: number) {
    if (!module) return;
    const qs = [...module.questions];
    qs[qIdx] = {
      ...qs[qIdx],
      options: [...qs[qIdx].options, `Option ${qs[qIdx].options.length + 1}`],
    };
    setModule({ ...module, questions: qs });
  }

  function removeOption(qIdx: number, optIdx: number) {
    if (!module) return;
    const qs = [...module.questions];
    const opts = qs[qIdx].options.filter((_, i) => i !== optIdx);
    const correct = qs[qIdx].correct_answers.filter((c) => opts.includes(c));
    qs[qIdx] = { ...qs[qIdx], options: opts, correct_answers: correct };
    setModule({ ...module, questions: qs });
  }

  function toggleCorrect(qIdx: number, opt: string) {
    if (!module) return;
    const qs = [...module.questions];
    const correct = qs[qIdx].correct_answers.includes(opt)
      ? qs[qIdx].correct_answers.filter((c) => c !== opt)
      : [...qs[qIdx].correct_answers, opt];
    qs[qIdx] = { ...qs[qIdx], correct_answers: correct };
    setModule({ ...module, questions: qs });
  }

  function addQuestion() {
    if (!module) return;
    const newQ: ModuleQuestion = {
      id: crypto.randomUUID(),
      title: '',
      options: ['Option 1', 'Option 2'],
      correct_answers: [],
    };
    setModule({ ...module, questions: [...module.questions, newQ] });
  }

  function removeQuestion(idx: number) {
    if (!module) return;
    setModule({ ...module, questions: module.questions.filter((_, i) => i !== idx) });
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="h-8 w-8 text-orange-400 animate-spin" />
      </div>
    );
  }

  if (error || !module) {
    return (
      <div className="text-center py-20">
        <p className="text-red-400">{error || 'Module introuvable'}</p>
        <Link href="/admin/aeroschool/modules" className="text-orange-400 hover:text-orange-300 mt-4 inline-block">
          ← Retour aux modules
        </Link>
      </div>
    );
  }

  return (
    <div className="space-y-6 max-w-4xl mx-auto">
      <div className="flex items-center justify-between">
        <Link href="/admin/aeroschool/modules" className="text-slate-400 hover:text-slate-200 transition-colors">
          ← Retour aux modules
        </Link>
      </div>

      <div className="border-2 border-orange-500/30 rounded-xl p-6 bg-orange-500/5 space-y-4">
        <div className="flex items-center gap-3">
          <input
            type="text"
            value={module.title}
            onChange={(e) => setModule({ ...module, title: e.target.value })}
            placeholder="Titre du module"
            className="flex-1 bg-transparent text-xl font-bold text-slate-100 border-b border-slate-600 focus:border-orange-500 py-2 outline-none transition-colors"
          />
          <button
            type="button"
            onClick={copyId}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-mono text-orange-400 hover:bg-orange-500/20 transition-colors"
          >
            {copiedId ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
            {copiedId ? 'Copié' : 'ID'}
          </button>
        </div>
        <p className="text-slate-500 text-sm font-mono">ID : {id}</p>
      </div>

      {module.questions.map((q, qIdx) => (
        <div
          key={q.id}
          className="border border-slate-700/50 rounded-xl p-5 bg-slate-800/40 space-y-4"
        >
          <div className="flex items-start gap-3">
            <GripVertical className="h-5 w-5 text-slate-500 mt-2 shrink-0" />
            <div className="flex-1 space-y-3">
              <input
                type="text"
                value={q.title}
                onChange={(e) => updateQuestion(qIdx, { title: e.target.value })}
                placeholder="Énoncé de la question"
                className="w-full bg-transparent border-b border-slate-600 focus:border-orange-500 text-slate-100 text-lg py-1 outline-none transition-colors"
              />
              <div className="space-y-2">
                {q.options.map((opt, optIdx) => (
                  <div key={optIdx} className="flex items-center gap-2">
                    <CircleDot className="h-4 w-4 text-slate-500 shrink-0" />
                    <input
                      type="text"
                      value={opt}
                      onChange={(e) => updateOption(qIdx, optIdx, e.target.value)}
                      className="flex-1 bg-transparent border-b border-slate-700 focus:border-slate-500 text-slate-200 text-sm py-1 outline-none"
                    />
                    <button
                      type="button"
                      onClick={() => toggleCorrect(qIdx, opt)}
                      className={`text-xs px-2 py-0.5 rounded border transition-colors ${
                        q.correct_answers.includes(opt)
                          ? 'bg-emerald-500/20 border-emerald-500/50 text-emerald-400'
                          : 'border-slate-600 text-slate-500 hover:text-slate-300'
                      }`}
                    >
                      {q.correct_answers.includes(opt) ? 'Correcte' : 'Marquer'}
                    </button>
                    {q.options.length > 2 && (
                      <button
                        type="button"
                        onClick={() => removeOption(qIdx, optIdx)}
                        className="text-slate-500 hover:text-red-400"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    )}
                  </div>
                ))}
                <button
                  type="button"
                  onClick={() => addOption(qIdx)}
                  className="flex items-center gap-1 text-orange-400 hover:text-orange-300 text-sm"
                >
                  <Plus className="h-4 w-4" />
                  Ajouter une option
                </button>
              </div>
            </div>
            <button
              type="button"
              onClick={() => removeQuestion(qIdx)}
              className="text-slate-500 hover:text-red-400 p-1"
            >
              <Trash2 className="h-5 w-5" />
            </button>
          </div>
        </div>
      ))}

      <button
        type="button"
        onClick={addQuestion}
        className="w-full flex items-center justify-center gap-2 py-4 border-2 border-dashed border-orange-500/50 rounded-xl text-orange-400 hover:bg-orange-500/10 transition-all"
      >
        <Plus className="h-5 w-5" />
        Ajouter une question QCM
      </button>

      {error && (
        <div className="p-4 rounded-xl bg-red-500/10 border border-red-500/30">
          <p className="text-red-400 text-sm">{error}</p>
        </div>
      )}

      <div className="flex justify-end gap-3 sticky bottom-4 bg-slate-900/80 backdrop-blur-sm p-4 rounded-xl border border-slate-700/50">
        <button
          type="button"
          onClick={save}
          disabled={saving}
          className="flex items-center gap-2 px-6 py-2.5 rounded-lg bg-orange-500 hover:bg-orange-400 text-white font-bold text-sm shadow-lg transition-all disabled:opacity-50"
        >
          {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
          {saving ? 'Sauvegarde…' : 'Sauvegarder'}
        </button>
      </div>
    </div>
  );
}
