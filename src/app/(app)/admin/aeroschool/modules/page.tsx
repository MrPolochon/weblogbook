'use client';

import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Plus, FolderOpen, Trash2, Loader2, Copy, Check } from 'lucide-react';

interface ModuleSummary {
  id: string;
  title: string;
  created_at: string;
  updated_at: string;
  question_count: number;
}

export default function AdminAeroSchoolModulesPage() {
  const router = useRouter();
  const [modules, setModules] = useState<ModuleSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [deleting, setDeleting] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);

  useEffect(() => {
    loadModules();
  }, []);

  async function loadModules() {
    try {
      const res = await fetch('/api/aeroschool/modules');
      if (!res.ok) throw new Error();
      const data = await res.json();
      setModules(data);
    } catch {
      setModules([]);
    } finally {
      setLoading(false);
    }
  }

  async function createNew() {
    setCreateError(null);
    setCreating(true);
    try {
      const res = await fetch('/api/aeroschool/modules', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title: 'Nouveau module à questions', questions: [] }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setCreateError(data?.error || `Erreur ${res.status}`);
        return;
      }
      if (data.id) {
        router.push(`/admin/aeroschool/modules/${data.id}`);
        return;
      }
      setCreateError('Réponse serveur invalide.');
    } catch (e) {
      setCreateError(e instanceof Error ? e.message : 'Impossible de créer le module.');
    } finally {
      setCreating(false);
    }
  }

  async function deleteModule(id: string) {
    if (!confirm('Supprimer ce module et toutes ses questions ?')) return;
    setDeleting(id);
    try {
      const res = await fetch(`/api/aeroschool/modules/${id}`, { method: 'DELETE' });
      if (res.ok) setModules((m) => m.filter((x) => x.id !== id));
    } catch { /* ignore */ }
    setDeleting(null);
  }

  function copyId(id: string) {
    navigator.clipboard.writeText(id);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="h-8 w-8 text-amber-400 animate-spin" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Link href="/admin/aeroschool" className="text-slate-400 hover:text-slate-200 transition-colors">
            ← Retour
          </Link>
          <h1 className="text-2xl font-semibold text-slate-100">Modules à questions</h1>
        </div>
        <div className="flex flex-col items-end gap-1">
          {createError && <p className="text-sm text-red-400" role="alert">{createError}</p>}
          <button
            type="button"
            onClick={createNew}
            disabled={creating}
            className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-orange-500 hover:bg-orange-400 text-white font-bold text-sm shadow-lg shadow-orange-500/30 transition-all disabled:opacity-60 disabled:cursor-not-allowed"
          >
            {creating ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
            {creating ? 'Création…' : 'Nouveau module'}
          </button>
        </div>
      </div>

      <p className="text-slate-400 text-sm">
        Les modules stockent des banques de QCM. Utilisez l&apos;ID d&apos;un module dans un formulaire pour poser un tirage aléatoire de N questions.
      </p>

      {modules.length === 0 ? (
        <div className="text-center py-20 border-2 border-dashed border-orange-500/30 rounded-xl bg-orange-500/5">
          <FolderOpen className="h-16 w-16 text-orange-400/60 mx-auto mb-4" />
          <p className="text-slate-400 text-lg">Aucun module créé</p>
          <p className="text-slate-500 text-sm mt-1">Créez un module pour y stocker des QCM</p>
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {modules.map((m) => (
            <div
              key={m.id}
              className="border-2 border-orange-500/30 rounded-xl p-5 bg-orange-500/5 hover:border-orange-500/50 transition-colors flex flex-col gap-3"
            >
              <Link href={`/admin/aeroschool/modules/${m.id}`} className="flex-1">
                <h3 className="font-semibold text-slate-200 hover:text-white transition-colors">{m.title}</h3>
                <p className="text-slate-500 text-sm mt-1">{m.question_count} question{m.question_count > 1 ? 's' : ''}</p>
              </Link>
              <div className="flex items-center gap-2 pt-2 border-t border-slate-700/50">
                <button
                  type="button"
                  onClick={() => copyId(m.id)}
                  className="flex items-center gap-1.5 px-2 py-1 rounded-lg text-xs font-mono text-orange-400 hover:bg-orange-500/20 transition-colors"
                  title="Copier l'ID"
                >
                  {copiedId === m.id ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
                  {copiedId === m.id ? 'Copié' : m.id.slice(0, 8) + '…'}
                </button>
                <Link
                  href={`/admin/aeroschool/modules/${m.id}`}
                  className="flex-1 text-center py-1.5 rounded-lg text-orange-400 hover:bg-orange-500/20 text-sm font-medium transition-colors"
                >
                  Ouvrir
                </Link>
                <button
                  onClick={() => deleteModule(m.id)}
                  disabled={deleting === m.id}
                  className="p-1.5 rounded-lg text-slate-500 hover:text-red-400 hover:bg-red-500/10 transition-colors"
                >
                  {deleting === m.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
