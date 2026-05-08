'use client';

import { useEffect, useState, useCallback } from 'react';
import {
  CheckCircle2,
  XCircle,
  AlertTriangle,
  RefreshCw,
  PlayCircle,
  Server,
  Volume2,
  MessageCircle,
  Monitor,
  ChevronDown,
  ChevronRight,
  Square,
  ExternalLink,
} from 'lucide-react';

interface CheckResult {
  id: string;
  label: string;
  status: 'ok' | 'warn' | 'fail';
  message: string;
  details?: Record<string, unknown>;
}

interface HealthCheckResponse {
  overall_status: 'ok' | 'warn' | 'fail';
  checks: CheckResult[];
  bot_latency_ms?: number;
  bot_version?: string;
  timestamp: string;
}

interface AtisInstance {
  instance_id: number;
  controlling_user_id: string | null;
  controller: { user_id: string; identifiant: string | null; display_name: string } | null;
  aeroport: string | null;
  position: string | null;
  source: 'site' | 'discord' | null;
  broadcasting: boolean;
  ready: boolean;
  airport: string | null;
  airport_name: string | null;
  voice_channel_name: string | null;
  voice_guild_name: string | null;
  voice_connected: boolean;
  atis_code: string | null;
  bilingual: boolean;
  config: {
    discord_guild_id: string | null;
    discord_guild_name: string | null;
    discord_channel_id: string | null;
    discord_channel_name: string | null;
    configured: boolean;
  };
  is_mine: boolean;
}

interface OverviewResponse {
  instances: AtisInstance[];
  instances_count: number;
  bot: {
    reachable: boolean;
    error?: string | null;
    latency_ms?: number;
    version?: string;
    uptime_seconds?: number;
  };
}

const STATUS_STYLE: Record<CheckResult['status'], { bg: string; border: string; text: string; icon: typeof CheckCircle2 }> = {
  ok: { bg: 'bg-emerald-500/10', border: 'border-emerald-500/30', text: 'text-emerald-300', icon: CheckCircle2 },
  warn: { bg: 'bg-amber-500/10', border: 'border-amber-500/30', text: 'text-amber-300', icon: AlertTriangle },
  fail: { bg: 'bg-red-500/10', border: 'border-red-500/30', text: 'text-red-300', icon: XCircle },
};

