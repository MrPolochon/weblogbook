'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { AlertCircle, BellRing, CheckCircle2, Loader2, Send, ShieldAlert } from 'lucide-react';
import { toast } from 'sonner';

type Status = 'warned' | 'dm_failed' | null;

type Props = {
  userId: string;
  identifiant: string | null;
  status: Status;
  warnedAt: string | null;
  deleteAfter: string | null;
  errorMsg: string | null;
};

function fmtDate(iso: string | null): string {
  if (!iso) return '—';
  try {
    return new Date(iso).toLocaleDateString('fr-FR', { day: '2-digit', month: 'short', year: 'numeric' });
  } catch {
    return iso;
  }
}

export default function InactivityWarningBadge({ userId, identifiant, status, warnedAt, deleteAfter, errorMsg }: Props) {
  const router = useRouter();
  const [, startTransition] = useTransition();
  const [busy, setBusy] = useState(false);

  async function warn() {
    setBusy(true);
    try {
      const res = await fetch('/api/admin/inactivity/warn', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ user_ids: [userId] }),
      });
      const data = await res.json();
      if (!res.ok) {
        toast.error(data?.error || 'Erreur lors de l\'envoi');
        return;
      }
      const r = data?.results?.[0];
      if (r?.status === 'warned') {
        toast.success(`${identifiant ?? 'Pilote'} averti via DM Discord`);
      } else if (r?.status === 'dm_failed') {
        toast.error(`DM echoue : ${r.error ?? 'inconnu'}`);
      } else {
        toast.info('Aucun avertissement envoye (deja averti ou compte non eligible)');
      }
      startTransition(() => router.refresh());
    } catch {
      toast.error('Erreur reseau');
    } finally {
      setBusy(false);
    }
  }

  if (status === 'warned') {
    return (
      <span
        className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md border border-emerald-500/40 bg-emerald-500/10 text-emerald-300 text-[10px] font-semibold whitespace-nowrap"
        title={`DM envoye le ${fmtDate(warnedAt)} — suppression auto le ${fmtDate(deleteAfter)} si pas de reconnexion`}
      >
        <CheckCircle2 className="h-3 w-3" />
        AVERTI · supp. {fmtDate(deleteAfter)}
      </span>
    );
  }

  if (status === 'dm_failed') {
    return (
      <span
        className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md border border-red-500/50 bg-red-500/15 text-red-300 text-[10px] font-semibold whitespace-nowrap"
        title={`Impossible d'avertir : ${errorMsg ?? 'inconnu'}. Suppression manuelle requise par admin.`}
      >
        <ShieldAlert className="h-3 w-3" />
        DM ECHOUE · supp. manuelle
      </span>
    );
  }

  // Pas encore averti : bouton "Avertir"
  return (
    <button
      type="button"
      onClick={warn}
      disabled={busy}
      className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md border border-amber-500/40 bg-amber-500/10 text-amber-300 hover:bg-amber-500/20 text-[10px] font-semibold whitespace-nowrap disabled:opacity-50 transition-colors"
      title="Envoyer un DM Discord d'avertissement (14j avant suppression auto)"
    >
      {busy ? <Loader2 className="h-3 w-3 animate-spin" /> : <Send className="h-3 w-3" />}
      AVERTIR
    </button>
  );
}

export function WarnAllInactiveButton({ count }: { count: number }) {
  const router = useRouter();
  const [, startTransition] = useTransition();
  const [busy, setBusy] = useState(false);

  async function warnAll() {
    if (!confirm(`Envoyer un DM Discord d'avertissement aux ${count} utilisateurs inactifs (>30j) non encore avertis ?\n\nIls auront 14 jours pour se reconnecter avant suppression automatique.`)) return;
    setBusy(true);
    try {
      const res = await fetch('/api/admin/inactivity/warn', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ all_inactive: true }),
      });
      const data = await res.json();
      if (!res.ok) {
        toast.error(data?.error || 'Erreur lors de l\'envoi');
        return;
      }
      toast.success(`${data.warned} averti(s) — ${data.failed} echec(s) DM`);
      startTransition(() => router.refresh());
    } catch {
      toast.error('Erreur reseau');
    } finally {
      setBusy(false);
    }
  }

  if (count === 0) return null;

  return (
    <button
      type="button"
      onClick={warnAll}
      disabled={busy}
      className="flex items-center gap-2 px-3 py-2 bg-amber-600 hover:bg-amber-500 text-white rounded-lg text-sm font-medium shadow-md shadow-amber-900/30 transition-colors disabled:opacity-50"
    >
      {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <BellRing className="h-4 w-4" />}
      Avertir tous les inactifs ({count})
    </button>
  );
}

export function InactivityLegend() {
  return (
    <div className="rounded-lg border border-slate-700/50 bg-slate-800/30 p-3 text-xs text-slate-300 space-y-1">
      <div className="flex items-center gap-2 font-medium text-slate-200">
        <AlertCircle className="h-4 w-4 text-amber-400" />
        Legende suppression d&apos;inactivite (preserve le stockage)
      </div>
      <ul className="ml-6 space-y-0.5 text-slate-400">
        <li>· <span className="text-amber-300 font-semibold">AVERTIR</span> : non averti, clique pour envoyer un DM Discord</li>
        <li>· <span className="text-emerald-300 font-semibold">AVERTI</span> : DM envoye, suppression auto si pas de reconnexion sous 14j</li>
        <li>· <span className="text-red-300 font-semibold">DM ECHOUE</span> : Discord non lie ou bot HS, supprime le compte manuellement</li>
      </ul>
    </div>
  );
}
