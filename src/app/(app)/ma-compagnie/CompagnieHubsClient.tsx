'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { MapPin, Plus } from 'lucide-react';
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
  const [hubs, setHubs] = useState<Hub[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showAjouter, setShowAjouter] = useState(false);
  const [aeroportCode, setAeroportCode] = useState('');
  const [loadingAjouter, setLoadingAjouter] = useState(false);

  useEffect(() => {
    loadHubs();
  }, [compagnieId]);

  async function loadHubs() {
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
  }

  async function handleAjouter(e: React.FormEvent) {
    e.preventDefault();
    if (!aeroportCode.trim()) return;
    setLoadingAjouter(true);
    setError(null);

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
      router.refresh();
      loadHubs();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Erreur');
    } finally {
      setLoadingAjouter(false);
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
        <div className="flex flex-wrap gap-2">
          {hubs.map((h) => (
            <span
              key={h.id}
              className={`px-3 py-1.5 rounded-full text-sm font-medium ${
                h.est_hub_principal
                  ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30'
                  : 'bg-slate-700/50 text-slate-300'
              }`}
            >
              {h.aeroport_code}
              {h.est_hub_principal && ' (Principal)'}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}
