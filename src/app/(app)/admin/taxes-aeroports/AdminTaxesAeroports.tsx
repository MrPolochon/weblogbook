'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Plus } from 'lucide-react';
import { CODES_OACI_VALIDES } from '@/lib/aeroports-ptfs';

type Taxe = { code_aeroport: string; taxe_base_pourcent: number; taxe_vfr_pourcent: number };

type Props = { taxes: Taxe[] };

export default function AdminTaxesAeroports({ taxes: taxesInitial }: Props) {
  const router = useRouter();
  const [taxes, setTaxes] = useState(taxesInitial);
  const [showAdd, setShowAdd] = useState(false);
  const [codeAeroport, setCodeAeroport] = useState('');
  const [taxeBase, setTaxeBase] = useState('2.0');
  const [taxeVfr, setTaxeVfr] = useState('5.0');
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

  const codesDisponibles = Array.from(CODES_OACI_VALIDES).filter((c) => !taxes.some((t) => t.code_aeroport === c));

  return (
    <div className="card">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-lg font-medium text-slate-200">Taxes par aéroport</h2>
        {codesDisponibles.length > 0 && (
          <button
            type="button"
            onClick={() => setShowAdd(!showAdd)}
            className="btn-primary flex items-center gap-2"
          >
            <Plus className="h-4 w-4" />
            Ajouter
          </button>
        )}
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

      {taxes.length === 0 ? (
        <p className="text-slate-400 text-sm">Aucune taxe configurée.</p>
      ) : (
        <div className="space-y-2">
          {taxes.map((t) => (
            <div key={t.code_aeroport} className="border border-slate-700/50 rounded-lg p-3 bg-slate-800/30">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-slate-200 font-medium">{t.code_aeroport}</p>
                  <p className="text-slate-400 text-sm mt-1">
                    Base: {t.taxe_base_pourcent}% | VFR: {t.taxe_vfr_pourcent}%
                  </p>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
