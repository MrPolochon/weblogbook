'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';

type Grade = { id: string; nom: string; ordre: number };

export default function AdminAtcGrades({ grades }: { grades: Grade[] }) {
  const router = useRouter();
  const [nom, setNom] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

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
      router.refresh();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Erreur');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="card">
      <h2 className="text-lg font-medium text-slate-800 mb-4">Grades ATC</h2>
      <ul className="text-slate-700 mb-4">
        {grades.map((g) => (
          <li key={g.id}>{g.nom} (ordre {g.ordre})</li>
        ))}
        {grades.length === 0 && <li className="text-slate-500">Aucun grade.</li>}
      </ul>
      <form onSubmit={handleSubmit} className="flex gap-2">
        <input type="text" className="input max-w-xs" value={nom} onChange={(e) => setNom(e.target.value)} placeholder="Nom du grade" />
        <button type="submit" className="btn-primary" disabled={loading}>{loading ? '…' : 'Ajouter'}</button>
      </form>
      {error && <p className="text-red-600 text-sm mt-2">{error}</p>}
    </div>
  );
}
