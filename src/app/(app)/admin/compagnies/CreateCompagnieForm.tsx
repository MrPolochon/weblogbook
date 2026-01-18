'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';

export default function CreateCompagnieForm() {
  const router = useRouter();
  const [nom, setNom] = useState('');
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
        body: JSON.stringify({ nom: nom.trim() }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || 'Erreur');
      setSuccess(true);
      setNom('');
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
      <form onSubmit={handleSubmit} className="flex gap-4">
        <input
          type="text"
          className="input flex-1 max-w-xs"
          value={nom}
          onChange={(e) => setNom(e.target.value)}
          placeholder="Nom de la compagnie"
          required
        />
        <button type="submit" className="btn-primary" disabled={loading}>
          {loading ? 'Ajout…' : 'Ajouter'}
        </button>
      </form>
      {error && <p className="text-red-400 text-sm mt-2">{error}</p>}
      {success && <p className="text-emerald-400 text-sm mt-2">Compagnie ajoutée.</p>}
    </div>
  );
}
