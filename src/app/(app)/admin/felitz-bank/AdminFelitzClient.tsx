'use client';

import { useState, useEffect, useCallback, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Plus, Minus, RefreshCw, ChevronDown, ChevronUp, Loader2 } from 'lucide-react';
import FelitzTransactionsHistory, { type FelitzTransaction } from '@/components/FelitzTransactionsHistory';

interface Compte {
  id: string;
  vban: string;
  solde: number;
}

type Transaction = FelitzTransaction;

interface Props {
  compte: Compte;
  label: string;
  type: 'personnel' | 'entreprise' | 'militaire' | 'alliance' | 'reparation';
}

export default function AdminFelitzClient({ compte, label, type }: Props) {
  const router = useRouter();
  const [, startTransition] = useTransition();
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
      startTransition(() => router.refresh());
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erreur');
    } finally {
      setLoading(false);
    }
  }

  const borderColor = type === 'militaire' ? 'border-red-500/30' : type === 'entreprise' ? 'border-sky-500/30' : type === 'alliance' ? 'border-violet-500/30' : type === 'reparation' ? 'border-orange-500/30' : 'border-emerald-500/30';
  const accentClass = type === 'militaire' ? 'text-red-300' : type === 'entreprise' ? 'text-sky-300' : type === 'alliance' ? 'text-violet-300' : type === 'reparation' ? 'text-orange-300' : 'text-emerald-300';

  return (
    <div className={`bg-slate-800/50 rounded-lg border ${borderColor}`}>
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full p-3 flex items-center justify-between text-left"
      >
        <div className="min-w-0 flex-1">
          <p className="font-medium text-slate-200">{label}</p>
          <p className="text-xs text-slate-400 font-mono break-all" title="VBAN">
            VBAN: {compte.vban}
          </p>
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
          ) : (
            <div className="pt-2 border-t border-slate-700/50">
              <p className={`text-xs font-semibold ${accentClass} mb-2`}>Transactions récentes</p>
              <FelitzTransactionsHistory transactions={transactions} maxHeight="500px" />
            </div>
          )}
        </div>
      )}
    </div>
  );
}
