'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { Wallet, Send, History, Plus, X } from 'lucide-react';
import { format } from 'date-fns';
import { fr } from 'date-fns/locale';

type Transaction = {
  id: string;
  type: string;
  montant: number;
  titre: string | null;
  libelle: string | null;
  created_at: string;
};

type Virement = {
  id: string;
  montant: number;
  libelle: string | null;
  statut: string;
  created_at: string;
  felitz_comptes: { vban: string } | null;
};

type Props = { compteId: string; vban: string; solde: number };

export default function FelitzComptePersonnel({ compteId, vban, solde: soldeInitial }: Props) {
  const router = useRouter();
  const [solde, setSolde] = useState(soldeInitial);
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [virements, setVirements] = useState<Virement[]>([]);
  const [loading, setLoading] = useState(true);
  const [showVirement, setShowVirement] = useState(false);
  const [vbanDest, setVbanDest] = useState('');
  const [montant, setMontant] = useState('');
  const [libelle, setLibelle] = useState('');
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    Promise.all([
      fetch(`/api/felitz/transactions?compte_id=${compteId}`).then((r) => r.json()),
      fetch(`/api/felitz/virements?compte_id=${compteId}`).then((r) => r.json()),
    ]).then(([trans, vir]) => {
      if (trans.data) setTransactions(trans.data);
      if (vir.data) setVirements(vir.data);
      setLoading(false);
    });
  }, [compteId]);

  async function handleVirement(e: React.FormEvent) {
    e.preventDefault();
    if (!vbanDest || !montant || Number(montant) <= 0) return;
    if (Number(montant) > solde) {
      alert('Solde insuffisant');
      return;
    }
    setSubmitting(true);
    try {
      const res = await fetch('/api/felitz/virements', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          compte_emetteur_id: compteId,
          vban_destinataire: vbanDest.trim(),
          montant: Number(montant),
          libelle: libelle.trim() || null,
        }),
      });
      const d = await res.json();
      if (!res.ok) throw new Error(d.error || 'Erreur');
      setSolde(solde - Number(montant));
      setShowVirement(false);
      setVbanDest('');
      setMontant('');
      setLibelle('');
      router.refresh();
      const r = await fetch(`/api/felitz/transactions?compte_id=${compteId}`);
      const data = await r.json();
      if (data.data) setTransactions(data.data);
      const r2 = await fetch(`/api/felitz/virements?compte_id=${compteId}`);
      const data2 = await r2.json();
      if (data2.data) setVirements(data2.data);
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Erreur');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="space-y-6">
      <div className="card">
        <h2 className="text-lg font-medium text-slate-200 mb-4">Mon compte</h2>
        <div className="space-y-2">
          <div>
            <p className="text-slate-400 text-sm">VBAN</p>
            <p className="text-slate-100 font-mono text-lg">{vban}</p>
          </div>
          <div>
            <p className="text-slate-400 text-sm">Solde</p>
            <p className="text-slate-100 font-semibold text-2xl">{solde.toFixed(2)} €</p>
          </div>
        </div>
      </div>

      <div className="card">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-medium text-slate-200 flex items-center gap-2">
            <Send className="h-5 w-5" />
            Mes virements
          </h2>
          <button
            type="button"
            onClick={() => setShowVirement(!showVirement)}
            className="btn-primary flex items-center gap-2"
          >
            {showVirement ? <X className="h-4 w-4" /> : <Plus className="h-4 w-4" />}
            {showVirement ? 'Annuler' : 'Nouveau virement'}
          </button>
        </div>

        {showVirement && (
          <form onSubmit={handleVirement} className="mb-4 p-4 border border-slate-700 rounded-lg bg-slate-800/30 space-y-3">
            <div>
              <label className="label">VBAN destinataire</label>
              <input
                type="text"
                className="input"
                value={vbanDest}
                onChange={(e) => setVbanDest(e.target.value.toUpperCase())}
                placeholder="MIXOU..."
                required
              />
            </div>
            <div>
              <label className="label">Montant (€)</label>
              <input
                type="number"
                className="input"
                value={montant}
                onChange={(e) => setMontant(e.target.value)}
                min="0.01"
                step="0.01"
                required
              />
            </div>
            <div>
              <label className="label">Libellé (optionnel)</label>
              <input
                type="text"
                className="input"
                value={libelle}
                onChange={(e) => setLibelle(e.target.value)}
                placeholder="Raison du virement"
              />
            </div>
            <button type="submit" className="btn-primary" disabled={submitting}>
              {submitting ? 'Envoi…' : 'Effectuer le virement'}
            </button>
          </form>
        )}

        {loading ? (
          <p className="text-slate-400 text-sm">Chargement…</p>
        ) : virements.length === 0 ? (
          <p className="text-slate-400 text-sm">Aucun virement.</p>
        ) : (
          <div className="space-y-2">
            {virements.map((v) => (
              <div key={v.id} className="border border-slate-700/50 rounded-lg p-3 bg-slate-800/30">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-slate-200 font-medium">
                      {v.montant.toFixed(2)} € → {(v as any).felitz_comptes?.vban || 'VBAN inconnu'}
                    </p>
                    {v.libelle && <p className="text-slate-400 text-sm mt-1">{v.libelle}</p>}
                    <p className="text-slate-500 text-xs mt-1">
                      {format(new Date(v.created_at), 'dd MMM yyyy HH:mm', { locale: fr })}
                    </p>
                  </div>
                  <span className={`text-xs font-medium px-2 py-1 rounded ${
                    v.statut === 'effectue' ? 'bg-emerald-500/20 text-emerald-400' :
                    v.statut === 'refuse' ? 'bg-red-500/20 text-red-400' :
                    'bg-amber-500/20 text-amber-400'
                  }`}>
                    {v.statut === 'effectue' ? 'Effectué' : v.statut === 'refuse' ? 'Refusé' : 'En attente'}
                  </span>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="card">
        <h2 className="text-lg font-medium text-slate-200 mb-4 flex items-center gap-2">
          <History className="h-5 w-5" />
          Transactions
        </h2>
        {loading ? (
          <p className="text-slate-400 text-sm">Chargement…</p>
        ) : transactions.length === 0 ? (
          <p className="text-slate-400 text-sm">Aucune transaction.</p>
        ) : (
          <div className="space-y-2">
            {transactions.map((t) => (
              <div key={t.id} className="border border-slate-700/50 rounded-lg p-3 bg-slate-800/30">
                <div className="flex items-center justify-between">
                  <div>
                    <p className={`font-medium ${t.montant >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                      {t.montant >= 0 ? '+' : ''}{t.montant.toFixed(2)} €
                    </p>
                    <p className="text-slate-200 mt-1">{t.titre || t.type}</p>
                    {t.libelle && <p className="text-slate-400 text-sm mt-1">{t.libelle}</p>}
                    <p className="text-slate-500 text-xs mt-1">
                      {format(new Date(t.created_at), 'dd MMM yyyy HH:mm', { locale: fr })}
                    </p>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
