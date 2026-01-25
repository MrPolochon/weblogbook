'use client';

import { useState, useEffect, useRef } from 'react';
import { Phone, PhoneOff, PhoneCall, X, Mic, MicOff } from 'lucide-react';
import { useAtcTheme } from '@/contexts/AtcThemeContext';
import { createClient } from '@/lib/supabase/client';
import { ATC_POSITIONS } from '@/lib/atc-positions';

type CallState = 'idle' | 'dialing' | 'ringing' | 'incoming' | 'connected' | 'ended';

interface AtcTelephoneProps {
  aeroport: string;
  position: string;
  userId: string;
}

// Mapping des positions vers les codes (doit correspondre aux valeurs de la base de données)
// Les positions dans la DB sont : 'Delivery', 'Clairance', 'Ground', 'Tower', 'APP', 'DEP', 'Center'
const POSITION_CODES: Record<string, string> = {
  'Delivery': '15',
  'Clairance': '16',  // Note: "Clairance" avec un seul 'r' dans la DB
  'Ground': '17',
  'Tower': '18',
  'DEP': '191',
  'APP': '192',
  'Center': '20',
};

// Mapping inverse (code vers position)
const CODE_TO_POSITION: Record<string, string> = Object.fromEntries(
  Object.entries(POSITION_CODES).map(([pos, code]) => [code, pos])
);

// Mapping des codes aéroports vers numéros téléphoniques
// Format: +14[code_aéroport][position]
const AEROPORT_CODES: Record<string, string> = {
  'ITKO': '5566',
  'IPPH': '5567',
  'ILAR': '5568',
  'IPAP': '5569',
  'IRFD': '5570',
  'IMLR': '5571',
  'IZOL': '5572',
  'ISAU': '5573',
  'IJAF': '5574',
  'IBLT': '5575',
  'IDCS': '5576',
  'IGRV': '5577',
  'IBTH': '5578',
  'ISKP': '5579',
  'ILKL': '5580',
  'IBAR': '5581',
  'IHEN': '5582',
  'ITRC': '5583',
  'IBRD': '5584',
  'IUFO': '5585',
  'IIAB': '5586',
  'IGAR': '5587',
  'ISCM': '5588',
};

