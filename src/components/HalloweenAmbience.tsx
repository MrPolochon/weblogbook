'use client';

import { useEffect } from 'react';

/** Original eight-bar miniature in A harmonic minor, synthesized locally. */
export default function HalloweenAmbience() {
  useEffect(() => {
    let context: AudioContext | null = null;
    let timer: ReturnType<typeof setInterval> | undefined;
    let disposed = false;
    const beat = 0.72;
    const bars = [
      { chord: [57, 60, 64], melody: [81, 84, 88, 87] },
      { chord: [53, 57, 60], melody: [84, 81, 80, 76] },
      { chord: [50, 53, 57], melody: [77, 81, 84, 83] },
      { chord: [52, 56, 59], melody: [80, 83, 88, 80] },
      { chord: [57, 60, 64], melody: [81, 88, 93, 91] },
      { chord: [53, 57, 60], melody: [88, 84, 81, 80] },
      { chord: [50, 53, 57], melody: [77, 81, 83, 80] },
      { chord: [52, 56, 59], melody: [83, 80, 76, 80] },
    ];
    let output: GainNode | null = null;
    let nextBarTime = 0;
    let barIndex = 0;
    const note = (pitch: number, time: number, duration: number, volume: number, type: OscillatorType = 'sine', attack = 0.015) => {
      if (!context || !output) return;
      const oscillator = context.createOscillator();
      const gain = context.createGain();
      oscillator.type = type;
      oscillator.frequency.value = 440 * Math.pow(2, (pitch - 69) / 12);
      gain.gain.setValueAtTime(0, time);
      gain.gain.linearRampToValueAtTime(volume, time + attack);
      gain.gain.exponentialRampToValueAtTime(0.0001, time + duration);
      oscillator.connect(gain);
      gain.connect(output);
      oscillator.start(time);
      oscillator.stop(time + duration + 0.05);
      oscillator.onended = () => { oscillator.disconnect(); gain.disconnect(); };
    };
    const schedule = () => {
      if (!context || context.state !== 'running' || document.hidden) return;
      // Schedule against the audio clock so background pauses never stack loops.
      if (nextBarTime < context.currentTime) nextBarTime = context.currentTime + 0.1;
      while (nextBarTime < context.currentTime + 1) {
        const bar = bars[barIndex % bars.length];
        bar.melody.forEach((pitch, index) => {
          const time = nextBarTime + index * beat;
          note(pitch, time, 1.5, 0.035);
          note(pitch + 12, time, 0.65, 0.006); // Soft bell overtone.
        });
        bar.chord.forEach(pitch => note(pitch, nextBarTime, beat * 4, 0.007, 'sine', 0.3));
        note(bar.chord[0] - 12, nextBarTime, beat * 3.8, 0.018, 'triangle', 0.1);
        for (let index = 0; index < 8; index++) {
          note(bar.chord[[0, 1, 2, 1, 0, 1, 2, 1][index]] + 12, nextBarTime + index * beat / 2, 0.7, 0.009);
        }
        nextBarTime += beat * 4;
        barIndex++;
      }
    };
    const start = async () => {
      if (disposed || document.hidden) return;
      try {
        if (!context) {
          context = new AudioContext();
          output = context.createGain();
          output.gain.setValueAtTime(0, context.currentTime);
          output.gain.linearRampToValueAtTime(0.65, context.currentTime + 2);
          output.connect(context.destination);
          const echo = context.createDelay(1);
          const echoGain = context.createGain();
          echo.delayTime.value = beat * 0.75;
          echoGain.gain.value = 0.18;
          output.connect(echo);
          echo.connect(echoGain);
          echoGain.connect(context.destination);
        }
        await context.resume();
        if (disposed || context.state !== 'running' || timer) return;
        schedule();
        timer = setInterval(schedule, 250);
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
