'use client';

import { useEffect } from 'react';

/** Original music-box theme: introduction, build, drop, release and quiet reprise. */
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
    const drum = (time: number, volume: number, high = false) => {
      if (!context || !output) return;
      const oscillator = context.createOscillator();
      const gain = context.createGain();
      oscillator.type = 'sine';
      oscillator.frequency.setValueAtTime(high ? 240 : 120, time);
      oscillator.frequency.exponentialRampToValueAtTime(high ? 80 : 38, time + 0.18);
      gain.gain.setValueAtTime(0, time);
      gain.gain.linearRampToValueAtTime(volume, time + 0.006);
      gain.gain.exponentialRampToValueAtTime(0.0001, time + 0.35);
      oscillator.connect(gain);
      gain.connect(output);
      oscillator.start(time);
      oscillator.stop(time + 0.4);
      oscillator.onended = () => { oscillator.disconnect(); gain.disconnect(); };
    };
    const schedule = () => {
      if (!context || context.state !== 'running' || document.hidden) return;
      // Schedule against the audio clock so background pauses never stack loops.
      if (nextBarTime < context.currentTime) nextBarTime = context.currentTime + 0.1;
      while (nextBarTime < context.currentTime + 1) {
        // A complete arc lasts about 58 seconds; the drop resolves before looping.
        const section = barIndex % 20;
        const building = section >= 4 && section < 8;
        const dropping = section >= 8 && section < 12;
        const releasing = section >= 12 && section < 16;
        const quiet = section >= 16;
        const intensity = building ? (section - 3) / 4 : dropping ? 1 : releasing ? (16 - section) / 4 : 0;
        const bar = bars[(section < 16 ? section : section - 16) % bars.length];
        bar.melody.forEach((pitch, index) => {
          const time = nextBarTime + index * beat;
          note(pitch, time, quiet ? 2 : 1.5, quiet ? 0.024 : 0.035);
          note(pitch + 12, time, 0.65, quiet ? 0.003 : 0.006); // Soft bell overtone.
          if (dropping || releasing) note(pitch - 12, time, beat * 0.85, 0.022 * intensity, 'triangle', 0.04);
        });
        bar.chord.forEach(pitch => note(pitch, nextBarTime, beat * 4, 0.007 + intensity * 0.003, 'sine', 0.3));
        note(bar.chord[0] - 12, nextBarTime, beat * 3.8, quiet ? 0.01 : 0.018, 'triangle', 0.1);
        const steps = quiet ? 4 : building && section >= 6 ? 16 : 8;
        for (let index = 0; index < steps; index++) {
          const pitch = bar.chord[[0, 1, 2, 1][index % 4]] + 12;
          note(pitch, nextBarTime + index * beat * 4 / steps, 0.7, quiet ? 0.006 : 0.009 + intensity * 0.004);
        }
        if (building) {
          const hits = section === 7 ? 8 : 4;
          for (let index = 0; index < hits; index++) {
            drum(nextBarTime + index * beat * 4 / hits, 0.008 + intensity * 0.012, true);
          }
          // A rising bell run announces the impact without changing the theme.
          if (section === 7) [76, 80, 83, 88, 92, 95, 100, 104].forEach((pitch, index) => {
            note(pitch, nextBarTime + index * beat / 2, 0.5, 0.01 + index * 0.001);
          });
        }
        if (dropping) {
          [0, 1.5, 2, 3.5].forEach(offset => {
            drum(nextBarTime + offset * beat, 0.065);
            note(bar.chord[0] - 24, nextBarTime + offset * beat, beat * 0.8, 0.035, 'sine', 0.02);
          });
          [1, 3].forEach(offset => drum(nextBarTime + offset * beat, 0.032, true));
          // The final bar releases the rhythm, leaving the bell echo and harmony.
          if (section === 11) note(81, nextBarTime + 3 * beat, beat * 3, 0.028);
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
