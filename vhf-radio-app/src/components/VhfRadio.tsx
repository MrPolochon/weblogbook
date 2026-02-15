import { useState, useEffect, useRef, useCallback } from 'react';
import { Radio, Mic, MicOff, Volume2, Settings2, Users, AlertTriangle, Power, ArrowLeftRight, RefreshCw, AlertCircle } from 'lucide-react';
import VhfDial from './VhfDial';
import {
  ALL_VHF_DECIMALS,
  getMhzRange,
  getDecimalsForMhz,
  formatFrequency,
  parseFrequency,
  frequencyToRoomName,
  isValidVhfFrequency,
} from '../lib/vhf-frequencies';
import { API_BASE_URL } from '../lib/config';
import { supabase } from '../lib/supabase';

import {
  Room,
  RoomEvent,
  Track,
  ConnectionState,
  RemoteParticipant,
} from 'livekit-client';

/* ───────────────────── Types ───────────────────── */

interface VhfRadioProps {
  mode: 'pilot' | 'atc' | 'afis';
  lockedFrequency?: string;
  participantName?: string;
  accessToken?: string;
}

interface ParticipantInfo {
  identity: string;
  name: string;
  isSpeaking: boolean;
}

/* ───────────────── Constantes ──────────────────── */

const PTT_STORAGE_KEY = 'vhf-ptt-key';
const AUDIO_INPUT_KEY = 'vhf-audio-input';
const AUDIO_OUTPUT_KEY = 'vhf-audio-output';
const DEFAULT_PTT = 'Space';
const COLLISION_THRESHOLD = 0.01;
const COLLISION_CHECK_MS = 300;

/* ─────────────── Helpers PTT ───────────────────── */

function keyEventToLabel(e: KeyboardEvent): string {
  const parts: string[] = [];
  if (e.ctrlKey) parts.push('Ctrl');
  if (e.shiftKey) parts.push('Shift');
  if (e.altKey) parts.push('Alt');
  if (e.metaKey) parts.push('Meta');
  if (!['Control', 'Shift', 'Alt', 'Meta'].includes(e.key)) {
    parts.push(e.code || e.key);
  }
  return parts.join('+') || e.code;
}

function matchesPttKey(e: KeyboardEvent, pttKey: string): boolean {
  return keyEventToLabel(e) === pttKey;
}

/* ══════════════════════════════════════════════════
   Composant principal — Electron
   ══════════════════════════════════════════════════ */

