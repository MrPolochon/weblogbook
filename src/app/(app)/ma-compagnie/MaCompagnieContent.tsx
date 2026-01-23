'use client';

import { useState } from 'react';
import { Users, Plane, Edit2, X, Plus } from 'lucide-react';
import { format } from 'date-fns';
import { fr } from 'date-fns/locale';

function formatHeures(min: number): string {
  if (min === 0) return '0 h';
  const h = Math.floor(min / 60), m = min % 60;
  return m > 0 ? `${h} h ${m} min` : `${h} h`;
}

type Pilote = { identifiant: string; heures: number; isPDG: boolean };
type Avion = {
  id: string;
  nom: string | null;
  type: string;
  quantite: number;
  capacitePassagers: number | null;
  capaciteCargo: number | null;
  prixBillet: number | null;
  prixCargo: number | null;
  utilise: boolean;
};

type Props = {
  compagnieId: string;
  compagnieNom: string;
  pdgNom: string | null;
  isPDG: boolean;
  pourcentagePaie: number | null;
  pilotes: Pilote[];
  avions: Avion[];
};

let compagnieIdGlobal: string;

export default function MaCompagnieContent({
  compagnieId,
  compagnieNom,
  pdgNom,
  isPDG,
  pourcentagePaie,
  pilotes,
  avions,
}: Props) {
  compagnieIdGlobal = compagnieId;
  const [editingAvion, setEditingAvion] = useState<string | null>(null);
  const [formData, setFormData] = useState({
    capacitePassagers: '',
    capaciteCargo: '',
    nomAvion: '',
    prixBillet: '',
    prixCargo: '',
  });
  const [loading, setLoading] = useState(false);
  const [editingPaie, setEditingPaie] = useState(false);
  const [paie, setPaie] = useState(String(pourcentagePaie || 50));

  async function handleSaveAvion(avionId: string) {
    setLoading(true);
    try {
      const res = await fetch(`/api/compagnies/avions/${avionId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          capacite_passagers: formData.capacitePassagers ? Number(formData.capacitePassagers) : null,
          capacite_cargo_kg: formData.capaciteCargo ? Number(formData.capaciteCargo) : null,
          nom_avion: formData.nomAvion || null,
          prix_billet_base: formData.prixBillet ? Number(formData.prixBillet) : null,
          prix_cargo_kg: formData.prixCargo ? Number(formData.prixCargo) : null,
        }),
      });
      const d = await res.json();
      if (!res.ok) throw new Error(d.error || 'Erreur');
      setEditingAvion(null);
      window.location.reload();
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Erreur');
    } finally {
      setLoading(false);
    }
  }

  async function handleSavePaie() {
    setLoading(true);
    try {
      const res = await fetch(`/api/compagnies/${compagnieIdGlobal}/paie`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ pourcentage_paie: Number(paie) }),
      });
      const d = await res.json();
      if (!res.ok) throw new Error(d.error || 'Erreur');
      setEditingPaie(false);
      window.location.reload();
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Erreur');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold text-slate-100">{compagnieNom}</h1>

      {isPDG && (
        <div className="card">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-medium text-slate-200">Pourcentage de paie</h2>
            {!editingPaie ? (
              <button
                type="button"
                onClick={() => setEditingPaie(true)}
                className="text-sky-400 hover:text-sky-300"
              >
                <Edit2 className="h-4 w-4" />
              </button>
            ) : (
              <div className="flex items-center gap-2">
                <input
                  type="number"
                  className="input w-24"
                  value={paie}
                  onChange={(e) => setPaie(e.target.value)}
                  min="0"
                  max="100"
                  step="0.1"
                />
                <span className="text-slate-300">%</span>
                <button
                  type="button"
                  onClick={handleSavePaie}
                  className="btn-primary text-sm"
                  disabled={loading}
                >
                  Enregistrer
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setEditingPaie(false);
                    setPaie(String(pourcentagePaie || 50));
                  }}
                  className="text-slate-400 hover:text-slate-300"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
            )}
          </div>
          {!editingPaie && <p className="text-slate-300 text-lg">{pourcentagePaie || 50}%</p>}
        </div>
      )}

      <div className="card">
        <h2 className="text-lg font-medium text-slate-200 mb-4 flex items-center gap-2">
          <Users className="h-5 w-5" />
          Pilotes
        </h2>
        {pilotes.length === 0 ? (
          <p className="text-slate-400 text-sm">Aucun pilote.</p>
        ) : (
          <div className="space-y-2">
            {pilotes.map((p) => (
              <div key={p.identifiant} className="border border-slate-700/50 rounded-lg p-3 bg-slate-800/30">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-slate-200 font-medium">
                      {p.identifiant}
                      {p.isPDG && <span className="ml-2 text-xs text-amber-400">(PDG)</span>}
                    </p>
                    <p className="text-slate-400 text-sm mt-1">{formatHeures(p.heures)}</p>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="card">
        <h2 className="text-lg font-medium text-slate-200 mb-4 flex items-center gap-2">
          <Plane className="h-5 w-5" />
          Avions
        </h2>
        {avions.length === 0 ? (
          <p className="text-slate-400 text-sm">Aucun avion assigné.</p>
        ) : (
          <div className="space-y-3">
            {avions.map((a) => (
              <div key={a.id} className="border border-slate-700/50 rounded-lg p-3 bg-slate-800/30">
                <div className="flex items-start justify-between gap-2">
                  <div className="flex-1">
                    <p className="text-slate-200 font-medium">
                      {a.nom || a.type} {a.quantite > 1 && `(${a.quantite})`}
                    </p>
                    <div className="mt-2 space-y-1 text-sm">
                      {a.capacitePassagers && (
                        <p className="text-slate-400">Capacité passagers: {a.capacitePassagers}</p>
                      )}
                      {a.capaciteCargo && (
                        <p className="text-slate-400">Capacité cargo: {a.capaciteCargo} kg</p>
                      )}
                      {a.prixBillet && (
                        <p className="text-slate-400">Prix billet: {a.prixBillet.toFixed(2)} €</p>
                      )}
                      {a.prixCargo && (
                        <p className="text-slate-400">Prix cargo: {a.prixCargo.toFixed(2)} €/kg</p>
                      )}
                      <p className={`text-sm font-medium ${a.utilise ? 'text-amber-400' : 'text-emerald-400'}`}>
                        {a.utilise ? 'En utilisation' : 'Disponible'}
                      </p>
                    </div>
                  </div>
                  {isPDG && (
                    <div className="flex items-center gap-2">
                      {editingAvion === a.id ? (
                        <div className="flex flex-col gap-2 min-w-[200px]">
                          <input
                            type="text"
                            className="input text-sm"
                            placeholder="Nom avion"
                            value={formData.nomAvion}
                            onChange={(e) => setFormData({ ...formData, nomAvion: e.target.value })}
                          />
                          <input
                            type="number"
                            className="input text-sm"
                            placeholder="Capacité passagers"
                            value={formData.capacitePassagers}
                            onChange={(e) => setFormData({ ...formData, capacitePassagers: e.target.value })}
                          />
                          <input
                            type="number"
                            className="input text-sm"
                            placeholder="Capacité cargo (kg)"
                            value={formData.capaciteCargo}
                            onChange={(e) => setFormData({ ...formData, capaciteCargo: e.target.value })}
                          />
                          <input
                            type="number"
                            className="input text-sm"
                            placeholder="Prix billet (€)"
                            value={formData.prixBillet}
                            onChange={(e) => setFormData({ ...formData, prixBillet: e.target.value })}
                          />
                          <input
                            type="number"
                            className="input text-sm"
                            placeholder="Prix cargo (€/kg)"
                            value={formData.prixCargo}
                            onChange={(e) => setFormData({ ...formData, prixCargo: e.target.value })}
                          />
                          <div className="flex gap-2">
                            <button
                              type="button"
                              onClick={() => handleSaveAvion(a.id)}
                              className="btn-primary text-sm flex-1"
                              disabled={loading}
                            >
                              Enregistrer
                            </button>
                            <button
                              type="button"
                              onClick={() => {
                                setEditingAvion(null);
                                setFormData({ capacitePassagers: '', capaciteCargo: '', nomAvion: '', prixBillet: '', prixCargo: '' });
                              }}
                              className="text-slate-400 hover:text-slate-300"
                            >
                              <X className="h-4 w-4" />
                            </button>
                          </div>
                        </div>
                      ) : (
                        <button
                          type="button"
                          onClick={() => {
                            setEditingAvion(a.id);
                            setFormData({
                              nomAvion: a.nom || '',
                              capacitePassagers: String(a.capacitePassagers || ''),
                              capaciteCargo: String(a.capaciteCargo || ''),
                              prixBillet: String(a.prixBillet || ''),
                              prixCargo: String(a.prixCargo || ''),
                            });
                          }}
                          className="text-sky-400 hover:text-sky-300"
                        >
                          <Edit2 className="h-4 w-4" />
                        </button>
                      )}
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
