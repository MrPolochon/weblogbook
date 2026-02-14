'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { Radio, Mic, MicOff, Volume2, Settings2, Users, AlertTriangle, X, SlidersHorizontal } from 'lucide-react';
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
} from 'livekit-client';

/* ───────────────────── Types ───────────────────── */

interface VhfRadioProps {
  mode: 'pilot' | 'atc' | 'afis';
  lockedFrequency?: string;
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
const COLLISION_THRESHOLD = 0.01;
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
  const initialFreq = lockedFrequency ? parseFrequency(lockedFrequency) : null;

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

  /* ── Collision ── */
  const [collision, setCollision] = useState(false);
  const collisionOscRef = useRef<OscillatorNode | null>(null);
  const collisionCtxRef = useRef<AudioContext | null>(null);

  /* ── Audio devices ── */
  const [audioInputs, setAudioInputs] = useState<MediaDeviceInfo[]>([]);
  const [audioOutputs, setAudioOutputs] = useState<MediaDeviceInfo[]>([]);
  const [selectedInput, setSelectedInput] = useState('');
  const [selectedOutput, setSelectedOutput] = useState('');

  /* ── Mobile modals ── */
  const [showFreqModal, setShowFreqModal] = useState(false);
  const [showPttModal, setShowPttModal] = useState(false);
  const [isMobile, setIsMobile] = useState(false);

  /* ══════════════════════════════════════════════════
     Initialisation
     ══════════════════════════════════════════════════ */

  useEffect(() => {
    const check = () => setIsMobile(window.innerWidth < 768);
    check();
    window.addEventListener('resize', check);
    return () => window.removeEventListener('resize', check);
  }, []);

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

