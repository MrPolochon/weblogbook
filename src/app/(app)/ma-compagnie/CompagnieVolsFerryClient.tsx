'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { Ship, Plus } from 'lucide-react';
import { COUT_VOL_FERRY } from '@/lib/compagnie-utils';

type VolFerry = {
  id: string;
  aeroport_depart: string;
  aeroport_arrivee: string;
  statut: string;
  duree_minutes: number | null;
  usure_appliquee: number | null;
  cout_ferry: number;
  created_at: string;
  avion: { id: string; immatriculation: string; nom_bapteme: string | null } | null;
  pilote: { id: string; identifiant: string } | null;
};

type Avion = {
  id: string;
  immatriculation: string;
  nom_bapteme: string | null;
  aeroport_actuel: string;
  statut: string;
  usure_percent: number;
};

type Hub = { aeroport_code: string };

export default function CompagnieVolsFerryClient({ compagnieId }: { compagnieId: string }) {
  const router = useRouter();
  const [vols, setVols] = useState<VolFerry[]>([]);
  const [avions, setAvions] = useState<Avion[]>([]);
  const [hubs, setHubs] = useState<Hub[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showCreer, setShowCreer] = useState(false);
  const [avionId, setAvionId] = useState('');
  const [hubArrivee, setHubArrivee] = useState('');
  const [loadingCreer, setLoadingCreer] = useState(false);

  useEffect(() => {
    loadVols();
    loadAvions();
    loadHubs();
  }, [compagnieId]);

  async function loadVols() {
    try {
      const res = await fetch(`/api/compagnies/vols-ferry?compagnie_id=${compagnieId}`);
      const d = await res.json().catch(() => ({}));
      if (res.ok) setVols(d || []);
      else setError(d.error || 'Erreur');
    } catch {
      setError('Erreur de chargement');
    } finally {
      setLoading(false);
    }
  }

  async function loadAvions() {
    try {
      const res = await fetch(`/api/compagnies/avions?compagnie_id=${compagnieId}`);
      const d = await res.json().catch(() => ({}));
      if (res.ok) {
        const avs = d || [];
        // Afficher les avions qui ne sont pas en vol
        setAvions(avs.filter((a: Avion) => a.statut !== 'in_flight'));
      }
    } catch {
      console.error('Erreur chargement avions');
    }
  }

  async function loadHubs() {
    try {
      const res = await fetch(`/api/compagnies/hubs?compagnie_id=${compagnieId}`);
      const d = await res.json().catch(() => ({}));
      if (res.ok) setHubs(d || []);
    } catch {
      console.error('Erreur chargement hubs');
    }
  }

  async function handleCreer(e: React.FormEvent) {
    e.preventDefault();
    if (!avionId || !hubArrivee) return;
    setLoadingCreer(true);
    setError(null);

    try {
      const res = await fetch('/api/compagnies/vols-ferry', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          compagnie_id: compagnieId,
          avion_id: avionId,
          aeroport_arrivee: hubArrivee,
        }),
      });
      const d = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(d.error || 'Erreur');

      setAvionId('');
      setHubArrivee('');
      setShowCreer(false);
      router.refresh();
      loadVols();
      loadAvions();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Erreur');
    } finally {
      setLoadingCreer(false);
    }
  }

  async function handleCloturer(volId: string) {
    if (!confirm('Clôturer ce vol ferry ? L\'usure sera appliquée et l\'avion sera déplacé.')) return;
    try {
      const res = await fetch(`/api/compagnies/vols-ferry/${volId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'cloturer' }),
      });
      const d = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(d.error || 'Erreur');
      alert(`Vol clôturé. Usure appliquée : ${d.usure_appliquee}%`);
      router.refresh();
      loadVols();
      loadAvions();
    } catch (e) {
      alert(e instanceof Error ? e.message : 'Erreur');
    }
  }

  async function handleAnnuler(volId: string) {
    if (!confirm('Annuler ce vol ferry ?')) return;
    try {
      const res = await fetch(`/api/compagnies/vols-ferry/${volId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'annuler' }),
      });
      const d = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(d.error || 'Erreur');
      router.refresh();
      loadVols();
      loadAvions();
    } catch (e) {
      alert(e instanceof Error ? e.message : 'Erreur');
    }
  }

  const avionSelectionne = avions.find((a) => a.id === avionId);
  const volsActifs = vols.filter(v => v.statut === 'planned' || v.statut === 'in_progress');

  function getStatutLabel(statut: string) {
    switch (statut) {
      case 'planned': return { text: 'Planifié', className: 'text-amber-400' };
      case 'in_progress': return { text: 'En cours', className: 'text-sky-400' };
      case 'completed': return { text: 'Terminé', className: 'text-emerald-400' };
      case 'cancelled': return { text: 'Annulé', className: 'text-slate-400' };
      default: return { text: statut, className: 'text-slate-400' };
    }
  }

  if (avions.length === 0 && vols.length === 0) {
    return null; // Ne pas afficher si pas d'avions individuels
  }

  return (
    <div className="card">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-lg font-semibold text-slate-100 flex items-center gap-2">
          <Ship className="h-5 w-5 text-amber-400" />
          Vols Ferry {volsActifs.length > 0 && `(${volsActifs.length} en cours)`}
        </h2>
        {avions.length > 0 && hubs.length > 0 && (
          <button
            type="button"
            onClick={() => setShowCreer(!showCreer)}
            className="text-sm text-sky-400 hover:text-sky-300 flex items-center gap-1"
          >
            <Plus className="h-4 w-4" />
            Nouveau vol ferry
          </button>
        )}
      </div>

      {error && <p className="text-red-400 text-sm mb-3">{error}</p>}

      {showCreer && (
        <form onSubmit={handleCreer} className="mb-4 p-4 bg-slate-800/50 rounded-lg space-y-3">
          <div>
            <label className="label">Avion</label>
            <select className="input" value={avionId} onChange={(e) => setAvionId(e.target.value)} required>
              <option value="">— Choisir —</option>
              {avions.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.immatriculation} {a.nom_bapteme ? `(${a.nom_bapteme})` : ''} — {a.aeroport_actuel} ({a.usure_percent}%) {a.statut === 'bloque' ? '[BLOQUÉ]' : ''}
                </option>
              ))}
            </select>
            {avionSelectionne && (
              <p className="text-slate-400 text-xs mt-1">
                Départ : {avionSelectionne.aeroport_actuel} → Arrivée : {hubArrivee || 'Sélectionnez un hub'}
                {avionSelectionne.statut === 'bloque' && <span className="text-amber-400 block mt-1">⚠️ Avion bloqué : débloquez-le d&apos;abord.</span>}
              </p>
            )}
          </div>
          <div>
            <label className="label">Hub d&apos;arrivée</label>
            <select className="input" value={hubArrivee} onChange={(e) => setHubArrivee(e.target.value)} required>
              <option value="">— Choisir —</option>
              {hubs.map((h) => (
                <option key={h.aeroport_code} value={h.aeroport_code}>
                  {h.aeroport_code}
                </option>
              ))}
            </select>
            <p className="text-slate-400 text-xs mt-1">
              L&apos;avion sera déplacé vers ce hub pour réparation. Coût : {COUT_VOL_FERRY.toLocaleString('fr-FR')} F$ (vol à vide).
            </p>
          </div>
          <div className="flex gap-2">
            <button type="submit" disabled={loadingCreer} className="btn-primary text-sm">
              {loadingCreer ? 'Création...' : 'Créer le vol'}
            </button>
            <button type="button" onClick={() => setShowCreer(false)} className="btn-secondary text-sm">
              Annuler
            </button>
          </div>
        </form>
      )}

      {loading ? (
        <p className="text-slate-400">Chargement...</p>
      ) : volsActifs.length === 0 ? (
        <p className="text-slate-400 text-sm">Aucun vol ferry en cours.</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-700 text-left text-slate-400">
                <th className="pb-2 pr-4">Avion</th>
                <th className="pb-2 pr-4">Trajet</th>
                <th className="pb-2 pr-4">Statut</th>
                <th className="pb-2">Actions</th>
              </tr>
            </thead>
            <tbody>
              {volsActifs.map((v) => {
                const statut = getStatutLabel(v.statut);
                const avionData = v.avion ? (Array.isArray(v.avion) ? v.avion[0] : v.avion) : null;
                return (
                  <tr key={v.id} className="border-b border-slate-700/50 last:border-0">
                    <td className="py-2.5 pr-4 font-mono text-slate-200">
                      {avionData?.immatriculation || '—'}
                    </td>
                    <td className="py-2.5 pr-4 text-slate-300">
                      {v.aeroport_depart} → {v.aeroport_arrivee}
                    </td>
                    <td className="py-2.5 pr-4">
                      <span className={statut.className}>{statut.text}</span>
                    </td>
                    <td className="py-2.5">
                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          onClick={() => handleCloturer(v.id)}
                          className="text-xs text-emerald-400 hover:underline"
                        >
                          Clôturer
                        </button>
                        <button
                          type="button"
                          onClick={() => handleAnnuler(v.id)}
                          className="text-xs text-red-400 hover:underline"
                        >
                          Annuler
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
