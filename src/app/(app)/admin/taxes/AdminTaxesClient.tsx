'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Plus, Trash2, RefreshCw, Save } from 'lucide-react';

interface Taxe {
  id: string;
  code_oaci: string;
  taxe_pourcent: number;
  taxe_vfr_pourcent: number;
}

interface Props {
  taxes: Taxe[];
}

export default function AdminTaxesClient({ taxes }: Props) {
  const router = useRouter();
  const [, startTransition] = useTransition();
  const [newCode, setNewCode] = useState('');
  const [newTaxeIfr, setNewTaxeIfr] = useState('2');
  const [newTaxeVfr, setNewTaxeVfr] = useState('5');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  async function handleAdd() {
    if (!newCode.trim()) return;
    
    setError('');
    setLoading(true);

    try {
      const res = await fetch('/api/taxes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          code_oaci: newCode.trim().toUpperCase(),
          taxe_pourcent: parseFloat(newTaxeIfr) || 2,
          taxe_vfr_pourcent: parseFloat(newTaxeVfr) || 5
        })
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Erreur');

      setNewCode('');
      setNewTaxeIfr('2');
      setNewTaxeVfr('5');
      startTransition(() => router.refresh());
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erreur');
    } finally {
      setLoading(false);
    }
  }

  async function handleUpdate(id: string, code: string, taxeIfr: string, taxeVfr: string) {
    setLoading(true);
    try {
      const res = await fetch('/api/taxes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          code_oaci: code,
          taxe_pourcent: parseFloat(taxeIfr) || 2,
          taxe_vfr_pourcent: parseFloat(taxeVfr) || 5
        })
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || 'Erreur');
      }

      startTransition(() => router.refresh());
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erreur');
    } finally {
      setLoading(false);
    }
  }

  async function handleDelete(id: string) {
    if (!confirm('Supprimer cette taxe ?')) return;

    setLoading(true);
    try {
      const res = await fetch(`/api/taxes?id=${id}`, {
        method: 'DELETE'
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || 'Erreur');
      }

      startTransition(() => router.refresh());
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erreur');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="space-y-6">
      {/* Formulaire d'ajout */}
      <div className="grid gap-4 sm:grid-cols-4 items-end">
        <div>
          <label className="block text-sm font-medium text-slate-300 mb-1">Code OACI</label>
          <input
            type="text"
            value={newCode}
            onChange={(e) => setNewCode(e.target.value.toUpperCase())}
            placeholder="LFPG"
            className="input w-full font-mono"
            maxLength={4}
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-slate-300 mb-1">Taxe IFR (%)</label>
          <input
            type="number"
            value={newTaxeIfr}
            onChange={(e) => setNewTaxeIfr(e.target.value)}
            step="0.1"
            min="0"
            max="100"
            className="input w-full"
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-slate-300 mb-1">Taxe VFR (%)</label>
          <input
            type="number"
            value={newTaxeVfr}
            onChange={(e) => setNewTaxeVfr(e.target.value)}
            step="0.1"
            min="0"
            max="100"
            className="input w-full"
          />
        </div>
        <button
          onClick={handleAdd}
          disabled={loading || !newCode.trim()}
          className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white rounded-lg font-medium transition-colors flex items-center gap-2"
        >
          {loading ? <RefreshCw className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
          Ajouter
        </button>
      </div>

      {error && <p className="text-sm text-red-400">{error}</p>}

      {/* Liste des taxes */}
      {taxes.length > 0 ? (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-700 text-left text-slate-400">
                <th className="pb-2 pr-4">Aéroport</th>
                <th className="pb-2 pr-4">Taxe IFR</th>
                <th className="pb-2 pr-4">Taxe VFR</th>
                <th className="pb-2 w-24">Actions</th>
              </tr>
            </thead>
            <tbody>
              {taxes.map((taxe) => (
                <TaxeRow 
                  key={taxe.id} 
                  taxe={taxe} 
                  onUpdate={handleUpdate}
                  onDelete={handleDelete}
                  loading={loading}
                />
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <p className="text-slate-400 text-center py-8">
          Aucune taxe définie. Les taxes par défaut (IFR 2%, VFR 5%) seront appliquées.
        </p>
      )}
    </div>
  );
}

function TaxeRow({ taxe, onUpdate, onDelete, loading }: { 
  taxe: Taxe; 
  onUpdate: (id: string, code: string, taxeIfr: string, taxeVfr: string) => void;
  onDelete: (id: string) => void;
  loading: boolean;
}) {
  const [taxeIfr, setTaxeIfr] = useState(taxe.taxe_pourcent.toString());
  const [taxeVfr, setTaxeVfr] = useState(taxe.taxe_vfr_pourcent.toString());
  const [modified, setModified] = useState(false);

  function handleChange(type: 'ifr' | 'vfr', value: string) {
    if (type === 'ifr') setTaxeIfr(value);
    else setTaxeVfr(value);
    setModified(true);
  }

  function handleSave() {
    onUpdate(taxe.id, taxe.code_oaci, taxeIfr, taxeVfr);
    setModified(false);
  }

  return (
    <tr className="border-b border-slate-700/50 last:border-0">
      <td className="py-2.5 pr-4 font-mono text-slate-200">{taxe.code_oaci}</td>
      <td className="py-2.5 pr-4">
        <div className="flex items-center gap-1">
          <input
            type="number"
            value={taxeIfr}
            onChange={(e) => handleChange('ifr', e.target.value)}
            step="0.1"
            min="0"
            max="100"
            className="input w-20 text-sm"
          />
          <span className="text-slate-400">%</span>
        </div>
      </td>
      <td className="py-2.5 pr-4">
        <div className="flex items-center gap-1">
          <input
            type="number"
            value={taxeVfr}
            onChange={(e) => handleChange('vfr', e.target.value)}
            step="0.1"
            min="0"
            max="100"
            className="input w-20 text-sm"
          />
          <span className="text-slate-400">%</span>
        </div>
      </td>
      <td className="py-2.5">
        <div className="flex items-center gap-1">
          {modified && (
            <button
              onClick={handleSave}
              disabled={loading}
              className="p-1.5 text-emerald-400 hover:bg-emerald-500/20 rounded-lg transition-colors"
              title="Sauvegarder"
            >
              <Save className="h-4 w-4" />
            </button>
          )}
          <button
            onClick={() => onDelete(taxe.id)}
            disabled={loading}
            className="p-1.5 text-red-400 hover:bg-red-500/20 rounded-lg transition-colors"
            title="Supprimer"
          >
            <Trash2 className="h-4 w-4" />
          </button>
        </div>
      </td>
    </tr>
  );
}
