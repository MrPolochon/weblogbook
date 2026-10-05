'use client';

import { useEffect, useRef, useState } from 'react';

const STORAGE_KEY = 'atc-sound-preferences';

export default function AtcSoundSettings() {
  const [enabled, setEnabled] = useState(false);
  const [volume, setVolume] = useState(25);
  const [error, setError] = useState('');
  const contextRef = useRef<AudioContext | null>(null);
  const lastSoundRef = useRef(0);

  useEffect(() => {
    try {
      const preferences = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '{}');
      setEnabled(preferences.enabled === true);
      if (typeof preferences.volume === 'number' && Number.isFinite(preferences.volume)) setVolume(Math.min(100, Math.max(0, preferences.volume)));
    } catch { /* Keep defaults when storage is unavailable. */ }
    return () => { void contextRef.current?.close(); };
  }, []);

  async function play(kind: string, preview = false) {
    if (!preview && (!enabled || Date.now() - lastSoundRef.current < 2000)) return;
    try {
      const context = contextRef.current ?? new AudioContext();
      contextRef.current = context;
      // Background alerts never try to unlock audio without user interaction.
      if (context.state === 'suspended' && !preview) return;
      await context.resume();
      lastSoundRef.current = Date.now();
      const notes = kind === 'closure' ? [660, 520] : [520, 780];
      notes.forEach((frequency, index) => {
        const oscillator = context.createOscillator();
        const gain = context.createGain();
        const start = context.currentTime + index * 0.18;
        oscillator.type = 'sine';
        oscillator.frequency.value = frequency;
        gain.gain.setValueAtTime(0, start);
        gain.gain.linearRampToValueAtTime(volume / 100 * 0.12, start + 0.015);
        gain.gain.linearRampToValueAtTime(0, start + 0.14);
        oscillator.connect(gain);
        gain.connect(context.destination);
        oscillator.onended = () => { oscillator.disconnect(); gain.disconnect(); };
        oscillator.start(start);
        oscillator.stop(start + 0.16);
      });
      setError('');
    } catch { setError('Audio indisponible. Cliquez sur Tester pour réessayer.'); }
  }

  useEffect(() => {
    const onAlert = (event: Event) => { void play((event as CustomEvent<string>).detail); };
    window.addEventListener('atc-sound-alert', onAlert);
    return () => window.removeEventListener('atc-sound-alert', onAlert);
    // Bind alerts to the current preferences.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled, volume]);

  function save(nextEnabled: boolean, nextVolume: number) {
    setEnabled(nextEnabled);
    setVolume(nextVolume);
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify({ enabled: nextEnabled, volume: nextVolume })); } catch { /* Session preferences still work. */ }
    if (nextEnabled && !enabled) void play('new-plan', true);
  }

  return (
    <details className="shrink-0 border-b border-slate-700 bg-slate-950 px-4 py-2 text-sm text-slate-200">
      <summary className="cursor-pointer">Alertes sonores · {enabled ? 'activées' : 'désactivées'}</summary>
      <div className="flex flex-wrap items-center gap-4 py-3">
        <label className="flex items-center gap-2"><input type="checkbox" checked={enabled} onChange={e => save(e.target.checked, volume)} /> Nouveaux plans et demandes de clôture</label>
        <label className="flex items-center gap-2">Volume <input aria-label="Volume des alertes ATC" type="range" min="0" max="100" value={volume} onChange={e => save(enabled, Number(e.target.value))} /> {volume} %</label>
        <button type="button" onClick={() => void play('new-plan', true)} className="rounded border border-slate-600 px-3 py-1">Tester</button>
        {error && <p role="status" className="text-amber-300">{error}</p>}
      </div>
    </details>
  );
}
