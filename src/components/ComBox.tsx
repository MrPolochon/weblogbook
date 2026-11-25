'use client';

import { useCallback, useEffect, useId, useLayoutEffect, useRef, useState } from 'react';
import type { CSSProperties } from 'react';
import { createPortal } from 'react-dom';
import { usePathname } from 'next/navigation';
import FrequencyKnob from '@/components/FrequencyKnob';
import DesktopUpdateStatus from '@/components/DesktopUpdateStatus';
import { radioDesktop } from '@/lib/radio-desktop';
import { ConnectionState } from '@/lib/cloudflare/client';
import { ArrowLeftRight, ChevronDown, Mic, MicOff, Radio, X } from 'lucide-react';
import { useVhfRadio } from '@/hooks/useVhfRadio';
import { isValidVhfFrequency, stepFrequency } from '@/lib/vhf-frequencies';
import { isRadioTypingTarget, RadioMicMode } from '@/lib/radio-transmission';
import { isPttKeyCode, radioShortcutLabel } from '@/lib/radio-shortcut';

const MODES: { mode: RadioMicMode; label: string }[] = [
  { mode: 'muted', label: 'Micro coupé' }, { mode: 'ptt', label: 'Push-to-talk' }, { mode: 'open', label: 'Micro ouvert' },
];


