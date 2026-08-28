'use client';

import { useEffect, useId, useRef, useState } from 'react';
import { Check, Copy, Plane } from 'lucide-react';
import { PF_DEFAULT_SERVER_ID } from '@/lib/pftester-odw';

export const PF_ODW_INTRO_STORAGE_KEY = 'pftester-odw-intro-v1';
export const PF_ODW_SERVER_PASSWORD = 'MixouAirlines';

const FOCUSABLE =
  'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])';

function CopyRow({ label, value }: { label: string; value: string }) {
  const [copied, setCopied] = useState(false);

  async function copy() {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1600);
    } catch {
      setCopied(false);
    }
  }

  return (
    <div className="flex items-center gap-2 rounded-lg border border-cyan-500/25 bg-slate-950/70 px-3 py-2">
      <div className="min-w-0 flex-1">
        <p className="text-[10px] uppercase tracking-wider text-slate-500">{label}</p>
        <p className="font-mono text-sm font-semibold text-cyan-200 break-all">{value}</p>
      </div>
      <button
        type="button"
        onClick={() => void copy()}
        className="shrink-0 rounded-md border border-slate-600/70 bg-slate-800 p-1.5 text-slate-300 hover:bg-slate-700 hover:text-white"
        title={`Copier ${label.toLowerCase()}`}
        aria-label={`Copier ${label.toLowerCase()}`}
      >
        {copied ? <Check className="h-3.5 w-3.5 text-emerald-400" /> : <Copy className="h-3.5 w-3.5" />}
      </button>
    </div>
  );
}

export default function PfTesterOdwIntroModal({ onContinue }: { onContinue: () => void }) {
  const dialogRef = useRef<HTMLDivElement>(null);
  const continueRef = useRef<HTMLButtonElement>(null);
  const titleId = useId();
  const descId = useId();

  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    const root = dialogRef.current;
    continueRef.current?.focus();

    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        e.preventDefault();
        continueRef.current?.focus();
        return;
      }
      if (e.key !== 'Tab' || !root) return;
      const nodes = Array.from(root.querySelectorAll<HTMLElement>(FOCUSABLE)).filter(
        (el) => !el.hasAttribute('disabled') && el.tabIndex !== -1,
      );
      if (!nodes.length) return;
      const first = nodes[0];
      const last = nodes[nodes.length - 1];
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    }

    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('keydown', onKey);
      previous?.focus?.();
    };
  }, []);

  return (
    <div
      className="fixed inset-0 z-[80] flex items-center justify-center p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby={titleId}
      aria-describedby={descId}
    >
      <div className="absolute inset-0 bg-slate-950/85 backdrop-blur-sm" />
      <div
        ref={dialogRef}
        className="relative z-10 w-full max-w-lg rounded-2xl border border-slate-700/70 bg-[#0d1524] shadow-2xl shadow-black/50"
      >
        <div className="border-b border-slate-700/50 px-5 py-4">
          <div className="flex items-center gap-2.5">
            <span className="flex h-9 w-9 items-center justify-center rounded-lg border border-cyan-500/30 bg-cyan-500/10">
              <Plane className="h-4 w-4 text-cyan-300" />
            </span>
            <div>
              <p className="text-[10px] font-semibold uppercase tracking-wider text-cyan-400/80">PFtesterODW</p>
              <h2 id={titleId} className="text-lg font-bold text-slate-100">
                Test de tracking Project Flight
              </h2>
            </div>
          </div>
        </div>

        <div id={descId} className="space-y-4 px-5 py-4 text-sm leading-relaxed text-slate-300">
          <p>Ceci est un test de tracking d&apos;avions pour le serveur Project Flight.</p>
          <div className="grid gap-2 sm:grid-cols-2">
            <CopyRow label="ID serveur" value={PF_DEFAULT_SERVER_ID} />
            <CopyRow label="Mot de passe" value={PF_ODW_SERVER_PASSWORD} />
          </div>
          <p>
            Il s&apos;agit d&apos;un tracker qui sert à tester si le site pourrait supporter des vols
            sur Project Flight.
          </p>
        </div>

        <div className="border-t border-slate-700/50 px-5 py-4">
          <button
            ref={continueRef}
            type="button"
            onClick={onContinue}
            className="w-full rounded-xl bg-cyan-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-cyan-500 focus:outline-none focus-visible:ring-2 focus-visible:ring-cyan-300 focus-visible:ring-offset-2 focus-visible:ring-offset-slate-900"
          >
            Accéder à la carte
          </button>
        </div>
      </div>
    </div>
  );
}
