'use client';

import { useMemo, useState } from 'react';
import { ArrowDownLeft, ArrowUpRight, Search, Filter } from 'lucide-react';
import { toLocaleDateStringUTC } from '@/lib/date-utils';
import FelitzTransactionDetailModal from '@/components/FelitzTransactionDetailModal';

export interface FelitzTransaction {
  id: string;
  type: string; // 'credit' | 'debit'
  montant: number;
  libelle: string;
  description?: string | null;
  created_at: string;
}

interface Props {
  transactions: FelitzTransaction[];
  // Si true : utilise des couleurs claires (pour les pages ATC/SIAVI sur fond blanc).
  // Sinon (par défaut) : couleurs sombres (page principale).
  light?: boolean;
  // Hauteur max du conteneur scroll.
  maxHeight?: string;
}

type Filter = 'all' | 'credit' | 'debit';

function formatDate(dateStr: string) {
  return toLocaleDateStringUTC(dateStr, {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }) + ' UTC';
}

export default function FelitzTransactionsHistory({ transactions, light = false, maxHeight = '500px' }: Props) {
  const [filter, setFilter] = useState<Filter>('all');
  const [query, setQuery] = useState('');
  const [selectedTx, setSelectedTx] = useState<FelitzTransaction | null>(null);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return transactions.filter((t) => {
      if (filter !== 'all' && t.type !== filter) return false;
      if (q && !(t.libelle?.toLowerCase().includes(q) || t.description?.toLowerCase().includes(q))) return false;
      return true;
    });
  }, [transactions, filter, query]);

  const totals = useMemo(() => {
    let credit = 0;
    let debit = 0;
    for (const t of filtered) {
      if (t.type === 'credit') credit += Math.abs(t.montant);
      else if (t.type === 'debit') debit += Math.abs(t.montant);
    }
    return { credit, debit, net: credit - debit };
  }, [filtered]);

  if (transactions.length === 0) {
    return (
      <p className={`text-sm text-center py-4 ${light ? 'text-slate-500' : 'text-slate-600'}`}>
        Aucune transaction
      </p>
    );
  }

  // Palette
  const filterBtnBase = 'flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-medium transition-colors';
  const filterBtnActive = light
    ? 'bg-slate-900 text-white'
    : 'bg-emerald-500/20 text-emerald-200 border border-emerald-500/30';
  const filterBtnIdle = light
    ? 'bg-slate-100 text-slate-600 hover:bg-slate-200'
    : 'bg-slate-800/40 text-slate-400 hover:bg-slate-800/70 border border-slate-700/50';

  const inputClass = light
    ? 'w-full pl-8 pr-3 py-1.5 text-sm rounded-md border border-slate-300 bg-white text-slate-700 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-emerald-500/50'
    : 'w-full pl-8 pr-3 py-1.5 text-sm rounded-md border border-slate-700/50 bg-slate-800/40 text-slate-200 placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/40';

  const containerClass = light
    ? 'rounded-xl border border-slate-200 bg-white'
    : 'rounded-xl border border-slate-800/40 bg-slate-800/10';

  const itemClass = light
    ? 'border-b border-slate-100 hover:bg-slate-50 cursor-pointer'
    : 'border-b border-slate-800/20 hover:bg-slate-800/30 cursor-pointer';

  return (
    <div className="space-y-2">
      {/* Barre de contrôle : recherche + filtres + totaux */}
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-2 flex-1">
          <div className="relative flex-1 min-w-0">
            <Search className={`absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 ${light ? 'text-slate-400' : 'text-slate-500'}`} />
            <input
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Rechercher dans le libellé..."
              className={inputClass}
            />
          </div>
          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={() => setFilter('all')}
              className={`${filterBtnBase} ${filter === 'all' ? filterBtnActive : filterBtnIdle}`}
              title="Toutes les transactions"
            >
              <Filter className="h-3 w-3" /> Tout
            </button>
            <button
              type="button"
              onClick={() => setFilter('credit')}
              className={`${filterBtnBase} ${filter === 'credit' ? (light ? 'bg-emerald-100 text-emerald-700' : 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30') : filterBtnIdle}`}
              title="Crédits seulement"
            >
              <ArrowDownLeft className="h-3 w-3" /> Crédits
            </button>
            <button
              type="button"
              onClick={() => setFilter('debit')}
              className={`${filterBtnBase} ${filter === 'debit' ? (light ? 'bg-red-100 text-red-700' : 'bg-red-500/20 text-red-300 border border-red-500/30') : filterBtnIdle}`}
              title="Débits seulement"
            >
              <ArrowUpRight className="h-3 w-3" /> Débits
            </button>
          </div>
        </div>
      </div>

      {/* Résumé */}
      <div className={`flex flex-wrap items-center gap-3 px-3 py-2 rounded-lg text-xs font-medium ${
        light ? 'bg-slate-50 text-slate-600 border border-slate-200' : 'bg-slate-900/40 text-slate-400 border border-slate-800/50'
      }`}>
        <span>
          <span className="opacity-70">{filtered.length}</span> / {transactions.length} ligne{transactions.length > 1 ? 's' : ''}
        </span>
        <span className="opacity-30">•</span>
        <span className={light ? 'text-emerald-700' : 'text-emerald-400'}>
          + {totals.credit.toLocaleString('fr-FR')} F$
        </span>
        <span className="opacity-30">•</span>
        <span className={light ? 'text-red-700' : 'text-red-400'}>
          − {totals.debit.toLocaleString('fr-FR')} F$
        </span>
        <span className="opacity-30">•</span>
        <span className={`font-bold ${
          totals.net >= 0
            ? (light ? 'text-emerald-800' : 'text-emerald-300')
            : (light ? 'text-red-800' : 'text-red-300')
        }`}>
          Net {totals.net >= 0 ? '+' : ''}{totals.net.toLocaleString('fr-FR')} F$
        </span>
      </div>

      {/* Liste */}
      <div className={`${containerClass} overflow-y-auto`} style={{ maxHeight }}>
        {filtered.length === 0 ? (
          <p className={`text-sm italic text-center py-6 ${light ? 'text-slate-400' : 'text-slate-600'}`}>
            Aucune transaction ne correspond aux filtres
          </p>
        ) : (
          filtered.map((t) => (
            <button
              key={t.id}
              type="button"
              onClick={() => setSelectedTx(t)}
              className={`w-full flex items-center justify-between gap-3 px-3 py-2.5 last:border-0 transition-colors text-left ${itemClass}`}
            >
              <div className="flex items-start gap-2.5 min-w-0">
                <div className={`mt-0.5 p-1 rounded-md flex-shrink-0 ${
                  t.type === 'credit'
                    ? (light ? 'bg-emerald-100' : 'bg-emerald-500/10')
                    : (light ? 'bg-red-100' : 'bg-red-500/10')
                }`}>
                  {t.type === 'credit' ? (
                    <ArrowDownLeft className={`h-3 w-3 ${light ? 'text-emerald-600' : 'text-emerald-400'}`} />
                  ) : (
                    <ArrowUpRight className={`h-3 w-3 ${light ? 'text-red-600' : 'text-red-400'}`} />
                  )}
                </div>
                <div className="min-w-0">
                  <p className={`text-xs break-all leading-relaxed ${light ? 'text-slate-700' : 'text-slate-300'}`}>
                    {t.libelle || t.description || '—'}
                  </p>
                  <p className={`text-[10px] ${light ? 'text-slate-400' : 'text-slate-600'}`}>
                    {formatDate(t.created_at)}
                  </p>
                </div>
              </div>
              <span className={`font-medium text-xs tabular-nums whitespace-nowrap ${
                t.type === 'credit'
                  ? (light ? 'text-emerald-600' : 'text-emerald-400')
                  : (light ? 'text-red-600' : 'text-red-400')
              }`}>
                {t.type === 'credit' ? '+' : '-'}{Math.abs(t.montant).toLocaleString('fr-FR')} F$
              </span>
            </button>
          ))
        )}
      </div>

      {selectedTx && (
        <FelitzTransactionDetailModal
          tx={selectedTx}
          light={light}
          onClose={() => setSelectedTx(null)}
        />
      )}
    </div>
  );
}