export default function AtisBotsClient() {
  const [health, setHealth] = useState<HealthCheckResponse | null>(null);
  const [overview, setOverview] = useState<OverviewResponse | null>(null);
  const [loadingHealth, setLoadingHealth] = useState(false);
  const [loadingOverview, setLoadingOverview] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [stopBusy, setStopBusy] = useState<number | null>(null);

  const runHealthCheck = useCallback(async () => {
    setLoadingHealth(true);
    setError(null);
    try {
      const res = await fetch('/api/atc/atis/health-check', { cache: 'no-store' });
      const data = await res.json();
      if (res.ok) setHealth(data);
      else setError(data.error || `Erreur ${res.status}`);
    } catch {
      setError('Erreur réseau lors du health-check');
    } finally {
      setLoadingHealth(false);
    }
  }, []);

  const fetchOverview = useCallback(async () => {
    setLoadingOverview(true);
    try {
      const res = await fetch('/api/atc/atis/overview', { cache: 'no-store' });
      const data = await res.json();
      if (res.ok) setOverview(data);
    } catch {
      /* ignore — health-check montrera l'erreur */
    } finally {
      setLoadingOverview(false);
    }
  }, []);

  useEffect(() => {
    runHealthCheck();
    fetchOverview();
  }, [runHealthCheck, fetchOverview]);

  const toggleExpand = (id: string) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const handleStopInstance = async (instanceId: number) => {
    if (!confirm(`Forcer l'arrêt du Bot ${instanceId} ?`)) return;
    setStopBusy(instanceId);
    try {
      const res = await fetch('/api/atc/atis/stop', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ instance_id: instanceId }),
      });
      if (res.ok) {
        await fetchOverview();
        await runHealthCheck();
      } else {
        const data = await res.json();
        setError(data.error || 'Erreur arrêt');
      }
    } finally {
      setStopBusy(null);
    }
  };

  const overall = health?.overall_status;
  const overallStyle = overall ? STATUS_STYLE[overall] : null;

  return (
    <div className="space-y-6">
      {/* Card globale */}
      <div className="rounded-xl border border-slate-800 bg-slate-950/50 p-5">
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div className="flex items-center gap-3">
            {overallStyle ? (
              <div className={`p-2 rounded-lg ${overallStyle.bg} ${overallStyle.border} border`}>
                <overallStyle.icon className={`h-6 w-6 ${overallStyle.text}`} />
              </div>
            ) : (
              <div className="p-2 rounded-lg bg-slate-800 border border-slate-700">
                <RefreshCw className="h-6 w-6 text-slate-400 animate-spin" />
              </div>
            )}
            <div>
              <h2 className="text-lg font-semibold text-slate-100">
                {overall === 'ok' && 'Tout est opérationnel ✓'}
                {overall === 'warn' && 'Configuration incomplète'}
                {overall === 'fail' && 'Problèmes détectés'}
                {!overall && 'Diagnostic en cours...'}
              </h2>
              <p className="text-sm text-slate-400">
                {health?.bot_version && `Bot v${health.bot_version} · `}
                {health?.bot_latency_ms != null && `${health.bot_latency_ms}ms de latence · `}
                {health?.timestamp && `vérifié à ${new Date(health.timestamp).toLocaleTimeString('fr-FR')}`}
              </p>
            </div>
          </div>
          <button
            onClick={() => {
              runHealthCheck();
              fetchOverview();
            }}
            disabled={loadingHealth || loadingOverview}
            className="px-4 py-2 rounded-lg bg-sky-500 hover:bg-sky-400 text-white text-sm font-semibold flex items-center gap-2 disabled:opacity-50"
          >
            <RefreshCw className={`h-4 w-4 ${loadingHealth || loadingOverview ? 'animate-spin' : ''}`} />
            Relancer le diagnostic
          </button>
        </div>
      </div>

      {error && (
        <div className="rounded-lg border border-red-500/40 bg-red-500/10 p-3 text-sm text-red-300">{error}</div>
      )}

      {/* Liste des checks */}
      <div className="rounded-xl border border-slate-800 bg-slate-950/30">
        <div className="px-5 py-3 border-b border-slate-800 flex items-center gap-2">
          <Server className="h-5 w-5 text-slate-400" />
          <h3 className="font-semibold text-slate-200">Checks de déploiement</h3>
        </div>
        <ul className="divide-y divide-slate-800">
          {(health?.checks ?? []).map((c) => {
            const style = STATUS_STYLE[c.status];
            const Icon = style.icon;
            const hasDetails = c.details && Object.keys(c.details).length > 0;
            const isExpanded = expanded.has(c.id);
            return (
              <li key={c.id} className="px-5 py-3">
                <button
                  onClick={() => hasDetails && toggleExpand(c.id)}
                  className={`w-full flex items-start gap-3 text-left ${hasDetails ? 'cursor-pointer' : 'cursor-default'}`}
                >
                  <Icon className={`h-5 w-5 mt-0.5 shrink-0 ${style.text}`} />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="font-medium text-slate-100">{c.label}</span>
                      {hasDetails &&
                        (isExpanded ? (
                          <ChevronDown className="h-4 w-4 text-slate-500" />
                        ) : (
                          <ChevronRight className="h-4 w-4 text-slate-500" />
                        ))}
                    </div>
                    <p className={`text-sm mt-0.5 ${style.text}`}>{c.message}</p>
                    {hasDetails && isExpanded && (
                      <pre className="mt-2 text-xs font-mono bg-slate-900/60 border border-slate-800 rounded-lg p-3 text-slate-300 overflow-x-auto">
                        {JSON.stringify(c.details, null, 2)}
                      </pre>
                    )}
                  </div>
                </button>
              </li>
            );
          })}
          {!health && (
            <li className="px-5 py-6 text-center text-slate-500 text-sm">Chargement du diagnostic...</li>
          )}
        </ul>
      </div>

      {/* Liste des instances */}
      <div className="rounded-xl border border-slate-800 bg-slate-950/30">
        <div className="px-5 py-3 border-b border-slate-800 flex items-center gap-2">
          <Volume2 className="h-5 w-5 text-slate-400" />
          <h3 className="font-semibold text-slate-200">Instances détectées ({overview?.instances_count ?? 0})</h3>
        </div>
        <ul className="divide-y divide-slate-800">
          {(overview?.instances ?? []).map((inst) => (
            <li key={inst.instance_id} className="px-5 py-4 space-y-2">
              <div className="flex items-center justify-between gap-3 flex-wrap">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-sm font-bold px-2 py-0.5 rounded-md bg-slate-800 text-slate-200">
                    Bot {inst.instance_id}
                  </span>
                  {inst.broadcasting ? (
                    <span className="flex items-center gap-1.5 text-xs font-semibold text-red-400">
                      <span className="relative flex h-2 w-2">
                        <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-75" />
                        <span className="relative inline-flex rounded-full h-2 w-2 bg-red-500" />
                      </span>
                      EN DIRECT
                    </span>
                  ) : inst.config.configured ? (
                    <span className="text-xs text-emerald-400">Libre</span>
                  ) : (
                    <span className="text-xs text-amber-400 flex items-center gap-1">
                      <AlertTriangle className="h-3 w-3" /> Non configuré
                    </span>
                  )}
                  {!inst.ready && <span className="text-[10px] uppercase tracking-wide text-amber-300/80">starting</span>}
                  {inst.source === 'discord' && (
                    <span className="text-xs text-indigo-300 flex items-center gap-1">
                      <MessageCircle className="h-3 w-3" /> Discord
                    </span>
                  )}
                  {inst.source === 'site' && (
                    <span className="text-xs text-sky-300 flex items-center gap-1">
                      <Monitor className="h-3 w-3" /> Site
                    </span>
                  )}
                </div>
                {inst.broadcasting && (
                  <button
                    onClick={() => handleStopInstance(inst.instance_id)}
                    disabled={stopBusy === inst.instance_id}
                    className="px-3 py-1 rounded-md bg-red-500/80 hover:bg-red-500 text-white text-xs font-medium flex items-center gap-1 disabled:opacity-50"
                  >
                    <Square className="h-3 w-3" />
                    Forcer l&apos;arrêt
                  </button>
                )}
              </div>

              <div className="text-sm text-slate-300 grid sm:grid-cols-2 gap-x-4 gap-y-1">
                <div>
                  <span className="text-slate-500">Aéroport : </span>
                  {inst.aeroport ?? inst.airport ?? <span className="text-slate-600">—</span>}
                  {inst.atis_code && <span className="ml-2 font-mono text-sky-300">Code {inst.atis_code}</span>}
                </div>
                <div>
                  <span className="text-slate-500">Contrôleur : </span>
                  {inst.controller?.display_name ?? (inst.source === 'discord' ? 'Discord (/atiscreate)' : <span className="text-slate-600">—</span>)}
                  {inst.position && <span className="text-slate-500"> ({inst.position})</span>}
                </div>
                <div className="sm:col-span-2">
                  <span className="text-slate-500">Canal vocal : </span>
                  {inst.voice_channel_name ? (
                    <>
                      #{inst.voice_channel_name}
                      {inst.voice_guild_name && <span className="text-slate-500"> · {inst.voice_guild_name}</span>}
                      {!inst.voice_connected && <span className="ml-2 text-amber-400">(reconnexion...)</span>}
                    </>
                  ) : inst.config.configured ? (
                    <span className="text-slate-400">
                      Cible : #{inst.config.discord_channel_name}
                      {inst.config.discord_guild_name && ` · ${inst.config.discord_guild_name}`}
                    </span>
                  ) : (
                    <span className="text-amber-400">Aucun canal — configure depuis le panneau ATIS</span>
                  )}
                </div>
              </div>
            </li>
          ))}
          {(overview?.instances?.length ?? 0) === 0 && (
            <li className="px-5 py-6 text-center text-slate-500 text-sm">Aucune instance détectée.</li>
          )}
        </ul>
      </div>

      {/* Aide deploiement */}
      <div className="rounded-xl border border-slate-800 bg-slate-950/30 p-5 space-y-4 text-sm text-slate-300">
        <h3 className="font-semibold text-slate-200 flex items-center gap-2">
          <PlayCircle className="h-5 w-5 text-sky-400" />
          Ajouter / déployer un nouveau bot ATIS
        </h3>
        <ol className="space-y-2 list-decimal list-inside text-slate-300">
          <li>
            Crée une nouvelle application Discord :{' '}
            <a
              href="https://discord.com/developers/applications"
              target="_blank"
              rel="noreferrer"
              className="text-sky-400 hover:underline inline-flex items-center gap-1"
            >
              discord.com/developers/applications
              <ExternalLink className="h-3 w-3" />
            </a>
            . Active les intents <strong>PRESENCE</strong>, <strong>SERVER MEMBERS</strong>,{' '}
            <strong>MESSAGE CONTENT</strong>.
          </li>
          <li>
            Copie le token (Bot → Reset Token) et invite le bot sur ton serveur Discord avec les permissions{' '}
            <code>View Channels</code>, <code>Connect</code>, <code>Speak</code>, <code>Use Slash Commands</code>.
          </li>
          <li>
            Sur Render, ajoute la variable d&apos;environnement <code>DISCORD_TOKEN_2</code> (ou{' '}
            <code>DISCORD_TOKEN_3</code> etc.) avec le token. Le bot redémarrera automatiquement.
          </li>
          <li>
            Si pas déjà fait, lance la migration <code>supabase/add_atis_bot_instance_2.sql</code> dans l&apos;éditeur SQL Supabase.
          </li>
          <li>
            Reviens ici, clique <strong>Relancer le diagnostic</strong>. Tous les checks doivent être verts.
          </li>
          <li>
            Va dans le panneau ATIS (en mode ATC en service), onglet <strong>Config</strong>, sélectionne le bot et
            assigne-lui un canal vocal.
          </li>
        </ol>
        <p className="text-xs text-slate-500">
          Documentation complète :{' '}
          <code>supabase/MULTI_BOT_ATIS_DEPLOYMENT.md</code>
        </p>
      </div>
    </div>
  );
}
