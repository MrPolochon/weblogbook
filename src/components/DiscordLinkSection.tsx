'use client';

import { Link2, RefreshCw, ShieldAlert, ShieldCheck, Unlink } from 'lucide-react';
import { useEffect, useMemo, useState, useTransition } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';

type Variant = 'default' | 'atc' | 'siavi';

type DiscordLink = {
  discord_user_id: string;
  discord_username: string;
  discord_avatar: string | null;
  status: 'pending' | 'active' | 'missing_guild' | 'missing_role' | 'temporary_block' | 'permanent_block';
  sanction_type: string | null;
  sanction_reason: string | null;
  sanction_ends_at: string | null;
  last_sync_at: string | null;
};

function getErrorMessage(code: string | null) {
  switch (code) {
    case 'oauth_missing':
      return 'La configuration OAuth Discord n’est pas encore prête côté site.';
    case 'oauth_error':
      return 'La liaison Discord a été annulée ou refusée.';
    case 'oauth_invalid':
      return 'Réponse OAuth Discord invalide.';
    case 'state_mismatch':
      return 'La vérification de sécurité Discord a échoué. Réessayez.';
    case 'token_exchange':
      return 'Impossible de finaliser la liaison Discord.';
    case 'discord_user':
      return 'Impossible de récupérer le compte Discord.';
    case 'already_linked':
      return 'Ce compte Discord est déjà lié à un autre compte du site.';
    case 'server':
      return 'Erreur serveur pendant la liaison Discord.';
    default:
      return null;
  }
}

function getStatusContent(link: DiscordLink | null) {
  if (!link) {
    return {
      tone: 'amber',
      title: 'Compte Discord obligatoire',
      text: 'Aucun compte Discord n’est encore lié. La liaison est requise pour accéder au site.',
    };
  }

  switch (link.status) {
    case 'active':
      return {
        tone: 'green',
        title: 'Compte Discord valide',
        text: `Le compte Discord ${link.discord_username} est lié et autorisé.`,
      };
    case 'temporary_block':
      return {
        tone: 'red',
        title: 'Accès temporairement suspendu',
        text: link.sanction_ends_at
          ? `Votre accès est bloqué jusqu’au ${new Date(link.sanction_ends_at).toLocaleString('fr-FR')}.`
          : 'Une sanction Discord temporaire bloque actuellement l’accès au site.',
      };
    case 'missing_guild':
      return {
        tone: 'amber',
        title: 'Serveur Discord requis manquant',
        text: 'Le compte Discord lié n’est plus présent sur le serveur Discord requis.',
      };
    case 'missing_role':
      return {
        tone: 'amber',
        title: 'Rôle Discord requis manquant',
        text: 'Le compte Discord lié ne possède plus le rôle Discord requis.',
      };
    case 'permanent_block':
      return {
        tone: 'red',
        title: 'Exclusion définitive détectée',
        text: 'Ce compte Discord a été signalé comme exclu définitivement.',
      };
    default:
      return {
        tone: 'amber',
        title: 'Validation Discord en attente',
        text: 'Le compte Discord est lié mais sa validation serveur est encore en attente.',
      };
  }
}

