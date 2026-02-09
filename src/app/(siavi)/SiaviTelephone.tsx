'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { Phone, PhoneOff, PhoneCall, Mic, MicOff, X, Volume2, VolumeX, AlertTriangle } from 'lucide-react';
import { Room, RoomEvent, Track, ConnectionState } from 'livekit-client';

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
  
  const roomRef = useRef<Room | null>(null);
  const checkIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const callTimerRef = useRef<NodeJS.Timeout | null>(null);
  const audioLevelIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const shouldPlaySoundRef = useRef(false);
  const emergencyAlarmRef = useRef<{ osc: OscillatorNode; ctx: AudioContext } | null>(null);
  const audioContainerRef = useRef<HTMLDivElement | null>(null);
  const [isMounted, setIsMounted] = useState(false);

  // Éviter les erreurs d'hydratation
  useEffect(() => {
    setIsMounted(true);
  }, []);

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
          osc.frequency.value = 440; osc.type = 'sine';
          gain.gain.setValueAtTime(0, ctx.currentTime);
          gain.gain.linearRampToValueAtTime(0.25, ctx.currentTime + 0.05);
          gain.gain.linearRampToValueAtTime(0, ctx.currentTime + 0.25);
          osc.start(); osc.stop(ctx.currentTime + 0.25);
          break;
        case 'dial':
          osc.frequency.value = 425; osc.type = 'sine';
          gain.gain.setValueAtTime(0.12, ctx.currentTime);
          osc.start(); osc.stop(ctx.currentTime + 0.15);
          break;
        case 'end':
          osc.frequency.value = 480; osc.type = 'sine';
          gain.gain.setValueAtTime(0.15, ctx.currentTime);
          gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.4);
          osc.start(); osc.stop(ctx.currentTime + 0.4);
          break;
        case 'beep':
          osc.frequency.value = 1000; osc.type = 'sine';
          gain.gain.setValueAtTime(0.08, ctx.currentTime);
          gain.gain.linearRampToValueAtTime(0, ctx.currentTime + 0.04);
          osc.start(); osc.stop(ctx.currentTime + 0.04);
          break;
        case 'connected':
          osc.frequency.value = 880; osc.type = 'sine';
          gain.gain.setValueAtTime(0.15, ctx.currentTime);
          gain.gain.linearRampToValueAtTime(0, ctx.currentTime + 0.2);
          osc.start(); osc.stop(ctx.currentTime + 0.2);
          break;
      }
      setTimeout(() => ctx.close(), 500);
    } catch (e) { console.error('Audio error:', e); }
  }, []);

  // Alarme urgence
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
        if (!emergencyAlarmRef.current) { clearInterval(repeatSiren); return; }
        const t = emergencyAlarmRef.current.ctx.currentTime;
        emergencyAlarmRef.current.osc.frequency.setValueAtTime(600, t);
        emergencyAlarmRef.current.osc.frequency.linearRampToValueAtTime(900, t + 0.75);
        emergencyAlarmRef.current.osc.frequency.linearRampToValueAtTime(600, t + 1.5);
      }, 1500);
    } catch (e) { console.error('Emergency alarm error:', e); }
  }, []);

  const stopEmergencyAlarm = useCallback(() => {
    if (emergencyAlarmRef.current) {
      try { emergencyAlarmRef.current.osc.stop(); emergencyAlarmRef.current.ctx.close(); } catch (e) { /* ignore */ }
      emergencyAlarmRef.current = null;
    }
    setShowEmergencyOverlay(false);
  }, []);

  // Sonnerie
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
      interval = setInterval(() => { if (shouldPlaySoundRef.current) playSound('ring'); }, 600);
    } else if (callState === 'ringing') {
      shouldPlaySoundRef.current = true;
      playSound('dial');
      interval = setInterval(() => { if (shouldPlaySoundRef.current) playSound('dial'); }, 2000);
    } else {
      shouldPlaySoundRef.current = false;
      stopEmergencyAlarm();
    }
    return () => { shouldPlaySoundRef.current = false; if (interval) clearInterval(interval); };
  }, [callState, incomingCall, playSound, playEmergencyAlarm, stopEmergencyAlarm]);

  // Timer appel connecté
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

  // Polling
  useEffect(() => {
    if (callState === 'idle') {
      checkIntervalRef.current = setInterval(async () => {
        try {
          const res = await fetch('/api/siavi/telephone/incoming');
          const data = await res.json();
          if (data.call?.id) {
            setIncomingCall({ from: data.call.from_aeroport, fromPosition: data.call.from_position, callId: data.call.id, isEmergency: data.call.is_emergency });
            setCallState('incoming');
            setIsOpen(true);
          }
        } catch (err) { console.error('Check calls error:', err); }
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
        } catch (err) { console.error('Status check error:', err); }
      }, 1500);
    }
    return () => { if (checkIntervalRef.current) clearInterval(checkIntervalRef.current); };
  }, [callState, incomingCall, stopEmergencyAlarm]);

  // Cleanup LiveKit
  const cleanupLiveKit = useCallback(async () => {
    console.log('[LiveKit SIAVI] Cleanup');
    if (audioLevelIntervalRef.current) { clearInterval(audioLevelIntervalRef.current); audioLevelIntervalRef.current = null; }
    if (roomRef.current) { await roomRef.current.disconnect(); roomRef.current = null; }
    stopEmergencyAlarm();
    setAudioLevel(0);
    setConnectionStatus('');
  }, [stopEmergencyAlarm]);

  // Timeout 30s pour appels non connectés
  useEffect(() => {
    if (callState === 'ringing' || callState === 'connecting' || callState === 'incoming') {
      const timeout = setTimeout(async () => {
        console.log('[Telephone SIAVI] Timeout 30s - reset automatique');
        stopEmergencyAlarm();
        playMessage('Délai dépassé');
        await cleanupLiveKit();
        const callId = currentCall?.callId || incomingCall?.callId;
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
      }, 30000);
      return () => clearTimeout(timeout);
    }
  }, [callState, currentCall, incomingCall, cleanupLiveKit, playMessage, stopEmergencyAlarm]);

  // Rejoindre appel LiveKit
  const joinLiveKitCall = useCallback(async (callId: string) => {
    console.log('[LiveKit SIAVI] Joining call:', callId);
    setConnectionStatus('Connexion...');
    
    try {
      console.log('[LiveKit SIAVI] Fetching token...');
      const response = await fetch('/api/livekit/token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ roomName: `call-${callId}`, participantName: `${aeroport}-AFIS` }),
      });
      
      const data = await response.json();
      
      if (!response.ok) {
        console.error('[LiveKit SIAVI] Token error:', data);
        throw new Error(data.details || data.error || 'Erreur token LiveKit');
      }
      
      const { token, url } = data;
      
      if (!url) {
        console.error('[LiveKit SIAVI] URL manquante');
        throw new Error('URL LiveKit non configurée');
      }
      
      console.log('[LiveKit SIAVI] Token obtained, connecting to:', url);
      
      const room = new Room({
        adaptiveStream: true,
        dynacast: true,
        audioCaptureDefaults: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
      });
      roomRef.current = room;
      
      room.on(RoomEvent.Connected, () => {
        console.log('[LiveKit SIAVI] Connected to room, waiting for other participant...');
        setConnectionStatus('En attente...');
        // Ne pas dire "Communications établie" ici, attendre l'autre participant
      });
      
      room.on(RoomEvent.Disconnected, (reason) => {
        console.log('[LiveKit SIAVI] Disconnected, reason:', reason);
        cleanupLiveKit();
        setCallState('idle');
        setNumber('');
        setIncomingCall(null);
        setCurrentCall(null);
        setIsMuted(false);
        playSound('end');
        playMessage('Appel terminé');
      });
      
      room.on(RoomEvent.ParticipantConnected, (participant) => {
        console.log('[LiveKit SIAVI] Participant connected:', participant.identity);
        stopEmergencyAlarm();
        setCallState('connected');
        setConnectionStatus('Connecté');
        playSound('connected');
        playMessage('Communications établie');
      });

      // Quand l'autre participant raccroche
      room.on(RoomEvent.ParticipantDisconnected, (participant) => {
        console.log('[LiveKit SIAVI] Participant disconnected:', participant.identity);
        // L'autre a raccroché, on termine l'appel
        stopEmergencyAlarm();
        cleanupLiveKit();
        setCallState('idle');
        setNumber('');
        setIncomingCall(null);
        setCurrentCall(null);
        setIsMuted(false);
        playSound('end');
        playMessage('Correspondant a raccroché');
      });
      
      room.on(RoomEvent.TrackSubscribed, (track, publication, participant) => {
        console.log('[LiveKit SIAVI] Track subscribed:', track.kind, 'from', participant.identity);
        if (track.kind === Track.Kind.Audio) {
          const audioElement = track.attach();
          audioElement.volume = 1.0;
          if (audioContainerRef.current) {
            audioContainerRef.current.appendChild(audioElement);
          }
          audioLevelIntervalRef.current = setInterval(() => {
            const participants = Array.from(room.remoteParticipants.values());
            if (participants.length > 0) setAudioLevel(participants[0].audioLevel || 0);
          }, 100);
        }
      });
      
      room.on(RoomEvent.ConnectionStateChanged, (state: ConnectionState) => {
        console.log('[LiveKit SIAVI] Connection state:', state);
        if (state === ConnectionState.Connected) {
          setConnectionStatus('Connecté');
        } else if (state === ConnectionState.Reconnecting) {
          setConnectionStatus('Reconnexion...');
        } else if (state === ConnectionState.Disconnected) {
          setConnectionStatus('Déconnecté');
        } else {
          setConnectionStatus(state);
        }
      });

      room.on(RoomEvent.MediaDevicesError, (error) => {
        console.error('[LiveKit SIAVI] Media devices error:', error);
        playMessage('Erreur microphone');
      });
      
      // Connecter avec timeout
      console.log('[LiveKit SIAVI] Connecting to room...');
      const connectPromise = room.connect(url, token);
      const timeoutPromise = new Promise((_, reject) => 
        setTimeout(() => reject(new Error('Timeout connexion')), 15000)
      );
      
      await Promise.race([connectPromise, timeoutPromise]);
      
      console.log('[LiveKit SIAVI] Connected, enabling microphone...');
      await room.localParticipant.setMicrophoneEnabled(true);
      console.log('[LiveKit SIAVI] Audio publishing started, waiting for other participant...');
      
    } catch (err) {
      console.error('[LiveKit SIAVI] Error:', err);
      const errorMessage = err instanceof Error ? err.message : 'Erreur inconnue';
      setConnectionStatus(`Erreur: ${errorMessage}`);
      playMessage('Impossible d\'établir la communication');
      await cleanupLiveKit();
      setCallState('idle');
    }
  }, [aeroport, cleanupLiveKit, playSound, playMessage, stopEmergencyAlarm]);

  const parseNumber = (num: string) => {
    if (num === '911' || num === '112') return { aeroport: null, position: 'AFIS', isLocal: false, isEmergency: true };
    if (num.startsWith('*')) return { aeroport: null, position: CODE_TO_POSITION[num.substring(1)] || null, isLocal: true, isEmergency: false };
    if (num.startsWith('+14') && num.length >= 9) {
      return { aeroport: CODE_TO_AEROPORT[num.substring(3, 7)] || null, position: CODE_TO_POSITION[num.substring(7)] || null, isLocal: false, isEmergency: false };
    }
    return { aeroport: null, position: null, isLocal: false, isEmergency: false };
  };

  const handleNumberInput = (digit: string) => {
    if (callState === 'idle' || callState === 'dialing') {
      playSound('beep');
      const newNumber = number + digit;
      setNumber(newNumber);
      if (callState === 'idle') setCallState('dialing');
      
      // Code secret pour reset: 159753
      if (newNumber === '159753') {
        resetPhone();
        playMessage('Téléphone réinitialisé');
      }
    }
  };

  const handleDelete = () => {
    setNumber(prev => { const n = prev.slice(0, -1); if (n.length === 0) setCallState('idle'); return n; });
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
        body: JSON.stringify({ to_aeroport: parsed.aeroport || aeroport, to_position: parsed.position, number, is_emergency: parsed.isEmergency }),
      });

      const data = await res.json();
      
      if (!res.ok) {
        if (data.error === 'offline') playMessage('Votre correspondant est hors ligne');
        else if (data.error === 'no_afis') playMessage('Aucun agent AFIS disponible');
        else if (data.error === 'cible_occupee') playMessage('Votre correspondant est déjà en ligne');
        else playMessage('Erreur lors de l\'appel');
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
            await joinLiveKitCall(data.call.id);
            return;
          }
          if (statusData.status === 'rejected' || statusData.status === 'ended') break;
        }
        
        await fetch('/api/siavi/telephone/hangup', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ callId: data.call.id }) }).catch(console.error);
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
    stopEmergencyAlarm();
    
    try {
      const res = await fetch('/api/siavi/telephone/answer', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ callId: incomingCall.callId }),
      });
      if (res.ok) {
        setCurrentCall({ to: incomingCall.from, toPosition: incomingCall.fromPosition, callId: incomingCall.callId });
        await joinLiveKitCall(incomingCall.callId);
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
    try { await fetch('/api/siavi/telephone/reject', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ callId: incomingCall.callId }) }); } catch (err) { console.error('Reject error:', err); }
    setIncomingCall(null);
    setCallState('idle');
  };

  const handleHangup = async () => {
    const callId = currentCall?.callId || incomingCall?.callId;
    const wasConnected = callState === 'connected';
    await cleanupLiveKit();
    if (callId) { await fetch('/api/siavi/telephone/hangup', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ callId }) }).catch(console.error); }
    playSound('end');
    if (wasConnected) playMessage('Appel terminé');
    setCallState('idle');
    setNumber('');
    setIncomingCall(null);
    setCurrentCall(null);
    setIsMuted(false);
  };

  const toggleMute = async () => {
    if (roomRef.current?.localParticipant) {
      const newMuted = !isMuted;
      await roomRef.current.localParticipant.setMicrophoneEnabled(!newMuted);
      setIsMuted(newMuted);
    }
  };

  const resetPhone = async () => {
    stopEmergencyAlarm();
    try { await fetch('/api/siavi/telephone/hangup', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ reset: true }) }); } catch (err) { console.error('Reset error:', err); }
    await cleanupLiveKit();
    setCallState('idle');
    setNumber('');
    setIncomingCall(null);
    setCurrentCall(null);
    setIsMuted(false);
  };

  useEffect(() => () => { cleanupLiveKit(); }, [cleanupLiveKit]);

  const formatDuration = (seconds: number) => `${Math.floor(seconds / 60)}:${(seconds % 60).toString().padStart(2, '0')}`;

  // Éviter le rendu côté serveur pour les fonctionnalités audio
  if (!isMounted) {
    return null;
  }

  if (!isOpen) {
    return (
      <>
        <div ref={audioContainerRef} style={{ display: 'none' }} />
        <button onClick={() => setIsOpen(true)}
          className={`fixed bottom-4 right-4 z-50 bg-gradient-to-b from-red-800 to-red-900 text-white rounded-2xl shadow-xl px-4 py-3 flex items-center gap-3 transition-all duration-300 hover:scale-105 hover:shadow-2xl ${callState === 'incoming' && incomingCall?.isEmergency ? 'animate-pulse ring-4 ring-red-500' : ''}`}>
          <div className="p-2 rounded-xl bg-red-700/50"><Phone className="h-5 w-5 text-red-200" /></div>
          <span className="font-medium">Téléphone SIAVI</span>
          {callState === 'incoming' && <span className={`absolute -top-1 -right-1 w-4 h-4 rounded-full animate-ping ${incomingCall?.isEmergency ? 'bg-yellow-500' : 'bg-green-500'}`} />}
        </button>
      </>
    );
  }

  // Overlay urgence
  if (showEmergencyOverlay && callState === 'incoming' && incomingCall?.isEmergency) {
    return (
      <>
        <div ref={audioContainerRef} style={{ display: 'none' }} />
        <div className="fixed inset-0 z-40 bg-red-600/30 animate-pulse pointer-events-none" />
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="bg-gradient-to-b from-red-800 to-red-950 rounded-3xl shadow-2xl p-8 max-w-md w-full text-center">
            <div className="mb-6">
              <div className="w-20 h-20 mx-auto bg-yellow-500 rounded-full flex items-center justify-center animate-pulse shadow-lg shadow-yellow-500/50">
                <AlertTriangle className="h-10 w-10 text-red-900" />
              </div>
            </div>
            <h2 className="text-2xl font-bold text-white mb-2">APPEL D&apos;URGENCE</h2>
            <p className="text-xl font-semibold text-yellow-400 mb-6">{incomingCall.from} - {incomingCall.fromPosition}</p>
            <div className="flex gap-4 justify-center">
              <button onClick={handleAnswer}
                className="flex-1 py-4 px-6 bg-emerald-500 hover:bg-emerald-400 text-white rounded-2xl font-bold text-lg flex items-center justify-center gap-2 transition-all shadow-lg shadow-emerald-500/30">
                <Phone className="h-6 w-6" />Répondre
              </button>
              <button onClick={handleReject}
                className="py-4 px-6 bg-slate-700 hover:bg-slate-600 text-white rounded-2xl font-bold flex items-center justify-center transition-all">
                <PhoneOff className="h-6 w-6" />
              </button>
            </div>
          </div>
        </div>
      </>
    );
  }

  return (
    <>
    <div ref={audioContainerRef} style={{ display: 'none' }} />
    <div className="fixed right-4 bottom-4 z-50 bg-gradient-to-b from-red-800 to-red-950 rounded-3xl shadow-2xl overflow-hidden" style={{ width: '240px' }}>
      <div className="px-4 py-3 flex items-center justify-between border-b border-red-700/50">
        <div className="flex items-center gap-2">
          <Phone className="h-4 w-4 text-red-300" />
          <span className="text-sm font-semibold text-white">Téléphone SIAVI</span>
        </div>
        <button onClick={() => { setIsOpen(false); if (callState === 'idle') setNumber(''); }} className="p-1.5 rounded-lg hover:bg-red-700/50">
          <X className="h-3.5 w-3.5 text-red-300" />
        </button>
      </div>
      
      <div className="mx-3 mt-3 p-3 bg-slate-950 rounded-xl">
        <div className="flex items-center justify-between mb-1">
          <span className="text-[10px] text-slate-500 uppercase tracking-wider">
            {callState === 'incoming' ? (incomingCall?.isEmergency ? 'URGENCE' : 'Appel entrant') : callState === 'ringing' ? 'Appel...' : callState === 'connecting' ? 'Connexion...' : callState === 'connected' ? 'En ligne' : 'Composer'}
          </span>
          {callState === 'connected' && (
            <div className="flex items-center gap-1">
              {audioLevel > 0.1 ? <Volume2 className="h-3 w-3 text-emerald-400" style={{ opacity: 0.5 + audioLevel * 0.5 }} /> : <VolumeX className="h-3 w-3 text-slate-500" />}
              <span className="text-[10px] text-emerald-400 font-mono">{formatDuration(callDuration)}</span>
            </div>
          )}
        </div>
        
        <div className="text-center min-h-[32px] flex items-center justify-center">
          {callState === 'incoming' && incomingCall ? (
            <div className={incomingCall.isEmergency ? 'animate-pulse' : ''}>
              <p className={`text-lg font-bold ${incomingCall.isEmergency ? 'text-yellow-400' : 'text-emerald-400'}`}>{incomingCall.from}</p>
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
            <p className={`text-2xl font-mono tracking-wider ${number ? 'text-emerald-400' : 'text-slate-600'}`}>{number || '—'}</p>
          )}
        </div>
        
        {connectionStatus && (callState === 'connecting' || callState === 'ringing') && <p className="text-[10px] text-center text-amber-400 mt-1">{connectionStatus}</p>}
        
        {callState === 'connected' && (
          <div className="mt-2 h-1 bg-slate-700 rounded-full overflow-hidden">
            <div className="h-full bg-gradient-to-r from-emerald-500 to-emerald-400 transition-all duration-75" style={{ width: `${audioLevel * 100}%` }} />
          </div>
        )}
      </div>

      <div className="p-3 space-y-1.5">
        {[['1', '2', '3'], ['4', '5', '6'], ['7', '8', '9'], ['*', '0', '+']].map((row, i) => (
          <div key={i} className="grid grid-cols-3 gap-1.5">
            {row.map(d => (
              <button key={d} onClick={() => handleNumberInput(d)}
                disabled={callState === 'connected' || callState === 'ringing' || callState === 'incoming' || callState === 'connecting'}
                className="h-11 bg-red-700/60 hover:bg-red-600/60 text-white rounded-xl font-semibold text-lg transition-all active:scale-95 disabled:opacity-40 shadow-lg">
                {d}
              </button>
            ))}
          </div>
        ))}

        <div className="grid grid-cols-3 gap-1.5 pt-1">
          <button onClick={handleDelete} disabled={!number || callState !== 'dialing'}
            className="h-11 bg-amber-500 hover:bg-amber-400 text-white rounded-xl flex items-center justify-center disabled:opacity-40 transition-all active:scale-95">
            <X className="h-5 w-5" />
          </button>
          
          {callState === 'incoming' ? (
            <button onClick={handleAnswer}
              className={`h-11 bg-emerald-500 hover:bg-emerald-400 text-white rounded-xl flex items-center justify-center transition-all active:scale-95 shadow-lg ${incomingCall?.isEmergency ? 'animate-pulse shadow-emerald-500/50' : 'shadow-emerald-500/30'}`}>
              <Phone className="h-5 w-5" />
            </button>
          ) : callState === 'connected' ? (
            <button onClick={toggleMute}
              className={`h-11 ${isMuted ? 'bg-red-500 hover:bg-red-400' : 'bg-sky-500 hover:bg-sky-400'} text-white rounded-xl flex items-center justify-center transition-all active:scale-95`}>
              {isMuted ? <MicOff className="h-5 w-5" /> : <Mic className="h-5 w-5" />}
            </button>
          ) : (
            <button onClick={handleCall} disabled={!number || callState === 'ringing' || callState === 'connecting'}
              className="h-11 bg-emerald-500 hover:bg-emerald-400 text-white rounded-xl flex items-center justify-center disabled:opacity-40 transition-all active:scale-95">
              <PhoneCall className="h-5 w-5" />
            </button>
          )}
          
          {callState === 'incoming' ? (
            <button onClick={handleReject}
              className="h-11 bg-slate-600 hover:bg-slate-500 text-white rounded-xl flex items-center justify-center transition-all active:scale-95">
              <PhoneOff className="h-5 w-5" />
            </button>
          ) : callState === 'connected' || callState === 'ringing' || callState === 'connecting' ? (
            <button onClick={handleHangup}
              className="h-11 bg-red-500 hover:bg-red-400 text-white rounded-xl flex items-center justify-center transition-all active:scale-95">
              <PhoneOff className="h-5 w-5" />
            </button>
          ) : (
            <button onClick={() => { setIsOpen(false); setNumber(''); setCallState('idle'); }}
              className="h-11 bg-slate-600 hover:bg-slate-500 text-white rounded-xl flex items-center justify-center transition-all active:scale-95">
              <PhoneOff className="h-5 w-5" />
            </button>
          )}
        </div>
      </div>
    </div>
    </>
  );
}
