'use client';

import { useState } from 'react';
import { ShoppingCart, RefreshCw, Building2, User } from 'lucide-react';
import { useRouter } from 'next/navigation';

interface Compagnie {
  id: string;
  nom: string;
  solde: number;
}

interface Props {
  avionId: string;
  avionNom: string;
  prix: number;
  soldePerso: number;
  compagnies: Compagnie[];
}

export default function MarketplaceClient({ avionId, avionNom, prix, soldePerso, compagnies }: Props) {
  const router = useRouter();
  const [showModal, setShowModal] = useState(false);
  const [pourCompagnie, setPourCompagnie] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const canBuyPersonal = soldePerso >= prix;
  const compagniesAffordable = compagnies.filter(c => c.solde >= prix);

  async function handleAchat() {
    setError('');
    setLoading(true);

    try {
      const res = await fetch('/api/marketplace', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type_avion_id: avionId,
          pour_compagnie_id: pourCompagnie || undefined
        })
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Erreur');

      setShowModal(false);
      router.refresh();
      alert(data.message || 'Achat effectué !');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erreur');
    } finally {
      setLoading(false);
    }
  }

  if (!canBuyPersonal && compagniesAffordable.length === 0) {
    return (
      <button 
        disabled 
        className="px-3 py-1.5 bg-slate-700 text-slate-500 rounded-lg text-sm font-medium cursor-not-allowed"
      >
        Solde insuffisant
      </button>
    );
  }

  return (
    <>
      <button
        onClick={() => setShowModal(true)}
        className="px-3 py-1.5 bg-purple-600 hover:bg-purple-700 text-white rounded-lg text-sm font-medium transition-colors flex items-center gap-1.5"
      >
        <ShoppingCart className="h-4 w-4" />
        Acheter
      </button>

      {showModal && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4">
          <div className="bg-slate-800 rounded-xl border border-slate-700 p-6 max-w-md w-full">
            <h3 className="text-lg font-semibold text-slate-100 mb-4">
              Acheter {avionNom}
            </h3>
            <p className="text-slate-400 mb-4">
              Prix : <span className="text-purple-300 font-bold">{prix.toLocaleString('fr-FR')} F$</span>
            </p>

            <div className="space-y-3 mb-6">
              {canBuyPersonal && (
                <button
                  onClick={() => setPourCompagnie(null)}
                  className={`w-full flex items-center gap-3 p-3 rounded-lg border transition-colors ${
                    pourCompagnie === null 
                      ? 'border-purple-500 bg-purple-500/20' 
                      : 'border-slate-600 hover:border-slate-500'
                  }`}
                >
                  <User className="h-5 w-5 text-emerald-400" />
                  <div className="text-left flex-1">
                    <p className="text-slate-200 font-medium">Usage personnel</p>
                    <p className="text-sm text-slate-400">Solde : {soldePerso.toLocaleString('fr-FR')} F$</p>
                  </div>
                </button>
              )}

              {compagniesAffordable.map((c) => (
                <button
                  key={c.id}
                  onClick={() => setPourCompagnie(c.id)}
                  className={`w-full flex items-center gap-3 p-3 rounded-lg border transition-colors ${
                    pourCompagnie === c.id 
                      ? 'border-purple-500 bg-purple-500/20' 
                      : 'border-slate-600 hover:border-slate-500'
                  }`}
                >
                  <Building2 className="h-5 w-5 text-sky-400" />
                  <div className="text-left flex-1">
                    <p className="text-slate-200 font-medium">{c.nom}</p>
                    <p className="text-sm text-slate-400">Solde : {c.solde.toLocaleString('fr-FR')} F$</p>
                  </div>
                </button>
              ))}
            </div>

            {error && <p className="text-sm text-red-400 mb-4">{error}</p>}

            <div className="flex gap-3">
              <button
                onClick={handleAchat}
                disabled={loading || (pourCompagnie === null && !canBuyPersonal)}
                className="flex-1 px-4 py-2 bg-purple-600 hover:bg-purple-700 disabled:opacity-50 text-white rounded-lg font-medium transition-colors flex items-center justify-center gap-2"
              >
                {loading ? <RefreshCw className="h-4 w-4 animate-spin" /> : <ShoppingCart className="h-4 w-4" />}
                Confirmer l&apos;achat
              </button>
              <button
                onClick={() => setShowModal(false)}
                className="px-4 py-2 bg-slate-700 hover:bg-slate-600 text-slate-200 rounded-lg font-medium transition-colors"
              >
                Annuler
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
