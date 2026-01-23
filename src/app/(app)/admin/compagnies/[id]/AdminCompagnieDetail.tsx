'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Users, Plane, Plus, Trash2, Edit2 } from 'lucide-react';

type Pilote = { id: string; identifiant: string };
type Employe = { id: string; identifiant: string; heures: number };
type TypeAvion = { id: string; nom: string; constructeur: string };
type Avion = { id: string; typeAvionId: string; typeNom: string; quantite: number };

type Props = {
  compagnieId: string;
  compagnieNom: string;
  pdgId: string | null;
  pdgNom: string | null;
  pourcentagePaie: number | null;
  pilotes: Pilote[];
  employes: Employe[];
  typesAvion: TypeAvion[];
  avions: Avion[];
};

export default function AdminCompagnieDetail({
  compagnieId,
  compagnieNom,
  pdgId,
  pdgNom,
  pourcentagePaie,
  pilotes,
  employes,
  typesAvion,
  avions,
}: Props) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [showAddEmploye, setShowAddEmploye] = useState(false);
  const [selectedPilote, setSelectedPilote] = useState('');
  const [showAddAvion, setShowAddAvion] = useState(false);
  const [selectedTypeAvion, setSelectedTypeAvion] = useState('');
  const [quantite, setQuantite] = useState('1');
  const [selectedPDG, setSelectedPDG] = useState(pdgId || '');

  async function handleAddEmploye() {
    if (!selectedPilote) return;
    setLoading(true);
    try {
      const res = await fetch('/api/compagnies/employes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ compagnie_id: compagnieId, user_id: selectedPilote }),
      });
      const d = await res.json();
      if (!res.ok) throw new Error(d.error || 'Erreur');
      setShowAddEmploye(false);
      setSelectedPilote('');
      router.refresh();
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Erreur');
    } finally {
      setLoading(false);
    }
  }

  async function handleRemoveEmploye(userId: string) {
    if (!confirm('Retirer cet employé de la compagnie ?')) return;
    setLoading(true);
    try {
      const res = await fetch(`/api/compagnies/employes?compagnie_id=${compagnieId}&user_id=${userId}`, {
        method: 'DELETE',
      });
      const d = await res.json();
      if (!res.ok) throw new Error(d.error || 'Erreur');
      router.refresh();
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Erreur');
    } finally {
      setLoading(false);
    }
  }

  async function handleAddAvion() {
    if (!selectedTypeAvion || !quantite || Number(quantite) < 1) return;
    setLoading(true);
    try {
      const res = await fetch('/api/compagnies/avions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          compagnie_id: compagnieId,
          type_avion_id: selectedTypeAvion,
          quantite: Number(quantite),
        }),
      });
      const d = await res.json();
      if (!res.ok) throw new Error(d.error || 'Erreur');
      setShowAddAvion(false);
      setSelectedTypeAvion('');
      setQuantite('1');
      router.refresh();
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Erreur');
    } finally {
      setLoading(false);
    }
  }

  async function handleRemoveAvion(avionId: string) {
    if (!confirm('Retirer cet avion de la compagnie ?')) return;
    setLoading(true);
    try {
      const res = await fetch(`/api/compagnies/avions/${avionId}`, { method: 'DELETE' });
      const d = await res.json();
      if (!res.ok) throw new Error(d.error || 'Erreur');
      router.refresh();
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Erreur');
    } finally {
      setLoading(false);
    }
  }

  async function handleSetPDG() {
    setLoading(true);
    try {
      const res = await fetch('/api/compagnies/pdg', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ compagnie_id: compagnieId, pdg_id: selectedPDG || null }),
      });
      const d = await res.json();
      if (!res.ok) throw new Error(d.error || 'Erreur');
      router.refresh();
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Erreur');
    } finally {
      setLoading(false);
    }
  }

  const pilotesDisponibles = pilotes.filter((p) => !employes.some((e) => e.id === p.id));

  return (
    <div className="space-y-6">
      <div className="card">
        <h2 className="text-lg font-medium text-slate-200 mb-4">PDG</h2>
        <div className="flex items-center gap-2">
          <select
            className="input flex-1"
            value={selectedPDG}
            onChange={(e) => setSelectedPDG(e.target.value)}
          >
            <option value="">— Aucun —</option>
            {pilotes.map((p) => (
              <option key={p.id} value={p.id}>
                {p.identifiant}
              </option>
            ))}
          </select>
          <button
            type="button"
            onClick={handleSetPDG}
            className="btn-primary"
            disabled={loading}
          >
            {loading ? 'Enregistrement…' : 'Définir PDG'}
          </button>
        </div>
        {pdgNom && <p className="text-slate-300 mt-2">PDG actuel: {pdgNom}</p>}
        {pourcentagePaie !== null && <p className="text-slate-400 text-sm mt-1">Pourcentage de paie: {pourcentagePaie}%</p>}
      </div>

      <div className="card">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-medium text-slate-200 flex items-center gap-2">
            <Users className="h-5 w-5" />
            Employés
          </h2>
          {pilotesDisponibles.length > 0 && (
            <button
              type="button"
              onClick={() => setShowAddEmploye(!showAddEmploye)}
              className="btn-primary flex items-center gap-2"
            >
              <Plus className="h-4 w-4" />
              Ajouter
            </button>
          )}
        </div>
        {showAddEmploye && (
          <div className="mb-4 p-4 border border-slate-700 rounded-lg bg-slate-800/30 space-y-3">
            <select
              className="input"
              value={selectedPilote}
              onChange={(e) => setSelectedPilote(e.target.value)}
            >
              <option value="">— Choisir —</option>
              {pilotesDisponibles.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.identifiant}
                </option>
              ))}
            </select>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={handleAddEmploye}
                className="btn-primary"
                disabled={loading || !selectedPilote}
              >
                Ajouter
              </button>
              <button
                type="button"
                onClick={() => {
                  setShowAddEmploye(false);
                  setSelectedPilote('');
                }}
                className="btn-secondary"
              >
                Annuler
              </button>
            </div>
          </div>
        )}
        {employes.length === 0 ? (
          <p className="text-slate-400 text-sm">Aucun employé.</p>
        ) : (
          <div className="space-y-2">
            {employes.map((e) => (
              <div key={e.id} className="border border-slate-700/50 rounded-lg p-3 bg-slate-800/30 flex items-center justify-between">
                <div>
                  <p className="text-slate-200 font-medium">{e.identifiant}</p>
                  <p className="text-slate-400 text-sm">{Math.floor(e.heures / 60)} h {e.heures % 60} min</p>
                </div>
                <button
                  type="button"
                  onClick={() => handleRemoveEmploye(e.id)}
                  className="text-red-400 hover:text-red-300"
                  disabled={loading}
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="card">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-medium text-slate-200 flex items-center gap-2">
            <Plane className="h-5 w-5" />
            Avions assignés
          </h2>
          <button
            type="button"
            onClick={() => setShowAddAvion(!showAddAvion)}
            className="btn-primary flex items-center gap-2"
          >
            <Plus className="h-4 w-4" />
            Ajouter
          </button>
        </div>
        {showAddAvion && (
          <div className="mb-4 p-4 border border-slate-700 rounded-lg bg-slate-800/30 space-y-3">
            <select
              className="input"
              value={selectedTypeAvion}
              onChange={(e) => setSelectedTypeAvion(e.target.value)}
            >
              <option value="">— Choisir —</option>
              {typesAvion.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.constructeur} {t.nom}
                </option>
              ))}
            </select>
            <div>
              <label className="label">Quantité</label>
              <input
                type="number"
                className="input w-32"
                value={quantite}
                onChange={(e) => setQuantite(e.target.value)}
                min="1"
              />
            </div>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={handleAddAvion}
                className="btn-primary"
                disabled={loading || !selectedTypeAvion}
              >
                Ajouter
              </button>
              <button
                type="button"
                onClick={() => {
                  setShowAddAvion(false);
                  setSelectedTypeAvion('');
                  setQuantite('1');
                }}
                className="btn-secondary"
              >
                Annuler
              </button>
            </div>
          </div>
        )}
        {avions.length === 0 ? (
          <p className="text-slate-400 text-sm">Aucun avion assigné.</p>
        ) : (
          <div className="space-y-2">
            {avions.map((a) => (
              <div key={a.id} className="border border-slate-700/50 rounded-lg p-3 bg-slate-800/30 flex items-center justify-between">
                <div>
                  <p className="text-slate-200 font-medium">{a.typeNom}</p>
                  <p className="text-slate-400 text-sm">Quantité: {a.quantite}</p>
                </div>
                <button
                  type="button"
                  onClick={() => handleRemoveAvion(a.id)}
                  className="text-red-400 hover:text-red-300"
                  disabled={loading}
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
