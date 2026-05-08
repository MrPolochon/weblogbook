'use client';

import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import {
  Radio,
  X,
  Play,
  Square,
  Pencil,
  Globe,
  Cloud,
  Headphones,
  AlertTriangle,
  RefreshCw,
  Monitor,
  MessageCircle,
  Wifi,
  WifiOff,
  CheckCircle2,
  CircleDot,
  Server,
  Volume2,
  Settings2,
} from 'lucide-react';
import { useAtcTheme } from '@/contexts/AtcThemeContext';
import { AEROPORTS_PTFS } from '@/lib/aeroports-ptfs';

// Types alignes sur /api/atc/atis/overview
interface ControllerInfo {
  user_id: string;
  identifiant: string | null;
  display_name: string;
}

interface InstanceConfig {
  discord_guild_id: string | null;
  discord_guild_name: string | null;
  discord_channel_id: string | null;
  discord_channel_name: string | null;
  configured: boolean;
}

interface AtisInstance {
  instance_id: number;
  controlling_user_id: string | null;
  controller: ControllerInfo | null;
  aeroport: string | null;
  position: string | null;
  source: 'site' | 'discord' | null;
  started_at: string | null;
  broadcasting: boolean;
  bot_broadcasting: boolean;
  db_broadcasting: boolean;
  desync: boolean;
  ready: boolean;
  airport: string | null;
  airport_name: string | null;
  voice_channel_id: string | null;
  voice_channel_name: string | null;
  voice_guild_id: string | null;
  voice_guild_name: string | null;
  voice_connected: boolean;
  atis_code: string | null;
  atis_text: string | null;
  bilingual: boolean;
  last_updated: string | null;
  config: InstanceConfig;
  is_mine: boolean;
}

interface OverviewResponse {
  instances: AtisInstance[];
  instances_count: number;
  guilds: { id: string; name: string }[];
  bot: {
    reachable: boolean;
    error?: string | null;
    latency_ms?: number;
    version?: string;
    uptime_seconds?: number;
  };
  user_prefs: {
    atis_ticker_visible: boolean;
    atis_code_auto_rotate: boolean;
  };
  any_broadcasting: boolean;
}

interface AtisData {
  airport?: string;
  airport_name?: string;
  information_code?: string;
  last_updated?: string;
  runway?: string;
  expected_approach?: string;
  expected_runway?: string;
  runway_condition?: string;
  wind?: string;
  visibility?: string;
  sky_condition?: string;
  temperature?: string;
  dewpoint?: string;
  qnh?: string;
  transition_level?: string;
  remarks?: string;
  cavok?: boolean;
  bilingual_mode?: boolean;
}

interface AtcAtisButtonProps {
  aeroport: string;
  position: string;
  userId: string;
}

const CODE_LETTERS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split('');
const ATIS_VALID_MINUTES = 60;
const ATIS_WARN_MINUTES = 50;
const POLL_MS = 5000;

type Tab = 'status' | 'config' | 'data';

