'use client';

import { useEffect, useId, useState } from 'react';
import { ConnectionState } from '@/lib/cloudflare/client';
import { ArrowLeftRight, ChevronDown, Mic, MicOff, Radio, X } from 'lucide-react';
import { useVhfRadio } from '@/hooks/useVhfRadio';
import { isValidVhfFrequency } from '@/lib/vhf-frequencies';
import { isRadioTypingTarget, RadioMicMode } from '@/lib/radio-transmission';

const SHORTCUTS = [{ code: '', label: 'Aucun' }, { code: 'Space', label: 'Espace' },
  { code: 'ControlRight', label: 'Ctrl droit' }, { code: 'KeyV', label: 'V' }];
const MODES: { mode: RadioMicMode; label: string }[] = [
  { mode: 'muted', label: 'Micro coupé' }, { mode: 'ptt', label: 'Push-to-talk' }, { mode: 'open', label: 'Micro ouvert' },
];
type FrequencyEntry = { aeroport: string; position: string; frequency: string };

export default function ComBox({ participantName, station }: {
  participantName: string;
  station?: { aeroport: string; position: string };
}) {
  const radio = useVhfRadio(participantName);
  const id = useId();
  const [expanded, setExpanded] = useState(false);
  const [standby, setStandby] = useState('118.000');
  const [frequencies, setFrequencies] = useState<FrequencyEntry[]>([]);
  const [directoryError, setDirectoryError] = useState('');
  const [shortcut, setShortcut] = useState('');
  const [inputId, setInputId] = useState('');
  const [inputs, setInputs] = useState<MediaDeviceInfo[]>([]);
  const connected = radio.connection === ConnectionState.Connected;
  const busy = radio.connection !== ConnectionState.Disconnected && !connected;
  const stationFrequency = station ? frequencies.find(f => f.aeroport === station.aeroport && f.position === station.position)?.frequency : undefined;
  const selected = station ? stationFrequency || '' : standby.trim().replace(',', '.');

  useEffect(() => {
    try {
      const saved = localStorage.getItem('combox-shortcut');
      if (SHORTCUTS.some(s => s.code === saved)) setShortcut(saved || '');
    } catch { /* Storage is optional. Microphone mode is never persisted. */ }
  }, []);

  useEffect(() => {
    if (!expanded) return;
    const controller = new AbortController();
    setDirectoryError('');
    fetch('/api/vhf/frequencies', { signal: controller.signal })
      .then(async res => { if (!res.ok) throw new Error(); return res.json(); })
      .then(data => { if (Array.isArray(data)) setFrequencies(data); else throw new Error(); })
      .catch(() => { if (!controller.signal.aborted) setDirectoryError('Annuaire indisponible. Réessaie en rouvrant la COM box.'); });
    return () => controller.abort();
  }, [expanded]);

  const { disconnect, press, release, releaseAll } = radio;
  useEffect(() => disconnect, [disconnect, station?.aeroport, station?.position]);

  useEffect(() => {
    if (!shortcut || radio.mode !== 'ptt' || !radio.micReady || !connected) return;
    const down = (event: KeyboardEvent) => {
      if (event.code !== shortcut || event.repeat || event.isComposing || event.altKey || event.metaKey ||
          (event.ctrlKey && shortcut !== 'ControlRight') || isRadioTypingTarget(event.target)) return;
      event.preventDefault();
      event.stopImmediatePropagation();
      press('keyboard');
    };
    const up = (event: KeyboardEvent) => {
      // Release even after focus moves into an input.
      if (event.code === shortcut) { event.preventDefault(); release('keyboard'); }
    };
    window.addEventListener('keydown', down, true);
    window.addEventListener('keyup', up, true);
    return () => {
      window.removeEventListener('keydown', down, true);
      window.removeEventListener('keyup', up, true);
      releaseAll();
    };
  }, [shortcut, radio.mode, radio.micReady, connected, press, release, releaseAll]);

  useEffect(() => {
    if (!navigator.mediaDevices) return;
    const refresh = () => navigator.mediaDevices.enumerateDevices().then(devices => setInputs(devices.filter(d => d.kind === 'audioinput'))).catch(() => {});
    void refresh();
    navigator.mediaDevices.addEventListener('devicechange', refresh);
    return () => navigator.mediaDevices.removeEventListener('devicechange', refresh);
  }, [radio.micReady]);

  function tune() {
    if (!isValidVhfFrequency(selected)) return;
    const previous = radio.frequency;
    void radio.connect(selected);
    if (previous && !station) setStandby(previous);
  }

  const status = radio.transmitting ? 'ÉMISSION' : connected ? 'ÉCOUTE' : busy ? 'CONNEXION…' : 'ÉTEINTE';
  const button = 'min-h-10 rounded-lg border border-slate-600 px-3 py-2 text-sm hover:bg-slate-700 disabled:cursor-not-allowed disabled:opacity-40';
  return (
    <aside aria-label="COM box radio" className="fixed bottom-3 left-3 z-[60] max-w-[calc(100vw-1.5rem)] text-slate-100">
      {!expanded ? (
        <div className={`flex items-center gap-2 rounded-xl border p-2 shadow-xl ${radio.transmitting ? 'border-red-400 bg-red-950' : 'border-slate-600 bg-slate-950'}`}>
          <button type="button" onClick={() => setExpanded(true)} aria-expanded={false} aria-controls={id} className="flex min-h-10 items-center gap-3 px-2 text-sm">
            <Radio size={18} aria-hidden /><span className="font-mono font-bold">COM {connected ? radio.frequency : ''}</span>
            <span className={radio.transmitting ? 'text-red-200' : 'text-emerald-300'}>{status}</span>
          </button>
          {radio.transmitting && <button type="button" onClick={() => void radio.setMicMode('muted')} className={button} aria-label="Couper immédiatement le microphone radio"><MicOff size={18} /></button>}
        </div>
      ) : (
        <section id={id} className="flex max-h-[calc(100dvh-2rem)] w-[370px] max-w-[calc(100vw-1.5rem)] flex-col overflow-y-auto rounded-2xl border border-slate-600 bg-slate-950 p-4 shadow-2xl">
          <header className="mb-3 flex items-center gap-2">
            <Radio className="text-sky-300" size={18} aria-hidden /><h2 className="font-semibold tracking-widest">COM BOX</h2>
            <span className="ml-auto text-xs text-slate-400">VHF · ATC</span>
            <button type="button" aria-label="Réduire la COM box" aria-expanded={true} onClick={() => { releaseAll(); setExpanded(false); }} className="p-2"><ChevronDown size={18} /></button>
          </header>
          <div className={`mb-3 rounded-xl border p-3 ${radio.transmitting ? 'border-red-500 bg-red-950/60' : 'border-emerald-900 bg-emerald-950/30'}`}>
            <div className="flex justify-between text-xs"><span>COM 1 · ACTIVE</span><span role="status">{status}</span></div>
            <div className="my-1 font-mono text-4xl tracking-wider">{connected || busy ? radio.frequency : '---.---'}</div>
            <p className="text-xs text-slate-400">{station ? `${station.aeroport} · ${station.position}` : 'Radio pilotes / contrôleurs'} · {connected ? radio.participants.length + 1 : 0} connecté(s)</p>
          </div>
          <label htmlFor={`${id}-freq`} className="mb-1 text-xs text-slate-400">{station ? 'Fréquence du poste' : 'Fréquence en attente'}</label>
          <div className="mb-2 flex gap-2">
            <input id={`${id}-freq`} type="text" inputMode="decimal" value={station ? stationFrequency || '' : standby} disabled={!!station || busy} maxLength={7}
              placeholder="118.000" onChange={e => setStandby(e.target.value)} className="min-w-0 flex-1 rounded-lg border border-slate-600 bg-slate-900 px-3 py-2 font-mono text-lg" />
            <button type="button" className={button} disabled={busy || !isValidVhfFrequency(selected) || (connected && selected === radio.frequency)} onClick={tune} aria-label={connected ? 'Passer sur la fréquence en attente' : 'Allumer la radio'}>
              {connected ? <ArrowLeftRight size={20} /> : 'Connecter'}
            </button>
            {(connected || busy) && <button type="button" onClick={disconnect} className={button} aria-label="Éteindre la radio"><X size={18} /></button>}
          </div>
          {!station && <select aria-label="Annuaire des fréquences" value="" onChange={e => setStandby(e.target.value)} className="mb-3 w-full rounded-lg border border-slate-700 bg-slate-900 p-2 text-sm">
            <option value="">Choisir un terrain / poste…</option>
            {frequencies.map(f => <option key={`${f.aeroport}-${f.position}`} value={f.frequency}>{f.aeroport} · {f.position} — {f.frequency}</option>)}
          </select>}
          {station && !stationFrequency && <p className="mb-2 text-xs text-amber-300">Aucune fréquence chargée pour ce poste.</p>}
          {directoryError && <p className="mb-2 text-xs text-amber-300">{directoryError}</p>}
          <div role="group" aria-label="Mode du microphone radio" className="mb-3 grid grid-cols-3 gap-1">
            {MODES.map(item => <button key={item.mode} type="button" aria-pressed={radio.mode === item.mode}
              disabled={item.mode !== 'muted' && (!connected || radio.preparingMic)} onClick={() => void radio.setMicMode(item.mode, inputId)}
              className={`min-h-12 rounded-lg border px-1 py-2 text-xs disabled:opacity-40 ${radio.mode === item.mode ? 'border-sky-400 bg-sky-950 text-sky-100' : 'border-slate-700 hover:bg-slate-800'}`}>{item.label}</button>)}
          </div>
          {radio.mode === 'ptt' && <button type="button" disabled={!connected || !radio.micReady} aria-pressed={radio.transmitting}
            onPointerDown={e => { if (e.button !== 0) return; e.preventDefault(); e.currentTarget.setPointerCapture(e.pointerId); press(`pointer-${e.pointerId}`); }}
            onPointerUp={e => release(`pointer-${e.pointerId}`)} onPointerCancel={e => release(`pointer-${e.pointerId}`)} onLostPointerCapture={e => release(`pointer-${e.pointerId}`)}
            onKeyDown={e => { if ((e.key === ' ' || e.key === 'Enter') && !e.repeat) { e.preventDefault(); press('button'); } }}
            onKeyUp={e => { if (e.key === ' ' || e.key === 'Enter') { e.preventDefault(); release('button'); } }} onBlur={() => release('button')}
            onContextMenu={e => e.preventDefault()} className={`mb-3 flex min-h-16 touch-none select-none items-center justify-center gap-2 rounded-xl border-2 font-semibold ${radio.transmitting ? 'border-red-400 bg-red-700' : 'border-sky-600 bg-sky-950 hover:bg-sky-900'}`}>
            <Mic size={20} />{radio.transmitting ? 'Émission sur la fréquence' : 'Maintenir pour parler'}
          </button>}
          {radio.mode === 'open' && <p className="mb-3 rounded-lg bg-red-950 p-2 text-xs text-red-200">Micro ouvert : toutes tes paroles partent vers la fréquence, y compris celles destinées au cockpit Discord.</p>}
          {radio.preparingMic && <p role="status" className="mb-2 text-xs text-sky-300">Activation du microphone…</p>}
          <label className="mb-3 flex items-center gap-3 text-xs">Volume radio
            <input aria-label="Volume radio" className="min-w-0 flex-1" type="range" min="0" max="1" step="0.05" value={radio.volume} onChange={e => radio.setVolume(Number(e.target.value))} />
            <span>{Math.round(radio.volume * 100)} %</span>
          </label>
          {radio.audioBlocked && <button type="button" className={`${button} mb-2 border-amber-500`} onClick={() => void radio.resumeAudio()}>Activer l’écoute audio</button>}
          {radio.error && <p role="alert" className="mb-2 text-sm text-red-300">{radio.error}</p>}
          {connected && <div className="mb-3 max-h-24 overflow-y-auto text-xs text-slate-300" aria-label="Participants sur la fréquence">
            {!radio.participants.length ? <p>Aucun autre participant sur cette fréquence.</p> : radio.participants.map(p => <p key={p.id} className={p.speaking ? 'text-emerald-300' : ''}>{p.speaking ? '● ' : '○ '}{p.name}</p>)}
          </div>}
          <details className="border-t border-slate-700 pt-2 text-xs">
            <summary className="cursor-pointer py-1 text-slate-300">Microphone et raccourci facultatif</summary>
            <label className="mt-2 block">Microphone <select value={inputId} disabled={radio.mode !== 'muted' || radio.preparingMic} onChange={e => setInputId(e.target.value)} className="mt-1 w-full rounded border border-slate-600 bg-slate-900 p-2">
              <option value="">Microphone par défaut</option>{inputs.filter(d => d.deviceId).map((d, i) => <option key={d.deviceId} value={d.deviceId}>{d.label || `Microphone ${i + 1}`}</option>)}
            </select></label>
            <p className="mt-1 text-slate-400">Coupe le micro pour changer de périphérique.</p>
            <label className="mt-2 block">Touche PTT <select value={shortcut} onChange={e => { releaseAll(); setShortcut(e.target.value); try { localStorage.setItem('combox-shortcut', e.target.value); } catch {} }} className="ml-2 rounded border border-slate-600 bg-slate-900 p-2">
              {SHORTCUTS.map(s => <option key={s.code} value={s.code}>{s.label}</option>)}
            </select></label>
            <p className="mt-2 text-slate-400">La touche fonctionne quand le site a le focus, hors champs de saisie. Elle ne fonctionne pas depuis Roblox. Le micro ouvert reste actif en arrière-plan.</p>
          </details>
          <p className="mt-3 text-xs text-slate-500">Discord reste ton cockpit. Le PTT n’ouvre que la radio du site. Utilise un casque pour éviter de retransmettre le son des haut-parleurs.</p>
        </section>
      )}
    </aside>
  );
}
