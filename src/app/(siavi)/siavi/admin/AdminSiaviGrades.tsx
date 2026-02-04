'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Plus, Trash2, ArrowUp, ArrowDown } from 'lucide-react';

type Grade = { id: string; nom: string; ordre: number };

export default function AdminSiaviGrades({ grades }: { grades: Grade[] }) {
  const router = useRouter();
  const [newGrade, setNewGrade] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleAdd(e: React.FormEvent) {
    e.preventDefault();
    if (!newGrade.trim()) return;
    setLoading(true);
    setError(null);

    try {
      const res = await fetch('/api/siavi/grades', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ nom: newGrade.trim(), ordre: (grades.length + 1) * 10 }),
      });
      
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || 'Erreur lors de la création');
      }
      
      setNewGrade('');
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erreur');
    } finally {
      setLoading(false);
    }
  }

  async function handleDelete(id: string, nom: string) {
    if (!confirm(`Supprimer le grade "${nom}" ?`)) return;
    
    try {
      const res = await fetch(`/api/siavi/grades/${id}`, { method: 'DELETE' });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || 'Erreur lors de la suppression');
      }
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erreur');
    }
  }

  async function handleMove(id: string, direction: 'up' | 'down') {
    try {
      const res = await fetch(`/api/siavi/grades/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ direction }),
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || 'Erreur lors du déplacement');
      }
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erreur');
    }
  }

  return (
    <div className="rounded-xl border border-red-200 bg-white/90 p-4">
      <h2 className="text-lg font-medium text-red-800 mb-4">Grades SIAVI</h2>
      
      {error && (
        <div className="mb-4 p-3 rounded-lg bg-red-500/10 border border-red-500/30">
          <p className="text-red-600 text-sm">{error}</p>
        </div>
      )}

      {grades.length === 0 ? (
        <p className="text-slate-600 text-sm mb-4">Aucun grade défini.</p>
      ) : (
        <ul className="space-y-2 mb-4">
          {grades.map((g, idx) => (
            <li key={g.id} className="flex items-center justify-between py-2 px-3 rounded-lg bg-red-50 border border-red-100">
              <span className="font-medium text-slate-800">{g.nom}</span>
              <div className="flex items-center gap-1">
                <button
                  onClick={() => handleMove(g.id, 'up')}
                  disabled={idx === 0}
                  className="p-1.5 text-slate-500 hover:text-slate-700 disabled:opacity-30 disabled:cursor-not-allowed"
                  title="Monter"
                >
                  <ArrowUp className="h-4 w-4" />
                </button>
                <button
                  onClick={() => handleMove(g.id, 'down')}
                  disabled={idx === grades.length - 1}
                  className="p-1.5 text-slate-500 hover:text-slate-700 disabled:opacity-30 disabled:cursor-not-allowed"
                  title="Descendre"
                >
                  <ArrowDown className="h-4 w-4" />
                </button>
                <button
                  onClick={() => handleDelete(g.id, g.nom)}
                  className="p-1.5 text-red-500 hover:text-red-700"
                  title="Supprimer"
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}

      <form onSubmit={handleAdd} className="flex gap-2">
        <input
          type="text"
          value={newGrade}
          onChange={(e) => setNewGrade(e.target.value)}
          placeholder="Nouveau grade..."
          className="flex-1 px-3 py-2 rounded-lg border border-red-200 bg-white text-slate-900 focus:outline-none focus:ring-2 focus:ring-red-500"
        />
        <button
          type="submit"
          disabled={loading || !newGrade.trim()}
          className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-red-600 hover:bg-red-700 text-white font-medium transition-colors disabled:opacity-50"
        >
          <Plus className="h-4 w-4" />
          Ajouter
        </button>
      </form>
    </div>
  );
}
