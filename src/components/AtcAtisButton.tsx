'use client';

import { getSharedAtisOverview, subscribeAtisPolling } from '@/lib/atis-overview-client';
import AtisDraftPreview from '@/components/AtisDraftPreview';
import CopyAtisButton from '@/components/CopyAtisButton';
import { fetchJson } from '@/lib/fetch-json';

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
import {
  APPROACH_TYPES,
  RUNWAY_CONDITIONS,
  atisKindForPosition,
  buildAtisPatchBody,
  firDisplayName,
  firOf,
  isAtisDraftReady,
  mergeTmaDraft,
  runwaysOf,
  tmaAirportsFor,
  tmaIntroPreview,
  type AtisEntitlement,
  type AtisKind,
  type TmaAirportCatalog,
  type TmaAirportDraft,
} from '@/lib/atis-priority';
import { ATC_NAV_BTN, atcNavIdle, atcNavOpen } from '@/lib/atc-ui';

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
  priority: AtisEntitlement | null;
  online_atc?: { user_id: string; aeroport: string; position: string; identifiant: string | null }[];
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


type Tab = 'status' | 'config' | 'data';

function draftStorageKey(userId: string, aeroport: string, position: string) {
  return `atis-draft:${userId}:${aeroport}:${position}`;
}

function atisFingerprint(data: AtisData | null, tma: TmaAirportDraft[], kind: AtisKind): string {
  return JSON.stringify({
    code: data?.information_code ?? '',
    runway: data?.runway ?? '',
    expected_approach: data?.expected_approach ?? '',
    expected_runway: data?.expected_runway ?? '',
    runway_condition: data?.runway_condition ?? '',
    wind: data?.wind ?? '',
    visibility: data?.visibility ?? '',
    sky_condition: data?.sky_condition ?? '',
    temperature: data?.temperature ?? '',
    dewpoint: data?.dewpoint ?? '',
    qnh: data?.qnh ?? '',
    transition_level: data?.transition_level ?? '',
    remarks: data?.remarks ?? '',
    cavok: Boolean(data?.cavok),
    bilingual: Boolean(data?.bilingual_mode),
    tma:
      kind === 'tma'
        ? tma.map((a) => ({
            icao: a.icao,
            included: a.included,
            runways: a.runways,
            condition: a.condition,
            approach: a.approach ?? '',
          }))
        : [],
  });
}

function toggleToken(current: string, token: string): string {
  const parts = current.split(/[\s,/]+/).filter(Boolean);
  const next = parts.includes(token) ? parts.filter((p) => p !== token) : [...parts, token];
  return next.join(' ');
}