export default function ComBox({ participantName, station, placement = 'floating', observer = false, isDark = true, defaultFrequency }: {
  participantName: string;
  observer?: boolean;
  station?: { aeroport: string; position: string };
  placement?: 'floating' | 'inline' | 'toolbar';
  isDark?: boolean;
  defaultFrequency?: string;
}) {
  const radio = useVhfRadio(participantName, observer);
  const id = useId();
  const [expanded, setExpanded] = useState(placement === 'inline');
  const [standby, setStandby] = useState('118.000');
  const [desktop, setDesktop] = useState(false);
  const [desktopError, setDesktopError] = useState('');
  const [shortcut, setShortcut] = useState('');
  const [shortcutLabel, setShortcutLabel] = useState('');
  const [capturingShortcut, setCapturingShortcut] = useState(false);
  const [shortcutError, setShortcutError] = useState('');
  const pendingShortcut = useRef<{code: string; label: string} | null>(null);
  const [inputId, setInputId] = useState('');
  const [inputs, setInputs] = useState<MediaDeviceInfo[]>([]);
  const toolbar = placement === 'toolbar';
  const pathname = usePathname();
  const toolbarRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLElement>(null);
  const [panelStyle, setPanelStyle] = useState<CSSProperties>({ visibility: 'hidden' });
  const autoTuned = useRef(false);
  const manuallyTuned = useRef(false);
  const connected = radio.connection === ConnectionState.Connected;
  const busy = radio.connection !== ConnectionState.Disconnected && !connected;
  const selected = standby.trim().replace(',', '.');
  const receiveOnly = observer || radio.receiveOnly;

  useEffect(() => {
    setDesktop(Boolean(radioDesktop()));
    try {
      const saved = localStorage.getItem('combox-shortcut');
      if (saved && isPttKeyCode(saved)) {
        setShortcut(saved);
        setShortcutLabel(localStorage.getItem('combox-shortcut-label') || radioShortcutLabel(saved));
      }
    } catch { /* Storage is optional. Microphone mode is never persisted. */ }
  }, []);

  const { connect, disconnect, press, release, releaseAll } = radio;
  useEffect(() => () => { autoTuned.current = false; disconnect(); }, [disconnect, station?.aeroport, station?.position]);

  useEffect(() => {
    if (autoTuned.current || manuallyTuned.current || !defaultFrequency || !isValidVhfFrequency(defaultFrequency)) return;
    autoTuned.current = true;
    setStandby(defaultFrequency);
    // Reception only: choosing PTT or open mic remains an explicit user action.
    void connect(defaultFrequency);
  }, [defaultFrequency, connect]);

  const closePanel = useCallback((restoreFocus = false) => {
    // Hiding the controls must not disconnect the receiver or disable global PTT.
    releaseAll();
    setCapturingShortcut(false);
    pendingShortcut.current = null;
    setExpanded(false);
    if (restoreFocus) triggerRef.current?.focus({ preventScroll: true });
  }, [releaseAll]);

  useEffect(() => {
    if (toolbar) closePanel();
  }, [toolbar, pathname, station?.aeroport, station?.position, closePanel]);

  useLayoutEffect(() => {
    if (!toolbar || !expanded) return;
    function positionPanel() {
      if (!triggerRef.current) return;
      const rect = triggerRef.current.getBoundingClientRect();
      const viewport = window.visualViewport;
      const left = viewport?.offsetLeft ?? 0;
      const top = viewport?.offsetTop ?? 0;
      const width = viewport?.width ?? window.innerWidth;
      const height = viewport?.height ?? window.innerHeight;
      const panelWidth = Math.min(344, width - 16);
      const panelTop = Math.max(top + 8, Math.min(rect.bottom + 8, top + height - 96));
      setPanelStyle({
        position: 'fixed', width: panelWidth,
        left: Math.max(left + 8, Math.min(rect.left, left + width - panelWidth - 8)),
        top: panelTop, maxHeight: Math.min(640, top + height - panelTop - 8),
      });
    }
    positionPanel();
    const focusFrame = requestAnimationFrame(() => panelRef.current?.focus({ preventScroll: true }));
    const observer = new ResizeObserver(positionPanel);
    if (toolbarRef.current) observer.observe(toolbarRef.current);
    window.addEventListener('resize', positionPanel);
    window.addEventListener('scroll', positionPanel, true);
    window.visualViewport?.addEventListener('resize', positionPanel);
    window.visualViewport?.addEventListener('scroll', positionPanel);
    return () => {
      cancelAnimationFrame(focusFrame);
      observer.disconnect();
      window.removeEventListener('resize', positionPanel);
      window.removeEventListener('scroll', positionPanel, true);
      window.visualViewport?.removeEventListener('resize', positionPanel);
      window.visualViewport?.removeEventListener('scroll', positionPanel);
    };
  }, [toolbar, expanded]);

  useEffect(() => {
    if (!toolbar || !expanded) return;
    const outside = (event: Event) => {
      if (!(event.target instanceof Node)) return;
      if (toolbarRef.current?.contains(event.target) || panelRef.current?.contains(event.target)) return;
      // Do not consume the event: a flight or another toolbar control still opens on this click.
      closePanel();
    };
    const escape = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      event.preventDefault();
      event.stopPropagation();
      closePanel(true);
    };
    document.addEventListener('pointerdown', outside, true);
    document.addEventListener('focusin', outside);
    document.addEventListener('keydown', escape);
    return () => {
      document.removeEventListener('pointerdown', outside, true);
      document.removeEventListener('focusin', outside);
      document.removeEventListener('keydown', escape);
    };
  }, [toolbar, expanded, closePanel]);

  useEffect(() => {
    if (!capturingShortcut) return;
    const down = (event: KeyboardEvent) => {
      event.preventDefault();
      event.stopImmediatePropagation();
      if (event.repeat || event.isComposing) return;
      if (event.code === 'Escape') { pendingShortcut.current = null; setCapturingShortcut(false); return; }
      if (!isPttKeyCode(event.code)) { setShortcutError('Cette touche est réservée au système. Choisis une autre touche.'); return; }
      pendingShortcut.current = { code: event.code, label: radioShortcutLabel(event.code, event.key) };
      setShortcutError('');
    };
    const up = (event: KeyboardEvent) => {
      event.preventDefault();
      event.stopImmediatePropagation();
      const chosen = pendingShortcut.current;
      if (!chosen || chosen.code !== event.code) return;
      // Arm only after release: recording a binding must never transmit.
      releaseAll();
      setShortcut(chosen.code); setShortcutLabel(chosen.label);
      try { localStorage.setItem('combox-shortcut', chosen.code); localStorage.setItem('combox-shortcut-label', chosen.label); } catch {}
      pendingShortcut.current = null;
      setCapturingShortcut(false);
    };
    const cancel = () => { pendingShortcut.current = null; setCapturingShortcut(false); };
    window.addEventListener('keydown', down, true);
    window.addEventListener('keyup', up, true);
    window.addEventListener('blur', cancel);
    return () => {
      window.removeEventListener('keydown', down, true); window.removeEventListener('keyup', up, true);
      window.removeEventListener('blur', cancel);
    };
  }, [capturingShortcut, releaseAll]);

  useEffect(() => {
    if (desktop || capturingShortcut || !shortcut || radio.mode !== 'ptt' || !radio.micReady || !connected) return;
    const down = (event: KeyboardEvent) => {
      if (event.code !== shortcut || event.repeat || event.isComposing || event.metaKey ||
          (event.altKey && !shortcut.startsWith('Alt')) || (event.ctrlKey && !shortcut.startsWith('Control') && shortcut !== 'AltRight') || isRadioTypingTarget(event.target)) return;
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
  }, [desktop, shortcut, capturingShortcut, radio.mode, radio.micReady, connected, press, release, releaseAll]);

  useEffect(() => {
    const api = radioDesktop();
    if (!api) return;
    let stopped = false;
    let watchdog: ReturnType<typeof setTimeout> | undefined;
    const enabled = !capturingShortcut && !receiveOnly && connected && radio.mode === 'ptt' && radio.micReady && Boolean(shortcut);
    const unsubscribe = api.onPtt(down => {
      clearTimeout(watchdog);
      if (!enabled || stopped || !down) { release('desktop'); return; }
      if (document.hasFocus() && isRadioTypingTarget(document.activeElement)) { release('desktop'); return; }
      press('desktop');
      watchdog = setTimeout(() => release('desktop'), 750);
    });
    setDesktopError('');
    void api.configure(enabled ? shortcut : '').then(ok => {
      if (!stopped && !ok && enabled) setDesktopError('Cette touche nécessite la dernière version Windows. Mets l’application à jour puis redémarre-la.');
    }).catch(() => { if (!stopped) setDesktopError('PTT global indisponible.'); });
    return () => { stopped = true; clearTimeout(watchdog); unsubscribe(); release('desktop'); void api.configure('').catch(() => {}); };
  }, [receiveOnly, connected, radio.mode, radio.micReady, shortcut, capturingShortcut, press, release]);

  useEffect(() => {
    if (!navigator.mediaDevices) return;
    const refresh = () => navigator.mediaDevices.enumerateDevices().then(devices => setInputs(devices.filter(d => d.kind === 'audioinput'))).catch(() => {});
    void refresh();
    navigator.mediaDevices.addEventListener('devicechange', refresh);
    return () => navigator.mediaDevices.removeEventListener('devicechange', refresh);
  }, [radio.micReady]);

  function tune() {
    if (!isValidVhfFrequency(selected)) return;
    manuallyTuned.current = true;
    const previous = radio.frequency;
    void radio.connect(selected);
    if (previous) setStandby(previous);
  }

  const status = radio.transmitting ? 'ÉMISSION' : connected ? receiveOnly ? 'OBS · ÉCOUTE' : 'ÉCOUTE' : busy ? 'CONNEXION…' : 'ÉTEINTE';
  const button = 'min-h-10 rounded-lg border border-slate-600 px-3 py-2 text-sm hover:bg-slate-700 disabled:cursor-not-allowed disabled:opacity-40';
  const panel = (
        <section id={id} ref={panelRef} role={toolbar ? 'dialog' : undefined} aria-labelledby={`${id}-title`} tabIndex={toolbar ? -1 : undefined}
          style={toolbar ? panelStyle : undefined}
          className={`flex flex-col rounded-2xl border border-slate-600 bg-slate-950 text-slate-100 shadow-2xl ${toolbar ? 'z-[80] overflow-y-auto overscroll-contain p-3 outline-none' : placement === 'inline' ? 'w-full min-w-0 p-4' : 'max-h-[calc(100dvh-2rem)] w-[370px] max-w-[calc(100vw-1.5rem)] overflow-y-auto p-4'}`}>
          <header className="mb-3 flex items-center gap-2">
            <Radio className="text-sky-300" size={18} aria-hidden /><h2 id={`${id}-title`} className="font-semibold tracking-widest">COM BOX</h2>
            <span className="ml-auto text-xs text-slate-400">VHF · {station?.position === 'RAMP' ? 'RAMP' : station?.position === 'AFIS' ? 'AFIS' : 'ATC'}</span>
            <button type="button" aria-label={toolbar ? 'Fermer la COM box' : 'Réduire la COM box'} aria-expanded={true} onClick={() => closePanel(toolbar)} className="rounded-lg p-2 hover:bg-slate-800">{toolbar ? <X size={18} /> : <ChevronDown size={18} />}</button>
          </header>
          <div className={`mb-3 rounded-xl border p-3 ${radio.transmitting ? 'border-red-500 bg-red-950/60' : 'border-emerald-900 bg-emerald-950/30'}`}>
            <div className="flex justify-between text-xs"><span>COM 1 · ACTIVE</span><span role="status">{status}</span></div>
            <div className={`my-1 font-mono tracking-wider ${toolbar ? 'text-3xl' : 'text-4xl'}`}>{radio.powered ? radio.frequency : '---.---'}</div>
            <p className="text-xs text-slate-400">{station ? `${station.aeroport} · ${station.position}` : 'Radio pilotes / contrôleurs'} · {connected ? radio.participants.length + 1 : 0} connecté(s)</p>
          </div>
          {toolbar && <div className="mb-3 flex items-center justify-between gap-2 text-xs text-slate-400">
            <span>{defaultFrequency ? `Fréquence du poste : ${defaultFrequency}` : 'Fréquence du poste non publiée'}</span>
            {defaultFrequency && <button type="button" className="rounded border border-slate-700 px-2 py-1 text-sky-200 hover:bg-slate-800"
              disabled={radio.powered && radio.frequency === defaultFrequency} onClick={() => { manuallyTuned.current = true; void connect(defaultFrequency); }}>Revenir</button>}
          </div>}
          {toolbar && <a href="/frequences-radio" className="mb-3 text-xs text-sky-300 underline">Fiche des fréquences ATC / AFIS / RAMP</a>}
          <label htmlFor={`${id}-freq`} className="mb-1 text-xs text-slate-400">Fréquence en attente</label>
          <div className="mb-2 flex gap-2">
            <input id={`${id}-freq`} type="text" inputMode="decimal" value={standby} maxLength={7} aria-invalid={!isValidVhfFrequency(selected)} aria-describedby={`${id}-freq-help`}
              placeholder="118.000" onChange={e => setStandby(e.target.value)} className="min-w-0 flex-1 rounded-lg border border-slate-600 bg-slate-900 px-3 py-2 font-mono text-lg" />
            <button type="button" className={button} disabled={!isValidVhfFrequency(selected) || (radio.powered && selected === radio.frequency)} onClick={tune} aria-label="Basculer la présélection en fréquence active et connecter">
              <ArrowLeftRight size={20} />
            </button>
            {radio.powered && <button type="button" onClick={() => { manuallyTuned.current = true; disconnect(); }} className={button} aria-label="Éteindre la radio et arrêter les reconnexions">OFF</button>}
          </div>
          <div className="mb-3 grid grid-cols-2 gap-3" aria-label="Réglage de la fréquence">
            {(['mhz', 'decimal'] as const).map(part => <div key={part} className="flex items-center justify-between gap-2 rounded-xl border border-slate-700 bg-slate-900 p-2">
              <div className="text-xs text-slate-400">{part === 'mhz' ? 'MHz' : 'Décimales'}<div className="font-mono text-lg text-sky-200">{isValidVhfFrequency(selected) ? (part === 'mhz' ? selected.slice(0, 3) : selected.slice(4)) : '---'}</div></div>
              <FrequencyKnob part={part}
                value={isValidVhfFrequency(selected) ? Number(part === 'mhz' ? selected.slice(0, 3) : selected.slice(4)) : part === 'mhz' ? 118 : 0}
                onStep={direction => setStandby(value => stepFrequency(value, part, direction))} />
            </div>)}
          </div>
          <p id={`${id}-freq-help`} className={toolbar ? 'sr-only' : 'mb-3 text-xs text-slate-400'}>Canaux VHF de 118.000 à 136.990. Survole une molette et tourne la roue, ou utilise les boutons et les flèches.</p>
          {receiveOnly && <p role="status" className="mb-3 rounded-lg bg-sky-950 p-2 text-xs text-sky-200">OBS : écoute uniquement. Un plan de vol actif est nécessaire pour émettre depuis l’espace pilote.</p>}
          <div role="group" aria-label="Mode du microphone radio" className="mb-3 grid grid-cols-3 gap-1">
            {MODES.map(item => <button key={item.mode} type="button" aria-pressed={radio.mode === item.mode}
              disabled={item.mode !== 'muted' && (receiveOnly || !connected || radio.preparingMic)} onClick={() => void radio.setMicMode(item.mode, inputId)}
              className={`${toolbar ? 'min-h-10' : 'min-h-12'} rounded-lg border px-1 py-2 text-xs disabled:opacity-40 ${radio.mode === item.mode ? 'border-sky-400 bg-sky-950 text-sky-100' : 'border-slate-700 hover:bg-slate-800'}`}>{item.label}</button>)}
          </div>
          {!receiveOnly && radio.mode === 'ptt' && <button type="button" disabled={!connected || !radio.micReady} aria-pressed={radio.transmitting}
            onPointerDown={e => { if (e.button !== 0) return; e.preventDefault(); e.currentTarget.setPointerCapture(e.pointerId); press(`pointer-${e.pointerId}`); }}
            onPointerUp={e => release(`pointer-${e.pointerId}`)} onPointerCancel={e => release(`pointer-${e.pointerId}`)} onLostPointerCapture={e => release(`pointer-${e.pointerId}`)}
            onKeyDown={e => { if ((e.key === ' ' || e.key === 'Enter') && !e.repeat) { e.preventDefault(); press('button'); } }}
            onKeyUp={e => { if (e.key === ' ' || e.key === 'Enter') { e.preventDefault(); release('button'); } }} onBlur={() => release('button')}
            onContextMenu={e => e.preventDefault()} className={`mb-3 flex shrink-0 ${toolbar ? 'min-h-12' : 'min-h-16'} touch-none select-none items-center justify-center gap-2 rounded-xl border-2 font-semibold ${radio.transmitting ? 'border-red-400 bg-red-700' : 'border-sky-600 bg-sky-950 hover:bg-sky-900'}`}>
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
          {!receiveOnly && <details className="border-t border-slate-700 pt-2 text-xs" onToggle={event => {
            if (!event.currentTarget.open) { setCapturingShortcut(false); pendingShortcut.current = null; }
          }}>
            <summary className="cursor-pointer py-1 text-slate-300">Microphone et raccourci facultatif</summary>
            <label className="mt-2 block">Microphone <select value={inputId} disabled={radio.mode !== 'muted' || radio.preparingMic} onChange={e => setInputId(e.target.value)} className="mt-1 w-full rounded border border-slate-600 bg-slate-900 p-2">
              <option value="">Microphone par défaut</option>{inputs.filter(d => d.deviceId).map((d, i) => <option key={d.deviceId} value={d.deviceId}>{d.label || `Microphone ${i + 1}`}</option>)}
            </select></label>
            <p className="mt-1 text-slate-400">Coupe le micro pour changer de périphérique.</p>
            <div className="mt-3 flex flex-wrap items-center gap-2">
              <span>Touche PTT : <kbd className="rounded bg-slate-800 px-2 py-1">{shortcut ? shortcutLabel || radioShortcutLabel(shortcut) : 'Aucune'}</kbd></span>
              <button type="button" aria-pressed={capturingShortcut} onClick={() => { releaseAll(); pendingShortcut.current = null; setShortcutError(''); setCapturingShortcut(value => !value); }}
                className={`rounded border px-2 py-2 ${capturingShortcut ? 'border-sky-400 bg-sky-900' : 'border-slate-600 bg-slate-900 hover:bg-slate-800'}`}>
                {capturingShortcut ? 'Annuler' : 'Définir une touche'}
              </button>
              {shortcut && <button type="button" className="rounded border border-slate-600 px-2 py-2" onClick={() => { releaseAll(); setCapturingShortcut(false); pendingShortcut.current = null; setShortcut(''); setShortcutLabel(''); try { localStorage.removeItem('combox-shortcut'); localStorage.removeItem('combox-shortcut-label'); } catch {} }}>Effacer</button>}
            </div>
            {capturingShortcut && <p role="status" className="mt-2 text-sky-200">Appuie puis relâche la touche souhaitée. Échap pour annuler.</p>}
            {shortcutError && <p role="alert" className="mt-2 text-amber-300">{shortcutError}</p>}
            <p className="mt-2 text-slate-400">{desktop ? 'PTT global Windows : garde cette fenêtre ouverte, même réduite, puis utilise la touche dans Roblox. Relâche-la pour couper la radio.' : 'Dans le navigateur, la touche fonctionne lorsque le site a le focus. Pour parler depuis Roblox, ouvre le site avec l’application Windows. Le micro ouvert reste actif en arrière-plan.'}</p>
            {desktopError && <p role="alert" className="mt-2 text-amber-300">{desktopError}</p>}
            {desktop && <DesktopUpdateStatus />}
            {!desktop && <a className="mt-2 inline-block text-sky-300 underline" href="https://github.com/MrPolochon/weblogbook/releases/tag/v1.5.5" target="_blank" rel="noreferrer">Application Windows · PTT global</a>}
          </details>}
          {!toolbar && <p className="mt-3 text-xs text-slate-500">Discord reste ton cockpit. Le PTT n’ouvre que la radio du site. Utilise un casque pour éviter de retransmettre le son des haut-parleurs.</p>}
        </section>
  );

  if (toolbar) {
    const attention = radio.error || radio.audioBlocked;
    const compactStatus = radio.transmitting ? 'ÉMISSION' : attention ? 'À VÉRIFIER' : connected ? receiveOnly ? 'OBS' : 'ÉCOUTE' : busy ? 'CONNEXION' : 'ÉTEINTE';
    return (
      <div ref={toolbarRef} className="flex shrink-0 items-center gap-1" aria-label={`Radio ${station?.position ?? 'ATC'}`}>
        <button ref={triggerRef} type="button" onClick={() => expanded ? closePanel() : setExpanded(true)}
          aria-haspopup="dialog" aria-expanded={expanded} aria-controls={expanded ? id : undefined}
          aria-label={`COM ${radio.powered ? radio.frequency : ''} · ${compactStatus}`}
          title={`Radio COM · ${compactStatus}${radio.error ? ` · ${radio.error}` : radio.audioBlocked ? ' · Activer l’écoute audio' : ''}`}
          className={`flex min-h-9 items-center gap-2 rounded-xl border px-2.5 py-1.5 text-xs focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-orange-400 ${radio.transmitting ? 'border-red-400 bg-red-950 text-red-100' : attention ? isDark ? 'border-amber-600 bg-amber-950 text-amber-200' : 'border-amber-400 bg-amber-50 text-amber-900' : expanded ? isDark ? 'border-sky-500 bg-sky-950 text-sky-100' : 'border-sky-500 bg-sky-50 text-sky-900' : isDark ? 'border-slate-700 bg-slate-900 text-slate-200 hover:bg-slate-800' : 'border-slate-300 bg-slate-50 text-slate-700 hover:bg-slate-100'}`}>
          <Radio size={16} aria-hidden />
          <span className="flex flex-col items-start leading-tight">
            <span className="font-mono font-bold">{radio.powered ? radio.frequency : 'COM'}</span>
            <span className="text-[9px] font-semibold tracking-wide">{compactStatus}</span>
          </span>
          <ChevronDown size={12} aria-hidden className={expanded ? 'rotate-180' : ''} />
        </button>
        {radio.transmitting && <button type="button" onClick={() => void radio.setMicMode('muted')}
          aria-label="Couper immédiatement le microphone radio" title="Couper le micro"
          className="flex h-9 w-9 items-center justify-center rounded-lg border border-red-400 bg-red-950 text-red-100 hover:bg-red-900"><MicOff size={16} /></button>}
        {expanded && createPortal(panel, document.body)}
      </div>
    );
  }

  return (
    <aside aria-label="COM box radio" className={placement === 'inline' ? 'w-full min-w-0 text-slate-100' : 'fixed bottom-3 left-3 z-[60] max-w-[calc(100vw-1.5rem)] text-slate-100'}>
      {expanded ? panel : (
        <div className={`flex items-center gap-2 rounded-xl border p-2 shadow-xl ${radio.transmitting ? 'border-red-400 bg-red-950' : 'border-slate-600 bg-slate-950'}`}>
          <button type="button" onClick={() => setExpanded(true)} aria-expanded={false} aria-controls={id} className="flex min-h-10 items-center gap-3 px-2 text-sm">
            <Radio size={18} aria-hidden /><span className="font-mono font-bold">COM {connected ? radio.frequency : ''}</span>
            <span className={radio.transmitting ? 'text-red-200' : 'text-emerald-300'}>{status}</span>
          </button>
          {radio.transmitting && <button type="button" onClick={() => void radio.setMicMode('muted')} className={button} aria-label="Couper immédiatement le microphone radio"><MicOff size={18} /></button>}
        </div>
      )}
    </aside>
  );
}
