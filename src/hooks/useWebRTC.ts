'use client';

import { useEffect, useRef, useState } from 'react';

type WebRTCState = 'idle' | 'connecting' | 'connected' | 'disconnected';

interface UseWebRTCProps {
  callId: string | null;
  userId: string;
  onStateChange?: (state: WebRTCState) => void;
}

export function useWebRTC({ callId, userId, onStateChange }: UseWebRTCProps) {
  const [state, setState] = useState<WebRTCState>('idle');
  const [isMuted, setIsMuted] = useState(false);
  const localAudioRef = useRef<HTMLAudioElement | null>(null);
  const remoteAudioRef = useRef<HTMLAudioElement | null>(null);
  const peerConnectionRef = useRef<RTCPeerConnection | null>(null);
  const localStreamRef = useRef<MediaStream | null>(null);
  const wsRef = useRef<WebSocket | null>(null);
  const isInitiatorRef = useRef(false);

  const updateState = (newState: WebRTCState) => {
    setState(newState);
    onStateChange?.(newState);
  };

  // Configuration WebRTC
  const getRTCConfiguration = (): RTCConfiguration => {
    return {
      iceServers: [
        { urls: 'stun:stun.l.google.com:19302' },
        { urls: 'stun:stun1.l.google.com:19302' },
      ],
    };
  };

  // Créer la connexion peer
  const createPeerConnection = () => {
    const pc = new RTCPeerConnection(getRTCConfiguration());
    
    // Gérer les candidats ICE
    pc.onicecandidate = (event) => {
      if (event.candidate && wsRef.current?.readyState === WebSocket.OPEN) {
        wsRef.current.send(JSON.stringify({
          type: 'ice-candidate',
          candidate: event.candidate,
          callId,
          userId,
        }));
      }
    };

    // Gérer les streams distants
    pc.ontrack = (event) => {
      if (remoteAudioRef.current && event.streams[0]) {
        remoteAudioRef.current.srcObject = event.streams[0];
      }
    };

    // Gérer les changements de connexion
    pc.onconnectionstatechange = () => {
      const connectionState = pc.connectionState;
      if (connectionState === 'connected') {
        updateState('connected');
      } else if (connectionState === 'disconnected' || connectionState === 'failed') {
        updateState('disconnected');
        cleanup();
      }
    };

    return pc;
  };

  // Obtenir le stream audio local
  const getLocalStream = async (): Promise<MediaStream> => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
        },
        video: false,
      });
      return stream;
    } catch (error) {
      console.error('Erreur accès microphone:', error);
      throw new Error('Impossible d\'accéder au microphone');
    }
  };

  // Nettoyer les ressources
  const cleanup = () => {
    if (localStreamRef.current) {
      localStreamRef.current.getTracks().forEach(track => track.stop());
      localStreamRef.current = null;
    }
    if (peerConnectionRef.current) {
      peerConnectionRef.current.close();
      peerConnectionRef.current = null;
    }
    if (wsRef.current) {
      wsRef.current.close();
      wsRef.current = null;
    }
    if (localAudioRef.current) {
      localAudioRef.current.srcObject = null;
    }
    if (remoteAudioRef.current) {
      remoteAudioRef.current.srcObject = null;
    }
    updateState('idle');
  };

  // Initialiser l'appel (appelant)
  const initiateCall = async () => {
    if (!callId) return;

    try {
      updateState('connecting');
      isInitiatorRef.current = true;

      // Obtenir le stream local
      const stream = await getLocalStream();
      localStreamRef.current = stream;
      
      if (localAudioRef.current) {
        localAudioRef.current.srcObject = stream;
      }

      // Créer la connexion peer
      const pc = createPeerConnection();
      peerConnectionRef.current = pc;

      // Ajouter les tracks locaux
      stream.getTracks().forEach(track => {
        pc.addTrack(track, stream);
      });

      // Créer l'offre
      const offer = await pc.createOffer();
      await pc.setLocalDescription(offer);

      // Envoyer l'offre via WebSocket
      const ws = new WebSocket(`${process.env.NEXT_PUBLIC_WS_URL || 'ws://localhost:3001'}/atc-telephone`);
      wsRef.current = ws;

      ws.onopen = () => {
        ws.send(JSON.stringify({
          type: 'offer',
          offer: offer,
          callId,
          userId,
        }));
      };

      ws.onmessage = async (event) => {
        const message = JSON.parse(event.data);
        
        if (message.type === 'answer' && message.callId === callId) {
          await pc.setRemoteDescription(new RTCSessionDescription(message.answer));
        } else if (message.type === 'ice-candidate' && message.callId === callId) {
          await pc.addIceCandidate(new RTCIceCandidate(message.candidate));
        }
      };

    } catch (error) {
      console.error('Erreur initiation appel:', error);
      cleanup();
      throw error;
    }
  };

  // Répondre à un appel (récepteur)
  const answerCall = async () => {
    if (!callId) return;

    try {
      updateState('connecting');
      isInitiatorRef.current = false;

      // Obtenir le stream local
      const stream = await getLocalStream();
      localStreamRef.current = stream;
      
      if (localAudioRef.current) {
        localAudioRef.current.srcObject = stream;
      }

      // Créer la connexion peer
      const pc = createPeerConnection();
      peerConnectionRef.current = pc;

      // Ajouter les tracks locaux
      stream.getTracks().forEach(track => {
        pc.addTrack(track, stream);
      });

      // Se connecter au WebSocket pour recevoir l'offre
      const ws = new WebSocket(`${process.env.NEXT_PUBLIC_WS_URL || 'ws://localhost:3001'}/atc-telephone`);
      wsRef.current = ws;

      ws.onopen = () => {
        ws.send(JSON.stringify({
          type: 'ready',
          callId,
          userId,
        }));
      };

      ws.onmessage = async (event) => {
        const message = JSON.parse(event.data);
        
        if (message.type === 'offer' && message.callId === callId) {
          await pc.setRemoteDescription(new RTCSessionDescription(message.offer));
          
          // Créer la réponse
          const answer = await pc.createAnswer();
          await pc.setLocalDescription(answer);

          // Envoyer la réponse
          ws.send(JSON.stringify({
            type: 'answer',
            answer: answer,
            callId,
            userId,
          }));
        } else if (message.type === 'ice-candidate' && message.callId === callId) {
          await pc.addIceCandidate(new RTCIceCandidate(message.candidate));
        }
      };

    } catch (error) {
      console.error('Erreur réponse appel:', error);
      cleanup();
      throw error;
    }
  };

  // Muter/démuter
  const toggleMute = () => {
    if (localStreamRef.current) {
      localStreamRef.current.getAudioTracks().forEach(track => {
        track.enabled = isMuted;
      });
      setIsMuted(!isMuted);
    }
  };

  // Terminer l'appel
  const endCall = () => {
    cleanup();
  };

  // Nettoyer à la déconnexion
  useEffect(() => {
    return () => {
      cleanup();
    };
  }, []);

  return {
    state,
    isMuted,
    initiateCall,
    answerCall,
    toggleMute,
    endCall,
    localAudioRef,
    remoteAudioRef,
  };
}
