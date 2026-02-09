'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { Phone, PhoneOff, PhoneCall, Mic, MicOff, X, Volume2, VolumeX, RotateCcw, AlertTriangle } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import { RTC_CONFIG, WEBRTC_TIMEOUTS } from '@/lib/webrtc';

type CallState = 'idle' | 'dialing' | 'ringing' | 'incoming' | 'connecting' | 'connected';

interface SiaviTelephoneProps {
  aeroport: string;
  estAfis: boolean;
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

export default function SiaviTelephone({ aeroport, estAfis, userId }: SiaviTelephoneProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [number, setNumber] = useState('');
  const [callState, setCallState] = useState<CallState>('idle');
  const [incomingCall, setIncomingCall] = useState<{ from: string; fromPosition: string; callId: string; isEmergency?: boolean } | null>(null);
  const [currentCall, setCurrentCall] = useState<{ to: string; toPosition: string; callId: string } | null>(null);
  const [isMuted, setIsMuted] = useState(false);
  const [callDuration, setCallDuration] = useState(0);
  const [audioLevel, setAudioLevel] = useState(0);
  const [connectionStatus, setConnectionStatus] = useState('');
  const [showEmergencyOverlay, setShowEmergencyOverlay] = useState(false);
  
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
  const emergencyAlarmRef = useRef<{ osc: OscillatorNode; ctx: AudioContext } | null>(null);

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

  // Alarme d'urgence
  const playEmergencyAlarm = useCallback(() => {
    if (emergencyAlarmRef.current) return;
    try {
      const ctx = new (window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext)();
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      
      osc.type = 'sawtooth';
      gain.gain.setValueAtTime(0.03, ctx.currentTime);
      
      osc.connect(gain);
      gain.connect(ctx.destination);
      
      osc.frequency.setValueAtTime(600, ctx.currentTime);
      osc.frequency.linearRampToValueAtTime(900, ctx.currentTime + 0.75);
      osc.frequency.linearRampToValueAtTime(600, ctx.currentTime + 1.5);
      
      osc.start();
      emergencyAlarmRef.current = { osc, ctx };
      
      const repeatSiren = setInterval(() => {
        if (!emergencyAlarmRef.current) {
          clearInterval(repeatSiren);
          return;
        }
        const t = emergencyAlarmRef.current.ctx.currentTime;
        emergencyAlarmRef.current.osc.frequency.setValueAtTime(600, t);
        emergencyAlarmRef.current.osc.frequency.linearRampToValueAtTime(900, t + 0.75);
        emergencyAlarmRef.current.osc.frequency.linearRampToValueAtTime(600, t + 1.5);
      }, 1500);
    } catch (e) {
      console.error('Emergency alarm error:', e);
    }
  }, []);

  const stopEmergencyAlarm = useCallback(() => {
    if (emergencyAlarmRef.current) {
      try {
        emergencyAlarmRef.current.osc.stop();
        emergencyAlarmRef.current.ctx.close();
      } catch (e) { /* ignore */ }
      emergencyAlarmRef.current = null;
    }
    setShowEmergencyOverlay(false);
  }, []);

  // Gestion sonnerie
  useEffect(() => {
    let interval: NodeJS.Timeout | null = null;
    
    if (callState === 'incoming' && incomingCall?.isEmergency) {
      shouldPlaySoundRef.current = true;
      setShowEmergencyOverlay(true);
      playEmergencyAlarm();
      setIsOpen(true);
    } else if (callState === 'incoming') {
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
      stopEmergencyAlarm();
    }
    
    return () => {
      shouldPlaySoundRef.current = false;
      if (interval) clearInterval(interval);
    };
  }, [callState, incomingCall, playSound, playEmergencyAlarm, stopEmergencyAlarm]);

  // Timer
  useEffect(() => {
    if (callState === 'connected') {
      setCallDuration(0);
      callTimerRef.current = setInterval(() => setCallDuration(d => d + 1), 1000);
    } else {
      if (callTimerRef.current) clearInterval(callTimerRef.current);
      setCallDuration(0);
    }
    return () => { if (callTimerRef.current) clearInterval(callTimerRef.current); };
  }, [callState]);

  // Polling appels entrants
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
          console.error('Check calls error:', err);
        }
      }, 1500);
    } else if (callState === 'incoming' && incomingCall) {
      checkIntervalRef.current = setInterval(async () => {
        try {
          const res = await fetch(`/api/siavi/telephone/status?callId=${incomingCall.callId}`);
          const data = await res.json();
          if (!data.call || data.status === 'ended' || data.status === 'rejected') {
            stopEmergencyAlarm();
            setIncomingCall(null);
            setCallState('idle');
          }
        } catch (err) {
          console.error('Status check error:', err);
        }
      }, 1500);
    }
    return () => {
      if (checkIntervalRef.current) clearInterval(checkIntervalRef.current);
    };
  }, [callState, incomingCall, stopEmergencyAlarm]);

  const cleanupWebRTC = useCallback(() => {
    console.log('[WebRTC SIAVI] Cleanup');
    if (connectionTimeoutRef.current) clearTimeout(connectionTimeoutRef.current);
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
    stopEmergencyAlarm();
    setAudioLevel(0);
    setConnectionStatus('');
  }, [stopEmergencyAlarm]);

  const setupWebRTC = useCallback(async (callId: string, isInitiator: boolean) => {
    console.log(`[WebRTC SIAVI] Setup - callId: ${callId}, isInitiator: ${isInitiator}`);
    setConnectionStatus('Connexion...');
    
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true, sampleRate: 48000 },
        video: false,
      });
      localStreamRef.current = stream;
      console.log('[WebRTC SIAVI] Got local stream');
      
      if (localAudioRef.current) {
        localAudioRef.current.srcObject = stream;
        localAudioRef.current.volume = 0;
      }

      const pc = new RTCPeerConnection(RTC_CONFIG);
      peerConnectionRef.current = pc;
      console.log('[WebRTC SIAVI] PeerConnection created');

      stream.getTracks().forEach(track => {
        pc.addTrack(track, stream);
        console.log('[WebRTC SIAVI] Track added:', track.kind);
      });

      pc.ontrack = (event) => {
        console.log('[WebRTC SIAVI] Remote track received');
        if (event.streams?.[0] && remoteAudioRef.current) {
          remoteAudioRef.current.srcObject = event.streams[0];
          remoteAudioRef.current.volume = 1.0;
          remoteAudioRef.current.play().catch(e => console.error('[WebRTC SIAVI] Play error:', e));
          
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
              setAudioLevel(data.reduce((a, b) => a + b, 0) / data.length / 255);
              requestAnimationFrame(updateLevel);
            };
            updateLevel();
          } catch (e) {
            console.error('[WebRTC SIAVI] Audio analyser error:', e);
          }
        }
      };

      pc.oniceconnectionstatechange = () => {
        console.log('[WebRTC SIAVI] ICE state:', pc.iceConnectionState);
        setConnectionStatus(`ICE: ${pc.iceConnectionState}`);
        
        if (pc.iceConnectionState === 'connected' || pc.iceConnectionState === 'completed') {
          setCallState('connected');
          setConnectionStatus('Connecté');
          stopEmergencyAlarm();
          playSound('connected');
          if (connectionTimeoutRef.current) clearTimeout(connectionTimeoutRef.current);
        } else if (pc.iceConnectionState === 'failed') {
          setConnectionStatus('Reconnexion...');
          pc.restartIce();
        }
      };

      pc.onconnectionstatechange = () => {
        console.log('[WebRTC SIAVI] Connection state:', pc.connectionState);
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
        }
      };

      const supabase = createClient();
      const channel = supabase.channel(`call-${callId}`, {
        config: { broadcast: { self: false } }
      });
      signalingChannelRef.current = channel;

      channel.on('broadcast', { event: 'signal' }, async ({ payload }) => {
        if (!payload || payload.from === userId) return;
        console.log('[WebRTC SIAVI] Signal received:', payload.type);
        
        try {
          if (payload.type === 'offer' && !isInitiator) {
            console.log('[WebRTC SIAVI] Processing offer');
            await pc.setRemoteDescription(new RTCSessionDescription(payload.data));
            
            for (const candidate of iceCandidatesQueue.current) {
              await pc.addIceCandidate(candidate);
            }
            iceCandidatesQueue.current = [];
            
            const answer = await pc.createAnswer();
            await pc.setLocalDescription(answer);
            console.log('[WebRTC SIAVI] Sending answer');
            await channel.send({
              type: 'broadcast',
              event: 'signal',
              payload: { type: 'answer', data: answer, from: userId },
            });
          } else if (payload.type === 'answer' && isInitiator) {
            console.log('[WebRTC SIAVI] Processing answer');
            await pc.setRemoteDescription(new RTCSessionDescription(payload.data));
          } else if (payload.type === 'ice') {
            if (pc.remoteDescription) {
              await pc.addIceCandidate(new RTCIceCandidate(payload.data));
            } else {
              iceCandidatesQueue.current.push(new RTCIceCandidate(payload.data));
            }
          }
        } catch (err) {
          console.error('[WebRTC SIAVI] Signal error:', err);
        }
      });

      pc.onicecandidate = async (event) => {
        if (event.candidate) {
          await channel.send({
            type: 'broadcast',
            event: 'signal',
            payload: { type: 'ice', data: event.candidate, from: userId },
          });
        }
      };

      await channel.subscribe(async (status) => {
        console.log('[WebRTC SIAVI] Channel status:', status);
        
        if (status === 'SUBSCRIBED' && isInitiator) {
          connectionTimeoutRef.current = setTimeout(() => {
            if (callState !== 'connected') {
              console.error('[WebRTC SIAVI] Connection timeout');
              setConnectionStatus('Timeout');
              cleanupWebRTC();
              setCallState('idle');
              setNumber('');
              setCurrentCall(null);
              playSound('end');
            }
          }, WEBRTC_TIMEOUTS.CONNECTION_TIMEOUT);

          const sendOffer = async (attempt: number) => {
            if (pc.connectionState === 'connected' || pc.iceConnectionState === 'connected') return;
            console.log(`[WebRTC SIAVI] Sending offer (attempt ${attempt + 1})`);
            setConnectionStatus(`Tentative ${attempt + 1}...`);
            
            try {
              const offer = await pc.createOffer({ offerToReceiveAudio: true });
              await pc.setLocalDescription(offer);
              await channel.send({
                type: 'broadcast',
                event: 'signal',
                payload: { type: 'offer', data: offer, from: userId },
              });
            } catch (e) {
              console.error('[WebRTC SIAVI] Offer error:', e);
            }
          };

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
      console.error('[WebRTC SIAVI] Setup error:', error);
      setConnectionStatus('Erreur');
      cleanupWebRTC();
      throw error;
    }
  }, [userId, callState, cleanupWebRTC, playSound, stopEmergencyAlarm]);

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
      
      if (!res.ok) {
        if (data.error === 'appel_en_cours') {
          await fetch('/api/siavi/telephone/hangup', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ reset: true }),
          }).catch(console.error);
        }
        playSound('end');
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
            setCallState('connecting');
            await setupWebRTC(data.call.id, true);
            return;
          }
          if (statusData.status === 'rejected' || statusData.status === 'ended') break;
        }
        
        await fetch('/api/siavi/telephone/hangup', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ callId: data.call.id }),
        }).catch(console.error);
        
        playSound('end');
        setCallState('idle');
        setNumber('');
        setCurrentCall(null);
      }
    } catch (err) {
      console.error('Call error:', err);
      setCallState('idle');
      setNumber('');
    }
  };

  const handleAnswer = async () => {
    if (!incomingCall) return;
    setCallState('connecting');
    setConnectionStatus('Connexion...');
    stopEmergencyAlarm();
    
    try {
      const res = await fetch('/api/siavi/telephone/answer', {
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
    stopEmergencyAlarm();
    try {
      await fetch('/api/siavi/telephone/reject', {
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
    cleanupWebRTC();
    if (callId) {
      await fetch('/api/siavi/telephone/hangup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ callId }),
      }).catch(console.error);
    }
    playSound('end');
    setCallState('idle');
    setNumber('');
    setIncomingCall(null);
    setCurrentCall(null);
    setIsMuted(false);
  };

  const toggleMute = () => {
    if (localStreamRef.current) {
      localStreamRef.current.getAudioTracks().forEach(track => { track.enabled = isMuted; });
      setIsMuted(!isMuted);
    }
  };

  const resetPhone = async () => {
    stopEmergencyAlarm();
    try {
      await fetch('/api/siavi/telephone/hangup', {
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

  // Badge fermé
  if (!isOpen) {
    return (
      <button
        onClick={() => setIsOpen(true)}
        className={`fixed bottom-4 right-4 z-50 bg-gradient-to-b from-red-800 to-red-900 text-white rounded-2xl shadow-xl px-4 py-3 flex items-center gap-3 transition-all duration-300 hover:scale-105 hover:shadow-2xl ${
          callState === 'incoming' && incomingCall?.isEmergency ? 'animate-pulse ring-4 ring-red-500' : ''
        }`}
      >
        <div className="p-2 rounded-xl bg-red-700/50">
          <Phone className="h-5 w-5 text-red-200" />
        </div>
        <span className="font-medium">Téléphone SIAVI</span>
        {callState === 'incoming' && (
          <span className={`absolute -top-1 -right-1 w-4 h-4 rounded-full animate-ping ${
            incomingCall?.isEmergency ? 'bg-yellow-500' : 'bg-green-500'
          }`} />
        )}
      </button>
    );
  }

  // Overlay urgence
  if (showEmergencyOverlay && callState === 'incoming' && incomingCall?.isEmergency) {
    return (
      <>
        <div className="fixed inset-0 z-40 bg-red-600/30 animate-pulse pointer-events-none" />
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="bg-gradient-to-b from-red-800 to-red-950 rounded-3xl shadow-2xl p-8 max-w-md w-full text-center">
            <div className="mb-6">
              <div className="w-20 h-20 mx-auto bg-yellow-500 rounded-full flex items-center justify-center animate-pulse shadow-lg shadow-yellow-500/50">
                <AlertTriangle className="h-10 w-10 text-red-900" />
              </div>
            </div>
            
            <h2 className="text-2xl font-bold text-white mb-2">APPEL D&apos;URGENCE</h2>
            <p className="text-xl font-semibold text-yellow-400 mb-6">
              {incomingCall.from} - {incomingCall.fromPosition}
            </p>
            
            <div className="flex gap-4 justify-center">
              <button
                onClick={handleAnswer}
                className="flex-1 py-4 px-6 bg-emerald-500 hover:bg-emerald-400 text-white rounded-2xl font-bold text-lg flex items-center justify-center gap-2 transition-all shadow-lg shadow-emerald-500/30"
              >
                <Phone className="h-6 w-6" />
                Répondre
              </button>
              <button
                onClick={handleReject}
                className="py-4 px-6 bg-slate-700 hover:bg-slate-600 text-white rounded-2xl font-bold flex items-center justify-center transition-all"
              >
                <PhoneOff className="h-6 w-6" />
              </button>
            </div>
          </div>
        </div>
        <audio ref={localAudioRef} autoPlay muted playsInline />
        <audio ref={remoteAudioRef} autoPlay playsInline />
      </>
    );
  }

  return (
    <div className="fixed right-4 bottom-4 z-50 bg-gradient-to-b from-red-800 to-red-950 rounded-3xl shadow-2xl overflow-hidden"
         style={{ width: '240px' }}>
      
      {/* Header */}
      <div className="px-4 py-3 flex items-center justify-between border-b border-red-700/50">
        <div className="flex items-center gap-2">
          <Phone className="h-4 w-4 text-red-300" />
          <span className="text-sm font-semibold text-white">Téléphone SIAVI</span>
        </div>
        <div className="flex items-center gap-1">
          <button onClick={resetPhone} className="p-1.5 rounded-lg hover:bg-red-700/50" title="Réinitialiser">
            <RotateCcw className="h-3.5 w-3.5 text-red-300" />
          </button>
          <button onClick={() => { setIsOpen(false); if (callState === 'idle') setNumber(''); }} className="p-1.5 rounded-lg hover:bg-red-700/50">
            <X className="h-3.5 w-3.5 text-red-300" />
          </button>
        </div>
      </div>
      
      {/* Écran */}
      <div className="mx-3 mt-3 p-3 bg-slate-950 rounded-xl">
        <div className="flex items-center justify-between mb-1">
          <span className="text-[10px] text-slate-500 uppercase tracking-wider">
            {callState === 'incoming' ? (incomingCall?.isEmergency ? 'URGENCE' : 'Appel entrant') : 
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
            <div className={incomingCall.isEmergency ? 'animate-pulse' : ''}>
              <p className={`text-lg font-bold ${incomingCall.isEmergency ? 'text-yellow-400' : 'text-emerald-400'}`}>
                {incomingCall.from}
              </p>
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
        
        {connectionStatus && (callState === 'connecting' || callState === 'ringing') && (
          <p className="text-[10px] text-center text-amber-400 mt-1">{connectionStatus}</p>
        )}
        
        {callState === 'connected' && (
          <div className="mt-2 h-1 bg-slate-700 rounded-full overflow-hidden">
            <div className="h-full bg-gradient-to-r from-emerald-500 to-emerald-400 transition-all duration-75"
                 style={{ width: `${audioLevel * 100}%` }} />
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
                className="h-11 bg-red-700/60 hover:bg-red-600/60 text-white rounded-xl font-semibold text-lg transition-all active:scale-95 disabled:opacity-40 shadow-lg"
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
              className={`h-11 bg-emerald-500 hover:bg-emerald-400 text-white rounded-xl flex items-center justify-center transition-all active:scale-95 shadow-lg ${
                incomingCall?.isEmergency ? 'animate-pulse shadow-emerald-500/50' : 'shadow-emerald-500/30'
              }`}
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
              className="h-11 bg-slate-600 hover:bg-slate-500 text-white rounded-xl flex items-center justify-center transition-all active:scale-95"
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
              className="h-11 bg-slate-600 hover:bg-slate-500 text-white rounded-xl flex items-center justify-center transition-all active:scale-95"
            >
              <PhoneOff className="h-5 w-5" />
            </button>
          )}
        </div>
      </div>

      <audio ref={localAudioRef} autoPlay muted playsInline />
      <audio ref={remoteAudioRef} autoPlay playsInline />
    </div>
  );
}
