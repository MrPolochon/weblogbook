'use client';

import { useState, useEffect, useRef } from 'react';
import { Phone, PhoneOff, PhoneCall, Mic, MicOff, Delete, Flame } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';

type CallState = 'idle' | 'dialing' | 'ringing' | 'incoming' | 'connected' | 'ended';

interface SiaviTelephoneProps {
  aeroport: string;
  estAfis: boolean;
  userId: string;
}

// Mapping des positions vers les codes (AFIS = 505)
const POSITION_CODES: Record<string, string> = {
  'Delivery': '15',
  'Clairance': '16',
  'Ground': '17',
  'Tower': '18',
  'DEP': '191',
  'APP': '192',
  'Center': '20',
  'AFIS': '505', // Code AFIS
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

export default function SiaviTelephone({ aeroport, estAfis, userId }: SiaviTelephoneProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [number, setNumber] = useState('');
  const [callState, setCallState] = useState<CallState>('idle');
  const [incomingCall, setIncomingCall] = useState<{ from: string; fromPosition: string; callId: string; isEmergency?: boolean } | null>(null);
  const [currentCall, setCurrentCall] = useState<{ to: string; toPosition: string; callId: string } | null>(null);
  const [isMuted, setIsMuted] = useState(false);
  
  const localAudioRef = useRef<HTMLAudioElement | null>(null);
  const remoteAudioRef = useRef<HTMLAudioElement | null>(null);
  const peerConnectionRef = useRef<RTCPeerConnection | null>(null);
  const localStreamRef = useRef<MediaStream | null>(null);
  const checkIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const signalingChannelRef = useRef<ReturnType<ReturnType<typeof createClient>['channel']> | null>(null);
  const ringtoneIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const ringtoneAudioContextRef = useRef<AudioContext | null>(null);
  const shouldRingRef = useRef(false);
  const callStatusIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const dialToneIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const dialToneAudioContextRef = useRef<AudioContext | null>(null);
  const shouldDialToneRef = useRef(false);
  const emergencyAlarmRef = useRef<{ osc1: OscillatorNode; osc2: OscillatorNode; gain: GainNode; ctx: AudioContext } | null>(null);
  const [showEmergencyOverlay, setShowEmergencyOverlay] = useState(false);

  // Alarme de caserne de pompier (sirène montante/descendante forte)
  const playFireAlarm = () => {
    try {
      if (emergencyAlarmRef.current) return; // Déjà en cours
      
      const ctx = new (window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext)();
      const osc1 = ctx.createOscillator();
      const osc2 = ctx.createOscillator();
      const gain = ctx.createGain();
      
      // Sirène de pompier - deux fréquences alternantes
      osc1.type = 'sawtooth';
      osc2.type = 'square';
      
      // Volume très bas (0.05)
      gain.gain.setValueAtTime(0.05, ctx.currentTime);
      
      osc1.connect(gain);
      osc2.connect(gain);
      gain.connect(ctx.destination);
      
      // Effet sirène montante/descendante
      const duration = 1.5;
      osc1.frequency.setValueAtTime(600, ctx.currentTime);
      osc1.frequency.linearRampToValueAtTime(900, ctx.currentTime + duration / 2);
      osc1.frequency.linearRampToValueAtTime(600, ctx.currentTime + duration);
      
      osc2.frequency.setValueAtTime(650, ctx.currentTime);
      osc2.frequency.linearRampToValueAtTime(950, ctx.currentTime + duration / 2);
      osc2.frequency.linearRampToValueAtTime(650, ctx.currentTime + duration);
      
      osc1.start();
      osc2.start();
      
      emergencyAlarmRef.current = { osc1, osc2, gain, ctx };
      
      // Répéter la sirène
      const repeatSiren = () => {
        if (!emergencyAlarmRef.current || !shouldRingRef.current) return;
        const t = emergencyAlarmRef.current.ctx.currentTime;
        emergencyAlarmRef.current.osc1.frequency.setValueAtTime(600, t);
        emergencyAlarmRef.current.osc1.frequency.linearRampToValueAtTime(900, t + duration / 2);
        emergencyAlarmRef.current.osc1.frequency.linearRampToValueAtTime(600, t + duration);
        emergencyAlarmRef.current.osc2.frequency.setValueAtTime(650, t);
        emergencyAlarmRef.current.osc2.frequency.linearRampToValueAtTime(950, t + duration / 2);
        emergencyAlarmRef.current.osc2.frequency.linearRampToValueAtTime(650, t + duration);
      };
      
      ringtoneIntervalRef.current = setInterval(repeatSiren, duration * 1000);
      
    } catch (err) {
      console.error('Erreur alarme:', err);
    }
  };

  const stopFireAlarm = () => {
    if (emergencyAlarmRef.current) {
      try {
        emergencyAlarmRef.current.osc1.stop();
        emergencyAlarmRef.current.osc2.stop();
        emergencyAlarmRef.current.ctx.close();
      } catch (e) { /* ignore */ }
      emergencyAlarmRef.current = null;
    }
    if (ringtoneIntervalRef.current) {
      clearInterval(ringtoneIntervalRef.current);
      ringtoneIntervalRef.current = null;
    }
    setShowEmergencyOverlay(false);
  };

  // Sonnerie téléphone normale (appels 505)
  const playRingtone = () => {
    try {
      if (!ringtoneAudioContextRef.current) {
        ringtoneAudioContextRef.current = new (window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext)();
      }
      const ctx = ringtoneAudioContextRef.current;
      const osc1 = ctx.createOscillator();
      const osc2 = ctx.createOscillator();
      const gain = ctx.createGain();
      
      osc1.frequency.value = 440;
      osc2.frequency.value = 480;
      osc1.type = 'sine';
      osc2.type = 'sine';
      
      gain.gain.setValueAtTime(0, ctx.currentTime);
      gain.gain.linearRampToValueAtTime(0.3, ctx.currentTime + 0.05);
      gain.gain.linearRampToValueAtTime(0, ctx.currentTime + 0.4);
      
      osc1.connect(gain);
      osc2.connect(gain);
      gain.connect(ctx.destination);
      
      osc1.start();
      osc2.start();
      osc1.stop(ctx.currentTime + 0.4);
      osc2.stop(ctx.currentTime + 0.4);
    } catch (err) {
      console.error('Erreur sonnerie:', err);
    }
  };

  // Tonalité d'appel
  const playDialTone = () => {
    try {
      if (!dialToneAudioContextRef.current) {
        dialToneAudioContextRef.current = new (window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext)();
      }
      const ctx = dialToneAudioContextRef.current;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      
      osc.frequency.value = 425;
      osc.type = 'sine';
      gain.gain.setValueAtTime(0.2, ctx.currentTime);
      
      osc.connect(gain);
      gain.connect(ctx.destination);
      
      osc.start();
      osc.stop(ctx.currentTime + 0.4);
    } catch (err) {
      console.error('Erreur tonalité:', err);
    }
  };

  // Gestion tonalité d'appel
  useEffect(() => {
    if (callState === 'ringing') {
      shouldDialToneRef.current = true;
      playDialTone();
      dialToneIntervalRef.current = setInterval(() => {
        if (shouldDialToneRef.current) playDialTone();
      }, 3000);
    } else {
      shouldDialToneRef.current = false;
      if (dialToneIntervalRef.current) {
        clearInterval(dialToneIntervalRef.current);
        dialToneIntervalRef.current = null;
      }
      if (dialToneAudioContextRef.current) {
        dialToneAudioContextRef.current.close().catch(() => {});
        dialToneAudioContextRef.current = null;
      }
    }
    return () => {
      shouldDialToneRef.current = false;
      if (dialToneIntervalRef.current) clearInterval(dialToneIntervalRef.current);
    };
  }, [callState]);

  // Gestion sonnerie
  useEffect(() => {
    if (callState === 'incoming' && incomingCall) {
      const isEmergency = incomingCall.isEmergency;
      shouldRingRef.current = true;
      
      if (isEmergency) {
        // Alarme de pompier + clignotement rouge
        setShowEmergencyOverlay(true);
        playFireAlarm();
      } else {
        // Sonnerie normale
        playRingtone();
        ringtoneIntervalRef.current = setInterval(() => {
          if (shouldRingRef.current) playRingtone();
        }, 600);
      }
    } else {
      shouldRingRef.current = false;
      stopFireAlarm();
      if (ringtoneIntervalRef.current) {
        clearInterval(ringtoneIntervalRef.current);
        ringtoneIntervalRef.current = null;
      }
      if (ringtoneAudioContextRef.current) {
        ringtoneAudioContextRef.current.close().catch(() => {});
        ringtoneAudioContextRef.current = null;
      }
    }
    return () => {
      shouldRingRef.current = false;
      stopFireAlarm();
      if (ringtoneIntervalRef.current) clearInterval(ringtoneIntervalRef.current);
    };
  }, [callState, incomingCall]);

  // Vérification appels entrants (inclut les appels AFIS)
  useEffect(() => {
    if (callState === 'idle') {
      checkIntervalRef.current = setInterval(async () => {
        try {
          const res = await fetch('/api/siavi/telephone/incoming');
          const data = await res.json();
          if (data.call?.id) {
            setIncomingCall({
              from: data.call.from_aeroport,
              fromPosition: data.call.from_position,
              callId: data.call.id,
              isEmergency: data.call.is_emergency,
            });
            setCallState('incoming');
            setIsOpen(true);
          }
        } catch (err) {
          console.error('Erreur vérification appels:', err);
        }
      }, 1000);
    } else if (callState === 'incoming' && incomingCall) {
      checkIntervalRef.current = setInterval(async () => {
        try {
          const res = await fetch(`/api/siavi/telephone/status?callId=${incomingCall.callId}`);
          const data = await res.json();
          if (!data.call || data.status === 'ended' || data.status === 'rejected') {
            setIncomingCall(null);
            setCallState('idle');
          }
        } catch (err) {
          console.error('Erreur vérification statut:', err);
        }
      }, 1000);
    }
    return () => {
      if (checkIntervalRef.current) {
        clearInterval(checkIntervalRef.current);
        checkIntervalRef.current = null;
      }
    };
  }, [callState, incomingCall]);

  const playMessage = (message: string) => {
    if ('speechSynthesis' in window) {
      const utterance = new SpeechSynthesisUtterance(message);
      utterance.lang = 'fr-FR';
      utterance.rate = 0.9;
      speechSynthesis.speak(utterance);
    }
  };

  const handleNumberInput = (digit: string) => {
    if (callState === 'idle' || callState === 'dialing') {
      setNumber(prev => prev + digit);
      if (callState === 'idle') setCallState('dialing');
    }
  };

  const handleDelete = () => {
    setNumber(prev => prev.slice(0, -1));
    if (number.length === 1) setCallState('idle');
  };

  const cleanupWebRTC = () => {
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
    if (callStatusIntervalRef.current) {
      clearInterval(callStatusIntervalRef.current);
      callStatusIntervalRef.current = null;
    }
  };

  const startCallStatusMonitoring = (callId: string) => {
    callStatusIntervalRef.current = setInterval(async () => {
      try {
        const res = await fetch(`/api/siavi/telephone/status?callId=${callId}`);
        const data = await res.json();
        if (data.status === 'ended' || data.status === 'rejected' || !data.call) {
          cleanupWebRTC();
          setCallState('idle');
          setNumber('');
          setIncomingCall(null);
          setCurrentCall(null);
          setIsMuted(false);
          playMessage('Appel terminé');
        }
      } catch (err) {
        console.error('Erreur vérification statut:', err);
      }
    }, 1500);
  };

  const setupWebRTC = async (callId: string, isInitiator: boolean) => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
        video: false,
      });
      localStreamRef.current = stream;
      if (localAudioRef.current) {
        localAudioRef.current.srcObject = stream;
        localAudioRef.current.volume = 0;
      }

      const pc = new RTCPeerConnection({
        iceServers: [
          { urls: 'stun:stun.l.google.com:19302' },
          { urls: 'stun:stun1.l.google.com:19302' },
          { urls: 'stun:stun2.l.google.com:19302' },
        ],
        iceCandidatePoolSize: 10,
      });
      peerConnectionRef.current = pc;

      stream.getTracks().forEach(track => pc.addTrack(track, stream));

      pc.ontrack = (event) => {
        if (event.streams?.[0] && remoteAudioRef.current) {
          remoteAudioRef.current.srcObject = event.streams[0];
          remoteAudioRef.current.volume = 1.0;
          remoteAudioRef.current.play().catch(console.error);
        }
      };

      pc.onconnectionstatechange = () => {
        if (pc.connectionState === 'connected') {
          setCallState('connected');
          playMessage('Communications établie');
        } else if (['disconnected', 'failed', 'closed'].includes(pc.connectionState)) {
          cleanupWebRTC();
          setCallState('idle');
          setNumber('');
          setIncomingCall(null);
          setCurrentCall(null);
          setIsMuted(false);
        }
      };

      const supabase = createClient();
      const channel = supabase.channel(`call-${callId}`)
        .on('broadcast', { event: 'webrtc-signal' }, async (payload) => {
          const message = payload.payload;
          if (message.fromUserId === userId) return;

          try {
            console.log('SIAVI received signal:', message.type);
            if (message.type === 'offer' && !isInitiator) {
              console.log('SIAVI processing offer, creating answer');
              await pc.setRemoteDescription(new RTCSessionDescription(message.data));
              const answer = await pc.createAnswer();
              await pc.setLocalDescription(answer);
              await channel.send({
                type: 'broadcast',
                event: 'webrtc-signal',
                payload: { type: 'answer', data: answer, fromUserId: userId },
              });
              console.log('SIAVI answer sent');
            } else if (message.type === 'answer' && isInitiator) {
              console.log('SIAVI received answer, setting remote description');
              await pc.setRemoteDescription(new RTCSessionDescription(message.data));
            } else if (message.type === 'ice-candidate' && message.data) {
              await pc.addIceCandidate(new RTCIceCandidate(message.data));
            }
          } catch (err) {
            console.error('SIAVI signal error:', err);
          }
        })
        .subscribe(async (status) => {
          console.log('SIAVI WebRTC channel status:', status, 'isInitiator:', isInitiator);
          if (status === 'SUBSCRIBED' && isInitiator) {
            // Envoyer l'offer avec retries optimisés
            const sendOffer = async () => {
              const offer = await pc.createOffer({ offerToReceiveAudio: true, offerToReceiveVideo: false });
              await pc.setLocalDescription(offer);
              console.log('SIAVI sending offer');
              await channel.send({
                type: 'broadcast',
                event: 'webrtc-signal',
                payload: { type: 'offer', data: offer, fromUserId: userId },
              });
            };
            
            // Envoyer l'offer immédiatement (délai réduit de 500ms à 100ms)
            await new Promise(resolve => setTimeout(resolve, 100));
            await sendOffer();
            
            // Réessayer rapidement si pas de connexion
            setTimeout(async () => {
              if (pc.connectionState !== 'connected' && pc.connectionState !== 'connecting' && pc.signalingState !== 'stable') {
                console.log('SIAVI retrying offer (1)');
                await sendOffer();
              }
            }, 800);
            
            setTimeout(async () => {
              if (pc.connectionState !== 'connected' && pc.connectionState !== 'connecting') {
                console.log('SIAVI retrying offer (2)');
                await sendOffer();
              }
            }, 2000);
          }
        });

      signalingChannelRef.current = channel;

      pc.onicecandidate = async (event) => {
        if (event.candidate) {
          await channel.send({
            type: 'broadcast',
            event: 'webrtc-signal',
            payload: { type: 'ice-candidate', data: event.candidate, fromUserId: userId },
          });
        }
      };

      startCallStatusMonitoring(callId);
      return pc;
    } catch (error) {
      console.error('Erreur WebRTC:', error);
      cleanupWebRTC();
      throw error;
    }
  };

  const parseNumber = (num: string) => {
    // Code urgence 911 ou 112 -> appel n'importe quel AFIS
    if (num === '911' || num === '112') {
      return { aeroport: null, position: 'AFIS', isLocal: false, isEmergency: true };
    }
    
    // Local: *505 -> AFIS local
    if (num.startsWith('*')) {
      const code = num.substring(1);
      const pos = CODE_TO_POSITION[code];
      return { aeroport: null, position: pos || null, isLocal: true, isEmergency: false };
    }
    
    // International: +14XXXX505 -> AFIS à l'aéroport XXXX
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

  const handleCall = async () => {
    if (!number || callState !== 'dialing') return;
    
    const parsed = parseNumber(number);
    if (!parsed.position) {
      playMessage('Numéro invalide');
      return;
    }

    setCallState('ringing');
    
    try {
      const res = await fetch('/api/siavi/telephone/call', {
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
      console.log('SIAVI call response:', { ok: res.ok, status: res.status, data });
      
      if (!res.ok) {
        // Si appel bloqué, réinitialiser automatiquement
        if (data.error === 'appel_en_cours') {
          console.log('Appel bloqué détecté, réinitialisation...');
          await fetch('/api/siavi/telephone/hangup', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ reset: true }),
          }).catch(console.error);
          playMessage('Appel précédent réinitialisé. Réessayez.');
          setCallState('idle');
          setNumber('');
          return;
        }
        
        const messages: Record<string, string> = {
          'offline': 'Aucun ATC en ligne sur cet aéroport',
          'position_offline': 'Cette position ATC n\'est pas en service',
          'no_afis': 'Aucun agent AFIS disponible',
          'rejected': 'Appel refusé',
          'non_en_service': 'Vous devez être en service pour appeler',
          'cible_occupee': 'Votre correspondant est déjà en ligne',
          'erreur_creation': 'Erreur lors de la création de l\'appel',
        };
        console.error('SIAVI call error:', data.error, data.message);
        // Utiliser le message détaillé si disponible
        const errorMsg = data.message || messages[data.error] || 'Erreur inconnue';
        playMessage(errorMsg);
        setCallState('idle');
        setNumber('');
        return;
      }

      if (data.call) {
        setCurrentCall({ to: parsed.aeroport || aeroport, toPosition: parsed.position, callId: data.call.id });
        
        for (let i = 0; i < 60; i++) {
          await new Promise(resolve => setTimeout(resolve, 500));
          const statusRes = await fetch(`/api/siavi/telephone/status?callId=${data.call.id}`);
          const statusData = await statusRes.json();
          
          if (statusData.status === 'connected') {
            await setupWebRTC(data.call.id, true);
            setCallState('connected');
            return;
          }
          if (statusData.status === 'rejected' || statusData.status === 'ended') break;
        }
        
        await fetch('/api/siavi/telephone/hangup', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ callId: data.call.id }),
        }).catch(console.error);
        
        playMessage('Votre correspondant ne répond pas');
        setCallState('idle');
        setNumber('');
        setCurrentCall(null);
      }
    } catch (err) {
      console.error('Erreur appel:', err);
      setCallState('idle');
      setNumber('');
    }
  };

  const handleAnswer = async () => {
    if (!incomingCall) return;
    console.log('Réponse à l\'appel:', incomingCall);
    try {
      const res = await fetch('/api/siavi/telephone/answer', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ callId: incomingCall.callId }),
      });
      const data = await res.json();
      console.log('Réponse API answer:', { ok: res.ok, data });
      
      if (res.ok) {
        // Stopper les sonneries/alarmes
        stopFireAlarm();
        shouldRingRef.current = false;
        
        try {
          await setupWebRTC(incomingCall.callId, false);
        } catch (webrtcErr) {
          console.error('WebRTC setup error:', webrtcErr);
        }
        setCurrentCall({ to: incomingCall.from, toPosition: incomingCall.fromPosition, callId: incomingCall.callId });
        setIncomingCall(null);
        setCallState('connected');
      } else {
        console.error('Erreur réponse:', data.error);
        playMessage(data.error || 'Impossible de répondre');
        setIncomingCall(null);
        setCallState('idle');
      }
    } catch (err) {
      console.error('Erreur réponse:', err);
      setIncomingCall(null);
      setCallState('idle');
    }
  };

  const handleReject = async () => {
    if (!incomingCall) return;
    try {
      await fetch('/api/siavi/telephone/reject', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ callId: incomingCall.callId }),
      });
      setIncomingCall(null);
      setCallState('idle');
    } catch (err) {
      console.error('Erreur refus:', err);
    }
  };

  const handleHangup = async () => {
    const callId = currentCall?.callId || incomingCall?.callId;
    cleanupWebRTC();
    if (callId) {
      await fetch('/api/siavi/telephone/hangup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ callId }),
      }).catch(console.error);
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

  useEffect(() => () => cleanupWebRTC(), []);

  // Overlay clignotant rouge pour urgence
  const EmergencyOverlay = () => (
    <div className="fixed inset-0 z-[100] pointer-events-none animate-emergency-flash">
      <div className="absolute inset-0 bg-red-600/40" />
      <div className="absolute top-4 left-1/2 -translate-x-1/2 bg-red-600 text-white px-8 py-4 rounded-xl shadow-2xl pointer-events-auto animate-bounce">
        <div className="flex items-center gap-3">
          <Phone className="h-8 w-8 animate-pulse" />
          <div>
            <p className="text-xl font-bold">🚨 APPEL D&apos;URGENCE 🚨</p>
            <p className="text-sm">911/112 - Décrochez immédiatement</p>
          </div>
          <Phone className="h-8 w-8 animate-pulse" />
        </div>
      </div>
      <style jsx>{`
        @keyframes emergency-flash {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.3; }
        }
        .animate-emergency-flash {
          animation: emergency-flash 0.5s ease-in-out infinite;
        }
      `}</style>
    </div>
  );

  // Combiné fermé
  if (!isOpen) {
    const isEmergencyIncoming = callState === 'incoming' && incomingCall?.isEmergency;
    return (
      <>
        {showEmergencyOverlay && <EmergencyOverlay />}
        <button
          onClick={() => setIsOpen(true)}
          className={`fixed bottom-0 left-1/2 -translate-x-1/2 z-50 rounded-t-2xl shadow-2xl transition-all duration-300 hover:shadow-3xl group
            ${isEmergencyIncoming || showEmergencyOverlay 
              ? 'bg-red-600 animate-pulse ring-4 ring-red-400' 
              : 'bg-slate-900 hover:bg-slate-800'}`}
          style={{ width: '280px', height: '48px' }}
          title="Téléphone SIAVI"
        >
          <div className="relative w-full h-full flex items-center justify-center">
            <div className={`absolute left-2 w-12 h-10 rounded-lg ${isEmergencyIncoming || showEmergencyOverlay ? 'bg-red-700' : 'bg-slate-700'}`} />
            <div className={`flex items-center gap-2 ${isEmergencyIncoming || showEmergencyOverlay ? 'text-white' : 'text-amber-400'}`}>
              <Flame className={`h-5 w-5 ${isEmergencyIncoming || showEmergencyOverlay ? 'animate-ping text-yellow-300' : 'group-hover:animate-bounce'}`} />
              <span className="text-sm font-bold tracking-wide">
                {isEmergencyIncoming || showEmergencyOverlay ? '🚨 URGENCE 🚨' : 'SIAVI'}
              </span>
            </div>
            <div className={`absolute right-2 w-12 h-10 rounded-lg ${isEmergencyIncoming || showEmergencyOverlay ? 'bg-red-700' : 'bg-slate-700'}`} />
            
            {callState === 'incoming' && !incomingCall?.isEmergency && (
              <div className="absolute -top-2 right-4 w-4 h-4 rounded-full animate-ping bg-green-500" />
            )}
          </div>
        </button>
        {(isEmergencyIncoming || showEmergencyOverlay) && (
          <style jsx>{`
            @keyframes emergency-phone-flash {
              0%, 100% { box-shadow: 0 0 20px 10px rgba(239, 68, 68, 0.8); }
              50% { box-shadow: 0 0 40px 20px rgba(239, 68, 68, 0.4); }
            }
          `}</style>
        )}
      </>
    );
  }

  // Combiné ouvert
  const isEmergencyActive = showEmergencyOverlay || (callState === 'incoming' && incomingCall?.isEmergency);
  
  return (
    <>
      {showEmergencyOverlay && <EmergencyOverlay />}
      <div className={`fixed right-4 bottom-4 z-50 rounded-3xl shadow-2xl transition-all duration-500 overflow-hidden
        ${isEmergencyActive 
          ? 'bg-red-800 ring-4 ring-red-400 animate-pulse' 
          : 'bg-slate-900'}`}
           style={{ width: '220px', minHeight: '440px' }}>
      
      {/* Écouteur */}
      <div className={`h-16 rounded-t-3xl flex items-center justify-center relative ${isEmergencyActive ? 'bg-red-900' : 'bg-slate-800'}`}>
        <div className={`w-20 h-3 rounded-full opacity-60 ${isEmergencyActive ? 'bg-red-600' : 'bg-slate-600'}`} />
        <Flame className={`absolute right-4 h-5 w-5 ${isEmergencyActive ? 'text-yellow-400 animate-ping' : 'text-amber-500'}`} />
      </div>
      
      {/* Écran LCD */}
      <div className={`mx-3 mt-3 p-3 rounded-lg border-2 ${isEmergencyActive ? 'bg-red-950 border-red-600' : 'bg-slate-800 border-amber-600/50'}`}>
        <div className="text-center font-mono min-h-[32px] tracking-wider">
          {callState === 'incoming' && incomingCall ? (
            <div className={`animate-pulse ${incomingCall.isEmergency ? 'text-red-400' : 'text-green-400'}`}>
              <div className="text-xs font-bold mb-1">{incomingCall.isEmergency ? '🚨 URGENCE 🚨' : 'APPEL ENTRANT'}</div>
              <div className="text-base font-bold">{incomingCall.from} {incomingCall.fromPosition}</div>
            </div>
          ) : callState === 'connected' && currentCall ? (
            <div className="text-green-400">
              <div className="text-xs mb-1">EN LIGNE</div>
              <div className="text-base font-bold">{currentCall.to} {currentCall.toPosition}</div>
            </div>
          ) : callState === 'ringing' ? (
            <div className="text-amber-400 animate-pulse">
              <div className="text-xs mb-1">APPEL...</div>
              <div className="text-base font-bold">{number}</div>
            </div>
          ) : (
            <div className="text-amber-400 text-xl font-bold">{number || '—'}</div>
          )}
        </div>
      </div>

      {/* Clavier numérique */}
      <div className="p-3 space-y-2">
        {[['1', '2', '3'], ['4', '5', '6'], ['7', '8', '9'], ['*', '0', '+']].map((row, i) => (
          <div key={i} className="grid grid-cols-3 gap-1.5">
            {row.map(d => (
              <button
                key={d}
                onClick={() => handleNumberInput(d)}
                disabled={callState === 'connected' || callState === 'ringing'}
                className={`h-11 rounded-lg font-bold text-lg transition-all active:scale-95 disabled:opacity-50
                  ${isEmergencyActive 
                    ? 'bg-red-700 hover:bg-red-600 text-white' 
                    : 'bg-slate-700 hover:bg-slate-600 text-amber-400'}`}
              >
                {d}
              </button>
            ))}
          </div>
        ))}

        {/* Boutons d'action */}
        <div className="grid grid-cols-3 gap-1.5 pt-2">
          <button
            onClick={handleDelete}
            disabled={!number || callState === 'connected' || callState === 'ringing'}
            className="h-11 bg-amber-600 hover:bg-amber-500 text-white rounded-lg flex items-center justify-center disabled:opacity-50 transition-all active:scale-95"
          >
            <Delete className="h-5 w-5" />
          </button>
          
          {callState === 'incoming' ? (
            <button
              onClick={handleAnswer}
              className={`h-11 text-white rounded-lg flex items-center justify-center transition-all active:scale-95 
                ${incomingCall?.isEmergency 
                  ? 'bg-red-500 hover:bg-red-400 animate-pulse ring-2 ring-yellow-400' 
                  : 'bg-green-600 hover:bg-green-500 animate-pulse'}`}
            >
              <Phone className="h-5 w-5" />
            </button>
          ) : callState === 'connected' ? (
            <button
              onClick={toggleMute}
              className={`h-11 ${isMuted ? 'bg-red-600 hover:bg-red-500' : 'bg-blue-600 hover:bg-blue-500'} text-white rounded-lg flex items-center justify-center transition-all active:scale-95`}
            >
              {isMuted ? <MicOff className="h-5 w-5" /> : <Mic className="h-5 w-5" />}
            </button>
          ) : (
            <button
              onClick={handleCall}
              disabled={!number || callState === 'ringing'}
              className="h-11 bg-green-600 hover:bg-green-500 text-white rounded-lg flex items-center justify-center disabled:opacity-50 transition-all active:scale-95"
            >
              <PhoneCall className="h-5 w-5" />
            </button>
          )}
          
          {callState === 'incoming' ? (
            <button
              onClick={handleReject}
              className="h-11 bg-red-600 hover:bg-red-500 text-white rounded-lg flex items-center justify-center transition-all active:scale-95"
            >
              <PhoneOff className="h-5 w-5" />
            </button>
          ) : callState === 'connected' || callState === 'ringing' ? (
            <button
              onClick={handleHangup}
              className="h-11 bg-red-600 hover:bg-red-500 text-white rounded-lg flex items-center justify-center transition-all active:scale-95"
            >
              <PhoneOff className="h-5 w-5" />
            </button>
          ) : (
            <button
              onClick={() => { setIsOpen(false); setNumber(''); setCallState('idle'); }}
              className="h-11 bg-slate-600 hover:bg-slate-500 text-white rounded-lg flex items-center justify-center transition-all active:scale-95"
            >
              <PhoneOff className="h-5 w-5" />
            </button>
          )}
        </div>
      </div>

      {/* Micro */}
      <div className={`h-14 rounded-b-3xl flex items-center justify-center relative mt-2 ${isEmergencyActive ? 'bg-red-900' : 'bg-slate-800'}`}>
        <div className="grid grid-cols-4 gap-1">
          {[...Array(16)].map((_, i) => (
            <div key={i} className={`w-2 h-2 rounded-full opacity-60 ${isEmergencyActive ? 'bg-red-600' : 'bg-slate-600'}`} />
          ))}
        </div>
      </div>

      {/* Audio */}
      <audio ref={localAudioRef} autoPlay muted playsInline />
      <audio ref={remoteAudioRef} autoPlay playsInline />
    </div>
    </>
  );
}
