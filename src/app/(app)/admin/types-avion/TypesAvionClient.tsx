'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Save, RefreshCw, Users, Weight, Coins } from 'lucide-react';

interface TypeAvion {
  id: string;
  nom: string;
  constructeur: string | null;
  code_oaci: string | null;
  prix: number;
  capacite_pax: number;
  capacite_cargo_kg: number;
  ordre: number;
}

interface Props {
  types: TypeAvion[];
}

export default function TypesAvionClient({ types }: Props) {
  const router = useRouter();
  const [loading, setLoading] = useState<string | null>(null);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

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

  return (
    <div className="space-y-4">
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
            {types.map((type) => (
              <TypeRow 
                key={type.id} 
                type={type} 
                onSave={handleSave}
                loading={loading === type.id}
              />
            ))}
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
  const [prix, setPrix] = useState(type.prix.toString());
  const [pax, setPax] = useState(type.capacite_pax.toString());
  const [cargo, setCargo] = useState(type.capacite_cargo_kg.toString());
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
        <div>
          <span className="text-slate-200 font-medium">{type.nom}</span>
          {type.constructeur && (
            <span className="text-slate-500 text-xs ml-1">({type.constructeur})</span>
          )}
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
          className="input w-24 text-sm"
        />
      </td>
      <td className="py-2.5 pr-4">
        <input
          type="number"
          value={pax}
          onChange={(e) => handleChange('pax', e.target.value)}
          min="0"
          className="input w-20 text-sm"
        />
      </td>
      <td className="py-2.5 pr-4">
        <input
          type="number"
          value={cargo}
          onChange={(e) => handleChange('cargo', e.target.value)}
          min="0"
          className="input w-24 text-sm"
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