export default function VhfRadio({
  mode,
  lockedFrequency,
  participantName,
  accessToken,
}: VhfRadioProps) {
  const mhzRange = getMhzRange();
  const initialFreq = lockedFrequency ? parseFrequency(lockedFrequency) : null;
  const isLocked = mode !== 'pilot';

  /* ── ON / OFF ── */
  const [radioOn, setRadioOn] = useState(false);

  /* ── Fréquence Active ── */
  const [actMhzIndex, setActMhzIndex] = useState(
    initialFreq ? mhzRange.indexOf(initialFreq.mhz) : 0
  );
  const [actDecIndex, setActDecIndex] = useState(
    initialFreq ? ALL_VHF_DECIMALS.indexOf(initialFreq.decimal) : 0
  );

  /* ── Fréquence Standby ── */
  const [stbyMhzIndex, setStbyMhzIndex] = useState(
    initialFreq ? mhzRange.indexOf(initialFreq.mhz) : 0
  );
  const [stbyDecIndex, setStbyDecIndex] = useState(
    initialFreq ? ALL_VHF_DECIMALS.indexOf(initialFreq.decimal) : 0
  );

  /* Computed frequencies */
  const actMhz = mhzRange[actMhzIndex] ?? 118;
  const actDecimals = getDecimalsForMhz(actMhz);
  const safeActDecIndex = Math.min(actDecIndex, actDecimals.length - 1);
  const activeFreq = formatFrequency(actMhz, actDecimals[safeActDecIndex] ?? '000');

  const stbyMhz = mhzRange[stbyMhzIndex] ?? 118;
  const stbyDecimals = getDecimalsForMhz(stbyMhz);
  const safeStbyDecIndex = Math.min(stbyDecIndex, stbyDecimals.length - 1);
  const standbyFreq = formatFrequency(stbyMhz, stbyDecimals[safeStbyDecIndex] ?? '000');

  /* ── LiveKit ── */
  const roomRef = useRef<Room | null>(null);
  const [connectionState, setConnectionState] = useState<string>('disconnected');
  const [participants, setParticipants] = useState<ParticipantInfo[]>([]);
  const audioContainerRef = useRef<HTMLDivElement>(null);
  const attachedAudioRef = useRef<Map<string, HTMLAudioElement>>(new Map());

  /* ── PTT ── */
  const [pttKey, setPttKey] = useState(DEFAULT_PTT);
  const [isTransmitting, setIsTransmitting] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [waitingForKey, setWaitingForKey] = useState(false);
  const pttActiveRef = useRef(false);

  /* ── Collision ── */
  const [collision, setCollision] = useState(false);
  const collisionOscRef = useRef<OscillatorNode | null>(null);
  const collisionCtxRef = useRef<AudioContext | null>(null);

  /* ── Audio devices ── */
  const [audioInputs, setAudioInputs] = useState<MediaDeviceInfo[]>([]);
  const [audioOutputs, setAudioOutputs] = useState<MediaDeviceInfo[]>([]);
  const [selectedInput, setSelectedInput] = useState('');
  const [selectedOutput, setSelectedOutput] = useState('');

  /* ── Reconnexion ── */
  const [isReconnecting, setIsReconnecting] = useState(false);

  /* ── Erreur connexion ── */
  const [connectionError, setConnectionError] = useState<string | null>(null);
  const retryTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const radioOnRef = useRef(false);

  /* ══════════════════════════════════════════════════
     PTT (must be declared before useEffects that reference them)
     ══════════════════════════════════════════════════ */

  const startTransmit = useCallback(async () => {
    if (!radioOn || pttActiveRef.current) return;
    pttActiveRef.current = true;
    setIsTransmitting(true);
    const room = roomRef.current;
    if (!room) return;
    try {
      const micPub = room.localParticipant.getTrackPublication(Track.Source.Microphone);
      if (micPub) await micPub.unmute();
    } catch (err) { console.error('[VHF] Unmute error:', err); }
  }, [radioOn]);

  const stopTransmit = useCallback(async () => {
    if (!pttActiveRef.current) return;
    pttActiveRef.current = false;
    setIsTransmitting(false);
    const room = roomRef.current;
    if (!room) return;
    try {
      const micPub = room.localParticipant.getTrackPublication(Track.Source.Microphone);
      if (micPub) await micPub.mute();
    } catch (err) { console.error('[VHF] Mute error:', err); }
  }, []);

  /* ══════════════════════════════════════════════════
     Initialisation
     ══════════════════════════════════════════════════ */

  useEffect(() => {
    const saved = localStorage.getItem(PTT_STORAGE_KEY);
    if (saved) setPttKey(saved);
    const savedIn = localStorage.getItem(AUDIO_INPUT_KEY);
    if (savedIn) setSelectedInput(savedIn);
    const savedOut = localStorage.getItem(AUDIO_OUTPUT_KEY);
    if (savedOut) setSelectedOutput(savedOut);
  }, []);

  useEffect(() => {
    async function enumerate() {
      try {
        await navigator.mediaDevices.getUserMedia({ audio: true }).then(s => s.getTracks().forEach(t => t.stop()));
        const devices = await navigator.mediaDevices.enumerateDevices();
        setAudioInputs(devices.filter(d => d.kind === 'audioinput'));
        setAudioOutputs(devices.filter(d => d.kind === 'audiooutput'));
      } catch { /* silent */ }
    }
    enumerate();
  }, []);

  // Note: PTT is handled via keydown/keyup events in the renderer (see below).
  // globalShortcut was removed because it cannot detect key release properly.

  /* ══════════════════════════════════════════════════
     Switch Active ⇄ Standby
     ══════════════════════════════════════════════════ */

  function handleSwapFrequencies() {
    if (isLocked) return;
    const tmpMhz = actMhzIndex;
    const tmpDec = actDecIndex;
    setActMhzIndex(stbyMhzIndex);
    setActDecIndex(stbyDecIndex);
    setStbyMhzIndex(tmpMhz);
    setStbyDecIndex(tmpDec);
  }

  /* ══════════════════════════════════════════════════
     LiveKit
     ══════════════════════════════════════════════════ */

  const cleanupRoom = useCallback(() => {
    if (collisionOscRef.current) {
      try { collisionOscRef.current.stop(); } catch { /* */ }
      collisionOscRef.current = null;
    }
    attachedAudioRef.current.forEach((el) => {
      try { el.pause(); el.remove(); } catch { /* */ }
    });
    attachedAudioRef.current.clear();
    const room = roomRef.current;
    if (room) {
      room.removeAllListeners();
      room.disconnect(true);
      roomRef.current = null;
    }
    setConnectionState('disconnected');
    setParticipants([]);
    setIsTransmitting(false);
    setCollision(false);
  }, []);

  /** Get a fresh Supabase access token (auto-refreshed by the SDK) */
  const getFreshToken = useCallback(async (): Promise<string | null> => {
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (session?.access_token) return session.access_token;
      // Try explicit refresh
      const { data: { session: refreshed } } = await supabase.auth.refreshSession();
      return refreshed?.access_token || null;
    } catch {
      return null;
    }
  }, []);

  /** Fetch a LiveKit token from the API, with retry on 401 */
  const fetchLiveKitToken = useCallback(async (freq: string): Promise<{ token: string; url: string } | null> => {
    const roomName = frequencyToRoomName(freq);
    const body = JSON.stringify({ roomName, participantName: participantName || 'Inconnu' });

    // First attempt with a fresh token
    let freshToken = await getFreshToken();
    if (!freshToken) freshToken = accessToken;

    if (!freshToken) {
      setConnectionError('Aucun token d\'authentification — reconnecte-toi');
      return null;
    }

    const doFetch = async (token: string) => {
      return fetch(`${API_BASE_URL}/api/livekit/token`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
        body,
      });
    };

    let res = await doFetch(freshToken);

    // If 401, try refreshing the session and retry once
    if (res.status === 401) {
      console.warn('[VHF] Token expired, refreshing session...');
      const { data: { session: newSession } } = await supabase.auth.refreshSession();
      if (newSession?.access_token) {
        res = await doFetch(newSession.access_token);
      }
    }

    if (!res.ok) {
      const errBody = await res.text().catch(() => '');
      let errMsg = `Erreur ${res.status}`;
      try { const j = JSON.parse(errBody); errMsg = j.error || j.details || errMsg; } catch { /* */ }
      console.error('[VHF] Token fetch failed:', res.status, errBody);
      setConnectionError(errMsg);
      return null;
    }

    const data = await res.json();
    if (!data.token || !data.url) {
      setConnectionError('Réponse serveur invalide (token/url manquant)');
      return null;
    }

    return { token: data.token, url: data.url };
  }, [accessToken, participantName, getFreshToken]);

  const connectToFrequency = useCallback(
    async (freq: string) => {
      if (!isValidVhfFrequency(freq)) return;
      cleanupRoom();
      setConnectionError(null);
      if (retryTimerRef.current) { clearTimeout(retryTimerRef.current); retryTimerRef.current = null; }

      try {
        setConnectionState('connecting');

        const result = await fetchLiveKitToken(freq);
        if (!result) {
          setConnectionState('error');
          // Auto-retry after 5 seconds
          retryTimerRef.current = setTimeout(() => {
            if (radioOnRef.current) {
              console.log('[VHF] Auto-retry connexion...');
              prevActiveFreqRef.current = '';
              connectToFrequency(freq);
            }
          }, 5000);
          return;
        }

        const { token, url } = result;
        setConnectionError(null);

        const room = new Room({
          adaptiveStream: true,
          dynacast: true,
          audioCaptureDefaults: {
            echoCancellation: true,
            noiseSuppression: true,
            autoGainControl: true,
            deviceId: selectedInput || undefined,
          },
        });

        room.on(RoomEvent.ConnectionStateChanged, (state: ConnectionState) => {
          setConnectionState(state);
          if (state === 'disconnected') {
            // Auto-retry on unexpected disconnect
            retryTimerRef.current = setTimeout(() => {
              if (radioOnRef.current) {
                console.log('[VHF] Reconnexion après déconnexion...');
                prevActiveFreqRef.current = '';
                connectToFrequency(freq);
              }
            }, 3000);
          }
        });
        room.on(RoomEvent.TrackSubscribed, (track) => {
          if (track.kind !== Track.Kind.Audio) return;
          const audioElement = track.attach() as HTMLAudioElement;
          audioElement.volume = 1.0;
          if (selectedOutput && 'setSinkId' in audioElement) {
            (audioElement as HTMLAudioElement & { setSinkId: (id: string) => Promise<void> })
              .setSinkId(selectedOutput).catch(() => {});
          }
          const container = audioContainerRef.current ?? document.body;
          container.appendChild(audioElement);
          attachedAudioRef.current.set(track.sid ?? '', audioElement);
        });
        room.on(RoomEvent.TrackUnsubscribed, (track) => {
          const sid = track.sid ?? '';
          const el = attachedAudioRef.current.get(sid);
          if (el) { el.pause(); el.remove(); attachedAudioRef.current.delete(sid); }
        });
        room.on(RoomEvent.ParticipantConnected, () => updateParticipants(room));
        room.on(RoomEvent.ParticipantDisconnected, () => updateParticipants(room));

        await room.connect(url, token, { autoSubscribe: true });
        await room.localParticipant.setMicrophoneEnabled(true);
        const micPub = room.localParticipant.getTrackPublication(Track.Source.Microphone);
        if (micPub) await micPub.mute();

        roomRef.current = room;
        setConnectionError(null);
        updateParticipants(room);
      } catch (err) {
        console.error('[VHF] Connection error:', err);
        setConnectionError(err instanceof Error ? err.message : 'Erreur de connexion LiveKit');
        setConnectionState('error');
        // Auto-retry after 5 seconds
        retryTimerRef.current = setTimeout(() => {
          if (radioOnRef.current) {
            prevActiveFreqRef.current = '';
            connectToFrequency(freq);
          }
        }, 5000);
      }
    },
    [cleanupRoom, selectedInput, selectedOutput, fetchLiveKitToken]
  );

  function updateParticipants(room: Room) {
    const list: ParticipantInfo[] = [];
    room.remoteParticipants.forEach((p: RemoteParticipant) => {
      list.push({ identity: p.identity, name: p.name || p.identity, isSpeaking: p.isSpeaking });
    });
    setParticipants(list);
  }

  /* Keep ref in sync */
  useEffect(() => { radioOnRef.current = radioOn; }, [radioOn]);

  /* Connect / disconnect when radio ON/OFF or active freq changes */
  const prevActiveFreqRef = useRef('');
  useEffect(() => {
    if (!radioOn) {
      if (roomRef.current) cleanupRoom();
      prevActiveFreqRef.current = '';
      return;
    }
    if (activeFreq !== prevActiveFreqRef.current) {
      prevActiveFreqRef.current = activeFreq;
      connectToFrequency(activeFreq);
    }
  }, [radioOn, activeFreq]);

  /* Auto-ON for ATC/AFIS */
  useEffect(() => {
    if (isLocked && lockedFrequency) {
      setRadioOn(true);
    }
  }, [isLocked, lockedFrequency]);

  useEffect(() => {
    return () => {
      cleanupRoom();
      if (retryTimerRef.current) { clearTimeout(retryTimerRef.current); retryTimerRef.current = null; }
    };
  }, []);

  /* ── Keyboard PTT ── */
  useEffect(() => {
    const handleDown = (e: KeyboardEvent) => {
      if (waitingForKey || !radioOn) return;
      if (matchesPttKey(e, pttKey)) { e.preventDefault(); startTransmit(); }
    };
    const handleUp = (e: KeyboardEvent) => {
      if (matchesPttKey(e, pttKey)) { e.preventDefault(); stopTransmit(); }
    };
    window.addEventListener('keydown', handleDown);
    window.addEventListener('keyup', handleUp);
    return () => { window.removeEventListener('keydown', handleDown); window.removeEventListener('keyup', handleUp); };
  }, [pttKey, startTransmit, stopTransmit, waitingForKey, radioOn]);

  /* ══════════════════════════════════════════════════
     Collision detection
     ══════════════════════════════════════════════════ */

  const prevParticipantsKeyRef = useRef('');
  const prevCollisionRef = useRef(false);

  useEffect(() => {
    const interval = setInterval(() => {
      const room = roomRef.current;
      if (!room) return;
      let speakingCount = 0;
      if (pttActiveRef.current) speakingCount++;
      const list: ParticipantInfo[] = [];
      room.remoteParticipants.forEach((p: RemoteParticipant) => {
        const speaking = p.audioLevel > COLLISION_THRESHOLD;
        if (speaking) speakingCount++;
        list.push({ identity: p.identity, name: p.name || p.identity, isSpeaking: speaking });
      });
      const key = list.map(p => `${p.identity}:${p.isSpeaking ? '1' : '0'}`).join(',');
      if (key !== prevParticipantsKeyRef.current) {
        prevParticipantsKeyRef.current = key;
        setParticipants(list);
      }
      const isCollision = speakingCount >= 2;
      if (isCollision !== prevCollisionRef.current) {
        prevCollisionRef.current = isCollision;
        setCollision(isCollision);
      }
    }, COLLISION_CHECK_MS);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    if (collision) {
      try {
        if (!collisionCtxRef.current) collisionCtxRef.current = new AudioContext();
        const ctx = collisionCtxRef.current;
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = 'sine'; osc.frequency.value = 1200; gain.gain.value = 0.15;
        osc.connect(gain).connect(ctx.destination); osc.start();
        collisionOscRef.current = osc;
      } catch { /* */ }
    } else {
      if (collisionOscRef.current) {
        try { collisionOscRef.current.stop(); } catch { /* */ }
        collisionOscRef.current = null;
      }
    }
  }, [collision]);

  /* ══════════════════════════════════════════════════
     PTT Config
     ══════════════════════════════════════════════════ */

  useEffect(() => {
    if (!waitingForKey) return;
    const handler = (e: KeyboardEvent) => {
      e.preventDefault(); e.stopPropagation();
      const label = keyEventToLabel(e);
      if (label) { setPttKey(label); localStorage.setItem(PTT_STORAGE_KEY, label); setWaitingForKey(false); }
    };
    window.addEventListener('keydown', handler, true);
    return () => window.removeEventListener('keydown', handler, true);
  }, [waitingForKey]);

  /* ══════════════════════════════════════════════════
     Device handlers
     ══════════════════════════════════════════════════ */

  function handleInputChange(deviceId: string) {
    setSelectedInput(deviceId);
    localStorage.setItem(AUDIO_INPUT_KEY, deviceId);
    if (roomRef.current && radioOn) connectToFrequency(activeFreq);
  }

  function handleOutputChange(deviceId: string) {
    setSelectedOutput(deviceId);
    localStorage.setItem(AUDIO_OUTPUT_KEY, deviceId);
    attachedAudioRef.current.forEach((el) => {
      if ('setSinkId' in el) {
        (el as HTMLAudioElement & { setSinkId: (id: string) => Promise<void> }).setSinkId(deviceId).catch(() => {});
      }
    });
  }

  function handleStbyDecChange(idx: number) {
    const decs = getDecimalsForMhz(stbyMhz);
    setStbyDecIndex(Math.min(idx, decs.length - 1));
  }

  const handleReconnect = useCallback(async () => {
    if (isReconnecting || !radioOn) return;
    setIsReconnecting(true);
    cleanupRoom();
    await new Promise(r => setTimeout(r, 500));
    prevActiveFreqRef.current = '';
    await connectToFrequency(activeFreq);
    setIsReconnecting(false);
  }, [isReconnecting, radioOn, cleanupRoom, connectToFrequency, activeFreq]);

  function handleToggleRadio() {
    if (radioOn) {
      cleanupRoom();
      setRadioOn(false);
    } else {
      setRadioOn(true);
    }
  }

  /* ══════════════════════════════════════════════════
     Rendu
     ══════════════════════════════════════════════════ */

  const isConnected = connectionState === 'connected';
  const isConnecting = connectionState === 'connecting';

  return (
    <div className={`rounded-xl border bg-gradient-to-b from-slate-800 to-slate-900 shadow-lg overflow-hidden flex flex-col ${
      !radioOn ? 'border-slate-700/50 opacity-60' : collision ? 'border-red-500/50' : 'border-slate-700'
    }`}>
      {/* Header */}
      <div className={`flex items-center justify-between px-4 py-2 border-b ${
        collision && radioOn ? 'bg-red-900/50 border-red-500/50' : 'bg-slate-800/80 border-slate-700'
      }`}>
        <div className="flex items-center gap-2">
          <button
            onClick={handleToggleRadio}
            className={`flex items-center justify-center rounded-lg transition-all w-8 h-8 ${
              radioOn
                ? 'bg-emerald-600 text-white shadow-lg shadow-emerald-600/20'
                : 'bg-slate-700 text-slate-500 hover:bg-slate-600'
            }`}
            title={radioOn ? 'Éteindre la radio' : 'Allumer la radio'}
          >
            <Power className="h-4 w-4" />
          </button>
          <Radio className={`h-4 w-4 ${!radioOn ? 'text-slate-600' : collision ? 'text-red-400' : 'text-emerald-400'}`} />
          <span className="text-xs font-semibold text-slate-300 uppercase tracking-wider">VHF COM1</span>
        </div>
        <div className="flex items-center gap-2">
          <div className={`w-2 h-2 rounded-full flex-shrink-0 ${
            !radioOn ? 'bg-slate-600' :
            isConnected ? 'bg-emerald-400 shadow-emerald-400/50 shadow-sm' :
            isConnecting ? 'bg-amber-400 animate-pulse' : 'bg-red-500'
          }`} />
          <span className="text-[10px] text-slate-500">
            {!radioOn ? 'OFF' : isConnected ? 'EN LIGNE' : isConnecting ? 'CONNEXION...' : 'HORS LIGNE'}
          </span>
          {radioOn && (
            <button onClick={handleReconnect} disabled={isReconnecting || isConnecting} title="Reconnexion"
              className="p-1 rounded text-slate-500 hover:text-slate-200 hover:bg-slate-700 transition-colors disabled:opacity-30">
              <RefreshCw className={`h-3.5 w-3.5 ${isReconnecting ? 'animate-spin' : ''}`} />
            </button>
          )}
        </div>
      </div>

      {/* Dual Frequency display */}
      <div className="py-3 px-4">
        <div className={`rounded-lg p-2 ${collision ? 'bg-red-950/30' : 'bg-slate-900/50'}`}>
          <div className="flex items-center justify-between gap-2">
            <div className="flex-1 text-center">
              <div className="text-[9px] text-slate-500 uppercase tracking-widest mb-0.5">ACT</div>
              <div className={`font-mono text-2xl font-bold tracking-wider ${
                !radioOn ? 'text-slate-600' :
                collision ? 'text-red-400 animate-pulse' : 'text-emerald-300'
              }`}>
                {activeFreq}
              </div>
            </div>

            {!isLocked && (
              <button
                onClick={handleSwapFrequencies}
                disabled={!radioOn}
                className="p-1.5 rounded-lg bg-slate-700 hover:bg-slate-600 text-amber-400 hover:text-amber-300 transition-colors disabled:opacity-30 disabled:cursor-not-allowed flex-shrink-0"
                title="Échanger ACT ⇄ STBY"
              >
                <ArrowLeftRight className="h-4 w-4" />
              </button>
            )}

            <div className="flex-1 text-center">
              <div className="text-[9px] text-slate-500 uppercase tracking-widest mb-0.5">STBY</div>
              <div className={`font-mono text-2xl font-bold tracking-wider ${
                !radioOn ? 'text-slate-600' : 'text-amber-300/70'
              }`}>
                {standbyFreq}
              </div>
            </div>
          </div>

          {collision && (
            <div className="flex items-center justify-center gap-1 mt-1.5">
              <AlertTriangle className="h-3 w-3 text-red-400" />
              <span className="text-[10px] text-red-400 font-semibold uppercase">Double transmission</span>
            </div>
          )}

          {/* Connection error banner */}
          {connectionError && connectionState !== 'connected' && (
            <div className="flex items-start gap-2 mt-2 p-2 rounded-lg bg-red-500/10 border border-red-500/20">
              <AlertCircle className="h-3.5 w-3.5 text-red-400 mt-0.5 flex-shrink-0" />
              <div className="flex-1 min-w-0">
                <p className="text-[10px] text-red-300 break-words">{connectionError}</p>
                <p className="text-[9px] text-red-400/50 mt-0.5">Reconnexion auto dans 5s...</p>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Dials (controls standby) */}
      {!isLocked && radioOn && (
        <div className="px-4 pb-3">
          <div className="flex flex-col items-center gap-1">
            <div className="text-[9px] text-amber-400/60 uppercase tracking-widest">Réglage STBY</div>
            <div className="flex items-center justify-center gap-3">
              <VhfDial values={mhzRange.map(String)} currentIndex={stbyMhzIndex} onChange={setStbyMhzIndex} disabled={isLocked || !radioOn} label="MHz" size={68} />
              <span className="text-2xl font-mono text-slate-500 mt-4">.</span>
              <VhfDial values={stbyDecimals} currentIndex={safeStbyDecIndex} onChange={handleStbyDecChange} disabled={isLocked || !radioOn} label="kHz" size={68} />
            </div>
          </div>
        </div>
      )}

      {/* PTT */}
      {radioOn && (
        <div className="px-4 pb-3">
          <button
            onMouseDown={startTransmit}
            onMouseUp={stopTransmit}
            onMouseLeave={stopTransmit}
            disabled={!isConnected || !radioOn}
            className={`w-full py-2.5 rounded-lg font-semibold text-sm uppercase tracking-wide transition-all flex items-center justify-center gap-2 select-none ${
              isTransmitting
                ? 'bg-emerald-600 text-white shadow-lg shadow-emerald-600/30 scale-[0.98]'
                : isConnected && radioOn
                  ? 'bg-slate-700 text-slate-300 hover:bg-slate-600 active:bg-emerald-600'
                  : 'bg-slate-800 text-slate-600 cursor-not-allowed'
            }`}
          >
            {isTransmitting ? (
              <><Mic className="h-4 w-4" /> TX — Transmission</>
            ) : (
              <><MicOff className="h-4 w-4" /> PTT — [{pttKey}]</>
            )}
          </button>
        </div>
      )}

      {/* Settings toggle */}
      {radioOn && (
        <div className="px-4 pb-3">
          <button onClick={() => setShowSettings(!showSettings)} className="flex items-center gap-1 text-[10px] text-slate-500 hover:text-slate-300 transition-colors">
            <Settings2 className="h-3 w-3" /> Paramètres audio
          </button>
          {showSettings && (
            <div className="mt-2 p-3 rounded-lg bg-slate-800/50 border border-slate-700 space-y-3">
              <div>
                <label className="text-[10px] text-slate-400 block mb-1">Touche PTT</label>
                {waitingForKey ? (
                  <div className="text-xs text-amber-400 animate-pulse py-1">Appuyez sur une touche...</div>
                ) : (
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-mono text-emerald-300 bg-slate-700 px-2 py-1 rounded">{pttKey}</span>
                    <button onClick={() => setWaitingForKey(true)} className="text-[10px] text-sky-400 hover:text-sky-300">Modifier</button>
                  </div>
                )}
                <p className="text-[9px] text-slate-500 mt-1">Maintiens la touche enfoncée pour parler</p>
              </div>
              {audioInputs.length > 0 && (
                <div>
                  <label className="text-[10px] text-slate-400 block mb-1"><Mic className="h-3 w-3 inline mr-1" />Microphone</label>
                  <select value={selectedInput} onChange={(e) => handleInputChange(e.target.value)}
                    className="w-full text-xs bg-slate-700 text-slate-200 rounded px-2 py-1.5 border border-slate-600">
                    <option value="">Par défaut</option>
                    {audioInputs.map((d) => (<option key={d.deviceId} value={d.deviceId}>{d.label || `Micro ${d.deviceId.slice(0, 8)}`}</option>))}
                  </select>
                </div>
              )}
              {audioOutputs.length > 0 && (
                <div>
                  <label className="text-[10px] text-slate-400 block mb-1"><Volume2 className="h-3 w-3 inline mr-1" />Sortie audio</label>
                  <select value={selectedOutput} onChange={(e) => handleOutputChange(e.target.value)}
                    className="w-full text-xs bg-slate-700 text-slate-200 rounded px-2 py-1.5 border border-slate-600">
                    <option value="">Par défaut</option>
                    {audioOutputs.map((d) => (<option key={d.deviceId} value={d.deviceId}>{d.label || `Sortie ${d.deviceId.slice(0, 8)}`}</option>))}
                  </select>
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* Participants */}
      {isConnected && radioOn && (
        <div className="px-4 pb-3 border-t border-slate-700/50 pt-2">
          <div className="flex items-center gap-1 mb-1">
            <Users className="h-3 w-3 text-slate-400" />
            <span className="text-[10px] text-slate-400 uppercase">Sur la fréquence ({participants.length})</span>
          </div>
          {participants.length === 0 ? (
            <p className="text-[10px] text-slate-600 italic">Aucun utilisateur</p>
          ) : (
            <div className="space-y-0.5 max-h-32 overflow-y-auto">
              {participants.map((p) => (
                <div key={p.identity} className={`flex items-center gap-1.5 text-xs rounded px-1.5 py-0.5 ${p.isSpeaking ? 'bg-emerald-900/30 text-emerald-300' : 'text-slate-400'}`}>
                  <div className={`w-1.5 h-1.5 rounded-full ${p.isSpeaking ? 'bg-emerald-400' : 'bg-slate-600'}`} />
                  <span className="font-mono text-[11px]">{p.name}</span>
                  {p.isSpeaking && <Mic className="h-3 w-3 text-emerald-400 ml-auto" />}
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      <div ref={audioContainerRef} style={{ position: 'absolute', left: -9999, width: 1, height: 1, overflow: 'hidden' }} aria-hidden="true" />
    </div>
  );
}
