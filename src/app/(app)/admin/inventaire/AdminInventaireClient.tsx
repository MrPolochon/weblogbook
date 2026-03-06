'use client';

import { useState, useEffect } from 'react';
import { Plane, Package, Users, Weight, CheckCircle, Clock, Shield, Loader2 } from 'lucide-react';

type Profile = { id: string; identifiant: string | null };
type TypesAvion = { id: string; nom: string; code_oaci: string; capacite_pax: number; capacite_cargo_kg: number; est_militaire: boolean; categorie: string | null };
type InventaireItem = {
  id: string;
  proprietaire_id: string;
  type_avion_id: string;
  nom_personnalise: string | null;
  types_avion: TypesAvion | TypesAvion[] | null;
  en_vol?: boolean;
  disponible?: boolean;
};

export default function AdminInventaireClient({ profiles }: { profiles: Profile[] }) {
  const [selectedUserId, setSelectedUserId] = useState<string>('');
  const [inventaire, setInventaire] = useState<InventaireItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!selectedUserId) {
      setInventaire([]);
      return;
    }
    setLoading(true);
    setError(null);
    fetch(`/api/inventaire?user_id=${encodeURIComponent(selectedUserId)}`)
      .then((res) => {
        if (!res.ok) throw new Error('Erreur chargement inventaire');
        return res.json();
      })
      .then((data) => setInventaire(Array.isArray(data) ? data : []))
      .catch((e) => setError(e instanceof Error ? e.message : 'Erreur'))
      .finally(() => setLoading(false));
  }, [selectedUserId]);

  const selectedIdentifiant = profiles.find((p) => p.id === selectedUserId)?.identifiant ?? '—';

  return (
    <div className="space-y-6">
      <div className="card">
        <label className="block text-sm font-medium text-slate-300 mb-2">Pilote</label>
        <select
          value={selectedUserId}
          onChange={(e) => setSelectedUserId(e.target.value)}
          className="input w-full max-w-md"
        >
          <option value="">— Choisir un pilote —</option>
          {profiles.map((p) => (
            <option key={p.id} value={p.id}>
              {p.identifiant ?? p.id.slice(0, 8)}
            </option>
          ))}
        </select>
      </div>

      {error && <p className="text-sm text-red-400">{error}</p>}

      {selectedUserId && (
        <div className="card">
          <h2 className="text-lg font-semibold text-slate-100 mb-4 flex items-center gap-2">
            <Package className="h-5 w-5 text-orange-400" />
            Inventaire de {selectedIdentifiant}
          </h2>
          {loading ? (
            <div className="flex justify-center py-12">
              <Loader2 className="h-8 w-8 animate-spin text-sky-400" />
            </div>
          ) : inventaire.length > 0 ? (
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {inventaire.map((item) => {
                const taData = item.types_avion;
                const avion = taData ? (Array.isArray(taData) ? taData[0] : taData) as TypesAvion | null : null;
                const estMilitaire = avion?.est_militaire ?? false;
                const enVol = item.en_vol ?? false;
                return (
                  <div
                    key={item.id}
                    className={`bg-slate-800/50 rounded-lg p-4 border ${
                      estMilitaire
                        ? 'border-red-500/50'
                        : enVol
                          ? 'border-amber-500/50'
                          : 'border-slate-700/50'
                    }`}
                  >
                    <div className="flex items-start justify-between mb-3">
                      <div>
                        <h3 className="font-semibold text-slate-200">
                          {item.nom_personnalise || avion?.nom || 'Avion'}
                        </h3>
                        <div className="flex items-center gap-2 mt-1">
                          {avion?.code_oaci && (
                            <span className="text-xs text-slate-500 font-mono">{avion.code_oaci}</span>
                          )}
                          {estMilitaire && (
                            <span className="inline-flex items-center gap-1 text-xs px-1.5 py-0.5 rounded bg-red-500/20 text-red-400">
                              <Shield className="h-3 w-3" />
                              Militaire
                            </span>
                          )}
                        </div>
                      </div>
                      <Plane className={`h-8 w-8 ${estMilitaire ? 'text-red-400' : enVol ? 'text-amber-400' : 'text-slate-600'}`} />
                    </div>
                    <div className="space-y-1.5 mb-3">
                      {avion && avion.capacite_pax > 0 && (
                        <div className="flex items-center gap-2 text-sm text-slate-400">
                          <Users className="h-4 w-4" />
                          <span>{avion.capacite_pax} passagers</span>
                        </div>
                      )}
                      {avion && avion.capacite_cargo_kg > 0 && (
                        <div className="flex items-center gap-2 text-sm text-slate-400">
                          <Weight className="h-4 w-4" />
                          <span>{avion.capacite_cargo_kg.toLocaleString('fr-FR')} kg</span>
                        </div>
                      )}
                    </div>
                    <div className={`inline-flex items-center gap-1.5 px-2 py-1 rounded-full text-xs font-medium ${
                      enVol ? 'bg-amber-500/20 text-amber-300' : 'bg-emerald-500/20 text-emerald-300'
                    }`}>
                      {enVol ? (
                        <>
                          <Clock className="h-3 w-3" />
                          En vol
                        </>
                      ) : (
                        <>
                          <CheckCircle className="h-3 w-3" />
                          Disponible
                        </>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="text-center py-8">
              <Plane className="h-12 w-12 text-slate-600 mx-auto mb-3" />
              <p className="text-slate-400">Aucun avion dans l&apos;inventaire de ce pilote.</p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
