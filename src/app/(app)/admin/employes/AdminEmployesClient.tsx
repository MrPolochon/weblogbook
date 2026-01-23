'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Plus, Trash2, RefreshCw, Building2, User } from 'lucide-react';

interface Compagnie {
  id: string;
  nom: string;
  pdg_id: string | null;
  profiles: { identifiant: string }[] | { identifiant: string } | null;
}

interface Pilote {
  id: string;
  identifiant: string;
}

interface Employe {
  id: string;
  compagnie_id: string;
  pilote_id: string;
  date_embauche: string;
  profiles: { id: string; identifiant: string } | null;
  compagnies: { id: string; nom: string } | null;
}

interface Props {
  compagnies: Compagnie[];
  pilotes: Pilote[];
  employes: Employe[];
}

function getProfileIdentifiant(profiles: Compagnie['profiles']): string | null {
  if (!profiles) return null;
  if (Array.isArray(profiles)) return profiles[0]?.identifiant || null;
  return profiles.identifiant || null;
}

export default function AdminEmployesClient({ compagnies, pilotes, employes }: Props) {
  const router = useRouter();
  const [selectedCompagnie, setSelectedCompagnie] = useState('');
  const [selectedPilote, setSelectedPilote] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  // Pilotes déjà employés dans la compagnie sélectionnée (pour éviter les doublons)
  const pilotesDejaEmployesDansCompagnie = new Set(
    employes.filter(e => e.compagnie_id === selectedCompagnie).map(e => e.pilote_id)
  );
  
  // Tous les pilotes sont disponibles, sauf ceux déjà dans la compagnie sélectionnée
  const pilotesDisponibles = selectedCompagnie 
    ? pilotes.filter(p => !pilotesDejaEmployesDansCompagnie.has(p.id))
    : pilotes;
  
  // Compter les compagnies de chaque pilote
  const compagniesParPilote: Record<string, string[]> = {};
  employes.forEach(emp => {
    if (!compagniesParPilote[emp.pilote_id]) {
      compagniesParPilote[emp.pilote_id] = [];
    }
    if (emp.compagnies?.nom) {
      compagniesParPilote[emp.pilote_id].push(emp.compagnies.nom);
    }
  });

  async function handleAdd() {
    if (!selectedCompagnie || !selectedPilote) return;
    
    setError('');
    setLoading(true);

    try {
      const res = await fetch('/api/compagnies/employes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          compagnie_id: selectedCompagnie,
          pilote_id: selectedPilote
        })
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Erreur');

      setSelectedPilote('');
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erreur');
    } finally {
      setLoading(false);
    }
  }

  async function handleDelete(id: string) {
    if (!confirm('Retirer cet employé de la compagnie ?')) return;

    setLoading(true);
    try {
      const res = await fetch(`/api/compagnies/employes?id=${id}`, {
        method: 'DELETE'
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || 'Erreur');
      }

      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erreur');
    } finally {
      setLoading(false);
    }
  }

  function formatDate(dateStr: string) {
    return new Date(dateStr).toLocaleDateString('fr-FR');
  }

  // Grouper les employés par compagnie
  const employesParCompagnie: Record<string, Employe[]> = {};
  employes.forEach(emp => {
    const compagnieId = emp.compagnie_id;
    if (!employesParCompagnie[compagnieId]) {
      employesParCompagnie[compagnieId] = [];
    }
    employesParCompagnie[compagnieId].push(emp);
  });

  return (
    <div className="space-y-6">
      {/* Formulaire d'ajout */}
      <div className="card">
        <h2 className="text-lg font-semibold text-slate-100 mb-4 flex items-center gap-2">
          <Plus className="h-5 w-5 text-emerald-400" />
          Assigner un pilote à une compagnie
        </h2>
        
        <div className="grid gap-4 sm:grid-cols-3">
          <div>
            <label className="block text-sm font-medium text-slate-300 mb-1">Compagnie</label>
            <select
              value={selectedCompagnie}
              onChange={(e) => setSelectedCompagnie(e.target.value)}
              className="input w-full"
            >
              <option value="">Sélectionner...</option>
              {compagnies.map((c) => (
                <option key={c.id} value={c.id}>{c.nom}</option>
              ))}
            </select>
          </div>
          
          <div>
            <label className="block text-sm font-medium text-slate-300 mb-1">Pilote</label>
            <select
              value={selectedPilote}
              onChange={(e) => setSelectedPilote(e.target.value)}
              className="input w-full"
              disabled={!selectedCompagnie}
            >
              <option value="">Sélectionner...</option>
              {pilotesDisponibles.map((p) => {
                const dejaEmployeDans = compagniesParPilote[p.id] || [];
                return (
                  <option key={p.id} value={p.id}>
                    {p.identifiant}
                    {dejaEmployeDans.length > 0 && ` (déjà dans: ${dejaEmployeDans.join(', ')})`}
                  </option>
                );
              })}
            </select>
            {!selectedCompagnie && (
              <p className="text-xs text-slate-500 mt-1">Sélectionnez d&apos;abord une compagnie</p>
            )}
            {selectedCompagnie && pilotesDisponibles.length === 0 && (
              <p className="text-xs text-amber-400 mt-1">Tous les pilotes sont déjà dans cette compagnie</p>
            )}
          </div>
          
          <div className="flex items-end">
            <button
              onClick={handleAdd}
              disabled={loading || !selectedCompagnie || !selectedPilote}
              className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white rounded-lg font-medium transition-colors flex items-center gap-2"
            >
              {loading ? <RefreshCw className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
              Assigner
            </button>
          </div>
        </div>

        {error && <p className="text-sm text-red-400 mt-3">{error}</p>}
      </div>

      {/* Liste des employés par compagnie */}
      <div className="space-y-4">
        {compagnies.map((compagnie) => {
          const compagnieEmployes = employesParCompagnie[compagnie.id] || [];
          return (
            <div key={compagnie.id} className="card">
              <h3 className="text-lg font-semibold text-slate-100 mb-2 flex items-center gap-2">
                <Building2 className="h-5 w-5 text-sky-400" />
                {compagnie.nom}
                <span className="text-sm font-normal text-slate-400">
                  ({compagnieEmployes.length} employé{compagnieEmployes.length > 1 ? 's' : ''})
                </span>
              </h3>
              
              {getProfileIdentifiant(compagnie.profiles) && (
                <p className="text-sm text-slate-400 mb-3">
                  PDG : <span className="text-amber-300">{getProfileIdentifiant(compagnie.profiles)}</span>
                </p>
              )}

              {compagnieEmployes.length > 0 ? (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-slate-700 text-left text-slate-400">
                        <th className="pb-2 pr-4">Pilote</th>
                        <th className="pb-2 pr-4">Autres compagnies</th>
                        <th className="pb-2 pr-4">Date d&apos;embauche</th>
                        <th className="pb-2 w-16">Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {compagnieEmployes.map((emp) => {
                        // Autres compagnies où ce pilote travaille
                        const autresCompagnies = (compagniesParPilote[emp.pilote_id] || [])
                          .filter(nom => nom !== compagnie.nom);
                        return (
                          <tr key={emp.id} className="border-b border-slate-700/50 last:border-0">
                            <td className="py-2.5 pr-4">
                              <span className="flex items-center gap-2 text-slate-200">
                                <User className="h-4 w-4 text-slate-500" />
                                {emp.profiles?.identifiant || '—'}
                              </span>
                            </td>
                            <td className="py-2.5 pr-4">
                              {autresCompagnies.length > 0 ? (
                                <div className="flex flex-wrap gap-1">
                                  {autresCompagnies.map((nom, idx) => (
                                    <span key={idx} className="text-xs px-2 py-0.5 bg-purple-500/20 text-purple-300 rounded">
                                      {nom}
                                    </span>
                                  ))}
                                </div>
                              ) : (
                                <span className="text-slate-500 text-xs">—</span>
                              )}
                            </td>
                            <td className="py-2.5 pr-4 text-slate-400">
                              {formatDate(emp.date_embauche)}
                            </td>
                            <td className="py-2.5">
                              <button
                                onClick={() => handleDelete(emp.id)}
                                disabled={loading}
                                className="p-1.5 text-red-400 hover:bg-red-500/20 rounded-lg transition-colors"
                                title="Retirer de la compagnie"
                              >
                                <Trash2 className="h-4 w-4" />
                              </button>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              ) : (
                <p className="text-sm text-slate-500">Aucun employé</p>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
