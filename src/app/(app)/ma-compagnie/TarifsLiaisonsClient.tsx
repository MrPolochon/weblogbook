'use client';

import { useState, useEffect } from 'react';
import { AEROPORTS_PTFS, getAeroportInfo, PRIX_OPTIMAL_PAX } from '@/lib/aeroports-ptfs';
import { DollarSign, Plus, Trash2, RefreshCw, Route, ArrowLeftRight, Info } from 'lucide-react';

interface TarifLiaison {
  id: string;
  compagnie_id: string;
  aeroport_depart: string;
  aeroport_arrivee: string;
  prix_billet: number;
  bidirectionnel: boolean;
}

interface Props {
  compagnieId: string;
  prixBilletDefaut: number;
}

export default function TarifsLiaisonsClient({ compagnieId, prixBilletDefaut }: Props) {
  const [tarifs, setTarifs] = useState<TarifLiaison[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  // Nouveau tarif
  const [newDepart, setNewDepart] = useState('');
  const [newArrivee, setNewArrivee] = useState('');
  const [newPrix, setNewPrix] = useState(prixBilletDefaut.toString());
  const [newBidirectionnel, setNewBidirectionnel] = useState(true);

  useEffect(() => {
    async function fetchTarifs() {
      setLoading(true);
      try {
        const res = await fetch(`/api/tarifs-liaisons?compagnie_id=${compagnieId}`);
        const data = await res.json();
        if (res.ok) {
          setTarifs(data);
        }
      } catch (e) {
        console.error(e);
      } finally {
        setLoading(false);
      }
    }
    fetchTarifs();
  }, [compagnieId]);

  async function refreshTarifs() {
    setLoading(true);
    try {
      const res = await fetch(`/api/tarifs-liaisons?compagnie_id=${compagnieId}`);
      const data = await res.json();
      if (res.ok) {
        setTarifs(data);
      }
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  }

  async function handleAddTarif() {
    if (!newDepart || !newArrivee || newDepart === newArrivee) {
      setError('Sélectionnez deux aéroports différents');
      return;
    }

    setSaving(true);
    setError('');
    setSuccess('');

    try {
      const res = await fetch('/api/tarifs-liaisons', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          compagnie_id: compagnieId,
          aeroport_depart: newDepart,
          aeroport_arrivee: newArrivee,
          prix_billet: parseInt(newPrix) || prixBilletDefaut,
          bidirectionnel: newBidirectionnel,
        }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Erreur');

      setSuccess('Tarif ajouté');
      setNewDepart('');
      setNewArrivee('');
      setNewPrix(prixBilletDefaut.toString());
      refreshTarifs();
      setTimeout(() => setSuccess(''), 3000);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erreur');
    } finally {
      setSaving(false);
    }
  }

  async function handleDeleteTarif(tarif: TarifLiaison) {
    if (!confirm(`Supprimer le tarif ${tarif.aeroport_depart} → ${tarif.aeroport_arrivee} ?`)) return;

    try {
      const res = await fetch(`/api/tarifs-liaisons?id=${tarif.id}&delete_both=${tarif.bidirectionnel}`, {
        method: 'DELETE',
      });
      if (!res.ok) throw new Error('Erreur');
      refreshTarifs();
    } catch (e) {
      console.error(e);
    }
  }

  function getImpactIndicator(prix: number, codeDepart: string, codeArrivee: string): { color: string; text: string } {
    const aeroportDepart = getAeroportInfo(codeDepart);
    const aeroportArrivee = getAeroportInfo(codeArrivee);
    
    const isInternational = aeroportDepart?.taille === 'international' || aeroportArrivee?.taille === 'international';
    const isTouristique = aeroportArrivee?.tourisme;
    
    // Calculer l'impact estimé
    let seuil = PRIX_OPTIMAL_PAX;
    if (isInternational) seuil *= 1.5; // Les internationaux tolèrent des prix plus élevés
    if (isTouristique) seuil *= 1.3; // Les destinations touristiques aussi
    
    if (prix <= seuil * 0.8) {
      return { color: 'text-emerald-400', text: 'Excellent remplissage' };
    } else if (prix <= seuil) {
      return { color: 'text-green-400', text: 'Bon remplissage' };
    } else if (prix <= seuil * 1.5) {
      return { color: 'text-yellow-400', text: 'Remplissage moyen' };
    } else if (prix <= seuil * 2) {
      return { color: 'text-orange-400', text: 'Remplissage faible' };
    } else {
      return { color: 'text-red-400', text: 'Remplissage très faible' };
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-8">
        <RefreshCw className="h-6 w-6 animate-spin text-slate-400" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2 text-slate-400 text-sm">
        <Info className="h-4 w-4" />
        <span>Définissez des prix personnalisés par liaison. Sans tarif défini, le prix par défaut de la compagnie s&apos;applique.</span>
      </div>

      {/* Formulaire d'ajout */}
      <div className="p-4 rounded-lg bg-slate-800/50 border border-slate-700 space-y-3">
        <h3 className="font-medium text-slate-200 flex items-center gap-2">
          <Plus className="h-4 w-4 text-emerald-400" />
          Ajouter un tarif
        </h3>
        
        <div className="grid gap-3 sm:grid-cols-4">
          <div>
            <label className="text-xs text-slate-400">Départ</label>
            <select 
              className="input w-full text-sm" 
              value={newDepart} 
              onChange={(e) => setNewDepart(e.target.value)}
            >
              <option value="">— Choisir —</option>
              {AEROPORTS_PTFS.map((a) => (
                <option key={a.code} value={a.code}>
                  {a.code} – {a.nom}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="text-xs text-slate-400">Arrivée</label>
            <select 
              className="input w-full text-sm" 
              value={newArrivee} 
              onChange={(e) => setNewArrivee(e.target.value)}
            >
              <option value="">— Choisir —</option>
              {AEROPORTS_PTFS.map((a) => (
                <option key={a.code} value={a.code}>
                  {a.code} – {a.nom}
                  {a.tourisme && ' 🏖️'}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="text-xs text-slate-400">Prix (F$)</label>
            <input
              type="number"
              className="input w-full text-sm"
              value={newPrix}
              onChange={(e) => setNewPrix(e.target.value)}
              min="1"
            />
          </div>
          <div className="flex items-end gap-2">
            <label className="flex items-center gap-2 cursor-pointer text-sm text-slate-300">
              <input
                type="checkbox"
                checked={newBidirectionnel}
                onChange={(e) => setNewBidirectionnel(e.target.checked)}
                className="rounded"
              />
              <ArrowLeftRight className="h-4 w-4" />
              2 sens
            </label>
          </div>
        </div>

        {/* Indicateur d'impact */}
        {newDepart && newArrivee && newDepart !== newArrivee && (
          <div className="text-sm">
            {(() => {
              const impact = getImpactIndicator(parseInt(newPrix) || 0, newDepart, newArrivee);
              return (
                <span className={impact.color}>→ {impact.text}</span>
              );
            })()}
            {getAeroportInfo(newArrivee)?.tourisme && (
              <span className="ml-2 text-amber-400">🏖️ Destination touristique</span>
            )}
          </div>
        )}

        {error && <p className="text-red-400 text-sm">{error}</p>}
        {success && <p className="text-emerald-400 text-sm">{success}</p>}

        <button
          onClick={handleAddTarif}
          disabled={saving || !newDepart || !newArrivee}
          className="btn-primary text-sm flex items-center gap-2"
        >
          {saving ? <RefreshCw className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
          Ajouter
        </button>
      </div>

      {/* Liste des tarifs */}
      {tarifs.length > 0 ? (
        <div className="space-y-2">
          <h3 className="font-medium text-slate-200 flex items-center gap-2">
            <Route className="h-4 w-4 text-sky-400" />
            Tarifs définis ({tarifs.length})
          </h3>
          <div className="space-y-1">
            {tarifs.map((tarif) => {
              const impact = getImpactIndicator(tarif.prix_billet, tarif.aeroport_depart, tarif.aeroport_arrivee);
              const aeroportArrivee = getAeroportInfo(tarif.aeroport_arrivee);
              
              return (
                <div
                  key={tarif.id}
                  className="flex items-center justify-between p-3 rounded-lg bg-slate-800/30 border border-slate-700/50"
                >
                  <div className="flex items-center gap-3">
                    <span className="font-mono text-sm text-slate-200">
                      {tarif.aeroport_depart}
                      {tarif.bidirectionnel ? ' ↔ ' : ' → '}
                      {tarif.aeroport_arrivee}
                    </span>
                    {aeroportArrivee?.tourisme && (
                      <span className="text-amber-400 text-xs">🏖️</span>
                    )}
                  </div>
                  <div className="flex items-center gap-4">
                    <div className="text-right">
                      <span className="text-emerald-400 font-medium">{tarif.prix_billet} F$</span>
                      <span className={`ml-2 text-xs ${impact.color}`}>{impact.text}</span>
                    </div>
                    <button
                      onClick={() => handleDeleteTarif(tarif)}
                      className="p-1.5 rounded hover:bg-red-500/20 text-red-400 transition-colors"
                      title="Supprimer"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      ) : (
        <p className="text-slate-500 text-sm italic">
          Aucun tarif personnalisé. Le prix par défaut ({prixBilletDefaut} F$) s&apos;applique à toutes les liaisons.
        </p>
      )}
    </div>
  );
}