export default function AtcAtisButton({ aeroport, position, userId }: AtcAtisButtonProps) {
  const { theme } = useAtcTheme();
  const isDark = theme === 'dark';

  // ---------------------------------------------------------------------------
  // Etat panneau
  // ---------------------------------------------------------------------------
  const [isOpen, setIsOpen] = useState(false);
  const [tab, setTab] = useState<Tab>('status');
  const [overview, setOverview] = useState<OverviewResponse | null>(null);
  const [overviewLoading, setOverviewLoading] = useState(false);
  const [overviewLastFetch, setOverviewLastFetch] = useState<number | null>(null);
  const [retryCount, setRetryCount] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [actionLoading, setActionLoading] = useState(false);

  // Donnees ATIS detaillees (uniquement chargees onglet "data")
  const [atisData, setAtisData] = useState<AtisData | null>(null);
  const [editing, setEditing] = useState<string | null>(null);
  const [editValues, setEditValues] = useState<Record<string, string>>({});

  // Configuration Discord (par instance)
  const [configInstanceId, setConfigInstanceId] = useState<number>(1);
  const [selectedGuildId, setSelectedGuildId] = useState<string>('');
  const [selectedChannelId, setSelectedChannelId] = useState<string>('');
  const [channels, setChannels] = useState<{ id: string; name: string }[]>([]);
  const [savingConfig, setSavingConfig] = useState(false);
  const configInitializedForRef = useRef<number | null>(null);

  // Demarrage : choix du bot cible (auto par defaut)
  const [startTargetInstance, setStartTargetInstance] = useState<number | 'auto'>('auto');

  // Auto-rotate code
  const [autoRotateInProgress, setAutoRotateInProgress] = useState(false);
  const alarmFiredRef = useRef(false);

  // ---------------------------------------------------------------------------
  // Derivations
  // ---------------------------------------------------------------------------
  const myInstance = useMemo(
    () => overview?.instances.find((i) => i.is_mine) ?? null,
    [overview]
  );
  const broadcasting = Boolean(myInstance?.broadcasting);
  const isFromDiscord = myInstance?.source === 'discord';
  const anyBroadcasting = overview?.any_broadcasting ?? false;
  const guilds = overview?.guilds ?? [];
  const instances = useMemo(
    () => overview?.instances ?? [],
    [overview]
  );
  const atisCodeAutoRotate = overview?.user_prefs.atis_code_auto_rotate ?? false;
  const botReachable = overview?.bot.reachable ?? null;
  const botError = overview?.bot.error ?? null;
  const botLatency = overview?.bot.latency_ms;
  const botVersion = overview?.bot.version;

  const configInstance = useMemo(
    () => instances.find((i) => i.instance_id === configInstanceId) ?? null,
    [instances, configInstanceId]
  );

  // ---------------------------------------------------------------------------
  // API helpers
  // ---------------------------------------------------------------------------
  const apiCall = async (path: string, opts?: { method?: string; body?: unknown }) => {
    setError(null);
    const res = await fetch(path, {
      method: opts?.method ?? 'GET',
      headers: { 'Content-Type': 'application/json' },
      body: opts?.body ? JSON.stringify(opts.body) : undefined,
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Erreur');
    return data;
  };

  const fetchOverview = useCallback(async () => {
    setOverviewLoading(true);
    try {
      const res = await fetch('/api/atc/atis/overview', { cache: 'no-store' });
      const data: OverviewResponse | { error?: string } = await res.json();
      if (res.ok && 'instances' in data) {
        setOverview(data);
        setOverviewLastFetch(Date.now());
        setRetryCount(0);
      } else {
        setError((data as { error?: string }).error || `Erreur ${res.status}`);
      }
    } catch {
      setError('Erreur réseau (overview)');
    } finally {
      setOverviewLoading(false);
    }
  }, []);

  const fetchChannels = useCallback(async (guildId: string) => {
    if (!guildId) {
      setChannels([]);
      return;
    }
    try {
      const res = await fetch(`/api/atc/atis/discord-channels?guild_id=${encodeURIComponent(guildId)}`);
      const data = await res.json();
      setChannels(res.ok && data?.channels ? data.channels : []);
    } catch {
      setChannels([]);
    }
  }, []);

  const fetchAtisData = useCallback(async () => {
    try {
      const res = await fetch('/api/atc/atis/atis-data');
      const data = await res.json();
      if (res.ok && !data?.error) {
        setAtisData(data);
      }
    } catch {
      /* ignore */
    }
  }, []);

  // ---------------------------------------------------------------------------
  // Polling
  // ---------------------------------------------------------------------------
  useEffect(() => {
    fetchOverview();
    const itv = setInterval(fetchOverview, POLL_MS);
    return () => clearInterval(itv);
  }, [fetchOverview]);

  useEffect(() => {
    if (isOpen) {
      fetchOverview();
    }
  }, [isOpen, fetchOverview]);

  useEffect(() => {
    if (isOpen && tab === 'data') {
      fetchAtisData();
      const itv = setInterval(fetchAtisData, POLL_MS);
      return () => clearInterval(itv);
    }
  }, [isOpen, tab, fetchAtisData]);

  // Initialise les selecteurs guild/channel quand on change d'instance configuree.
  useEffect(() => {
    if (!isOpen) return;
    if (configInitializedForRef.current === configInstanceId) return;
    if (!configInstance) return;
    setSelectedGuildId(configInstance.config.discord_guild_id ?? '');
    setSelectedChannelId(configInstance.config.discord_channel_id ?? '');
    configInitializedForRef.current = configInstanceId;
  }, [isOpen, configInstanceId, configInstance]);

  // Charge channels quand le guild change.
  useEffect(() => {
    fetchChannels(selectedGuildId);
  }, [selectedGuildId, fetchChannels]);

  // ---------------------------------------------------------------------------
  // Actions
  // ---------------------------------------------------------------------------
  const handleStart = async () => {
    if (broadcasting || actionLoading) return;
    setActionLoading(true);
    try {
      const body: { aeroport: string; position: string; instance_id?: number } = {
        aeroport,
        position,
      };
      if (startTargetInstance !== 'auto') body.instance_id = startTargetInstance;
      await apiCall('/api/atc/atis/start', { method: 'POST', body });
      await fetchOverview();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Erreur au démarrage');
    } finally {
      setActionLoading(false);
    }
  };

  const handleStop = async (targetInstanceId?: number) => {
    if (actionLoading) return;
    setActionLoading(true);
    try {
      const body: { instance_id?: number } = {};
      if (targetInstanceId !== undefined) body.instance_id = targetInstanceId;
      await apiCall('/api/atc/atis/stop', {
        method: 'POST',
        body: Object.keys(body).length ? body : undefined,
      });
      await fetchOverview();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erreur à l'arrêt");
    } finally {
      setActionLoading(false);
    }
  };

  const handlePatch = async (updates: Record<string, unknown>) => {
    try {
      const data = await apiCall('/api/atc/atis/atis-data', { method: 'PATCH', body: updates });
      setAtisData((prev) => ({ ...prev, ...data?.data }));
      setEditing(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Erreur');
    }
  };

  const handleCodeChange = async (code: string) => {
    try {
      await apiCall('/api/atc/atis/atiscode', { method: 'POST', body: { code } });
      setAtisData((prev) => (prev ? { ...prev, information_code: code } : { information_code: code }));
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Erreur');
    }
  };

  const handleToggleCavok = async () => {
    try {
      const data = await apiCall('/api/atc/atis/toggle-cavok', { method: 'POST' });
      setAtisData((prev) => ({ ...prev, cavok: data.cavok }));
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Erreur');
    }
  };

  const handleToggleBilingual = async () => {
    try {
      const data = await apiCall('/api/atc/atis/toggle-bilingual', { method: 'POST' });
      setAtisData((prev) => ({ ...prev, bilingual_mode: data.bilingual_mode }));
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Erreur');
    }
  };

  const handleToggleAutoRotate = async () => {
    const next = !atisCodeAutoRotate;
    try {
      await apiCall('/api/atc/atis/auto-code', { method: 'PATCH', body: { auto_rotate: next } });
      setOverview((prev) =>
        prev ? { ...prev, user_prefs: { ...prev.user_prefs, atis_code_auto_rotate: next } } : prev
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Erreur');
    }
  };

  const saveDiscordConfig = async () => {
    const guildId = selectedGuildId;
    const channelId = selectedChannelId;
    const guildName = guilds.find((g) => g.id === guildId)?.name;
    const channelName = channels.find((c) => c.id === channelId)?.name;
    if (!guildId || !channelId) {
      setError('Sélectionnez un serveur et un canal vocal');
      return;
    }
    setSavingConfig(true);
    try {
      await apiCall('/api/atc/atis/config', {
        method: 'PATCH',
        body: {
          instance_id: configInstanceId,
          discord_guild_id: guildId,
          discord_guild_name: guildName,
          discord_channel_id: channelId,
          discord_channel_name: channelName,
        },
      });
      await fetchOverview();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Erreur');
    } finally {
      setSavingConfig(false);
    }
  };

  const startEdit = (field: string, values: Record<string, string>) => {
    setEditing(field);
    setEditValues(values);
  };

  const saveEdit = () => {
    if (editing === 'runway') {
      handlePatch({
        runway: editValues.runway || undefined,
        expected_approach: editValues.expected_approach || undefined,
        expected_runway: editValues.expected_runway || undefined,
        runway_condition: editValues.runway_condition || undefined,
      });
    }
    if (editing === 'weather') {
      handlePatch({
        wind: editValues.wind || undefined,
        visibility: editValues.visibility || undefined,
        sky_condition: editValues.sky_condition || undefined,
        temperature: editValues.temperature || undefined,
        dewpoint: editValues.dewpoint || undefined,
      });
    }
    if (editing === 'qnh') {
      handlePatch({
        qnh: editValues.qnh || undefined,
        transition_level: editValues.transition_level || undefined,
      });
    }
    if (editing === 'remarks') handlePatch({ remarks: editValues.remarks || undefined });
  };

  // ---------------------------------------------------------------------------
  // Obsolescence + alarme + auto-rotate
  // ---------------------------------------------------------------------------
  const obsStatus = useMemo(() => {
    const lu = atisData?.last_updated;
    if (!lu) return { status: 'unknown' as const, minutesLeft: null };
    try {
      const updated = new Date(lu).getTime();
      const elapsedMin = (Date.now() - updated) / 60000;
      const minutesLeft = Math.max(0, ATIS_VALID_MINUTES - elapsedMin);
      if (elapsedMin >= ATIS_VALID_MINUTES) return { status: 'obsolete' as const, minutesLeft: 0 };
      if (elapsedMin >= ATIS_WARN_MINUTES) return { status: 'warning' as const, minutesLeft: Math.round(minutesLeft) };
      return { status: 'ok' as const, minutesLeft: Math.round(minutesLeft) };
    } catch {
      return { status: 'unknown' as const, minutesLeft: null };
    }
  }, [atisData?.last_updated]);

  useEffect(() => {
    const isController = myInstance?.is_mine;
    if (
      broadcasting &&
      isController &&
      (obsStatus.status === 'warning' || obsStatus.status === 'obsolete') &&
      !alarmFiredRef.current
    ) {
      alarmFiredRef.current = true;
      try {
        const ctx = new (window.AudioContext ||
          (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext)();
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.frequency.value = 800;
        gain.gain.setValueAtTime(0.2, ctx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.3);
        osc.start(ctx.currentTime);
        osc.stop(ctx.currentTime + 0.3);
        osc.onended = () => {
          try { void ctx.close(); } catch { /* ignore */ }
        };
      } catch {
        /* ignore */
      }
      try {
        if ('Notification' in window && Notification.permission === 'granted') {
          new Notification('ATIS weblogbook', {
            body:
              obsStatus.status === 'obsolete'
                ? 'ATIS obsolète — Mettez à jour le code'
                : `ATIS obsolète dans ~${obsStatus.minutesLeft} min`,
            icon: '/favicon.ico',
          });
        }
      } catch {
        /* ignore */
      }
    }
    if (obsStatus.status === 'ok') alarmFiredRef.current = false;
  }, [broadcasting, myInstance?.is_mine, obsStatus.status, obsStatus.minutesLeft]);

  useEffect(() => {
    if (
      !broadcasting ||
      !myInstance?.is_mine ||
      !atisCodeAutoRotate ||
      autoRotateInProgress ||
      obsStatus.status !== 'obsolete'
    )
      return;
    const code = atisData?.information_code;
    if (!code || code.length !== 1) return;
    const idx = CODE_LETTERS.indexOf(code);
    const nextCode = idx >= 0 ? CODE_LETTERS[(idx + 1) % 26] : 'A';
    setAutoRotateInProgress(true);
    apiCall('/api/atc/atis/atiscode', { method: 'POST', body: { code: nextCode } })
      .then(() => {
        setAtisData((prev) =>
          prev ? { ...prev, information_code: nextCode, last_updated: new Date().toISOString() } : null
        );
      })
      .catch(() => {})
      .finally(() => setAutoRotateInProgress(false));
  }, [
    broadcasting,
    myInstance?.is_mine,
    atisCodeAutoRotate,
    autoRotateInProgress,
    obsStatus.status,
    atisData?.information_code,
  ]);

  // ---------------------------------------------------------------------------
  // Theme classes
  // ---------------------------------------------------------------------------
  const bgMain = isDark
    ? 'border border-slate-800/80 bg-gradient-to-b from-slate-950 via-slate-900 to-slate-900/95'
    : 'bg-gradient-to-b from-slate-800 to-slate-900';
  const textMain = isDark ? 'text-slate-50' : 'text-white';
  const textMuted = isDark ? 'text-slate-400 font-medium' : 'text-slate-200 font-medium';
  const textValue = isDark ? 'text-slate-100 font-semibold' : 'text-white font-semibold';
  const borderCl = isDark ? 'border-slate-800' : 'border-slate-500';
  const inputCl = isDark
    ? 'bg-slate-900 border-slate-700 text-slate-100 text-base placeholder:text-slate-500'
    : 'bg-slate-600 border-slate-400 text-white text-base';
  const btnCl = isDark
    ? 'bg-sky-500 hover:bg-sky-400 text-white shadow-lg shadow-sky-950/30'
    : 'bg-sky-600 hover:bg-sky-500 text-white';
  const cardCl = isDark
    ? 'border border-slate-800 bg-slate-950/60'
    : 'border border-slate-600/40 bg-slate-700/40';

  // ---------------------------------------------------------------------------
  // Bouton flottant ferme
  // ---------------------------------------------------------------------------
  if (!isOpen) {
    return (
      <button
        onClick={() => setIsOpen(true)}
        className={`fixed bottom-4 left-4 z-50 ${bgMain} ${textMain} rounded-2xl shadow-xl px-4 py-3 flex items-center gap-3 transition-all duration-300 hover:scale-105 hover:shadow-2xl ${
          anyBroadcasting ? 'ring-2 ring-red-500' : ''
        }`}
        title={
          broadcasting
            ? 'ATIS en cours — Cliquer pour gérer'
            : anyBroadcasting
              ? `ATIS actif (${instances.filter((i) => i.broadcasting).length}/${instances.length}) — Cliquer pour voir`
              : 'Panneau ATIS'
        }
      >
        <div
          className={`p-2 rounded-xl ${
            broadcasting
              ? 'bg-red-500/30'
              : anyBroadcasting
                ? 'bg-amber-500/25'
                : isDark
                  ? 'bg-amber-500/15'
                  : 'bg-amber-500/20'
          }`}
        >
          <Radio
            className={`h-5 w-5 ${
              broadcasting
                ? 'text-red-500'
                : anyBroadcasting
                  ? 'text-amber-300'
                  : isDark
                    ? 'text-amber-300'
                    : 'text-amber-400'
            }`}
          />
        </div>
        <span className="font-medium">ATIS</span>
        {anyBroadcasting && (
          <span className="flex items-center gap-1.5 text-xs">
            <span className="relative flex h-2 w-2">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-75" />
              <span className="relative inline-flex rounded-full h-2 w-2 bg-red-500" />
            </span>
            {broadcasting ? 'En direct' : `${instances.filter((i) => i.broadcasting).length}/${instances.length}`}
            {broadcasting &&
              (isFromDiscord ? (
                <MessageCircle className="h-3 w-3 ml-0.5 opacity-70" />
              ) : (
                <Monitor className="h-3 w-3 ml-0.5 opacity-70" />
              ))}
          </span>
        )}
      </button>
    );
  }

  // ---------------------------------------------------------------------------
  // Panneau ouvert
  // ---------------------------------------------------------------------------
  const d = atisData;
  const val = (v: string | null | undefined) => v ?? '—';

  const tabs: { id: Tab; label: string; icon: React.ReactNode }[] = [
    { id: 'status', label: 'État', icon: <Server className="h-4 w-4" /> },
    { id: 'config', label: 'Config', icon: <Settings2 className="h-4 w-4" /> },
    { id: 'data', label: 'ATIS', icon: <Volume2 className="h-4 w-4" /> },
  ];

  return (
    <div
      className={`fixed left-4 bottom-4 z-50 ${bgMain} rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[88vh]`}
      style={{ width: 'min(440px, 95vw)' }}
    >
      {/* Header */}
      <div className={`px-5 py-3 flex items-center justify-between border-b ${borderCl} flex-shrink-0`}>
        <div className="flex items-center gap-2">
          <Radio className={`h-5 w-5 ${isDark ? 'text-amber-300' : 'text-amber-400'}`} />
          <span className={`text-base font-bold ${textMain}`}>Panneau ATIS</span>
          {botReachable === true && (
            <span
              className="flex items-center gap-1 text-[11px] text-emerald-400"
              title={`Bot OK${botLatency ? ` — ${botLatency}ms` : ''}${botVersion ? ` — v${botVersion}` : ''}`}
            >
              <Wifi className="h-3 w-3" />
              {botLatency ? `${botLatency}ms` : 'OK'}
            </span>
          )}
          {botReachable === false && (
            <span className="flex items-center gap-1 text-[11px] text-red-400" title={botError ?? ''}>
              <WifiOff className="h-3 w-3" />
              KO
            </span>
          )}
        </div>
        <div className="flex items-center gap-1">
          <button
            onClick={() => {
              setRetryCount((r) => r + 1);
              fetchOverview();
            }}
            disabled={overviewLoading}
            className={`p-1.5 rounded-lg ${isDark ? 'text-slate-400 hover:bg-slate-800 hover:text-slate-100' : 'hover:bg-slate-600 text-slate-200'} disabled:opacity-50`}
            title="Rafraîchir"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${overviewLoading ? 'animate-spin' : ''}`} />
          </button>
          <button
            onClick={() => {
              setIsOpen(false);
              setError(null);
              setEditing(null);
            }}
            className={`p-1.5 rounded-lg ${isDark ? 'text-slate-400 hover:bg-slate-800 hover:text-slate-100' : 'hover:bg-slate-600 text-slate-200'}`}
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>

      {/* Tabs */}
      <div className={`flex border-b ${borderCl} flex-shrink-0`}>
        {tabs.map((t) => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className={`flex-1 flex items-center justify-center gap-1.5 py-2.5 text-sm font-medium transition ${
              tab === t.id
                ? isDark
                  ? 'bg-slate-900 text-sky-300 border-b-2 border-sky-400'
                  : 'bg-slate-700 text-sky-300 border-b-2 border-sky-400'
                : isDark
                  ? 'text-slate-400 hover:text-slate-100 hover:bg-slate-900/50'
                  : 'text-slate-300 hover:text-white hover:bg-slate-700/50'
            }`}
          >
            {t.icon}
            {t.label}
          </button>
        ))}
      </div>

      {/* Body */}
      <div className={`flex-1 overflow-y-auto p-4 space-y-3 text-base ${isDark ? 'text-slate-100' : 'text-slate-100'}`}>
        {error && (
          <p
            className={`text-sm font-medium px-3 py-2 rounded-lg border ${
              isDark
                ? 'border-red-500/40 bg-red-500/12 text-red-300'
                : 'text-red-400 bg-red-500/20 border-red-500/50'
            }`}
          >
            {error}
          </p>
        )}

        {botReachable === false && (
          <BotErrorCard
            isDark={isDark}
            error={botError}
            retryCount={retryCount}
            onRetry={() => {
              setRetryCount((r) => r + 1);
              fetchOverview();
            }}
            lastFetch={overviewLastFetch}
          />
        )}

        {/* ============ TAB : ETAT ============ */}
        {tab === 'status' && (
          <>
            {instances.length === 0 && botReachable !== false && (
              <p className={`text-sm ${textMuted}`}>Aucune instance détectée. Vérifiez la configuration du bot.</p>
            )}
            {instances.map((inst) => (
              <InstanceCard
                key={inst.instance_id}
                inst={inst}
                isDark={isDark}
                cardCl={cardCl}
                textMuted={textMuted}
                textValue={textValue}
                userId={userId}
                onStop={() => handleStop(inst.instance_id)}
                actionLoading={actionLoading}
              />
            ))}

            {/* Action principale : demarrer / arreter MA session */}
            <div className={`pt-3 border-t ${borderCl}`}>
              {!broadcasting && (
                <>
                  {/* Choix bot cible */}
                  <div className="flex items-center justify-between gap-2 mb-2">
                    <span className={`text-xs ${textMuted}`}>Démarrer sur</span>
                    <div className="flex gap-1">
                      <button
                        type="button"
                        onClick={() => setStartTargetInstance('auto')}
                        className={`px-2.5 py-1 rounded-md text-xs font-semibold ${
                          startTargetInstance === 'auto'
                            ? isDark ? 'bg-sky-600 text-white' : 'bg-sky-600 text-white'
                            : isDark ? 'bg-slate-800 text-slate-300 border border-slate-700' : 'bg-slate-600 text-slate-100'
                        }`}
                      >
                        Auto
                      </button>
                      {instances.map((inst) => (
                        <button
                          key={inst.instance_id}
                          type="button"
                          disabled={inst.broadcasting || !inst.config.configured}
                          onClick={() => setStartTargetInstance(inst.instance_id)}
                          title={
                            !inst.config.configured
                              ? `Bot ${inst.instance_id} non configuré`
                              : inst.broadcasting
                                ? `Bot ${inst.instance_id} déjà actif`
                                : `Forcer le Bot ${inst.instance_id}`
                          }
                          className={`px-2.5 py-1 rounded-md text-xs font-semibold disabled:opacity-40 disabled:cursor-not-allowed ${
                            startTargetInstance === inst.instance_id
                              ? 'bg-sky-600 text-white'
                              : isDark ? 'bg-slate-800 text-slate-300 border border-slate-700' : 'bg-slate-600 text-slate-100'
                          }`}
                        >
                          Bot {inst.instance_id}
                        </button>
                      ))}
                    </div>
                  </div>

                  <button
                    onClick={handleStart}
                    disabled={actionLoading}
                    className="w-full flex items-center justify-center gap-2 py-3 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-white font-semibold text-base disabled:opacity-50"
                  >
                    <Play className="h-5 w-5" />
                    Démarrer ATIS — {aeroport}
                  </button>
                </>
              )}
              {broadcasting && (
                <button
                  onClick={() => handleStop()}
                  disabled={actionLoading}
                  className="w-full flex items-center justify-center gap-2 py-3 rounded-xl bg-red-500 hover:bg-red-400 text-white font-semibold text-base disabled:opacity-50"
                >
                  <Square className="h-5 w-5" />
                  Arrêter mon ATIS{isFromDiscord ? ' (Discord)' : ''}
                </button>
              )}
            </div>
          </>
        )}

        {/* ============ TAB : CONFIG ============ */}
        {tab === 'config' && (
          <>
            <div className={`flex items-center gap-2 ${isDark ? 'text-slate-100' : 'text-slate-100'}`}>
              <Headphones className={`h-5 w-5 ${textMuted}`} />
              <span className="font-semibold text-base">Configuration Discord par bot</span>
            </div>

            {/* Sélecteur d'instance dynamique */}
            <div className="flex flex-wrap gap-2">
              {instances.map((inst) => {
                const active = inst.instance_id === configInstanceId;
                return (
                  <button
                    key={inst.instance_id}
                    type="button"
                    onClick={() => setConfigInstanceId(inst.instance_id)}
                    className={`flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-semibold transition ${
                      active
                        ? 'bg-sky-600 text-white shadow-md shadow-sky-950/40'
                        : isDark
                          ? 'bg-slate-800 text-slate-300 border border-slate-700 hover:bg-slate-700'
                          : 'bg-slate-600 text-slate-100 border border-slate-500 hover:bg-slate-500'
                    }`}
                  >
                    <span>Bot {inst.instance_id}</span>
                    {inst.config.configured ? (
                      <CheckCircle2 className="h-3.5 w-3.5 text-emerald-400" />
                    ) : (
                      <AlertTriangle className="h-3.5 w-3.5 text-amber-400" />
                    )}
                  </button>
                );
              })}
              {instances.length === 0 && (
                <span className={`text-sm ${textMuted}`}>Aucun bot détecté.</span>
              )}
            </div>

            {configInstance && (
              <p className={`text-xs ${textMuted}`}>
                {configInstance.config.configured
                  ? `Actuellement : #${configInstance.config.discord_channel_name ?? '?'} sur ${configInstance.config.discord_guild_name ?? '?'}`
                  : 'Ce bot n\'a pas encore de canal vocal configuré.'}
                {configInstance.broadcasting && ' • En broadcast — la nouvelle config s\'appliquera au prochain démarrage.'}
              </p>
            )}

            <div className="space-y-3">
              <div>
                <label className={`block text-sm font-medium ${textMuted} mb-1`}>Serveur Discord</label>
                <select
                  value={selectedGuildId}
                  onChange={(e) => {
                    setSelectedGuildId(e.target.value);
                    setSelectedChannelId('');
                  }}
                  className={`w-full px-3 py-2 rounded-lg border ${inputCl}`}
                >
                  <option value="">— Choisir —</option>
                  {guilds.map((g) => (
                    <option key={g.id} value={g.id}>{g.name}</option>
                  ))}
                </select>
                {guilds.length === 0 && botReachable === true && (
                  <p className={`text-xs mt-1 ${textMuted}`}>
                    Aucun serveur — le Bot 1 doit être invité sur un serveur Discord.
                  </p>
                )}
              </div>
              <div>
                <label className={`block text-sm font-medium ${textMuted} mb-1`}>Canal vocal</label>
                <select
                  value={selectedChannelId}
                  onChange={(e) => setSelectedChannelId(e.target.value)}
                  disabled={!selectedGuildId}
                  className={`w-full px-3 py-2 rounded-lg border ${inputCl} disabled:opacity-50`}
                >
                  <option value="">— Choisir —</option>
                  {channels.map((c) => (
                    <option key={c.id} value={c.id}>{c.name}</option>
                  ))}
                </select>
              </div>
              <button
                onClick={saveDiscordConfig}
                disabled={savingConfig || !selectedGuildId || !selectedChannelId}
                className={`w-full py-2.5 rounded-lg text-sm font-semibold ${btnCl} disabled:opacity-50`}
              >
                {savingConfig ? 'Enregistrement...' : `Enregistrer config Bot ${configInstanceId}`}
              </button>
            </div>
          </>
        )}

        {/* ============ TAB : DONNEES ATIS ============ */}
        {tab === 'data' && (
          <>
            {!broadcasting && !myInstance && (
              <p className={`text-sm ${textMuted}`}>
                Démarrez d&apos;abord un ATIS pour modifier ses données. Vous pouvez consulter les données live depuis l&apos;onglet État.
              </p>
            )}

            {(obsStatus.status === 'warning' || obsStatus.status === 'obsolete') && broadcasting && (
              <div
                className={`flex items-center gap-2 px-4 py-3 rounded-lg text-base font-semibold ${
                  obsStatus.status === 'obsolete'
                    ? isDark
                      ? 'border border-red-500/40 bg-red-500/14 text-red-200'
                      : 'bg-red-500/20 text-red-400 border border-red-500/50'
                    : isDark
                      ? 'border border-amber-500/40 bg-amber-500/14 text-amber-200'
                      : 'bg-amber-500/20 text-amber-400 border border-amber-500/50'
                }`}
              >
                <AlertTriangle className="h-5 w-5 shrink-0" />
                <span className="flex-1">
                  {obsStatus.status === 'obsolete'
                    ? 'ATIS obsolète — Mettez à jour le code'
                    : `ATIS obsolète dans ~${obsStatus.minutesLeft} min`}
                </span>
                {obsStatus.status === 'obsolete' && atisCodeAutoRotate && myInstance?.is_mine && autoRotateInProgress && (
                  <RefreshCw className="h-4 w-4 animate-spin" />
                )}
                {typeof window !== 'undefined' && 'Notification' in window && Notification.permission !== 'granted' && (
                  <button
                    type="button"
                    onClick={() => Notification.requestPermission()}
                    className="text-sm font-medium underline hover:no-underline shrink-0"
                  >
                    Activer alertes
                  </button>
                )}
              </div>
            )}

            {/* Data fields */}
            <div className="space-y-3">
              <Row label="Aéroport" textMuted={textMuted} textValue={textValue}>
                {(() => {
                  const code = myInstance?.aeroport ?? aeroport;
                  const apt = code ? AEROPORTS_PTFS.find((a) => a.code === code) : null;
                  return apt ? `${apt.code} — ${apt.nom}` : (code || val(d?.airport_name || d?.airport) || '—');
                })()}
              </Row>

              <Row label="Code" textMuted={textMuted} textValue={textValue}>
                <div className="flex items-center gap-2">
                  <select
                    value={d?.information_code ?? ''}
                    onChange={(e) => handleCodeChange(e.target.value)}
                    disabled={!myInstance?.is_mine}
                    className={`px-3 py-2 rounded-lg border font-semibold ${inputCl} disabled:opacity-50`}
                  >
                    {CODE_LETTERS.map((c) => (
                      <option key={c} value={c}>{c}</option>
                    ))}
                  </select>
                  {myInstance?.is_mine && (
                    <button
                      onClick={handleToggleAutoRotate}
                      title={atisCodeAutoRotate ? 'Mode auto activé' : 'Activer la rotation auto'}
                      className={`flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-medium ${
                        atisCodeAutoRotate
                          ? 'bg-emerald-600 text-white'
                          : isDark
                            ? 'bg-slate-800 text-slate-100 border border-slate-700'
                            : 'bg-slate-500 text-slate-100'
                      } hover:opacity-90`}
                    >
                      <RefreshCw className="h-4 w-4" />
                      Auto
                    </button>
                  )}
                </div>
              </Row>

              <EditableRow
                label="Piste"
                editing={editing === 'runway'}
                onEdit={() =>
                  startEdit('runway', {
                    runway: d?.runway ?? '',
                    expected_approach: d?.expected_approach ?? '',
                    expected_runway: d?.expected_runway ?? '',
                    runway_condition: d?.runway_condition ?? '',
                  })
                }
                onCancel={() => setEditing(null)}
                onSave={saveEdit}
                inputCl={inputCl}
                btnCl={btnCl}
                isDark={isDark}
                textMuted={textMuted}
                textValue={textValue}
                canEdit={Boolean(myInstance?.is_mine)}
                display={`${val(d?.runway)} | ${val(d?.expected_approach)} ${
                  d?.expected_runway ? `RWY ${d.expected_runway}` : ''
                } (${val(d?.runway_condition)})`}
              >
                <input className={`px-3 py-2 rounded-lg border ${inputCl}`} placeholder="ex: 25L/25R" value={editValues.runway ?? ''} onChange={(e) => setEditValues((v) => ({ ...v, runway: e.target.value }))} />
                <input className={`px-3 py-2 rounded-lg border ${inputCl}`} placeholder="Approche prévue (anglais, ex: ILS)" value={editValues.expected_approach ?? ''} onChange={(e) => setEditValues((v) => ({ ...v, expected_approach: e.target.value }))} />
                <input className={`px-3 py-2 rounded-lg border ${inputCl}`} placeholder="Piste prévue (anglais, ex: 25)" value={editValues.expected_runway ?? ''} onChange={(e) => setEditValues((v) => ({ ...v, expected_runway: e.target.value }))} />
                <input className={`px-3 py-2 rounded-lg border ${inputCl}`} placeholder="Condition" value={editValues.runway_condition ?? ''} onChange={(e) => setEditValues((v) => ({ ...v, runway_condition: e.target.value }))} />
              </EditableRow>

              <EditableRow
                label="Vent"
                editing={editing === 'weather'}
                onEdit={() =>
                  startEdit('weather', {
                    wind: d?.wind ?? '',
                    visibility: d?.visibility ?? '',
                    sky_condition: d?.sky_condition ?? '',
                    temperature: d?.temperature ?? '',
                    dewpoint: d?.dewpoint ?? '',
                  })
                }
                onCancel={() => setEditing(null)}
                onSave={saveEdit}
                inputCl={inputCl}
                btnCl={btnCl}
                isDark={isDark}
                textMuted={textMuted}
                textValue={textValue}
                canEdit={Boolean(myInstance?.is_mine)}
                display={val(d?.wind)}
              >
                <input className={`px-3 py-2 rounded-lg border ${inputCl}`} placeholder="Vent" value={editValues.wind ?? ''} onChange={(e) => setEditValues((v) => ({ ...v, wind: e.target.value }))} />
                <input className={`px-3 py-2 rounded-lg border ${inputCl}`} placeholder="Visibilité" value={editValues.visibility ?? ''} onChange={(e) => setEditValues((v) => ({ ...v, visibility: e.target.value }))} />
                <input className={`px-3 py-2 rounded-lg border ${inputCl}`} placeholder="Ciel" value={editValues.sky_condition ?? ''} onChange={(e) => setEditValues((v) => ({ ...v, sky_condition: e.target.value }))} />
                <div className="flex gap-2">
                  <input className={`px-3 py-2 rounded-lg border w-20 ${inputCl}`} placeholder="Temp" value={editValues.temperature ?? ''} onChange={(e) => setEditValues((v) => ({ ...v, temperature: e.target.value }))} />
                  <input className={`px-3 py-2 rounded-lg border w-20 ${inputCl}`} placeholder="Rosée" value={editValues.dewpoint ?? ''} onChange={(e) => setEditValues((v) => ({ ...v, dewpoint: e.target.value }))} />
                </div>
              </EditableRow>

              {!editing && (
                <>
                  <Row label="Visibilité" textMuted={textMuted} textValue={textValue}>{val(d?.visibility)}</Row>
                  <Row label="Ciel" textMuted={textMuted} textValue={textValue}>{val(d?.sky_condition)}</Row>
                  <Row label="Temp/Rosée" textMuted={textMuted} textValue={textValue}>
                    {val(d?.temperature)}°C / {val(d?.dewpoint)}°C
                  </Row>
                </>
              )}

              <EditableRow
                label="QNH"
                editing={editing === 'qnh'}
                onEdit={() => startEdit('qnh', { qnh: d?.qnh ?? '', transition_level: d?.transition_level ?? '' })}
                onCancel={() => setEditing(null)}
                onSave={saveEdit}
                inputCl={inputCl}
                btnCl={btnCl}
                isDark={isDark}
                textMuted={textMuted}
                textValue={textValue}
                canEdit={Boolean(myInstance?.is_mine)}
                display={`${val(d?.qnh)} | TL ${val(d?.transition_level)}`}
              >
                <input className={`px-3 py-2 rounded-lg border w-24 ${inputCl}`} value={editValues.qnh ?? ''} onChange={(e) => setEditValues((v) => ({ ...v, qnh: e.target.value }))} placeholder="1013" />
                <input className={`px-3 py-2 rounded-lg border ${inputCl}`} value={editValues.transition_level ?? ''} onChange={(e) => setEditValues((v) => ({ ...v, transition_level: e.target.value }))} placeholder="TL (ex: 100 ou FL100)" />
              </EditableRow>

              <EditableRow
                label="Remarques"
                editing={editing === 'remarks'}
                onEdit={() => startEdit('remarks', { remarks: d?.remarks ?? '' })}
                onCancel={() => setEditing(null)}
                onSave={saveEdit}
                inputCl={inputCl}
                btnCl={btnCl}
                isDark={isDark}
                textMuted={textMuted}
                textValue={textValue}
                canEdit={Boolean(myInstance?.is_mine)}
                display={val(d?.remarks)}
              >
                <textarea className={`px-3 py-2 rounded-lg border w-full min-h-14 ${inputCl}`} value={editValues.remarks ?? ''} onChange={(e) => setEditValues((v) => ({ ...v, remarks: e.target.value }))} placeholder="Remarques" />
              </EditableRow>
            </div>

            {myInstance?.is_mine && (
              <div className={`flex gap-3 pt-3 border-t ${borderCl}`}>
                <button
                  onClick={handleToggleCavok}
                  className={`flex-1 py-2.5 rounded-lg text-sm font-semibold flex items-center justify-center gap-2 ${
                    d?.cavok
                      ? isDark
                        ? 'border border-emerald-500/30 bg-emerald-500/16 text-emerald-200'
                        : 'bg-emerald-500/30 text-emerald-300'
                      : 'bg-slate-500/40'
                  } ${isDark ? 'text-slate-100 hover:bg-slate-800' : 'text-slate-100 hover:bg-slate-600'}`}
                >
                  <Cloud className="h-4 w-4" />
                  CAVOK {d?.cavok ? '✓' : ''}
                </button>
                <button
                  onClick={handleToggleBilingual}
                  className={`flex-1 py-2.5 rounded-lg text-sm font-semibold flex items-center justify-center gap-2 ${
                    d?.bilingual_mode
                      ? isDark
                        ? 'border border-emerald-500/30 bg-emerald-500/16 text-emerald-200'
                        : 'bg-emerald-500/30 text-emerald-300'
                      : 'bg-slate-500/40'
                  } ${isDark ? 'text-slate-100 hover:bg-slate-800' : 'text-slate-100 hover:bg-slate-600'}`}
                >
                  <Globe className="h-4 w-4" />
                  EN+FR {d?.bilingual_mode ? '✓' : ''}
                </button>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

function Row({
  label,
  children,
  textMuted,
  textValue,
}: {
  label: string;
  children: React.ReactNode;
  textMuted: string;
  textValue: string;
}) {
  return (
    <div className="flex justify-between items-center gap-3">
      <span className={`text-sm font-medium min-w-[80px] ${textMuted}`}>{label}</span>
      <span className={`text-right ${textValue}`}>{children}</span>
    </div>
  );
}

function EditableRow({
  label,
  editing,
  onEdit,
  onCancel,
  onSave,
  inputCl,
  btnCl,
  isDark,
  textMuted,
  textValue,
  canEdit,
  display,
  children,
}: {
  label: string;
  editing: boolean;
  onEdit: () => void;
  onCancel: () => void;
  onSave: () => void;
  inputCl: string;
  btnCl: string;
  isDark: boolean;
  textMuted: string;
  textValue: string;
  canEdit: boolean;
  display: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex justify-between items-start gap-3">
      <span className={`text-sm font-medium min-w-[80px] pt-0.5 ${textMuted}`}>{label}</span>
      {editing ? (
        <div className="flex flex-col gap-2 flex-1 min-w-0">
          {children}
          <div className="flex gap-2">
            <button onClick={onSave} className={`px-3 py-2 rounded-lg text-sm font-medium ${btnCl}`}>OK</button>
            <button
              onClick={onCancel}
              className={`px-3 py-2 rounded-lg text-sm font-medium ${
                isDark
                  ? 'border border-slate-700 bg-slate-800 text-slate-100 hover:bg-slate-700'
                  : 'bg-slate-500 text-white'
              }`}
            >
              Annuler
            </button>
          </div>
        </div>
      ) : canEdit ? (
        <button
          onClick={onEdit}
          className={`flex items-center gap-2 hover:underline text-right max-w-[230px] truncate ${textValue}`}
        >
          <span className="truncate">{display}</span>
          <Pencil className="h-4 w-4 shrink-0" />
        </button>
      ) : (
        <span className={`text-right ${textValue} max-w-[230px] truncate`}>{display}</span>
      )}
    </div>
  );
}

function InstanceCard({
  inst,
  isDark,
  cardCl,
  textMuted,
  textValue,
  userId,
  onStop,
  actionLoading,
}: {
  inst: AtisInstance;
  isDark: boolean;
  cardCl: string;
  textMuted: string;
  textValue: string;
  userId: string;
  onStop: () => void;
  actionLoading: boolean;
}) {
  const isMine = inst.controlling_user_id === userId;
  const isDiscord = inst.source === 'discord';
  // N'importe quel ATC peut arreter un ATIS (cohrence avec /api/atc/atis/stop).
  // Stop reste utile aussi en cas de desync (bot diffuse mais DB vide).
  const canStop = inst.broadcasting || inst.desync;
  const aptLabel = (() => {
    const code = inst.aeroport ?? inst.airport;
    if (!code) return null;
    const apt = AEROPORTS_PTFS.find((a) => a.code === code);
    return apt ? `${apt.code} — ${apt.nom}` : code;
  })();

  return (
    <div className={`rounded-xl ${cardCl} p-3 space-y-2`}>
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <span className={`text-xs font-bold px-2 py-0.5 rounded-md ${isDark ? 'bg-slate-800 text-slate-200' : 'bg-slate-700 text-white'}`}>
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
            <span className={`flex items-center gap-1 text-xs ${textMuted}`}>
              <CircleDot className="h-3 w-3" /> Libre
            </span>
          ) : (
            <span className="flex items-center gap-1 text-xs text-amber-400">
              <AlertTriangle className="h-3 w-3" /> Non configuré
            </span>
          )}
          {!inst.ready && (
            <span className="text-[10px] uppercase tracking-wide text-amber-300/80">starting</span>
          )}
        </div>
        {canStop && (
          <button
            onClick={onStop}
            disabled={actionLoading}
            className={`px-2 py-1 rounded-md text-xs font-medium ${
              isMine
                ? 'bg-red-500/80 hover:bg-red-500 text-white'
                : isDark
                  ? 'bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-700'
                  : 'bg-slate-600 hover:bg-slate-500 text-slate-100'
            } disabled:opacity-50`}
            title={isMine ? 'Arrêter mon ATIS' : 'Arrêter (autre ATC)'}
          >
            <Square className="h-3 w-3 inline mr-1" />
            Stop
          </button>
        )}
      </div>

      {inst.broadcasting && (
        <>
          <div className="flex items-center gap-2 text-sm">
            <span className={`${textValue}`}>{aptLabel ?? '—'}</span>
            {inst.atis_code && (
              <span className={`text-xs font-mono px-1.5 py-0.5 rounded ${isDark ? 'bg-sky-500/20 text-sky-300' : 'bg-sky-500/30 text-sky-200'}`}>
                Code {inst.atis_code}
              </span>
            )}
            {inst.bilingual && (
              <span className={`text-[10px] px-1.5 py-0.5 rounded ${isDark ? 'bg-emerald-500/20 text-emerald-300' : 'bg-emerald-500/30 text-emerald-200'}`}>
                EN+FR
              </span>
            )}
          </div>
          <div className={`text-xs ${textMuted} space-y-0.5`}>
            {inst.controller && (
              <div className="flex items-center gap-1.5">
                {isDiscord ? (
                  <MessageCircle className="h-3 w-3" />
                ) : (
                  <Monitor className="h-3 w-3" />
                )}
                <span>
                  {isMine ? 'Vous contrôlez' : `Contrôlé par ${inst.controller.display_name}`}
                  {inst.position && ` (${inst.position})`}
                </span>
              </div>
            )}
            {!inst.controller && isDiscord && (
              <div className="flex items-center gap-1.5">
                <MessageCircle className="h-3 w-3" />
                <span>Lancé via Discord (/atiscreate)</span>
              </div>
            )}
            {inst.voice_channel_name && (
              <div className="flex items-center gap-1.5">
                <Volume2 className="h-3 w-3" />
                <span>
                  #{inst.voice_channel_name}
                  {inst.voice_guild_name ? ` · ${inst.voice_guild_name}` : ''}
                  {!inst.voice_connected && (
                    <span className="ml-1 text-amber-400">(reconnexion...)</span>
                  )}
                </span>
              </div>
            )}
          </div>
        </>
      )}

      {!inst.broadcasting && inst.config.configured && (
        <div className={`text-xs ${textMuted} flex items-center gap-1.5`}>
          <Volume2 className="h-3 w-3" />
          <span>
            Cible : #{inst.config.discord_channel_name ?? '?'}
            {inst.config.discord_guild_name ? ` · ${inst.config.discord_guild_name}` : ''}
          </span>
        </div>
      )}

      {inst.desync && (
        <div
          className={`text-xs px-2 py-1.5 rounded-md flex items-start gap-1.5 ${
            isDark
              ? 'bg-amber-500/15 text-amber-200 border border-amber-500/40'
              : 'bg-amber-500/20 text-amber-300 border border-amber-500/50'
          }`}
        >
          <AlertTriangle className="h-3.5 w-3.5 shrink-0 mt-0.5" />
          <span>
            {inst.bot_broadcasting && !inst.db_broadcasting
              ? 'Bot en diffusion mais base non synchro. Cliquez Stop pour resynchroniser.'
              : 'Base marquée active mais bot inactif. Cliquez Stop pour nettoyer.'}
          </span>
        </div>
      )}
    </div>
  );
}

function BotErrorCard({
  isDark,
  error,
  retryCount,
  onRetry,
  lastFetch,
}: {
  isDark: boolean;
  error: string | null;
  retryCount: number;
  onRetry: () => void;
  lastFetch: number | null;
}) {
  const ageSeconds = lastFetch ? Math.floor((Date.now() - lastFetch) / 1000) : null;
  return (
    <div
      className={`p-4 rounded-lg text-sm ${
        isDark
          ? 'border border-amber-500/30 bg-amber-500/10 text-amber-100'
          : 'bg-amber-900/40 text-amber-100 border border-amber-600/50'
      }`}
    >
      <p className="font-semibold">Bot ATIS injoignable</p>
      {error && <p className="text-xs mt-2 font-mono bg-black/20 px-3 py-2 rounded-lg">{error}</p>}
      <p className="text-xs mt-2 opacity-95">
        Si Render (plan gratuit) : le bot peut mettre 1–2 min à démarrer après inactivité. Sinon, vérifiez{' '}
        <code>ATIS_WEBHOOK_URL</code> + <code>ATIS_WEBHOOK_SECRET</code>.
      </p>
      <div className="flex items-center justify-between mt-3 gap-2">
        <div className="text-[11px] opacity-80">
          Tentatives : {retryCount}
          {ageSeconds !== null && ` · dernière il y a ${ageSeconds}s`}
        </div>
        <button onClick={onRetry} className="text-xs font-medium underline hover:no-underline">
          Réessayer
        </button>
      </div>
    </div>
  );
}
