'use client';

import { useState, useTransition } from 'react';
import { ShoppingCart, RefreshCw, Building2, User, X } from 'lucide-react';
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
  estMilitaire: boolean;
  soldePerso: number;
  compagnies: Compagnie[];
  armeeCompte?: { id: string; solde: number } | null;
}

export default function MarketplaceClient({ avionId, avionNom, prix, estMilitaire, soldePerso, compagnies, armeeCompte = null }: Props) {
  const router = useRouter();
  const [, startTransition] = useTransition();
  const [showModal, setShowModal] = useState(false);
  const [pourCompagnie, setPourCompagnie] = useState<string | null>(null);
  const [pourArmee, setPourArmee] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  const canBuyPersonal = soldePerso >= prix;
  const compagniesAffordable = compagnies.filter(c => c.solde >= prix);
  const canBuyArmee = Boolean(armeeCompte && armeeCompte.solde >= prix && estMilitaire);

  function closeModal() {
    if (loading) return; // Pas de fermeture pendant le chargement
    setShowModal(false);
    setError('');
    setSuccess('');
    setPourCompagnie(null);
    setPourArmee(false);
  }

  async function handleAchat() {
    setError('');
    setSuccess('');
    setLoading(true);

    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 30000); // 30s timeout

      const res = await fetch('/api/marketplace', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type_avion_id: avionId,
          pour_compagnie_id: pourArmee ? undefined : (pourCompagnie || undefined),
          pour_armee: pourArmee || undefined
        }),
        signal: controller.signal,
      });

      clearTimeout(timeout);

      let data;
      try {
        data = await res.json();
      } catch {
        throw new Error(`Erreur serveur (${res.status}). Veuillez réessayer.`);
      }

      if (!res.ok) throw new Error(data.error || `Erreur ${res.status}`);

      setSuccess(data.message || 'Achat effectué !');
      // Fermer le modal après 2s et rafraîchir
      setTimeout(() => {
        setShowModal(false);
        setSuccess('');
        setPourCompagnie(null);
        setPourArmee(false);
        startTransition(() => router.refresh());
      }, 2000);
    } catch (err) {
      if (err instanceof DOMException && err.name === 'AbortError') {
        setError('La requête a pris trop de temps. Vérifiez votre connexion et réessayez.');
      } else {
        setError(err instanceof Error ? err.message : 'Erreur inconnue');
      }
    } finally {
      setLoading(false);
    }
  }

  if (!canBuyPersonal && compagniesAffordable.length === 0 && !canBuyArmee) {
    return (
      <button 
        disabled 
        className="px-3 py-1.5 bg-slate-700 text-slate-500 rounded-lg text-sm font-medium cursor-not-allowed"
      >
        Solde insuffisant
      </button>
    );
  }

  // Déterminer si le bouton "Confirmer" doit être actif
  // L'utilisateur doit avoir sélectionné une source de paiement
  const hasSelection = pourArmee || pourCompagnie !== null || canBuyPersonal;
  // Si seulement canBuyPersonal et pas de compagnie/armée sélectionnée : achat perso par défaut
  const isPersoDefault = canBuyPersonal && !pourCompagnie && !pourArmee;
  const canConfirm = hasSelection && (pourCompagnie || pourArmee || isPersoDefault);

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
        <div 
          className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4"
          onClick={(e) => { if (e.target === e.currentTarget) closeModal(); }}
        >
          <div className="bg-slate-800 rounded-xl border border-slate-700 p-6 max-w-md w-full relative animate-in fade-in zoom-in-95 duration-200">
            {/* Bouton fermer */}
            <button
              onClick={closeModal}
              disabled={loading}
              className="absolute top-3 right-3 text-slate-500 hover:text-slate-300 transition-colors disabled:opacity-30"
            >
              <X className="h-5 w-5" />
            </button>

            <h3 className="text-lg font-semibold text-slate-100 mb-4 pr-8">
              Acheter {avionNom}
            </h3>
            <p className="text-slate-400 mb-4">
              Prix : <span className="text-purple-300 font-bold">{prix.toLocaleString('fr-FR')} F$</span>
            </p>

            {/* Succès */}
            {success && (
              <div className="p-4 rounded-xl bg-emerald-500/20 border border-emerald-500/40 mb-4">
                <p className="text-emerald-300 font-medium text-center">{success}</p>
              </div>
            )}

            {/* Choix du payeur */}
            {!success && (
              <>
                <p className="text-xs text-slate-500 mb-2">Choisissez le compte à débiter :</p>
                <div className="space-y-3 mb-6">
                  {canBuyPersonal && (
                    <button
                      onClick={() => { setPourCompagnie(null); setPourArmee(false); }}
                      className={`w-full flex items-center gap-3 p-3 rounded-lg border transition-colors ${
                        pourCompagnie === null && !pourArmee
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
                      onClick={() => { setPourCompagnie(c.id); setPourArmee(false); }}
                      className={`w-full flex items-center gap-3 p-3 rounded-lg border transition-colors ${
                        pourCompagnie === c.id && !pourArmee
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
                  {armeeCompte && estMilitaire && (
                    <button
                      onClick={() => { setPourCompagnie(null); setPourArmee(true); }}
                      className={`w-full flex items-center gap-3 p-3 rounded-lg border transition-colors ${
                        pourArmee
                          ? 'border-red-500 bg-red-500/20'
                          : 'border-slate-600 hover:border-slate-500'
                      }`}
                    >
                      <Building2 className="h-5 w-5 text-red-400" />
                      <div className="text-left flex-1">
                        <p className="text-slate-200 font-medium">Armée (PDG)</p>
                        <p className="text-sm text-slate-400">Solde : {armeeCompte.solde.toLocaleString('fr-FR')} F$</p>
                      </div>
                    </button>
                  )}
                </div>

                {/* Erreur bien visible */}
                {error && (
                  <div className="p-4 rounded-xl bg-red-500/20 border border-red-500/40 mb-4">
                    <p className="text-red-300 font-medium text-sm">{error}</p>
                  </div>
                )}

                <div className="flex gap-3">
                  <button
                    onClick={handleAchat}
                    disabled={loading || !canConfirm}
                    className="flex-1 px-4 py-2.5 bg-purple-600 hover:bg-purple-700 disabled:opacity-50 disabled:cursor-not-allowed text-white rounded-lg font-medium transition-colors flex items-center justify-center gap-2"
                  >
                    {loading ? <RefreshCw className="h-4 w-4 animate-spin" /> : <ShoppingCart className="h-4 w-4" />}
                    {loading ? 'Achat en cours…' : 'Confirmer l\'achat'}
                  </button>
                  <button
                    onClick={closeModal}
                    disabled={loading}
                    className="px-4 py-2.5 bg-slate-700 hover:bg-slate-600 disabled:opacity-50 text-slate-200 rounded-lg font-medium transition-colors"
                  >
                    Annuler
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </>
  );
}