  const connectToFrequency = useCallback(
    async (freq: string) => {
      if (!isValidVhfFrequency(freq)) return;
      cleanupRoom();
      try {
        setConnectionState('connecting');
        const res = await fetch('/api/livekit/token', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            roomName: frequencyToRoomName(freq),
            participantName: participantName || 'Inconnu',
          }),
        });
        if (!res.ok) { setConnectionState('error'); return; }
        const { token, url } = await res.json();
        if (!token || !url) { setConnectionState('error'); return; }

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
      list.push({ identity: p.identity, name: p.name || p.identity, isSpeaking: p.isSpeaking });
    });
    setParticipants(list);
  }

  const prevFreqRef = useRef('');
  useEffect(() => {
    if (currentFreq !== prevFreqRef.current) {
      prevFreqRef.current = currentFreq;
      connectToFrequency(currentFreq);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentFreq]);

  useEffect(() => {
    return () => { cleanupRoom(); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /* ══════════════════════════════════════════════════
     PTT
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
    } catch (err) { console.error('[VHF] Unmute error:', err); }
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
    } catch (err) { console.error('[VHF] Mute error:', err); }
  }, []);

  useEffect(() => {
    const handleDown = (e: KeyboardEvent) => {
      if (waitingForKey) return;
      if (matchesPttKey(e, pttKey)) { e.preventDefault(); startTransmit(); }
    };
    const handleUp = (e: KeyboardEvent) => {
      if (matchesPttKey(e, pttKey)) { e.preventDefault(); stopTransmit(); }
    };
    window.addEventListener('keydown', handleDown);
    window.addEventListener('keyup', handleUp);
    return () => { window.removeEventListener('keydown', handleDown); window.removeEventListener('keyup', handleUp); };
  }, [pttKey, startTransmit, stopTransmit, waitingForKey]);

  /* ══════════════════════════════════════════════════
     Collision detection
     ══════════════════════════════════════════════════ */

  useEffect(() => {
    const interval = setInterval(() => {
      const room = roomRef.current;
      if (!room) return;
      let speakingCount = 0;
      if (pttActiveRef.current) speakingCount++;
      room.remoteParticipants.forEach((p: RemoteParticipant) => {
        if (p.audioLevel > COLLISION_THRESHOLD) speakingCount++;
      });
      const list: ParticipantInfo[] = [];
      room.remoteParticipants.forEach((p: RemoteParticipant) => {
        list.push({ identity: p.identity, name: p.name || p.identity, isSpeaking: p.audioLevel > COLLISION_THRESHOLD });
      });
      setParticipants(list);
      setCollision(speakingCount >= 2);
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
    if (roomRef.current && currentFreq) connectToFrequency(currentFreq);
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

  function handleDecChange(idx: number) {
    const decs = getDecimalsForMhz(currentMhz);
    setDecIndex(Math.min(idx, decs.length - 1));
  }

  /* ══════════════════════════════════════════════════
     Sous-composants partagés
     ══════════════════════════════════════════════════ */

  const isConnected = connectionState === 'connected';
  const isConnecting = connectionState === 'connecting';

  const statusDot = (
    <div className={`w-2 h-2 rounded-full flex-shrink-0 ${
      isConnected ? 'bg-emerald-400 shadow-emerald-400/50 shadow-sm' :
      isConnecting ? 'bg-amber-400 animate-pulse' : 'bg-red-500'
    }`} />
  );

  /** Bloc fréquence + molettes */
  const freqDisplay = (
    <div className={`text-center ${collision ? 'bg-red-950/30 rounded-lg p-2' : ''}`}>
      <span className={`font-mono text-3xl font-bold tracking-widest ${
        collision ? 'text-red-400 animate-pulse' : 'text-emerald-300'
      }`}>
        {currentFreq}
      </span>
      {collision && (
        <div className="flex items-center justify-center gap-1 mt-1">
          <AlertTriangle className="h-3 w-3 text-red-400" />
          <span className="text-[10px] text-red-400 font-semibold uppercase">Double transmission</span>
        </div>
      )}
    </div>
  );

  const dialControls = (
    <div className="flex items-center justify-center gap-3">
      <VhfDial values={mhzRange.map(String)} currentIndex={mhzIndex} onChange={setMhzIndex} disabled={isLocked} label="MHz" size={isMobile ? 80 : 68} />
      <span className="text-2xl font-mono text-slate-500 mt-4">.</span>
      <VhfDial values={validDecimals} currentIndex={safeDecIndex} onChange={handleDecChange} disabled={isLocked} label="kHz" size={isMobile ? 80 : 68} />
    </div>
  );

  /** Bouton PTT (desktop inline) */
  const pttButton = (
    <button
      onMouseDown={startTransmit}
      onMouseUp={stopTransmit}
      onMouseLeave={stopTransmit}
      onTouchStart={(e) => { e.preventDefault(); startTransmit(); }}
      onTouchEnd={(e) => { e.preventDefault(); stopTransmit(); }}
      onTouchCancel={stopTransmit}
      disabled={!isConnected}
      className={`w-full py-2.5 rounded-lg font-semibold text-sm uppercase tracking-wide transition-all flex items-center justify-center gap-2 touch-manipulation select-none ${
        isTransmitting
          ? 'bg-emerald-600 text-white shadow-lg shadow-emerald-600/30 scale-[0.98]'
          : isConnected
            ? 'bg-slate-700 text-slate-300 hover:bg-slate-600 active:bg-emerald-600'
            : 'bg-slate-800 text-slate-600 cursor-not-allowed'
      }`}
    >
      {isTransmitting ? (
        <><Mic className="h-4 w-4" /> TX — Transmission</>
      ) : (
        <><MicOff className="h-4 w-4" /> PTT {!isMobile && `— [${pttKey}]`}</>
      )}
    </button>
  );

  /** Paramètres audio (partagé desktop/modal) */
  const settingsPanel = (
    <div className="space-y-3">
      {/* PTT key (desktop only) */}
      {!isMobile && (
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
        </div>
      )}
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
  );

  /** Liste participants (ATC/AFIS) */
  const participantsList = mode !== 'pilot' && isConnected && (
    <div>
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
  );

  /* ══════════════════════════════════════════════════
     RENDU MOBILE
     ══════════════════════════════════════════════════ */

  if (isMobile) {
    return (
      <>
        {/* Barre compacte */}
        <div className={`rounded-xl border overflow-hidden ${collision ? 'border-red-500/50 bg-red-950/20' : 'border-slate-700 bg-slate-800/90'}`}>
          <div className="flex items-center justify-between px-3 py-2.5">
            {/* Freq + status */}
            <button
              onClick={() => !isLocked && setShowFreqModal(true)}
              className="flex items-center gap-2 touch-manipulation"
            >
              <Radio className={`h-4 w-4 flex-shrink-0 ${collision ? 'text-red-400' : 'text-emerald-400'}`} />
              <span className={`font-mono text-xl font-bold tracking-wider ${collision ? 'text-red-400' : 'text-emerald-300'}`}>
                {currentFreq}
              </span>
              {!isLocked && (
                <SlidersHorizontal className="h-3.5 w-3.5 text-slate-500" />
              )}
            </button>

            <div className="flex items-center gap-2">
              {statusDot}
              {/* Settings button */}
              <button
                onClick={() => setShowPttConfig(!showPttConfig)}
                className="p-1.5 rounded-lg bg-slate-700 text-slate-400 hover:text-slate-200 touch-manipulation"
              >
                <Settings2 className="h-4 w-4" />
              </button>
            </div>
          </div>

          {/* Settings panel inline */}
          {showPttConfig && (
            <div className="px-3 pb-3 pt-1 border-t border-slate-700/50">
              {settingsPanel}
            </div>
          )}

          {/* Collision warning */}
          {collision && (
            <div className="flex items-center justify-center gap-1 pb-2">
              <AlertTriangle className="h-3 w-3 text-red-400" />
              <span className="text-[10px] text-red-400 font-semibold uppercase">Double transmission</span>
            </div>
          )}

          {/* Participants (ATC/AFIS) */}
          {participantsList && (
            <div className="px-3 pb-2 border-t border-slate-700/50 pt-2">
              {participantsList}
            </div>
          )}
        </div>

        {/* Bouton PTT flottant */}
        {isConnected && (
          <button
            onTouchStart={(e) => { e.preventDefault(); startTransmit(); }}
            onTouchEnd={(e) => { e.preventDefault(); stopTransmit(); }}
            onTouchCancel={stopTransmit}
            onMouseDown={startTransmit}
            onMouseUp={stopTransmit}
            onMouseLeave={stopTransmit}
            className={`fixed bottom-6 right-6 z-50 w-16 h-16 rounded-full shadow-2xl flex items-center justify-center touch-manipulation select-none transition-all ${
              isTransmitting
                ? 'bg-emerald-500 scale-110 shadow-emerald-500/40'
                : collision
                  ? 'bg-red-600 shadow-red-600/30'
                  : 'bg-slate-700 shadow-slate-900/50 active:bg-emerald-500'
            }`}
          >
            {isTransmitting ? (
              <Mic className="h-7 w-7 text-white" />
            ) : (
              <MicOff className="h-7 w-7 text-slate-300" />
            )}
          </button>
        )}

        {/* Modal changement de fréquence */}
        {showFreqModal && (
          <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/60 backdrop-blur-sm" onClick={() => setShowFreqModal(false)}>
            <div
              className="w-full max-w-sm bg-slate-900 border border-slate-700 rounded-t-2xl sm:rounded-2xl p-5 space-y-4 shadow-2xl"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-semibold text-slate-200 uppercase tracking-wider">Fréquence VHF</h3>
                <button onClick={() => setShowFreqModal(false)} className="p-1 text-slate-500 hover:text-slate-200 touch-manipulation">
                  <X className="h-5 w-5" />
                </button>
              </div>

              {freqDisplay}
              {dialControls}

              {/* Drag handle */}
              <div className="flex justify-center pt-2">
                <div className="w-10 h-1 rounded-full bg-slate-700" />
              </div>
            </div>
          </div>
        )}

        {/* Audio container */}
        <div ref={audioContainerRef} style={{ position: 'absolute', left: -9999, width: 1, height: 1, overflow: 'hidden' }} aria-hidden="true" />
      </>
    );
  }

  /* ══════════════════════════════════════════════════
     RENDU DESKTOP
     ══════════════════════════════════════════════════ */

  return (
    <div className="rounded-xl border border-slate-700 bg-gradient-to-b from-slate-800 to-slate-900 shadow-lg overflow-hidden">
      {/* Header */}
      <div className={`flex items-center justify-between px-4 py-2 border-b ${
        collision ? 'bg-red-900/50 border-red-500/50' : 'bg-slate-800/80 border-slate-700'
      }`}>
        <div className="flex items-center gap-2">
          <Radio className={`h-4 w-4 ${collision ? 'text-red-400' : 'text-emerald-400'}`} />
          <span className="text-xs font-semibold text-slate-300 uppercase tracking-wider">VHF COM1</span>
        </div>
        <div className="flex items-center gap-2">
          {statusDot}
          <span className="text-[10px] text-slate-500">
            {isConnected ? 'EN LIGNE' : isConnecting ? 'CONNEXION...' : 'HORS LIGNE'}
          </span>
        </div>
      </div>

      {/* Frequency */}
      <div className="py-3 px-4">{freqDisplay}</div>

      {/* Dials */}
      <div className="px-4 pb-3">{dialControls}</div>

      {/* PTT */}
      <div className="px-4 pb-3">{pttButton}</div>

      {/* Settings toggle */}
      <div className="px-4 pb-3">
        <button onClick={() => setShowPttConfig(!showPttConfig)} className="flex items-center gap-1 text-[10px] text-slate-500 hover:text-slate-300 transition-colors">
          <Settings2 className="h-3 w-3" />
          Paramètres audio
        </button>
        {showPttConfig && (
          <div className="mt-2 p-3 rounded-lg bg-slate-800/50 border border-slate-700">
            {settingsPanel}
          </div>
        )}
      </div>

      {/* Participants */}
      {participantsList && (
        <div className="px-4 pb-3 border-t border-slate-700/50 pt-2">
          {participantsList}
        </div>
      )}

      {/* Audio container */}
      <div ref={audioContainerRef} style={{ position: 'absolute', left: -9999, width: 1, height: 1, overflow: 'hidden' }} aria-hidden="true" />
    </div>
  );
}
