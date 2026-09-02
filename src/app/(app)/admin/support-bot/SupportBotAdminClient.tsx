'use client';

import { useEffect, useMemo, useState } from 'react';
import { Bot, Save, Slash } from 'lucide-react';
import { DEFAULT_INSTRUCTOR_MOTIFS, SUPPORT_MOTIFS } from '@/lib/support/motifs';

type Config = {
  guild_id: string | null;
  panel_channel_id: string | null;
  logs_channel_id: string | null;
  staff_role_id: string | null;
  instructor_role_id: string | null;
  instructor_motifs: string[];
  panel_message_id: string | null;
  category_ids: Record<string, string>;
};

type DiscordChannel = {
  id: string;
  name: string;
  type: number;
  parent_id: string | null;
  position: number;
};

type DiscordRole = {
  id: string;
  name: string;
  position: number;
  managed: boolean;
};

const TEXT_TYPES = new Set([0, 5]);

function ChannelSelect({
  label,
  value,
  channels,
  onChange,
  optional,
}: {
  label: string;
  value: string;
  channels: DiscordChannel[];
  onChange: (id: string) => void;
  optional?: boolean;
}) {
  const groups = useMemo(() => {
    const cats = channels.filter((c) => c.type === 4).sort((a, b) => a.position - b.position);
    const texts = channels.filter((c) => TEXT_TYPES.has(c.type));
    const byParent = new Map<string, DiscordChannel[]>();
    const root: DiscordChannel[] = [];
    for (const ch of texts) {
      if (ch.parent_id) {
        const list = byParent.get(ch.parent_id) || [];
        list.push(ch);
        byParent.set(ch.parent_id, list);
      } else {
        root.push(ch);
      }
    }
    for (const list of byParent.values()) list.sort((a, b) => a.position - b.position);
    root.sort((a, b) => a.position - b.position);
    return { cats, byParent, root };
  }, [channels]);

  return (
    <div>
      <label className="label">{label}</label>
      <select className="input" value={value} onChange={(e) => onChange(e.target.value)}>
        <option value="">{optional ? 'Aucun' : 'Choisir un salon…'}</option>
        {groups.root.map((ch) => (
          <option key={ch.id} value={ch.id}>
            #{ch.name}
          </option>
        ))}
        {groups.cats.map((cat) => {
          const children = groups.byParent.get(cat.id) || [];
          if (!children.length) return null;
          return (
            <optgroup key={cat.id} label={cat.name}>
              {children.map((ch) => (
                <option key={ch.id} value={ch.id}>
                  #{ch.name}
                </option>
              ))}
            </optgroup>
          );
        })}
      </select>
    </div>
  );
}

function RoleSelect({
  label,
  value,
  roles,
  onChange,
  optional,
}: {
  label: string;
  value: string;
  roles: DiscordRole[];
  onChange: (id: string) => void;
  optional?: boolean;
}) {
  const human = roles.filter((r) => !r.managed);
  const bots = roles.filter((r) => r.managed);
  return (
    <div>
      <label className="label">{label}</label>
      <select className="input" value={value} onChange={(e) => onChange(e.target.value)}>
        <option value="">{optional ? 'Aucun' : 'Choisir un rôle…'}</option>
        {human.length > 0 && (
          <optgroup label="Rôles">
            {human.map((r) => (
              <option key={r.id} value={r.id}>
                @{r.name}
              </option>
            ))}
          </optgroup>
        )}
        {bots.length > 0 && (
          <optgroup label="Rôles gérés">
            {bots.map((r) => (
              <option key={r.id} value={r.id}>
                @{r.name}
              </option>
            ))}
          </optgroup>
        )}
      </select>
    </div>
  );
}

