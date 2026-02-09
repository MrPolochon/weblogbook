'use client';

import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { Plus, Minus, RefreshCw, ChevronDown, ChevronUp, Loader2 } from 'lucide-react';
import { toLocaleDateStringUTC } from '@/lib/date-utils';

interface Compte {
  id: string;
  vban: string;
  solde: number;
}

interface Transaction {
  id: string;
  type: string;
  montant: number;
  libelle: string;
  description?: string | null;
  created_at: string;
}

interface Props {
  compte: Compte;
  label: string;
  type: 'personnel' | 'entreprise' | 'militaire';
}

export default function AdminFelitzClient({ compte, label, type }: Props) {
  const router = useRouter();
  const [expanded, setExpanded] = useState(false);
  const [montant, setMontant] = useState('');
  const [libelle, setLibelle] = useState('');
  const [loading, setLoading] = useState(false);
  const [loadingTransactions, setLoadingTransactions] = useState(false);
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [transactionsLoaded, setTransactionsLoaded] = useState(false);
  const [error, setError] = useState('');

  // Charger les transactions via l'API (bypass RLS)
  const loadTransactions = useCallback(async () => {
    setLoadingTransactions(true);
    try {
      const res = await fetch(`/api/felitz/transactions?compte_id=${compte.id}`);
      if (!res.ok) {
        const errData = await res.json();
        throw new Error(errData.error || 'Erreur');
      }
      const data = await res.json();
      setTransactions(data || []);
      setTransactionsLoaded(true);
    } catch (err) {
      console.error('Erreur chargement transactions:', err);
    } finally {
      setLoadingTransactions(false);
    }
  }, [compte.id]);

  // Charger les transactions quand on développe le compte
  useEffect(() => {
    if (expanded && !transactionsLoaded) {
      loadTransactions();
    }
  }, [expanded, transactionsLoaded, loadTransactions]);

  async function handleTransaction(transactionType: 'credit' | 'debit') {
    if (!montant || parseInt(montant) <= 0) return;
    
    setError('');
    setLoading(true);

    try {
      const res = await fetch('/api/felitz/transactions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          compte_id: compte.id,
          type: transactionType,
          montant: parseInt(montant),
          libelle: libelle.trim() || (transactionType === 'credit' ? 'Crédit admin' : 'Débit admin')
        })
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Erreur');

      setMontant('');
      setLibelle('');
      // Recharger les transactions
      setTransactionsLoaded(false);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erreur');
    } finally {
      setLoading(false);
    }
  }

  const borderColor = type === 'militaire' ? 'border-red-500/30' : type === 'entreprise' ? 'border-sky-500/30' : 'border-emerald-500/30';
  const accentClass = type === 'militaire' ? 'text-red-300' : type === 'entreprise' ? 'text-sky-300' : 'text-emerald-300';

  function formatDate(dateStr: string) {
    return toLocaleDateStringUTC(dateStr, {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    }) + ' UTC';
  }

  return (
    <div className={`bg-slate-800/50 rounded-lg border ${borderColor}`}>
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full p-3 flex items-center justify-between text-left"
      >
        <div>
          <p className="font-medium text-slate-200">{label}</p>
          <p className="text-xs text-slate-500 font-mono truncate max-w-[200px]">{compte.vban}</p>
        </div>
        <div className="flex items-center gap-2">
          <span className={`font-bold ${compte.solde >= 0 ? 'text-emerald-300' : 'text-red-300'}`}>
            {compte.solde.toLocaleString('fr-FR')} F$
          </span>
          {expanded ? (
            <ChevronUp className="h-4 w-4 text-slate-400" />
          ) : (
            <ChevronDown className="h-4 w-4 text-slate-400" />
          )}
        </div>
      </button>

      {expanded && (
        <div className="px-3 pb-3 border-t border-slate-700/50 pt-3 space-y-3">
          <div className="grid gap-2 sm:grid-cols-2">
            <input
              type="number"
              value={montant}
              onChange={(e) => setMontant(e.target.value)}
              placeholder="Montant"
              min="1"
              className="input text-sm"
            />
            <input
              type="text"
              value={libelle}
              onChange={(e) => setLibelle(e.target.value)}
              placeholder="Libellé (optionnel)"
              className="input text-sm"
            />
          </div>
          
          {error && <p className="text-xs text-red-400">{error}</p>}
          
          <div className="flex gap-2">
            <button
              onClick={() => handleTransaction('credit')}
              disabled={loading || !montant || parseInt(montant) <= 0}
              className="flex-1 px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white rounded-lg text-sm font-medium transition-colors flex items-center justify-center gap-1"
            >
              {loading ? <RefreshCw className="h-3 w-3 animate-spin" /> : <Plus className="h-3 w-3" />}
              Créditer
            </button>
            <button
              onClick={() => handleTransaction('debit')}
              disabled={loading || !montant || parseInt(montant) <= 0}
              className="flex-1 px-3 py-1.5 bg-red-600 hover:bg-red-700 disabled:opacity-50 text-white rounded-lg text-sm font-medium transition-colors flex items-center justify-center gap-1"
            >
              {loading ? <RefreshCw className="h-3 w-3 animate-spin" /> : <Minus className="h-3 w-3" />}
              Débiter
            </button>
          </div>

          {loadingTransactions ? (
            <div className="flex items-center justify-center py-4">
              <Loader2 className="h-5 w-5 text-slate-400 animate-spin" />
              <span className="ml-2 text-xs text-slate-400">Chargement des transactions...</span>
            </div>
          ) : transactions.length > 0 ? (
            <div className="pt-2 border-t border-slate-700/50">
              <p className={`text-xs font-semibold ${accentClass} mb-2`}>Transactions récentes</p>
              <div className="space-y-2 max-h-64 overflow-y-auto">
                {transactions.map((t) => (
                  <div
                    key={t.id}
                    className="flex items-center justify-between text-xs bg-slate-900/40 rounded-md px-2 py-1.5 border border-slate-700/50"
                  >
                    <div className="min-w-0">
                      <p className="text-slate-200 truncate">{t.libelle || t.description || '—'}</p>
                      <p className="text-slate-500">{formatDate(t.created_at)}</p>
                    </div>
                    <span className={t.type === 'credit' ? 'text-emerald-400' : 'text-red-400'}>
                      {t.type === 'credit' ? '+' : '-'}{Math.abs(t.montant).toLocaleString('fr-FR')} F$
                    </span>
                  </div>
                ))}
              </div>
            </div>
          ) : (
            <p className="text-xs text-slate-500">Aucune transaction</p>
          )}
        </div>
      )}
    </div>
  );
}
