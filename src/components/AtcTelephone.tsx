'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { Phone, PhoneOff, PhoneCall, Mic, MicOff, X, Volume2, VolumeX, RotateCcw } from 'lucide-react';
import { useAtcTheme } from '@/contexts/AtcThemeContext';
import { createClient } from '@/lib/supabase/client';
import { RTC_CONFIG, WEBRTC_TIMEOUTS } from '@/lib/webrtc';

type CallState = 'idle' | 'dialing' | 'ringing' | 'incoming' | 'connecting' | 'connected';

interface AtcTelephoneProps {
  aeroport: string;
  position: string;
  userId: string;
}

const POSITION_CODES: Record<string, string> = {
  'Delivery': '15', 'Clairance': '16', 'Ground': '17', 'Tower': '18',
  'DEP': '191', 'APP': '192', 'Center': '20', 'AFIS': '505',
};

const CODE_TO_POSITION: Record<string, string> = Object.fromEntries(
  Object.entries(POSITION_CODES).map(([pos, code]) => [code, pos])
);

const AEROPORT_CODES: Record<string, string> = {
  'ITKO': '5566', 'IPPH': '5567', 'ILAR': '5568', 'IPAP': '5569',
  'IRFD': '5570', 'IMLR': '5571', 'IZOL': '5572', 'ISAU': '5573',
  'IJAF': '5574', 'IBLT': '5575', 'IDCS': '5576', 'IGRV': '5577',
  'IBTH': '5578', 'ISKP': '5579', 'ILKL': '5580', 'IBAR': '5581',
  'IHEN': '5582', 'ITRC': '5583', 'IBRD': '5584', 'IUFO': '5585',
  'IIAB': '5586', 'IGAR': '5587', 'ISCM': '5588',
};

const CODE_TO_AEROPORT: Record<string, string> = Object.fromEntries(
  Object.entries(AEROPORT_CODES).map(([code, num]) => [num, code])
);

