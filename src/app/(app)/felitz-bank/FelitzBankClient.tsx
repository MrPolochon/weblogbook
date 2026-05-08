'use client';

import { useState, useTransition, useEffect } from 'react';
import { ArrowUpRight, ArrowDownLeft, Send, RefreshCw, History, ChevronDown, ChevronUp } from 'lucide-react';
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
  const [showTransactions, setShowTransactions] = useState(false);
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

  const accentColor = isMilitaire ? 'red' : isEntreprise ? 'sky' : 'emerald';

  return (
    <div className="space-y-3 mt-3">
      {/* Bouton Virement */}
      <button
        onClick={() => setShowVirement(!showVirement)}
        className={`w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl font-medium text-sm transition-all ${
          showVirement
            ? 'bg-slate-800/60 text-slate-300 border border-slate-700/50'
            : `bg-${accentColor}-600/80 hover:bg-${accentColor}-600 text-white shadow-lg shadow-${accentColor}-900/20`
        }`}
      >
        <Send className="h-4 w-4" />
        {showVirement ? 'Masquer le formulaire' : 'Effectuer un virement'}
      </button>

      {success && (
        <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-emerald-500/10 border border-emerald-500/20 text-emerald-300 text-sm">
          <ArrowUpRight className="h-4 w-4" />
          {success}
        </div>
      )}

      {/* Formulaire Virement */}
      {showVirement && (
        <form onSubmit={handleVirement} className="rounded-xl border border-slate-800/50 bg-slate-800/20 p-4 space-y-3 animate-fade-in">
          <div>
            <label className="block text-[10px] uppercase tracking-wider text-slate-500 font-semibold mb-1.5">VBAN destinataire</label>
            <input
              type="text"
              value={vbanDest}
              onChange={(e) => setVbanDest(e.target.value)}
              placeholder="MIXOU... ENTERMIXOU... ARMYMIXOU..."
              className="input w-full font-mono text-sm"
              required
            />
          </div>
          <div>
            <label className="block text-[10px] uppercase tracking-wider text-slate-500 font-semibold mb-1.5">Montant (F$)</label>
            <input
              type="number"
              value={montant}
              onChange={(e) => setMontant(e.target.value)}
              min="1"
              className="input w-full tabular-nums"
              required
            />
          </div>
          <div>
            <label className="block text-[10px] uppercase tracking-wider text-slate-500 font-semibold mb-1.5">Libellé (optionnel)</label>
            <input
              type="text"
              value={libelle}
              onChange={(e) => setLibelle(e.target.value)}
              placeholder="Ex: Paiement carburant"
              className="input w-full"
            />
          </div>
          {error && (
            <div className="px-3 py-2 rounded-lg bg-red-500/10 border border-red-500/20 text-red-300 text-sm">
              {error}
            </div>
          )}
          <div className="flex gap-2 pt-1">
            <button
              type="submit"
              disabled={loading}
              className={`flex-1 px-4 py-2.5 bg-${accentColor}-600/80 hover:bg-${accentColor}-600 disabled:opacity-50 text-white rounded-xl font-medium text-sm transition-all flex items-center justify-center gap-2`}
            >
              {loading ? <RefreshCw className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
              Confirmer le virement
            </button>
            <button
              type="button"
              onClick={() => { setShowVirement(false); setError(''); }}
              className="px-4 py-2.5 bg-slate-800/60 hover:bg-slate-800 text-slate-300 rounded-xl font-medium text-sm transition-colors"
            >
              Annuler
            </button>
          </div>
        </form>
      )}

      {/* Historique des virements */}
      {!isMilitaire && virements.length > 0 && (
        <div>
          <button
            onClick={() => setShowTransactions(prev => !prev)}
            className="w-full flex items-center justify-between px-3 py-2 rounded-lg hover:bg-slate-800/40 transition-colors text-sm"
          >
            <span className="flex items-center gap-2 text-slate-400 font-medium">
              <History className="h-3.5 w-3.5" />
              Virements ({virements.length})
            </span>
            {showTransactions ? <ChevronUp className="h-3.5 w-3.5 text-slate-500" /> : <ChevronDown className="h-3.5 w-3.5 text-slate-500" />}
          </button>

          {showTransactions && (
            <div className="space-y-1 max-h-[300px] overflow-y-auto mt-1 animate-fade-in">
              {virements.map((v) => (
                <div key={v.id} className="flex items-center justify-between gap-2 px-3 py-2 rounded-lg hover:bg-slate-800/30 transition-colors">
                  <div className="min-w-0">
                    <p className="text-xs text-slate-300">
                      <span className="text-slate-500">→</span> <span className="font-mono text-sky-400/80">{v.compte_dest_vban}</span>
                      {v.libelle && <span className="text-slate-500 ml-1">— {v.libelle}</span>}
                    </p>
                    <p className="text-[10px] text-slate-600">{formatDate(v.created_at)}</p>
                  </div>
                  <span className="font-medium text-red-400/80 text-xs tabular-nums whitespace-nowrap">
                    -{v.montant.toLocaleString('fr-FR')} F$
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Historique des transactions */}
      {!isMilitaire && transactions.length > 0 && (
        <div>
          <div className="flex items-center gap-2 px-1 mb-2">
            <span className="text-[10px] text-slate-500 uppercase tracking-wider font-semibold">Transactions</span>
            <span className="text-[10px] text-slate-600 tabular-nums">{transactions.length}</span>
          </div>
          <div className="space-y-0.5 max-h-[400px] overflow-y-auto rounded-xl border border-slate-800/40 bg-slate-800/10">
            {transactions.map((t) => (
              <div
                key={t.id}
                className="flex items-center justify-between gap-3 px-3 py-2.5 hover:bg-slate-800/30 transition-colors border-b border-slate-800/20 last:border-0"
              >
                <div className="flex items-start gap-2.5 min-w-0">
                  <div className={`mt-0.5 p-1 rounded-md ${t.type === 'credit' ? 'bg-emerald-500/10' : 'bg-red-500/10'}`}>
                    {t.type === 'credit' ? (
                      <ArrowDownLeft className="h-3 w-3 text-emerald-400" />
                    ) : (
                      <ArrowUpRight className="h-3 w-3 text-red-400" />
                    )}
                  </div>
                  <div className="min-w-0">
                    <p className="text-xs text-slate-300 break-all leading-relaxed">{t.libelle || t.description || '—'}</p>
                    <p className="text-[10px] text-slate-600">{formatDate(t.created_at)}</p>
                  </div>
                </div>
                <span className={`font-medium text-xs tabular-nums whitespace-nowrap ${t.type === 'credit' ? 'text-emerald-400' : 'text-red-400'}`}>
                  {t.type === 'credit' ? '+' : '-'}{t.montant.toLocaleString('fr-FR')} F$
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {!isMilitaire && transactions.length === 0 && (
        <p className="text-xs text-slate-600 text-center py-2">Aucune transaction</p>
      )}
    </div>
  );
}
