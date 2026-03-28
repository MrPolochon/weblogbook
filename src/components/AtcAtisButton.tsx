'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { Radio, X, Play, Square, Pencil, Globe, Cloud, Headphones, AlertTriangle, RefreshCw, Monitor, MessageCircle } from 'lucide-react';
import { useAtcTheme } from '@/contexts/AtcThemeContext';
import { AEROPORTS_PTFS } from '@/lib/aeroports-ptfs';

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

export default function AtcAtisButton({ aeroport, position, userId }: AtcAtisButtonProps) {
  const { theme } = useAtcTheme();
  const isDark = theme === 'dark';
  const [isOpen, setIsOpen] = useState(false);
  const [broadcasting, setBroadcasting] = useState(false);
  const [controllingUserId, setControllingUserId] = useState<string | null>(null);
  const [statusAeroport, setStatusAeroport] = useState<string | null>(null);
  const [atisSource, setAtisSource] = useState<string | null>(null);
  const [atisCodeAutoRotate, setAtisCodeAutoRotate] = useState(false);
  const [autoRotateInProgress, setAutoRotateInProgress] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [atisData, setAtisData] = useState<AtisData | null>(null);
  const [editing, setEditing] = useState<string | null>(null);
  const [editValues, setEditValues] = useState<Record<string, string>>({});
  const [discordConfig, setDiscordConfig] = useState<{ discord_guild_id?: string; discord_guild_name?: string; discord_channel_id?: string; discord_channel_name?: string } | null>(null);
  const [selectedGuildId, setSelectedGuildId] = useState<string>('');
  const [selectedChannelId, setSelectedChannelId] = useState<string>('');
  const [guilds, setGuilds] = useState<{ id: string; name: string }[]>([]);
  const [channels, setChannels] = useState<{ id: string; name: string }[]>([]);
  const [savingConfig, setSavingConfig] = useState(false);
  const configInitializedRef = useRef(false);
  const alarmFiredRef = useRef(false);
  const [botReachable, setBotReachable] = useState<boolean | null>(null);
  const [botErrorDetail, setBotErrorDetail] = useState<string | null>(null);

  const isController = controllingUserId === userId;
  const canStart = !broadcasting;
  const canStop = broadcasting;
  const isFromDiscord = atisSource === 'discord';

  const fetchStatus = useCallback(async () => {
    try {
      const [statusRes, dataRes, configRes, guildsRes] = await Promise.all([
        fetch('/api/atc/atis/status'),
        fetch('/api/atc/atis/atis-data'),
        fetch('/api/atc/atis/config'),
        fetch('/api/atc/atis/discord-guilds'),
      ]);
      const statusData = await statusRes.json();
      const dataJson = await dataRes.json();
      const configJson = await configRes.json();
      const guildsJson = await guildsRes.json();
      if (statusRes.ok) {
        setBroadcasting(!!statusData.broadcasting);
        setControllingUserId(statusData.controlling_user_id ?? null);
        setStatusAeroport(statusData.aeroport ?? null);
        setAtisSource(statusData.source ?? null);
        setAtisCodeAutoRotate(!!statusData.atis_code_auto_rotate);
      }
      if (dataRes.ok && dataJson && !dataJson.error) {
        setAtisData(dataJson);
        setBotReachable(true);
        setBotErrorDetail(null);
      } else if (!dataRes.ok) {
        setBotReachable(false);
        setBotErrorDetail(dataJson?.error || `Erreur ${dataRes.status}`);
      }
      if (configRes.ok && configJson && !configJson.error) {
        setDiscordConfig(configJson);
        if (!configInitializedRef.current && configJson.discord_guild_id) {
          setSelectedGuildId(configJson.discord_guild_id);
          setSelectedChannelId(configJson.discord_channel_id || '');
          configInitializedRef.current = true;
        }
      }
      if (guildsRes.ok && guildsJson?.guilds) {
        setGuilds(guildsJson.guilds);
        if (guildsJson.guilds?.length > 0) {
          setBotReachable(true);
          setBotErrorDetail(null);
        }
      } else if (!guildsRes.ok) {
        setBotReachable(false);
        setBotErrorDetail(guildsJson?.error || `Erreur ${guildsRes.status}`);
      }
    } catch (e) {
      console.error('ATIS fetch:', e);
      setBotReachable(false);
      setBotErrorDetail('Erreur réseau');
    }
  }, []);

  const fetchChannels = useCallback(async (guildId: string) => {
    try {
      const res = await fetch(`/api/atc/atis/discord-channels?guild_id=${encodeURIComponent(guildId)}`);
      const data = await res.json();
      if (res.ok && data?.channels) setChannels(data.channels);
      else setChannels([]);
    } catch {
      setChannels([]);
    }
  }, []);

  useEffect(() => {
    fetchStatus();
    const interval = setInterval(fetchStatus, 5000);
    return () => clearInterval(interval);
  }, [fetchStatus]);

  useEffect(() => {
    if (selectedGuildId) {
      fetchChannels(selectedGuildId);
    } else {
      setChannels([]);
    }
  }, [selectedGuildId, fetchChannels]);

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

  const handleStart = async () => {
    if (!canStart || loading) return;
    setLoading(true);
    try {
      await apiCall('/api/atc/atis/start', { method: 'POST', body: { aeroport, position } });
      setBroadcasting(true);
      setControllingUserId(userId);
      setIsOpen(false);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Erreur au démarrage');
    } finally {
      setLoading(false);
    }
  };

  const handleStop = async () => {
    if (!canStop || loading) return;
    setLoading(true);
    try {
      await apiCall('/api/atc/atis/stop', { method: 'POST' });
      setBroadcasting(false);
      setControllingUserId(null);
      setAtisSource(null);
      setIsOpen(false);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Erreur à l\'arrêt');
    } finally {
      setLoading(false);
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

  const getObsolescenceStatus = useCallback(() => {
    const lu = atisData?.last_updated;
    if (!lu) return { status: 'unknown' as const, minutesLeft: null };
    try {
      const updated = new Date(lu).getTime();
      const now = Date.now();
      const elapsedMin = (now - updated) / 60000;
      const minutesLeft = Math.max(0, ATIS_VALID_MINUTES - elapsedMin);
      if (elapsedMin >= ATIS_VALID_MINUTES) return { status: 'obsolete' as const, minutesLeft: 0 };
      if (elapsedMin >= ATIS_WARN_MINUTES) return { status: 'warning' as const, minutesLeft: Math.round(minutesLeft) };
      return { status: 'ok' as const, minutesLeft: Math.round(minutesLeft) };
    } catch {
      return { status: 'unknown' as const, minutesLeft: null };
    }
  }, [atisData?.last_updated]);

  const obsStatus = getObsolescenceStatus();

  useEffect(() => {
    if (broadcasting && isController && (obsStatus.status === 'warning' || obsStatus.status === 'obsolete') && !alarmFiredRef.current) {
      alarmFiredRef.current = true;
      try {
        const ctx = new (window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext)();
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.frequency.value = 800;
        gain.gain.setValueAtTime(0.2, ctx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.3);
        osc.start(ctx.currentTime);
        osc.stop(ctx.currentTime + 0.3);
      } catch {
        // Ignore audio errors
      }
      try {
        if ('Notification' in window && Notification.permission === 'granted') {
          new Notification('ATIS weblogbook', {
            body: obsStatus.status === 'obsolete' ? 'ATIS obsolète — Mettez à jour le code' : `ATIS obsolète dans ~${obsStatus.minutesLeft} min`,
            icon: '/favicon.ico',
          });
        }
      } catch {
        // Ignore notification errors
      }
    }
    if (obsStatus.status === 'ok') alarmFiredRef.current = false;
  }, [broadcasting, isController, obsStatus.status, obsStatus.minutesLeft]);

  const handleToggleAutoRotate = async () => {
    const next = !atisCodeAutoRotate;
    try {
      await apiCall('/api/atc/atis/auto-code', { method: 'PATCH', body: { auto_rotate: next } });
      setAtisCodeAutoRotate(next);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Erreur');
    }
  };

  useEffect(() => {
    if (!broadcasting || !isController || !atisCodeAutoRotate || autoRotateInProgress || obsStatus.status !== 'obsolete') return;
    const code = atisData?.information_code;
    if (!code || code.length !== 1) return;
    const idx = CODE_LETTERS.indexOf(code);
    const nextCode = idx >= 0 ? CODE_LETTERS[(idx + 1) % 26] : 'A';
    setAutoRotateInProgress(true);
    apiCall('/api/atc/atis/atiscode', { method: 'POST', body: { code: nextCode } })
      .then(() => {
        setAtisData((prev) => prev ? { ...prev, information_code: nextCode, last_updated: new Date().toISOString() } : null);
      })
      .catch(() => {})
      .finally(() => setAutoRotateInProgress(false));
  }, [broadcasting, isController, atisCodeAutoRotate, autoRotateInProgress, obsStatus.status, atisData?.information_code]);

  const handleCodeChange = async (code: string) => {
    try {
      await apiCall('/api/atc/atis/atiscode', { method: 'POST', body: { code } });
      setAtisData((prev) => ({ ...prev, information_code: code }));
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

  const startEdit = (field: string, values: Record<string, string>) => {
    setEditing(field);
    setEditValues(values);
  };

  useEffect(() => {
    if (isOpen) {
      configInitializedRef.current = false;
      setBotReachable(null);
      setBotErrorDetail(null);
      fetchStatus();
    }
  }, [isOpen, fetchStatus]);

  const saveDiscordConfig = async () => {
    const guildId = selectedGuildId || guilds[0]?.id;
    const channelId = selectedChannelId || channels[0]?.id;
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
        body: { discord_guild_id: guildId, discord_guild_name: guildName, discord_channel_id: channelId, discord_channel_name: channelName },
      });
      setDiscordConfig({ discord_guild_id: guildId, discord_guild_name: guildName, discord_channel_id: channelId, discord_channel_name: channelName });
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Erreur');
    } finally {
      setSavingConfig(false);
    }
  };

  const saveEdit = () => {
    if (editing === 'runway') handlePatch({
      runway: editValues.runway || undefined,
      expected_approach: editValues.expected_approach || undefined,
      expected_runway: editValues.expected_runway || undefined,
      runway_condition: editValues.runway_condition || undefined,
    });
    if (editing === 'weather') handlePatch({
      wind: editValues.wind || undefined,
      visibility: editValues.visibility || undefined,
      sky_condition: editValues.sky_condition || undefined,
      temperature: editValues.temperature || undefined,
      dewpoint: editValues.dewpoint || undefined,
    });
    if (editing === 'qnh') handlePatch({
      qnh: editValues.qnh || undefined,
      transition_level: editValues.transition_level || undefined,
    });
    if (editing === 'remarks') handlePatch({ remarks: editValues.remarks || undefined });
  };

  const bgMain = isDark ? 'border border-slate-800/80 bg-gradient-to-b from-slate-950 via-slate-900 to-slate-900/95' : 'bg-gradient-to-b from-slate-800 to-slate-900';
  const textMain = isDark ? 'text-slate-50' : 'text-white';
  const textMuted = isDark ? 'text-slate-400 font-medium' : 'text-slate-200 font-medium';
  const textValue = isDark ? 'text-slate-100 font-semibold' : 'text-white font-semibold';
  const borderCl = isDark ? 'border-slate-800' : 'border-slate-500';
  const inputCl = isDark ? 'bg-slate-900 border-slate-700 text-slate-100 text-base placeholder:text-slate-500' : 'bg-slate-600 border-slate-400 text-white text-base';
  const btnCl = isDark ? 'bg-sky-500 hover:bg-sky-400 text-white shadow-lg shadow-sky-950/30' : 'bg-sky-600 hover:bg-sky-500 text-white';

  if (!isOpen) {
    return (
      <button
        onClick={() => setIsOpen(true)}
        className={`fixed bottom-4 left-4 z-50 ${bgMain} ${textMain} rounded-2xl shadow-xl px-4 py-3 flex items-center gap-3 transition-all duration-300 hover:scale-105 hover:shadow-2xl ${
          broadcasting ? 'ring-2 ring-red-500' : ''
        }`}
        title={broadcasting ? 'ATIS en cours — Cliquer pour gérer' : 'Panneau ATIS'}
      >
          <div className={`p-2 rounded-xl ${broadcasting ? 'bg-red-500/30' : isDark ? 'bg-amber-500/15' : 'bg-amber-500/20'}`}>
            <Radio className={`h-5 w-5 ${broadcasting ? 'text-red-500' : isDark ? 'text-amber-300' : 'text-amber-400'}`} />
        </div>
        <span className="font-medium">ATIS</span>
        {broadcasting && (
          <span className="flex items-center gap-1.5 text-xs">
            <span className="relative flex h-2 w-2">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-75" />
              <span className="relative inline-flex rounded-full h-2 w-2 bg-red-500" />
            </span>
            En direct
            {isFromDiscord && <MessageCircle className="h-3 w-3 ml-0.5 opacity-70" />}
            {!isFromDiscord && broadcasting && <Monitor className="h-3 w-3 ml-0.5 opacity-70" />}
          </span>
        )}
      </button>
    );
  }

  const d = atisData;
  const val = (v: string | null | undefined) => v ?? '—';

  return (
    <div className={`fixed left-4 bottom-4 z-50 ${bgMain} rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[85vh]`} style={{ width: 'min(420px, 95vw)' }}>
      <div className={`px-5 py-4 flex items-center justify-between border-b ${borderCl} flex-shrink-0`}>
        <div className="flex items-center gap-2">
          <Radio className={`h-5 w-5 ${isDark ? 'text-amber-300' : 'text-amber-400'}`} />
          <span className={`text-base font-bold ${textMain}`}>Panneau ATIS</span>
        </div>
        <button onClick={() => { setIsOpen(false); setError(null); setEditing(null); }} className={`p-1.5 rounded-lg ${isDark ? 'text-slate-400 hover:bg-slate-800 hover:text-slate-100' : 'hover:bg-slate-600 text-slate-200'}`}>
          <X className="h-3.5 w-3.5" />
        </button>
      </div>

      <div className={`flex-1 overflow-y-auto p-5 space-y-4 text-base ${isDark ? 'text-slate-100' : 'text-slate-100'}`}>
        {error && <p className={`text-base font-medium px-3 py-2 rounded-lg border ${isDark ? 'border-red-500/40 bg-red-500/12 text-red-300' : 'text-red-400 bg-red-500/20 border-red-500/50'}`}>{error}</p>}
        {botReachable === false && (
          <div className={`p-4 rounded-lg text-base ${isDark ? 'border border-amber-500/30 bg-amber-500/10 text-amber-100' : 'bg-amber-900/40 text-amber-100 border border-amber-600/50'}`}>
            <p className="font-semibold">Bot ATIS injoignable</p>
            {botErrorDetail && <p className="text-sm mt-2 font-mono bg-black/20 px-3 py-2 rounded-lg">{botErrorDetail}</p>}
            <p className="text-sm mt-2 opacity-95">
              Si Render (plan gratuit) : le bot peut mettre 1–2 min à démarrer. Sinon, vérifiez ATIS_WEBHOOK_URL + ATIS_WEBHOOK_SECRET dans weblogbook.
            </p>
            <button onClick={() => { setBotReachable(null); setBotErrorDetail(null); fetchStatus(); }} className="mt-3 text-sm font-medium underline hover:no-underline">
              Réessayer
            </button>
          </div>
        )}

        {/* Source indicator */}
        {broadcasting && (
          <div className={`flex items-center gap-2 px-4 py-3 rounded-lg text-sm font-medium ${
            isFromDiscord
              ? isDark ? 'border border-indigo-500/30 bg-indigo-500/10 text-indigo-200' : 'bg-indigo-500/20 text-indigo-300 border border-indigo-500/40'
              : isDark ? 'border border-emerald-500/30 bg-emerald-500/10 text-emerald-200' : 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/40'
          }`}>
            {isFromDiscord ? (
              <>
                <MessageCircle className="h-4 w-4 shrink-0" />
                <span>ATIS lancé depuis <strong>Discord</strong> (/atiscreate)</span>
              </>
            ) : (
              <>
                <Monitor className="h-4 w-4 shrink-0" />
                <span>ATIS lancé depuis le <strong>site</strong>{isController ? ' (par vous)' : ''}</span>
              </>
            )}
          </div>
        )}

        {/* Config Discord */}
        <div className={`pb-4 border-b ${borderCl}`}>
          <div className={`flex items-center gap-2 mb-3 ${isDark ? 'text-slate-100' : 'text-slate-100'}`}>
            <Headphones className={`h-5 w-5 ${textMuted}`} />
            <span className="font-semibold text-base">Discord</span>
          </div>
          <div className="space-y-3">
            <div>
              <label className={`block text-sm font-medium ${textMuted} mb-1`}>Serveur</label>
              <select
                value={selectedGuildId}
                onChange={(e) => { setSelectedGuildId(e.target.value); setSelectedChannelId(''); }}
                className={`w-full px-3 py-2 rounded-lg border ${inputCl}`}
              >
                <option value="">— Choisir —</option>
                {guilds.map((g) => (
                  <option key={g.id} value={g.id}>{g.name}</option>
                ))}
              </select>
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
              {savingConfig ? 'Enregistrement...' : 'Enregistrer'}
            </button>
          </div>
        </div>

        {/* Données actuelles */}
        <div className="space-y-3">
          {(obsStatus.status === 'warning' || obsStatus.status === 'obsolete') && broadcasting && (
            <div className={`flex items-center gap-2 px-4 py-3 rounded-lg text-base font-semibold ${
              obsStatus.status === 'obsolete'
                ? isDark ? 'border border-red-500/40 bg-red-500/14 text-red-200' : 'bg-red-500/20 text-red-400 border border-red-500/50'
                : isDark ? 'border border-amber-500/40 bg-amber-500/14 text-amber-200' : 'bg-amber-500/20 text-amber-400 border border-amber-500/50'
            }`}>
              <AlertTriangle className="h-5 w-5 shrink-0" />
              <span className="flex-1">
                {obsStatus.status === 'obsolete'
                  ? 'ATIS obsolète — Mettez à jour le code'
                  : `ATIS obsolète dans ~${obsStatus.minutesLeft} min`}
              </span>
              {obsStatus.status === 'obsolete' && atisCodeAutoRotate && isController && autoRotateInProgress && (
                <RefreshCw className="h-4 w-4 animate-spin" />
              )}
              {'Notification' in window && Notification.permission !== 'granted' && (
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
          <div className="flex justify-between items-center gap-3">
            <span className={`text-sm font-medium min-w-[80px] ${textMuted}`}>Aéroport</span>
            <span className={`text-right ${textValue}`}>
              {(() => {
                const code = broadcasting && !isController ? statusAeroport : aeroport;
                const apt = code ? AEROPORTS_PTFS.find((a) => a.code === code) : null;
                return apt ? `${apt.code} — ${apt.nom}` : (code || val(d?.airport_name || d?.airport) || '—');
              })()}
            </span>
          </div>
          <div className="flex justify-between items-center gap-3">
            <span className={`text-sm font-medium min-w-[80px] ${textMuted}`}>Code</span>
            <div className="flex items-center gap-2">
              <select
                value={d?.information_code ?? ''}
                onChange={(e) => handleCodeChange(e.target.value)}
                className={`px-3 py-2 rounded-lg border font-semibold ${inputCl}`}
              >
                {CODE_LETTERS.map((c) => (
                  <option key={c} value={c}>{c}</option>
                ))}
              </select>
              {isController && (
                <button
                  onClick={handleToggleAutoRotate}
                  title={atisCodeAutoRotate ? 'Mode auto : rotation du code quand obsolète' : 'Activer la rotation automatique du code'}
                  className={`flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-medium ${atisCodeAutoRotate ? 'bg-emerald-600 text-white' : isDark ? 'bg-slate-800 text-slate-100 border border-slate-700' : 'bg-slate-500 text-slate-100'} hover:opacity-90`}
                >
                  <RefreshCw className="h-4 w-4" />
                  Auto
                </button>
              )}
            </div>
          </div>
          <div className="flex justify-between items-center gap-3">
            <span className={`text-sm font-medium min-w-[80px] ${textMuted}`}>Piste</span>
            {editing === 'runway' ? (
              <div className="flex flex-col gap-2 flex-1">
                <input className={`px-3 py-2 rounded-lg border ${inputCl}`} placeholder="ex: 25L/25R" value={editValues.runway ?? ''} onChange={(e) => setEditValues((v) => ({ ...v, runway: e.target.value }))} />
                <input className={`px-3 py-2 rounded-lg border ${inputCl}`} placeholder="Approche prévue (anglais uniquement, ex: ILS)" value={editValues.expected_approach ?? ''} onChange={(e) => setEditValues((v) => ({ ...v, expected_approach: e.target.value }))} />
                <input className={`px-3 py-2 rounded-lg border ${inputCl}`} placeholder="Piste prévue (anglais uniquement, ex: 25)" value={editValues.expected_runway ?? ''} onChange={(e) => setEditValues((v) => ({ ...v, expected_runway: e.target.value }))} />
                <input className={`px-3 py-2 rounded-lg border ${inputCl}`} placeholder="Condition" value={editValues.runway_condition ?? ''} onChange={(e) => setEditValues((v) => ({ ...v, runway_condition: e.target.value }))} />
                <div className="flex gap-2">
                  <button onClick={saveEdit} className={`px-3 py-2 rounded-lg text-sm font-medium ${btnCl}`}>OK</button>
                  <button onClick={() => setEditing(null)} className={`px-3 py-2 rounded-lg text-sm font-medium ${isDark ? 'border border-slate-700 bg-slate-800 text-slate-100 hover:bg-slate-700' : 'bg-slate-500 text-white'}`}>Annuler</button>
                </div>
              </div>
            ) : (
              <button onClick={() => startEdit('runway', {
                runway: d?.runway ?? '',
                expected_approach: d?.expected_approach ?? '',
                expected_runway: d?.expected_runway ?? '',
                runway_condition: d?.runway_condition ?? '',
              })} className={`flex items-center gap-2 hover:underline text-right ${textValue}`}>
                <span className="max-w-[230px] truncate">
                  {val(d?.runway)} | {val(d?.expected_approach)} {d?.expected_runway ? `RWY ${d.expected_runway}` : ''} ({val(d?.runway_condition)})
                </span>
                <Pencil className="h-4 w-4 shrink-0" />
              </button>
            )}
          </div>
          <div className="flex justify-between items-center gap-3">
            <span className={`text-sm font-medium min-w-[80px] ${textMuted}`}>Vent</span>
            {editing === 'weather' ? (
              <div className="flex flex-col gap-2 flex-1">
                <input className={`px-3 py-2 rounded-lg border ${inputCl}`} placeholder="Vent" value={editValues.wind ?? ''} onChange={(e) => setEditValues((v) => ({ ...v, wind: e.target.value }))} />
                <input className={`px-3 py-2 rounded-lg border ${inputCl}`} placeholder="Visibilité" value={editValues.visibility ?? ''} onChange={(e) => setEditValues((v) => ({ ...v, visibility: e.target.value }))} />
                <input className={`px-3 py-2 rounded-lg border ${inputCl}`} placeholder="Ciel" value={editValues.sky_condition ?? ''} onChange={(e) => setEditValues((v) => ({ ...v, sky_condition: e.target.value }))} />
                <div className="flex gap-2">
                  <input className={`px-3 py-2 rounded-lg border w-20 ${inputCl}`} placeholder="Temp" value={editValues.temperature ?? ''} onChange={(e) => setEditValues((v) => ({ ...v, temperature: e.target.value }))} />
                  <input className={`px-3 py-2 rounded-lg border w-20 ${inputCl}`} placeholder="Rosée" value={editValues.dewpoint ?? ''} onChange={(e) => setEditValues((v) => ({ ...v, dewpoint: e.target.value }))} />
                </div>
                <div className="flex gap-2">
                  <button onClick={saveEdit} className={`px-3 py-2 rounded-lg text-sm font-medium ${btnCl}`}>OK</button>
                  <button onClick={() => setEditing(null)} className={`px-3 py-2 rounded-lg text-sm font-medium ${isDark ? 'border border-slate-700 bg-slate-800 text-slate-100 hover:bg-slate-700' : 'bg-slate-500 text-white'}`}>Annuler</button>
                </div>
              </div>
            ) : (
              <button onClick={() => startEdit('weather', {
                wind: d?.wind ?? '',
                visibility: d?.visibility ?? '',
                sky_condition: d?.sky_condition ?? '',
                temperature: d?.temperature ?? '',
                dewpoint: d?.dewpoint ?? '',
              })} className={`flex items-center gap-2 hover:underline text-right ${textValue}`}>
                {val(d?.wind)} <Pencil className="h-4 w-4 shrink-0" />
              </button>
            )}
          </div>
          {!editing && (
            <>
              <div className="flex justify-between items-center gap-3">
                <span className={`text-sm font-medium min-w-[80px] ${textMuted}`}>Visibilité</span>
                <span className={textValue}>{val(d?.visibility)}</span>
              </div>
              <div className="flex justify-between items-center gap-3">
                <span className={`text-sm font-medium min-w-[80px] ${textMuted}`}>Ciel</span>
                <span className={textValue}>{val(d?.sky_condition)}</span>
              </div>
              <div className="flex justify-between items-center gap-3">
                <span className={`text-sm font-medium min-w-[80px] ${textMuted}`}>Temp / Rosée</span>
                <span className={textValue}>{val(d?.temperature)}°C / {val(d?.dewpoint)}°C</span>
              </div>
            </>
          )}
          <div className="flex justify-between items-center gap-3">
            <span className={`text-sm font-medium min-w-[80px] ${textMuted}`}>QNH</span>
            {editing === 'qnh' ? (
              <div className="flex flex-col gap-2 items-stretch">
                <input className={`px-3 py-2 rounded-lg border w-24 ${inputCl}`} value={editValues.qnh ?? ''} onChange={(e) => setEditValues((v) => ({ ...v, qnh: e.target.value }))} placeholder="1013" />
                <input className={`px-3 py-2 rounded-lg border ${inputCl}`} value={editValues.transition_level ?? ''} onChange={(e) => setEditValues((v) => ({ ...v, transition_level: e.target.value }))} placeholder="Transition level manuel (ex: 100 ou FL100)" />
                <button onClick={saveEdit} className={`px-3 py-2 rounded-lg text-sm font-medium ${btnCl}`}>OK</button>
                <button onClick={() => setEditing(null)} className={`px-3 py-2 rounded-lg text-sm font-medium ${isDark ? 'border border-slate-700 bg-slate-800 text-slate-100 hover:bg-slate-700' : 'bg-slate-500 text-white'}`}>Annuler</button>
              </div>
            ) : (
              <button onClick={() => startEdit('qnh', { qnh: d?.qnh ?? '', transition_level: d?.transition_level ?? '' })} className={`flex items-center gap-2 hover:underline text-right ${textValue}`}>
                <span className="max-w-[230px] truncate">
                  {val(d?.qnh)} | TL {val(d?.transition_level)}
                </span>
                <Pencil className="h-4 w-4 shrink-0" />
              </button>
            )}
          </div>
          <div className="flex justify-between items-start gap-3">
            <span className={`text-sm font-medium min-w-[80px] pt-0.5 ${textMuted}`}>Remarques</span>
            {editing === 'remarks' ? (
              <div className="flex flex-col gap-2 flex-1 min-w-0">
                <textarea className={`px-3 py-2 rounded-lg border w-full min-h-14 ${inputCl}`} value={editValues.remarks ?? ''} onChange={(e) => setEditValues((v) => ({ ...v, remarks: e.target.value }))} placeholder="Remarques" />
                <div className="flex gap-2">
                  <button onClick={saveEdit} className={`px-3 py-2 rounded-lg text-sm font-medium ${btnCl}`}>OK</button>
                  <button onClick={() => setEditing(null)} className={`px-3 py-2 rounded-lg text-sm font-medium ${isDark ? 'border border-slate-700 bg-slate-800 text-slate-100 hover:bg-slate-700' : 'bg-slate-500 text-white'}`}>Annuler</button>
                </div>
              </div>
            ) : (
              <button onClick={() => startEdit('remarks', { remarks: d?.remarks ?? '' })} className={`flex items-center gap-2 hover:underline text-right max-w-[220px] truncate ${textValue}`}>
                {val(d?.remarks)} <Pencil className="h-4 w-4 shrink-0" />
              </button>
            )}
          </div>
        </div>

        {/* Toggles */}
        <div className={`flex gap-3 pt-4 border-t ${borderCl}`}>
          <button
            onClick={handleToggleCavok}
            className={`flex-1 py-2.5 rounded-lg text-sm font-semibold flex items-center justify-center gap-2 ${d?.cavok ? (isDark ? 'border border-emerald-500/30 bg-emerald-500/16 text-emerald-200' : 'bg-emerald-500/30 text-emerald-300') : 'bg-slate-500/40'} ${isDark ? 'text-slate-100 hover:bg-slate-800' : 'text-slate-100 hover:bg-slate-600'}`}
          >
            <Cloud className="h-4 w-4" />
            CAVOK {d?.cavok ? '✓' : ''}
          </button>
          <button
            onClick={handleToggleBilingual}
            className={`flex-1 py-2.5 rounded-lg text-sm font-semibold flex items-center justify-center gap-2 ${d?.bilingual_mode ? (isDark ? 'border border-emerald-500/30 bg-emerald-500/16 text-emerald-200' : 'bg-emerald-500/30 text-emerald-300') : 'bg-slate-500/40'} ${isDark ? 'text-slate-100 hover:bg-slate-800' : 'text-slate-100 hover:bg-slate-600'}`}
          >
            <Globe className="h-4 w-4" />
            EN+FR {d?.bilingual_mode ? '✓' : ''}
          </button>
        </div>

        {/* Actions Start/Stop */}
        <div className="flex gap-3 pt-4">
          {canStart && (
            <button onClick={handleStart} disabled={loading} className="flex-1 flex items-center justify-center gap-2 py-3 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-white font-semibold text-base disabled:opacity-50">
              <Play className="h-5 w-5" />
              Démarrer
            </button>
          )}
          {canStop && (
            <button onClick={handleStop} disabled={loading} className="flex-1 flex items-center justify-center gap-2 py-3 rounded-xl bg-red-500 hover:bg-red-400 text-white font-semibold text-base disabled:opacity-50">
              <Square className="h-5 w-5" />
              Arrêter{isFromDiscord ? ' (Discord)' : ''}
            </button>
          )}
        </div>
        {broadcasting && !isController && !isFromDiscord && (
          <p className={`text-xs text-center mt-2 ${isDark ? 'text-slate-500' : 'text-slate-400'}`}>
            Lancé par un autre ATC — vous pouvez quand même l&apos;arrêter
          </p>
        )}
      </div>
    </div>
  );
}
