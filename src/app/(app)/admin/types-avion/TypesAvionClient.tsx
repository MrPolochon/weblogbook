'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Save, RefreshCw, Users, Weight, Coins, Shield, Plane, Ship, RotateCw, Fuel, Package } from 'lucide-react';

interface TypeAvion {
  id: string;
  nom: string;
  constructeur: string | null;
  code_oaci: string | null;
  categorie: string;
  prix: number;
  capacite_pax: number;
  capacite_cargo_kg: number;
  est_militaire: boolean;
  est_cargo: boolean;
  ordre: number;
}

interface Props {
  types: TypeAvion[];
}

const CATEGORIES: Record<string, { label: string; icon: React.ReactNode; color: string }> = {
  commercial: { label: 'Avions commerciaux', icon: <Plane className="h-5 w-5" />, color: 'text-sky-400' },
  cargo: { label: 'Avions cargo', icon: <Package className="h-5 w-5" />, color: 'text-amber-400' },
  leger: { label: 'Avions légers', icon: <Plane className="h-5 w-5" />, color: 'text-emerald-400' },
  militaire_moderne: { label: 'Militaires modernes', icon: <Shield className="h-5 w-5" />, color: 'text-red-400' },
  militaire_historique: { label: 'Militaires historiques', icon: <Shield className="h-5 w-5" />, color: 'text-orange-400' },
  amphibie: { label: 'Amphibies', icon: <Ship className="h-5 w-5" />, color: 'text-cyan-400' },
  helicoptere: { label: 'Hélicoptères', icon: <RotateCw className="h-5 w-5" />, color: 'text-purple-400' },
  ravitailleur: { label: 'Ravitailleurs', icon: <Fuel className="h-5 w-5" />, color: 'text-pink-400' },
};

