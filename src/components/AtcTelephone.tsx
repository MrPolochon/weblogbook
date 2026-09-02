'use client';

import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { unlockAudioForIOS } from '@/lib/phone-sounds';
import { speakNow } from '@/lib/tts';
import {
  Phone, PhoneOff, PhoneCall, Mic, MicOff, X, Volume2, VolumeX,
  Delete, Settings2, RefreshCw,
} from 'lucide-react';
import { useAtcTheme } from '@/contexts/AtcThemeContext';
import { useLiveKitCall } from '@/hooks/useLiveKitCall';
import { cn } from '@/lib/utils';
import {
  parseAtisCall,
  parseDialedNumber,
  formatStationNumber,
  LOCAL_POSITION_SHORTCUTS,
} from '@/lib/atc-phone-codes';

type CallState =
  | 'idle'
  | 'dialing'
  | 'ringing'
  | 'incoming'
  | 'connecting'
  | 'connected'
  | 'atis_playing';

interface AtcTelephoneProps {
  aeroport: string;
  position: string;
}

const KEYPAD: string[][] = [
  ['1', '2', '3'],
  ['4', '5', '6'],
  ['7', '8', '9'],
  ['*', '0', '+'],
];

function formatDuration(seconds: number) {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}:${s.toString().padStart(2, '0')}`;
}

function AudioSink({ onRef }: { onRef: (el: HTMLDivElement | null) => void }) {
  return (
    <div
      ref={onRef}
      style={{ position: 'absolute', left: -9999, width: 1, height: 1, overflow: 'hidden' }}
      aria-hidden="true"
    />
  );
}

export default function AtcTelephone({ aeroport, position }: AtcTelephoneProps) {
  const { theme } = useAtcTheme();
  const isDark = theme === 'dark';
  const [isOpen, setIsOpen] = useState(false);
  const [number, setNumber] = useState('');
  const [callState, setCallState] = useState<CallState>('idle');
  const [incomingCall, setIncomingCall] = useState<{ from: string; fromPosition: string; callId: string } | null>(null);
  const [currentCall, setCurrentCall] = useState<{ to: string; toPosition: string; callId: string } | null>(null);
  const [callDuration, setCallDuration] = useState(0);
  const [connectionStatus, setConnectionStatus] = useState('');
  const [dialHint, setDialHint] = useState<string | null>(null);
  const [audioInputs, setAudioInputs] = useState<MediaDeviceInfo[]>([]);
  const [audioOutputs, setAudioOutputs] = useState<MediaDeviceInfo[]>([]);
  const [selectedInputId, setSelectedInputId] = useState('');
  const [selectedOutputId, setSelectedOutputId] = useState('');
  const [showAudioPanel, setShowAudioPanel] = useState(false);
  const [audioDeviceError, setAudioDeviceError] = useState<string | null>(null);
  const [isMicTestActive, setIsMicTestActive] = useState(false);
  const [micTestLevel, setMicTestLevel] = useState(0);

  const checkIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const callTimerRef = useRef<NodeJS.Timeout | null>(null);
  const shouldPlaySoundRef = useRef(false);
  const micTestStreamRef = useRef<MediaStream | null>(null);
  const micTestAudioContextRef = useRef<AudioContext | null>(null);
  const micTestRafRef = useRef<number | null>(null);
  const [isMounted, setIsMounted] = useState(false);

  const ownNumber = formatStationNumber(aeroport, position);
  const parsed = useMemo(() => parseDialedNumber(number, aeroport), [number, aeroport]);
  const busy = callState !== 'idle' && callState !== 'dialing';
  const localShortcuts = LOCAL_POSITION_SHORTCUTS.filter((s) => s.position !== position);

  useEffect(() => {
    setIsMounted(true);
  }, []);

  useEffect(() => {
    function handleDial(e: Event) {
      const detail = (e as CustomEvent<{ number: string }>).detail;
      if (!detail?.number) return;
      if (
        callState === 'connected' ||
        callState === 'ringing' ||
        callState === 'incoming' ||
        callState === 'connecting' ||
        callState === 'atis_playing'
      ) {
        return;
      }
      unlockAudioForIOS();
      setIsOpen(true);
      setNumber(detail.number);
      setCallState('dialing');
      setDialHint(null);
    }
    window.addEventListener('atc-telephone:dial', handleDial);
    return () => window.removeEventListener('atc-telephone:dial', handleDial);
  }, [callState]);

  const refreshAudioDevices = useCallback(async () => {
    if (typeof navigator === 'undefined' || !navigator.mediaDevices?.enumerateDevices) return;
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      stream.getTracks().forEach((t) => t.stop());
      const devices = await navigator.mediaDevices.enumerateDevices();
      const inputs = devices.filter((d) => d.kind === 'audioinput');
      const outputs = devices.filter((d) => d.kind === 'audiooutput');
      setAudioInputs(inputs);
      setAudioOutputs(outputs);
      setSelectedInputId((prev) =>
        prev && inputs.some((d) => d.deviceId === prev) ? prev : (inputs[0]?.deviceId ?? ''),
      );
      setSelectedOutputId((prev) =>
        prev && outputs.some((d) => d.deviceId === prev) ? prev : (outputs[0]?.deviceId ?? ''),
      );
      setAudioDeviceError(null);
    } catch (e) {
      console.error('[ATC Phone] refreshAudioDevices error:', e);
      setAudioDeviceError('Accès micro refusé ou périphériques indisponibles');
    }
  }, []);

  useEffect(() => {
    void refreshAudioDevices();
    const mediaDevices = navigator?.mediaDevices;
    if (!mediaDevices?.addEventListener) return;
    const onDeviceChange = () => { void refreshAudioDevices(); };
    mediaDevices.addEventListener('devicechange', onDeviceChange);
    return () => mediaDevices.removeEventListener('devicechange', onDeviceChange);
  }, [refreshAudioDevices]);

  const cleanupMicTestResources = useCallback(() => {
    if (micTestRafRef.current != null) {
      cancelAnimationFrame(micTestRafRef.current);
      micTestRafRef.current = null;
    }
    if (micTestStreamRef.current) {
      micTestStreamRef.current.getTracks().forEach((t) => t.stop());
      micTestStreamRef.current = null;
    }
    if (micTestAudioContextRef.current) {
      void micTestAudioContextRef.current.close();
      micTestAudioContextRef.current = null;
    }
    setMicTestLevel(0);
  }, []);

  const stopLocalMicTest = useCallback(() => {
    cleanupMicTestResources();
    setIsMicTestActive(false);
  }, [cleanupMicTestResources]);

  const startLocalMicTest = useCallback(async () => {
    unlockAudioForIOS();
    cleanupMicTestResources();
    try {
      const useDevice = selectedInputId?.trim();
      const constraints: MediaStreamConstraints = useDevice
        ? { audio: { deviceId: { exact: useDevice } } }
        : { audio: true };
      const stream = await navigator.mediaDevices.getUserMedia(constraints);
      micTestStreamRef.current = stream;

      const AC =
        window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      const audioCtx = new AC();
      micTestAudioContextRef.current = audioCtx;
      await audioCtx.resume();

      const source = audioCtx.createMediaStreamSource(stream);
      const analyser = audioCtx.createAnalyser();
      analyser.fftSize = 1024;
      analyser.smoothingTimeConstant = 0.45;
      source.connect(analyser);
      const silentGain = audioCtx.createGain();
      silentGain.gain.value = 0;
      analyser.connect(silentGain);
      silentGain.connect(audioCtx.destination);

      const buffer = new Float32Array(analyser.fftSize);
      const tick = () => {
        if (!micTestAudioContextRef.current || !micTestStreamRef.current) return;
        analyser.getFloatTimeDomainData(buffer);
        let sum = 0;
        for (let i = 0; i < buffer.length; i++) {
          sum += buffer[i] * buffer[i];
        }
        const rms = Math.sqrt(sum / buffer.length);
        const level = Math.max(0, Math.min(1, rms * 5));
        setMicTestLevel(level);
        micTestRafRef.current = requestAnimationFrame(tick);
      };
      tick();
      setAudioDeviceError(null);
      setIsMicTestActive(true);
    } catch (e) {
      console.error('[ATC Phone] startLocalMicTest error:', e);
      setAudioDeviceError('Impossible de tester le micro (autorisation ou périphérique)');
      cleanupMicTestResources();
      setIsMicTestActive(false);
    }
  }, [selectedInputId, cleanupMicTestResources]);

  const playMessage = useCallback((message: string) => {
    speakNow(message);
  }, []);

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

  const { audioContainerRef, audioLevel, isMuted, cleanupLiveKit, joinLiveKitCall, toggleMute } = useLiveKitCall({
    selectedInputId,
    selectedOutputId,
    playSound,
    playMessage,
    onConnectionStatusChange: setConnectionStatus,
  });

  useEffect(() => {
    let interval: NodeJS.Timeout | null = null;
    if (callState === 'incoming') {
      shouldPlaySoundRef.current = true;
      playSound('ring');
      interval = setInterval(() => { if (shouldPlaySoundRef.current) playSound('ring'); }, 600);
    } else if (callState === 'ringing') {
      shouldPlaySoundRef.current = true;
      playSound('dial');
      interval = setInterval(() => { if (shouldPlaySoundRef.current) playSound('dial'); }, 2000);
    } else {
      shouldPlaySoundRef.current = false;
    }
    return () => { shouldPlaySoundRef.current = false; if (interval) clearInterval(interval); };
  }, [callState, playSound]);

  useEffect(() => {
    if (callState === 'connected') {
      setCallDuration(0);
      callTimerRef.current = setInterval(() => setCallDuration((d) => d + 1), 1000);
    } else {
      if (callTimerRef.current) clearInterval(callTimerRef.current);
      setCallDuration(0);
    }
    return () => { if (callTimerRef.current) clearInterval(callTimerRef.current); };
  }, [callState]);

  useEffect(() => {
    if (callState === 'idle') {
      checkIntervalRef.current = setInterval(async () => {
        try {
          const res = await fetch('/api/atc/telephone/incoming');
          const data = await res.json();
          if (data.call?.id) {
            setIncomingCall({ from: data.call.from_aeroport, fromPosition: data.call.from_position, callId: data.call.id });
            setCallState('incoming');
            setIsOpen(true);
          }
        } catch (err) { console.error('Check calls error:', err); }
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
        } catch (err) { console.error('Status check error:', err); }
      }, 1500);
    }
    return () => { if (checkIntervalRef.current) clearInterval(checkIntervalRef.current); };
  }, [callState, incomingCall]);

  useEffect(() => {
    if (callState === 'ringing' || callState === 'connecting' || callState === 'incoming') {
      const timeout = setTimeout(async () => {
        playMessage('Délai dépassé');
        await cleanupLiveKit();
        const callId = currentCall?.callId || incomingCall?.callId;
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
      }, 30000);
      return () => clearTimeout(timeout);
    }
  }, [callState, currentCall, incomingCall, cleanupLiveKit, playMessage]);

  const micTestActiveRef = useRef(false);
  micTestActiveRef.current = isMicTestActive;
  const prevInputIdRef = useRef(selectedInputId);
  useEffect(() => {
    if (prevInputIdRef.current === selectedInputId) return;
    prevInputIdRef.current = selectedInputId;
    if (!micTestActiveRef.current) return;
    void startLocalMicTest();
  }, [selectedInputId, startLocalMicTest]);

  const handleNumberInput = useCallback((digit: string) => {
    if (callState !== 'idle' && callState !== 'dialing') return;
    playSound('beep');
    setDialHint(null);
    setNumber((prev) => {
      const next = prev + digit;
      if (next === '159753') {
        void (async () => {
          try {
            await fetch('/api/atc/telephone/hangup', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ reset: true }),
            });
            await cleanupLiveKit();
            setCallState('idle');
            setNumber('');
            setIncomingCall(null);
            setCurrentCall(null);
            playMessage('Téléphone réinitialisé');
          } catch (err) { console.error('Reset error:', err); }
        })();
        return '';
      }
      return next;
    });
    if (callState === 'idle') setCallState('dialing');
  }, [callState, playSound, cleanupLiveKit, playMessage]);

  const handleDelete = useCallback(() => {
    setDialHint(null);
    setNumber((prev) => {
      const next = prev.slice(0, -1);
      if (next.length === 0) setCallState('idle');
      return next;
    });
  }, []);

  const handleAtisCall = async (airport_icao: string) => {
    setCallState('ringing');
    setConnectionStatus('Recherche ATIS...');
    setCurrentCall({ to: airport_icao, toPosition: 'ATIS', callId: `atis-${airport_icao}-${Date.now()}` });

    try {
      const res = await fetch('/api/atc/telephone/call', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          atis: true,
          airport_icao,
          number,
        }),
      });
      const data = await res.json();

      if (!res.ok || !data.atis) {
        const reason = data?.error === 'no_atis_active'
          ? `Aucun ATIS actif pour ${airport_icao}`
          : data?.error === 'no_atis_text'
            ? `ATIS de ${airport_icao} non disponible`
            : `Erreur ATIS ${airport_icao}`;
        playMessage(reason);
        playSound('end');
        setCallState('idle');
        setCurrentCall(null);
        setConnectionStatus('');
        setNumber('');
        return;
      }

      const atisTextEn: string = data.atis.atis_text;
      const atisTextFr: string | null = data.atis.atis_text_fr ?? null;
      const bilingual: boolean = Boolean(data.atis.bilingual);

      setCallState('atis_playing');
      setConnectionStatus(
        `ATIS ${data.atis.airport_icao}${data.atis.atis_code ? ` info ${data.atis.atis_code}` : ''}${
          bilingual && atisTextFr ? ' (EN + FR)' : ''
        }`
      );

      try {
        if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
          window.speechSynthesis.cancel();

          const finishCall = () => {
            setCallState('idle');
            setCurrentCall(null);
            setConnectionStatus('');
            setNumber('');
          };

          const utterEn = new SpeechSynthesisUtterance(atisTextEn);
          utterEn.lang = 'en-US';
          utterEn.rate = 0.9;
          utterEn.pitch = 1.0;

          if (bilingual && atisTextFr && atisTextFr.trim()) {
            const utterFr = new SpeechSynthesisUtterance(atisTextFr);
            utterFr.lang = 'fr-FR';
            utterFr.rate = 0.9;
            utterFr.pitch = 1.0;
            utterFr.onend = finishCall;
            utterFr.onerror = finishCall;
            utterEn.onend = () => {
              setConnectionStatus(
                `ATIS ${data.atis.airport_icao}${data.atis.atis_code ? ` info ${data.atis.atis_code}` : ''} (FR)`
              );
              window.speechSynthesis.speak(utterFr);
            };
            utterEn.onerror = finishCall;
            setConnectionStatus(
              `ATIS ${data.atis.airport_icao}${data.atis.atis_code ? ` info ${data.atis.atis_code}` : ''} (EN)`
            );
          } else {
            utterEn.onend = finishCall;
            utterEn.onerror = finishCall;
          }

          window.speechSynthesis.speak(utterEn);
        } else {
          playMessage(`ATIS ${airport_icao} indisponible : navigateur sans synthèse vocale`);
          setCallState('idle');
          setCurrentCall(null);
          setConnectionStatus('');
          setNumber('');
        }
      } catch (err) {
        console.error('ATIS speech error:', err);
        setCallState('idle');
        setCurrentCall(null);
        setConnectionStatus('');
        setNumber('');
      }
    } catch (err) {
      console.error('ATIS call error:', err);
      playMessage('Erreur ATIS');
      setCallState('idle');
      setCurrentCall(null);
      setConnectionStatus('');
      setNumber('');
    }
  };

  const handleCall = async () => {
    if (!number || callState !== 'dialing') return;

    const atisCall = parseAtisCall(number);
    if (atisCall) {
      await handleAtisCall(atisCall.airport_icao);
      return;
    }

    const dest = parseDialedNumber(number, aeroport);
    if (!dest.ready || !dest.position) {
      setDialHint('Numéro incomplet');
      return;
    }

    setCallState('ringing');

    try {
      const res = await fetch('/api/atc/telephone/call', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          to_aeroport: dest.aeroport || aeroport,
          to_position: dest.position,
          number,
          is_emergency: dest.isEmergency,
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        if (data.error === 'offline') playMessage('Votre correspondant est hors ligne');
        else if (data.error === 'position_offline') playMessage(data.message || 'Position non disponible');
        else if (data.error === 'no_afis') playMessage('Aucun agent AFIS disponible');
        else if (data.error === 'cible_occupee') playMessage('Votre correspondant est déjà en ligne');
        else if (data.error === 'appel_en_cours') playMessage('Vous avez déjà un appel en cours');
        else playMessage('Erreur lors de l\'appel');
        playSound('end');
        setCallState('idle');
        setNumber('');
        return;
      }

      if (data.call) {
        setCurrentCall({ to: dest.aeroport || aeroport, toPosition: dest.position, callId: data.call.id });

        for (let i = 0; i < 60; i++) {
          await new Promise((resolve) => setTimeout(resolve, 500));
          const statusRes = await fetch(`/api/atc/telephone/status?callId=${data.call.id}`);
          const statusData = await statusRes.json();

          if (statusData.status === 'connected') {
            setCallState('connecting');
            const ok = await joinLiveKitCall(data.call.id, `${aeroport}-${position}`, {
              onConnected: () => setCallState('connected'),
              onDisconnected: () => { setCallState('idle'); setNumber(''); setIncomingCall(null); setCurrentCall(null); },
              onParticipantDisconnected: () => { setCallState('idle'); setNumber(''); setIncomingCall(null); setCurrentCall(null); },
            });
            if (!ok) {
              await fetch('/api/atc/telephone/hangup', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ callId: data.call.id }),
              }).catch(() => {});
              playMessage('Connexion audio échouée');
              setCallState('idle');
              setCurrentCall(null);
            }
            return;
          }
          if (statusData.status === 'rejected' || statusData.status === 'ended') break;
        }

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
        setCurrentCall({ to: incomingCall.from, toPosition: incomingCall.fromPosition, callId: incomingCall.callId });
        const ok = await joinLiveKitCall(incomingCall.callId, `${aeroport}-${position}`, {
          onConnected: () => setCallState('connected'),
          onDisconnected: () => { setCallState('idle'); setNumber(''); setIncomingCall(null); setCurrentCall(null); },
          onParticipantDisconnected: () => { setCallState('idle'); setNumber(''); setIncomingCall(null); setCurrentCall(null); },
        });
        if (!ok) {
          await fetch('/api/atc/telephone/hangup', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ callId: incomingCall.callId }),
          }).catch(() => {});
          setCallState('idle');
          setCurrentCall(null);
          setIncomingCall(null);
          return;
        }
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
    } catch (err) { console.error('Reject error:', err); }
    setIncomingCall(null);
    setCallState('idle');
  };

  const handleHangup = async () => {
    const callId = currentCall?.callId || incomingCall?.callId;
    const wasConnected = callState === 'connected';
    const wasAtisPlaying = callState === 'atis_playing';

    if (wasAtisPlaying) {
      try {
        if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
          window.speechSynthesis.cancel();
        }
      } catch {
        // ignore
      }
      playSound('end');
      setCallState('idle');
      setNumber('');
      setCurrentCall(null);
      setConnectionStatus('');
      return;
    }

    await cleanupLiveKit();
    if (callId) {
      await fetch('/api/atc/telephone/hangup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ callId }),
      }).catch(console.error);
    }
    playSound('end');
    if (wasConnected) playMessage('Appel terminé');
    setCallState('idle');
    setNumber('');
    setIncomingCall(null);
    setCurrentCall(null);
  };

  useEffect(() => () => {
    stopLocalMicTest();
    void cleanupLiveKit();
  }, [cleanupLiveKit, stopLocalMicTest]);

  useEffect(() => {
    if (!isOpen) return;
    function onKey(e: KeyboardEvent) {
      const tag = (e.target as HTMLElement | null)?.tagName;
      if (tag === 'INPUT' || tag === 'SELECT' || tag === 'TEXTAREA') return;
      if (e.key >= '0' && e.key <= '9') handleNumberInput(e.key);
      else if (e.key === '*' || e.key === '+') handleNumberInput(e.key);
      else if (e.key === 'Backspace') {
        e.preventDefault();
        handleDelete();
      } else if (e.key === 'Enter') {
        e.preventDefault();
        void handleCall();
      } else if (e.key === 'Escape' && (callState === 'idle' || callState === 'dialing')) {
        setIsOpen(false);
        if (callState === 'idle') setNumber('');
      }
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [isOpen, callState, handleNumberInput, handleDelete]);

  const statusLabel =
    callState === 'incoming' ? 'Appel entrant'
      : callState === 'ringing' ? 'Appel…'
        : callState === 'connecting' ? 'Connexion…'
          : callState === 'connected' ? 'En ligne'
            : callState === 'atis_playing' ? 'ATIS en lecture'
              : 'Composer';

  const shell = isDark
    ? 'border border-slate-800 bg-[#080c14]/95 text-slate-100'
    : 'border border-slate-300 bg-white/95 text-slate-900';
  const muted = isDark ? 'text-slate-400' : 'text-slate-500';
  const keyClass = isDark
    ? 'border border-slate-700 bg-slate-900 text-slate-100 hover:bg-slate-800'
    : 'border border-slate-200 bg-slate-100 text-slate-900 hover:bg-slate-200';
  const screenClass = isDark ? 'bg-slate-950/80 border-slate-800' : 'bg-slate-50 border-slate-200';

  if (!isMounted) return null;

  const fabTone =
    callState === 'incoming' ? (isDark ? 'border-emerald-500/70 bg-emerald-950 text-emerald-100' : 'border-emerald-400 bg-emerald-50 text-emerald-900')
      : callState === 'connected' ? (isDark ? 'border-emerald-700/70 bg-emerald-950/80 text-emerald-100' : 'border-emerald-300 bg-emerald-50 text-emerald-900')
        : callState === 'ringing' || callState === 'connecting' || callState === 'atis_playing'
          ? (isDark ? 'border-sky-600/70 bg-sky-950 text-sky-100' : 'border-sky-300 bg-sky-50 text-sky-900')
          : shell;

  if (!isOpen) {
    return (
      <>
        <AudioSink onRef={(el) => { audioContainerRef.current = el; }} />
        <button
          type="button"
          onClick={() => { unlockAudioForIOS(); setIsOpen(true); }}
          className={cn(
            'fixed bottom-4 right-4 z-50 rounded-2xl shadow-xl px-3 py-2.5 flex items-center gap-2.5 transition-all hover:scale-[1.02]',
            fabTone,
          )}
          aria-label="Ouvrir le téléphone ATC"
        >
          <span className={cn(
            'relative flex h-9 w-9 items-center justify-center rounded-xl',
            callState === 'incoming' ? 'bg-emerald-500/25' : isDark ? 'bg-sky-500/15' : 'bg-sky-100',
          )}>
            <Phone className={cn('h-4 w-4', callState === 'incoming' ? 'text-emerald-400' : isDark ? 'text-sky-300' : 'text-sky-600')} />
            {callState === 'incoming' && (
              <span className="absolute -top-1 -right-1 h-3 w-3 rounded-full bg-emerald-400 animate-ping" />
            )}
          </span>
          <span className="text-left leading-tight">
            <span className="block text-sm font-semibold">Téléphone</span>
            <span className={cn('block text-[10px] font-mono uppercase tracking-wider', muted)}>
              {callState === 'incoming' && incomingCall
                ? `${incomingCall.from} ${incomingCall.fromPosition}`
                : callState === 'connected'
                  ? formatDuration(callDuration)
                  : `${aeroport} · ${position}`}
            </span>
          </span>
        </button>
      </>
    );
  }

  return (
    <>
      <AudioSink onRef={(el) => { audioContainerRef.current = el; }} />
      <div className={cn('fixed right-4 bottom-4 z-50 w-[272px] rounded-2xl shadow-2xl overflow-hidden', shell)}>
        <div className={cn('px-3 py-2.5 flex items-center justify-between border-b', isDark ? 'border-slate-800' : 'border-slate-200')}>
          <div className="min-w-0">
            <div className="flex items-center gap-1.5">
              <Phone className={cn('h-3.5 w-3.5', isDark ? 'text-sky-300' : 'text-sky-600')} />
              <span className="text-sm font-bold">Téléphone ATC</span>
            </div>
            <p className={cn('text-[10px] font-mono mt-0.5 truncate', muted)}>
              {aeroport} · {position}{ownNumber ? ` · ${ownNumber}` : ''}
            </p>
          </div>
          <button
            type="button"
            onClick={() => { setIsOpen(false); if (callState === 'idle') setNumber(''); }}
            className={cn('p-1.5 rounded-lg', isDark ? 'hover:bg-slate-800 text-slate-400' : 'hover:bg-slate-100 text-slate-500')}
            aria-label="Réduire le téléphone"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </div>

        <div className={cn('mx-3 mt-3 p-3 rounded-xl border', screenClass)}>
          <div className="flex items-center justify-between mb-1">
            <span className={cn('text-[10px] font-black uppercase tracking-[0.16em]', muted)}>
              {statusLabel}
            </span>
            {callState === 'connected' && (
              <div className="flex items-center gap-1">
                {audioLevel > 0.1
                  ? <Volume2 className="h-3 w-3 text-emerald-400" style={{ opacity: 0.5 + audioLevel * 0.5 }} />
                  : <VolumeX className="h-3 w-3 text-slate-500" />}
                <span className="text-[10px] text-emerald-400 font-mono">{formatDuration(callDuration)}</span>
              </div>
            )}
          </div>

          <div className="text-center min-h-[44px] flex flex-col items-center justify-center">
            {callState === 'incoming' && incomingCall ? (
              <div className="animate-pulse">
                <p className="text-lg font-black text-emerald-400 font-mono">{incomingCall.from}</p>
                <p className={cn('text-xs', muted)}>{incomingCall.fromPosition}</p>
              </div>
            ) : callState === 'atis_playing' && currentCall ? (
              <div>
                <p className="text-lg font-black text-sky-300">ATIS {currentCall.to}</p>
                <p className={cn('text-xs', muted)}>Lecture en cours</p>
              </div>
            ) : callState === 'connected' && currentCall ? (
              <div>
                <p className="text-lg font-black text-emerald-400 font-mono">{currentCall.to}</p>
                <p className={cn('text-xs', muted)}>{currentCall.toPosition}</p>
              </div>
            ) : (callState === 'ringing' || callState === 'connecting') && currentCall ? (
              <div className="animate-pulse">
                <p className="text-lg font-black text-sky-400 font-mono">{currentCall.to}</p>
                <p className={cn('text-xs', muted)}>{currentCall.toPosition}</p>
              </div>
            ) : (
              <>
                <p className={cn('text-xl font-mono tracking-wider', number ? (isDark ? 'text-emerald-300' : 'text-emerald-700') : muted)}>
                  {number || '—'}
                </p>
                {parsed.label && (
                  <p className={cn('text-[11px] mt-0.5', parsed.ready ? (isDark ? 'text-sky-300' : 'text-sky-700') : muted)}>
                    {parsed.label}{parsed.isEmergency ? ' · urgence' : ''}
                  </p>
                )}
              </>
            )}
          </div>

          {connectionStatus && (callState === 'connecting' || callState === 'ringing' || callState === 'atis_playing') && (
            <p className="text-[10px] text-center text-sky-400 mt-1">{connectionStatus}</p>
          )}
          {dialHint && <p className="text-[10px] text-center text-amber-400 mt-1">{dialHint}</p>}

          {callState === 'connected' && (
            <div className={cn('mt-2 h-1 rounded-full overflow-hidden', isDark ? 'bg-slate-800' : 'bg-slate-200')}>
              <div className="h-full bg-emerald-400 transition-all duration-75" style={{ width: `${audioLevel * 100}%` }} />
            </div>
          )}

          <div className="mt-2 flex items-center justify-between">
            <button
              type="button"
              onClick={() => setShowAudioPanel((v) => !v)}
              className={cn(
                'flex items-center gap-1 px-2 py-1 rounded-md text-[10px] font-semibold',
                showAudioPanel
                  ? (isDark ? 'bg-sky-500/20 text-sky-200' : 'bg-sky-100 text-sky-800')
                  : (isDark ? 'bg-slate-800 text-slate-300' : 'bg-slate-200 text-slate-700'),
              )}
            >
              <Settings2 className="h-3 w-3" /> Audio
            </button>
            <button
              type="button"
              onClick={() => { void refreshAudioDevices(); }}
              className={cn('flex items-center gap-1 px-2 py-1 rounded-md text-[10px]', isDark ? 'text-slate-400 hover:text-slate-200' : 'text-slate-500 hover:text-slate-800')}
            >
              <RefreshCw className="h-3 w-3" /> Périphériques
            </button>
          </div>

          {showAudioPanel && (
            <div className="mt-2 space-y-2 text-[10px]">
              <div>
                <p className={cn('mb-1', muted)}>Entrée micro</p>
                <select
                  value={selectedInputId}
                  onChange={(e) => setSelectedInputId(e.target.value)}
                  className={cn('w-full rounded-md px-2 py-1 border', isDark ? 'bg-slate-900 border-slate-700 text-slate-100' : 'bg-white border-slate-300 text-slate-900')}
                >
                  {audioInputs.map((d, i) => (
                    <option key={d.deviceId || `${d.kind}-${i}`} value={d.deviceId}>
                      {d.label || `Microphone ${i + 1}`}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <button
                  type="button"
                  onClick={() => { if (isMicTestActive) stopLocalMicTest(); else void startLocalMicTest(); }}
                  className={cn(
                    'w-full rounded-md px-2 py-1 text-white',
                    isMicTestActive ? 'bg-red-600 hover:bg-red-500' : 'bg-emerald-600 hover:bg-emerald-500',
                  )}
                >
                  {isMicTestActive ? 'Arrêter le test micro' : 'Tester le micro'}
                </button>
                <div className={cn('mt-1 h-1.5 rounded-full overflow-hidden', isDark ? 'bg-slate-800' : 'bg-slate-200')}>
                  <div
                    className={cn('h-full transition-all duration-75', isMicTestActive ? 'bg-emerald-400' : 'bg-slate-500')}
                    style={{ width: `${Math.round(micTestLevel * 100)}%` }}
                  />
                </div>
              </div>
              <div>
                <p className={cn('mb-1', muted)}>Sortie audio</p>
                <select
                  value={selectedOutputId}
                  onChange={(e) => setSelectedOutputId(e.target.value)}
                  className={cn('w-full rounded-md px-2 py-1 border', isDark ? 'bg-slate-900 border-slate-700 text-slate-100' : 'bg-white border-slate-300 text-slate-900')}
                >
                  {audioOutputs.map((d, i) => (
                    <option key={d.deviceId || `${d.kind}-${i}`} value={d.deviceId}>
                      {d.label || `Haut-parleur ${i + 1}`}
                    </option>
                  ))}
                </select>
              </div>
              {audioDeviceError && <p className="text-amber-400">{audioDeviceError}</p>}
            </div>
          )}
        </div>

        {!busy && localShortcuts.length > 0 && (
          <div className="px-3 pt-2 flex flex-wrap gap-1">
            {localShortcuts.map((s) => (
              <button
                key={s.code}
                type="button"
                onClick={() => {
                  unlockAudioForIOS();
                  setNumber(s.code);
                  setCallState('dialing');
                  setDialHint(null);
                }}
                title={`${s.position} (${s.code})`}
                className={cn(
                  'px-1.5 py-0.5 rounded text-[9px] font-black tracking-wide border',
                  number === s.code
                    ? (isDark ? 'border-sky-400 bg-sky-500/20 text-sky-200' : 'border-sky-500 bg-sky-100 text-sky-800')
                    : (isDark ? 'border-slate-800 bg-slate-900/80 text-slate-400 hover:text-slate-200' : 'border-slate-200 bg-slate-50 text-slate-600 hover:text-slate-900'),
                )}
              >
                {s.short}
              </button>
            ))}
          </div>
        )}

        <div className="p-3 space-y-1.5">
          {KEYPAD.map((row) => (
            <div key={row.join('')} className="grid grid-cols-3 gap-1.5">
              {row.map((d) => (
                <button
                  key={d}
                  type="button"
                  onClick={() => handleNumberInput(d)}
                  disabled={busy}
                  className={cn('h-10 rounded-xl font-semibold text-lg transition-all active:scale-95 disabled:opacity-40', keyClass)}
                >
                  {d}
                </button>
              ))}
            </div>
          ))}

          <div className="grid grid-cols-3 gap-1.5 pt-1">
            {callState === 'incoming' ? (
              <>
                <button
                  type="button"
                  onClick={() => { void handleReject(); }}
                  className="h-11 col-span-1 bg-red-600 hover:bg-red-500 text-white rounded-xl flex items-center justify-center"
                  aria-label="Refuser"
                >
                  <PhoneOff className="h-5 w-5" />
                </button>
                <button
                  type="button"
                  onClick={() => { void handleAnswer(); }}
                  className="h-11 col-span-2 bg-emerald-500 hover:bg-emerald-400 text-white rounded-xl flex items-center justify-center gap-2 animate-pulse shadow-lg shadow-emerald-500/30 font-bold text-sm"
                >
                  <Phone className="h-5 w-5" /> Décrocher
                </button>
              </>
            ) : callState === 'connected' ? (
              <>
                <button
                  type="button"
                  onClick={toggleMute}
                  className={cn(
                    'h-11 rounded-xl flex items-center justify-center text-white',
                    isMuted ? 'bg-red-600 hover:bg-red-500' : 'bg-sky-600 hover:bg-sky-500',
                  )}
                  aria-label={isMuted ? 'Réactiver le micro' : 'Couper le micro'}
                >
                  {isMuted ? <MicOff className="h-5 w-5" /> : <Mic className="h-5 w-5" />}
                </button>
                <button
                  type="button"
                  onClick={() => { void handleHangup(); }}
                  className="h-11 col-span-2 bg-red-600 hover:bg-red-500 text-white rounded-xl flex items-center justify-center gap-2 font-bold text-sm"
                >
                  <PhoneOff className="h-5 w-5" /> Raccrocher
                </button>
              </>
            ) : callState === 'atis_playing' || callState === 'ringing' || callState === 'connecting' ? (
              <button
                type="button"
                onClick={() => { void handleHangup(); }}
                className="h-11 col-span-3 bg-red-600 hover:bg-red-500 text-white rounded-xl flex items-center justify-center gap-2 font-bold text-sm"
              >
                <PhoneOff className="h-5 w-5" />
                {callState === 'atis_playing' ? 'Stop ATIS' : 'Annuler'}
              </button>
            ) : (
              <>
                <button
                  type="button"
                  onClick={handleDelete}
                  disabled={!number}
                  className="h-11 bg-amber-500 hover:bg-amber-400 text-white rounded-xl flex items-center justify-center disabled:opacity-40"
                  aria-label="Effacer"
                >
                  <Delete className="h-5 w-5" />
                </button>
                <button
                  type="button"
                  onClick={() => { void handleCall(); }}
                  disabled={!number}
                  className="h-11 col-span-2 bg-emerald-500 hover:bg-emerald-400 text-white rounded-xl flex items-center justify-center gap-2 disabled:opacity-40 font-bold text-sm"
                >
                  <PhoneCall className="h-5 w-5" /> Appeler
                </button>
              </>
            )}
          </div>
        </div>
      </div>
    </>
  );
}
