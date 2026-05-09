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

export default function FelitzBankSiaviClient({ compteId, transactions }: Props) {
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
        className="w-full flex items-center justify-center gap-2 px-4 py-2 bg-red-600 hover:bg-red-700 text-white rounded-lg font-medium transition-colors"
      >
        <Send className="h-4 w-4" />
        Effectuer un virement
      </button>

      {/* Formulaire Virement */}
      {showVirement && (
        <form onSubmit={handleVirement} className="bg-red-50 rounded-lg p-4 border border-red-200 space-y-3">
          <div>
            <label className="block text-sm font-medium text-red-800 mb-1">VBAN destinataire</label>
            <input
              type="text"
              value={vbanDest}
              onChange={(e) => setVbanDest(e.target.value)}
              placeholder="MIXOU... ENTERMIXOU... ARMYMIXOU... MIXALLIANCE..."
              className="w-full px-3 py-2 rounded-lg border border-red-300 focus:ring-2 focus:ring-red-500 focus:border-red-500 font-mono text-sm bg-white"
              required
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-red-800 mb-1">Montant (F$)</label>
            <input
              type="number"
              value={montant}
              onChange={(e) => setMontant(e.target.value)}
              min="1"
              className="w-full px-3 py-2 rounded-lg border border-red-300 focus:ring-2 focus:ring-red-500 focus:border-red-500 bg-white"
              required
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-red-800 mb-1">Libellé (optionnel)</label>
            <input
              type="text"
              value={libelle}
              onChange={(e) => setLibelle(e.target.value)}
              placeholder="Ex: Paiement carburant"
              className="w-full px-3 py-2 rounded-lg border border-red-300 focus:ring-2 focus:ring-red-500 focus:border-red-500 bg-white"
            />
          </div>
          {error && <p className="text-sm text-red-700">{error}</p>}
          {success && <p className="text-sm text-emerald-700">{success}</p>}
          <div className="flex gap-2">
            <button
              type="submit"
              disabled={loading}
              className="flex-1 px-4 py-2 bg-red-600 hover:bg-red-700 disabled:opacity-50 text-white rounded-lg font-medium transition-colors flex items-center justify-center gap-2"
            >
              {loading ? <RefreshCw className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
              Envoyer
            </button>
            <button
              type="button"
              onClick={() => setShowVirement(false)}
              className="px-4 py-2 bg-red-200 hover:bg-red-300 text-red-800 rounded-lg font-medium transition-colors"
            >
              Annuler
            </button>
          </div>
        </form>
      )}

      {/* Historique des transactions */}
      <div className="mt-6">
        <h3 className="text-sm font-semibold text-red-800 mb-3">Dernières transactions</h3>
        <FelitzTransactionsHistory transactions={transactions} light maxHeight="500px" />
      </div>
    </div>
  );
}
