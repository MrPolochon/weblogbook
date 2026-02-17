'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { ChevronUp, ChevronDown, Pencil, Trash2 } from 'lucide-react';

type Grade = { id: string; nom: string; ordre: number };

export default function AdminAtcGrades({ grades }: { grades: Grade[] }) {
  const router = useRouter();
  const [, startTransition] = useTransition();
  const [nom, setNom] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editNom, setEditNom] = useState('');
  const [editOrdre, setEditOrdre] = useState('');
  const [loadingId, setLoadingId] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (!nom.trim()) { setError('Nom requis.'); return; }
    setLoading(true);
    try {
      const res = await fetch('/api/atc/grades', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ nom: nom.trim() }) });
      const d = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(d.error || 'Erreur');
      setNom('');
      startTransition(() => router.refresh());
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Erreur');
    } finally {
      setLoading(false);
    }
  }

  async function handleMove(id: string, move: 'up' | 'down') {
    setError(null);
    setLoadingId(id);
    try {
      const res = await fetch(`/api/atc/grades/${id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ move }) });
      const d = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(d.error || 'Erreur');
      startTransition(() => router.refresh());
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Erreur');
    } finally {
      setLoadingId(null);
    }
  }

  function startEdit(g: Grade) {
    setEditingId(g.id);
    setEditNom(g.nom);
    setEditOrdre(String(g.ordre));
    setError(null);
  }

  function cancelEdit() {
    setEditingId(null);
    setEditNom('');
    setEditOrdre('');
  }

  async function saveEdit() {
    if (!editingId) return;
    const o = parseInt(editOrdre, 10);
    if (!editNom.trim()) { setError('Nom requis.'); return; }
    if (isNaN(o) || o < 1) { setError('Rang ≥ 1.'); return; }
    setError(null);
    setLoadingId(editingId);
    try {
      const res = await fetch(`/api/atc/grades/${editingId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ nom: editNom.trim(), ordre: o }),
      });
      const d = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(d.error || 'Erreur');
      cancelEdit();
      startTransition(() => router.refresh());
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Erreur');
    } finally {
      setLoadingId(null);
    }
  }

  async function handleDelete(g: Grade) {
    if (!confirm(`Supprimer le grade « ${g.nom} » ? Les comptes ATC concernés n’auront plus de grade.`)) return;
    setError(null);
    setLoadingId(g.id);
    try {
      const res = await fetch(`/api/atc/grades/${g.id}`, { method: 'DELETE' });
      const d = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(d.error || 'Erreur');
      startTransition(() => router.refresh());
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Erreur');
    } finally {
      setLoadingId(null);
    }
  }

  const sorted = [...grades].sort((a, b) => a.ordre - b.ordre);

  return (
    <div className="card">
      <h2 className="text-lg font-medium text-slate-800 mb-2">Grades ATC</h2>
      <p className="text-slate-600 text-sm mb-4">Rang 1 = plus bas gradé. Modifier, déplacer (Monter/Descendre) ou supprimer.</p>

      <div className="space-y-2 mb-4">
        {sorted.map((g, i) => (
          <div key={g.id} className="flex flex-wrap items-center gap-2 py-2 border-b border-slate-200 last:border-0">
            {editingId === g.id ? (
              <>
                <input type="text" className="input w-48" value={editNom} onChange={(e) => setEditNom(e.target.value)} placeholder="Nom" />
                <input type="number" className="input w-20" value={editOrdre} onChange={(e) => setEditOrdre(e.target.value)} min={1} placeholder="Rang" />
                <button type="button" onClick={saveEdit} className="btn-primary" disabled={loadingId === g.id}>Enregistrer</button>
                <button type="button" onClick={cancelEdit} className="btn-secondary">Annuler</button>
              </>
            ) : (
              <>
                <span className="font-medium text-slate-700 w-16">Rang {i + 1}</span>
                <span className="text-slate-700 flex-1 min-w-[120px]">{g.nom}</span>
                <div className="flex items-center gap-1">
                  <button type="button" onClick={() => handleMove(g.id, 'up')} disabled={loadingId !== null || i === 0} className="rounded p-1.5 text-slate-500 hover:bg-slate-200 disabled:opacity-50" title="Monter (rang plus bas)"><ChevronUp className="h-4 w-4" /></button>
                  <button type="button" onClick={() => handleMove(g.id, 'down')} disabled={loadingId !== null || i === sorted.length - 1} className="rounded p-1.5 text-slate-500 hover:bg-slate-200 disabled:opacity-50" title="Descendre (rang plus élevé)"><ChevronDown className="h-4 w-4" /></button>
                  <button type="button" onClick={() => startEdit(g)} disabled={loadingId !== null} className="rounded p-1.5 text-slate-500 hover:bg-slate-200 disabled:opacity-50" title="Modifier"><Pencil className="h-4 w-4" /></button>
                  <button type="button" onClick={() => handleDelete(g)} disabled={loadingId !== null} className="rounded p-1.5 text-red-500 hover:bg-red-100 disabled:opacity-50" title="Supprimer"><Trash2 className="h-4 w-4" /></button>
                </div>
              </>
            )}
          </div>
        ))}
        {sorted.length === 0 && <p className="text-slate-500 py-2">Aucun grade.</p>}
      </div>

      <form onSubmit={handleSubmit} className="flex gap-2">
        <input type="text" className="input max-w-xs" value={nom} onChange={(e) => setNom(e.target.value)} placeholder="Nom du nouveau grade" />
        <button type="submit" className="btn-primary" disabled={loading}>{loading ? '…' : 'Ajouter'}</button>
      </form>
      {error && <p className="text-red-600 text-sm mt-2">{error}</p>}
    </div>
  );
}