// Mapping inverse (numéro vers code aéroport)
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
  const signalingChannelRef = useRef<any>(null);

  const playRingtoneRef = useRef<(() => void) | null>(null);
  
  // Créer la fonction playRingtone avec une référence stable
  useEffect(() => {
    playRingtoneRef.current = () => {
      // Créer un son de sonnerie simple
      const audioContext = new (window.AudioContext || (window as any).webkitAudioContext)();
      const oscillator = audioContext.createOscillator();
      const gainNode = audioContext.createGain();
      
      oscillator.connect(gainNode);
      gainNode.connect(audioContext.destination);
      
      oscillator.frequency.value = 800;
      oscillator.type = 'sine';
      gainNode.gain.value = 0.3;
      
      oscillator.start();
      
      setTimeout(() => {
        oscillator.stop();
        setTimeout(() => {
          if (callState === 'incoming' && playRingtoneRef.current) {
            playRingtoneRef.current();
          }
        }, 500);
      }, 500);
    };
  }, [callState]);

  // Vérifier les appels entrants
  useEffect(() => {
    if (callState === 'idle' || callState === 'ringing') {
      checkIntervalRef.current = setInterval(async () => {
        try {
          const res = await fetch('/api/atc/telephone/incoming');
          const data = await res.json();
          
          if (data.call && data.call.id) {
            if (callState === 'idle') {
              setIncomingCall({
                from: data.call.from_aeroport,
                fromPosition: data.call.from_position,
                callId: data.call.id,
              });
              setCallState('incoming');
              if (playRingtoneRef.current) {
                playRingtoneRef.current();
              }
            }
          }
        } catch (err) {
          console.error('Erreur vérification appels:', err);
        }
      }, 2000);
    }

    return () => {
      if (checkIntervalRef.current) {
        clearInterval(checkIntervalRef.current);
      }
    };
  }, [callState]);

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
      if (callState === 'idle') {
        setCallState('dialing');
      }
    }
  };

  const handleDelete = () => {
    setNumber(prev => prev.slice(0, -1));
    if (number.length === 1) {
      setCallState('idle');
    }
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
      playMessage('Impossible d\'accéder au microphone. Vérifiez les permissions.');
      throw error;
    }
  };

  // Nettoyer les ressources WebRTC
  const cleanupWebRTC = () => {
    if (localStreamRef.current) {
      localStreamRef.current.getTracks().forEach(track => track.stop());
      localStreamRef.current = null;
    }
    if (peerConnectionRef.current) {
      peerConnectionRef.current.close();
      peerConnectionRef.current = null;
    }
    if (localAudioRef.current) {
      localAudioRef.current.srcObject = null;
    }
    if (remoteAudioRef.current) {
      remoteAudioRef.current.srcObject = null;
    }
    if (signalingChannelRef.current) {
      signalingChannelRef.current.unsubscribe();
      signalingChannelRef.current = null;
    }
  };

  // Créer la connexion peer et gérer la signalisation
  const setupWebRTC = async (callId: string, isInitiator: boolean) => {
    try {
      // Obtenir le stream local
      const stream = await getLocalStream();
      localStreamRef.current = stream;
      
      if (localAudioRef.current) {
        localAudioRef.current.srcObject = stream;
        localAudioRef.current.volume = 0; // Pas d'écho local
      }

      // Créer la connexion peer
      const pc = new RTCPeerConnection(getRTCConfiguration());
      peerConnectionRef.current = pc;

      // Ajouter les tracks locaux
      stream.getTracks().forEach(track => {
        pc.addTrack(track, stream);
      });

      // Configurer Supabase Realtime pour la signalisation
      const supabase = createClient();
      const channel = supabase.channel(`atc-call-${callId}`)
        .on('broadcast', { event: 'webrtc-signal' }, async (payload) => {
          const { type, data, fromUserId } = payload.payload;
          
          // Ignorer nos propres messages
          if (fromUserId === userId) return;

          if (type === 'offer' && !isInitiator) {
            await pc.setRemoteDescription(new RTCSessionDescription(data));
            const answer = await pc.createAnswer();
            await pc.setLocalDescription(answer);
            
            // Envoyer la réponse
            await channel.send({
              type: 'broadcast',
              event: 'webrtc-signal',
              payload: {
                type: 'answer',
                data: answer,
                callId,
                userId,
              },
            });
          } else if (type === 'answer' && isInitiator) {
            await pc.setRemoteDescription(new RTCSessionDescription(data));
          } else if (type === 'ice-candidate') {
            await pc.addIceCandidate(new RTCIceCandidate(data));
          }
        })
        .subscribe();

      signalingChannelRef.current = channel;

      // Gérer les candidats ICE
      pc.onicecandidate = async (event) => {
        if (event.candidate && channel) {
          // Envoyer le candidat ICE via le canal existant
          await channel.send({
            type: 'broadcast',
            event: 'webrtc-signal',
            payload: {
              type: 'ice-candidate',
              candidate: event.candidate,
              callId,
              userId,
            },
          });
        }
      };

      // Si initiateur, créer l'offre
      if (isInitiator) {
        const offer = await pc.createOffer();
        await pc.setLocalDescription(offer);
        
        // Envoyer l'offre
        await channel.send({
          type: 'broadcast',
          event: 'webrtc-signal',
          payload: {
            type: 'offer',
            data: offer,
            callId,
            userId,
          },
        });
      }

      return pc;
    } catch (error) {
      console.error('Erreur setup WebRTC:', error);
      cleanupWebRTC();
      throw error;
    }
  };

  const parseNumber = (num: string): { aeroport: string | null; position: string | null; isLocal: boolean } => {
    // Numéro local (même aéroport) - Format: *15, *16, *17, *18, *191, *192, *20
    if (num.startsWith('*')) {
      const code = num.substring(1);
      const position = CODE_TO_POSITION[code];
      if (position) {
        return { aeroport: null, position, isLocal: true };
      }
      return { aeroport: null, position: null, isLocal: true };
    }
    
    // Numéro externe (autre aéroport) - Format: +14[code_aéroport_4chiffres][code_position]
    // Exemple: +14556618 = ITKO Tower (5566 = ITKO, 18 = Tower)
    if (num.startsWith('+14')) {
      const rest = num.substring(3); // Enlève "+14"
      
      // Le code aéroport fait 4 chiffres, puis le code position (2 ou 3 chiffres)
      if (rest.length >= 6) {
        const aeroportCode = rest.substring(0, 4);
        const positionCode = rest.substring(4);
        
        // Trouver l'aéroport correspondant au code
        const aeroport = CODE_TO_AEROPORT[aeroportCode];
        
        // Trouver la position correspondante au code
        const position = CODE_TO_POSITION[positionCode];
        
        if (aeroport && position) {
          return { aeroport, position, isLocal: false };
        }
      }
    }
    
    return { aeroport: null, position: null, isLocal: false };
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
        }),
      });

      const data = await res.json();
      
      if (!res.ok) {
        if (data.error === 'offline') {
          playMessage('Votre correspondant ne répond pas');
        } else if (data.error === 'rejected') {
          playMessage('Votre correspondant vous a refusé');
        } else {
          playMessage('Erreur lors de l\'appel');
        }
        setCallState('idle');
        setNumber('');
        return;
      }

      if (data.call) {
        // Configurer WebRTC
        await setupWebRTC(data.call.id, true);
        
        setCurrentCall({
          to: parsed.aeroport || aeroport,
          toPosition: parsed.position,
          callId: data.call.id,
        });
        setCallState('connected');
      }
    } catch (err) {
      console.error('Erreur appel:', err);
      playMessage('Erreur lors de l\'appel');
      setCallState('idle');
      setNumber('');
    }
  };

  const handleReject = async () => {
    if (!incomingCall) return;
    
    try {
      const res = await fetch('/api/atc/telephone/reject', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ callId: incomingCall.callId }),
      });

      if (res.ok) {
        setIncomingCall(null);
        setCallState('idle');
      }
    } catch (err) {
      console.error('Erreur refus:', err);
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

      const data = await res.json();
      
      if (res.ok && data.call) {
        // Configurer WebRTC
        await setupWebRTC(incomingCall.callId, false);
        
        setCurrentCall({
          to: incomingCall.from,
          toPosition: incomingCall.fromPosition,
          callId: incomingCall.callId,
        });
        setIncomingCall(null);
        setCallState('connected');
      }
    } catch (err) {
      console.error('Erreur réponse:', err);
      playMessage('Erreur lors de la connexion audio');
    }
  };

  const handleHangup = async () => {
    const callId = currentCall?.callId || incomingCall?.callId;
    
    // Nettoyer WebRTC
    cleanupWebRTC();
    
    if (callId) {
      try {
        await fetch('/api/atc/telephone/hangup', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ callId }),
        });
      } catch (err) {
        console.error('Erreur raccrochage:', err);
      }
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

  // Nettoyer à la déconnexion
  useEffect(() => {
    return () => {
      cleanupWebRTC();
    };
  }, []);

  const bgColor = isDark ? 'bg-slate-800' : 'bg-slate-100';
  const textColor = isDark ? 'text-slate-200' : 'text-slate-900';
  const borderColor = isDark ? 'border-slate-700' : 'border-slate-300';

  if (!isOpen) {
    return (
      <button
        onClick={() => setIsOpen(true)}
        className={`fixed bottom-4 right-4 z-50 ${bgColor} ${borderColor} border-2 rounded-lg p-4 shadow-lg hover:shadow-xl transition-all`}
        title="Ouvrir le téléphone"
      >
        <Phone className={`h-8 w-8 ${textColor}`} />
      </button>
    );
  }

  return (
    <div className={`fixed ${isOpen ? 'bottom-0' : '-bottom-full'} left-0 right-0 z-50 ${bgColor} ${borderColor} border-t-2 transition-all duration-300`}>
      <div className="max-w-md mx-auto p-4">
        {/* En-tête */}
        <div className="flex items-center justify-between mb-4">
          <h3 className={`text-lg font-semibold ${textColor}`}>Téléphone ATC</h3>
          <button
            onClick={() => {
              setIsOpen(false);
              handleHangup();
            }}
            className={`${textColor} hover:opacity-70`}
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* État de l'appel */}
        {callState === 'incoming' && incomingCall && (
          <div className={`mb-4 p-3 rounded-lg ${isDark ? 'bg-green-900/30' : 'bg-green-100'} border ${isDark ? 'border-green-700' : 'border-green-300'}`}>
            <p className={`text-sm ${isDark ? 'text-green-300' : 'text-green-800'}`}>
              Appel entrant de {incomingCall.from} {incomingCall.fromPosition}
            </p>
            <div className="flex gap-2 mt-2">
              <button
                onClick={handleAnswer}
                className={`flex-1 px-4 py-2 rounded-lg ${isDark ? 'bg-green-700 hover:bg-green-600' : 'bg-green-600 hover:bg-green-700'} text-white font-medium`}
              >
                Répondre
              </button>
              <button
                onClick={handleReject}
                className={`px-4 py-2 rounded-lg ${isDark ? 'bg-red-700 hover:bg-red-600' : 'bg-red-600 hover:bg-red-700'} text-white font-medium`}
                title="Refuser l'appel"
              >
                Refuser
              </button>
            </div>
          </div>
        )}

        {callState === 'connected' && currentCall && (
          <div className={`mb-4 p-3 rounded-lg ${isDark ? 'bg-blue-900/30' : 'bg-blue-100'} border ${isDark ? 'border-blue-700' : 'border-blue-300'}`}>
            <p className={`text-sm ${isDark ? 'text-blue-300' : 'text-blue-800'}`}>
              En communication avec {currentCall.to} {currentCall.toPosition}
            </p>
            <div className="flex gap-2 mt-2">
              <button
                onClick={toggleMute}
                className={`flex-1 px-4 py-2 rounded-lg ${isMuted ? (isDark ? 'bg-red-700 hover:bg-red-600' : 'bg-red-600 hover:bg-red-700') : (isDark ? 'bg-slate-700 hover:bg-slate-600' : 'bg-slate-600 hover:bg-slate-700')} text-white font-medium flex items-center justify-center gap-2`}
              >
                {isMuted ? <MicOff className="h-4 w-4" /> : <Mic className="h-4 w-4" />}
                {isMuted ? 'Démuter' : 'Muter'}
              </button>
              <button
                onClick={handleHangup}
                className={`px-4 py-2 rounded-lg ${isDark ? 'bg-red-700 hover:bg-red-600' : 'bg-red-600 hover:bg-red-700'} text-white font-medium`}
              >
                <PhoneOff className="h-5 w-5" />
              </button>
            </div>
          </div>
        )}

        {/* Éléments audio cachés pour WebRTC */}
        <audio ref={localAudioRef} autoPlay muted />
        <audio ref={remoteAudioRef} autoPlay />

        {/* Affichage du numéro */}
        <div className={`mb-4 p-4 rounded-lg ${isDark ? 'bg-slate-700' : 'bg-white'} ${borderColor} border text-right`}>
          <p className={`text-2xl font-mono ${textColor}`}>{number || 'Composer un numéro...'}</p>
        </div>

        {/* Clavier numérique */}
        <div className="grid grid-cols-3 gap-2 mb-2">
          {[1, 2, 3, 4, 5, 6, 7, 8, 9].map((digit) => (
            <button
              key={digit}
              onClick={() => handleNumberInput(String(digit))}
              disabled={callState === 'connected' || callState === 'ringing'}
              className={`p-4 rounded-lg ${isDark ? 'bg-slate-700 hover:bg-slate-600' : 'bg-white hover:bg-slate-50'} ${borderColor} border ${textColor} font-semibold text-xl disabled:opacity-50 disabled:cursor-not-allowed`}
            >
              {digit}
            </button>
          ))}
        </div>

        <div className="grid grid-cols-3 gap-2 mb-2">
          <button
            onClick={() => handleNumberInput('+')}
            disabled={callState === 'connected' || callState === 'ringing'}
            className={`p-4 rounded-lg ${isDark ? 'bg-slate-700 hover:bg-slate-600' : 'bg-white hover:bg-slate-50'} ${borderColor} border ${textColor} font-semibold text-xl disabled:opacity-50 disabled:cursor-not-allowed`}
          >
            +
          </button>
          <button
            onClick={() => handleNumberInput('*')}
            disabled={callState === 'connected' || callState === 'ringing'}
            className={`p-4 rounded-lg ${isDark ? 'bg-slate-700 hover:bg-slate-600' : 'bg-white hover:bg-slate-50'} ${borderColor} border ${textColor} font-semibold text-xl disabled:opacity-50 disabled:cursor-not-allowed`}
          >
            *
          </button>
          <button
            onClick={() => handleNumberInput('0')}
            disabled={callState === 'connected' || callState === 'ringing'}
            className={`p-4 rounded-lg ${isDark ? 'bg-slate-700 hover:bg-slate-600' : 'bg-white hover:bg-slate-50'} ${borderColor} border ${textColor} font-semibold text-xl disabled:opacity-50 disabled:cursor-not-allowed`}
          >
            0
          </button>
        </div>

        <div className="grid grid-cols-3 gap-2 mb-2">
          <button
            onClick={() => handleNumberInput('#')}
            disabled={callState === 'connected' || callState === 'ringing'}
            className={`p-4 rounded-lg ${isDark ? 'bg-slate-700 hover:bg-slate-600' : 'bg-white hover:bg-slate-50'} ${borderColor} border ${textColor} font-semibold text-xl disabled:opacity-50 disabled:cursor-not-allowed`}
          >
            #
          </button>
          <div></div>
          <div></div>
        </div>

        {/* Boutons d'action */}
        <div className="flex gap-2">
          <button
            onClick={handleCall}
            disabled={!number || callState !== 'dialing'}
            className={`flex-1 px-4 py-3 rounded-lg ${isDark ? 'bg-green-700 hover:bg-green-600' : 'bg-green-600 hover:bg-green-700'} text-white font-medium disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2`}
          >
            <PhoneCall className="h-5 w-5" />
            Appeler
          </button>
          <button
            onClick={handleDelete}
            disabled={!number || callState === 'connected' || callState === 'ringing'}
            className={`px-4 py-3 rounded-lg ${isDark ? 'bg-red-700 hover:bg-red-600' : 'bg-red-600 hover:bg-red-700'} text-white font-medium disabled:opacity-50 disabled:cursor-not-allowed`}
          >
            <X className="h-5 w-5" />
          </button>
        </div>
      </div>
    </div>
  );
}