export default function AtcAtisButton({ aeroport, position, userId }: AtcAtisButtonProps) {
  const { theme } = useAtcTheme();
  const isDark = theme === 'dark';
  const triggerRef = useRef<HTMLButtonElement>(null);
  const [anchor, setAnchor] = useState<{ left: number; top: number; width: number } | null>(null);

  // ---------------------------------------------------------------------------
  // Etat panneau
  // ---------------------------------------------------------------------------
  const [isOpen, setIsOpen] = useState(false);

  // Le panneau se place sous son bouton plutôt que dans un coin de l'écran.
  useEffect(() => {
    if (!isOpen) return;
    const place = () => {
      const r = triggerRef.current?.getBoundingClientRect();
      if (!r) return;
          const width = Math.min(520, window.innerWidth - 16);
      setAnchor({
        left: Math.max(8, Math.min(r.left, window.innerWidth - width - 8)),
        top: r.bottom + 6,
        width,
      });
    };
    place();
    window.addEventListener('resize', place);
    return () => window.removeEventListener('resize', place);
  }, [isOpen]);

  const [tab, setTab] = useState<Tab>('config');
  const [overview, setOverview] = useState<OverviewResponse | null>(null);
  const [overviewLoading, setOverviewLoading] = useState(false);
  const [overviewLastFetch, setOverviewLastFetch] = useState<number | null>(null);
  const [retryCount, setRetryCount] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [actionLoading, setActionLoading] = useState(false);

  // Donnees ATIS detaillees (uniquement chargees onglet "data")
  const [atisData, setAtisData] = useState<AtisData | null>(null);

  // Configuration Discord (par instance)
  const [configInstanceId, setConfigInstanceId] = useState<number>(1);
  const [selectedGuildId, setSelectedGuildId] = useState<string>('');
  const [selectedChannelId, setSelectedChannelId] = useState<string>('');
  const [channels, setChannels] = useState<{ id: string; name: string }[]>([]);
  const [savingConfig, setSavingConfig] = useState(false);
  const configInitializedForRef = useRef<number | null>(null);

  // Demarrage : choix du bot cible (auto par defaut)
  const [startTargetInstance, setStartTargetInstance] = useState<number | 'auto'>('auto');
  const [tmaDraft, setTmaDraft] = useState<TmaAirportDraft[]>([]);
  const [draftHydrated, setDraftHydrated] = useState(false);
  const [publishedKey, setPublishedKey] = useState<string | null>(null);
  const snapshotInitRef = useRef(false);

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
  const aeroportCode = useMemo(() => String(aeroport || '').trim().toUpperCase(), [aeroport]);
  const atisKind = atisKindForPosition(position);
  const priority = overview?.priority ?? null;
  const canConfigure = priority?.can_configure ?? true;
  const myFir = priority?.fir ?? firOf(aeroportCode);
  const tmaCatalog = useMemo(() => tmaAirportsFor(aeroportCode, myFir), [aeroportCode, myFir]);
  const localRunways = useMemo(() => runwaysOf(aeroportCode), [aeroportCode]);
  /** Bots en conflit réel pour CE type d'ATIS (aéroport et TMA peuvent coexister). */
  const liveBotsOnThisAirport = useMemo(() => {
    return instances.filter((i) => {
      if (!i.bot_broadcasting) return false;
      const liveKind = atisKindForPosition(i.position ?? '');
      if (atisKind === 'airport') {
        const code = String(i.airport ?? i.aeroport ?? '')
          .trim()
          .toUpperCase();
        return code === aeroportCode && (liveKind === 'airport' || !i.position);
      }
      const liveFir = firOf(String(i.aeroport ?? i.airport ?? ''));
      return liveKind === 'tma' && Boolean(myFir && liveFir === myFir);
    });
  }, [instances, aeroportCode, atisKind, myFir]);
  const botDesyncDbFalse = useMemo(
    () => instances.filter((i) => i.desync && i.bot_broadcasting && !i.db_broadcasting),
    [instances]
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

  const anyBotConfigured = instances.some((i) => i.config.configured);
  const targetBotConfigured =
    startTargetInstance === 'auto'
      ? instances.some((i) => i.config.configured && !i.broadcasting)
      : Boolean(instances.find((i) => i.instance_id === startTargetInstance)?.config.configured);
  const draftReady = isAtisDraftReady(atisKind, atisData?.runway, tmaDraft);
  const draftFingerprint = useMemo(
    () => atisFingerprint(atisData, tmaDraft, atisKind),
    [atisData, tmaDraft, atisKind]
  );
  const atisDirty = Boolean(
    broadcasting && myInstance?.is_mine && publishedKey !== null && draftFingerprint !== publishedKey
  );
  const canStart =
    !broadcasting &&
    canConfigure &&
    targetBotConfigured &&
    draftReady &&
    liveBotsOnThisAirport.length === 0;

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
      const data = await getSharedAtisOverview<OverviewResponse>();
      if ('instances' in data) {
        setOverview(data);
        setOverviewLastFetch(Date.now());
        setRetryCount(0);
      } else {
        setError('État ATIS indisponible.');
      }
    } catch {
      setError('Erreur réseau (overview)');
    } finally {
      setOverviewLoading(false);
    }
  }, []);

  const channelRequestRef = useRef(0);
  const fetchChannels = useCallback(async (guildId: string) => {
    const requestId = ++channelRequestRef.current;
    setChannels([]);
    if (!guildId) {
      setChannels([]);
      return;
    }
    try {
      const res = await fetch(`/api/atc/atis/discord-channels?guild_id=${encodeURIComponent(guildId)}`);
      const data = await res.json();
      if (requestId !== channelRequestRef.current) return;
      setChannels(res.ok && data?.channels ? data.channels : []);
      if (!res.ok) setError(data?.error || 'Impossible de charger les salons Discord.');
    } catch {
      if (requestId === channelRequestRef.current) {
        setChannels([]);
        setError('Impossible de charger les salons Discord. Vérifiez votre connexion.');
      }
    }
  }, []);

  const dataInFlight = useRef(false);
  const fetchAtisData = useCallback(async () => {
    if (dataInFlight.current) return null;
    dataInFlight.current = true;
    try {
      const data = await fetchJson<AtisData & { tma_airports?: Array<{ icao?: string; name?: string; runways?: string; condition?: string; approach?: string }> }>('/api/atc/atis/atis-data');
      {
        let nextTma = tmaDraft;
        if (Array.isArray(data.tma_airports) && data.tma_airports.length) {
          const hasLocalRunways = tmaDraft.some((a) => a.included && a.runways.trim());
          if (!hasLocalRunways) {
            const fromBot: TmaAirportDraft[] = data.tma_airports.map(
              (a: { icao?: string; name?: string; runways?: string; condition?: string; approach?: string }) => ({
                icao: String(a.icao ?? '').toUpperCase(),
                nom: String(a.name ?? a.icao ?? ''),
                included: true,
                runways: String(a.runways ?? ''),
                condition: String(a.condition ?? 'dry'),
                approach: String(a.approach ?? ''),
              })
            );
            nextTma = mergeTmaDraft(fromBot, tmaCatalog, true);
            setTmaDraft(nextTma);
          }
        }
        setAtisData(data);
        if (!snapshotInitRef.current) {
          snapshotInitRef.current = true;
          setPublishedKey(atisFingerprint(data, nextTma, atisKind));
        }
        return data as AtisData;
      }
    } catch {
      setError('Les données ATIS n’ont pas pu être actualisées. Le brouillon a été conservé.');
    } finally {
      dataInFlight.current = false;
    }
    return null;
  }, [tmaDraft, tmaCatalog, atisKind]);

  // ---------------------------------------------------------------------------
  // Polling
  // ---------------------------------------------------------------------------
  useEffect(() => {
    return subscribeAtisPolling(() => { void fetchOverview(); });
  }, [fetchOverview]);

  useEffect(() => {
    if (isOpen) {
      fetchOverview();
    }
  }, [isOpen, fetchOverview]);

  useEffect(() => {
    if (isOpen && tab === 'data') {
      if (document.visibilityState !== 'hidden' && broadcasting && !atisDirty) void fetchAtisData();
      const itv = setInterval(() => {
        if (document.visibilityState !== 'hidden' && broadcasting && !atisDirty) void fetchAtisData();
      }, 5000);
      return () => clearInterval(itv);
    }
  }, [isOpen, tab, fetchAtisData, broadcasting, atisDirty]);

  // Brouillon local (prepare avant diffusion).
  useEffect(() => {
    try {
      const raw = sessionStorage.getItem(draftStorageKey(userId, aeroportCode, position));
      if (raw) {
        const parsed = JSON.parse(raw) as { atis?: AtisData; tma?: TmaAirportDraft[] };
        if (parsed.atis) setAtisData((prev) => ({ ...prev, ...parsed.atis }));
        if (parsed.tma?.length) {
          setTmaDraft(
            parsed.tma.map((a) => ({
              ...a,
              condition: a.condition || 'dry',
              approach: a.approach ?? '',
            }))
          );
        }
      }
    } catch {
      /* ignore */
    }
    setDraftHydrated(true);
  }, [userId, aeroportCode, position]);

  useEffect(() => {
    if (!draftHydrated) return;
    setTmaDraft((prev) => {
      const next = mergeTmaDraft(prev, tmaCatalog);
      return JSON.stringify(prev) === JSON.stringify(next) ? prev : next;
    });
  }, [draftHydrated, tmaCatalog]);

  useEffect(() => {
    if (!draftHydrated) return;
    try {
      sessionStorage.setItem(
        draftStorageKey(userId, aeroportCode, position),
        JSON.stringify({ atis: atisData, tma: tmaDraft })
      );
    } catch {
      /* ignore */
    }
  }, [atisData, tmaDraft, userId, aeroportCode, position, draftHydrated]);

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

  useEffect(() => {
    if (!broadcasting) {
      snapshotInitRef.current = false;
      setPublishedKey(null);
    }
  }, [broadcasting]);

  // ---------------------------------------------------------------------------
  // Actions
  // ---------------------------------------------------------------------------
  const handleStart = async () => {
    if (broadcasting || actionLoading || !canStart) return;
    setActionLoading(true);
    try {
      const body: {
        aeroport: string;
        position: string;
        instance_id?: number;
        atis_payload?: AtisData;
        tma_airports?: TmaAirportDraft[];
      } = {
        aeroport,
        position,
        atis_payload: atisData ?? {},
        tma_airports: tmaDraft,
      };
      if (startTargetInstance !== 'auto') body.instance_id = startTargetInstance;
      await apiCall('/api/atc/atis/start', { method: 'POST', body });
      await fetchOverview();
      const live = await fetchAtisData();
      snapshotInitRef.current = true;
      setPublishedKey(atisFingerprint(live ?? atisData, tmaDraft, atisKind));
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
      snapshotInitRef.current = false;
      setPublishedKey(null);
      await fetchOverview();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erreur à l'arrêt");
    } finally {
      setActionLoading(false);
    }
  };

  const pushLivePatch = async (updates: Record<string, unknown>, tmaOverride?: TmaAirportDraft[]) => {
    if (!broadcasting || !myInstance?.is_mine) return;
    const payload = buildAtisPatchBody({
      aeroport: aeroportCode,
      kind: atisKind,
      fir: myFir,
      draft: { ...(atisData ?? {}), ...updates },
      tmaAirports: tmaOverride ?? tmaDraft,
    });
    const data = await apiCall('/api/atc/atis/atis-data', { method: 'PATCH', body: payload });
    setAtisData((prev) => ({ ...prev, ...updates, ...data?.data }));
  };

  const updateDraft = (updates: Partial<AtisData>) => {
    setAtisData((prev) => ({ ...prev, ...updates }));
  };

  const handleApplyAtis = async () => {
    if (actionLoading || !broadcasting || !myInstance?.is_mine) return;
    setActionLoading(true);
    try {
      const pending: AtisData = { ...(atisData ?? {}) };
      const payload = buildAtisPatchBody({
        aeroport: aeroportCode,
        kind: atisKind,
        fir: myFir,
        draft: pending,
        tmaAirports: tmaDraft,
      });
      payload.bilingual_mode = Boolean(pending.bilingual_mode);
      payload.information_code = pending.information_code || 'A';
      const data = await apiCall('/api/atc/atis/replay', { method: 'POST', body: payload });
      const merged: AtisData = {
        ...pending,
        ...(data?.data ?? {}),
        bilingual_mode: data?.bilingual_mode ?? pending.bilingual_mode,
      };
      if (pending.information_code) merged.information_code = pending.information_code;
      setAtisData(merged);
      setPublishedKey(atisFingerprint(merged, tmaDraft, atisKind));
      if (data?.warning) setError(String(data.warning));
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Erreur lors de la mise à jour ATIS');
    } finally {
      setActionLoading(false);
    }
  };

  const handleCodeChange = (code: string) => {
    setAtisData((prev) => (prev ? { ...prev, information_code: code } : { information_code: code }));
  };

  const handleToggleCavok = () => {
    setAtisData((prev) => ({ ...prev, cavok: !prev?.cavok }));
  };

  const handleToggleBilingual = () => {
    setAtisData((prev) => ({ ...prev, bilingual_mode: !prev?.bilingual_mode }));
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
    if (!guildId || !channelId || !channelName) {
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

  const liveCount = instances.filter((i) => i.broadcasting).length;

  // Au repos, le bouton est strictement identique aux autres liens de la barre.
  const navAtisTone = broadcasting
    ? (isDark ? 'border-red-700/60 bg-red-950/80 text-red-100' : 'border-red-300 bg-red-50 text-red-900')
    : anyBroadcasting
      ? (isDark ? 'border-amber-700/60 bg-amber-950/80 text-amber-100' : 'border-amber-300 bg-amber-50 text-amber-900')
      : isOpen ? atcNavOpen(isDark) : atcNavIdle(isDark);

  const atisTrigger = (
    <button
      ref={triggerRef}
      type="button"
      onClick={() => setIsOpen((open) => !open)}
      className={`${ATC_NAV_BTN} relative ${navAtisTone}`}
      title={
        broadcasting
          ? `ATIS en direct depuis ${isFromDiscord ? 'Discord' : 'la console'} — cliquer pour gérer`
          : anyBroadcasting
            ? `ATIS actif ailleurs (${liveCount}/${instances.length}) — cliquer pour voir`
            : 'Panneau ATIS'
      }
      aria-expanded={isOpen}
      aria-label="Panneau ATIS"
    >
      <Radio className="h-4 w-4" />
      <span className="hidden sm:inline">ATIS</span>
      {anyBroadcasting && (
        <span className="absolute -right-1 -top-1 flex h-2.5 w-2.5">
          <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-red-400 opacity-75" />
          <span className={`relative inline-flex h-2.5 w-2.5 rounded-full ${broadcasting ? 'bg-red-500' : 'bg-amber-400'}`} />
        </span>
      )}
    </button>
  );

  if (!isOpen || !anchor) return atisTrigger;

  // ---------------------------------------------------------------------------
  // Panneau ouvert
  // ---------------------------------------------------------------------------
  const d = atisData;

  const tabs: { id: Tab; label: string; icon: React.ReactNode }[] = [
    { id: 'config', label: 'Bots', icon: <Settings2 className="h-4 w-4" /> },
    { id: 'data', label: 'Préparer', icon: <Volume2 className="h-4 w-4" /> },
    { id: 'status', label: 'Diffuser', icon: <Server className="h-4 w-4" /> },
  ];

  const canEditAtis = canConfigure && (!broadcasting || Boolean(myInstance?.is_mine));
  const startLabel =
    atisKind === 'tma'
      ? `Démarrer ATIS TMA — ${firDisplayName(myFir) || aeroport}`
      : `Démarrer ATIS — ${aeroport}`;

  return (
    <>
    {atisTrigger}
    <div
      className={`fixed ${bgMain} flex flex-col overflow-hidden rounded-2xl shadow-2xl`}
      style={{
        left: anchor.left, top: anchor.top, width: anchor.width, zIndex: 70,
        maxHeight: `calc(100dvh - ${anchor.top + 12}px)`,
      }}
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
        <ol className="grid grid-cols-3 gap-2 text-xs" aria-label="Étapes de préparation ATIS">
          <li><button type="button" onClick={()=>setTab('config')} className="w-full rounded border border-slate-600 p-2">1. Serveur et salon {targetBotConfigured ? '✓' : ''}</button></li>
          <li><button type="button" onClick={()=>setTab('data')} className="w-full rounded border border-slate-600 p-2">2. {atisKind==='tma'?'FIR et pistes TMA':'Piste et météo'} {draftReady ? '✓' : ''}</button></li>
          <li><button type="button" onClick={()=>setTab('status')} className="w-full rounded border border-slate-600 p-2">3. Contrôler et diffuser</button></li>
        </ol>
        {tab === 'data' && <AtisDraftPreview ready={draftReady} text={[
          atisKind === 'tma' ? tmaIntroPreview(myFir ?? aeroportCode, tmaDraft) : `${aeroportCode} information ${atisData?.information_code || 'Alpha'}.`,
          atisKind === 'tma' ? '' : `Runway ${atisData?.runway || 'not set'}. Expected approach ${atisData?.expected_approach || 'not set'}.`,
          `Wind ${atisData?.wind || 'not set'}. Visibility ${atisData?.cavok ? 'CAVOK' : atisData?.visibility || 'not set'}. Temperature ${atisData?.temperature || 'not set'}. QNH ${atisData?.qnh || 'not set'}.`,
          atisData?.remarks || '',
        ].filter(Boolean).join('\n')} />}
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

        {priority && !canConfigure && (
          <div
            className={`text-sm px-3 py-2.5 rounded-lg border flex gap-2 ${
              isDark
                ? 'bg-amber-500/12 border-amber-500/40 text-amber-100'
                : 'bg-amber-500/20 border-amber-500/50 text-amber-950'
            }`}
          >
            <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" />
            <p>
              <span className="font-semibold">Configuration réservée.</span>{' '}
              {priority.reason}
            </p>
          </div>
        )}

        {priority && canConfigure && (
          <p className={`text-xs ${textMuted}`}>
            {atisKind === 'tma'
              ? `ATIS TMA ${firDisplayName(myFir) || ''} — vous êtes prioritaire (${position}). DEP {'>'} APP {'>'} Centre.`
              : `ATIS ${aeroportCode} — vous êtes prioritaire (${position}). TWR {'>'} Sol {'>'} DEL.`}
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
            {botDesyncDbFalse.length > 0 && (
              <div
                className={`text-sm px-3 py-2.5 rounded-lg border flex gap-2 ${
                  isDark
                    ? 'bg-amber-500/12 border-amber-500/40 text-amber-100'
                    : 'bg-amber-500/20 border-amber-500/50 text-amber-950'
                }`}
              >
                <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" />
                <p>
                  <span className="font-semibold">Base non synchronisée avec Discord.</span> Utilisez le bouton{' '}
                  <strong className="text-white">Stop</strong> sur la ligne du bot concerné (en haut de cette fenêtre), pas uniquement un
                  redémarrage par « Démarrer ». Si l&apos;arrêt échoue, le message d&apos;erreur indiquera la cause (bot, réseau, secret).
                </p>
              </div>
            )}

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
            <div className={`pt-3 border-t ${borderCl} space-y-2`}>
              {!broadcasting && (
                <>
                  <div className={`rounded-lg px-3 py-2 text-xs space-y-1 ${cardCl}`}>
                    <p className={`font-semibold ${textValue}`}>Avant de diffuser</p>
                    <p className={anyBotConfigured ? 'text-emerald-400' : 'text-amber-300'}>
                      {anyBotConfigured ? '✓' : '1.'} Bot Discord configuré
                      {!anyBotConfigured && (
                        <button type="button" onClick={() => setTab('config')} className="ml-1 underline">
                          (onglet Bots)
                        </button>
                      )}
                    </p>
                    <p className={draftReady ? 'text-emerald-400' : 'text-amber-300'}>
                      {draftReady ? '✓' : '2.'} Message ATIS préparé
                      {!draftReady && (
                        <button type="button" onClick={() => setTab('data')} className="ml-1 underline">
                          (onglet Préparer)
                        </button>
                      )}
                    </p>
                    <p className={canConfigure ? 'text-emerald-400' : 'text-amber-300'}>
                      {canConfigure ? '✓' : '3.'} Priorité de poste
                    </p>
                  </div>

                  {/* Choix bot cible */}
                  <div className="flex items-center justify-between gap-2 mb-2">
                    <span className={`text-xs ${textMuted}`}>Diffuser sur</span>
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
                    disabled={actionLoading || !canStart}
                    title={
                      !canConfigure
                        ? priority?.reason ?? 'Priorité insuffisante'
                        : !targetBotConfigured
                          ? 'Configurez d’abord un bot (onglet Bots).'
                          : !draftReady
                            ? 'Préparez d’abord l’ATIS (onglet Préparer).'
                            : liveBotsOnThisAirport.length > 0
                              ? `Coupez d'abord l'ATIS sur le${liveBotsOnThisAirport.length > 1 ? 's' : ''} bot ${liveBotsOnThisAirport.map((b) => b.instance_id).join(', ')} (Stop sur la carte).`
                              : undefined
                    }
                    className="w-full flex items-center justify-center gap-2 py-3 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-white font-semibold text-base disabled:opacity-50"
                  >
                    <Play className="h-5 w-5" />
                    {startLabel}
                  </button>
                </>
              )}
              {broadcasting && (
                <>
                  {myInstance?.is_mine && atisDirty && canConfigure && (
                    <button
                      type="button"
                      onClick={() => void handleApplyAtis()}
                      disabled={actionLoading}
                      className="w-full flex items-center justify-center gap-2 py-3 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-white font-semibold text-base disabled:opacity-50"
                    >
                      <Pencil className="h-5 w-5" />
                      {actionLoading ? 'Mise à jour…' : 'Modifier ATIS'}
                    </button>
                  )}
                  <button
                    onClick={() => handleStop()}
                    disabled={actionLoading}
                    className="w-full flex items-center justify-center gap-2 py-3 rounded-xl bg-red-500 hover:bg-red-400 text-white font-semibold text-base disabled:opacity-50"
                  >
                    <Square className="h-5 w-5" />
                    Arrêter mon ATIS{isFromDiscord ? ' (Discord)' : ''}
                  </button>
                </>
              )}
            </div>
          </>
        )}

        {/* ============ TAB : CONFIG ============ */}
        {tab === 'config' && (
          <>
            <div className={`flex items-center gap-2 ${isDark ? 'text-slate-100' : 'text-slate-100'}`}>
              <Headphones className={`h-5 w-5 ${textMuted}`} />
              <span className="font-semibold text-base">Bots Discord — à configurer avant de diffuser</span>
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
                  disabled={!selectedGuildId || channels.length === 0}
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
                disabled={savingConfig || !selectedGuildId || !channels.some(c => c.id === selectedChannelId)}
                className={`w-full py-2.5 rounded-lg text-sm font-semibold ${btnCl} disabled:opacity-50`}
              >
                {savingConfig ? 'Enregistrement...' : `Enregistrer config Bot ${configInstanceId}`}
              </button>
              {anyBotConfigured && (
                <button
                  type="button"
                  onClick={() => setTab('data')}
                  className="w-full py-2 rounded-lg text-sm font-semibold bg-emerald-600 hover:bg-emerald-500 text-white"
                >
                  Continuer — préparer l&apos;ATIS
                </button>
              )}
            </div>
          </>
        )}

        {/* ============ TAB : DONNEES ATIS ============ */}
        {tab === 'data' && (
          <>
            <div className={`rounded-lg px-3 py-2 text-xs ${cardCl}`}>
              {atisKind === 'tma' ? (
                <p>
                  <span className="font-semibold">ATIS TMA</span> — cochez les terrains réellement desservis, saisissez leurs pistes, puis la météo TMA (un bulletin pour toute la TMA).
                </p>
              ) : (
                <p>
                  <span className="font-semibold">ATIS aéroport</span> — tous les champs ci-dessous sont éditables. Un seul contrôleur par terrain (TWR {'>'} Sol {'>'} DEL).
                </p>
              )}
            </div>

            {!canConfigure && (
              <p className={`text-sm ${textMuted}`}>
                Vous pouvez consulter le brouillon, mais seul le contrôleur prioritaire peut le modifier.
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
                  if (atisKind === 'tma') {
                    return `${firDisplayName(myFir) || code} TMA`;
                  }
                  return apt ? `${apt.code} — ${apt.nom}` : (code || d?.airport_name || d?.airport || '—');
                })()}
              </Row>

              {atisKind === 'tma' && (
                <TmaAirportsEditor
                  airports={tmaDraft}
                  catalog={tmaCatalog}
                  primaryIcao={aeroportCode}
                  canEdit={canEditAtis}
                  isDark={isDark}
                  inputCl={inputCl}
                  cardCl={cardCl}
                  textMuted={textMuted}
                  textValue={textValue}
                  code={d?.information_code ?? 'A'}
                  onChange={(next) => {
                    setTmaDraft(next);
                    if (broadcasting && myInstance?.is_mine) return;
                    void pushLivePatch({}, next);
                  }}
                />
              )}

              <Field label="Code information" textMuted={textMuted}>
                <div className="flex items-center gap-2">
                  <select
                    value={d?.information_code || 'A'}
                    onChange={(e) => handleCodeChange(e.target.value)}
                    disabled={!canEditAtis}
                    className={`px-3 py-2 rounded-lg border font-semibold ${inputCl} disabled:opacity-50`}
                  >
                    {CODE_LETTERS.map((c) => (
                      <option key={c} value={c}>{c}</option>
                    ))}
                  </select>
                  {canEditAtis && (
                    <button
                      type="button"
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
              </Field>

              {atisKind !== 'tma' && (
                <>
                  <Field label="Pistes en service" textMuted={textMuted}>
                    {localRunways.length > 0 && (
                      <ChipRow
                        options={localRunways}
                        selected={d?.runway ?? ''}
                        disabled={!canEditAtis}
                        isDark={isDark}
                        onToggle={(rwy) => updateDraft({ runway: toggleToken(d?.runway ?? '', rwy) })}
                      />
                    )}
                    <input
                      className={`w-full px-3 py-2 rounded-lg border ${inputCl} disabled:opacity-50`}
                      placeholder="ex: 25L 25R"
                      disabled={!canEditAtis}
                      value={d?.runway ?? ''}
                      onChange={(e) => updateDraft({ runway: e.target.value })}
                    />
                  </Field>
                  <Field label="État des pistes" textMuted={textMuted}>
                    <select
                      className={`w-full px-3 py-2 rounded-lg border ${inputCl} disabled:opacity-50`}
                      disabled={!canEditAtis}
                      value={d?.runway_condition ?? 'dry'}
                      onChange={(e) => updateDraft({ runway_condition: e.target.value })}
                    >
                      {RUNWAY_CONDITIONS.map((c) => (
                        <option key={c.id} value={c.id}>{c.fr} ({c.en})</option>
                      ))}
                    </select>
                  </Field>
                  <Field label="Piste prévue" textMuted={textMuted}>
                    <input
                      className={`w-full px-3 py-2 rounded-lg border ${inputCl} disabled:opacity-50`}
                      placeholder="ex: 25L"
                      disabled={!canEditAtis}
                      value={d?.expected_runway ?? ''}
                      onChange={(e) => updateDraft({ expected_runway: e.target.value })}
                    />
                  </Field>
                </>
              )}

              {atisKind !== 'tma' && (
              <Field label="Approche prévue" textMuted={textMuted}>
                <ChipRow
                  options={[...APPROACH_TYPES]}
                  selected={d?.expected_approach ?? ''}
                  disabled={!canEditAtis}
                  isDark={isDark}
                  exclusive
                  onToggle={(type) =>
                    updateDraft({
                      expected_approach: (d?.expected_approach ?? '') === type ? '' : type,
                    })
                  }
                />
                <input
                  className={`w-full px-3 py-2 rounded-lg border ${inputCl} disabled:opacity-50`}
                  placeholder="ex: ILS"
                  disabled={!canEditAtis}
                  value={d?.expected_approach ?? ''}
                  onChange={(e) => updateDraft({ expected_approach: e.target.value })}
                />
              </Field>
              )}

              <Field label="Vent" textMuted={textMuted}>
                <input
                  className={`w-full px-3 py-2 rounded-lg border ${inputCl} disabled:opacity-50`}
                  placeholder="ex: 220/12KT"
                  disabled={!canEditAtis}
                  value={d?.wind ?? ''}
                  onChange={(e) => updateDraft({ wind: e.target.value })}
                />
              </Field>
              <Field label="Visibilité" textMuted={textMuted}>
                <input
                  className={`w-full px-3 py-2 rounded-lg border ${inputCl} disabled:opacity-50`}
                  placeholder="ex: 10KM ou 9999"
                  disabled={!canEditAtis || Boolean(d?.cavok)}
                  value={d?.cavok ? 'CAVOK' : (d?.visibility ?? '')}
                  onChange={(e) => updateDraft({ visibility: e.target.value })}
                />
              </Field>
              <Field label="Ciel" textMuted={textMuted}>
                <input
                  className={`w-full px-3 py-2 rounded-lg border ${inputCl} disabled:opacity-50`}
                  placeholder="ex: FEW020 SCT040"
                  disabled={!canEditAtis || Boolean(d?.cavok)}
                  value={d?.cavok ? 'CAVOK' : (d?.sky_condition ?? '')}
                  onChange={(e) => updateDraft({ sky_condition: e.target.value })}
                />
              </Field>
              <div className="grid grid-cols-2 gap-2">
                <Field label="Température" textMuted={textMuted}>
                  <input
                    className={`w-full px-3 py-2 rounded-lg border ${inputCl} disabled:opacity-50`}
                    placeholder="°C"
                    disabled={!canEditAtis}
                    value={d?.temperature ?? ''}
                    onChange={(e) => updateDraft({ temperature: e.target.value })}
                  />
                </Field>
                <Field label="Point de rosée" textMuted={textMuted}>
                  <input
                    className={`w-full px-3 py-2 rounded-lg border ${inputCl} disabled:opacity-50`}
                    placeholder="°C"
                    disabled={!canEditAtis}
                    value={d?.dewpoint ?? ''}
                    onChange={(e) => updateDraft({ dewpoint: e.target.value })}
                  />
                </Field>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <Field label="QNH" textMuted={textMuted}>
                  <input
                    className={`w-full px-3 py-2 rounded-lg border ${inputCl} disabled:opacity-50`}
                    placeholder="1013"
                    disabled={!canEditAtis}
                    value={d?.qnh ?? ''}
                    onChange={(e) => updateDraft({ qnh: e.target.value })}
                  />
                </Field>
                <Field label="Niveau de transition" textMuted={textMuted}>
                  <input
                    className={`w-full px-3 py-2 rounded-lg border ${inputCl} disabled:opacity-50`}
                    placeholder="ex: 100 ou FL100"
                    disabled={!canEditAtis}
                    value={d?.transition_level ?? ''}
                    onChange={(e) => updateDraft({ transition_level: e.target.value })}
                  />
                </Field>
              </div>
              <Field label="Remarques" textMuted={textMuted}>
                <textarea
                  className={`w-full px-3 py-2 rounded-lg border min-h-16 ${inputCl} disabled:opacity-50`}
                  placeholder="Remarques ATIS"
                  disabled={!canEditAtis}
                  value={d?.remarks ?? ''}
                  onChange={(e) => updateDraft({ remarks: e.target.value })}
                />
              </Field>
            </div>

            {canEditAtis && (
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
            {!broadcasting && draftReady && canConfigure && (
              <button
                type="button"
                onClick={() => setTab('status')}
                className="w-full py-2.5 rounded-lg text-sm font-semibold bg-emerald-600 hover:bg-emerald-500 text-white"
              >
                Continuer — diffuser
              </button>
            )}
            {broadcasting && myInstance?.is_mine && atisDirty && canConfigure && (
              <button
                type="button"
                onClick={() => void handleApplyAtis()}
                disabled={actionLoading}
                className="w-full py-2.5 rounded-lg text-sm font-semibold bg-emerald-600 hover:bg-emerald-500 text-white disabled:opacity-50 flex items-center justify-center gap-2"
              >
                <Pencil className="h-4 w-4" />
                {actionLoading ? 'Mise à jour…' : 'Modifier ATIS'}
              </button>
            )}
          </>
        )}
      </div>
    </div>
    </>
  );
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

function TmaAirportsEditor({
  airports,
  catalog,
  primaryIcao,
  canEdit,
  isDark,
  inputCl,
  cardCl,
  textMuted,
  textValue,
  code,
  onChange,
}: {
  airports: TmaAirportDraft[];
  catalog: TmaAirportCatalog[];
  primaryIcao: string;
  canEdit: boolean;
  isDark: boolean;
  inputCl: string;
  cardCl: string;
  textMuted: string;
  textValue: string;
  code: string;
  onChange: (next: TmaAirportDraft[]) => void;
}) {
  const preview = tmaIntroPreview(code, airports);
  const update = (icao: string, patch: Partial<TmaAirportDraft>) => {
    onChange(airports.map((a) => (a.icao === icao ? { ...a, ...patch } : a)));
  };

  return (
    <div className={`rounded-xl ${cardCl} p-3 space-y-2`}>
      <p className={`text-sm font-semibold ${textValue}`}>Terrains TMA</p>
      <p className={`text-[11px] ${textMuted}`}>
        Terrains principaux cochés par défaut. Les satellites (Barth, bases, etc.) sont optionnels. Décochez tout terrain inutilisé.
      </p>
      {airports.map((a) => {
        const meta = catalog.find((c) => c.icao === a.icao);
        const options = meta?.runways ?? runwaysOf(a.icao);
        const isPrimary = a.icao === primaryIcao;
        return (
          <div key={a.icao} className={`rounded-lg px-2 py-2 space-y-1.5 ${isDark ? 'bg-slate-900' : 'bg-slate-800'}`}>
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={a.included}
                disabled={!canEdit}
                onChange={(e) => update(a.icao, { included: e.target.checked })}
              />
              <span className={textValue}>
                {a.icao} — {a.nom}
              </span>
              <span className={`text-[10px] uppercase tracking-wide ${textMuted}`}>
                {meta?.core ? 'TMA' : 'satellite'}
                {isPrimary ? ' · poste' : ''}
              </span>
            </label>
            {a.included && (
              <>
                {options.length > 0 && (
                  <ChipRow
                    options={options}
                    selected={a.runways}
                    disabled={!canEdit}
                    isDark={isDark}
                    onToggle={(rwy) => update(a.icao, { runways: toggleToken(a.runways, rwy) })}
                  />
                )}
                <input
                  className={`w-full px-2 py-1.5 rounded-md border text-sm ${inputCl} disabled:opacity-50`}
                  placeholder="Pistes (ex: 25L 25R)"
                  disabled={!canEdit}
                  value={a.runways}
                  onChange={(e) => update(a.icao, { runways: e.target.value })}
                />
                <select
                  className={`w-full px-2 py-1.5 rounded-md border text-sm ${inputCl} disabled:opacity-50`}
                  disabled={!canEdit}
                  value={a.condition}
                  onChange={(e) => update(a.icao, { condition: e.target.value })}
                >
                  {RUNWAY_CONDITIONS.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.fr}
                    </option>
                  ))}
                </select>
                <ChipRow
                  options={[...APPROACH_TYPES]}
                  selected={a.approach ?? ''}
                  disabled={!canEdit}
                  isDark={isDark}
                  exclusive
                  onToggle={(type) => update(a.icao, { approach: a.approach === type ? '' : type })}
                />
                <input
                  className={`w-full px-2 py-1.5 rounded-md border text-sm ${inputCl} disabled:opacity-50`}
                  placeholder="Approche (optionnel, ex: ILS)"
                  disabled={!canEdit}
                  value={a.approach ?? ''}
                  onChange={(e) => update(a.icao, { approach: e.target.value })}
                />
              </>
            )}
          </div>
        );
      })}
      <p className={`text-[11px] leading-relaxed ${textMuted}`}>{preview}</p>
    </div>
  );
}

function Field({
  label,
  children,
  textMuted,
}: {
  label: string;
  children: React.ReactNode;
  textMuted: string;
}) {
  return (
    <div className="space-y-1.5">
      <span className={`text-xs font-semibold uppercase tracking-wide ${textMuted}`}>{label}</span>
      {children}
    </div>
  );
}

function ChipRow({
  options,
  selected,
  disabled,
  isDark,
  onToggle,
  exclusive = false,
}: {
  options: string[];
  selected: string;
  disabled: boolean;
  isDark: boolean;
  onToggle: (value: string) => void;
  exclusive?: boolean;
}) {
  const tokens = exclusive
    ? new Set(selected.trim() ? [selected.trim()] : [])
    : new Set(selected.split(/[\s,/]+/).filter(Boolean));
  return (
    <div className="flex flex-wrap gap-1">
      {options.map((opt) => {
        const active = tokens.has(opt);
        return (
          <button
            key={opt}
            type="button"
            disabled={disabled}
            onClick={() => onToggle(opt)}
            className={`px-2 py-1 rounded-md text-[11px] font-semibold disabled:opacity-50 ${
              active
                ? 'bg-sky-600 text-white'
                : isDark
                  ? 'bg-slate-800 border border-slate-700 text-slate-200'
                  : 'bg-slate-600 text-white'
            }`}
          >
            {opt}
          </button>
        );
      })}
    </div>
  );
}

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
            {atisKindForPosition(inst.position ?? '') === 'tma' && (
              <span className={`text-[10px] px-1.5 py-0.5 rounded ${isDark ? 'bg-violet-500/20 text-violet-300' : 'bg-violet-500/30 text-violet-200'}`}>
                TMA
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

      {inst.atis_text?.trim() && <CopyAtisButton text={inst.atis_text} />}
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
              ? 'Bot en diffusion mais la base ne l’indique pas. Utilisez le bouton Stop sur cette ligne pour couper le flux Discord, puis vérifiez le message s’il échoue.'
              : 'Base marquée active mais le bot ne diffuse pas. Cliquez Stop pour nettoyer l’enregistrement.'}
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
        Si le bot Railway est en cours de redéploiement, réessayez dans 1–2 min. Sinon, vérifiez{' '}
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
