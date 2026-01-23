'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';

export default function CreatePiloteForm() {
  const router = useRouter();
  const [identifiant, setIdentifiant] = useState('');
  const [password, setPassword] = useState('');
  const [role, setRole] = useState<'pilote' | 'admin' | 'ifsa'>('pilote');
  const [armee, setArmee] = useState(false);
  const [atc, setAtc] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [lastCreatedRole, setLastCreatedRole] = useState<'pilote' | 'admin' | 'ifsa'>('pilote');

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSuccess(false);
    setLoading(true);
    try {
      const res = await fetch('/api/pilotes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ identifiant: identifiant.trim(), password, role, armee, atc }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || data.error) throw new Error(data.error || 'Erreur');
      setLastCreatedRole(role);
      setSuccess(true);
      setIdentifiant('');
      setPassword('');
      setRole('pilote');
      setArmee(false);
      setAtc(false);
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
      <h2 className="text-lg font-medium text-slate-200 mb-4">Créer un pilote ou un admin</h2>
      <form onSubmit={handleSubmit} className="flex flex-wrap items-end gap-4">
        <div className="min-w-[140px]">
          <label className="label">Identifiant</label>
          <input
            type="text"
            className="input"
            value={identifiant}
            onChange={(e) => setIdentifiant(e.target.value)}
            placeholder="ex: jdupont"
            required
          />
        </div>
        <div className="min-w-[140px]">
          <label className="label">Mot de passe temporaire</label>
          <input
            type="password"
            className="input"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="••••••••"
            required
            minLength={8}
          />
        </div>
        <div className="min-w-[120px]">
          <label className="label">Rôle</label>
          <select
            className="input"
            value={role}
            onChange={(e) => setRole(e.target.value as 'pilote' | 'admin' | 'ifsa')}
          >
            <option value="pilote">Pilote</option>
            <option value="admin">Admin</option>
            <option value="ifsa">IFSA</option>
          </select>
        </div>
        <div className="flex flex-wrap items-center gap-4">
          <label className="flex items-center gap-2 cursor-pointer">
            <input type="checkbox" checked={armee} onChange={(e) => setArmee(e.target.checked)} className="rounded" />
            <span className="text-slate-300">Armée</span>
          </label>
          <label className="flex items-center gap-2 cursor-pointer">
            <input type="checkbox" checked={atc} onChange={(e) => setAtc(e.target.checked)} className="rounded" />
            <span className="text-slate-300">ATC</span>
          </label>
        </div>
        <button type="submit" className="btn-primary" disabled={loading}>
          {loading ? 'Création…' : 'Créer'}
        </button>
      </form>
      {error && <p className="text-red-400 text-sm mt-2">{error}</p>}
      {success && (
        <p className="text-emerald-400 text-sm mt-2">
          {lastCreatedRole === 'admin' ? 'Admin créé.' : lastCreatedRole === 'ifsa' ? 'IFSA créé.' : 'Pilote créé.'}
        </p>
      )}
    </div>
  );
}
