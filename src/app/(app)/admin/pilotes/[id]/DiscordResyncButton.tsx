'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { RefreshCw, CheckCircle2, XCircle, AlertTriangle } from 'lucide-react';

const STATUS_LABELS: Record<string, string> = {
  active: '✅ Actif',
  pending: '⏳ En attente',
  missing_guild: '❌ Pas sur le serveur',
  missing_role: '⚠️ Rôle manquant',
  temporary_block: '🔴 Bloqué (temporaire)',
  permanent_block: '🔴 Bloqué (permanent)',
};

export default function DiscordResyncButton({ userId, currentStatus }: { userId: string; currentStatus: string }) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<{ status: string; guild_member: boolean; has_required_role: boolean } | null>(null);
  const [error, setError] = useState<string | null>(null);

  const handleResync = async () => {
    setLoading(true);
    setResult(null);
    setError(null);
    try {
      const res = await fetch(`/api/admin/discord/resync/${userId}`, { method: 'POST' });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Erreur');
      setResult(data);
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Erreur');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex flex-col gap-2 shrink-0">
      <button
        type="button"
        onClick={handleResync}
        disabled={loading}
        title="Interroger le bot Discord pour re-vérifier la présence et le rôle"
        className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-lg bg-slate-700 hover:bg-slate-600 text-slate-200 disabled:opacity-50 transition-colors border border-slate-600"
      >
        <RefreshCw className={`h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`} />
        {loading ? 'Re-sync…' : 'Forcer re-sync Discord'}
      </button>

      {result && (
        <div className={`text-xs rounded-lg px-3 py-2 border ${
          result.status === 'active'
            ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-300'
            : 'bg-orange-500/10 border-orange-500/30 text-orange-300'
        }`}>
          <p className="font-semibold">{STATUS_LABELS[result.status] ?? result.status}</p>
          <p className="text-slate-400 mt-0.5">
            {result.guild_member ? '✅ Sur le serveur' : '❌ Pas sur le serveur'} ·{' '}
            {result.has_required_role ? '✅ Rôle OK' : '❌ Rôle manquant'}
          </p>
        </div>
      )}

      {error && (
        <div className="text-xs rounded-lg px-3 py-2 border bg-red-500/10 border-red-500/30 text-red-300">
          <p className="font-semibold flex items-center gap-1"><XCircle className="h-3 w-3" /> Erreur</p>
          <p className="text-slate-400 mt-0.5">{error}</p>
          <p className="text-slate-500 mt-0.5">Vérifiez que le bot Railway est en ligne.</p>
        </div>
      )}

      {/* Avertissement si statut bloquant */}
      {!result && !loading && (currentStatus === 'missing_guild' || currentStatus === 'missing_role') && (
        <p className="text-[10px] text-orange-400/80 flex items-center gap-1">
          <AlertTriangle className="h-3 w-3 shrink-0" />
          Cet utilisateur est bloqué. Cliquez pour re-vérifier via le bot.
        </p>
      )}
    </div>
  );
}
