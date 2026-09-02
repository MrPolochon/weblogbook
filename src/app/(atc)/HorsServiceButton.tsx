'use client';

import { useEffect, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Power, Loader2, AlertTriangle } from 'lucide-react';
import { useAtcTheme } from '@/contexts/AtcThemeContext';

export default function HorsServiceButton() {
  const router = useRouter();
  const { theme } = useAtcTheme();
  const isDark = theme === 'dark';
  const [, startTransition] = useTransition();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirmOpen, setConfirmOpen] = useState(false);

  async function disconnect(force = false) {
    setError(null);
    setLoading(true);
    try {
      const res = await fetch('/api/atc/session', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ force }),
      });
      const data = await res.json().catch(() => ({}));
      if (res.status === 409 && data.code === 'FLIGHTS_HELD') {
        setConfirmOpen(true);
        return;
      }
      if (!res.ok) throw new Error(data.error || 'Erreur');
      setConfirmOpen(false);
      startTransition(() => router.refresh());
    } catch (err: unknown) {
      setConfirmOpen(false);
      setError(err instanceof Error ? err.message : 'Erreur');
    } finally {
      setLoading(false);
    }
  }

  function handleCancel() {
    if (loading) return;
    setConfirmOpen(false);
    setError(null);
  }

  useEffect(() => {
    if (!confirmOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !loading) {
        setConfirmOpen(false);
        setError(null);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [confirmOpen, loading]);

  return (
    <div className="flex items-center gap-2">
      <button
        type="button"
        onClick={() => void disconnect(false)}
        className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-red-950/70 text-red-200 hover:bg-red-900 border border-red-800/70 transition-colors font-bold text-[11px] uppercase tracking-wide"
        disabled={loading}
      >
        {loading && !confirmOpen ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Power className="h-3.5 w-3.5" />}
        {loading && !confirmOpen ? '…' : 'Hors service'}
      </button>
      {error && !confirmOpen && <p className="text-red-400 text-xs">{error}</p>}

      {confirmOpen && (
        <div
          className="fixed inset-0 z-[300] flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm"
          onClick={handleCancel}
          role="presentation"
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="hors-service-confirm-title"
            className={`w-full max-w-md rounded-2xl shadow-2xl p-5 ${
              isDark
                ? 'border border-slate-700 bg-slate-950 text-slate-100'
                : 'border border-slate-200 bg-white text-slate-900'
            }`}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-start gap-3">
              <div className={`mt-0.5 p-2 rounded-lg ${isDark ? 'bg-amber-500/15' : 'bg-amber-100'}`}>
                <AlertTriangle className={`h-5 w-5 ${isDark ? 'text-amber-300' : 'text-amber-600'}`} />
              </div>
              <div className="min-w-0">
                <h2 id="hors-service-confirm-title" className="text-base font-bold">
                  Déconnexion
                </h2>
                <p className={`text-sm mt-1.5 leading-relaxed ${isDark ? 'text-slate-300' : 'text-slate-600'}`}>
                  Vous avez encore des vols sous votre contrôle, voulez-vous vraiment vous déconnecter ?
                </p>
              </div>
            </div>
            <div className="flex justify-end gap-2 mt-5">
              <button
                type="button"
                onClick={handleCancel}
                disabled={loading}
                className={`px-3.5 py-2 rounded-lg text-sm font-semibold disabled:opacity-50 ${
                  isDark
                    ? 'bg-slate-800 hover:bg-slate-700 text-slate-100 border border-slate-700'
                    : 'bg-slate-100 hover:bg-slate-200 text-slate-800'
                }`}
              >
                Non
              </button>
              <button
                type="button"
                onClick={() => void disconnect(true)}
                disabled={loading}
                className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg text-sm font-semibold bg-red-600 hover:bg-red-500 text-white disabled:opacity-50"
              >
                {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                Oui
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
