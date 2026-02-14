'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { Radio, Mic, MicOff, Volume2, Settings2, Users, AlertTriangle } from 'lucide-react';
import VhfDial from './VhfDial';
import {
  ALL_VHF_DECIMALS,
  getMhzRange,
  getDecimalsForMhz,
  formatFrequency,
  parseFrequency,
  frequencyToRoomName,
  isValidVhfFrequency,
} from '@/lib/vhf-frequencies';
import {
  Room,
  RoomEvent,
  Track,
  ConnectionState,
  RemoteParticipant,
  LocalParticipant,
} from 'livekit-client';

/* ───────────────────── Types ───────────────────── */

interface VhfRadioProps {
  mode: 'pilot' | 'atc' | 'afis';
  /** Fréquence imposée (ATC/AFIS) */
  lockedFrequency?: string;
  /** Identifiant affiché dans le room */
  participantName?: string;
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
const COLLISION_THRESHOLD = 0.01; // seuil audioLevel pour considérer qu'on parle
const COLLISION_CHECK_MS = 80;

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
   Composant principal
   ══════════════════════════════════════════════════ */

export default function VhfRadio({
  mode,
  lockedFrequency,
  participantName,
}: VhfRadioProps) {
  /* ── Fréquence ── */
  const mhzRange = getMhzRange();
  const initialFreq = lockedFrequency
    ? parseFrequency(lockedFrequency)
    : null;

  const [mhzIndex, setMhzIndex] = useState(
    initialFreq ? mhzRange.indexOf(initialFreq.mhz) : 0
  );
  const [decIndex, setDecIndex] = useState(
    initialFreq ? ALL_VHF_DECIMALS.indexOf(initialFreq.decimal) : 0
  );

  const currentMhz = mhzRange[mhzIndex] ?? 118;
  const validDecimals = getDecimalsForMhz(currentMhz);
  const safeDecIndex = Math.min(decIndex, validDecimals.length - 1);
  const currentDecimal = validDecimals[safeDecIndex] ?? '000';
  const currentFreq = formatFrequency(currentMhz, currentDecimal);
  const isLocked = mode !== 'pilot';

  /* ── LiveKit ── */
  const roomRef = useRef<Room | null>(null);
  const [connectionState, setConnectionState] = useState<string>('disconnected');
  const [participants, setParticipants] = useState<ParticipantInfo[]>([]);
  const audioContainerRef = useRef<HTMLDivElement>(null);
  const attachedAudioRef = useRef<Map<string, HTMLAudioElement>>(new Map());

  /* ── PTT ── */
  const [pttKey, setPttKey] = useState(DEFAULT_PTT);
  const [isTransmitting, setIsTransmitting] = useState(false);
  const [showPttConfig, setShowPttConfig] = useState(false);
  const [waitingForKey, setWaitingForKey] = useState(false);
  const pttActiveRef = useRef(false);

  /* ── Collision (double transmission) ── */
  const [collision, setCollision] = useState(false);
  const collisionOscRef = useRef<OscillatorNode | null>(null);
  const collisionCtxRef = useRef<AudioContext | null>(null);

  /* ── Audio devices ── */
  const [audioInputs, setAudioInputs] = useState<MediaDeviceInfo[]>([]);
  const [audioOutputs, setAudioOutputs] = useState<MediaDeviceInfo[]>([]);
  const [selectedInput, setSelectedInput] = useState('');
  const [selectedOutput, setSelectedOutput] = useState('');

  /* ══════════════════════════════════════════════════
     Initialisation
     ══════════════════════════════════════════════════ */

  // Charger PTT key et devices depuis localStorage
  useEffect(() => {
    const saved = localStorage.getItem(PTT_STORAGE_KEY);
    if (saved) setPttKey(saved);
    const savedIn = localStorage.getItem(AUDIO_INPUT_KEY);
    if (savedIn) setSelectedInput(savedIn);
    const savedOut = localStorage.getItem(AUDIO_OUTPUT_KEY);
    if (savedOut) setSelectedOutput(savedOut);
  }, []);

  // Énumérer les périphériques audio
  useEffect(() => {
    async function enumerate() {
      try {
        // Demander l'accès au micro pour pouvoir lister les devices
        await navigator.mediaDevices.getUserMedia({ audio: true }).then(s => s.getTracks().forEach(t => t.stop()));
        const devices = await navigator.mediaDevices.enumerateDevices();
        setAudioInputs(devices.filter(d => d.kind === 'audioinput'));
        setAudioOutputs(devices.filter(d => d.kind === 'audiooutput'));
      } catch {
        // Silencieux si pas de permission
      }
    }
    enumerate();
  }, []);

  /* ══════════════════════════════════════════════════
     Connexion / Déconnexion LiveKit
     ══════════════════════════════════════════════════ */

  const cleanupRoom = useCallback(() => {
    // Stopper la détection de collision
    if (collisionOscRef.current) {
      try { collisionOscRef.current.stop(); } catch { /* ignore */ }
      collisionOscRef.current = null;
    }

    // Détacher tous les éléments audio
    attachedAudioRef.current.forEach((el) => {
      try { el.pause(); el.remove(); } catch { /* ignore */ }
    });
    attachedAudioRef.current.clear();

    // Déconnecter la room
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

  const connectToFrequency = useCallback(
    async (freq: string) => {
      if (!isValidVhfFrequency(freq)) return;
      cleanupRoom();

      try {
        setConnectionState('connecting');

        // Obtenir un token LiveKit
        const res = await fetch('/api/livekit/token', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            roomName: frequencyToRoomName(freq),
            participantName: participantName || 'Inconnu',
          }),
        });

        if (!res.ok) {
          console.error('[VHF] Token error:', await res.text());
          setConnectionState('error');
          return;
        }

        const { token, url } = await res.json();
        if (!token || !url) {
          setConnectionState('error');
          return;
        }

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

        // ── Events ──
        room.on(RoomEvent.ConnectionStateChanged, (state: ConnectionState) => {
          setConnectionState(state);
        });

        room.on(RoomEvent.TrackSubscribed, (track) => {
          if (track.kind !== Track.Kind.Audio) return;
          const audioElement = track.attach() as HTMLAudioElement;
          audioElement.volume = 1.0;
          // Appliquer le périphérique de sortie si possible
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
          if (el) {
            el.pause();
            el.remove();
            attachedAudioRef.current.delete(sid);
          }
        });

        room.on(RoomEvent.ParticipantConnected, () => updateParticipants(room));
        room.on(RoomEvent.ParticipantDisconnected, () => updateParticipants(room));

        // Connecter
        await room.connect(url, token, { autoSubscribe: true });

        // Micro muté par défaut (PTT)
        await room.localParticipant.setMicrophoneEnabled(true);
        const micPub = room.localParticipant.getTrackPublication(Track.Source.Microphone);
        if (micPub) await micPub.mute();

        roomRef.current = room;
        updateParticipants(room);
      } catch (err) {
        console.error('[VHF] Connection error:', err);
        setConnectionState('error');
      }
    },
    [cleanupRoom, participantName, selectedInput, selectedOutput]
  );

