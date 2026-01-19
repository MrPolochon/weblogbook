'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';

type Grade = { id: string; nom: string; ordre: number };

export default function AdminCreateAtcForm({ grades }: { grades: Grade[] }) {
  const router = useRouter();
  const [identifiant, setIdentifiant] = useState('');
  const [password, setPassword] = useState('');
  const [grade_id, setGradeId] = useState('');
  const [aussi_pilote, setAussiPilote] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSuccess(false);
    if (!identifiant.trim() || !password) { setError('Identifiant et mot de passe requis.'); return; }
    if (password.length < 8) { setError('Mot de passe ≥ 8 caractères.'); return; }
    setLoading(true);
    try {
      const res = await fetch('/api/atc/comptes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ identifiant: identifiant.trim(), password, grade_id: grade_id || null, aussi_pilote }),
      });
      const d = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(d.error || 'Erreur');
      setSuccess(true);
      setIdentifiant('');
      setPassword('');
      setGradeId('');
      setAussiPilote(false);
      setTimeout(() => setSuccess(false), 3000);
      router.refresh();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Erreur');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="card">
      <h2 className="text-lg font-medium text-slate-800 mb-4">Créer un compte ATC</h2>
      <form onSubmit={handleSubmit} className="space-y-4 max-w-md">
        <div>
          <label className="label">Identifiant</label>
          <input type="text" className="input" value={identifiant} onChange={(e) => setIdentifiant(e.target.value)} required />
        </div>
        <div>
          <label className="label">Mot de passe</label>
          <input type="password" className="input" value={password} onChange={(e) => setPassword(e.target.value)} required minLength={8} />
        </div>
        <div>
          <label className="label">Grade</label>
          <select className="input" value={grade_id} onChange={(e) => setGradeId(e.target.value)}>
            <option value="">— Aucun —</option>
            {grades.map((g) => (
              <option key={g.id} value={g.id}>{g.nom}</option>
            ))}
          </select>
        </div>
        <label className="flex items-center gap-2 cursor-pointer">
          <input type="checkbox" checked={aussi_pilote} onChange={(e) => setAussiPilote(e.target.checked)} className="rounded" />
          <span className="text-slate-700">Aussi pilote (accès aux deux espaces)</span>
        </label>
        {error && <p className="text-red-600 text-sm">{error}</p>}
        {success && <p className="text-emerald-600 text-sm">Compte ATC créé.</p>}
        <button type="submit" className="btn-primary" disabled={loading}>{loading ? 'Création…' : 'Créer'}</button>
      </form>
    </div>
  );
}