export default function TypesAvionClient({ types }: Props) {
  const router = useRouter();
  const [loading, setLoading] = useState<string | null>(null);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<string>('all');

  async function handleSave(typeId: string, prix: number, capacitePax: number, capaciteCargo: number) {
    setError('');
    setSuccess('');
    setLoading(typeId);

    try {
      const res = await fetch(`/api/types-avion/${typeId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          prix,
          capacite_pax: capacitePax,
          capacite_cargo_kg: capaciteCargo
        })
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Erreur');

      setSuccess('Mis à jour');
      setTimeout(() => setSuccess(''), 2000);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erreur');
    } finally {
      setLoading(null);
    }
  }

  // Grouper par catégorie
  const typesByCategory = types.reduce((acc, type) => {
    const cat = type.categorie || 'commercial';
    if (!acc[cat]) acc[cat] = [];
    acc[cat].push(type);
    return acc;
  }, {} as Record<string, TypeAvion[]>);

  const filteredTypes = selectedCategory === 'all' 
    ? types 
    : typesByCategory[selectedCategory] || [];

  // Statistiques
  const stats = {
    total: types.length,
    civil: types.filter(t => !t.est_militaire).length,
    militaire: types.filter(t => t.est_militaire).length,
    cargo: types.filter(t => t.est_cargo).length,
  };

  return (
    <div className="space-y-4">
      {/* Stats */}
      <div className="flex gap-4 text-sm">
        <span className="text-slate-400">Total: <span className="text-slate-200 font-medium">{stats.total}</span></span>
        <span className="text-slate-400">Civil: <span className="text-emerald-400 font-medium">{stats.civil}</span></span>
        <span className="text-slate-400">Militaire: <span className="text-red-400 font-medium">{stats.militaire}</span></span>
        <span className="text-slate-400">Cargo: <span className="text-amber-400 font-medium">{stats.cargo}</span></span>
      </div>

      {/* Filtre par catégorie */}
      <div className="flex flex-wrap gap-2">
        <button
          onClick={() => setSelectedCategory('all')}
          className={`px-3 py-1.5 rounded-lg text-sm transition-colors ${
            selectedCategory === 'all' 
              ? 'bg-sky-500/20 text-sky-300 border border-sky-500/50' 
              : 'bg-slate-700/50 text-slate-400 hover:bg-slate-700'
          }`}
        >
          Tous ({types.length})
        </button>
        {Object.entries(CATEGORIES).map(([key, { label, icon, color }]) => {
          const count = (typesByCategory[key] || []).length;
          if (count === 0) return null;
          return (
            <button
              key={key}
              onClick={() => setSelectedCategory(key)}
              className={`px-3 py-1.5 rounded-lg text-sm flex items-center gap-1.5 transition-colors ${
                selectedCategory === key 
                  ? `bg-slate-700 ${color} border border-slate-600` 
                  : 'bg-slate-700/50 text-slate-400 hover:bg-slate-700'
              }`}
            >
              {icon}
              {label} ({count})
            </button>
          );
        })}
      </div>

      {error && <p className="text-sm text-red-400 mb-2">{error}</p>}
      {success && <p className="text-sm text-emerald-400 mb-2">{success}</p>}
      
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-slate-700 text-left text-slate-400">
              <th className="pb-2 pr-4">Avion</th>
              <th className="pb-2 pr-4">Code OACI</th>
              <th className="pb-2 pr-4">
                <span className="flex items-center gap-1">
                  <Coins className="h-4 w-4" />
                  Prix (F$)
                </span>
              </th>
              <th className="pb-2 pr-4">
                <span className="flex items-center gap-1">
                  <Users className="h-4 w-4" />
                  Passagers
                </span>
              </th>
              <th className="pb-2 pr-4">
                <span className="flex items-center gap-1">
                  <Weight className="h-4 w-4" />
                  Cargo (kg)
                </span>
              </th>
              <th className="pb-2 w-16">Actions</th>
            </tr>
          </thead>
          <tbody>
            {filteredTypes.map((type) => (
              <TypeRow 
                key={type.id} 
                type={type} 
                onSave={handleSave}
                loading={loading === type.id}
              />
            ))}
            {filteredTypes.length === 0 && (
              <tr>
                <td colSpan={6} className="py-8 text-center text-slate-500">
                  Aucun avion dans cette catégorie
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function TypeRow({ type, onSave, loading }: { 
  type: TypeAvion; 
  onSave: (id: string, prix: number, pax: number, cargo: number) => void;
  loading: boolean;
}) {
  const [prix, setPrix] = useState(type.prix?.toString() || '0');
  const [pax, setPax] = useState(type.capacite_pax?.toString() || '0');
  const [cargo, setCargo] = useState(type.capacite_cargo_kg?.toString() || '0');
  const [modified, setModified] = useState(false);

  function handleChange(field: 'prix' | 'pax' | 'cargo', value: string) {
    if (field === 'prix') setPrix(value);
    else if (field === 'pax') setPax(value);
    else setCargo(value);
    setModified(true);
  }

  function handleSaveClick() {
    onSave(type.id, parseInt(prix) || 0, parseInt(pax) || 0, parseInt(cargo) || 0);
    setModified(false);
  }

  return (
    <tr className="border-b border-slate-700/50 last:border-0">
      <td className="py-2.5 pr-4">
        <div className="flex items-center gap-2">
          <div>
            <span className="text-slate-200 font-medium">{type.nom}</span>
            {type.constructeur && (
              <span className="text-slate-500 text-xs ml-1">({type.constructeur})</span>
            )}
            <div className="flex gap-1 mt-0.5">
              {type.est_militaire && (
                <span className="text-[10px] px-1.5 py-0.5 rounded bg-red-500/20 text-red-400">
                  Militaire
                </span>
              )}
              {type.est_cargo && (
                <span className="text-[10px] px-1.5 py-0.5 rounded bg-amber-500/20 text-amber-400">
                  Cargo
                </span>
              )}
            </div>
          </div>
        </div>
      </td>
      <td className="py-2.5 pr-4 font-mono text-slate-400 text-xs">
        {type.code_oaci || '—'}
      </td>
      <td className="py-2.5 pr-4">
        <input
          type="number"
          value={prix}
          onChange={(e) => handleChange('prix', e.target.value)}
          min="0"
          className="input w-28 text-sm"
        />
      </td>
      <td className="py-2.5 pr-4">
        <input
          type="number"
          value={pax}
          onChange={(e) => handleChange('pax', e.target.value)}
          min="0"
          className="input w-20 text-sm"
          disabled={type.est_cargo}
        />
      </td>
      <td className="py-2.5 pr-4">
        <input
          type="number"
          value={cargo}
          onChange={(e) => handleChange('cargo', e.target.value)}
          min="0"
          className="input w-28 text-sm"
        />
      </td>
      <td className="py-2.5">
        {modified && (
          <button
            onClick={handleSaveClick}
            disabled={loading}
            className="p-1.5 text-emerald-400 hover:bg-emerald-500/20 rounded-lg transition-colors"
            title="Sauvegarder"
          >
            {loading ? <RefreshCw className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
          </button>
        )}
      </td>
    </tr>
  );
}
