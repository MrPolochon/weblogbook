'use client';

import { useState } from 'react';
import { Shield, Lock, Unlock } from 'lucide-react';

export default function SecuriteClient({ initialLoginAdminOnly }: { initialLoginAdminOnly: boolean }) {
  const [loginAdminOnly, setLoginAdminOnly] = useState(initialLoginAdminOnly);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{ type: 'ok' | 'err'; text: string } | null>(null);

  async function handleToggle() {
    const next = !loginAdminOnly;
    setSaving(true);
    setMessage(null);
    try {
      const res = await fetch('/api/admin/site-config', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ login_admin_only: next }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || 'Erreur');
      setLoginAdminOnly(next);
      setMessage({ type: 'ok', text: next ? 'Connexions réservées aux admins activé.' : 'Toutes les connexions autorisées.' });
    } catch (e) {
      setMessage({ type: 'err', text: e instanceof Error ? e.message : 'Erreur' });
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="card max-w-xl">
      <div className="flex items-start gap-4">
        <div className="p-2.5 rounded-xl bg-sky-500/10">
          <Shield className="h-6 w-6 text-sky-400" />
        </div>
        <div className="flex-1 min-w-0">
          <h2 className="font-medium text-slate-200 flex items-center gap-2">
            {loginAdminOnly ? <Lock className="h-4 w-4 text-amber-400" /> : <Unlock className="h-4 w-4 text-emerald-400" />}
            Connexions réservées aux admins
          </h2>
          <p className="text-slate-400 text-sm mt-1">
            Quand cette option est activée, seuls les comptes administrateurs peuvent se connecter. Les autres utilisateurs verront un message et ne pourront pas accéder au site.
          </p>
          <div className="mt-4 flex items-center gap-4">
            <button
              type="button"
              onClick={handleToggle}
              disabled={saving}
              className={`inline-flex items-center gap-2 px-4 py-2.5 rounded-xl font-medium transition-colors ${
                loginAdminOnly
                  ? 'bg-amber-500/20 text-amber-300 hover:bg-amber-500/30 border border-amber-500/40'
                  : 'bg-slate-700 text-slate-200 hover:bg-slate-600 border border-slate-600'
              } disabled:opacity-50`}
            >
              {saving ? (
                <span className="flex items-center gap-2">
                  <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" /><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" /></svg>
                  Enregistrement…
                </span>
              ) : loginAdminOnly ? (
                <>Désactiver (autoriser tout le monde)</>
              ) : (
                <>Activer (admins uniquement)</>
              )}
            </button>
            <span className={`text-sm font-medium ${loginAdminOnly ? 'text-amber-400' : 'text-slate-500'}`}>
              {loginAdminOnly ? 'Activé' : 'Désactivé'}
            </span>
          </div>
          {message && (
            <p className={`mt-3 text-sm font-medium ${message.type === 'ok' ? 'text-emerald-400' : 'text-red-400'}`}>
              {message.text}
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
