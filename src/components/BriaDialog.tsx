'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Radio, Square, Volume2, X } from 'lucide-react';
import { buildBriaBriefing, type BriaDraft } from '@/lib/bria/briefing';

// Kept for older callers. Opening a text briefing does not consume a quota.
export function getBriaCooldownRemaining(): number { return 0; }

interface BriaDialogProps {
  onClose: () => void;
  draft?: BriaDraft;
  onReviewStep?: (step: number) => void;
  availableSteps?: boolean[];
}

export default function BriaDialog({ onClose, draft, onReviewStep, availableSteps }: BriaDialogProps) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const utteranceRef = useRef<SpeechSynthesisUtterance | null>(null);
  const speechTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const closedRef = useRef(false);
  const [voiceSupported, setVoiceSupported] = useState(false);
  const [reading, setReading] = useState(false);
  const [voiceMessage, setVoiceMessage] = useState('');
  const briefing = useMemo(() => buildBriaBriefing(draft), [draft]);

  function stopReading() {
    if (speechTimerRef.current) clearTimeout(speechTimerRef.current);
    speechTimerRef.current = null;
    const utterance = utteranceRef.current;
    utteranceRef.current = null;
    if (utterance) {
      utterance.onend = null;
      utterance.onerror = null;
      window.speechSynthesis?.cancel();
    }
    setReading(false);
  }

  function close() {
    if (closedRef.current) return;
    closedRef.current = true;
    stopReading();
    onClose();
  }

  useEffect(() => {
    const previouslyFocused = document.activeElement;
    const dialog = dialogRef.current;
    setVoiceSupported(typeof window.speechSynthesis !== 'undefined' && typeof window.SpeechSynthesisUtterance === 'function');
    if (dialog) {
      if (typeof dialog.showModal === 'function') dialog.showModal();
      else dialog.setAttribute('open', '');
      dialog.querySelector<HTMLButtonElement>('[data-close-dialog]')?.focus();
    }
    const handlePageHide = () => stopReading();
    window.addEventListener('pagehide', handlePageHide);
    return () => {
      window.removeEventListener('pagehide', handlePageHide);
      if (speechTimerRef.current) clearTimeout(speechTimerRef.current);
      const utterance = utteranceRef.current;
      utteranceRef.current = null;
      if (utterance) {
        utterance.onend = null;
        utterance.onerror = null;
        window.speechSynthesis?.cancel();
      }
      if (dialog?.open && typeof dialog.close === 'function') dialog.close();
      if (previouslyFocused instanceof HTMLElement && previouslyFocused.isConnected) previouslyFocused.focus();
    };
    // The modal owns its audio and focus for its whole mounted lifetime.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function readBriefing() {
    if (!voiceSupported) {
      setVoiceMessage('La lecture vocale n’est pas disponible dans ce navigateur. Le briefing reste consultable ci-dessus.');
      return;
    }
    stopReading();
    if (window.speechSynthesis.speaking) {
      setVoiceMessage('Une autre lecture est en cours. Vous pourrez lancer ce briefing lorsqu’elle sera terminée.');
      return;
    }
    try {
      const utterance = new window.SpeechSynthesisUtterance(briefing.speechText);
      utterance.lang = 'fr-FR';
      utterance.rate = 0.95;
      utterance.volume = 0.85;
      const finish = () => {
        if (utteranceRef.current !== utterance) return;
        utteranceRef.current = null;
        if (speechTimerRef.current) clearTimeout(speechTimerRef.current);
        speechTimerRef.current = null;
        setReading(false);
      };
      utterance.onend = finish;
      utterance.onerror = () => {
        finish();
        setVoiceMessage('La lecture vocale a été interrompue. Vous pouvez continuer à lire le briefing.');
      };
      utteranceRef.current = utterance;
      setReading(true);
      setVoiceMessage('Lecture du briefing en cours.');
      speechTimerRef.current = setTimeout(() => {
        stopReading();
        setVoiceMessage('Lecture terminée. Le briefing reste disponible.');
      }, 90_000);
      window.speechSynthesis.speak(utterance);
    } catch {
      stopReading();
      setVoiceMessage('Lecture vocale indisponible. Vous pouvez continuer à lire le briefing.');
    }
  }

  if (typeof document === 'undefined') return null;

  return createPortal(
    <dialog
      ref={dialogRef}
      aria-labelledby="bria-title"
      aria-describedby="bria-description"
      className="fixed inset-0 z-[100] max-h-[90dvh] w-[calc(100%_-_2rem)] max-w-2xl overflow-y-auto rounded-2xl border border-slate-600 bg-slate-950 p-0 text-slate-200 shadow-2xl backdrop:bg-black/70"
      onCancel={event => { event.preventDefault(); close(); }}
      onKeyDown={event => {
        if (event.key === 'Escape') { event.preventDefault(); close(); return; }
        if (event.key !== 'Tab') return;
        const controls = Array.from(dialogRef.current?.querySelectorAll<HTMLElement>('button:not(:disabled), a[href], [tabindex="0"]') ?? []);
        const first = controls[0];
        const last = controls[controls.length - 1];
        if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
        else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
      }}
    >
      <div className="space-y-5 p-5 sm:p-6">
        <header className="flex items-start justify-between gap-4">
          <div><h2 id="bria-title" className="flex items-center gap-2 text-xl font-bold"><Radio aria-hidden className="h-5 w-5 text-sky-400" />BRIA · Préparation du vol</h2><p id="bria-description" className="mt-2 text-sm text-slate-400">Relisez votre préparation, puis complétez le formulaire de dépôt.</p></div>
          <button type="button" data-close-dialog aria-label="Fermer le briefing" onClick={close} className="rounded-lg p-2 hover:bg-slate-800 focus-visible:outline focus-visible:outline-2 focus-visible:outline-sky-400"><X aria-hidden className="h-5 w-5" /></button>
        </header>

        <section aria-labelledby="bria-summary-title" className="rounded-xl border border-slate-700 bg-slate-900 p-4">
          <h3 id="bria-summary-title" className="font-semibold text-sky-200">Votre préparation actuelle</h3>
          <ul className="mt-3 space-y-2 text-sm">{briefing.lines.map(line => <li key={line}>{line}</li>)}</ul>
        </section>

        <section aria-labelledby="bria-check-title">
          <h3 id="bria-check-title" className="font-semibold">À vérifier avant le dépôt</h3>
          {briefing.missing.length ? <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-amber-200">{briefing.missing.map(item => <li key={item}>{item}</li>)}</ul> : <p className="mt-2 text-sm text-slate-300">Les principaux champs sont renseignés. Vérifiez aussi les autorisations de l’appareil, la porte et les autres informations demandées par le formulaire.</p>}
          <ul className="mt-3 list-disc space-y-2 pl-5 text-sm text-slate-400">{briefing.advice.map(item => <li key={item}>{item}</li>)}</ul>
        </section>

        {onReviewStep && <nav aria-label="Reprendre la préparation" className="flex flex-wrap gap-2">{['Appareil et route', 'Horaires et procédures', 'Récapitulatif'].map((label, index) => <button key={label} type="button" disabled={availableSteps?.[index] === false} onClick={() => { stopReading(); onReviewStep(index + 1); }} className="rounded-lg border border-slate-600 px-3 py-2 text-sm hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-40">{label}</button>)}</nav>}

        <p className="rounded-lg border border-sky-900 bg-sky-950/30 p-3 text-sm text-sky-100">Ce briefing ne crée aucun plan de vol et ne modifie ni votre indicatif ni votre chargement. Vous gardez la main sur le dépôt final.</p>
        <footer className="border-t border-slate-800 pt-4">
          <div className="flex flex-wrap gap-2"><button type="button" onClick={readBriefing} disabled={!voiceSupported || reading} className="inline-flex items-center gap-2 rounded-lg border border-slate-600 px-3 py-2 text-sm hover:bg-slate-800 disabled:opacity-40"><Volume2 aria-hidden className="h-4 w-4" />Lire le briefing</button><button type="button" onClick={() => { stopReading(); setVoiceMessage('Lecture arrêtée.'); }} disabled={!reading} className="inline-flex items-center gap-2 rounded-lg border border-slate-600 px-3 py-2 text-sm hover:bg-slate-800 disabled:opacity-40"><Square aria-hidden className="h-4 w-4" />Arrêter la lecture</button></div>
          <p role="status" aria-live="polite" className="mt-2 text-xs text-slate-400">{voiceMessage || (voiceSupported ? 'Lecture facultative avec la voix de votre navigateur.' : 'La lecture vocale n’est pas disponible dans ce navigateur. Le briefing reste accessible en texte.')}</p>
        </footer>
      </div>
    </dialog>, document.body,
  );
}
