'use client';

import { useEffect } from 'react';
import { HALLOWEEN_BEAT, halloweenSection } from '@/lib/halloween-score';

/** Original music-box theme: introduction, build, drop, release and quiet reprise. */
export default function HalloweenAmbience() {
  useEffect(() => {
    let context: AudioContext | null = null;
    let timer: ReturnType<typeof setInterval> | undefined;
    let disposed = false;
    const beat = HALLOWEEN_BEAT;
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
    let organWave: PeriodicWave | null = null;
    let noise: AudioBuffer | null = null;
    let nextBarTime = 0;
    let barIndex = 0;
    let previousVolume = 0;
    let lastSplashBar = -1;
    const scene = document.querySelector<HTMLElement>('.login-shell');
    scene?.style.setProperty('--music-beat', `${beat}s`);
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
    const organ = (pitch: number, time: number, duration: number, volume: number) => {
      if (!context || !output || !organWave) return;
      const oscillator = context.createOscillator();
      const gain = context.createGain();
      oscillator.setPeriodicWave(organWave);
      oscillator.frequency.value = 440 * Math.pow(2, (pitch - 69) / 12);
      gain.gain.setValueAtTime(0, time);
      gain.gain.linearRampToValueAtTime(volume, time + 0.08);
      gain.gain.setValueAtTime(volume * 0.85, time + duration * 0.75);
      gain.gain.exponentialRampToValueAtTime(0.0001, time + duration + 0.4);
      oscillator.connect(gain);
      gain.connect(output);
      oscillator.start(time);
      oscillator.stop(time + duration + 0.45);
      oscillator.onended = () => { oscillator.disconnect(); gain.disconnect(); };
    };
    const percussion = (time: number, volume: number, cymbal = false) => {
      if (!context || !output || !noise) return;
      const source = context.createBufferSource();
      const filter = context.createBiquadFilter();
      const gain = context.createGain();
      source.buffer = noise;
      filter.type = 'highpass';
      filter.frequency.value = cymbal ? 6500 : 1400;
      gain.gain.setValueAtTime(0, time);
      gain.gain.linearRampToValueAtTime(volume, time + 0.008);
      gain.gain.exponentialRampToValueAtTime(0.0001, time + (cymbal ? 0.85 : 0.18));
      source.connect(filter);
      filter.connect(gain);
      gain.connect(output);
      source.start(time);
      source.stop(time + (cymbal ? 0.9 : 0.2));
      source.onended = () => { source.disconnect(); filter.disconnect(); gain.disconnect(); };
    };
    const schedule = () => {
      if (!context || context.state !== 'running' || document.hidden) return;
      // Schedule against the audio clock so background pauses never stack loops.
      if (nextBarTime < context.currentTime) nextBarTime = context.currentTime + 0.1;
      while (nextBarTime < context.currentTime + 1) {
        const { bar: section, build: building, drop: dropping, outro: releasing, quiet, intensity, volume, dropStrength } = halloweenSection(barIndex);
        output!.gain.setValueAtTime(previousVolume, nextBarTime);
        output!.gain.linearRampToValueAtTime(volume, nextBarTime + beat * 4);
        previousVolume = volume;
        const bar = bars[section % bars.length];
        bar.melody.forEach((pitch, index) => {
          const time = nextBarTime + index * beat;
          note(pitch, time, quiet ? 2 : 1.5, quiet ? 0.024 : 0.035);
          note(pitch + 12, time, 0.65, quiet ? 0.003 : 0.006); // Soft bell overtone.
          if (dropping) organ(pitch - 12, time, beat * 0.85, 0.05 * dropStrength);
        });
        bar.chord.forEach(pitch => note(pitch, nextBarTime, beat * 4, 0.007 + intensity * 0.003, 'sine', 0.3));
        note(bar.chord[0] - 12, nextBarTime, beat * 3.8, quiet ? 0.01 : 0.018, 'triangle', 0.1);
        if (dropping) {
          bar.chord.forEach(pitch => organ(pitch - 12, nextBarTime, beat * 3.7, 0.045 * dropStrength));
          bar.chord.forEach(pitch => organ(pitch, nextBarTime, beat * 3.7, 0.028 * dropStrength));
          organ(bar.chord[0] - 24, nextBarTime, beat * 3.7, 0.05 * dropStrength);
        } else if (releasing) {
          bar.chord.forEach(pitch => organ(pitch - 12, nextBarTime, beat * 3.7, 0.018 * intensity));
        }
        const steps = quiet ? 4 : (building && section % 8 >= 4) || dropping ? 16 : 8;
        for (let index = 0; index < steps; index++) {
          const pitch = bar.chord[[0, 1, 2, 1][index % 4]] + 12;
          note(pitch, nextBarTime + index * beat * 4 / steps, 0.7, quiet ? 0.006 : 0.009 + intensity * 0.004);
        }
        if (building) {
          const hits = section % 8 === 7 ? 16 : section % 8 >= 4 ? 8 : 4;
          for (let index = 0; index < hits; index++) {
            drum(nextBarTime + index * beat * 4 / hits, 0.008 + intensity * 0.012, true);
            percussion(nextBarTime + index * beat * 4 / hits, 0.014 + intensity * 0.016);
          }
          // A rising bell run announces the impact without changing the theme.
          if (section % 8 === 7) [76, 80, 83, 88, 92, 95, 100, 104].forEach((pitch, index) => {
            note(pitch, nextBarTime + index * beat / 2, 0.5, 0.01 + index * 0.001);
          });
        }
        if (dropping) {
          [0, 1, 2, 3].forEach(offset => {
            drum(nextBarTime + offset * beat, 0.10 * dropStrength);
            note(bar.chord[0] - 24, nextBarTime + offset * beat, beat * 0.8, 0.045 * dropStrength, 'sine', 0.02);
          });
          [1, 3].forEach(offset => { drum(nextBarTime + offset * beat, 0.05 * dropStrength, true); percussion(nextBarTime + offset * beat, 0.055 * dropStrength); });
          for (let index = 0; index < 8; index++) percussion(nextBarTime + index * beat / 2, 0.012 * dropStrength, true);
          if (section === 19 || section === 51) percussion(nextBarTime, 0.035, true);
          // The final bar releases the rhythm, leaving the bell echo and harmony.
          if (section === 31 || section === 55) note(81, nextBarTime + 3 * beat, beat * 3, 0.028);
        }
        nextBarTime += beat * 4;
        barIndex++;
      }
      // Look-ahead schedules sound early; the scene follows the bar actually playing.
      const soundingBar = Math.max(0, barIndex - (context.currentTime < nextBarTime - beat * 4 ? 2 : 1));
      const phase = halloweenSection(soundingBar);
      if (scene) {
        const name = phase.drop ? 'drop' : phase.build ? 'build' : phase.outro ? 'outro' : phase.quiet ? 'calm' : 'intro';
        if (scene.dataset.musicPhase !== name) {
          scene.dataset.musicPhase = name;
          scene.style.setProperty('--music-offset', `${-(context.currentTime % beat)}s`);
        }
        scene.style.setProperty('--music-energy', String(phase.intensity));
        const floatPeriod = beat * (phase.drop ? 6 : phase.build ? 20 - phase.intensity * 12 : 20);
        scene.style.setProperty('--music-float-period', `${floatPeriod}s`);
        if (soundingBar !== lastSplashBar) {
          lastSplashBar = soundingBar;
          const shape = () => `${Array.from({ length: 4 }, () => `${25 + Math.floor(Math.random() * 50)}%`).join(' ')} / ${Array.from({ length: 4 }, () => `${25 + Math.floor(Math.random() * 50)}%`).join(' ')}`;
          scene.style.setProperty('--splash-shape', shape());
          scene.style.setProperty('--splash-shape-inner', shape());
        }
        scene.dataset.musicPlaying = 'true';
      }
    };
    const start = async () => {
      if (disposed || document.hidden) return;
      try {
        if (!context) {
          context = new AudioContext();
          organWave = context.createPeriodicWave(new Float32Array(9), new Float32Array([0, 1, 0.6, 0.28, 0.4, 0.12, 0.18, 0.08, 0.15]));
          noise = context.createBuffer(1, context.sampleRate, context.sampleRate);
          const samples = noise.getChannelData(0);
          for (let index = 0; index < samples.length; index++) samples[index] = Math.random() * 2 - 1;
          output = context.createGain();
          output.gain.setValueAtTime(0, context.currentTime);
          output.gain.linearRampToValueAtTime(0.38, context.currentTime + 2);
          const limiter = context.createDynamicsCompressor();
          limiter.threshold.value = -8;
          limiter.knee.value = 6;
          limiter.ratio.value = 12;
          limiter.attack.value = 0.005;
          limiter.release.value = 0.25;
          output.connect(limiter);
          limiter.connect(context.destination);
          const echo = context.createDelay(1);
          const echoGain = context.createGain();
          echo.delayTime.value = beat * 0.75;
          echoGain.gain.value = 0.18;
          output.connect(echo);
          echo.connect(echoGain);
          echoGain.connect(limiter);
        }
        await context.resume();
        if (disposed || context.state !== 'running' || timer) return;
        schedule();
        timer = setInterval(schedule, 250);
      } catch { /* A browser policy must never prevent signing in. */ }
    };
    const visibility = () => {
      if (document.hidden) { if (scene) scene.dataset.musicPlaying = 'false'; void context?.suspend(); }
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
      if (scene) { delete scene.dataset.musicPhase; delete scene.dataset.musicPlaying; ['--music-energy', '--music-beat', '--music-offset', '--music-float-period', '--splash-shape', '--splash-shape-inner'].forEach(name => scene.style.removeProperty(name)); }
    };
  }, []);
  return null;
}