  function updateParticipants(room: Room) {
    const list: ParticipantInfo[] = [];
    room.remoteParticipants.forEach((p: RemoteParticipant) => {
      list.push({
        identity: p.identity,
        name: p.name || p.identity,
        isSpeaking: p.isSpeaking,
      });
    });
    setParticipants(list);
  }

  /* ── Se connecter à la fréquence actuelle ── */
  const prevFreqRef = useRef('');
  useEffect(() => {
    if (currentFreq !== prevFreqRef.current) {
      prevFreqRef.current = currentFreq;
      connectToFrequency(currentFreq);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentFreq]);

  // Cleanup au démontage
  useEffect(() => {
    return () => { cleanupRoom(); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /* ══════════════════════════════════════════════════
     Push-To-Talk
     ══════════════════════════════════════════════════ */

  const startTransmit = useCallback(async () => {
    if (pttActiveRef.current) return;
    pttActiveRef.current = true;
    setIsTransmitting(true);
    const room = roomRef.current;
    if (!room) return;
    try {
      const micPub = room.localParticipant.getTrackPublication(Track.Source.Microphone);
      if (micPub) await micPub.unmute();
    } catch (err) {
      console.error('[VHF] Unmute error:', err);
    }
  }, []);

  const stopTransmit = useCallback(async () => {
    if (!pttActiveRef.current) return;
    pttActiveRef.current = false;
    setIsTransmitting(false);
    const room = roomRef.current;
    if (!room) return;
    try {
      const micPub = room.localParticipant.getTrackPublication(Track.Source.Microphone);
      if (micPub) await micPub.mute();
    } catch (err) {
      console.error('[VHF] Mute error:', err);
    }
  }, []);

  // Keyboard PTT listeners
  useEffect(() => {
    const handleDown = (e: KeyboardEvent) => {
      if (waitingForKey) return; // Config mode
      if (matchesPttKey(e, pttKey)) {
        e.preventDefault();
        startTransmit();
      }
    };
    const handleUp = (e: KeyboardEvent) => {
      if (matchesPttKey(e, pttKey)) {
        e.preventDefault();
        stopTransmit();
      }
    };
    window.addEventListener('keydown', handleDown);
    window.addEventListener('keyup', handleUp);
    return () => {
      window.removeEventListener('keydown', handleDown);
      window.removeEventListener('keyup', handleUp);
    };
  }, [pttKey, startTransmit, stopTransmit, waitingForKey]);

  /* ══════════════════════════════════════════════════
     Détection de double transmission (collision)
     ══════════════════════════════════════════════════ */

  useEffect(() => {
    const interval = setInterval(() => {
      const room = roomRef.current;
      if (!room) return;

      // Compter combien de participants émettent (y compris nous)
      let speakingCount = 0;

      // Nous
      if (pttActiveRef.current) speakingCount++;

      // Remote participants
      room.remoteParticipants.forEach((p: RemoteParticipant) => {
        if (p.audioLevel > COLLISION_THRESHOLD) speakingCount++;
      });

      // Mettre à jour la liste des participants (speaking state)
      const list: ParticipantInfo[] = [];
      room.remoteParticipants.forEach((p: RemoteParticipant) => {
        list.push({
          identity: p.identity,
          name: p.name || p.identity,
          isSpeaking: p.audioLevel > COLLISION_THRESHOLD,
        });
      });
      setParticipants(list);

      const isCollision = speakingCount >= 2;
      setCollision(isCollision);
    }, COLLISION_CHECK_MS);

    return () => clearInterval(interval);
  }, []);

  // Son de collision (oscillateur aigu)
  useEffect(() => {
    if (collision) {
      try {
        if (!collisionCtxRef.current) {
          collisionCtxRef.current = new AudioContext();
        }
        const ctx = collisionCtxRef.current;
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = 'sine';
        osc.frequency.value = 1200;
        gain.gain.value = 0.15;
        osc.connect(gain).connect(ctx.destination);
        osc.start();
        collisionOscRef.current = osc;
      } catch { /* ignore */ }
    } else {
      if (collisionOscRef.current) {
        try { collisionOscRef.current.stop(); } catch { /* ignore */ }
        collisionOscRef.current = null;
      }
    }
  }, [collision]);

  /* ══════════════════════════════════════════════════
     PTT Key Configuration
     ══════════════════════════════════════════════════ */

  useEffect(() => {
    if (!waitingForKey) return;
    const handler = (e: KeyboardEvent) => {
      e.preventDefault();
      e.stopPropagation();
      const label = keyEventToLabel(e);
      if (label) {
        setPttKey(label);
        localStorage.setItem(PTT_STORAGE_KEY, label);
        setWaitingForKey(false);
      }
    };
    window.addEventListener('keydown', handler, true);
    return () => window.removeEventListener('keydown', handler, true);
  }, [waitingForKey]);

  /* ══════════════════════════════════════════════════
     Device change handlers
     ══════════════════════════════════════════════════ */

  function handleInputChange(deviceId: string) {
    setSelectedInput(deviceId);
    localStorage.setItem(AUDIO_INPUT_KEY, deviceId);
    // Reconnecter avec le nouveau device
    if (roomRef.current && currentFreq) {
      connectToFrequency(currentFreq);
    }
  }

  function handleOutputChange(deviceId: string) {
    setSelectedOutput(deviceId);
    localStorage.setItem(AUDIO_OUTPUT_KEY, deviceId);
    // Appliquer à tous les éléments audio existants
    attachedAudioRef.current.forEach((el) => {
      if ('setSinkId' in el) {
        (el as HTMLAudioElement & { setSinkId: (id: string) => Promise<void> })
          .setSinkId(deviceId).catch(() => {});
      }
    });
  }

  /* ── Decimal index handler pour respecter les limites de 132 ── */
  function handleDecChange(idx: number) {
    const decs = getDecimalsForMhz(currentMhz);
    setDecIndex(Math.min(idx, decs.length - 1));
  }

  /* ══════════════════════════════════════════════════
     Rendu
     ══════════════════════════════════════════════════ */

  const isConnected = connectionState === 'connected';
  const isConnecting = connectionState === 'connecting';

  return (
    <div className="rounded-xl border border-slate-700 bg-gradient-to-b from-slate-800 to-slate-900 shadow-lg overflow-hidden">
      {/* Header */}
      <div className={`flex items-center justify-between px-4 py-2 border-b ${
        collision ? 'bg-red-900/50 border-red-500/50' : 'bg-slate-800/80 border-slate-700'
      }`}>
        <div className="flex items-center gap-2">
          <Radio className={`h-4 w-4 ${collision ? 'text-red-400' : 'text-emerald-400'}`} />
          <span className="text-xs font-semibold text-slate-300 uppercase tracking-wider">
            VHF COM1
          </span>
        </div>
        <div className="flex items-center gap-2">
          {/* Connection status dot */}
          <div className={`w-2 h-2 rounded-full ${
            isConnected ? 'bg-emerald-400 shadow-emerald-400/50 shadow-sm' :
            isConnecting ? 'bg-amber-400 animate-pulse' :
            'bg-red-500'
          }`} />
          <span className="text-[10px] text-slate-500">
            {isConnected ? 'EN LIGNE' : isConnecting ? 'CONNEXION...' : 'HORS LIGNE'}
          </span>
        </div>
      </div>

      {/* Frequency display */}
      <div className={`text-center py-3 px-4 ${collision ? 'bg-red-950/30' : ''}`}>
        <span className={`font-mono text-3xl font-bold tracking-widest ${
          collision ? 'text-red-400 animate-pulse' : 'text-emerald-300'
        }`}>
          {currentFreq}
        </span>
        {collision && (
          <div className="flex items-center justify-center gap-1 mt-1">
            <AlertTriangle className="h-3 w-3 text-red-400" />
            <span className="text-[10px] text-red-400 font-semibold uppercase">
              Double transmission
            </span>
          </div>
        )}
      </div>

      {/* Dials */}
      <div className="flex items-center justify-center gap-3 px-4 pb-3">
        <VhfDial
          values={mhzRange.map(String)}
          currentIndex={mhzIndex}
          onChange={setMhzIndex}
          disabled={isLocked}
          label="MHz"
          size={68}
        />
        <span className="text-2xl font-mono text-slate-500 mt-4">.</span>
        <VhfDial
          values={validDecimals}
          currentIndex={safeDecIndex}
          onChange={handleDecChange}
          disabled={isLocked}
          label="kHz"
          size={68}
        />
      </div>

      {/* PTT */}
      <div className="px-4 pb-3">
        <button
          onMouseDown={startTransmit}
          onMouseUp={stopTransmit}
          onMouseLeave={stopTransmit}
          disabled={!isConnected}
          className={`w-full py-2.5 rounded-lg font-semibold text-sm uppercase tracking-wide transition-all flex items-center justify-center gap-2 ${
            isTransmitting
              ? 'bg-emerald-600 text-white shadow-lg shadow-emerald-600/30 scale-[0.98]'
              : isConnected
                ? 'bg-slate-700 text-slate-300 hover:bg-slate-600 active:bg-emerald-600'
                : 'bg-slate-800 text-slate-600 cursor-not-allowed'
          }`}
        >
          {isTransmitting ? (
            <>
              <Mic className="h-4 w-4" />
              TX — Transmission en cours
            </>
          ) : (
            <>
              <MicOff className="h-4 w-4" />
              PTT — Maintenir [{pttKey}]
            </>
          )}
        </button>
      </div>

      {/* Settings (devices + PTT config) */}
      <div className="px-4 pb-3">
        <button
          onClick={() => setShowPttConfig(!showPttConfig)}
          className="flex items-center gap-1 text-[10px] text-slate-500 hover:text-slate-300 transition-colors"
        >
          <Settings2 className="h-3 w-3" />
          Paramètres audio
        </button>

        {showPttConfig && (
          <div className="mt-2 p-3 rounded-lg bg-slate-800/50 border border-slate-700 space-y-3">
            {/* PTT key */}
            <div>
              <label className="text-[10px] text-slate-400 block mb-1">Touche PTT</label>
              {waitingForKey ? (
                <div className="text-xs text-amber-400 animate-pulse py-1">
                  Appuyez sur une touche...
                </div>
              ) : (
                <div className="flex items-center gap-2">
                  <span className="text-xs font-mono text-emerald-300 bg-slate-700 px-2 py-1 rounded">
                    {pttKey}
                  </span>
                  <button
                    onClick={() => setWaitingForKey(true)}
                    className="text-[10px] text-sky-400 hover:text-sky-300"
                  >
                    Modifier
                  </button>
                </div>
              )}
            </div>

            {/* Micro */}
            {audioInputs.length > 0 && (
              <div>
                <label className="text-[10px] text-slate-400 block mb-1">
                  <Mic className="h-3 w-3 inline mr-1" />
                  Microphone
                </label>
                <select
                  value={selectedInput}
                  onChange={(e) => handleInputChange(e.target.value)}
                  className="w-full text-xs bg-slate-700 text-slate-200 rounded px-2 py-1 border border-slate-600"
                >
                  <option value="">Par défaut</option>
                  {audioInputs.map((d) => (
                    <option key={d.deviceId} value={d.deviceId}>
                      {d.label || `Micro ${d.deviceId.slice(0, 8)}`}
                    </option>
                  ))}
                </select>
              </div>
            )}

            {/* Sortie */}
            {audioOutputs.length > 0 && (
              <div>
                <label className="text-[10px] text-slate-400 block mb-1">
                  <Volume2 className="h-3 w-3 inline mr-1" />
                  Sortie audio
                </label>
                <select
                  value={selectedOutput}
                  onChange={(e) => handleOutputChange(e.target.value)}
                  className="w-full text-xs bg-slate-700 text-slate-200 rounded px-2 py-1 border border-slate-600"
                >
                  <option value="">Par défaut</option>
                  {audioOutputs.map((d) => (
                    <option key={d.deviceId} value={d.deviceId}>
                      {d.label || `Sortie ${d.deviceId.slice(0, 8)}`}
                    </option>
                  ))}
                </select>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Participants list (ATC/AFIS only) */}
      {mode !== 'pilot' && isConnected && (
        <div className="px-4 pb-3 border-t border-slate-700/50 pt-2">
          <div className="flex items-center gap-1 mb-1">
            <Users className="h-3 w-3 text-slate-400" />
            <span className="text-[10px] text-slate-400 uppercase">
              Sur la fréquence ({participants.length})
            </span>
          </div>
          {participants.length === 0 ? (
            <p className="text-[10px] text-slate-600 italic">Aucun utilisateur</p>
          ) : (
            <div className="space-y-0.5 max-h-24 overflow-y-auto">
              {participants.map((p) => (
                <div
                  key={p.identity}
                  className={`flex items-center gap-1.5 text-xs rounded px-1.5 py-0.5 ${
                    p.isSpeaking ? 'bg-emerald-900/30 text-emerald-300' : 'text-slate-400'
                  }`}
                >
                  <div className={`w-1.5 h-1.5 rounded-full ${
                    p.isSpeaking ? 'bg-emerald-400' : 'bg-slate-600'
                  }`} />
                  <span className="font-mono text-[11px]">{p.name}</span>
                  {p.isSpeaking && (
                    <Mic className="h-3 w-3 text-emerald-400 ml-auto" />
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Audio container (hidden) */}
      <div
        ref={audioContainerRef}
        style={{ position: 'absolute', left: -9999, width: 1, height: 1, overflow: 'hidden' }}
        aria-hidden="true"
      />
    </div>
  );
}
