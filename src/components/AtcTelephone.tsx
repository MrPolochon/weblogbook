'use client';

import { useState, useEffect, useRef } from 'react';
import { Phone, PhoneOff, PhoneCall, Mic, MicOff, Delete } from 'lucide-react';
import { useAtcTheme } from '@/contexts/AtcThemeContext';
import { createClient } from '@/lib/supabase/client';

type CallState = 'idle' | 'dialing' | 'ringing' | 'incoming' | 'connected' | 'ended';

interface AtcTelephoneProps {
  aeroport: string;
  position: string;
  userId: string;
}

// Mapping des positions vers les codes
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

export default function AtcTelephone({ aeroport, position, userId }: AtcTelephoneProps) {
  const { theme } = useAtcTheme();
  const isDark = theme === 'dark';
  const [isOpen, setIsOpen] = useState(false);
  const [number, setNumber] = useState('');
  const [callState, setCallState] = useState<CallState>('idle');
  const [incomingCall, setIncomingCall] = useState<{ from: string; fromPosition: string; callId: string } | null>(null);
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

  // Sonnerie téléphone réaliste
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
      gain.gain.linearRampToValueAtTime(0.3, ctx.currentTime + 0.1);
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
    if (callState === 'incoming') {
      shouldRingRef.current = true;
      playRingtone();
      ringtoneIntervalRef.current = setInterval(() => {
        if (shouldRingRef.current) playRingtone();
      }, 600);
    } else {
      shouldRingRef.current = false;
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
      if (ringtoneIntervalRef.current) clearInterval(ringtoneIntervalRef.current);
    };
  }, [callState]);

  // Vérification appels entrants (polling rapide pour réactivité)
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
            setIsOpen(true); // Ouvrir automatiquement le téléphone
          }
        } catch (err) {
          console.error('Erreur vérification appels:', err);
        }
      }, 1000); // Réduit de 2000ms à 1000ms pour détection plus rapide
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
          console.error('Erreur vérification statut:', err);
        }
      }, 1000); // Réduit de 2000ms à 1000ms
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
        const res = await fetch(`/api/atc/telephone/status?callId=${callId}`);
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
    }, 1500); // Réduit de 2000ms à 1500ms pour détection fin d'appel plus rapide
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
          { urls: 'stun:stun3.l.google.com:19302' },
          { urls: 'stun:stun4.l.google.com:19302' },
        ],
        iceCandidatePoolSize: 10, // Pré-allocation des candidats ICE pour connexion plus rapide
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
            if (message.type === 'offer' && !isInitiator) {
              await pc.setRemoteDescription(new RTCSessionDescription(message.data));
              const answer = await pc.createAnswer();
              await pc.setLocalDescription(answer);
              await channel.send({
                type: 'broadcast',
                event: 'webrtc-signal',
                payload: { type: 'answer', data: answer, fromUserId: userId },
              });
            } else if (message.type === 'answer' && isInitiator) {
              await pc.setRemoteDescription(new RTCSessionDescription(message.data));
            } else if (message.type === 'ice-candidate' && message.data) {
              await pc.addIceCandidate(new RTCIceCandidate(message.data));
            }
          } catch (err) {
            console.error('Erreur signal:', err);
          }
        })
        .subscribe(async (status) => {
          if (status === 'SUBSCRIBED' && isInitiator) {
            // Délai réduit pour laisser l'autre partie rejoindre le channel
            await new Promise(resolve => setTimeout(resolve, 300));
            const offer = await pc.createOffer({ offerToReceiveAudio: true, offerToReceiveVideo: false });
            await pc.setLocalDescription(offer);
            await channel.send({
              type: 'broadcast',
              event: 'webrtc-signal',
              payload: { type: 'offer', data: offer, fromUserId: userId },
            });
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
    // Appels d'urgence 911 ou 112 -> AFIS
    if (num === '911' || num === '112') {
      return { aeroport: null, position: 'AFIS', isLocal: false, isEmergency: true };
    }
    // Appel local (ex: *505 pour AFIS local)
    if (num.startsWith('*')) {
      const code = num.substring(1);
      const pos = CODE_TO_POSITION[code];
      return { aeroport: null, position: pos || null, isLocal: true, isEmergency: false };
    }
    // Appel international (ex: +145570505 pour AFIS IRFD)
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
        const messages: Record<string, string> = {
          'offline': 'Votre correspondant est hors ligne',
          'no_afis': 'Aucun agent AFIS disponible',
          'rejected': 'Appel refusé',
          'non_en_service': 'Vous devez être en service pour appeler',
          'appel_en_cours': 'Vous avez déjà un appel en cours',
          'cible_occupee': 'Votre correspondant est déjà en ligne',
          'erreur_creation': 'Impossible de créer l\'appel',
        };
        playMessage(messages[data.error] || 'Erreur');
        setCallState('idle');
        setNumber('');
        return;
      }

      if (data.call) {
        setCurrentCall({ to: parsed.aeroport || aeroport, toPosition: parsed.position, callId: data.call.id });
        
        // Attente réponse (30s max, vérification toutes les 500ms pour réactivité)
        for (let i = 0; i < 60; i++) {
          await new Promise(resolve => setTimeout(resolve, 500)); // Réduit de 1000ms à 500ms
          const statusRes = await fetch(`/api/atc/telephone/status?callId=${data.call.id}`);
          const statusData = await statusRes.json();
          
          if (statusData.status === 'connected') {
            await setupWebRTC(data.call.id, true);
            setCallState('connected');
            return;
          }
          if (statusData.status === 'rejected' || statusData.status === 'ended') break;
        }
        
        // Timeout ou rejeté
        await fetch('/api/atc/telephone/hangup', {
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
        setCallState('connected');
      }
    } catch (err) {
      console.error('Erreur réponse:', err);
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
      await fetch('/api/atc/telephone/hangup', {
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

  // Reset du téléphone (terminer tous les appels bloqués)
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
      console.error('Erreur reset téléphone:', err);
    }
  };

  // Reset automatique à l'ouverture du téléphone
  useEffect(() => {
    if (isOpen && callState === 'idle') {
      resetPhone();
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen]);

  useEffect(() => () => cleanupWebRTC(), []);

  // Couleurs du combiné
  const handsetBg = isDark ? 'bg-white' : 'bg-slate-900';
  const handsetText = isDark ? 'text-slate-900' : 'text-white';
  const screenBg = isDark ? 'bg-slate-100' : 'bg-slate-800';
  const screenText = isDark ? 'text-slate-900' : 'text-emerald-400';
  const keyBg = isDark ? 'bg-slate-200 hover:bg-slate-300' : 'bg-slate-700 hover:bg-slate-600';
  const keyText = isDark ? 'text-slate-900' : 'text-white';

  // Combiné fermé (horizontal en bas)
  if (!isOpen) {
    return (
      <button
        onClick={() => setIsOpen(true)}
        className={`fixed bottom-0 left-1/2 -translate-x-1/2 z-50 ${handsetBg} rounded-t-2xl shadow-2xl transition-all duration-300 hover:shadow-3xl group`}
        style={{ width: '280px', height: '48px' }}
        title="Décrocher le téléphone"
      >
        {/* Forme du combiné horizontal */}
        <div className="relative w-full h-full flex items-center justify-center">
          {/* Écouteur gauche */}
          <div className={`absolute left-2 w-12 h-10 ${isDark ? 'bg-slate-300' : 'bg-slate-700'} rounded-lg`} />
          {/* Corps central */}
          <div className={`flex items-center gap-2 ${handsetText}`}>
            <Phone className="h-5 w-5 group-hover:animate-bounce" />
            <span className="text-sm font-medium">Téléphone ATC</span>
          </div>
          {/* Micro droit */}
          <div className={`absolute right-2 w-12 h-10 ${isDark ? 'bg-slate-300' : 'bg-slate-700'} rounded-lg`} />
          
          {/* Indicateur appel entrant */}
          {callState === 'incoming' && (
            <div className="absolute -top-2 right-4 w-4 h-4 bg-green-500 rounded-full animate-ping" />
          )}
        </div>
      </button>
    );
  }

  // Combiné ouvert (vertical à droite avec clavier)
  return (
    <div className={`fixed right-4 bottom-4 z-50 ${handsetBg} rounded-3xl shadow-2xl transition-all duration-500 overflow-hidden`}
         style={{ width: '200px', minHeight: '420px' }}>
      
      {/* Écouteur (haut du combiné) */}
      <div className={`h-16 ${isDark ? 'bg-slate-300' : 'bg-slate-700'} rounded-t-3xl flex items-center justify-center relative`}>
        <div className="w-20 h-3 bg-slate-500 rounded-full opacity-60" />
        <div className="absolute inset-x-4 top-1/2 -translate-y-1/2 flex justify-between">
          <div className="w-2 h-2 rounded-full bg-slate-400" />
          <div className="w-2 h-2 rounded-full bg-slate-400" />
        </div>
      </div>
      
      {/* Écran LCD */}
      <div className={`mx-3 mt-3 p-2 ${screenBg} rounded-lg border-2 ${isDark ? 'border-slate-300' : 'border-slate-600'}`}>
        <div className={`text-center font-mono ${screenText} text-lg min-h-[28px] tracking-wider`}>
          {callState === 'incoming' && incomingCall ? (
            <span className="text-sm animate-pulse">
              {incomingCall.from} {incomingCall.fromPosition}
            </span>
          ) : callState === 'connected' && currentCall ? (
            <span className="text-sm text-emerald-500">
              {currentCall.to} {currentCall.toPosition}
            </span>
          ) : callState === 'ringing' ? (
            <span className="text-sm animate-pulse">Appel en cours...</span>
          ) : (
            number || '—'
          )}
        </div>
      </div>

      {/* Clavier numérique style PA */}
      <div className="p-3 space-y-2">
        {/* Rangée 1-2-3 */}
        <div className="grid grid-cols-3 gap-1">
          {['1', '2', '3'].map(d => (
            <button
              key={d}
              onClick={() => handleNumberInput(d)}
              disabled={callState === 'connected' || callState === 'ringing'}
              className={`h-10 ${keyBg} ${keyText} rounded-md font-bold text-lg transition-all active:scale-95 disabled:opacity-50`}
            >
              {d}
            </button>
          ))}
        </div>
        {/* Rangée 4-5-6 */}
        <div className="grid grid-cols-3 gap-1">
          {['4', '5', '6'].map(d => (
            <button
              key={d}
              onClick={() => handleNumberInput(d)}
              disabled={callState === 'connected' || callState === 'ringing'}
              className={`h-10 ${keyBg} ${keyText} rounded-md font-bold text-lg transition-all active:scale-95 disabled:opacity-50`}
            >
              {d}
            </button>
          ))}
        </div>
        {/* Rangée 7-8-9 */}
        <div className="grid grid-cols-3 gap-1">
          {['7', '8', '9'].map(d => (
            <button
              key={d}
              onClick={() => handleNumberInput(d)}
              disabled={callState === 'connected' || callState === 'ringing'}
              className={`h-10 ${keyBg} ${keyText} rounded-md font-bold text-lg transition-all active:scale-95 disabled:opacity-50`}
            >
              {d}
            </button>
          ))}
        </div>
        {/* Rangée *-0-# */}
        <div className="grid grid-cols-3 gap-1">
          <button
            onClick={() => handleNumberInput('*')}
            disabled={callState === 'connected' || callState === 'ringing'}
            className={`h-10 ${keyBg} ${keyText} rounded-md font-bold text-lg transition-all active:scale-95 disabled:opacity-50`}
          >
            *
          </button>
          <button
            onClick={() => handleNumberInput('0')}
            disabled={callState === 'connected' || callState === 'ringing'}
            className={`h-10 ${keyBg} ${keyText} rounded-md font-bold text-lg transition-all active:scale-95 disabled:opacity-50`}
          >
            0
          </button>
          <button
            onClick={() => handleNumberInput('+')}
            disabled={callState === 'connected' || callState === 'ringing'}
            className={`h-10 ${keyBg} ${keyText} rounded-md font-bold text-lg transition-all active:scale-95 disabled:opacity-50`}
          >
            +
          </button>
        </div>

        {/* Boutons d'action */}
        <div className="grid grid-cols-3 gap-1 pt-2">
          {/* Bouton supprimer */}
          <button
            onClick={handleDelete}
            disabled={!number || callState === 'connected' || callState === 'ringing'}
            className="h-10 bg-amber-600 hover:bg-amber-500 text-white rounded-md flex items-center justify-center disabled:opacity-50 transition-all active:scale-95"
          >
            <Delete className="h-5 w-5" />
          </button>
          
          {/* Bouton appeler / répondre */}
          {callState === 'incoming' ? (
            <button
              onClick={handleAnswer}
              className="h-10 bg-green-600 hover:bg-green-500 text-white rounded-md flex items-center justify-center transition-all active:scale-95 animate-pulse"
            >
              <Phone className="h-5 w-5" />
            </button>
          ) : callState === 'connected' ? (
            <button
              onClick={toggleMute}
              className={`h-10 ${isMuted ? 'bg-red-600 hover:bg-red-500' : 'bg-blue-600 hover:bg-blue-500'} text-white rounded-md flex items-center justify-center transition-all active:scale-95`}
            >
              {isMuted ? <MicOff className="h-5 w-5" /> : <Mic className="h-5 w-5" />}
            </button>
          ) : (
            <button
              onClick={handleCall}
              disabled={!number || callState === 'ringing'}
              className="h-10 bg-green-600 hover:bg-green-500 text-white rounded-md flex items-center justify-center disabled:opacity-50 transition-all active:scale-95"
            >
              <PhoneCall className="h-5 w-5" />
            </button>
          )}
          
          {/* Bouton raccrocher / refuser / fermer */}
          {callState === 'incoming' ? (
            <button
              onClick={handleReject}
              className="h-10 bg-red-600 hover:bg-red-500 text-white rounded-md flex items-center justify-center transition-all active:scale-95"
            >
              <PhoneOff className="h-5 w-5" />
            </button>
          ) : callState === 'connected' || callState === 'ringing' ? (
            <button
              onClick={handleHangup}
              className="h-10 bg-red-600 hover:bg-red-500 text-white rounded-md flex items-center justify-center transition-all active:scale-95"
            >
              <PhoneOff className="h-5 w-5" />
            </button>
          ) : (
            <button
              onClick={() => { setIsOpen(false); setNumber(''); setCallState('idle'); }}
              className="h-10 bg-slate-500 hover:bg-slate-400 text-white rounded-md flex items-center justify-center transition-all active:scale-95"
            >
              <PhoneOff className="h-5 w-5" />
            </button>
          )}
        </div>
      </div>

      {/* Micro (bas du combiné) */}
      <div className={`h-14 ${isDark ? 'bg-slate-300' : 'bg-slate-700'} rounded-b-3xl flex items-center justify-center relative mt-2`}>
        <div className="grid grid-cols-4 gap-1">
          {[...Array(16)].map((_, i) => (
            <div key={i} className="w-2 h-2 rounded-full bg-slate-500 opacity-60" />
          ))}
        </div>
      </div>

      {/* Audio éléments */}
      <audio ref={localAudioRef} autoPlay muted playsInline />
      <audio ref={remoteAudioRef} autoPlay playsInline />
    </div>
  );
}
