'use client';

import { useEffect, useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { Check, X, Ban } from 'lucide-react';

type Location = {
  id: string;
  avion_id: string;
  loueur_compagnie_id: string;
  locataire_compagnie_id: string;
  prix_journalier: number;
  pourcentage_revenu_loueur: number;
  duree_jours: number;
  statut: string;
  start_at?: string | null;
  end_at?: string | null;
};

type Compagnie = { id: string; nom: string };

export default function CompagnieLocationsClient({ compagnieId }: { compagnieId: string }) {
  const router = useRouter();
  const [locations, setLocations] = useState<Location[]>([]);
  const [compagnies, setCompagnies] = useState<Compagnie[]>([]);
  const [loading, setLoading] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [locRes, compRes] = await Promise.all([
        fetch(`/api/compagnies/locations?compagnie_id=${compagnieId}`),
        fetch('/api/compagnies/list')
      ]);
      const locData = await locRes.json().catch(() => []);
      const compData = await compRes.json().catch(() => []);
      if (Array.isArray(locData)) setLocations(locData);
      if (Array.isArray(compData)) setCompagnies(compData);
    } finally {
      setLoading(false);
    }
  }, [compagnieId]);

  useEffect(() => {
    load();
  }, [load]);

  const compagniesById = new Map(compagnies.map((c) => [c.id, c.nom]));
  const incoming = locations.filter((l) => l.locataire_compagnie_id === compagnieId && l.statut === 'pending');
  const outgoing = locations.filter((l) => l.loueur_compagnie_id === compagnieId && l.statut === 'pending');
  const active = locations.filter((l) => (l.loueur_compagnie_id === compagnieId || l.locataire_compagnie_id === compagnieId) && l.statut === 'active');

  async function handleAction(id: string, action: 'accept' | 'refuse' | 'cancel') {
    const res = await fetch(`/api/compagnies/locations/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action })
    });
    if (res.ok) {
      router.refresh();
      load();
    }
  }

  return (
    <div className="card">
      <h2 className="text-lg font-semibold text-slate-100 mb-4">Locations d&apos;avions</h2>
      {loading && <p className="text-slate-400 text-sm">Chargement...</p>}

      {incoming.length > 0 && (
        <div className="mb-4">
          <p className="text-sm text-slate-400 mb-2">Demandes reçues</p>
          <div className="space-y-2">
            {incoming.map((l) => (
              <div key={l.id} className="flex items-center justify-between rounded-lg border border-slate-700/50 bg-slate-800/30 p-3">
                <div className="text-sm text-slate-300">
                  <div>Loueur: {compagniesById.get(l.loueur_compagnie_id) || '—'}</div>
                  <div>Prix/jour: {l.prix_journalier.toLocaleString('fr-FR')} F$ • {l.duree_jours} jours</div>
                  <div>Part loueur: {l.pourcentage_revenu_loueur}%</div>
                </div>
                <div className="flex items-center gap-2">
                  <button className="btn-primary text-xs" onClick={() => handleAction(l.id, 'accept')}>
                    <Check className="h-3.5 w-3.5" /> Accepter
                  </button>
                  <button className="btn-danger text-xs" onClick={() => handleAction(l.id, 'refuse')}>
                    <X className="h-3.5 w-3.5" /> Refuser
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {outgoing.length > 0 && (
        <div className="mb-4">
          <p className="text-sm text-slate-400 mb-2">Demandes envoyées</p>
          <div className="space-y-2">
            {outgoing.map((l) => (
              <div key={l.id} className="flex items-center justify-between rounded-lg border border-slate-700/50 bg-slate-800/30 p-3">
                <div className="text-sm text-slate-300">
                  <div>Locataire: {compagniesById.get(l.locataire_compagnie_id) || '—'}</div>
                  <div>Prix/jour: {l.prix_journalier.toLocaleString('fr-FR')} F$ • {l.duree_jours} jours</div>
                  <div>Part loueur: {l.pourcentage_revenu_loueur}%</div>
                </div>
                <button className="btn-secondary text-xs" onClick={() => handleAction(l.id, 'cancel')}>
                  <Ban className="h-3.5 w-3.5" /> Annuler
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {active.length > 0 && (
        <div>
          <p className="text-sm text-slate-400 mb-2">Locations actives</p>
          <div className="space-y-2">
            {active.map((l) => (
              <div key={l.id} className="flex items-center justify-between rounded-lg border border-slate-700/50 bg-slate-800/30 p-3">
                <div className="text-sm text-slate-300">
                  <div>Loueur: {compagniesById.get(l.loueur_compagnie_id) || '—'}</div>
                  <div>Locataire: {compagniesById.get(l.locataire_compagnie_id) || '—'}</div>
                  <div>Prix/jour: {l.prix_journalier.toLocaleString('fr-FR')} F$ • Part loueur: {l.pourcentage_revenu_loueur}%</div>
                  <div>Fin: {l.end_at ? new Date(l.end_at).toLocaleDateString('fr-FR') : '—'}</div>
                </div>
                <button className="btn-secondary text-xs" onClick={() => handleAction(l.id, 'cancel')}>
                  <Ban className="h-3.5 w-3.5" /> Annuler
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {incoming.length === 0 && outgoing.length === 0 && active.length === 0 && !loading && (
        <p className="text-slate-500 text-sm">Aucune location en cours.</p>
      )}
    </div>
  );
}
