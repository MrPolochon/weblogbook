'use client';

import { useState, useTransition } from 'react';
import { Send, RefreshCw } from 'lucide-react';
import { useRouter } from 'next/navigation';
import FelitzTransactionsHistory, { type FelitzTransaction as Transaction } from '@/components/FelitzTransactionsHistory';

interface Props {
  compteId: string;
  solde: number;
  transactions: Transaction[];
}

export default function FelitzBankAtcClient({ compteId, transactions }: Props) {
  const router = useRouter();
  const [, startTransition] = useTransition();
  const [showVirement, setShowVirement] = useState(false);
  const [vbanDest, setVbanDest] = useState('');
  const [montant, setMontant] = useState('');
  const [libelle, setLibelle] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  async function handleVirement(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    setSuccess('');
    setLoading(true);

    try {
      const res = await fetch('/api/felitz/virement', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          compte_source_id: compteId,
          vban_destination: vbanDest.trim(),
          montant: parseInt(montant),
          libelle: libelle.trim() || undefined
        })
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Erreur');

      setSuccess('Virement effectué avec succès');
      setVbanDest('');
      setMontant('');
      setLibelle('');
      setShowVirement(false);
      startTransition(() => router.refresh());
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erreur');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="space-y-4 mt-4">
      {/* Bouton Virement */}
      <button
        onClick={() => setShowVirement(!showVirement)}
        className="w-full flex items-center justify-center gap-2 px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg font-medium transition-colors"
      >
        <Send className="h-4 w-4" />
        Effectuer un virement
      </button>

      {/* Formulaire Virement */}
      {showVirement && (
        <form onSubmit={handleVirement} className="bg-slate-50 rounded-lg p-4 border border-slate-200 space-y-3">
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">VBAN destinataire</label>
            <input
              type="text"
              value={vbanDest}
              onChange={(e) => setVbanDest(e.target.value)}
              placeholder="MIXOU... ENTERMIXOU... ARMYMIXOU... MIXALLIANCE..."
              className="w-full px-3 py-2 rounded-lg border border-slate-300 focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 font-mono text-sm"
              required
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Montant (F$)</label>
            <input
              type="number"
              value={montant}
              onChange={(e) => setMontant(e.target.value)}
              min="1"
              className="w-full px-3 py-2 rounded-lg border border-slate-300 focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500"
              required
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Libellé (optionnel)</label>
            <input
              type="text"
              value={libelle}
              onChange={(e) => setLibelle(e.target.value)}
              placeholder="Ex: Paiement carburant"
              className="w-full px-3 py-2 rounded-lg border border-slate-300 focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500"
            />
          </div>
          {error && <p className="text-sm text-red-600">{error}</p>}
          {success && <p className="text-sm text-emerald-600">{success}</p>}
          <div className="flex gap-2">
            <button
              type="submit"
              disabled={loading}
              className="flex-1 px-4 py-2 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white rounded-lg font-medium transition-colors flex items-center justify-center gap-2"
            >
              {loading ? <RefreshCw className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
              Envoyer
            </button>
            <button
              type="button"
              onClick={() => setShowVirement(false)}
              className="px-4 py-2 bg-slate-200 hover:bg-slate-300 text-slate-700 rounded-lg font-medium transition-colors"
            >
              Annuler
            </button>
          </div>
        </form>
      )}

      {/* Historique des transactions */}
      <div className="mt-6">
        <h3 className="text-sm font-semibold text-slate-700 mb-3">Dernières transactions</h3>
        <FelitzTransactionsHistory transactions={transactions} light maxHeight="500px" />
      </div>
    </div>
  );
}
