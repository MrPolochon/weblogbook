'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { ShoppingCart } from 'lucide-react';

type TypeAvion = { id: string; nom: string; prix: number | null; versionCargo: boolean; capaciteCargo: number | null };

type Props = { typesAvion: TypeAvion[] };

export default function AdminMarketplace({ typesAvion }: Props) {
  const router = useRouter();
  const [loading, setLoading] = useState<Record<string, boolean>>({});
  const [prix, setPrix] = useState<Record<string, string>>({});
  const [versionCargo, setVersionCargo] = useState<Record<string, boolean>>({});
  const [cargo, setCargo] = useState<Record<string, string>>({});

  async function handleSave(typeAvionId: string) {
    const prixVal = prix[typeAvionId];
    const isCargo = versionCargo[typeAvionId] ?? false;
    const cargoVal = cargo[typeAvionId];
    if (!prixVal || Number(prixVal) < 0) {
      alert('Prix invalide');
      return;
    }
    if (isCargo && (!cargoVal || Number(cargoVal) <= 0)) {
      alert('La capacité cargo est requise pour une version cargo');
      return;
    }
    setLoading({ ...loading, [typeAvionId]: true });
    try {
      const res = await fetch('/api/marketplace/prix', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type_avion_id: typeAvionId,
          prix: Number(prixVal),
          version_cargo: isCargo,
          capacite_cargo_kg: isCargo && cargoVal ? Number(cargoVal) : null,
        }),
      });
      const d = await res.json();
      if (!res.ok) throw new Error(d.error || 'Erreur');
      router.refresh();
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Erreur');
    } finally {
      setLoading({ ...loading, [typeAvionId]: false });
    }
  }

  return (
    <div className="card">
      <h2 className="text-lg font-medium text-slate-200 mb-4">Prix des avions</h2>
      <div className="space-y-3">
        {typesAvion.map((t) => (
          <div key={t.id} className="border border-slate-700/50 rounded-lg p-3 bg-slate-800/30">
            <div className="flex items-center justify-between gap-4">
              <div className="flex-1">
                <p className="text-slate-200 font-medium">{t.nom}</p>
                <div className="mt-2 space-y-2">
                  <div className="flex items-center gap-2">
                    <input
                      type="checkbox"
                      id={`cargo-${t.id}`}
                      checked={versionCargo[t.id] ?? t.versionCargo ?? false}
                      onChange={(e) => {
                        setVersionCargo({ ...versionCargo, [t.id]: e.target.checked });
                        if (!e.target.checked) {
                          setCargo({ ...cargo, [t.id]: '' });
                        }
                      }}
                      className="w-4 h-4 rounded border-slate-600 bg-slate-700 text-sky-500 focus:ring-sky-500"
                    />
                    <label htmlFor={`cargo-${t.id}`} className="text-sm text-slate-300 cursor-pointer">
                      Version cargo
                    </label>
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <label className="label text-xs">Prix (€)</label>
                      <input
                        type="number"
                        className="input text-sm"
                        value={prix[t.id] ?? (t.prix?.toString() || '')}
                        onChange={(e) => setPrix({ ...prix, [t.id]: e.target.value })}
                        placeholder="Prix"
                        min="0"
                        step="0.01"
                      />
                    </div>
                    {(versionCargo[t.id] ?? t.versionCargo ?? false) && (
                      <div>
                        <label className="label text-xs">Capacité cargo (kg) *</label>
                        <input
                          type="number"
                          className="input text-sm"
                          value={cargo[t.id] ?? (t.capaciteCargo?.toString() || '')}
                          onChange={(e) => setCargo({ ...cargo, [t.id]: e.target.value })}
                          placeholder="Capacité cargo"
                          min="1"
                          required
                        />
                      </div>
                    )}
                  </div>
                </div>
              </div>
              <button
                type="button"
                onClick={() => handleSave(t.id)}
                className="btn-primary"
                disabled={loading[t.id]}
              >
                {loading[t.id] ? 'Enregistrement…' : 'Enregistrer'}
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