export default function SupportBotAdminClient() {
  const [cfg, setCfg] = useState<Config>({
    guild_id: '',
    panel_channel_id: '',
    logs_channel_id: '',
    staff_role_id: '',
    instructor_role_id: '',
    instructor_motifs: [...DEFAULT_INSTRUCTOR_MOTIFS],
    panel_message_id: null,
    category_ids: {},
  });
  const [guildName, setGuildName] = useState<string | null>(null);
  const [channels, setChannels] = useState<DiscordChannel[]>([]);
  const [roles, setRoles] = useState<DiscordRole[]>([]);
  const [msg, setMsg] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [tickets, setTickets] = useState<Array<{
    short_id: string;
    motif: string;
    closed_at: string | null;
    transcript: string | null;
    transcript_token?: string | null;
    created_at: string;
  }>>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    fetch('/api/support/config', { credentials: 'include' })
      .then((r) => r.json())
      .then((d) => {
        if (d.config) {
          const motifs = Array.isArray(d.config.instructor_motifs) && d.config.instructor_motifs.length
            ? d.config.instructor_motifs
            : [...DEFAULT_INSTRUCTOR_MOTIFS];
          setCfg({
            guild_id: d.config.guild_id || d.env_guild_id || '',
            panel_channel_id: d.config.panel_channel_id || '',
            logs_channel_id: d.config.logs_channel_id || '',
            staff_role_id: d.config.staff_role_id || '',
            instructor_role_id: d.config.instructor_role_id || '',
            instructor_motifs: motifs,
            panel_message_id: d.config.panel_message_id,
            category_ids: d.config.category_ids || {},
          });
        }
      })
      .catch(() => setErr('Chargement impossible'));
    fetch('/api/support/discord-options', { credentials: 'include' })
      .then(async (r) => {
        const d = await r.json().catch(() => ({}));
        if (!r.ok) {
          setErr(d.error || 'Impossible de lister les salons / rôles Discord.');
          return;
        }
        setGuildName(d.guild?.name || null);
        setChannels(d.channels || []);
        setRoles(d.roles || []);
      })
      .catch(() => setErr('Impossible de lister Discord.'));
    fetch('/api/support/tickets', { credentials: 'include' })
      .then((r) => r.json())
      .then((d) => setTickets(d.tickets || []))
      .catch(() => {});
  }, []);

  function toggleMotif(id: string) {
    setCfg((c) => {
      const has = c.instructor_motifs.includes(id);
      return {
        ...c,
        instructor_motifs: has
          ? c.instructor_motifs.filter((m) => m !== id)
          : [...c.instructor_motifs, id],
      };
    });
  }

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
        setCfg((c) => ({
          ...c,
          ...d.config,
          instructor_motifs: Array.isArray(d.config.instructor_motifs)
            ? d.config.instructor_motifs
            : c.instructor_motifs,
          category_ids: d.config.category_ids || c.category_ids,
        }));
      }
      setMsg(provision ? 'Panel + 11 sections Discord créés / mis à jour.' : 'Configuration enregistrée.');
    } finally {
      setLoading(false);
    }
  }

  async function repairSlash() {
    setLoading(true);
    setErr(null);
    setMsg(null);
    try {
      const res = await fetch('/api/support/config', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ repair_slash: true }),
      });
      const d = await res.json().catch(() => ({}));
      if (!res.ok) {
        setErr(d.error || 'Erreur');
        return;
      }
      setMsg(d.message || '/register rouvert pour les membres.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="card space-y-4 max-w-xl">
      <p className="text-sm text-slate-400">
        Le serveur vient de <code className="text-xs">DISCORD_GUILD_ID</code> (Vercel). Choisis les salons et rôles ci-dessous.
        L’instructeur a accès et est pingé seulement sur les motifs cochés (CAT, instruction…).
      </p>
      <div className="text-xs text-slate-400 bg-slate-900/50 border border-slate-700/60 rounded-md px-3 py-2 space-y-1">
        <p className="text-slate-300 font-medium">Inactivité d’un ticket (délais comptés sur le dernier message humain)</p>
        <ul className="list-disc list-inside space-y-0.5">
          <li><strong className="text-slate-300">3 h</strong> sans réponse : le bot ping l’auteur du ticket.</li>
          <li><strong className="text-slate-300">24 h</strong> : second rappel, avec l’échéance de 72 h.</li>
          <li>
            <strong className="text-slate-300">72 h</strong> : si personne n’a jamais répondu après l’accueil, le
            ticket est fermé et le salon supprimé (transcript conservé). Si le membre avait engagé la discussion,
            le ticket passe en 🔴 et le staff est appelé pour terminer la demande.
          </li>
          <li>Après cette remise au staff, fermeture seulement si rien ne bouge pendant 72 h de plus.</li>
        </ul>
        <p>Les messages du bot ne remettent jamais le compteur à zéro ; un message du membre ou d’un staff, si.</p>
      </div>
      <p className="text-xs text-amber-200/90 bg-amber-950/40 border border-amber-800/50 rounded-md px-3 py-2">
        <strong className="text-amber-100">/register invisible pour les membres ?</strong> Dans un ticket, Discord
        masque les slash commands si le salon n’a pas « Utiliser les commandes d’application ». Le bouton ci-dessous
        recollera ce droit sur tous les tickets ouverts. Pour <strong>ATC ROBOT</strong> (bot ATIS), ouvre aussi
        Paramètres du serveur → Intégrations → ATC ROBOT → commande /register → autoriser @everyone (sinon elle
        reste admin-only).
      </p>
      <p className="text-xs text-slate-400 bg-slate-900/50 border border-slate-700/60 rounded-md px-3 py-2">
        URL d’interactions Discord (avec www)&nbsp;:{' '}
        <code className="text-[11px] break-all">https://www.mixouairlinesptfsweblogbook.com/api/support/discord/interactions</code>
        . Public Key hex → <code className="text-[11px]">DISCORD_PUBLIC_KEY</code> sur Vercel.
      </p>
      <div>
        <label className="label">Serveur Discord</label>
        <p className="input bg-slate-900/50 text-slate-200 cursor-default">
          {guildName || cfg.guild_id || 'DISCORD_GUILD_ID non lu'}
        </p>
      </div>
      <ChannelSelect
        label="Salon du panel"
        value={cfg.panel_channel_id || ''}
        channels={channels}
        onChange={(id) => setCfg({ ...cfg, panel_channel_id: id })}
      />
      <ChannelSelect
        label="Salon des transcripts"
        value={cfg.logs_channel_id || ''}
        channels={channels}
        onChange={(id) => setCfg({ ...cfg, logs_channel_id: id })}
        optional
      />
      <RoleSelect
        label="Rôle staff"
        value={cfg.staff_role_id || ''}
        roles={roles}
        onChange={(id) => setCfg({ ...cfg, staff_role_id: id })}
      />
      <RoleSelect
        label="Rôle instructeur (optionnel)"
        value={cfg.instructor_role_id || ''}
        roles={roles}
        onChange={(id) => setCfg({ ...cfg, instructor_role_id: id })}
        optional
      />
      {cfg.instructor_role_id ? (
        <div>
          <label className="label">Motifs qui appellent l’instructeur</label>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5 mt-1">
            {SUPPORT_MOTIFS.map((m) => (
              <label key={m.id} className="flex items-center gap-2 text-sm text-slate-300 cursor-pointer">
                <input
                  type="checkbox"
                  className="rounded"
                  checked={cfg.instructor_motifs.includes(m.id)}
                  onChange={() => toggleMotif(m.id)}
                />
                {m.label}
              </label>
            ))}
          </div>
        </div>
      ) : null}
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
          Enregistrer
        </button>
        <button type="button" className="btn-primary" disabled={loading} onClick={() => save(true)}>
          <Bot className="h-4 w-4 inline mr-1" />
          {loading ? 'Discord…' : 'Créer panel + sections'}
        </button>
        <button type="button" className="btn-secondary" disabled={loading} onClick={() => repairSlash()}>
          <Slash className="h-4 w-4 inline mr-1" />
          Réparer /register (tickets)
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
              {t.transcript_token ? (
                <a
                  href={`/support/transcript/${t.transcript_token}`}
                  target="_blank"
                  rel="noreferrer"
                  className="mt-2 inline-block text-sky-400 hover:underline"
                >
                  Ouvrir la conversation
                </a>
              ) : null}
              <pre className="mt-2 whitespace-pre-wrap max-h-48 overflow-auto">{t.transcript || 'Pas encore de transcript'}</pre>
            </details>
          ))}
        </div>
      )}
    </div>
  );
}
