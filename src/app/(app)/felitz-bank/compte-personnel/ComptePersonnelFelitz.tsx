'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { Wallet, ArrowRightLeft, Plus, Copy, Check } from 'lucide-react';
import { format } from 'date-fns';
import { fr } from 'date-fns/locale';

type Compte = { id: string; vban: string; solde: number } | null;
type Transaction = {
  id: string;
  type: string;
  montant: number;
  titre: string;
  description: string | null;
  created_at: string;
};
type Virement = {
  id: string;
  compte_destinataire_vban: string;
  montant: number;
  libelle: string | null;
  created_at: string;
};

type Props = {
  compte: Compte;
  transactions: Transaction[];
  virements: Virement[];
  userId: string;
};

export default function ComptePersonnelFelitz({ compte, transactions, virements, userId }: Props) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [showVirementForm, setShowVirementForm] = useState(false);
  const [vbanCopied, setVbanCopied] = useState(false);
  const [virementData, setVirementData] = useState({
    destinataire_vban: '',
    montant: '',
    libelle: '',
  });

  useEffect(() => {
    if (!compte) {
      setLoading(true);
      fetch('/api/felitz/comptes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ type_compte: 'personnel' }),
      })
        .then((r) => r.json())
        .then((d) => {
          if (d.ok) {
            router.refresh();
          } else {
            alert(d.error || 'Erreur création compte');
          }
          setLoading(false);
        })
        .catch(() => {
          setLoading(false);
        });
    }
  }, [compte, router]);

  async function handleVirement(e: React.FormEvent) {
    e.preventDefault();
    if (!compte) return;
    setLoading(true);
    try {
      const res = await fetch('/api/felitz/virements', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          compte_emetteur_id: compte.id,
          destinataire_vban: virementData.destinataire_vban.trim(),
          montant: parseFloat(virementData.montant),
          libelle: virementData.libelle.trim() || null,
        }),
      });
      const d = await res.json();
      if (!res.ok) throw new Error(d.error || 'Erreur');
      setShowVirementForm(false);
      setVirementData({ destinataire_vban: '', montant: '', libelle: '' });
      router.refresh();
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Erreur');
    } finally {
      setLoading(false);
    }
  }

  function copyVban() {
    if (compte?.vban) {
      navigator.clipboard.writeText(compte.vban);
      setVbanCopied(true);
      setTimeout(() => setVbanCopied(false), 2000);
    }
  }

  if (loading && !compte) {
    return (
      <div className="card">
        <p className="text-slate-400 text-sm">Création du compte en cours…</p>
      </div>
    );
  }

  if (!compte) {
    return null;
  }

  return (
    <div className="space-y-6">
      <div className="card">
        <h2 className="text-lg font-medium text-slate-200 mb-4 flex items-center gap-2">
          <Wallet className="h-5 w-5" />
          Mon compte
        </h2>
        <div className="space-y-3">
          <div>
            <p className="text-slate-400 text-sm">VBAN</p>
            <div className="flex items-center gap-2">
              <p className="text-slate-100 font-mono text-lg">{compte.vban}</p>
              <button
                type="button"
                onClick={copyVban}
                className="text-slate-400 hover:text-slate-300"
                title="Copier le VBAN"
              >
                {vbanCopied ? <Check className="h-4 w-4 text-emerald-400" /> : <Copy className="h-4 w-4" />}
              </button>
            </div>
          </div>
          <div>
            <p className="text-slate-400 text-sm">Solde</p>
            <p className="text-slate-100 font-semibold text-2xl">
              {new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR' }).format(Number(compte.solde))}
            </p>
          </div>
        </div>
      </div>

      <div className="card">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-medium text-slate-200 flex items-center gap-2">
            <ArrowRightLeft className="h-5 w-5" />
            Mes virements
          </h2>
          <button
            type="button"
            onClick={() => setShowVirementForm(!showVirementForm)}
            className="btn-primary flex items-center gap-2"
            disabled={loading}
          >
            <Plus className="h-4 w-4" />
            Nouveau virement
          </button>
        </div>

        {showVirementForm && (
          <form onSubmit={handleVirement} className="mb-4 p-4 border border-slate-700/50 rounded-lg bg-slate-800/30 space-y-3">
            <div>
              <label className="label">VBAN destinataire</label>
              <input
                type="text"
                className="input font-mono"
                value={virementData.destinataire_vban}
                onChange={(e) => setVirementData({ ...virementData, destinataire_vban: e.target.value })}
                placeholder="MIXOUXXXXXXXXXXXXXXXXXXXXXX ou ENTERMIXOUXXXXXXXXXXXXXXXXXXX"
                required
              />
            </div>
            <div>
              <label className="label">Montant</label>
              <input
                type="number"
                className="input"
                value={virementData.montant}
                onChange={(e) => setVirementData({ ...virementData, montant: e.target.value })}
                placeholder="0.00"
                step="0.01"
                min="0.01"
                required
              />
            </div>
            <div>
              <label className="label">Libellé (optionnel)</label>
              <input
                type="text"
                className="input"
                value={virementData.libelle}
                onChange={(e) => setVirementData({ ...virementData, libelle: e.target.value })}
                placeholder="Ex: Paiement facture"
              />
            </div>
            <div className="flex items-center gap-2">
              <button type="submit" className="btn-primary" disabled={loading}>
                {loading ? 'Envoi…' : 'Envoyer'}
              </button>
              <button
                type="button"
                onClick={() => {
                  setShowVirementForm(false);
                  setVirementData({ destinataire_vban: '', montant: '', libelle: '' });
                }}
                className="btn-secondary"
                disabled={loading}
              >
                Annuler
              </button>
            </div>
          </form>
        )}

        {virements.length === 0 ? (
          <p className="text-slate-400 text-sm">Aucun virement.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-600 text-left text-slate-400">
                  <th className="pb-2 pr-4">Date</th>
                  <th className="pb-2 pr-4">Destinataire</th>
                  <th className="pb-2 pr-4">Montant</th>
                  <th className="pb-2">Libellé</th>
                </tr>
              </thead>
              <tbody>
                {virements.map((v) => (
                  <tr key={v.id} className="border-b border-slate-700/50">
                    <td className="py-2.5 pr-4 text-slate-300">
                      {format(new Date(v.created_at), 'dd MMM yyyy HH:mm', { locale: fr })}
                    </td>
                    <td className="py-2.5 pr-4 text-slate-300 font-mono text-xs">{v.compte_destinataire_vban}</td>
                    <td className="py-2.5 pr-4 text-red-400 font-semibold">
                      -{new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR' }).format(Number(v.montant))}
                    </td>
                    <td className="py-2.5 text-slate-400">{v.libelle || '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <div className="card">
        <h2 className="text-lg font-medium text-slate-200 mb-4">Transactions</h2>
        {transactions.length === 0 ? (
          <p className="text-slate-400 text-sm">Aucune transaction.</p>
        ) : (
          <div className="space-y-2">
            {transactions.map((t) => {
              const isCredit = Number(t.montant) > 0;
              return (
                <div key={t.id} className="flex items-center justify-between py-2 border-b border-slate-700/50 last:border-0">
                  <div className="flex-1">
                    <p className={`font-medium ${isCredit ? 'text-emerald-400' : 'text-red-400'}`}>
                      {isCredit ? '+' : '-'}
                      {new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR' }).format(Math.abs(Number(t.montant)))}
                    </p>
                    <p className="text-slate-300 text-sm">{t.titre}</p>
                    {t.description && <p className="text-slate-400 text-xs mt-0.5">{t.description}</p>}
                  </div>
                  <p className="text-slate-500 text-xs">
                    {format(new Date(t.created_at), 'dd MMM yyyy HH:mm', { locale: fr })}
                  </p>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
