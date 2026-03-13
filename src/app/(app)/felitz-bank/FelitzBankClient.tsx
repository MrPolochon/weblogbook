'use client';

import { useState, useTransition, useEffect } from 'react';
import { ArrowUpRight, ArrowDownLeft, Send, RefreshCw, History } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { toLocaleDateStringUTC } from '@/lib/date-utils';

interface Transaction {
  id: string;
  type: string;
  montant: number;
  libelle: string;
  description?: string | null;
  created_at: string;
}

interface Virement {
  id: string;
  compte_source_id: string;
  compte_dest_vban: string;
  montant: number;
  libelle?: string | null;
  created_at: string;
}

interface Props {
  compteId: string;
  solde: number;
  transactions: Transaction[];
  isAdmin: boolean;
  isEntreprise?: boolean;
  isMilitaire?: boolean;
  compagnieNom?: string;
}

export default function FelitzBankClient({ compteId, transactions, isAdmin, isEntreprise, isMilitaire }: Props) {
  const router = useRouter();
  const [, startTransition] = useTransition();
  const [showVirement, setShowVirement] = useState(false);
  const [vbanDest, setVbanDest] = useState('');
  const [montant, setMontant] = useState('');
  const [libelle, setLibelle] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [virements, setVirements] = useState<Virement[]>([]);

  useEffect(() => {
    fetch(`/api/felitz/virement?compte_id=${compteId}`)
      .then(r => r.ok ? r.json() : [])
      .then(d => setVirements(Array.isArray(d) ? d : []))
      .catch(() => setVirements([]));
  }, [compteId]);

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
      setVirements(prev => [data.virement, ...prev].filter(Boolean).slice(0, 50));
      startTransition(() => router.refresh());
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erreur');
    } finally {
      setLoading(false);
    }
  }

  function formatDate(dateStr: string) {
    return toLocaleDateStringUTC(dateStr, {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    }) + ' UTC';
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
        <form onSubmit={handleVirement} className="bg-slate-800/50 rounded-lg p-4 border border-slate-700/50 space-y-3">
          <div>
            <label className="block text-sm font-medium text-slate-300 mb-1">VBAN destinataire</label>
            <input
              type="text"
              value={vbanDest}
              onChange={(e) => setVbanDest(e.target.value)}
              placeholder="MIXOU... ENTERMIXOU... ARMYMIXOU... MIXALLIANCE..."
              className="input w-full font-mono text-sm"
              required
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-300 mb-1">Montant (F$)</label>
            <input
              type="number"
              value={montant}
              onChange={(e) => setMontant(e.target.value)}
              min="1"
              className="input w-full"
              required
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-300 mb-1">Libellé (optionnel)</label>
            <input
              type="text"
              value={libelle}
              onChange={(e) => setLibelle(e.target.value)}
              placeholder="Ex: Paiement carburant"
              className="input w-full"
            />
          </div>
          {error && <p className="text-sm text-red-400">{error}</p>}
          {success && <p className="text-sm text-emerald-400">{success}</p>}
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
              className="px-4 py-2 bg-slate-700 hover:bg-slate-600 text-slate-200 rounded-lg font-medium transition-colors"
            >
              Annuler
            </button>
          </div>
        </form>
      )}

      {/* Historique des virements */}
      {!isMilitaire && virements.length > 0 && (
        <div className="mt-6">
          <h3 className="text-sm font-semibold text-slate-300 mb-3 flex items-center gap-2">
            <History className="h-4 w-4" /> Historique des virements
          </h3>
          <div className="space-y-2 max-h-[300px] overflow-y-auto mb-6">
            {virements.map((v) => (
              <div key={v.id} className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 bg-slate-800/30 rounded-lg p-3 border border-slate-700/30">
                <div className="min-w-0">
                  <p className="text-sm text-slate-200">
                    → <span className="font-mono text-sky-400">{v.compte_dest_vban}</span>
                    {v.libelle && <span className="text-slate-400 ml-1">— {v.libelle}</span>}
                  </p>
                  <p className="text-xs text-slate-500">{formatDate(v.created_at)}</p>
                </div>
                <span className="font-semibold text-red-400 sm:whitespace-nowrap">
                  -{v.montant.toLocaleString('fr-FR')} F$
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Historique des transactions */}
      {!isMilitaire && (
        <div className="mt-6">
          <h3 className="text-sm font-semibold text-slate-300 mb-3">Dernières transactions</h3>
          {transactions.length > 0 ? (
            <div className="space-y-2 max-h-[500px] overflow-y-auto">
              {transactions.map((t) => (
                <div 
                  key={t.id} 
                  className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 bg-slate-800/30 rounded-lg p-3 border border-slate-700/30"
                >
                  <div className="flex items-start gap-3 min-w-0">
                    {t.type === 'credit' ? (
                      <ArrowDownLeft className="h-4 w-4 text-emerald-400" />
                    ) : (
                      <ArrowUpRight className="h-4 w-4 text-red-400" />
                    )}
                    <div className="min-w-0">
                      <p className="text-sm text-slate-200 break-all">{t.libelle || t.description || '—'}</p>
                      <p className="text-xs text-slate-500">{formatDate(t.created_at)}</p>
                    </div>
                  </div>
                  <span className={`font-semibold ${t.type === 'credit' ? 'text-emerald-400' : 'text-red-400'} sm:whitespace-nowrap`}>
                    {t.type === 'credit' ? '+' : '-'}{t.montant.toLocaleString('fr-FR')} F$
                  </span>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-sm text-slate-500">Aucune transaction</p>
          )}
        </div>
      )}
    </div>
  );
}
