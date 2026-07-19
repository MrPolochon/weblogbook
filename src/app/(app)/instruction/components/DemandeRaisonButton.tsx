'use client';

import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { MessageSquareText, X } from 'lucide-react';

type DemandeRaisonButtonProps = {
  message: string;
  /** Identifiant de l’élève / demandeur (affiché dans le modal). */
  auteur?: string | null;
  /** Aperçu tronqué sous le bouton (défaut : oui). */
  showPreview?: boolean;
  /** Classes supplémentaires sur le conteneur. */
  className?: string;
  /** Variante compacte (icône seule) pour tableaux serrés. */
  compact?: boolean;
};

/**
 * Aperçu tronqué + bouton ouvrant un modal avec la raison complète de la demande.
 */
export default function DemandeRaisonButton({
  message,
  auteur,
  showPreview = true,
  className = '',
  compact = false,
}: DemandeRaisonButtonProps) {
  const text = message.trim();
  const [open, setOpen] = useState(false);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    document.addEventListener('keydown', onKey);
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = prevOverflow;
    };
  }, [open]);

  if (!text) return null;

  const close = () => setOpen(false);

  const modal =
    open && mounted && typeof document !== 'undefined'
      ? createPortal(
          <div
            className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-fade-in"
            onClick={close}
            role="presentation"
          >
            <div
              className="relative w-full max-w-md rounded-xl border border-slate-700 bg-slate-900 shadow-2xl overflow-hidden animate-fade-in"
              onClick={(e) => e.stopPropagation()}
              role="dialog"
              aria-modal="true"
              aria-labelledby="demande-raison-title"
            >
              <div className="flex items-start justify-between gap-3 px-5 pt-5 pb-3 border-b border-slate-800">
                <div className="min-w-0">
                  <h3 id="demande-raison-title" className="text-base font-semibold text-slate-100">
                    Raison de la demande
                  </h3>
                  {auteur && (
                    <p className="text-xs text-slate-500 mt-0.5 truncate">
                      De <span className="text-slate-300">{auteur}</span>
                    </p>
                  )}
                </div>
                <button
                  type="button"
                  className="p-1.5 rounded-lg text-slate-400 hover:text-slate-200 hover:bg-slate-800 transition-colors shrink-0"
                  onClick={close}
                  aria-label="Fermer"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
              <div className="px-5 py-4 max-h-[60vh] overflow-y-auto">
                <div className="rounded-2xl rounded-tl-sm bg-slate-800/80 border border-slate-700/60 px-4 py-3">
                  <p className="text-sm text-slate-200 whitespace-pre-wrap break-words leading-relaxed">
                    {text}
                  </p>
                </div>
              </div>
              <div className="px-5 pb-5">
                <button
                  type="button"
                  className="w-full px-4 py-2.5 rounded-lg bg-slate-700 hover:bg-slate-600 text-slate-200 text-sm transition-colors"
                  onClick={close}
                >
                  Fermer
                </button>
              </div>
            </div>
          </div>,
          document.body,
        )
      : null;

  return (
    <>
      <div className={`min-w-0 ${className}`}>
        {showPreview && (
          <p className="text-xs text-slate-500 truncate" title={text}>
            {text}
          </p>
        )}
        <button
          type="button"
          className={
            compact
              ? 'inline-flex items-center gap-1 text-xs text-sky-400 hover:text-sky-300 transition-colors mt-0.5'
              : 'inline-flex items-center gap-1.5 text-xs text-sky-400 hover:text-sky-300 transition-colors mt-0.5'
          }
          onClick={() => setOpen(true)}
          aria-haspopup="dialog"
        >
          <MessageSquareText className="h-3.5 w-3.5 shrink-0" />
          Voir la raison
        </button>
      </div>
      {modal}
    </>
  );
}
