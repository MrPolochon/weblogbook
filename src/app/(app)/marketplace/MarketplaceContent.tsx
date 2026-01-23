'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Plane, ShoppingCart, Building2 } from 'lucide-react';

type Avion = { typeAvionId: string; nom: string; prix: number; versionCargo: boolean; capaciteCargo: number | null };
type Compagnie = { id: string; nom: string };

type Props = { avions: Avion[]; soldePersonnel: number; compagnies: Compagnie[] };

export default function MarketplaceContent({ avions, soldePersonnel, compagnies }: Props) {
  const router = useRouter();
  const [achatMode, setAchatMode] = useState<'personnel' | 'compagnie' | null>(null);
  const [selectedAvion, setSelectedAvion] = useState<string | null>(null);
  const [selectedCompagnie, setSelectedCompagnie] = useState<string>('');
  const [nomAvion, setNomAvion] = useState('');
  const [loading, setLoading] = useState(false);

  async function handleAchat() {
    if (!selectedAvion) return;
    if (achatMode === 'compagnie' && !selectedCompagnie) {
      alert('Sélectionnez une compagnie');
      return;
    }

    const avion = avions.find((a) => a.typeAvionId === selectedAvion);
    if (!avion) return;

    if (achatMode === 'personnel' && soldePersonnel < avion.prix) {
      alert('Solde insuffisant');
      return;
    }

    setLoading(true);
    try {
      const res = await fetch('/api/marketplace', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type_avion_id: selectedAvion,
          compagnie_id: achatMode === 'compagnie' ? selectedCompagnie : null,
          nom_avion: nomAvion.trim() || null,
        }),
      });
      const d = await res.json();
      if (!res.ok) throw new Error(d.error || 'Erreur');
      alert('Achat effectué avec succès');
      router.refresh();
      setAchatMode(null);
      setSelectedAvion(null);
      setSelectedCompagnie('');
      setNomAvion('');
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Erreur');
    } finally {
      setLoading(false);
    }
  }

  // Extraire l'avion sélectionné et son prix pour éviter les erreurs TypeScript
  const avionSelectionne = selectedAvion ? avions.find((a) => a.typeAvionId === selectedAvion) : null;
  const prixAvion = avionSelectionne?.prix ?? 0;

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold text-slate-100 flex items-center gap-2">
        <ShoppingCart className="h-6 w-6" />
        Marketplace
      </h1>

      <div className="card">
        <h2 className="text-lg font-medium text-slate-200 mb-4">Acheter un avion</h2>
        <div className="space-y-4">
          <div className="flex gap-4">
            <button
              type="button"
              onClick={() => {
                setAchatMode('personnel');
                setSelectedCompagnie('');
              }}
              className={`btn-secondary ${achatMode === 'personnel' ? 'bg-sky-600 text-white' : ''}`}
            >
              Achat personnel
            </button>
            {compagnies.length > 0 && (
              <button
                type="button"
                onClick={() => setAchatMode('compagnie')}
                className={`btn-secondary ${achatMode === 'compagnie' ? 'bg-sky-600 text-white' : ''}`}
              >
                Achat compagnie
              </button>
            )}
          </div>

          {achatMode && (
            <div className="p-4 border border-slate-700 rounded-lg bg-slate-800/30 space-y-3">
              {achatMode === 'compagnie' && (
                <div>
                  <label className="label">Compagnie</label>
                  <select
                    className="input"
                    value={selectedCompagnie}
                    onChange={(e) => setSelectedCompagnie(e.target.value)}
                    required
                  >
                    <option value="">— Choisir —</option>
                    {compagnies.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.nom}
                      </option>
                    ))}
                  </select>
                </div>
              )}

              <div>
                <label className="label">Avion</label>
                <select
                  className="input"
                  value={selectedAvion || ''}
                  onChange={(e) => setSelectedAvion(e.target.value)}
                  required
                >
                  <option value="">— Choisir —</option>
                  {avions.map((a) => (
                    <option key={a.typeAvionId} value={a.typeAvionId}>
                      {a.nom} — {a.prix.toFixed(2)} €
                    </option>
                  ))}
                </select>
              </div>

              {selectedAvion && (
                <>
                  <div>
                    <label className="label">Nom de l&apos;avion (optionnel)</label>
                    <input
                      type="text"
                      className="input"
                      value={nomAvion}
                      onChange={(e) => setNomAvion(e.target.value)}
                      placeholder="Ex: F-ABCD"
                    />
                  </div>
                  {achatMode === 'personnel' && (
                    <div className="p-3 bg-slate-700/30 rounded-lg">
                      <p className="text-slate-300 text-sm">
                        Solde disponible: {soldePersonnel.toFixed(2)} €
                      </p>
                      <p className={`text-sm font-medium mt-1 ${
                        soldePersonnel >= prixAvion
                          ? 'text-emerald-400'
                          : 'text-red-400'
                      }`}>
                        Coût: {prixAvion.toFixed(2)} €
                      </p>
                    </div>
                  )}
                  <button
                    type="button"
                    onClick={handleAchat}
                    className="btn-primary w-full"
                    disabled={loading || (achatMode === 'compagnie' && !selectedCompagnie)}
                  >
                    {loading ? 'Achat…' : 'Acheter'}
                  </button>
                </>
              )}
            </div>
          )}
        </div>
      </div>

      <div className="card">
        <h2 className="text-lg font-medium text-slate-200 mb-4">Avions disponibles</h2>
        {avions.length === 0 ? (
          <p className="text-slate-400 text-sm">Aucun avion en vente.</p>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {avions.map((a) => (
              <div key={a.typeAvionId} className="border border-slate-700/50 rounded-lg p-3 bg-slate-800/30">
                <div className="flex items-center gap-2 mb-2">
                  <Plane className="h-5 w-5 text-sky-400" />
                  <div className="flex-1">
                    <p className="text-slate-200 font-medium">{a.nom}</p>
                    {a.versionCargo && (
                      <span className="inline-block mt-1 px-2 py-0.5 text-xs font-medium rounded bg-orange-900/50 text-orange-300 border border-orange-700/50">
                        Version cargo
                      </span>
                    )}
                  </div>
                </div>
                <p className="text-slate-300 text-lg font-semibold">{a.prix.toFixed(2)} €</p>
                {a.versionCargo && a.capaciteCargo && (
                  <p className="text-slate-400 text-sm mt-1">Capacité cargo: {a.capaciteCargo} kg</p>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
