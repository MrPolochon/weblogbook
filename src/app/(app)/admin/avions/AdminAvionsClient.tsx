'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { Plane, MapPin, Edit2, Trash2, Save, X, RefreshCw, Building2 } from 'lucide-react';
import { AEROPORTS_PTFS } from '@/lib/aeroports-ptfs';

type Avion = {
  id: string;
  immatriculation: string;
  nom_bapteme: string | null;
  usure_percent: number;
  aeroport_actuel: string;
  statut: string;
  created_at: string;
  types_avion: { id: string; nom: string; constructeur: string } | { id: string; nom: string; constructeur: string }[] | null;
  compagnies: { id: string; nom: string } | { id: string; nom: string }[] | null;
};

const STATUTS = ['ground', 'in_flight', 'maintenance', 'bloque'] as const;

export default function AdminAvionsClient() {
  const router = useRouter();
  const [avions, setAvions] = useState<Avion[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editData, setEditData] = useState<{
    aeroport_actuel: string;
    statut: string;
    usure_percent: number;
    immatriculation: string;
    nom_bapteme: string;
  } | null>(null);
  const [saving, setSaving] = useState(false);
  const [filter, setFilter] = useState('');

  useEffect(() => {
    loadAvions();
  }, []);

  async function loadAvions() {
    setLoading(true);
    try {
      const res = await fetch('/api/admin/avions');
      const data = await res.json();
      if (res.ok) {
        setAvions(data || []);
      } else {
        setError(data.error || 'Erreur');
      }
    } catch {
      setError('Erreur de chargement');
    } finally {
      setLoading(false);
    }
  }

  function startEdit(avion: Avion) {
    setEditingId(avion.id);
    setEditData({
      aeroport_actuel: avion.aeroport_actuel,
      statut: avion.statut,
      usure_percent: avion.usure_percent,
      immatriculation: avion.immatriculation,
      nom_bapteme: avion.nom_bapteme || '',
    });
  }

  function cancelEdit() {
    setEditingId(null);
    setEditData(null);
  }

  async function saveEdit() {
    if (!editingId || !editData) return;
    setSaving(true);
    setError(null);

    try {
      const res = await fetch('/api/admin/avions', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: editingId, ...editData }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Erreur');
      
      setEditingId(null);
      setEditData(null);
      loadAvions();
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Erreur');
    } finally {
      setSaving(false);
    }
  }

  async function deleteAvion(id: string, immat: string) {
    if (!confirm(`Supprimer définitivement l'avion ${immat} ?`)) return;
    
    try {
      const res = await fetch(`/api/admin/avions?id=${id}`, { method: 'DELETE' });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Erreur');
      loadAvions();
      router.refresh();
    } catch (e) {
      alert(e instanceof Error ? e.message : 'Erreur');
    }
  }

  function getStatutLabel(statut: string) {
    switch (statut) {
      case 'ground': return { text: 'Au sol', className: 'bg-emerald-500/20 text-emerald-400' };
      case 'in_flight': return { text: 'En vol', className: 'bg-sky-500/20 text-sky-400' };
      case 'maintenance': return { text: 'Maintenance', className: 'bg-amber-500/20 text-amber-400' };
      case 'bloque': return { text: 'Bloqué', className: 'bg-red-500/20 text-red-400' };
      default: return { text: statut, className: 'bg-slate-500/20 text-slate-400' };
    }
  }

  const filteredAvions = avions.filter(a => {
    if (!filter) return true;
    const f = filter.toLowerCase();
    const compagnieNom = Array.isArray(a.compagnies) ? a.compagnies[0]?.nom : a.compagnies?.nom;
    const typeNom = Array.isArray(a.types_avion) ? a.types_avion[0]?.nom : a.types_avion?.nom;
    return (
      a.immatriculation.toLowerCase().includes(f) ||
      a.nom_bapteme?.toLowerCase().includes(f) ||
      a.aeroport_actuel.toLowerCase().includes(f) ||
      compagnieNom?.toLowerCase().includes(f) ||
      typeNom?.toLowerCase().includes(f)
    );
  });

  return (
    <div className="space-y-4">
      {/* Filtres */}
      <div className="flex items-center gap-4">
        <input
          type="text"
          placeholder="Rechercher (immat, compagnie, aéroport...)"
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
          className="input flex-1"
        />
        <button
          onClick={loadAvions}
          className="btn-secondary flex items-center gap-2"
        >
          <RefreshCw className="h-4 w-4" />
          Actualiser
        </button>
      </div>

      {error && <p className="text-red-400 text-sm">{error}</p>}

      {loading ? (
        <div className="card">
          <p className="text-slate-400">Chargement...</p>
        </div>
      ) : avions.length === 0 ? (
        <div className="card">
          <p className="text-slate-400">Aucun avion dans la base de données.</p>
        </div>
      ) : (
        <div className="card overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-700 text-left text-slate-400">
                <th className="pb-2 pr-4">Immatriculation</th>
                <th className="pb-2 pr-4">Nom</th>
                <th className="pb-2 pr-4">Compagnie</th>
                <th className="pb-2 pr-4">Type</th>
                <th className="pb-2 pr-4">Position</th>
                <th className="pb-2 pr-4">Usure</th>
                <th className="pb-2 pr-4">Statut</th>
                <th className="pb-2">Actions</th>
              </tr>
            </thead>
            <tbody>
              {filteredAvions.map((avion) => {
                const isEditing = editingId === avion.id;
                const compagnieNom = Array.isArray(avion.compagnies) ? avion.compagnies[0]?.nom : avion.compagnies?.nom;
                const typeNom = Array.isArray(avion.types_avion) ? avion.types_avion[0]?.nom : avion.types_avion?.nom;
                const statut = getStatutLabel(avion.statut);

                return (
                  <tr key={avion.id} className="border-b border-slate-700/50 last:border-0">
                    <td className="py-2.5 pr-4">
                      {isEditing && editData ? (
                        <input
                          type="text"
                          value={editData.immatriculation}
                          onChange={(e) => setEditData({ ...editData, immatriculation: e.target.value.toUpperCase() })}
                          className="input py-1 px-2 w-24 text-sm font-mono"
                        />
                      ) : (
                        <span className="font-mono font-medium text-slate-200">{avion.immatriculation}</span>
                      )}
                    </td>
                    <td className="py-2.5 pr-4">
                      {isEditing && editData ? (
                        <input
                          type="text"
                          value={editData.nom_bapteme}
                          onChange={(e) => setEditData({ ...editData, nom_bapteme: e.target.value })}
                          className="input py-1 px-2 w-28 text-sm"
                          placeholder="Nom"
                        />
                      ) : (
                        <span className="text-slate-400">{avion.nom_bapteme || '—'}</span>
                      )}
                    </td>
                    <td className="py-2.5 pr-4">
                      <span className="text-slate-300 flex items-center gap-1">
                        <Building2 className="h-3 w-3 text-sky-400" />
                        {compagnieNom || '—'}
                      </span>
                    </td>
                    <td className="py-2.5 pr-4 text-slate-300">{typeNom || '—'}</td>
                    <td className="py-2.5 pr-4">
                      {isEditing && editData ? (
                        <select
                          value={editData.aeroport_actuel}
                          onChange={(e) => setEditData({ ...editData, aeroport_actuel: e.target.value })}
                          className="input py-1 px-2 text-sm"
                        >
                          {AEROPORTS_PTFS.map((a) => (
                            <option key={a.code} value={a.code}>
                              {a.code} - {a.nom}
                            </option>
                          ))}
                        </select>
                      ) : (
                        <span className="text-slate-300 flex items-center gap-1">
                          <MapPin className="h-3 w-3 text-emerald-400" />
                          {avion.aeroport_actuel}
                        </span>
                      )}
                    </td>
                    <td className="py-2.5 pr-4">
                      {isEditing && editData ? (
                        <input
                          type="number"
                          min="0"
                          max="100"
                          value={editData.usure_percent}
                          onChange={(e) => setEditData({ ...editData, usure_percent: parseInt(e.target.value) || 0 })}
                          className="input py-1 px-2 w-16 text-sm"
                        />
                      ) : (
                        <span className={avion.usure_percent >= 70 ? 'text-emerald-400' : avion.usure_percent >= 30 ? 'text-amber-400' : 'text-red-400'}>
                          {avion.usure_percent}%
                        </span>
                      )}
                    </td>
                    <td className="py-2.5 pr-4">
                      {isEditing && editData ? (
                        <select
                          value={editData.statut}
                          onChange={(e) => setEditData({ ...editData, statut: e.target.value })}
                          className="input py-1 px-2 text-sm"
                        >
                          {STATUTS.map((s) => (
                            <option key={s} value={s}>{getStatutLabel(s).text}</option>
                          ))}
                        </select>
                      ) : (
                        <span className={`px-2 py-0.5 rounded text-xs font-medium ${statut.className}`}>
                          {statut.text}
                        </span>
                      )}
                    </td>
                    <td className="py-2.5">
                      {isEditing ? (
                        <div className="flex items-center gap-2">
                          <button
                            onClick={saveEdit}
                            disabled={saving}
                            className="text-emerald-400 hover:text-emerald-300 disabled:opacity-50"
                            title="Sauvegarder"
                          >
                            <Save className="h-4 w-4" />
                          </button>
                          <button
                            onClick={cancelEdit}
                            className="text-slate-400 hover:text-slate-300"
                            title="Annuler"
                          >
                            <X className="h-4 w-4" />
                          </button>
                        </div>
                      ) : (
                        <div className="flex items-center gap-2">
                          <button
                            onClick={() => startEdit(avion)}
                            className="text-sky-400 hover:text-sky-300"
                            title="Modifier"
                          >
                            <Edit2 className="h-4 w-4" />
                          </button>
                          <button
                            onClick={() => deleteAvion(avion.id, avion.immatriculation)}
                            className="text-red-400 hover:text-red-300"
                            title="Supprimer"
                          >
                            <Trash2 className="h-4 w-4" />
                          </button>
                        </div>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          
          <p className="text-slate-500 text-xs mt-4">
            {filteredAvions.length} avion(s) affiché(s) sur {avions.length}
          </p>
        </div>
      )}
    </div>
  );
}
