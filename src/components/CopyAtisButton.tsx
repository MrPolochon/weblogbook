'use client';

import { useEffect, useRef, useState } from 'react';
import { Check, Copy, X } from 'lucide-react';
import { createPortal } from 'react-dom';

export default function CopyAtisButton({ text, disabled = false }: { text: string | null | undefined; disabled?: boolean }) {
  const [copied, setCopied] = useState(false);
  const [manual, setManual] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout>>();
  useEffect(() => {
    setCopied(false); setManual(false);
    return () => clearTimeout(timer.current);
  }, [text]);

  async function copy() {
    if (!text?.trim()) return;
    try {
      await navigator.clipboard.writeText(text);
      clearTimeout(timer.current);
      setCopied(true);
      timer.current = setTimeout(() => setCopied(false), 2500);
    } catch {
      setManual(true);
    }
  }

  return <>
    <button type="button" disabled={disabled || !text?.trim()} onClick={() => void copy()} title="Copier le texte de l’ATIS pour Discord" className="inline-flex shrink-0 items-center gap-1.5 rounded-lg border border-sky-500/40 bg-sky-500/10 px-3 py-2 text-xs font-semibold text-sky-300 hover:bg-sky-500/20 disabled:opacity-40">
      {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}<span aria-live="polite">{copied ? 'Texte copié !' : 'Copier l’ATIS'}</span>
    </button>
    {manual && createPortal(<div role="dialog" aria-modal="true" aria-label="Copier le texte de l’ATIS" className="fixed inset-0 z-[250] flex items-center justify-center bg-black/70 p-4">
      <div className="w-full max-w-2xl rounded-xl border border-slate-600 bg-slate-900 p-5 text-slate-100 shadow-xl">
        <div className="mb-3 flex items-center justify-between gap-3"><p>Copie automatique indisponible : sélectionnez le texte puis copiez-le.</p><button type="button" aria-label="Fermer" onClick={() => setManual(false)}><X className="h-5 w-5" /></button></div>
        <textarea autoFocus readOnly value={text ?? ''} aria-label="Texte ATIS à copier" onFocus={e => e.currentTarget.select()} onKeyDown={e => { if (e.key === 'Escape') setManual(false); }} className="h-64 w-full resize-y rounded-lg border border-slate-600 bg-slate-950 p-3 text-sm" />
      </div>
    </div>, document.body)}
  </>;
}
