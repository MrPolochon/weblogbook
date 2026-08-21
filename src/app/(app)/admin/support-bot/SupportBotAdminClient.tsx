'use client';

import { useEffect, useState } from 'react';
import { Bot, Save } from 'lucide-react';

type Config = {
  guild_id: string | null;
  panel_channel_id: string | null;
  logs_channel_id: string | null;
  staff_role_id: string | null;
  panel_message_id: string | null;
  category_ids: Record<string, string>;
};

export default function SupportBotAdminClient() {
  const [cfg, setCfg] = useState<Config>({
    guild_id: '',
    panel_channel_id: '',
    logs_channel_id: '',
    staff_role_id: '',
    panel_message_id: null,
    category_ids: {},
  });
  const [msg, setMsg] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [tickets, setTickets] = useState<Array<{ short_id: string; motif: string; closed_at: string | null; transcript: string | null; created_at: string }>>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    fetch('/api/support/config', { credentials: 'include' })
      .then((r) => r.json())
      .then((d) => {
        if (d.config) {
          setCfg({
            guild_id: d.config.guild_id || '',
            panel_channel_id: d.config.panel_channel_id || '',
            logs_channel_id: d.config.logs_channel_id || '',
            staff_role_id: d.config.staff_role_id || '',
            panel_message_id: d.config.panel_message_id,
            category_ids: d.config.category_ids || {},
          });
        }
      })
      .catch(() => setErr('Chargement impossible'));
    fetch('/api/support/tickets', { credentials: 'include' })
      .then((r) => r.json())
      .then((d) => setTickets(d.tickets || []))
      .catch(() => {});
  }, []);

  async function save(provision: boolean) {
    setLoading(true);
    setErr(null);
    setMsg(null);
    try {
      const res = await fetch('/api/support/config', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...cfg, provision }),
      });
      const d = await res.json().catch(() => ({}));
      if (!res.ok) {
        setErr(d.error || 'Erreur');
        return;
      }
      if (d.config) {
        setCfg((c) => ({ ...c, ...d.config, category_ids: d.config.category_ids || c.category_ids }));
      }
      setMsg(provision ? 'Panel + 11 sections Discord créés / mis à jour.' : 'IDs enregistrés.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="card space-y-4 max-w-xl">
      <p className="text-sm text-slate-400">
        Tout se configure ici : serveur, salon du bouton, salon des logs, rôle staff.
        Ensuite <strong className="text-slate-200">Créer panel + sections</strong> (11 catégories Discord).
        Railway n’a besoin que du token + secret — pas des IDs.
        Vercel : <code className="text-xs">SUPPORT_BOT_TOKEN</code>, <code className="text-xs">SUPPORT_BOT_SECRET</code>, <code className="text-xs">GROQ_API_KEY</code>.
        Inactivité : 6 h → relance ×3, puis suppression du salon (transcript conservé). Un message membre/staff remet le compteur à zéro.
      </p>
      {(
        [
          ['guild_id', 'ID du serveur Discord'],
          ['panel_channel_id', 'Salon du panel'],
          ['logs_channel_id', 'Salon des transcripts'],
          ['staff_role_id', 'Rôle staff à ping / perms'],
        ] as const
      ).map(([key, label]) => (
        <div key={key}>
          <label className="label">{label}</label>
          <input
            className="input font-mono text-sm"
            value={(cfg[key] as string) || ''}
            onChange={(e) => setCfg({ ...cfg, [key]: e.target.value.trim() })}
          />
        </div>
      ))}
      {Object.keys(cfg.category_ids || {}).length > 0 && (
        <p className="text-xs text-emerald-400">
          {Object.keys(cfg.category_ids).length} section(s) déjà liées.
        </p>
      )}
      {err && <p className="text-sm text-red-400">{err}</p>}
      {msg && <p className="text-sm text-emerald-400">{msg}</p>}
      <div className="flex gap-2 flex-wrap">
        <button type="button" className="btn-secondary" disabled={loading} onClick={() => save(false)}>
          <Save className="h-4 w-4 inline mr-1" />
          Enregistrer les IDs
        </button>
        <button type="button" className="btn-primary" disabled={loading} onClick={() => save(true)}>
          <Bot className="h-4 w-4 inline mr-1" />
          {loading ? 'Discord…' : 'Créer panel + sections'}
        </button>
      </div>
      {tickets.length > 0 && (
        <div className="space-y-2 pt-4 border-t border-slate-700/50">
          <h3 className="text-sm font-semibold text-slate-200">Derniers tickets (logs site)</h3>
          {tickets.slice(0, 20).map((t) => (
            <details key={t.short_id + t.created_at} className="text-xs text-slate-400">
              <summary className="cursor-pointer text-slate-300">
                {t.short_id} · {t.motif} · {t.closed_at ? 'fermé' : 'ouvert'} · {new Date(t.created_at).toLocaleString('fr-FR')}
              </summary>
              <pre className="mt-2 whitespace-pre-wrap max-h-48 overflow-auto">{t.transcript || 'Pas encore de transcript'}</pre>
            </details>
          ))}
        </div>
      )}
    </div>
  );
}