export default function AtcTelephone({ aeroport, position, userId }: AtcTelephoneProps) {
  const { theme } = useAtcTheme();
  const isDark = theme === 'dark';
  const [isOpen, setIsOpen] = useState(false);
  const [number, setNumber] = useState('');
  const [callState, setCallState] = useState<CallState>('idle');
  const [incomingCall, setIncomingCall] = useState<{ from: string; fromPosition: string; callId: string } | null>(null);
  const [currentCall, setCurrentCall] = useState<{ to: string; toPosition: string; callId: string } | null>(null);
  const [isMuted, setIsMuted] = useState(false);
  const [callDuration, setCallDuration] = useState(0);
  const [audioLevel, setAudioLevel] = useState(0);
  const [connectionStatus, setConnectionStatus] = useState('');
  
  const localAudioRef = useRef<HTMLAudioElement | null>(null);
  const remoteAudioRef = useRef<HTMLAudioElement | null>(null);
  const peerConnectionRef = useRef<RTCPeerConnection | null>(null);
  const localStreamRef = useRef<MediaStream | null>(null);
  const checkIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const signalingChannelRef = useRef<ReturnType<ReturnType<typeof createClient>['channel']> | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const callTimerRef = useRef<NodeJS.Timeout | null>(null);
  const shouldPlaySoundRef = useRef(false);
  const iceCandidatesQueue = useRef<RTCIceCandidate[]>([]);
  const connectionTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  // Messages vocaux
  const playMessage = useCallback((message: string) => {
    if ('speechSynthesis' in window) {
      speechSynthesis.cancel();
      const utterance = new SpeechSynthesisUtterance(message);
      utterance.lang = 'fr-FR';
      utterance.rate = 0.9;
      utterance.volume = 0.8;
      speechSynthesis.speak(utterance);
    }
  }, []);

  // Sons
  const playSound = useCallback((type: 'ring' | 'dial' | 'end' | 'beep' | 'connected') => {
    if (!shouldPlaySoundRef.current && type !== 'beep' && type !== 'connected') return;
    try {
      const ctx = new (window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext)();
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      
      osc.connect(gain);
      gain.connect(ctx.destination);
      
      switch (type) {
        case 'ring':
          osc.frequency.value = 440;
          osc.type = 'sine';
          gain.gain.setValueAtTime(0, ctx.currentTime);
          gain.gain.linearRampToValueAtTime(0.25, ctx.currentTime + 0.05);
          gain.gain.linearRampToValueAtTime(0, ctx.currentTime + 0.25);
          osc.start();
          osc.stop(ctx.currentTime + 0.25);
          break;
        case 'dial':
          osc.frequency.value = 425;
          osc.type = 'sine';
          gain.gain.setValueAtTime(0.12, ctx.currentTime);
          osc.start();
          osc.stop(ctx.currentTime + 0.15);
          break;
        case 'end':
          osc.frequency.value = 480;
          osc.type = 'sine';
          gain.gain.setValueAtTime(0.15, ctx.currentTime);
          gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.4);
          osc.start();
          osc.stop(ctx.currentTime + 0.4);
          break;
        case 'beep':
          osc.frequency.value = 1000;
          osc.type = 'sine';
          gain.gain.setValueAtTime(0.08, ctx.currentTime);
          gain.gain.linearRampToValueAtTime(0, ctx.currentTime + 0.04);
          osc.start();
          osc.stop(ctx.currentTime + 0.04);
          break;
        case 'connected':
          osc.frequency.value = 880;
          osc.type = 'sine';
          gain.gain.setValueAtTime(0.15, ctx.currentTime);
          gain.gain.linearRampToValueAtTime(0, ctx.currentTime + 0.2);
          osc.start();
          osc.stop(ctx.currentTime + 0.2);
          break;
      }
      setTimeout(() => ctx.close(), 500);
    } catch (e) {
      console.error('Audio error:', e);
    }
  }, []);

  // Gestion sonnerie
  useEffect(() => {
    let interval: NodeJS.Timeout | null = null;
    
    if (callState === 'incoming') {
      shouldPlaySoundRef.current = true;
      playSound('ring');
      interval = setInterval(() => {
        if (shouldPlaySoundRef.current) playSound('ring');
      }, 600);
    } else if (callState === 'ringing') {
      shouldPlaySoundRef.current = true;
      playSound('dial');
      interval = setInterval(() => {
        if (shouldPlaySoundRef.current) playSound('dial');
      }, 2000);
    } else {
      shouldPlaySoundRef.current = false;
    }
    
    return () => {
      shouldPlaySoundRef.current = false;
      if (interval) clearInterval(interval);
    };
  }, [callState, playSound]);

  // Timer d'appel
  useEffect(() => {
    if (callState === 'connected') {
      setCallDuration(0);
      callTimerRef.current = setInterval(() => {
        setCallDuration(d => d + 1);
      }, 1000);
    } else {
      if (callTimerRef.current) {
        clearInterval(callTimerRef.current);
        callTimerRef.current = null;
      }
      setCallDuration(0);
    }
    return () => {
      if (callTimerRef.current) clearInterval(callTimerRef.current);
    };
  }, [callState]);

  // Vérification appels entrants
  useEffect(() => {
    if (callState === 'idle') {
      checkIntervalRef.current = setInterval(async () => {
        try {
          const res = await fetch('/api/atc/telephone/incoming');
          const data = await res.json();
          if (data.call?.id) {
            setIncomingCall({
              from: data.call.from_aeroport,
              fromPosition: data.call.from_position,
              callId: data.call.id,
            });
            setCallState('incoming');
            setIsOpen(true);
          }
        } catch (err) {
          console.error('Check calls error:', err);
        }
      }, 1500);
    } else if (callState === 'incoming' && incomingCall) {
      checkIntervalRef.current = setInterval(async () => {
        try {
          const res = await fetch(`/api/atc/telephone/status?callId=${incomingCall.callId}`);
          const data = await res.json();
          if (!data.call || data.status === 'ended' || data.status === 'rejected') {
            setIncomingCall(null);
            setCallState('idle');
          }
        } catch (err) {
          console.error('Status check error:', err);
        }
      }, 1500);
    }
    return () => {
      if (checkIntervalRef.current) {
        clearInterval(checkIntervalRef.current);
        checkIntervalRef.current = null;
      }
    };
  }, [callState, incomingCall]);

  const cleanupWebRTC = useCallback(() => {
    console.log('[WebRTC] Cleanup');
    if (connectionTimeoutRef.current) {
      clearTimeout(connectionTimeoutRef.current);
      connectionTimeoutRef.current = null;
    }
    if (localStreamRef.current) {
      localStreamRef.current.getTracks().forEach(track => track.stop());
      localStreamRef.current = null;
    }
    if (peerConnectionRef.current) {
      peerConnectionRef.current.close();
      peerConnectionRef.current = null;
    }
    if (localAudioRef.current) localAudioRef.current.srcObject = null;
    if (remoteAudioRef.current) remoteAudioRef.current.srcObject = null;
    if (signalingChannelRef.current) {
      signalingChannelRef.current.unsubscribe();
      signalingChannelRef.current = null;
    }
    if (audioContextRef.current) {
      audioContextRef.current.close().catch(() => {});
      audioContextRef.current = null;
    }
    iceCandidatesQueue.current = [];
    setAudioLevel(0);
    setConnectionStatus('');
  }, []);

  const setupWebRTC = useCallback(async (callId: string, isInitiator: boolean) => {
    console.log(`[WebRTC] Setup - callId: ${callId}, isInitiator: ${isInitiator}`);
    setConnectionStatus('Connexion...');
    
    try {
      // Obtenir le flux audio
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: { 
          echoCancellation: true, 
          noiseSuppression: true, 
          autoGainControl: true,
          sampleRate: 48000,
        },
        video: false,
      });
      localStreamRef.current = stream;
      console.log('[WebRTC] Got local stream');
      
      if (localAudioRef.current) {
        localAudioRef.current.srcObject = stream;
        localAudioRef.current.volume = 0;
      }

      // Créer la connexion peer
      const pc = new RTCPeerConnection(RTC_CONFIG);
      peerConnectionRef.current = pc;
      console.log('[WebRTC] PeerConnection created');

      // Ajouter les tracks audio
      stream.getTracks().forEach(track => {
        pc.addTrack(track, stream);
        console.log('[WebRTC] Track added:', track.kind);
      });

      // Gérer la réception de l'audio distant
      pc.ontrack = (event) => {
        console.log('[WebRTC] Remote track received:', event.streams.length);
        if (event.streams?.[0] && remoteAudioRef.current) {
          remoteAudioRef.current.srcObject = event.streams[0];
          remoteAudioRef.current.volume = 1.0;
          remoteAudioRef.current.play().catch(e => console.error('[WebRTC] Play error:', e));
          
          // Analyse audio
          try {
            audioContextRef.current = new AudioContext();
            const source = audioContextRef.current.createMediaStreamSource(event.streams[0]);
            analyserRef.current = audioContextRef.current.createAnalyser();
            analyserRef.current.fftSize = 256;
            source.connect(analyserRef.current);
            
            const updateLevel = () => {
              if (!analyserRef.current || callState !== 'connected') return;
              const data = new Uint8Array(analyserRef.current.frequencyBinCount);
              analyserRef.current.getByteFrequencyData(data);
              const avg = data.reduce((a, b) => a + b, 0) / data.length;
              setAudioLevel(avg / 255);
              requestAnimationFrame(updateLevel);
            };
            updateLevel();
          } catch (e) {
            console.error('[WebRTC] Audio analyser error:', e);
          }
        }
      };

      // État de la connexion ICE
      pc.oniceconnectionstatechange = () => {
        console.log('[WebRTC] ICE state:', pc.iceConnectionState);
        setConnectionStatus(`ICE: ${pc.iceConnectionState}`);
        
        if (pc.iceConnectionState === 'connected' || pc.iceConnectionState === 'completed') {
          console.log('[WebRTC] ICE Connected!');
          setCallState('connected');
          setConnectionStatus('Connecté');
          playSound('connected');
          playMessage('Communications établie');
          if (connectionTimeoutRef.current) {
            clearTimeout(connectionTimeoutRef.current);
            connectionTimeoutRef.current = null;
          }
        } else if (pc.iceConnectionState === 'failed') {
          console.error('[WebRTC] ICE Failed - attempting restart');
          setConnectionStatus('Reconnexion...');
          pc.restartIce();
        } else if (pc.iceConnectionState === 'disconnected') {
          setConnectionStatus('Déconnecté...');
        }
      };

      // État de la connexion
      pc.onconnectionstatechange = () => {
        console.log('[WebRTC] Connection state:', pc.connectionState);
        if (pc.connectionState === 'connected') {
          setCallState('connected');
          setConnectionStatus('Connecté');
        } else if (pc.connectionState === 'failed' || pc.connectionState === 'closed') {
          cleanupWebRTC();
          setCallState('idle');
          setNumber('');
          setIncomingCall(null);
          setCurrentCall(null);
          setIsMuted(false);
          playSound('end');
          playMessage('Appel terminé');
        }
      };

      // Signalisation via Supabase
      const supabase = createClient();
      const channel = supabase.channel(`call-${callId}`, {
        config: { broadcast: { self: false } }
      });
      
      signalingChannelRef.current = channel;

      // Gestionnaire de signaux
      channel.on('broadcast', { event: 'signal' }, async ({ payload }) => {
        if (!payload || payload.from === userId) return;
        console.log('[WebRTC] Signal received:', payload.type);
        
        try {
          if (payload.type === 'offer' && !isInitiator) {
            console.log('[WebRTC] Processing offer');
            await pc.setRemoteDescription(new RTCSessionDescription(payload.data));
            
            // Ajouter les candidats ICE en attente
            for (const candidate of iceCandidatesQueue.current) {
              await pc.addIceCandidate(candidate);
            }
            iceCandidatesQueue.current = [];
            
            const answer = await pc.createAnswer();
            await pc.setLocalDescription(answer);
            console.log('[WebRTC] Sending answer');
            await channel.send({
              type: 'broadcast',
              event: 'signal',
              payload: { type: 'answer', data: answer, from: userId },
            });
          } else if (payload.type === 'answer' && isInitiator) {
            console.log('[WebRTC] Processing answer');
            await pc.setRemoteDescription(new RTCSessionDescription(payload.data));
          } else if (payload.type === 'ice') {
            console.log('[WebRTC] Processing ICE candidate');
            if (pc.remoteDescription) {
              await pc.addIceCandidate(new RTCIceCandidate(payload.data));
            } else {
              iceCandidatesQueue.current.push(new RTCIceCandidate(payload.data));
            }
          }
        } catch (err) {
          console.error('[WebRTC] Signal processing error:', err);
        }
      });

      // Envoyer les candidats ICE
      pc.onicecandidate = async (event) => {
        if (event.candidate) {
          console.log('[WebRTC] New ICE candidate');
          await channel.send({
            type: 'broadcast',
            event: 'signal',
            payload: { type: 'ice', data: event.candidate, from: userId },
          });
        }
      };

      // S'abonner au channel
      await channel.subscribe(async (status) => {
        console.log('[WebRTC] Channel status:', status);
        
        if (status === 'SUBSCRIBED' && isInitiator) {
          // Timeout de connexion
          connectionTimeoutRef.current = setTimeout(() => {
            if (pc.connectionState !== 'connected' && pc.iceConnectionState !== 'connected' && pc.iceConnectionState !== 'completed') {
              console.error('[WebRTC] Connection timeout');
              setConnectionStatus('Timeout');
              cleanupWebRTC();
              setCallState('idle');
              setNumber('');
              setCurrentCall(null);
              playSound('end');
              playMessage('Impossible d\'établir la communication');
            }
          }, WEBRTC_TIMEOUTS.CONNECTION_TIMEOUT);

          // Fonction pour envoyer l'offer
          const sendOffer = async (attempt: number) => {
            if (pc.connectionState === 'connected' || pc.iceConnectionState === 'connected') {
              return;
            }
            console.log(`[WebRTC] Sending offer (attempt ${attempt + 1})`);
            setConnectionStatus(`Tentative ${attempt + 1}...`);
            
            try {
              const offer = await pc.createOffer({
                offerToReceiveAudio: true,
                offerToReceiveVideo: false,
              });
              await pc.setLocalDescription(offer);
              await channel.send({
                type: 'broadcast',
                event: 'signal',
                payload: { type: 'offer', data: offer, from: userId },
              });
            } catch (e) {
              console.error('[WebRTC] Offer error:', e);
            }
          };

          // Envoyer l'offer avec retries
          await new Promise(resolve => setTimeout(resolve, WEBRTC_TIMEOUTS.OFFER_DELAY));
          await sendOffer(0);
          
          WEBRTC_TIMEOUTS.RETRY_DELAYS.forEach((delay, index) => {
            setTimeout(() => {
              if (pc.connectionState !== 'connected' && pc.iceConnectionState !== 'connected') {
                sendOffer(index + 1);
              }
            }, delay);
          });
        }
      });

      return pc;
    } catch (error) {
      console.error('[WebRTC] Setup error:', error);
      setConnectionStatus('Erreur');
      cleanupWebRTC();
      throw error;
    }
  }, [userId, callState, cleanupWebRTC, playSound]);

  const parseNumber = (num: string) => {
    if (num === '911' || num === '112') {
      return { aeroport: null, position: 'AFIS', isLocal: false, isEmergency: true };
    }
    if (num.startsWith('*')) {
      const code = num.substring(1);
      const pos = CODE_TO_POSITION[code];
      return { aeroport: null, position: pos || null, isLocal: true, isEmergency: false };
    }
    if (num.startsWith('+14') && num.length >= 9) {
      const aeroportCode = num.substring(3, 7);
      const positionCode = num.substring(7);
      return {
        aeroport: CODE_TO_AEROPORT[aeroportCode] || null,
        position: CODE_TO_POSITION[positionCode] || null,
        isLocal: false,
        isEmergency: false,
      };
    }
    return { aeroport: null, position: null, isLocal: false, isEmergency: false };
  };

  const handleNumberInput = (digit: string) => {
    if (callState === 'idle' || callState === 'dialing') {
      playSound('beep');
      setNumber(prev => prev + digit);
      if (callState === 'idle') setCallState('dialing');
    }
  };

  const handleDelete = () => {
    setNumber(prev => {
      const newNumber = prev.slice(0, -1);
      if (newNumber.length === 0) setCallState('idle');
      return newNumber;
    });
  };

  const handleCall = async () => {
    if (!number || callState !== 'dialing') return;
    
    const parsed = parseNumber(number);
    if (!parsed.position) return;

    setCallState('ringing');
    
    try {
      const res = await fetch('/api/atc/telephone/call', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          to_aeroport: parsed.aeroport || aeroport,
          to_position: parsed.position,
          number: number,
          is_emergency: parsed.isEmergency,
        }),
      });

      const data = await res.json();
      
      if (!res.ok) {
        if (data.error === 'appel_en_cours') {
          await fetch('/api/atc/telephone/hangup', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ reset: true }),
          }).catch(console.error);
          playMessage('Appel précédent réinitialisé, réessayez');
        } else if (data.error === 'offline') {
          playMessage('Votre correspondant est hors ligne');
        } else if (data.error === 'no_afis') {
          playMessage('Aucun agent AFIS disponible');
        } else if (data.error === 'rejected') {
          playMessage('Appel refusé');
        } else if (data.error === 'cible_occupee') {
          playMessage('Votre correspondant est déjà en ligne');
        } else {
          playMessage('Erreur lors de l\'appel');
        }
        playSound('end');
        setCallState('idle');
        setNumber('');
        return;
      }

      if (data.call) {
        setCurrentCall({ to: parsed.aeroport || aeroport, toPosition: parsed.position, callId: data.call.id });
        
        // Attendre que l'autre réponde (polling)
        for (let i = 0; i < 60; i++) {
          await new Promise(resolve => setTimeout(resolve, 500));
          const statusRes = await fetch(`/api/atc/telephone/status?callId=${data.call.id}`);
          const statusData = await statusRes.json();
          
          if (statusData.status === 'connected') {
            setCallState('connecting');
            await setupWebRTC(data.call.id, true);
            return;
          }
          if (statusData.status === 'rejected' || statusData.status === 'ended') break;
        }
        
        // Timeout - pas de réponse
        await fetch('/api/atc/telephone/hangup', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ callId: data.call.id }),
        }).catch(console.error);
        
        playSound('end');
        playMessage('Votre correspondant ne répond pas');
        setCallState('idle');
        setNumber('');
        setCurrentCall(null);
      }
    } catch (err) {
      console.error('Call error:', err);
      playMessage('Erreur lors de l\'appel');
      setCallState('idle');
      setNumber('');
    }
  };

  const handleAnswer = async () => {
    if (!incomingCall) return;
    setCallState('connecting');
    setConnectionStatus('Connexion...');
    
    try {
      const res = await fetch('/api/atc/telephone/answer', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ callId: incomingCall.callId }),
      });
      if (res.ok) {
        await setupWebRTC(incomingCall.callId, false);
        setCurrentCall({ to: incomingCall.from, toPosition: incomingCall.fromPosition, callId: incomingCall.callId });
        setIncomingCall(null);
      } else {
        setCallState('idle');
        setIncomingCall(null);
      }
    } catch (err) {
      console.error('Answer error:', err);
      setCallState('idle');
      setIncomingCall(null);
    }
  };

  const handleReject = async () => {
    if (!incomingCall) return;
    try {
      await fetch('/api/atc/telephone/reject', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ callId: incomingCall.callId }),
      });
    } catch (err) {
      console.error('Reject error:', err);
    }
    setIncomingCall(null);
    setCallState('idle');
  };

  const handleHangup = async () => {
    const callId = currentCall?.callId || incomingCall?.callId;
    const wasConnected = callState === 'connected';
    cleanupWebRTC();
    if (callId) {
      await fetch('/api/atc/telephone/hangup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ callId }),
      }).catch(console.error);
    }
    playSound('end');
    if (wasConnected) {
      playMessage('Appel terminé');
    }
    setCallState('idle');
    setNumber('');
    setIncomingCall(null);
    setCurrentCall(null);
    setIsMuted(false);
  };

  const toggleMute = () => {
    if (localStreamRef.current) {
      localStreamRef.current.getAudioTracks().forEach(track => {
        track.enabled = isMuted;
      });
      setIsMuted(!isMuted);
    }
  };

  const resetPhone = async () => {
    try {
      await fetch('/api/atc/telephone/hangup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reset: true }),
      });
      cleanupWebRTC();
      setCallState('idle');
      setNumber('');
      setIncomingCall(null);
      setCurrentCall(null);
      setIsMuted(false);
    } catch (err) {
      console.error('Reset error:', err);
    }
  };

  useEffect(() => () => cleanupWebRTC(), [cleanupWebRTC]);

  const formatDuration = (seconds: number) => {
    const m = Math.floor(seconds / 60);
    const s = seconds % 60;
    return `${m}:${s.toString().padStart(2, '0')}`;
  };

  // Styles
  const bgMain = isDark ? 'bg-gradient-to-b from-slate-100 to-slate-200' : 'bg-gradient-to-b from-slate-800 to-slate-900';
  const textMain = isDark ? 'text-slate-800' : 'text-slate-100';
  const screenBg = isDark ? 'bg-slate-800' : 'bg-slate-950';
  const keyBg = isDark ? 'bg-white hover:bg-slate-50 shadow-md' : 'bg-slate-700 hover:bg-slate-600 shadow-lg';
  const keyText = isDark ? 'text-slate-700' : 'text-white';

  // Badge fermé
  if (!isOpen) {
    return (
      <button
        onClick={() => setIsOpen(true)}
        className={`fixed bottom-4 right-4 z-50 ${bgMain} ${textMain} rounded-2xl shadow-xl px-4 py-3 flex items-center gap-3 transition-all duration-300 hover:scale-105 hover:shadow-2xl group`}
      >
        <div className={`p-2 rounded-xl ${isDark ? 'bg-sky-100' : 'bg-sky-500/20'}`}>
          <Phone className={`h-5 w-5 ${isDark ? 'text-sky-600' : 'text-sky-400'}`} />
        </div>
        <span className="font-medium">Téléphone</span>
        {callState === 'incoming' && (
          <span className="absolute -top-1 -right-1 w-4 h-4 bg-green-500 rounded-full animate-ping" />
        )}
      </button>
    );
  }

  return (
    <div className={`fixed right-4 bottom-4 z-50 ${bgMain} rounded-3xl shadow-2xl overflow-hidden transition-all duration-500`}
         style={{ width: '240px' }}>
      
      {/* Header */}
      <div className={`px-4 py-3 flex items-center justify-between border-b ${isDark ? 'border-slate-300' : 'border-slate-700'}`}>
        <div className="flex items-center gap-2">
          <Phone className={`h-4 w-4 ${isDark ? 'text-sky-600' : 'text-sky-400'}`} />
          <span className={`text-sm font-semibold ${textMain}`}>Téléphone ATC</span>
        </div>
        <div className="flex items-center gap-1">
          <button
            onClick={resetPhone}
            className={`p-1.5 rounded-lg ${isDark ? 'hover:bg-slate-300' : 'hover:bg-slate-700'} transition-colors`}
            title="Réinitialiser"
          >
            <RotateCcw className={`h-3.5 w-3.5 ${isDark ? 'text-slate-500' : 'text-slate-400'}`} />
          </button>
          <button
            onClick={() => { setIsOpen(false); if (callState === 'idle') setNumber(''); }}
            className={`p-1.5 rounded-lg ${isDark ? 'hover:bg-slate-300' : 'hover:bg-slate-700'} transition-colors`}
          >
            <X className={`h-3.5 w-3.5 ${isDark ? 'text-slate-500' : 'text-slate-400'}`} />
          </button>
        </div>
      </div>
      
      {/* Écran */}
      <div className={`mx-3 mt-3 p-3 ${screenBg} rounded-xl`}>
        <div className="flex items-center justify-between mb-1">
          <span className="text-[10px] text-slate-500 uppercase tracking-wider">
            {callState === 'incoming' ? 'Appel entrant' : 
             callState === 'ringing' ? 'Appel...' : 
             callState === 'connecting' ? 'Connexion...' :
             callState === 'connected' ? 'En ligne' : 'Composer'}
          </span>
          {callState === 'connected' && (
            <div className="flex items-center gap-1">
              {audioLevel > 0.1 ? (
                <Volume2 className="h-3 w-3 text-emerald-400" style={{ opacity: 0.5 + audioLevel * 0.5 }} />
              ) : (
                <VolumeX className="h-3 w-3 text-slate-500" />
              )}
              <span className="text-[10px] text-emerald-400 font-mono">{formatDuration(callDuration)}</span>
            </div>
          )}
        </div>
        
        <div className="text-center min-h-[32px] flex items-center justify-center">
          {callState === 'incoming' && incomingCall ? (
            <div className="animate-pulse">
              <p className="text-lg font-bold text-emerald-400">{incomingCall.from}</p>
              <p className="text-xs text-slate-400">{incomingCall.fromPosition}</p>
            </div>
          ) : callState === 'connected' && currentCall ? (
            <div>
              <p className="text-lg font-bold text-emerald-400">{currentCall.to}</p>
              <p className="text-xs text-slate-400">{currentCall.toPosition}</p>
            </div>
          ) : (callState === 'ringing' || callState === 'connecting') && currentCall ? (
            <div className="animate-pulse">
              <p className="text-lg font-bold text-sky-400">{currentCall.to}</p>
              <p className="text-xs text-slate-400">{currentCall.toPosition}</p>
            </div>
          ) : (
            <p className={`text-2xl font-mono tracking-wider ${number ? 'text-emerald-400' : 'text-slate-600'}`}>
              {number || '—'}
            </p>
          )}
        </div>
        
        {/* Status de connexion */}
        {connectionStatus && (callState === 'connecting' || callState === 'ringing') && (
          <p className="text-[10px] text-center text-amber-400 mt-1">{connectionStatus}</p>
        )}
        
        {/* Barre audio */}
        {callState === 'connected' && (
          <div className="mt-2 h-1 bg-slate-700 rounded-full overflow-hidden">
            <div 
              className="h-full bg-gradient-to-r from-emerald-500 to-emerald-400 transition-all duration-75"
              style={{ width: `${audioLevel * 100}%` }}
            />
          </div>
        )}
      </div>

      {/* Clavier */}
      <div className="p-3 space-y-1.5">
        {[['1', '2', '3'], ['4', '5', '6'], ['7', '8', '9'], ['*', '0', '+']].map((row, i) => (
          <div key={i} className="grid grid-cols-3 gap-1.5">
            {row.map(d => (
              <button
                key={d}
                onClick={() => handleNumberInput(d)}
                disabled={callState === 'connected' || callState === 'ringing' || callState === 'incoming' || callState === 'connecting'}
                className={`h-11 ${keyBg} ${keyText} rounded-xl font-semibold text-lg transition-all active:scale-95 disabled:opacity-40`}
              >
                {d}
              </button>
            ))}
          </div>
        ))}

        {/* Actions */}
        <div className="grid grid-cols-3 gap-1.5 pt-1">
          <button
            onClick={handleDelete}
            disabled={!number || callState !== 'dialing'}
            className="h-11 bg-amber-500 hover:bg-amber-400 text-white rounded-xl flex items-center justify-center disabled:opacity-40 transition-all active:scale-95"
          >
            <X className="h-5 w-5" />
          </button>
          
          {callState === 'incoming' ? (
            <button
              onClick={handleAnswer}
              className="h-11 bg-emerald-500 hover:bg-emerald-400 text-white rounded-xl flex items-center justify-center transition-all active:scale-95 animate-pulse shadow-lg shadow-emerald-500/30"
            >
              <Phone className="h-5 w-5" />
            </button>
          ) : callState === 'connected' ? (
            <button
              onClick={toggleMute}
              className={`h-11 ${isMuted ? 'bg-red-500 hover:bg-red-400' : 'bg-sky-500 hover:bg-sky-400'} text-white rounded-xl flex items-center justify-center transition-all active:scale-95`}
            >
              {isMuted ? <MicOff className="h-5 w-5" /> : <Mic className="h-5 w-5" />}
            </button>
          ) : (
            <button
              onClick={handleCall}
              disabled={!number || callState === 'ringing' || callState === 'connecting'}
              className="h-11 bg-emerald-500 hover:bg-emerald-400 text-white rounded-xl flex items-center justify-center disabled:opacity-40 transition-all active:scale-95"
            >
              <PhoneCall className="h-5 w-5" />
            </button>
          )}
          
          {callState === 'incoming' ? (
            <button
              onClick={handleReject}
              className="h-11 bg-red-500 hover:bg-red-400 text-white rounded-xl flex items-center justify-center transition-all active:scale-95"
            >
              <PhoneOff className="h-5 w-5" />
            </button>
          ) : callState === 'connected' || callState === 'ringing' || callState === 'connecting' ? (
            <button
              onClick={handleHangup}
              className="h-11 bg-red-500 hover:bg-red-400 text-white rounded-xl flex items-center justify-center transition-all active:scale-95"
            >
              <PhoneOff className="h-5 w-5" />
            </button>
          ) : (
            <button
              onClick={() => { setIsOpen(false); setNumber(''); setCallState('idle'); }}
              className={`h-11 ${isDark ? 'bg-slate-400 hover:bg-slate-300' : 'bg-slate-600 hover:bg-slate-500'} text-white rounded-xl flex items-center justify-center transition-all active:scale-95`}
            >
              <PhoneOff className="h-5 w-5" />
            </button>
          )}
        </div>
      </div>

      {/* Audio */}
      <audio ref={localAudioRef} autoPlay muted playsInline />
      <audio ref={remoteAudioRef} autoPlay playsInline />
    </div>
  );
}
