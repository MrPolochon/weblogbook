'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';

export default function CreatePiloteForm() {
  const router = useRouter();
  const [, startTransition] = useTransition();
  const [identifiant, setIdentifiant] = useState('');
  const [password, setPassword] = useState('');
  const [role, setRole] = useState<'pilote' | 'instructeur' | 'admin'>('pilote');
  const [armee, setArmee] = useState(false);
  const [atc, setAtc] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [lastCreatedRole, setLastCreatedRole] = useState<'pilote' | 'instructeur' | 'admin'>('pilote');
  const [superadminStep, setSuperadminStep] = useState<'password' | 'code' | null>(null);
  const [superadminPassword, setSuperadminPassword] = useState('');
  const [superadminCode, setSuperadminCode] = useState('');

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSuccess(false);
    setLoading(true);
    try {
      const body: Record<string, unknown> = { identifiant: identifiant.trim(), password, role, armee, atc };
      if (role === 'admin' && superadminStep === 'code') body.superadmin_code = superadminCode.replace(/\s/g, '');
      const res = await fetch('/api/pilotes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const data = await res.json().catch(() => ({}));
      if (res.status === 403 && data.code === 'SUPERADMIN_REQUIRED') {
        setError(data.error || 'Mot de passe superadmin et code requis.');
        setSuperadminStep('password');
        return;
      }
      if (!res.ok || data.error) throw new Error(data.error || 'Erreur');
      setLastCreatedRole(role);
      setSuccess(true);
      setIdentifiant('');
      setPassword('');
      setRole('pilote');
      setArmee(false);
      setAtc(false);
      setSuperadminStep(null);
      setSuperadminPassword('');
      setSuperadminCode('');
      setTimeout(() => setSuccess(false), 3000);
      startTransition(() => router.refresh());
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Erreur');
    } finally {
      setLoading(false);
    }
  }

  async function handleSendSuperadminCode() {
    if (!superadminPassword.trim()) return;
    setError(null);
    setLoading(true);
    try {
      const res = await fetch('/api/admin/superadmin/request-access', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password: superadminPassword }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || 'Erreur');
      setSuperadminStep('code');
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Erreur');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="card">
      <h2 className="text-lg font-medium text-slate-200 mb-4">Créer un pilote, instructeur ou admin</h2>
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
            onChange={(e) => {
              const v = e.target.value as 'pilote' | 'instructeur' | 'admin';
              setRole(v);
              if (v === 'pilote') setSuperadminStep(null);
            }}
          >
            <option value="pilote">Pilote</option>
            <option value="instructeur">Instructeur</option>
            <option value="admin">Admin</option>
          </select>
        </div>
        <div className="flex flex-wrap items-center gap-4">
          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={role === 'instructeur'}
              onChange={(e) => {
                if (role === 'admin') return;
                setRole(e.target.checked ? 'instructeur' : 'pilote');
              }}
              className="rounded"
              disabled={role === 'admin'}
            />
            <span className={`${role === 'admin' ? 'text-slate-500' : 'text-slate-300'}`}>🎓 Instructeur (Section instruction)</span>
          </label>
          <label className="flex items-center gap-2 cursor-pointer">
            <input type="checkbox" checked={armee} onChange={(e) => setArmee(e.target.checked)} className="rounded" />
            <span className="text-slate-300">Armée</span>
          </label>
          <label className="flex items-center gap-2 cursor-pointer">
            <input type="checkbox" checked={atc} onChange={(e) => setAtc(e.target.checked)} className="rounded" />
            <span className="text-slate-300">ATC</span>
          </label>
        </div>
        {role === 'admin' && (superadminStep === 'password' || superadminStep === 'code') && (
          <div className="w-full p-4 rounded-xl bg-amber-500/10 border border-amber-500/30 space-y-3">
            <p className="text-amber-200 text-sm font-medium">Vérification requise pour créer un administrateur</p>
            {superadminStep === 'password' && (
              <>
                <input
                  type="password"
                  className="input max-w-xs"
                  value={superadminPassword}
                  onChange={(e) => setSuperadminPassword(e.target.value)}
                  placeholder="Mot de passe superadmin"
                  autoComplete="current-password"
                />
                <button type="button" onClick={handleSendSuperadminCode} disabled={loading} className="btn-secondary text-sm">
                  {loading ? 'Envoi…' : 'Envoyer le code par email'}
                </button>
              </>
            )}
            {superadminStep === 'code' && (
              <input
                type="text"
                inputMode="numeric"
                maxLength={6}
                className="input max-w-[8rem] text-center font-mono text-lg tracking-widest"
                value={superadminCode}
                onChange={(e) => setSuperadminCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                placeholder="Code à 6 chiffres"
              />
            )}
          </div>
        )}
        <button type="submit" className="btn-primary" disabled={loading}>
          {loading ? 'Création…' : 'Créer'}
        </button>
      </form>
      {error && <p className="text-red-400 text-sm mt-2">{error}</p>}
      {success && <p className="text-emerald-400 text-sm mt-2">{lastCreatedRole === 'admin' ? 'Admin créé.' : lastCreatedRole === 'instructeur' ? 'Instructeur créé.' : 'Pilote créé.'}</p>}
    </div>
  );
}