export default function DiscordLinkSection({
  variant = 'default',
  mandatoryFlow = false,
}: {
  variant?: Variant;
  mandatoryFlow?: boolean;
}) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [, startTransition] = useTransition();
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [data, setData] = useState<{ required: boolean; configured: boolean; link: DiscordLink | null } | null>(null);
  const [message, setMessage] = useState<{ type: 'ok' | 'err'; text: string } | null>(null);

  useEffect(() => {
    const err = getErrorMessage(searchParams.get('error'));
    if (err) setMessage({ type: 'err', text: err });
  }, [searchParams]);

  async function load() {
    setLoading(true);
    try {
      const res = await fetch('/api/discord/link', { cache: 'no-store' });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json.error || 'Erreur');
      setData(json);
    } catch (error) {
      setMessage({ type: 'err', text: error instanceof Error ? error.message : 'Erreur' });
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
  }, []);

  const palette = useMemo(() => {
    if (variant === 'siavi') {
      return {
        card: 'rounded-xl border-2 border-red-300 bg-white p-4 shadow-sm',
        title: 'text-red-800',
        text: 'text-slate-700',
        btn: 'px-4 py-2 rounded-lg bg-red-500 hover:bg-red-600 text-white font-bold transition-colors disabled:opacity-50',
        secondary: 'px-4 py-2 rounded-lg border border-slate-300 bg-white text-slate-700 transition-colors hover:bg-slate-50 disabled:opacity-50',
      };
    }
    if (variant === 'atc') {
      return {
        card: 'card',
        title: 'text-slate-800',
        text: 'text-slate-600',
        btn: 'btn-primary',
        secondary: 'rounded-lg border border-slate-300 px-4 py-2 text-slate-700 transition-colors hover:bg-slate-100 disabled:opacity-50',
      };
    }
    return {
      card: 'card',
      title: 'text-slate-100',
      text: 'text-slate-400',
      btn: 'btn-primary',
      secondary: 'rounded-lg border border-slate-600 px-4 py-2 text-slate-300 transition-colors hover:bg-slate-800 disabled:opacity-50',
    };
  }, [variant]);

  async function revalidateLink() {
    setBusy(true);
    setMessage(null);
    try {
      const res = await fetch('/api/discord/link', { method: 'POST' });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json.error || 'Erreur');
      setData((prev) => (prev ? { ...prev, link: json.link ?? prev.link } : prev));
      setMessage({ type: 'ok', text: 'Validation Discord relancée.' });
      startTransition(() => router.refresh());
    } catch (error) {
      setMessage({ type: 'err', text: error instanceof Error ? error.message : 'Erreur' });
    } finally {
      setBusy(false);
    }
  }

  async function unlink() {
    if (!confirm('Supprimer la liaison Discord actuelle ?')) return;
    setBusy(true);
    setMessage(null);
    try {
      const res = await fetch('/api/discord/link', { method: 'DELETE' });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json.error || 'Erreur');
      setMessage({ type: 'ok', text: 'Liaison Discord supprimée.' });
      await load();
      startTransition(() => router.refresh());
    } catch (error) {
      setMessage({ type: 'err', text: error instanceof Error ? error.message : 'Erreur' });
    } finally {
      setBusy(false);
    }
  }

  function startLink() {
    const returnTo = mandatoryFlow ? '/discord-obligatoire' : window.location.pathname;
    window.location.href = `/api/discord/link/start?returnTo=${encodeURIComponent(returnTo)}`;
  }

  const status = getStatusContent(data?.link ?? null);
  const toneClass =
    status.tone === 'green'
      ? variant === 'default'
        ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-300'
        : 'border-emerald-200 bg-emerald-50 text-emerald-700'
      : status.tone === 'red'
        ? variant === 'default'
          ? 'border-red-500/30 bg-red-500/10 text-red-300'
          : 'border-red-200 bg-red-50 text-red-700'
        : variant === 'default'
          ? 'border-amber-500/30 bg-amber-500/10 text-amber-300'
          : 'border-amber-200 bg-amber-50 text-amber-700';

  return (
    <div className={palette.card}>
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className={`text-lg font-bold ${palette.title}`}>Liaison Discord</h2>
          <p className={`mt-1 text-sm ${palette.text}`}>
            Le compte Discord lié doit être présent sur le serveur officiel et conserver le rôle requis pour garder l’accès au site.
          </p>
        </div>
        {data?.link?.status === 'active' ? (
          <ShieldCheck className="h-5 w-5 text-emerald-500" />
        ) : (
          <ShieldAlert className="h-5 w-5 text-amber-500" />
        )}
      </div>

      {loading ? (
        <p className={`mt-4 text-sm ${palette.text}`}>Chargement du statut Discord…</p>
      ) : (
        <>
          <div className={`mt-4 rounded-xl border p-4 ${toneClass}`}>
            <p className="font-semibold">{status.title}</p>
            <p className="mt-1 text-sm opacity-90">{status.text}</p>
            {data?.link?.sanction_reason && (
              <p className="mt-2 text-xs opacity-80">Motif : {data.link.sanction_reason}</p>
            )}
            {data?.link?.last_sync_at && (
              <p className="mt-2 text-xs opacity-70">Dernière synchro bot : {new Date(data.link.last_sync_at).toLocaleString('fr-FR')}</p>
            )}
          </div>

          {message && (
            <p className={`mt-3 text-sm ${message.type === 'ok' ? (variant === 'default' ? 'text-emerald-400' : 'text-emerald-700') : (variant === 'default' ? 'text-red-400' : 'text-red-700')}`}>
              {message.text}
            </p>
          )}

          {!data?.configured && (
            <p className={`mt-3 text-sm ${variant === 'default' ? 'text-amber-300' : 'text-amber-700'}`}>
              L’OAuth Discord n’est pas encore configuré. Renseigne les variables d’environnement avant d’activer ce flux.
            </p>
          )}

          <div className="mt-4 flex flex-wrap gap-2">
            <button type="button" onClick={startLink} disabled={busy || !data?.configured} className={palette.btn}>
              <Link2 className="mr-2 inline h-4 w-4" />
              {data?.link ? 'Relier un autre Discord' : 'Lier mon Discord'}
            </button>
            <button type="button" onClick={() => void revalidateLink()} disabled={busy || !data?.link} className={palette.secondary}>
              <RefreshCw className="mr-2 inline h-4 w-4" />
              Revérifier
            </button>
            <button type="button" onClick={() => void unlink()} disabled={busy || !data?.link} className={palette.secondary}>
              <Unlink className="mr-2 inline h-4 w-4" />
              Délier
            </button>
          </div>

          {mandatoryFlow && data?.link?.status === 'active' && (
            <button
              type="button"
              onClick={() => {
                startTransition(() => router.replace('/logbook'));
              }}
              className={`${palette.btn} mt-4`}
            >
              Continuer vers le site
            </button>
          )}
        </>
      )}
    </div>
  );
}
