'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Plus, RefreshCw } from 'lucide-react';

type Pilote = { id: string; identifiant: string };

export default function CreateCompagnieForm({ pilotes }: { pilotes: Pilote[] }) {
  const router = useRouter();
  const [nom, setNom] = useState('');
  const [pdgId, setPdgId] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSuccess(false);
    setLoading(true);
    try {
      const res = await fetch('/api/compagnies', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          nom: nom.trim(),
          pdg_id: pdgId || null
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || 'Erreur');
      setSuccess(true);
      setNom('');
      setPdgId('');
      setTimeout(() => setSuccess(false), 2000);
      router.refresh();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Erreur');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="card">
      <h2 className="text-lg font-medium text-slate-200 mb-4">Ajouter une compagnie</h2>
      <form onSubmit={handleSubmit} className="flex flex-wrap gap-4 items-end">
        <div className="flex-1 min-w-[200px]">
          <label className="block text-sm font-medium text-slate-400 mb-1">Nom</label>
          <input
            type="text"
            className="input w-full"
            value={nom}
            onChange={(e) => setNom(e.target.value)}
            placeholder="Nom de la compagnie"
            required
          />
        </div>
        <div className="min-w-[180px]">
          <label className="block text-sm font-medium text-slate-400 mb-1">PDG (optionnel)</label>
          <select
            className="input w-full"
            value={pdgId}
            onChange={(e) => setPdgId(e.target.value)}
          >
            <option value="">Aucun</option>
            {pilotes.map((p) => (
              <option key={p.id} value={p.id}>{p.identifiant}</option>
            ))}
          </select>
        </div>
        <button type="submit" className="btn-primary flex items-center gap-2" disabled={loading}>
          {loading ? <RefreshCw className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
          {loading ? 'Ajout…' : 'Ajouter'}
        </button>
      </form>
      {error && <p className="text-red-400 text-sm mt-2">{error}</p>}
      {success && <p className="text-emerald-400 text-sm mt-2">Compagnie ajoutée.</p>}
    </div>
  );
}
