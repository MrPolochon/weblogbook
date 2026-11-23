'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { AudioPresets, ConnectionState, LocalAudioTrack, Room, RoomEvent, Track } from '@/lib/cloudflare/client';
import { frequencyToRoomName, isValidVhfFrequency } from '@/lib/vhf-frequencies';
import { RadioSquelch } from '@/lib/radio-squelch';
import { RadioMicMode, RadioTransmission } from '@/lib/radio-transmission';

type Microphone = {
  stream: MediaStream;
  context: AudioContext;
  source: MediaStreamAudioSourceNode;
  gain: GainNode;
  track: LocalAudioTrack;
};

function stopMicrophone(mic: Microphone) {
  mic.gain.gain.value = 0;
  mic.stream.getTracks().forEach(track => track.stop());
  mic.track.stop();
  mic.source.disconnect();
  mic.gain.disconnect();
  void mic.context.close().catch(() => {});
}

export function useVhfRadio(participantName: string, observer = false) {
  const poweredRef = useRef(false);
  const targetRef = useRef('');
  const retryTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const retries = useRef(0);
  const connectRef = useRef<(target: string, retry?: boolean) => Promise<void>>(async () => {});
  const soundRef = useRef<RadioSquelch | null>(null);
  const effectsRef = useRef(true);
  const [effects, setEffectsState] = useState(true);
  const [powered, setPowered] = useState(false);
  const roomRef = useRef<Room | null>(null);
  const micRef = useRef<Microphone | null>(null);
  const generation = useRef(0);
  const micRequest = useRef(0);
  const abortRef = useRef<AbortController | null>(null);
  const audio = useRef(new Map<string, HTMLAudioElement>());
  const volumeRef = useRef(0.8);
  const [connection, setConnection] = useState<ConnectionState>(ConnectionState.Disconnected);
  const [frequency, setFrequency] = useState('');
  const [receiveOnly, setReceiveOnly] = useState(observer);
  const observerRef = useRef(observer);
  observerRef.current = observer;
  const [mode, setMode] = useState<RadioMicMode>('muted');
  const [transmitting, setTransmitting] = useState(false);
  const [preparingMic, setPreparingMic] = useState(false);
  const [micReady, setMicReady] = useState(false);
  const [error, setError] = useState('');
  const [audioBlocked, setAudioBlocked] = useState(false);
  const [participants, setParticipants] = useState<{ id: string; name: string; speaking: boolean }[]>([]);
  const [volume, setVolumeState] = useState(0.8);
  const gate = useRef<RadioTransmission | null>(null);
  if (!gate.current) gate.current = new RadioTransmission(enabled => {
    const mic = micRef.current;
    if (mic) mic.gain.gain.setValueAtTime(enabled ? 1 : 0, mic.context.currentTime);
    soundRef.current?.setTransmit(enabled);
    setTransmitting(enabled);
  });

  const cleanup = useCallback(() => {
    generation.current++;
    micRequest.current++;
    abortRef.current?.abort();
    abortRef.current = null;
    soundRef.current?.close();
    soundRef.current = null;
    gate.current!.reset();
    setMode('muted');
    setPreparingMic(false);
    setMicReady(false);
    if (micRef.current) stopMicrophone(micRef.current);
    micRef.current = null;
    const room = roomRef.current;
    roomRef.current = null;
    room?.removeAllListeners();
    if (room) void room.disconnect(true).catch(() => {});
    audio.current.forEach(el => { el.pause(); el.srcObject = null; el.remove(); });
    audio.current.clear();
    setConnection(ConnectionState.Disconnected);
    setParticipants([]);
    setAudioBlocked(false);
  }, []);

  const disconnect = useCallback(() => {
    poweredRef.current = false;
    setPowered(false);
    if (retryTimer.current) clearTimeout(retryTimer.current);
    retryTimer.current = null;
    cleanup();
    setError('');
  }, [cleanup]);

  const scheduleRetry = useCallback((target: string, message: string) => {
    if (!poweredRef.current || targetRef.current !== target) return;
    if (retryTimer.current) clearTimeout(retryTimer.current);
    const delay = Math.min(30, 5 * 2 ** Math.min(retries.current++, 3));
    setConnection(ConnectionState.Reconnecting);
    setError(message + ' Nouvelle tentative dans ' + delay + ' s.');
    retryTimer.current = setTimeout(() => {
      retryTimer.current = null;
      if (poweredRef.current && targetRef.current === target) void connectRef.current(target, true);
    }, delay * 1000);
  }, []);

  const setMicMode = useCallback(async (next: RadioMicMode, deviceId = '') => {
    const room = roomRef.current;
    const requestId = ++micRequest.current;
    // Close the audio gate before any await, including permission prompts.
    gate.current!.setMode('muted');
    setMode('muted');
    setPreparingMic(false);
    if (next === 'muted') {
      gate.current!.setReady(false);
      setMicReady(false);
      const previous = micRef.current;
      micRef.current = null;
      if (previous) {
        stopMicrophone(previous);
        if (room) void room.localParticipant.unpublishTrack(previous.track).catch(() => {});
      }
      return;
    }
    if (observerRef.current || room?.canPublish === false) return;
    if (!room || room.state !== ConnectionState.Connected) return;
    setError('');
    setPreparingMic(true);
    let pending: Microphone | null = null;
    let stream: MediaStream | null = null;
    let context: AudioContext | null = null;
    const current = () => requestId === micRequest.current && roomRef.current === room && room.state === ConnectionState.Connected;
    try {
      if (!micRef.current) {
        // Resume in the user gesture, before waiting for the permission dialog.
        context = new AudioContext();
        await context.resume();
        stream = await navigator.mediaDevices.getUserMedia({ audio: {
          deviceId: deviceId ? { exact: deviceId } : undefined,
          echoCancellation: true, noiseSuppression: true, autoGainControl: true, channelCount: 1,
        }, video: false });
        if (!current()) { stream.getTracks().forEach(t => t.stop()); await context.close(); return; }
        const source = context.createMediaStreamSource(stream);
        const gain = context.createGain();
        gain.gain.value = 0;
        const destination = context.createMediaStreamDestination();
        source.connect(gain).connect(destination);
        // Publish only the gated stream. The raw microphone NEVER reaches Cloudflare.
        const track = new LocalAudioTrack(destination.stream.getAudioTracks()[0]);
        pending = { stream, context, source, gain, track };
        await room.localParticipant.publishTrack(track, {
          source: Track.Source.Microphone, audioPreset: AudioPresets.speech, dtx: true, red: true,
        });
        if (!current()) {
          stopMicrophone(pending);
          void room.localParticipant.unpublishTrack(track).catch(() => {});
          return;
        }
        micRef.current = pending;
        pending = null;
        stream.getAudioTracks()[0].onended = () => {
          if (micRef.current?.track !== track) return;
          gate.current!.reset();
          setMode('muted');
          setMicReady(false);
          stopMicrophone(micRef.current);
          micRef.current = null;
          void room.localParticipant.unpublishTrack(track).catch(() => {});
          setError('Microphone déconnecté. Choisis de nouveau un mode pour le réactiver.');
        };
        context.onstatechange = () => {
          if (micRef.current?.track !== track || context?.state === 'running') return;
          gate.current!.reset();
          setMode('muted');
          setMicReady(false);
          setError('Audio suspendu par le navigateur. Réactive le microphone.');
        };
      } else {
        await micRef.current.context.resume();
      }
      if (!current()) return;
      gate.current!.setReady(true);
      gate.current!.setMode(next);
      setMode(next);
      setMicReady(true);
    } catch (cause) {
      if (pending) stopMicrophone(pending);
      else if (!micRef.current) {
        stream?.getTracks().forEach(t => t.stop());
        if (context) void context.close().catch(() => {});
      }
      if (current()) {
        gate.current!.reset();
        setMicReady(false);
        setError(cause instanceof Error ? `Microphone indisponible : ${cause.message}` : 'Microphone indisponible.');
      }
    } finally {
      if (requestId === micRequest.current) setPreparingMic(false);
    }
  }, []);

  const connect = useCallback(async (target: string, retry = false) => {
    if (!isValidVhfFrequency(target)) { setError('Fréquence VHF invalide.'); return; }
    if (retry && (!poweredRef.current || targetRef.current !== target)) return;
    if (retryTimer.current) clearTimeout(retryTimer.current);
    retryTimer.current = null;
    poweredRef.current = true;
    targetRef.current = target;
    setPowered(true);
    if (!retry) retries.current = 0;
    cleanup();
    try { soundRef.current = new RadioSquelch(volumeRef.current); soundRef.current.setEnabled(effectsRef.current); } catch { /* Sound effects are optional. */ }
    const attempt = generation.current;
    setError('');
    setFrequency(target);
    setConnection(ConnectionState.Connecting);
    const abort = new AbortController();
    abortRef.current = abort;
    const timer = setTimeout(() => abort.abort(), 15_000);
    let room: Room | null = null;
    try {
      const response = await fetch('/api/realtime/join', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ roomName: frequencyToRoomName(target), participantName, observer }), signal: abort.signal,
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Connexion radio refusée.');
      if (attempt !== generation.current) return;
      room = new Room();
      roomRef.current = room;
      const activeRoom = room;
      let joined = false;
      const updateParticipants = () => {
        const peers = Array.from(activeRoom.remoteParticipants.values());
        setParticipants(peers.map(p => ({ id: p.identity, name: p.name || p.identity, speaking: p.isSpeaking })));
        soundRef.current?.setReceive(peers.some(p => p.isSpeaking));
      };
      room.on(RoomEvent.ParticipantConnected, updateParticipants);
      room.on(RoomEvent.ParticipantDisconnected, updateParticipants);
      room.on(RoomEvent.ActiveSpeakersChanged, updateParticipants);
      room.on(RoomEvent.ConnectionStateChanged, state => {
        setConnection(state);
        if (state !== ConnectionState.Connected) {
          // A reconnect never restores an open mic or a held PTT automatically.
          void setMicMode('muted');
        }
      });
      room.on(RoomEvent.Disconnected, () => {
        if (roomRef.current !== activeRoom) return;
        // connect() rejects with the original error after its own cleanup.
        // Keep this attempt alive so the catch below can display that error.
        if (!joined) return;
        cleanup();
        scheduleRetry(target, 'Radio déconnectée.');
      });
      room.on(RoomEvent.TrackSubscribed, track => {
        if (track.kind !== Track.Kind.Audio) return;
        const el = track.attach() as HTMLAudioElement;
        el.volume = volumeRef.current;
        el.setAttribute('playsinline', '');
        el.style.display = 'none';
        document.body.appendChild(el);
        audio.current.set(track.sid!, el);
        void el.play().catch(() => setAudioBlocked(true));
      });
      room.on(RoomEvent.TrackUnsubscribed, track => {
        track.detach().forEach(el => el.remove());
        audio.current.delete(track.sid!);
      });
      room.on(RoomEvent.AudioPlaybackStatusChanged, () => setAudioBlocked(!activeRoom.canPlaybackAudio));
      await room.connect(data.url, data.token, { autoSubscribe: true, canPublish: data.canPublish === true && !observer });
      if (attempt !== generation.current) { await room.disconnect(); return; }
      joined = true;
      retries.current = 0;
      setReceiveOnly(observer || !activeRoom.canPublish);
      setConnection(room.state);
      updateParticipants();
      void room.startAudio().catch(() => setAudioBlocked(true));
      // Receive only until the user explicitly chooses PTT or open microphone.
    } catch (cause) {
      if (attempt !== generation.current) { if (room) void room.disconnect(); return; }
      cleanup();
      scheduleRetry(target, cause instanceof Error ? cause.message : 'Impossible de rejoindre la fréquence.');
    } finally { clearTimeout(timer); }
  }, [cleanup, scheduleRetry, participantName, observer, setMicMode]);

  connectRef.current = connect;

  const resumeAudio = useCallback(async () => {
    try {
      await soundRef.current?.resume();
      await roomRef.current?.startAudio();
      await Promise.all(Array.from(audio.current.values(), el => el.play()));
      setAudioBlocked(false);
    } catch { setAudioBlocked(true); }
  }, []);

  const setVolume = useCallback((value: number) => {
    value = Math.max(0, Math.min(1, value));
    soundRef.current?.setVolume(value);
    volumeRef.current = value;
    setVolumeState(value);
    audio.current.forEach(el => { el.volume = value; });
  }, []);

  useEffect(() => {
    const release = () => gate.current!.releaseLocal();
    const visibility = () => { if (document.hidden) release(); };
    window.addEventListener('blur', release);
    window.addEventListener('pagehide', disconnect);
    document.addEventListener('visibilitychange', visibility);
    return () => {
      window.removeEventListener('blur', release);
      window.removeEventListener('pagehide', disconnect);
      document.removeEventListener('visibilitychange', visibility);
      disconnect();
    };
  }, [disconnect]);

  useEffect(() => { disconnect(); setReceiveOnly(observer); }, [observer, disconnect]);

  const press = useCallback((source: string) => gate.current!.press(source), []);
  const release = useCallback((source: string) => gate.current!.release(source), []);
  const releaseAll = useCallback(() => gate.current!.releaseAll(), []);

  const setEffects = useCallback((enabled: boolean) => {
    effectsRef.current = enabled; setEffectsState(enabled); soundRef.current?.setEnabled(enabled);
  }, []);

  return { powered, effects, setEffects, receiveOnly, connection, frequency, mode, transmitting, preparingMic, micReady, error, audioBlocked,
    participants, volume, setVolume, connect, disconnect, setMicMode, resumeAudio,
    press, release, releaseAll,
  };
}
