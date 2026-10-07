'use client';

import { useEffect } from 'react';

/** Original, quiet music-box motif. No download or network request. */
export default function HalloweenAmbience() {
  useEffect(() => {
    let context: AudioContext | null = null;
    let timer: ReturnType<typeof setInterval> | undefined;
    let disposed = false;
    const notes = [69, 72, 76, 75, 72, 69, 68, 71, 74, 71, 68, 64, 69, 72, 68, 64];
    const playPhrase = () => {
      if (!context || context.state !== 'running' || document.hidden) return;
      const start = context.currentTime + 0.1;
      notes.forEach((note, index) => {
        const oscillator = context!.createOscillator();
        const gain = context!.createGain();
        const time = start + index * 0.65;
        oscillator.type = 'sine';
        oscillator.frequency.value = 440 * Math.pow(2, (note - 69) / 12);
        gain.gain.setValueAtTime(0, time);
        gain.gain.linearRampToValueAtTime(0.035, time + 0.015);
        gain.gain.exponentialRampToValueAtTime(0.0001, time + 1.2);
        oscillator.connect(gain);
        gain.connect(context!.destination);
        oscillator.start(time);
        oscillator.stop(time + 1.3);
        oscillator.onended = () => { oscillator.disconnect(); gain.disconnect(); };
      });
    };
    const start = async () => {
      if (disposed || document.hidden) return;
      try {
        context ??= new AudioContext();
        await context.resume();
        if (disposed || context.state !== 'running' || timer) return;
        playPhrase();
        timer = setInterval(playPhrase, 12000);
      } catch { /* A browser policy must never prevent signing in. */ }
    };
    const visibility = () => {
      if (document.hidden) void context?.suspend();
      else void start();
    };
    void start();
    document.addEventListener('pointerdown', start);
    document.addEventListener('keydown', start);
    document.addEventListener('visibilitychange', visibility);
    return () => {
      disposed = true;
      clearInterval(timer);
      document.removeEventListener('pointerdown', start);
      document.removeEventListener('keydown', start);
      document.removeEventListener('visibilitychange', visibility);
      void context?.close();
    };
  }, []);
  return null;
}
