'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { UserPlus } from 'lucide-react';

type Grade = { id: string; nom: string; ordre: number };

export default function AdminCreateSiaviForm({ grades }: { grades: Grade[] }) {
  const router = useRouter();
  const [identifiant, setIdentifiant] = useState('');
  const [gradeId, setGradeId] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!identifiant.trim()) return;
    
    setLoading(true);
    setError(null);
    setSuccess(null);

    try {
      const res = await fetch('/api/siavi/comptes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          identifiant: identifiant.trim(),
          grade_id: gradeId || null,
        }),
      });
      
      const data = await res.json();
      
      if (!res.ok) {
        throw new Error(data.error || 'Erreur lors de l\'ajout');
      }
      
      setSuccess(`Agent ${identifiant} ajouté avec succès !`);
      setIdentifiant('');
      setGradeId('');
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erreur');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="rounded-xl border border-red-200 bg-white/90 p-4">
      <h2 className="text-lg font-medium text-red-800 mb-4">Ajouter un agent SIAVI</h2>
      
      {error && (
        <div className="mb-4 p-3 rounded-lg bg-red-500/10 border border-red-500/30">
          <p className="text-red-600 text-sm">{error}</p>
        </div>
      )}
      
      {success && (
        <div className="mb-4 p-3 rounded-lg bg-green-500/10 border border-green-500/30">
          <p className="text-green-600 text-sm">{success}</p>
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label className="block text-sm font-medium text-red-700 mb-1">Identifiant du pilote existant</label>
          <input
            type="text"
            value={identifiant}
            onChange={(e) => setIdentifiant(e.target.value)}
            placeholder="Identifiant..."
            className="w-full px-3 py-2 rounded-lg border border-red-200 bg-white text-slate-900 focus:outline-none focus:ring-2 focus:ring-red-500"
            required
          />
          <p className="text-xs text-slate-500 mt-1">Le pilote doit déjà avoir un compte</p>
        </div>
        
        <div>
          <label className="block text-sm font-medium text-red-700 mb-1">Grade (optionnel)</label>
          <select
            value={gradeId}
            onChange={(e) => setGradeId(e.target.value)}
            className="w-full px-3 py-2 rounded-lg border border-red-200 bg-white text-slate-900 focus:outline-none focus:ring-2 focus:ring-red-500"
          >
            <option value="">— Aucun grade —</option>
            {grades.map((g) => (
              <option key={g.id} value={g.id}>{g.nom}</option>
            ))}
          </select>
        </div>

        <button
          type="submit"
          disabled={loading || !identifiant.trim()}
          className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-red-600 hover:bg-red-700 text-white font-medium transition-colors disabled:opacity-50"
        >
          <UserPlus className="h-4 w-4" />
          {loading ? 'Ajout en cours...' : 'Ajouter comme agent SIAVI'}
        </button>
      </form>
    </div>
  );
}
