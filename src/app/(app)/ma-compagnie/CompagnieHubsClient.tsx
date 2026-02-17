'use client';

import { useState, useEffect, useCallback, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { MapPin, Plus, Trash2, Star, X } from 'lucide-react';
import { calculerPrixHub } from '@/lib/compagnie-utils';

type Hub = {
  id: string;
  aeroport_code: string;
  est_hub_principal: boolean;
  prix_achat: number;
  created_at: string;
};

export default function CompagnieHubsClient({ compagnieId }: { compagnieId: string }) {
  const router = useRouter();
  const [, startTransition] = useTransition();
  const [hubs, setHubs] = useState<Hub[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [showAjouter, setShowAjouter] = useState(false);
  const [aeroportCode, setAeroportCode] = useState('');
  const [loadingAjouter, setLoadingAjouter] = useState(false);
  const [loadingAction, setLoadingAction] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);

  const loadHubs = useCallback(async () => {
    try {
      const res = await fetch(`/api/compagnies/hubs?compagnie_id=${compagnieId}`);
      const d = await res.json().catch(() => ({}));
      if (res.ok) setHubs(d || []);
      else setError(d.error || 'Erreur');
    } catch {
      setError('Erreur de chargement');
    } finally {
      setLoading(false);
    }
  }, [compagnieId]);

  useEffect(() => {
    loadHubs();
  }, [loadHubs]);

  async function handleAjouter(e: React.FormEvent) {
    e.preventDefault();
    if (!aeroportCode.trim()) return;
    setLoadingAjouter(true);
    setError(null);
    setSuccess(null);

    try {
      const res = await fetch('/api/compagnies/hubs', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ compagnie_id: compagnieId, aeroport_code: aeroportCode }),
      });
      const d = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(d.error || 'Erreur');
      
      setAeroportCode('');
      setShowAjouter(false);
      setSuccess(`Hub ${aeroportCode.toUpperCase()} ajouté avec succès.`);
      startTransition(() => router.refresh());
      loadHubs();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Erreur');
    } finally {
      setLoadingAjouter(false);
    }
  }

  async function handleSupprimer(hubId: string) {
    setLoadingAction(hubId);
    setError(null);
    setSuccess(null);

    try {
      const res = await fetch('/api/compagnies/hubs', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ compagnie_id: compagnieId, hub_id: hubId }),
      });
      const d = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(d.error || 'Erreur');

      setConfirmDelete(null);

      // Message de succès détaillé
      let msg = 'Hub supprimé.';
      if (d.taxes_payees > 0) {
        msg += ` Taxes aéroportuaires payées : ${d.taxes_payees.toLocaleString('fr-FR')} F$ (${d.avions_en_maintenance} avion(s) en maintenance).`;
      }
      if (d.nouveau_principal) {
        msg += ` Nouveau hub principal : ${d.nouveau_principal}.`;
      }
      setSuccess(msg);
      startTransition(() => router.refresh());
      loadHubs();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Erreur');
    } finally {
      setLoadingAction(null);
    }
  }

  async function handleDefinirPrincipal(hubId: string) {
    setLoadingAction(hubId);
    setError(null);
    setSuccess(null);

    try {
      const res = await fetch('/api/compagnies/hubs', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ compagnie_id: compagnieId, hub_id: hubId }),
      });
      const d = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(d.error || 'Erreur');

      setSuccess('Hub principal mis à jour.');
      startTransition(() => router.refresh());
      loadHubs();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Erreur');
    } finally {
      setLoadingAction(null);
    }
  }

  const prixProchainHub = calculerPrixHub(hubs.length + 1);

  return (
    <div className="card">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-lg font-semibold text-slate-100 flex items-center gap-2">
          <MapPin className="h-5 w-5 text-emerald-400" />
          Hubs ({hubs.length})
        </h2>
        <button
          type="button"
          onClick={() => setShowAjouter(!showAjouter)}
          className="text-sm text-sky-400 hover:text-sky-300 flex items-center gap-1"
        >
          <Plus className="h-4 w-4" />
          Ajouter un hub
        </button>
      </div>

      {error && <p className="text-red-400 text-sm mb-3">{error}</p>}
      {success && <p className="text-emerald-400 text-sm mb-3">{success}</p>}

      {showAjouter && (
        <form onSubmit={handleAjouter} className="mb-4 p-4 bg-slate-800/50 rounded-lg space-y-3">
          <div>
            <label className="label">Code OACI de l&apos;aéroport</label>
            <input
              type="text"
              value={aeroportCode}
              onChange={(e) => setAeroportCode(e.target.value.toUpperCase())}
              placeholder="Ex: IRFD"
              className="input"
              maxLength={4}
              required
            />
          </div>
          <p className="text-slate-400 text-sm">
            Prix : <span className="text-emerald-400 font-medium">
              {prixProchainHub === 0 ? 'Gratuit' : `${prixProchainHub.toLocaleString('fr-FR')} F$`}
            </span>
          </p>
          <div className="flex gap-2">
            <button type="submit" disabled={loadingAjouter} className="btn-primary text-sm">
              {loadingAjouter ? 'Ajout...' : 'Ajouter'}
            </button>
            <button type="button" onClick={() => setShowAjouter(false)} className="btn-secondary text-sm">
              Annuler
            </button>
          </div>
        </form>
      )}

      {loading ? (
        <p className="text-slate-400">Chargement...</p>
      ) : hubs.length === 0 ? (
        <p className="text-slate-400">Aucun hub. Ajoutez votre premier hub (gratuit) pour pouvoir réparer vos avions.</p>
      ) : (
        <div className="space-y-2">
          {hubs.map((h) => (
            <div
              key={h.id}
              className={`flex items-center justify-between px-4 py-2.5 rounded-lg ${
                h.est_hub_principal
                  ? 'bg-emerald-500/15 border border-emerald-500/30'
                  : 'bg-slate-700/40 border border-slate-600/30'
              }`}
            >
              <div className="flex items-center gap-2.5">
                {h.est_hub_principal && <Star className="h-4 w-4 text-emerald-400 fill-emerald-400" />}
                <span className={`font-mono font-bold text-sm ${h.est_hub_principal ? 'text-emerald-300' : 'text-slate-200'}`}>
                  {h.aeroport_code}
                </span>
                {h.est_hub_principal && (
                  <span className="text-xs text-emerald-400/80 font-medium">Hub principal</span>
                )}
              </div>

              <div className="flex items-center gap-1.5">
                {/* Bouton : Définir comme principal (uniquement pour les hubs secondaires) */}
                {!h.est_hub_principal && (
                  <button
                    type="button"
                    onClick={() => handleDefinirPrincipal(h.id)}
                    disabled={loadingAction !== null}
                    className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-medium text-amber-300 bg-amber-500/15 hover:bg-amber-500/25 border border-amber-500/30 rounded-md transition-colors disabled:opacity-50"
                    title="Définir comme hub principal (1 changement / semaine)"
                  >
                    <Star className="h-3 w-3" />
                    {loadingAction === h.id ? '...' : 'Principal'}
                  </button>
                )}

                {/* Bouton : Supprimer — avec confirmation */}
                {/* Interdit de supprimer le dernier hub */}
                {hubs.length > 1 && (
                  confirmDelete === h.id ? (
                    <div className="flex items-center gap-1">
                      <div className="text-xs text-red-400 font-medium max-w-[200px]">
                        <span>Supprimer ?</span>
                        {h.est_hub_principal && <span className="block text-amber-400">Un autre hub sera auto-assigné principal.</span>}
                      </div>
                      <button
                        type="button"
                        onClick={() => handleSupprimer(h.id)}
                        disabled={loadingAction !== null}
                        className="px-2 py-1 text-xs font-bold text-white bg-red-600 hover:bg-red-700 rounded-md transition-colors disabled:opacity-50"
                      >
                        {loadingAction === h.id ? '...' : 'Oui'}
                      </button>
                      <button
                        type="button"
                        onClick={() => setConfirmDelete(null)}
                        className="p-1 text-slate-400 hover:text-slate-200 transition-colors"
                      >
                        <X className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  ) : (
                    <button
                      type="button"
                      onClick={() => setConfirmDelete(h.id)}
                      disabled={loadingAction !== null}
                      className="inline-flex items-center gap-1 px-2 py-1 text-xs font-medium text-red-400 hover:text-red-300 bg-red-500/10 hover:bg-red-500/20 border border-red-500/20 rounded-md transition-colors disabled:opacity-50"
                      title="Supprimer ce hub"
                    >
                      <Trash2 className="h-3 w-3" />
                    </button>
                  )
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Note d'information */}
      {hubs.length > 0 && (
        <p className="text-xs text-slate-500 mt-3">
          Changement de hub principal limité à 1 fois par semaine. La suppression d&apos;un hub avec des avions en maintenance entraîne des taxes aéroportuaires.
        </p>
      )}
    </div>
  );
}
