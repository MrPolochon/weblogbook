'use client';

import { useState } from 'react';
import { Send, Loader2, FlaskConical } from 'lucide-react';
import { toast } from 'sonner';

export default function TestDmInactiviteForm() {
  const [identifiant, setIdentifiant] = useState('');
  const [busy, setBusy] = useState(false);
  const [lastResponse, setLastResponse] = useState<unknown>(null);

  async function send(e: React.FormEvent) {
    e.preventDefault();
    if (!identifiant.trim()) return;
    setBusy(true);
    setLastResponse(null);
    try {
      const res = await fetch('/api/admin/inactivity/test-dm', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ identifiant: identifiant.trim() }),
      });
      const data = await res.json().catch(() => ({}));
      setLastResponse(data);
      if (!res.ok || !data.ok) {
        toast.error(data?.error || `Erreur ${res.status}`, { duration: 7000 });
      } else {
        toast.success(`DM TEST envoye a ${data.identifiant} (Discord ${data.sent_to})`, { duration: 6000 });
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Erreur reseau');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="card p-4 space-y-3 border-purple-500/20 bg-gradient-to-br from-purple-950/20 to-slate-900/20">
      <div className="flex items-start gap-3">
        <div className="rounded-lg bg-purple-500/15 p-2 ring-1 ring-purple-500/30">
          <FlaskConical className="h-5 w-5 text-purple-300" />
        </div>
        <div className="flex-1">
          <h3 className="text-sm font-semibold text-slate-200">Tester le DM d&apos;inactivite</h3>
          <p className="text-xs text-slate-400">
            Envoie le DM Discord d&apos;avis de suppression (signe <span className="font-mono text-purple-300">[TEST]</span>) sans rien modifier en BDD.
            L&apos;utilisateur doit avoir lie son Discord sur <span className="font-mono">/compte</span>.
          </p>
        </div>
      </div>

      <form onSubmit={send} className="flex flex-wrap items-center gap-2">
        <input
          type="text"
          value={identifiant}
          onChange={(e) => setIdentifiant(e.target.value)}
          placeholder="identifiant (ex: mrpolochon)"
          className="input flex-1 min-w-[200px]"
          disabled={busy}
          autoComplete="off"
        />
        <button
          type="submit"
          disabled={busy || !identifiant.trim()}
          className="flex items-center gap-2 px-4 py-2 bg-purple-600 hover:bg-purple-500 text-white rounded-lg text-sm font-medium disabled:opacity-50 transition-colors"
        >
          {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
          Envoyer le DM test
        </button>
      </form>

      {lastResponse ? (
        <details className="text-xs">
          <summary className="cursor-pointer text-slate-400 hover:text-slate-300">Voir la reponse JSON brute</summary>
          <pre className="mt-2 p-3 bg-slate-900/60 border border-slate-700/50 rounded text-slate-300 overflow-x-auto">
            {JSON.stringify(lastResponse, null, 2)}
          </pre>
        </details>
      ) : null}
    </div>
  );
}
