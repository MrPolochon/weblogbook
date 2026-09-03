'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { unlockAudioForIOS } from '@/lib/phone-sounds';

export function usePhoneAudioDevices(logLabel: string) {
  const [audioInputs, setAudioInputs] = useState<MediaDeviceInfo[]>([]);
  const [audioOutputs, setAudioOutputs] = useState<MediaDeviceInfo[]>([]);
  const [selectedInputId, setSelectedInputId] = useState('');
  const [selectedOutputId, setSelectedOutputId] = useState('');
  const [audioDeviceError, setAudioDeviceError] = useState<string | null>(null);
  const [isMicTestActive, setIsMicTestActive] = useState(false);
  const [micTestLevel, setMicTestLevel] = useState(0);

  const micTestStreamRef = useRef<MediaStream | null>(null);
  const micTestAudioContextRef = useRef<AudioContext | null>(null);
  const micTestRafRef = useRef<number | null>(null);

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
      console.error(`[${logLabel}] refreshAudioDevices error:`, e);
      setAudioDeviceError('Accès micro refusé ou périphériques indisponibles');
    }
  }, [logLabel]);

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
      console.error(`[${logLabel}] startLocalMicTest error:`, e);
      setAudioDeviceError('Impossible de tester le micro (autorisation ou périphérique)');
      cleanupMicTestResources();
      setIsMicTestActive(false);
    }
  }, [selectedInputId, cleanupMicTestResources, logLabel]);

  useEffect(() => () => cleanupMicTestResources(), [cleanupMicTestResources]);

  return {
    audioInputs,
    audioOutputs,
    selectedInputId,
    setSelectedInputId,
    selectedOutputId,
    setSelectedOutputId,
    audioDeviceError,
    isMicTestActive,
    micTestLevel,
    refreshAudioDevices,
    startLocalMicTest,
    stopLocalMicTest,
  };
}
