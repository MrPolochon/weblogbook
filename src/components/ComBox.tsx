'use client';

import { useEffect, useId, useState } from 'react';
import { radioDesktop } from '@/lib/radio-desktop';
import { ConnectionState } from '@/lib/cloudflare/client';
import { ArrowLeftRight, ChevronDown, Mic, MicOff, Radio } from 'lucide-react';
import { useVhfRadio } from '@/hooks/useVhfRadio';
import { isValidVhfFrequency, stepFrequency } from '@/lib/vhf-frequencies';
import { isRadioTypingTarget, RadioMicMode } from '@/lib/radio-transmission';

const SHORTCUTS = [{ code: '', label: 'Aucun' }, { code: 'Space', label: 'Espace' },
  { code: 'ControlRight', label: 'Ctrl droit' }, { code: 'KeyV', label: 'V' }];
const MODES: { mode: RadioMicMode; label: string }[] = [
  { mode: 'muted', label: 'Micro coupé' }, { mode: 'ptt', label: 'Push-to-talk' }, { mode: 'open', label: 'Micro ouvert' },
];


export default function ComBox({ participantName, station, placement = 'floating', observer = false }: {
  participantName: string;
  observer?: boolean;
  station?: { aeroport: string; position: string };
  placement?: 'floating' | 'inline';
}) {
  const radio = useVhfRadio(participantName, observer);
  const id = useId();
  const [expanded, setExpanded] = useState(placement === 'inline');
  const [standby, setStandby] = useState('118.000');
  const [desktop, setDesktop] = useState(false);
  const [desktopError, setDesktopError] = useState('');
  const [shortcut, setShortcut] = useState('');
  const [inputId, setInputId] = useState('');
  const [inputs, setInputs] = useState<MediaDeviceInfo[]>([]);
  const connected = radio.connection === ConnectionState.Connected;
  const busy = radio.connection !== ConnectionState.Disconnected && !connected;
  const selected = standby.trim().replace(',', '.');
  const receiveOnly = observer || radio.receiveOnly;

  useEffect(() => {
    setDesktop(Boolean(radioDesktop()));
    try {
      const saved = localStorage.getItem('combox-shortcut');
      if (SHORTCUTS.some(s => s.code === saved)) setShortcut(saved || '');
    } catch { /* Storage is optional. Microphone mode is never persisted. */ }
  }, []);

  const { disconnect, press, release, releaseAll } = radio;
  useEffect(() => disconnect, [disconnect, station?.aeroport, station?.position]);

  useEffect(() => {
    if (desktop || !shortcut || radio.mode !== 'ptt' || !radio.micReady || !connected) return;
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
  }, [desktop, shortcut, radio.mode, radio.micReady, connected, press, release, releaseAll]);

  useEffect(() => {
    const api = radioDesktop();
    if (!api) return;
    let stopped = false;
    let watchdog: ReturnType<typeof setTimeout> | undefined;
    const enabled = !receiveOnly && connected && radio.mode === 'ptt' && radio.micReady && Boolean(shortcut);
    const unsubscribe = api.onPtt(down => {
      clearTimeout(watchdog);
      if (!enabled || stopped || !down) { release('desktop'); return; }
      if (document.hasFocus() && isRadioTypingTarget(document.activeElement)) { release('desktop'); return; }
      press('desktop');
      watchdog = setTimeout(() => release('desktop'), 750);
    });
    setDesktopError('');
    void api.configure(enabled ? shortcut : '').then(ok => {
      if (!stopped && !ok && enabled) setDesktopError('PTT global indisponible. Redémarre l’application Windows.');
    }).catch(() => { if (!stopped) setDesktopError('PTT global indisponible.'); });
    return () => { stopped = true; clearTimeout(watchdog); unsubscribe(); release('desktop'); void api.configure('').catch(() => {}); };
  }, [receiveOnly, connected, radio.mode, radio.micReady, shortcut, press, release]);

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
    if (previous) setStandby(previous);
  }

  const status = radio.transmitting ? 'ÉMISSION' : connected ? receiveOnly ? 'OBS · ÉCOUTE' : 'ÉCOUTE' : busy ? 'CONNEXION…' : 'ÉTEINTE';
  const button = 'min-h-10 rounded-lg border border-slate-600 px-3 py-2 text-sm hover:bg-slate-700 disabled:cursor-not-allowed disabled:opacity-40';
  return (
    <aside aria-label="COM box radio" className={placement === 'inline' ? 'w-full min-w-0 text-slate-100' : 'fixed bottom-3 left-3 z-[60] max-w-[calc(100vw-1.5rem)] text-slate-100'}>
      {!expanded ? (
        <div className={`flex items-center gap-2 rounded-xl border p-2 shadow-xl ${radio.transmitting ? 'border-red-400 bg-red-950' : 'border-slate-600 bg-slate-950'}`}>
          <button type="button" onClick={() => setExpanded(true)} aria-expanded={false} aria-controls={id} className="flex min-h-10 items-center gap-3 px-2 text-sm">
            <Radio size={18} aria-hidden /><span className="font-mono font-bold">COM {connected ? radio.frequency : ''}</span>
            <span className={radio.transmitting ? 'text-red-200' : 'text-emerald-300'}>{status}</span>
          </button>
          {radio.transmitting && <button type="button" onClick={() => void radio.setMicMode('muted')} className={button} aria-label="Couper immédiatement le microphone radio"><MicOff size={18} /></button>}
        </div>
      ) : (
        <section id={id} className={`flex flex-col rounded-2xl border border-slate-600 bg-slate-950 p-4 shadow-2xl ${placement === 'inline' ? 'w-full min-w-0' : 'max-h-[calc(100dvh-2rem)] w-[370px] max-w-[calc(100vw-1.5rem)] overflow-y-auto'}`}>
          <header className="mb-3 flex items-center gap-2">
            <Radio className="text-sky-300" size={18} aria-hidden /><h2 className="font-semibold tracking-widest">COM BOX</h2>
            <span className="ml-auto text-xs text-slate-400">VHF · ATC</span>
            <button type="button" aria-label="Réduire la COM box" aria-expanded={true} onClick={() => { releaseAll(); setExpanded(false); }} className="p-2"><ChevronDown size={18} /></button>
          </header>
          <div className={`mb-3 rounded-xl border p-3 ${radio.transmitting ? 'border-red-500 bg-red-950/60' : 'border-emerald-900 bg-emerald-950/30'}`}>
            <div className="flex justify-between text-xs"><span>COM 1 · ACTIVE</span><span role="status">{status}</span></div>
            <div className="my-1 font-mono text-4xl tracking-wider">{radio.powered ? radio.frequency : '---.---'}</div>
            <p className="text-xs text-slate-400">{station ? `${station.aeroport} · ${station.position}` : 'Radio pilotes / contrôleurs'} · {connected ? radio.participants.length + 1 : 0} connecté(s)</p>
          </div>
          <label htmlFor={`${id}-freq`} className="mb-1 text-xs text-slate-400">Fréquence en attente</label>
          <div className="mb-2 flex gap-2">
            <input id={`${id}-freq`} type="text" inputMode="decimal" value={standby} maxLength={7}
              placeholder="118.000" onChange={e => setStandby(e.target.value)} className="min-w-0 flex-1 rounded-lg border border-slate-600 bg-slate-900 px-3 py-2 font-mono text-lg" />
            <button type="button" className={button} disabled={!isValidVhfFrequency(selected) || (radio.powered && selected === radio.frequency)} onClick={tune} aria-label="Basculer la présélection en fréquence active et connecter">
              <ArrowLeftRight size={20} />
            </button>
            {radio.powered && <button type="button" onClick={disconnect} className={button} aria-label="Éteindre la radio et arrêter les reconnexions">OFF</button>}
          </div>
          <div className="mb-3 grid grid-cols-2 gap-3" aria-label="Réglage de la fréquence">
            {(['mhz', 'decimal'] as const).map(part => <div key={part} className="flex items-center justify-between gap-2 rounded-xl border border-slate-700 bg-slate-900 p-2">
              <div className="text-xs text-slate-400">{part === 'mhz' ? 'MHz' : 'Décimales'}<div className="font-mono text-lg text-sky-200">{isValidVhfFrequency(selected) ? (part === 'mhz' ? selected.slice(0, 3) : selected.slice(4)) : '---'}</div></div>
              <div role="spinbutton" tabIndex={busy ? -1 : 0} aria-label={part === 'mhz' ? 'Molette MHz' : 'Molette décimales'}
                aria-valuemin={0} aria-valuemax={999} aria-valuenow={isValidVhfFrequency(selected) ? Number(part === 'mhz' ? selected.slice(0, 3) : selected.slice(4)) : 0} aria-disabled={busy}
                onWheel={e => { if (busy || document.activeElement !== e.currentTarget || !e.deltaY) return; setStandby(value => stepFrequency(value, part, e.deltaY < 0 ? 1 : -1)); }}
                onKeyDown={e => { if (busy || !['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.key)) return; e.preventDefault(); setStandby(value => stepFrequency(value, part, ['ArrowUp', 'ArrowRight'].includes(e.key) ? 1 : -1)); }}
                className="flex h-14 w-14 flex-col items-center justify-center rounded-full border-4 border-double border-slate-500 bg-gradient-to-br from-slate-500 to-slate-900 shadow-inner outline-none focus:ring-2 focus:ring-sky-400">
                <button type="button" disabled={busy} aria-label={part === 'mhz' ? 'Augmenter les MHz' : 'Augmenter les décimales'} onClick={() => setStandby(value => stepFrequency(value, part, 1))} className="w-full rounded-t-full text-sm leading-5 hover:text-sky-300">+</button>
                <button type="button" disabled={busy} aria-label={part === 'mhz' ? 'Diminuer les MHz' : 'Diminuer les décimales'} onClick={() => setStandby(value => stepFrequency(value, part, -1))} className="w-full rounded-b-full text-sm leading-5 hover:text-sky-300">−</button>
              </div>
            </div>)}
          </div>
          <p className="mb-3 text-xs text-slate-400">Toutes les fréquences de 000.000 à 999.999. Clique sur une molette puis utilise la roue ou les flèches.</p>
          {receiveOnly && <p role="status" className="mb-3 rounded-lg bg-sky-950 p-2 text-xs text-sky-200">OBS : écoute uniquement. Un plan de vol actif est nécessaire pour émettre depuis l’espace pilote.</p>}
          <div role="group" aria-label="Mode du microphone radio" className="mb-3 grid grid-cols-3 gap-1">
            {MODES.map(item => <button key={item.mode} type="button" aria-pressed={radio.mode === item.mode}
              disabled={item.mode !== 'muted' && (receiveOnly || !connected || radio.preparingMic)} onClick={() => void radio.setMicMode(item.mode, inputId)}
              className={`min-h-12 rounded-lg border px-1 py-2 text-xs disabled:opacity-40 ${radio.mode === item.mode ? 'border-sky-400 bg-sky-950 text-sky-100' : 'border-slate-700 hover:bg-slate-800'}`}>{item.label}</button>)}
          </div>
          {!receiveOnly && radio.mode === 'ptt' && <button type="button" disabled={!connected || !radio.micReady} aria-pressed={radio.transmitting}
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
          <label className="mb-3 flex items-center gap-2 text-xs"><input type="checkbox" checked={radio.effects} onChange={e => radio.setEffects(e.target.checked)} />Grésillement radio</label>
          {radio.audioBlocked && <button type="button" className={`${button} mb-2 border-amber-500`} onClick={() => void radio.resumeAudio()}>Activer l’écoute audio</button>}
          {radio.error && <p role="alert" className="mb-2 text-sm text-red-300">{radio.error}</p>}
          {connected && <div className="mb-3 max-h-24 overflow-y-auto text-xs text-slate-300" aria-label="Participants sur la fréquence">
            {!radio.participants.length ? <p>Aucun autre participant sur cette fréquence.</p> : radio.participants.map(p => <p key={p.id} className={p.speaking ? 'text-emerald-300' : ''}>{p.speaking ? '● ' : '○ '}{p.name}</p>)}
          </div>}
          {!receiveOnly && <details className="border-t border-slate-700 pt-2 text-xs">
            <summary className="cursor-pointer py-1 text-slate-300">Microphone et raccourci facultatif</summary>
            <label className="mt-2 block">Microphone <select value={inputId} disabled={radio.mode !== 'muted' || radio.preparingMic} onChange={e => setInputId(e.target.value)} className="mt-1 w-full rounded border border-slate-600 bg-slate-900 p-2">
              <option value="">Microphone par défaut</option>{inputs.filter(d => d.deviceId).map((d, i) => <option key={d.deviceId} value={d.deviceId}>{d.label || `Microphone ${i + 1}`}</option>)}
            </select></label>
            <p className="mt-1 text-slate-400">Coupe le micro pour changer de périphérique.</p>
            <label className="mt-2 block">Touche PTT <select value={shortcut} onChange={e => { releaseAll(); setShortcut(e.target.value); try { localStorage.setItem('combox-shortcut', e.target.value); } catch {} }} className="ml-2 rounded border border-slate-600 bg-slate-900 p-2">
              {SHORTCUTS.map(s => <option key={s.code} value={s.code}>{s.label}</option>)}
            </select></label>
            <p className="mt-2 text-slate-400">{desktop ? 'PTT global Windows : garde cette fenêtre ouverte, même réduite, puis utilise la touche dans Roblox. Relâche-la pour couper la radio.' : 'Dans le navigateur, la touche fonctionne lorsque le site a le focus. Pour parler depuis Roblox, ouvre le site avec l’application Windows. Le micro ouvert reste actif en arrière-plan.'}</p>
            {desktopError && <p role="alert" className="mt-2 text-amber-300">{desktopError}</p>}
            {!desktop && <a className="mt-2 inline-block text-sky-300 underline" href="https://github.com/MrPolochon/weblogbook/releases/tag/v1.5.1" target="_blank" rel="noreferrer">Application Windows · PTT global</a>}
          </details>}
          <p className="mt-3 text-xs text-slate-500">Discord reste ton cockpit. Le PTT n’ouvre que la radio du site. Utilise un casque pour éviter de retransmettre le son des haut-parleurs.</p>
        </section>
      )}
    </aside>
  );
}
