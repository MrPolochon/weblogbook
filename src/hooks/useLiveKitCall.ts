'use client';

import { useState, useRef, useCallback, useEffect } from 'react';
import {
  Room,
  RoomEvent,
  Track,
  RemoteParticipant,
  RemoteTrackPublication,
  ConnectionState,
} from 'livekit-client';

interface UseLiveKitCallOptions {
  onConnected?: () => void;
  onDisconnected?: () => void;
  onParticipantJoined?: (participant: RemoteParticipant) => void;
  onParticipantLeft?: (participant: RemoteParticipant) => void;
  onError?: (error: Error) => void;
}

export function useLiveKitCall(options: UseLiveKitCallOptions = {}) {
  const [isConnected, setIsConnected] = useState(false);
  const [isConnecting, setIsConnecting] = useState(false);
  const [isMuted, setIsMuted] = useState(false);
  const [audioLevel, setAudioLevel] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [remoteParticipant, setRemoteParticipant] = useState<RemoteParticipant | null>(null);
  
  const roomRef = useRef<Room | null>(null);
  const audioElementRef = useRef<HTMLAudioElement | null>(null);
  const audioLevelIntervalRef = useRef<NodeJS.Timeout | null>(null);

  // Nettoyer les ressources
  const cleanup = useCallback(async () => {
    console.log('[LiveKit] Cleanup');
    
    if (audioLevelIntervalRef.current) {
      clearInterval(audioLevelIntervalRef.current);
      audioLevelIntervalRef.current = null;
    }
    
    if (roomRef.current) {
      await roomRef.current.disconnect();
      roomRef.current = null;
    }
    
    setIsConnected(false);
    setIsConnecting(false);
    setRemoteParticipant(null);
    setAudioLevel(0);
  }, []);

  // Rejoindre une room (appel)
  const joinCall = useCallback(async (callId: string, participantName: string) => {
    console.log('[LiveKit] Joining call:', callId);
    setIsConnecting(true);
    setError(null);
    
    try {
      // Obtenir le token depuis l'API
      const response = await fetch('/api/livekit/token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          roomName: `call-${callId}`,
          participantName,
        }),
      });
      
      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || 'Erreur obtention token');
      }
      
      const { token, url } = await response.json();
      
      if (!url) {
        throw new Error('URL LiveKit non configurée');
      }
      
      // Créer et configurer la room
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
      
      // Événements de la room
      room.on(RoomEvent.Connected, () => {
        console.log('[LiveKit] Connected');
        setIsConnected(true);
        setIsConnecting(false);
        options.onConnected?.();
      });
      
      room.on(RoomEvent.Disconnected, () => {
        console.log('[LiveKit] Disconnected');
        setIsConnected(false);
        setRemoteParticipant(null);
        options.onDisconnected?.();
      });
      
      room.on(RoomEvent.ParticipantConnected, (participant: RemoteParticipant) => {
        console.log('[LiveKit] Participant joined:', participant.identity);
        setRemoteParticipant(participant);
        options.onParticipantJoined?.(participant);
      });
      
      room.on(RoomEvent.ParticipantDisconnected, (participant: RemoteParticipant) => {
        console.log('[LiveKit] Participant left:', participant.identity);
        setRemoteParticipant(null);
        options.onParticipantLeft?.(participant);
      });
      
      room.on(RoomEvent.TrackSubscribed, (track, publication: RemoteTrackPublication, participant: RemoteParticipant) => {
        console.log('[LiveKit] Track subscribed:', track.kind);
        if (track.kind === Track.Kind.Audio) {
          // Attacher l'audio à un élément
          const audioElement = track.attach();
          audioElement.volume = 1.0;
          audioElementRef.current = audioElement;
          document.body.appendChild(audioElement);
          
          // Monitorer le niveau audio
          audioLevelIntervalRef.current = setInterval(() => {
            // LiveKit fournit le niveau audio via les stats
            const level = participant.audioLevel || 0;
            setAudioLevel(level);
          }, 100);
        }
      });
      
      room.on(RoomEvent.TrackUnsubscribed, (track) => {
        if (track.kind === Track.Kind.Audio) {
          track.detach();
          if (audioElementRef.current) {
            audioElementRef.current.remove();
            audioElementRef.current = null;
          }
        }
      });
      
      room.on(RoomEvent.ConnectionStateChanged, (state: ConnectionState) => {
        console.log('[LiveKit] Connection state:', state);
        if (state === ConnectionState.Disconnected) {
          setIsConnected(false);
        }
      });
      
      // Connecter à la room avec audio activé
      await room.connect(url, token, {
        autoSubscribe: true,
      });
      
      // Publier l'audio local
      await room.localParticipant.setMicrophoneEnabled(true);
      
      console.log('[LiveKit] Connected and publishing audio');
      
    } catch (err) {
      console.error('[LiveKit] Error:', err);
      setError(err instanceof Error ? err.message : 'Erreur connexion');
      setIsConnecting(false);
      options.onError?.(err instanceof Error ? err : new Error('Erreur inconnue'));
      await cleanup();
    }
  }, [cleanup, options]);

  // Quitter l'appel
  const leaveCall = useCallback(async () => {
    console.log('[LiveKit] Leaving call');
    await cleanup();
  }, [cleanup]);

  // Muter/démuter
  const toggleMute = useCallback(async () => {
    if (roomRef.current?.localParticipant) {
      const newMuted = !isMuted;
      await roomRef.current.localParticipant.setMicrophoneEnabled(!newMuted);
      setIsMuted(newMuted);
      console.log('[LiveKit] Mute:', newMuted);
    }
  }, [isMuted]);

  // Cleanup à la destruction
  useEffect(() => {
    return () => {
      cleanup();
    };
  }, [cleanup]);

  return {
    isConnected,
    isConnecting,
    isMuted,
    audioLevel,
    error,
    remoteParticipant,
    joinCall,
    leaveCall,
    toggleMute,
  };
}
