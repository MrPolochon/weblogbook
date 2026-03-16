'use client';

import { useState, useEffect, useCallback } from 'react';
import { Radio, X, Play, Square, Pencil, Globe, Cloud, Headphones } from 'lucide-react';
import { useAtcTheme } from '@/contexts/AtcThemeContext';

interface AtisData {
  airport?: string;
  airport_name?: string;
  information_code?: string;
  runway?: string;
  runway_condition?: string;
  wind?: string;
  visibility?: string;
  sky_condition?: string;
  temperature?: string;
  dewpoint?: string;
  qnh?: string;
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

export default function AtcAtisButton({ aeroport, position, userId }: AtcAtisButtonProps) {
  const { theme } = useAtcTheme();
  const isDark = theme === 'dark';
  const [isOpen, setIsOpen] = useState(false);
  const [broadcasting, setBroadcasting] = useState(false);
  const [controllingUserId, setControllingUserId] = useState<string | null>(null);
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
  const [configInitialized, setConfigInitialized] = useState(false);

  const isController = controllingUserId === userId;
  const canStart = !broadcasting;
  const canStop = broadcasting && isController;
  const isGrayed = broadcasting && !isController;

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
      }
      if (dataRes.ok && dataJson && !dataJson.error) {
        setAtisData(dataJson);
      }
      if (configRes.ok && configJson && !configJson.error) {
        setDiscordConfig(configJson);
        if (!configInitialized && configJson.discord_guild_id) {
          setSelectedGuildId(configJson.discord_guild_id);
          setSelectedChannelId(configJson.discord_channel_id || '');
          setConfigInitialized(true);
        }
      }
      if (guildsRes.ok && guildsJson?.guilds) {
        setGuilds(guildsJson.guilds);
      }
    } catch (e) {
      console.error('ATIS fetch:', e);
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
      setConfigInitialized(false);
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
    if (editing === 'airport') handlePatch({ airport_name: editValues.airport_name || undefined });
    if (editing === 'runway') handlePatch({ runway: editValues.runway || undefined, runway_condition: editValues.runway_condition || undefined });
    if (editing === 'weather') handlePatch({
      wind: editValues.wind || undefined,
      visibility: editValues.visibility || undefined,
      sky_condition: editValues.sky_condition || undefined,
      temperature: editValues.temperature || undefined,
      dewpoint: editValues.dewpoint || undefined,
    });
    if (editing === 'qnh') handlePatch({ qnh: editValues.qnh || undefined });
    if (editing === 'remarks') handlePatch({ remarks: editValues.remarks || undefined });
  };

  const bgMain = isDark ? 'bg-gradient-to-b from-slate-100 to-slate-200' : 'bg-gradient-to-b from-slate-800 to-slate-900';
  const textMain = isDark ? 'text-slate-800' : 'text-slate-100';
  const textMuted = isDark ? 'text-slate-500' : 'text-slate-400';
  const borderCl = isDark ? 'border-slate-300' : 'border-slate-700';
  const inputCl = isDark ? 'bg-white border-slate-300 text-slate-800' : 'bg-slate-700 border-slate-600 text-slate-100';
  const btnCl = isDark ? 'bg-sky-500 hover:bg-sky-400 text-white' : 'bg-sky-600 hover:bg-sky-500 text-white';

  if (!isOpen) {
    return (
      <button
        onClick={() => setIsOpen(true)}
        disabled={isGrayed}
        className={`fixed bottom-4 left-4 z-50 ${bgMain} ${textMain} rounded-2xl shadow-xl px-4 py-3 flex items-center gap-3 transition-all duration-300 hover:scale-105 hover:shadow-2xl disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:scale-100 ${
          canStop ? 'ring-2 ring-red-500' : ''
        }`}
        title={isGrayed ? 'Un autre ATC contrôle le bot ATIS' : canStop ? 'Cliquer pour arrêter' : 'Panneau ATIS (comme /atiscreate)'}
      >
        <div className={`p-2 rounded-xl ${canStop ? 'bg-red-500/30' : isDark ? 'bg-amber-100' : 'bg-amber-500/20'}`}>
          <Radio className={`h-5 w-5 ${canStop ? 'text-red-500' : isDark ? 'text-amber-600' : 'text-amber-400'}`} />
        </div>
        <span className="font-medium">ATIS</span>
        {broadcasting && <span className="text-xs opacity-80">● En direct</span>}
      </button>
    );
  }

  const d = atisData;
  const val = (v: string | null | undefined) => v ?? '—';

  return (
    <div className={`fixed left-4 bottom-4 z-50 ${bgMain} rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[85vh]`} style={{ width: '340px' }}>
      <div className={`px-4 py-3 flex items-center justify-between border-b ${borderCl} flex-shrink-0`}>
        <div className="flex items-center gap-2">
          <Radio className={`h-4 w-4 ${isDark ? 'text-amber-600' : 'text-amber-400'}`} />
          <span className={`text-sm font-semibold ${textMain}`}>Panneau ATIS</span>
        </div>
        <button onClick={() => { setIsOpen(false); setError(null); setEditing(null); }} className={`p-1.5 rounded-lg ${isDark ? 'hover:bg-slate-300' : 'hover:bg-slate-700'}`}>
          <X className={`h-3.5 w-3.5 ${textMuted}`} />
        </button>
      </div>

      <div className={`flex-1 overflow-y-auto p-4 space-y-3 ${isDark ? 'text-slate-700' : 'text-slate-300'} text-sm`}>
        {error && <p className="text-red-500 text-sm">{error}</p>}

        {/* Config Discord */}
        <div className={`pb-3 border-b ${borderCl}`}>
          <div className="flex items-center gap-2 mb-2">
            <Headphones className={`h-4 w-4 ${textMuted}`} />
            <span className="font-medium">Discord</span>
          </div>
          <div className="space-y-2">
            <div>
              <label className={`text-xs ${textMuted}`}>Serveur</label>
              <select
                value={selectedGuildId}
                onChange={(e) => { setSelectedGuildId(e.target.value); setSelectedChannelId(''); }}
                className={`w-full mt-0.5 px-2 py-1.5 rounded border text-sm ${inputCl}`}
              >
                <option value="">— Choisir —</option>
                {guilds.map((g) => (
                  <option key={g.id} value={g.id}>{g.name}</option>
                ))}
              </select>
            </div>
            <div>
              <label className={`text-xs ${textMuted}`}>Canal vocal</label>
              <select
                value={selectedChannelId}
                onChange={(e) => setSelectedChannelId(e.target.value)}
                disabled={!selectedGuildId}
                className={`w-full mt-0.5 px-2 py-1.5 rounded border text-sm ${inputCl} disabled:opacity-50`}
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
              className={`w-full py-1.5 rounded-lg text-xs font-medium ${btnCl} disabled:opacity-50`}
            >
              {savingConfig ? 'Enregistrement...' : 'Enregistrer'}
            </button>
          </div>
        </div>

        {/* Données actuelles */}
        <div className="space-y-2">
          <div className="flex justify-between items-center">
            <span className={textMuted}>Aéroport</span>
            {editing === 'airport' ? (
              <div className="flex gap-1">
                <input
                  className={`px-2 py-1 rounded border text-sm w-32 ${inputCl}`}
                  value={editValues.airport_name ?? ''}
                  onChange={(e) => setEditValues((v) => ({ ...v, airport_name: e.target.value }))}
                  placeholder="ex: Chicago O'Hare"
                />
                <button onClick={saveEdit} className={`px-2 py-1 rounded text-xs ${btnCl}`}>OK</button>
                <button onClick={() => setEditing(null)} className="px-2 py-1 rounded bg-slate-500 text-white text-xs">Annuler</button>
              </div>
            ) : (
              <button onClick={() => startEdit('airport', { airport_name: d?.airport_name ?? '' })} className="flex items-center gap-1 hover:underline">
                {val(d?.airport_name || d?.airport)} <Pencil className="h-3 w-3" />
              </button>
            )}
          </div>
          <div className="flex justify-between items-center">
            <span className={textMuted}>Code</span>
            <select
              value={d?.information_code ?? ''}
              onChange={(e) => handleCodeChange(e.target.value)}
              className={`px-2 py-1 rounded border text-sm ${inputCl}`}
            >
              {CODE_LETTERS.map((c) => (
                <option key={c} value={c}>{c}</option>
              ))}
            </select>
          </div>
          <div className="flex justify-between items-center">
            <span className={textMuted}>Piste</span>
            {editing === 'runway' ? (
              <div className="flex flex-col gap-1">
                <input className={`px-2 py-1 rounded border text-sm ${inputCl}`} placeholder="ex: 25L/25R" value={editValues.runway ?? ''} onChange={(e) => setEditValues((v) => ({ ...v, runway: e.target.value }))} />
                <input className={`px-2 py-1 rounded border text-sm ${inputCl}`} placeholder="Condition" value={editValues.runway_condition ?? ''} onChange={(e) => setEditValues((v) => ({ ...v, runway_condition: e.target.value }))} />
                <div className="flex gap-1">
                  <button onClick={saveEdit} className={`px-2 py-1 rounded text-xs ${btnCl}`}>OK</button>
                  <button onClick={() => setEditing(null)} className="px-2 py-1 rounded bg-slate-500 text-white text-xs">Annuler</button>
                </div>
              </div>
            ) : (
              <button onClick={() => startEdit('runway', { runway: d?.runway ?? '', runway_condition: d?.runway_condition ?? '' })} className="flex items-center gap-1 hover:underline">
                {val(d?.runway)} ({val(d?.runway_condition)}) <Pencil className="h-3 w-3" />
              </button>
            )}
          </div>
          <div className="flex justify-between items-center">
            <span className={textMuted}>Vent</span>
            {editing === 'weather' ? (
              <div className="flex flex-col gap-1 w-full">
                <input className={`px-2 py-1 rounded border text-sm ${inputCl}`} placeholder="Vent" value={editValues.wind ?? ''} onChange={(e) => setEditValues((v) => ({ ...v, wind: e.target.value }))} />
                <input className={`px-2 py-1 rounded border text-sm ${inputCl}`} placeholder="Visibilité" value={editValues.visibility ?? ''} onChange={(e) => setEditValues((v) => ({ ...v, visibility: e.target.value }))} />
                <input className={`px-2 py-1 rounded border text-sm ${inputCl}`} placeholder="Ciel" value={editValues.sky_condition ?? ''} onChange={(e) => setEditValues((v) => ({ ...v, sky_condition: e.target.value }))} />
                <div className="flex gap-2">
                  <input className={`px-2 py-1 rounded border text-sm w-16 ${inputCl}`} placeholder="Temp" value={editValues.temperature ?? ''} onChange={(e) => setEditValues((v) => ({ ...v, temperature: e.target.value }))} />
                  <input className={`px-2 py-1 rounded border text-sm w-16 ${inputCl}`} placeholder="Rosée" value={editValues.dewpoint ?? ''} onChange={(e) => setEditValues((v) => ({ ...v, dewpoint: e.target.value }))} />
                </div>
                <div className="flex gap-1">
                  <button onClick={saveEdit} className={`px-2 py-1 rounded text-xs ${btnCl}`}>OK</button>
                  <button onClick={() => setEditing(null)} className="px-2 py-1 rounded bg-slate-500 text-white text-xs">Annuler</button>
                </div>
              </div>
            ) : (
              <button onClick={() => startEdit('weather', {
                wind: d?.wind ?? '',
                visibility: d?.visibility ?? '',
                sky_condition: d?.sky_condition ?? '',
                temperature: d?.temperature ?? '',
                dewpoint: d?.dewpoint ?? '',
              })} className="flex items-center gap-1 hover:underline text-right">
                {val(d?.wind)} <Pencil className="h-3 w-3" />
              </button>
            )}
          </div>
          {!editing && (
            <>
              <div className="flex justify-between">
                <span className={textMuted}>Visibilité</span>
                <span>{val(d?.visibility)}</span>
              </div>
              <div className="flex justify-between">
                <span className={textMuted}>Ciel</span>
                <span>{val(d?.sky_condition)}</span>
              </div>
              <div className="flex justify-between">
                <span className={textMuted}>Temp / Rosée</span>
                <span>{val(d?.temperature)}°C / {val(d?.dewpoint)}°C</span>
              </div>
            </>
          )}
          <div className="flex justify-between items-center">
            <span className={textMuted}>QNH</span>
            {editing === 'qnh' ? (
              <div className="flex gap-1">
                <input className={`px-2 py-1 rounded border text-sm w-20 ${inputCl}`} value={editValues.qnh ?? ''} onChange={(e) => setEditValues((v) => ({ ...v, qnh: e.target.value }))} placeholder="1013" />
                <button onClick={saveEdit} className={`px-2 py-1 rounded text-xs ${btnCl}`}>OK</button>
                <button onClick={() => setEditing(null)} className="px-2 py-1 rounded bg-slate-500 text-white text-xs">Annuler</button>
              </div>
            ) : (
              <button onClick={() => startEdit('qnh', { qnh: d?.qnh ?? '' })} className="flex items-center gap-1 hover:underline">
                {val(d?.qnh)} <Pencil className="h-3 w-3" />
              </button>
            )}
          </div>
          <div className="flex justify-between items-start">
            <span className={textMuted}>Remarques</span>
            {editing === 'remarks' ? (
              <div className="flex flex-col gap-1 flex-1">
                <textarea className={`px-2 py-1 rounded border text-sm w-full min-h-12 ${inputCl}`} value={editValues.remarks ?? ''} onChange={(e) => setEditValues((v) => ({ ...v, remarks: e.target.value }))} placeholder="Remarques" />
                <div className="flex gap-1">
                  <button onClick={saveEdit} className={`px-2 py-1 rounded text-xs ${btnCl}`}>OK</button>
                  <button onClick={() => setEditing(null)} className="px-2 py-1 rounded bg-slate-500 text-white text-xs">Annuler</button>
                </div>
              </div>
            ) : (
              <button onClick={() => startEdit('remarks', { remarks: d?.remarks ?? '' })} className="flex items-center gap-1 hover:underline text-right max-w-[180px] truncate">
                {val(d?.remarks)} <Pencil className="h-3 w-3 flex-shrink-0" />
              </button>
            )}
          </div>
        </div>

        {/* Toggles */}
        <div className="flex gap-2 pt-2 border-t border-slate-500/50">
          <button
            onClick={handleToggleCavok}
            className={`flex-1 py-1.5 rounded-lg text-xs font-medium ${d?.cavok ? 'bg-emerald-500/30 text-emerald-700 dark:text-emerald-300' : 'bg-slate-500/20'} ${isDark ? 'hover:bg-slate-200' : 'hover:bg-slate-600'}`}
          >
            <Cloud className="h-3.5 w-3.5 inline mr-1" />
            CAVOK {d?.cavok ? '✓' : ''}
          </button>
          <button
            onClick={handleToggleBilingual}
            className={`flex-1 py-1.5 rounded-lg text-xs font-medium ${d?.bilingual_mode ? 'bg-emerald-500/30 text-emerald-700 dark:text-emerald-300' : 'bg-slate-500/20'} ${isDark ? 'hover:bg-slate-200' : 'hover:bg-slate-600'}`}
          >
            <Globe className="h-3.5 w-3.5 inline mr-1" />
            EN+FR {d?.bilingual_mode ? '✓' : ''}
          </button>
        </div>

        {/* Actions Start/Stop */}
        <div className="flex gap-2 pt-2">
          {canStart && (
            <button onClick={handleStart} disabled={loading} className={`flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-white font-medium disabled:opacity-50`}>
              <Play className="h-4 w-4" />
              Démarrer
            </button>
          )}
          {canStop && (
            <button onClick={handleStop} disabled={loading} className="flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl bg-red-500 hover:bg-red-400 text-white font-medium disabled:opacity-50">
              <Square className="h-4 w-4" />
              Arrêter
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
