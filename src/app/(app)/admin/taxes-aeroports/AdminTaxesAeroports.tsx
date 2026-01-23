'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Plus, Edit2, CheckSquare, Square } from 'lucide-react';
import { CODES_OACI_VALIDES, AEROPORTS_PTFS } from '@/lib/aeroports-ptfs';

type Taxe = { code_aeroport: string; taxe_base_pourcent: number; taxe_vfr_pourcent: number };

type Props = { taxes: Taxe[] };

export default function AdminTaxesAeroports({ taxes: taxesInitial }: Props) {
  const router = useRouter();
  const [taxes, setTaxes] = useState(taxesInitial);
  const [showAdd, setShowAdd] = useState(false);
  const [showBulkEdit, setShowBulkEdit] = useState(false);
  const [selectedCodes, setSelectedCodes] = useState<Set<string>>(new Set());
  const [codeAeroport, setCodeAeroport] = useState('');
  const [taxeBase, setTaxeBase] = useState('2.0');
  const [taxeVfr, setTaxeVfr] = useState('5.0');
  const [bulkTaxeBase, setBulkTaxeBase] = useState('2.0');
  const [bulkTaxeVfr, setBulkTaxeVfr] = useState('5.0');
  const [loading, setLoading] = useState(false);

  async function handleAdd() {
    if (!codeAeroport || !taxeBase || !taxeVfr) return;
    setLoading(true);
    try {
      const res = await fetch('/api/taxes-aeroports', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          code_aeroport: codeAeroport.toUpperCase().trim(),
          taxe_base_pourcent: Number(taxeBase),
          taxe_vfr_pourcent: Number(taxeVfr),
        }),
      });
      const d = await res.json();
      if (!res.ok) throw new Error(d.error || 'Erreur');
      setShowAdd(false);
      setCodeAeroport('');
      setTaxeBase('2.0');
      setTaxeVfr('5.0');
      router.refresh();
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Erreur');
    } finally {
      setLoading(false);
    }
  }

  async function handleBulkUpdate() {
    if (selectedCodes.size === 0 || !bulkTaxeBase || !bulkTaxeVfr) {
      alert('Sélectionnez au moins un aéroport et définissez les taxes');
      return;
    }
    setLoading(true);
    try {
      const res = await fetch('/api/taxes-aeroports', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          codes_aeroports: Array.from(selectedCodes),
          taxe_base_pourcent: Number(bulkTaxeBase),
          taxe_vfr_pourcent: Number(bulkTaxeVfr),
        }),
      });
      const d = await res.json();
      if (!res.ok) throw new Error(d.error || 'Erreur');
      alert(`${d.count || selectedCodes.size} aéroport(s) mis à jour avec succès`);
      setShowBulkEdit(false);
      setSelectedCodes(new Set());
      setBulkTaxeBase('2.0');
      setBulkTaxeVfr('5.0');
      router.refresh();
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Erreur');
    } finally {
      setLoading(false);
    }
  }

  function toggleSelect(code: string) {
    const newSelected = new Set(selectedCodes);
    if (newSelected.has(code)) {
      newSelected.delete(code);
    } else {
      newSelected.add(code);
    }
    setSelectedCodes(newSelected);
  }

  function toggleSelectAll() {
    if (selectedCodes.size === Array.from(CODES_OACI_VALIDES).length) {
      setSelectedCodes(new Set());
    } else {
      setSelectedCodes(new Set(CODES_OACI_VALIDES));
    }
  }

  const codesDisponibles = Array.from(CODES_OACI_VALIDES).filter((c) => !taxes.some((t) => t.code_aeroport === c));

  return (
    <div className="space-y-6">
      <div className="card">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-medium text-slate-200">Taxes par aéroport</h2>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => {
                setShowBulkEdit(!showBulkEdit);
                setShowAdd(false);
                if (!showBulkEdit) {
                  setSelectedCodes(new Set());
                }
              }}
              className="btn-primary flex items-center gap-2"
            >
              <Edit2 className="h-4 w-4" />
              Modifier en masse
            </button>
            {codesDisponibles.length > 0 && (
              <button
                type="button"
                onClick={() => {
                  setShowAdd(!showAdd);
                  setShowBulkEdit(false);
                }}
                className="btn-secondary flex items-center gap-2"
              >
                <Plus className="h-4 w-4" />
                Ajouter
              </button>
            )}
          </div>
        </div>

      {showAdd && (
        <div className="mb-4 p-4 border border-slate-700 rounded-lg bg-slate-800/30 space-y-3">
          <div>
            <label className="label">Code aéroport</label>
            <select
              className="input"
              value={codeAeroport}
              onChange={(e) => setCodeAeroport(e.target.value.toUpperCase())}
            >
              <option value="">— Choisir —</option>
              {codesDisponibles.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="label text-xs">Taxe base (%)</label>
              <input
                type="number"
                className="input text-sm"
                value={taxeBase}
                onChange={(e) => setTaxeBase(e.target.value)}
                min="0"
                max="100"
                step="0.1"
              />
            </div>
            <div>
              <label className="label text-xs">Taxe VFR (%)</label>
              <input
                type="number"
                className="input text-sm"
                value={taxeVfr}
                onChange={(e) => setTaxeVfr(e.target.value)}
                min="0"
                max="100"
                step="0.1"
              />
            </div>
          </div>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={handleAdd}
              className="btn-primary"
              disabled={loading || !codeAeroport}
            >
              {loading ? 'Ajout…' : 'Ajouter'}
            </button>
            <button
              type="button"
              onClick={() => {
                setShowAdd(false);
                setCodeAeroport('');
                setTaxeBase('2.0');
                setTaxeVfr('5.0');
              }}
              className="btn-secondary"
            >
              Annuler
            </button>
          </div>
        </div>
      )}

      {showBulkEdit && (
        <div className="card border-sky-500/50 bg-sky-900/10">
          <h3 className="text-lg font-medium text-slate-200 mb-4">Modification en masse</h3>
          <div className="space-y-4">
            <div className="flex items-center justify-between p-3 border border-slate-700 rounded-lg bg-slate-800/30">
              <button
                type="button"
                onClick={toggleSelectAll}
                className="flex items-center gap-2 text-slate-300 hover:text-slate-100"
              >
                {selectedCodes.size === Array.from(CODES_OACI_VALIDES).length ? (
                  <CheckSquare className="h-5 w-5" />
                ) : (
                  <Square className="h-5 w-5" />
                )}
                <span>
                  {selectedCodes.size === Array.from(CODES_OACI_VALIDES).length
                    ? 'Tout désélectionner'
                    : 'Tout sélectionner'}
                </span>
              </button>
              <span className="text-slate-400 text-sm">
                {selectedCodes.size} aéroport(s) sélectionné(s)
              </span>
            </div>

            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-2 max-h-64 overflow-y-auto p-2 border border-slate-700 rounded-lg bg-slate-800/30">
              {AEROPORTS_PTFS.map((aeroport) => {
                const isSelected = selectedCodes.has(aeroport.code);
                return (
                  <button
                    key={aeroport.code}
                    type="button"
                    onClick={() => toggleSelect(aeroport.code)}
                    className={`p-2 rounded border text-left transition-colors ${
                      isSelected
                        ? 'border-sky-500 bg-sky-900/30 text-slate-100'
                        : 'border-slate-700 bg-slate-800/50 text-slate-300 hover:border-slate-600'
                    }`}
                  >
                    <div className="flex items-center gap-2">
                      {isSelected ? (
                        <CheckSquare className="h-4 w-4 text-sky-400" />
                      ) : (
                        <Square className="h-4 w-4" />
                      )}
                      <div>
                        <p className="font-medium text-sm">{aeroport.code}</p>
                        <p className="text-xs text-slate-400 truncate">{aeroport.nom}</p>
                      </div>
                    </div>
                  </button>
                );
              })}
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="label">Taxe base (%)</label>
                <input
                  type="number"
                  className="input"
                  value={bulkTaxeBase}
                  onChange={(e) => setBulkTaxeBase(e.target.value)}
                  min="0"
                  max="100"
                  step="0.1"
                />
              </div>
              <div>
                <label className="label">Taxe VFR (%)</label>
                <input
                  type="number"
                  className="input"
                  value={bulkTaxeVfr}
                  onChange={(e) => setBulkTaxeVfr(e.target.value)}
                  min="0"
                  max="100"
                  step="0.1"
                />
              </div>
            </div>

            <div className="flex gap-2">
              <button
                type="button"
                onClick={handleBulkUpdate}
                className="btn-primary"
                disabled={loading || selectedCodes.size === 0 || !bulkTaxeBase || !bulkTaxeVfr}
              >
                {loading ? 'Mise à jour…' : `Appliquer à ${selectedCodes.size} aéroport(s)`}
              </button>
              <button
                type="button"
                onClick={() => {
                  setShowBulkEdit(false);
                  setSelectedCodes(new Set());
                }}
                className="btn-secondary"
              >
                Annuler
              </button>
            </div>
          </div>
        </div>
      )}

      {taxes.length === 0 ? (
        <p className="text-slate-400 text-sm">Aucune taxe configurée.</p>
      ) : (
        <div className="space-y-2">
          {taxes.map((t) => {
            const aeroport = AEROPORTS_PTFS.find((a) => a.code === t.code_aeroport);
            return (
              <div key={t.code_aeroport} className="border border-slate-700/50 rounded-lg p-3 bg-slate-800/30">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-slate-200 font-medium">{t.code_aeroport}</p>
                    {aeroport && <p className="text-slate-400 text-xs mt-0.5">{aeroport.nom}</p>}
                    <p className="text-slate-400 text-sm mt-1">
                      Base: {t.taxe_base_pourcent}% | VFR: {t.taxe_vfr_pourcent}%
                    </p>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
      </div>
    </div>
  );
}
