'use client';

import { useRef, useState, useCallback, useEffect } from 'react';
import { Room, RoomEvent, Track, ConnectionState } from '@/lib/cloudflare/client';

type SoundType = 'ring' | 'dial' | 'end' | 'beep' | 'connected';

export interface JoinCallCallbacks {
  onConnected: () => void;
  onDisconnected: () => void;
  onParticipantDisconnected: () => void;
}

export interface UseCloudflareCallOptions {
  selectedInputId: string;
  selectedOutputId: string;
  playSound: (type: SoundType) => void;
  playMessage: (msg: string) => void;
  onConnectionStatusChange: (status: string) => void;
  onExtraCleanup?: () => void;
}

export function useCloudflareCall({
  selectedInputId,
  selectedOutputId,
  playSound,
  playMessage,
  onConnectionStatusChange,
  onExtraCleanup,
}: UseCloudflareCallOptions) {
  const roomRef = useRef<Room | null>(null);
  const generation = useRef(0);
  const joinAbort = useRef<AbortController | null>(null);
  const audioContainerRef = useRef<HTMLDivElement | null>(null);
  const audioLevelIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const attachedAudioElementsRef = useRef<Map<string, HTMLAudioElement>>(new Map());

  const [audioLevel, setAudioLevel] = useState(0);
  const [isMuted, setIsMuted] = useState(false);

  const applyOutputDevice = useCallback(async (audioElement: HTMLAudioElement) => {
    audioElement.volume = 1.0;
    audioElement.autoplay = true;
    audioElement.setAttribute('playsinline', 'true');
    audioElement.setAttribute('webkit-playsinline', 'true');
    audioElement.style.position = 'absolute';
    audioElement.style.left = '-9999px';
    audioElement.style.width = '1px';
    audioElement.style.height = '1px';
    audioElement.style.opacity = '0';
    const maybeSetSink = audioElement as HTMLAudioElement & { setSinkId?: (id: string) => Promise<void> };
    if (selectedOutputId && typeof maybeSetSink.setSinkId === 'function') {
      try {
        await maybeSetSink.setSinkId(selectedOutputId);
      } catch (e) {
        console.warn('[Cloudflare] setSinkId failed:', e);
      }
    }
    const playPromise = audioElement.play();
    if (playPromise) {
      playPromise.catch((e) => console.warn('[Cloudflare] audio play blocked:', e));
    }
  }, [selectedOutputId]);

  const attachRemoteAudioTrack = useCallback(
    (track: { kind: string; sid?: string; attach: () => HTMLMediaElement }, room: Room) => {
      if (track.kind !== Track.Kind.Audio) return;
      const trackSid = (track as { sid?: string }).sid ?? 'audio-fallback';
      if (attachedAudioElementsRef.current.has(trackSid)) return;
      const audioElement = track.attach() as HTMLAudioElement;
      const container = audioContainerRef.current ?? document.body;
      container.appendChild(audioElement);
      void applyOutputDevice(audioElement);
      attachedAudioElementsRef.current.set(trackSid, audioElement);
      if (!audioLevelIntervalRef.current) {
        audioLevelIntervalRef.current = setInterval(() => {
          const participants = Array.from(room.remoteParticipants.values());
          if (participants.length > 0) {
            setAudioLevel(participants[0].audioLevel || 0);
          }
        }, 100);
      }
    },
    [applyOutputDevice],
  );

  const cleanupCloudflare = useCallback(async () => {
    generation.current++;
    joinAbort.current?.abort();
    joinAbort.current = null;
    if (audioLevelIntervalRef.current) {
      clearInterval(audioLevelIntervalRef.current);
      audioLevelIntervalRef.current = null;
    }
    attachedAudioElementsRef.current.forEach((el) => {
      try { el.remove(); } catch (_) { /* ignore */ }
    });
    attachedAudioElementsRef.current.clear();
    if (roomRef.current) {
      const room = roomRef.current;
      roomRef.current = null;
      room.removeAllListeners();
      await room.disconnect();
    }
    onExtraCleanup?.();
    setAudioLevel(0);
    setIsMuted(false);
    onConnectionStatusChange('');
  }, [onExtraCleanup, onConnectionStatusChange]);

  const joinCloudflareCall = useCallback(
    async (
      callId: string,
      participantName: string,
      callbacks: JoinCallCallbacks,
    ): Promise<boolean> => {
      const attempt = ++generation.current;
      joinAbort.current?.abort();
      const abort = new AbortController();
      joinAbort.current = abort;
      onConnectionStatusChange('Connexion...');

      try {
        const response = await fetch('/api/realtime/join', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ roomName: `call-${callId}`, participantName }),
          signal: abort.signal,
        });

        const data = await response.json();
        if (attempt !== generation.current) return false;

        if (!response.ok) {
          console.error('[Cloudflare] Token error:', data);
          throw new Error(data.details || data.error || 'Erreur token Cloudflare');
        }

        const { token, url } = data;
        if (!url) {
          console.error('[Cloudflare] URL manquante dans la réponse');
          throw new Error('URL Cloudflare non configurée');
        }

        const room = new Room({
          adaptiveStream: true,
          dynacast: true,
          audioCaptureDefaults: {
            echoCancellation: true,
            noiseSuppression: true,
            autoGainControl: true,
          },
        });
        roomRef.current = room;

        room.on(RoomEvent.Connected, () => {
          onConnectionStatusChange('En attente...');
        });

        room.on(RoomEvent.Disconnected, () => {
          void cleanupCloudflare();
          callbacks.onDisconnected();
          playSound('end');
          playMessage('Appel terminé');
        });

        room.on(RoomEvent.ParticipantConnected, (participant) => {
          if (room.state !== ConnectionState.Connected) return;
          callbacks.onConnected();
          onConnectionStatusChange('Connecté');
          playSound('connected');
          playMessage('Communications établie');
          participant.audioTrackPublications.forEach((pub) => {
            if (pub.track && pub.track.kind === Track.Kind.Audio) {
              attachRemoteAudioTrack(pub.track, room);
            }
          });
        });

        room.on(RoomEvent.ParticipantDisconnected, () => {
          void cleanupCloudflare();
          callbacks.onParticipantDisconnected();
          playSound('end');
          playMessage('Correspondant a raccroché');
        });

        room.on(RoomEvent.TrackSubscribed, (track) => {
          if (track.kind === Track.Kind.Audio) {
            attachRemoteAudioTrack(track, room);
          }
        });

        room.on(RoomEvent.TrackUnsubscribed, (track) => {
          if (track.kind === Track.Kind.Audio) {
            const sid = (track as { sid?: string }).sid;
            if (sid) {
              const el = attachedAudioElementsRef.current.get(sid);
              if (el) {
                el.remove();
                attachedAudioElementsRef.current.delete(sid);
              }
            }
            track.detach();
          }
        });

        room.on(RoomEvent.ConnectionStateChanged, (state: ConnectionState) => {
          if (state === ConnectionState.Reconnecting) setIsMuted(true);
          if (state === ConnectionState.Connected) onConnectionStatusChange('Connecté');
          else if (state === ConnectionState.Reconnecting) onConnectionStatusChange('Reconnexion...');
          else if (state === ConnectionState.Disconnected) onConnectionStatusChange('Déconnecté');
          else onConnectionStatusChange(state as string);
        });

        room.on(RoomEvent.MediaDevicesError, (error) => {
          console.error('[Cloudflare] Media devices error:', error);
          playMessage('Erreur microphone');
        });

        await room.connect(url, token, { autoSubscribe: true });
        if (attempt !== generation.current) { await room.disconnect(); return false; }

        const roomWithSwitch = room as unknown as {
          switchActiveDevice?: (kind: string, deviceId: string) => Promise<void>;
        };
        if (selectedInputId) {
          try {
            await roomWithSwitch.switchActiveDevice?.('audioinput', selectedInputId);
          } catch (e) {
            console.warn('[Cloudflare] switchActiveDevice(audioinput) failed:', e);
          }
        }
        if (selectedOutputId) {
          try {
            await roomWithSwitch.switchActiveDevice?.('audiooutput', selectedOutputId);
          } catch (e) {
            console.warn('[Cloudflare] switchActiveDevice(audiooutput) failed:', e);
          }
        }
        await room.localParticipant.setMicrophoneEnabled(true);
        if (attempt !== generation.current) { await room.disconnect(); return false; }

        // Si l'autre participant est déjà dans la room (rejoint avant nous)
        const existingParticipants = Array.from(room.remoteParticipants.values());
        if (existingParticipants.length > 0) {
          callbacks.onConnected();
          onConnectionStatusChange('Connecté');
          playSound('connected');
          playMessage('Communications établie');
          existingParticipants.forEach((p) => {
            p.audioTrackPublications.forEach((pub) => {
              if (pub.track && pub.track.kind === Track.Kind.Audio) {
                attachRemoteAudioTrack(pub.track, room);
              }
            });
          });
        }
        return true;
      } catch (err) {
        if (attempt !== generation.current) return false;
        console.error('[Cloudflare] Error:', err);
        const errorMessage = err instanceof Error ? err.message : 'Erreur inconnue';
        onConnectionStatusChange(`Erreur: ${errorMessage}`);
        playMessage("Impossible d'établir la communication");
        await cleanupCloudflare();
        return false;
      }
    },
    [
      selectedInputId,
      selectedOutputId,
      onConnectionStatusChange,
      cleanupCloudflare,
      playSound,
      playMessage,
      attachRemoteAudioTrack,
    ],
  );

  const toggleMute = useCallback(async () => {
    if (roomRef.current?.localParticipant) {
      const newMuted = !isMuted;
      await roomRef.current.localParticipant.setMicrophoneEnabled(!newMuted);
      setIsMuted(newMuted);
    }
  }, [isMuted]);

  // Synchroniser le périphérique de sortie quand selectedOutputId change
  useEffect(() => {
    if (!roomRef.current || !selectedOutputId) return;
    const roomWithSwitch = roomRef.current as unknown as {
      switchActiveDevice?: (kind: string, deviceId: string) => Promise<void>;
    };
    void roomWithSwitch.switchActiveDevice?.('audiooutput', selectedOutputId);
    attachedAudioElementsRef.current.forEach((el) => { void applyOutputDevice(el); });
  }, [selectedOutputId, applyOutputDevice]);

  const cleanupRef = useRef(cleanupCloudflare);
  cleanupRef.current = cleanupCloudflare;
  useEffect(() => () => { void cleanupRef.current(); }, []);

  return {
    audioContainerRef,
    audioLevel,
    isMuted,
    cleanupCloudflare,
    joinCloudflareCall,
    toggleMute,
  };
}
