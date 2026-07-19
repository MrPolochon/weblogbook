'use client';

import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import {
  X, ArrowUpRight, ArrowDownLeft, Plane, Wrench, Receipt,
  ArrowLeftRight, CreditCard, Ban,
} from 'lucide-react';
import { toLocaleDateStringUTC } from '@/lib/date-utils';

export interface FelitzTransactionDetail {
  id: string;
  type: string;
  montant: number;
  libelle: string;
  description?: string | null;
  created_at: string;
}

interface Props {
  tx: FelitzTransactionDetail;
  onClose: () => void;
  light?: boolean;
}

function formatAmt(n: number): string {
  return Math.abs(n).toLocaleString('fr-FR');
}

function formatDate(dateStr: string) {
  return toLocaleDateStringUTC(dateStr, {
    day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit',
  }) + ' UTC';
}

function detectTransactionMeta(tx: FelitzTransactionDetail): { label: string; colorClass: string } {
  const lib = (tx.libelle || '').toLowerCase();
  if (lib.includes('salaire')) {
    if (lib.includes('atc')) return { label: 'Salaire ATC', colorClass: 'text-amber-400' };
    return { label: 'Salaire vol', colorClass: 'text-sky-400' };
  }
  if (lib.includes('taxe') || lib.includes('tax')) return { label: 'Taxe', colorClass: 'text-orange-400' };
  if (lib.includes('réparation') || lib.includes('reparation') || lib.includes('maintenance'))
    return { label: 'Réparation', colorClass: 'text-yellow-400' };
  if (lib.includes('virement') || lib.includes('transfer')) return { label: 'Virement', colorClass: 'text-purple-400' };
  if (lib.includes('chèque') || lib.includes('cheque') || lib.includes('compensation'))
    return { label: 'Chèque', colorClass: 'text-teal-400' };
  if (lib.includes('amende') || lib.includes('sanction')) return { label: 'Amende', colorClass: 'text-red-400' };
  if (tx.type === 'credit') return { label: 'Crédit', colorClass: 'text-emerald-400' };
  return { label: 'Débit', colorClass: 'text-red-400' };
}

function TxIcon({ tx, light }: { tx: FelitzTransactionDetail; light?: boolean }) {
  const lib = (tx.libelle || '').toLowerCase();
  const isCredit = tx.type === 'credit';
  const c = isCredit
    ? (light ? 'text-emerald-600' : 'text-emerald-400')
    : (light ? 'text-red-600' : 'text-red-400');
  if (lib.includes('salaire')) return <Plane className={`h-3.5 w-3.5 ${c}`} />;
  if (lib.includes('taxe') || lib.includes('tax')) return <Receipt className="h-3.5 w-3.5 text-orange-400" />;
  if (lib.includes('réparation') || lib.includes('reparation') || lib.includes('maintenance'))
    return <Wrench className="h-3.5 w-3.5 text-yellow-400" />;
  if (lib.includes('virement') || lib.includes('transfer')) return <ArrowLeftRight className="h-3.5 w-3.5 text-purple-400" />;
  if (lib.includes('chèque') || lib.includes('cheque') || lib.includes('compensation'))
    return <CreditCard className="h-3.5 w-3.5 text-teal-400" />;
  if (lib.includes('amende') || lib.includes('sanction')) return <Ban className="h-3.5 w-3.5 text-red-400" />;
  if (isCredit) return <ArrowDownLeft className={`h-3.5 w-3.5 ${c}`} />;
  return <ArrowUpRight className={`h-3.5 w-3.5 ${c}`} />;
}

export default function FelitzTransactionDetailModal({ tx, onClose, light = false }: Props) {
  const [mounted, setMounted] = useState(false);
  const meta = detectTransactionMeta(tx);

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKey);
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = prevOverflow;
    };
  }, [onClose]);

  if (!mounted || typeof document === 'undefined') return null;

  const panelClass = light
    ? 'relative w-full max-w-md rounded-2xl border border-slate-200 bg-white shadow-2xl p-6 animate-fade-in'
    : 'relative w-full max-w-md rounded-2xl border border-slate-700/50 bg-slate-900 shadow-2xl p-6 animate-fade-in';

  const labelMuted = light ? 'text-slate-500' : 'text-slate-500';
  const textPrimary = light ? 'text-slate-800' : 'text-slate-300';
  const textSecondary = light ? 'text-slate-600' : 'text-slate-400';
  const closeBtn = light ? 'text-slate-400 hover:text-slate-700' : 'text-slate-500 hover:text-slate-300';
  const amountClass = tx.type === 'credit'
    ? (light ? 'text-emerald-700' : 'text-emerald-300')
    : (light ? 'text-red-700' : 'text-red-300');
  const iconWrap = tx.type === 'credit'
    ? (light ? 'bg-emerald-100 border border-emerald-200' : 'bg-emerald-500/10 border border-emerald-500/20')
    : (light ? 'bg-red-100 border border-red-200' : 'bg-red-500/10 border border-red-500/20');
  const sensBadge = tx.type === 'credit'
    ? (light ? 'bg-emerald-100 text-emerald-700 border border-emerald-200' : 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20')
    : (light ? 'bg-red-100 text-red-700 border border-red-200' : 'bg-red-500/10 text-red-400 border border-red-500/20');

  return createPortal(
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-fade-in"
      onClick={onClose}
      role="presentation"
    >
      <div
        className={panelClass}
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-labelledby="felitz-tx-detail-title"
      >
        <button
          type="button"
          onClick={onClose}
          className={`absolute top-4 right-4 transition-colors ${closeBtn}`}
          aria-label="Fermer"
        >
          <X className="h-5 w-5" />
        </button>

        <div className="flex items-center gap-3 mb-5">
          <div className={`p-3 rounded-xl ${iconWrap}`}>
            <TxIcon tx={tx} light={light} />
          </div>
          <div>
            <p className={`text-xs font-semibold uppercase tracking-wider ${meta.colorClass}`}>{meta.label}</p>
            <p id="felitz-tx-detail-title" className={`text-2xl font-bold tabular-nums ${amountClass}`}>
              {tx.type === 'credit' ? '+' : '−'}{formatAmt(tx.montant)} F$
            </p>
          </div>
        </div>

        <div className="space-y-3.5">
          <div>
            <p className={`text-[10px] uppercase tracking-wider font-semibold mb-1 ${labelMuted}`}>Libellé</p>
            <p className={`text-sm break-all ${textPrimary}`}>{tx.libelle || '—'}</p>
          </div>
          {tx.description && (
            <div>
              <p className={`text-[10px] uppercase tracking-wider font-semibold mb-1 ${labelMuted}`}>Description</p>
              <p className={`text-sm break-all ${textSecondary}`}>{tx.description}</p>
            </div>
          )}
          <div>
            <p className={`text-[10px] uppercase tracking-wider font-semibold mb-1 ${labelMuted}`}>Date &amp; heure</p>
            <p className={`text-sm ${textPrimary}`}>{formatDate(tx.created_at)}</p>
          </div>
          <div>
            <p className={`text-[10px] uppercase tracking-wider font-semibold mb-1 ${labelMuted}`}>Sens</p>
            <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium ${sensBadge}`}>
              {tx.type === 'credit' ? <ArrowDownLeft className="h-3 w-3" /> : <ArrowUpRight className="h-3 w-3" />}
              {tx.type === 'credit' ? 'Crédit' : 'Débit'}
            </span>
          </div>
        </div>
      </div>
    </div>,
    document.body,
  );
}
