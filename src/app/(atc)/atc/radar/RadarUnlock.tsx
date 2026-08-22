'use client';

import { useState } from 'react';
import { Shield, Lock } from 'lucide-react';

export default function RadarUnlock() {
  const [step, setStep] = useState<'password' | 'code'>('password');
  const [password, setPassword] = useState('');
  const [code, setCode] = useState('');
  const [emailMasked, setEmailMasked] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function sendCode(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const res = await fetch('/api/admin/superadmin/request-access', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data.error || 'Mot de passe superadmin incorrect.');
        return;
      }
      setEmailMasked(typeof data.emailMasked === 'string' ? data.emailMasked : null);
      setStep('code');
    } catch {
      setError('Erreur réseau.');
    } finally {
      setLoading(false);
    }
  }

  async function unlock(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const res = await fetch('/api/radar/unlock', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code: code.replace(/\s/g, '') }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data.error || 'Code incorrect.');
        return;
      }
      window.location.reload();
    } catch {
      setError('Erreur réseau.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="max-w-md mx-auto mt-16 card space-y-5">
      <div className="flex items-center gap-3">
        <div className="p-3 rounded-xl bg-emerald-500/15 border border-emerald-400/30">
          <Lock className="h-6 w-6 text-emerald-300" />
        </div>
        <div>
          <h1 className="text-lg font-bold text-slate-100 flex items-center gap-2">
            <Shield className="h-5 w-5 text-emerald-400" />
            Radar ATC verrouillé
          </h1>
          <p className="text-sm text-slate-400 mt-0.5">
            Accès réservé : mot de passe puis code superadmin reçu par email.
          </p>
        </div>
      </div>

      {step === 'password' ? (
        <form onSubmit={sendCode} className="space-y-3">
          <label className="label">Mot de passe superadmin</label>
          <input
            type="password"
            className="input"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoComplete="current-password"
            required
          />
          {error && <p className="text-sm text-red-400">{error}</p>}
          <button type="submit" className="btn-primary w-full" disabled={loading || !password.trim()}>
            {loading ? 'Envoi…' : 'Envoyer le code par email'}
          </button>
        </form>
      ) : (
        <form onSubmit={unlock} className="space-y-3">
          <label className="label">Code superadmin (6 chiffres)</label>
          {emailMasked && <p className="text-xs text-slate-400">Envoyé à {emailMasked}</p>}
          <input
            type="text"
            inputMode="numeric"
            maxLength={6}
            className="input text-center font-mono text-lg tracking-widest"
            value={code}
            onChange={(e) => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
            placeholder="••••••"
            autoComplete="one-time-code"
            required
          />
          {error && <p className="text-sm text-red-400">{error}</p>}
          <button type="submit" className="btn-primary w-full" disabled={loading || code.length !== 6}>
            {loading ? 'Vérification…' : 'Déverrouiller le radar'}
          </button>
          <button
            type="button"
            className="btn-secondary w-full text-sm"
            disabled={loading}
            onClick={() => {
              setStep('password');
              setCode('');
              setError(null);
            }}
          >
            Renvoyer un code
          </button>
        </form>
      )}
    </div>
  );
}
