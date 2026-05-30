'use client';

import { useState, useEffect, useMemo } from 'react';
import { Plane, Package, Users, Weight, CheckCircle, Clock, Shield, Loader2, Plus, RefreshCw } from 'lucide-react';
import { AEROPORTS_PTFS } from '@/lib/aeroports-ptfs';
import { toast } from 'sonner';

type Profile = { id: string; identifiant: string | null };
type TypesAvion = {
  id: string;
  nom: string;
  code_oaci: string;
  constructeur?: string;
  capacite_pax: number;
  capacite_cargo_kg: number;
  est_militaire: boolean;
  categorie: string | null;
};
type InventaireItem = {
  id: string;
  proprietaire_id: string;
  type_avion_id: string;
  nom_personnalise: string | null;
  immatriculation?: string | null;
  types_avion: TypesAvion | TypesAvion[] | null;
  en_vol?: boolean;
  disponible?: boolean;
};

function libelleTypePourSelect(t: TypesAvion): string {
  const base = [t.nom, t.constructeur?.trim() || null].filter(Boolean).join(' · ');
  const icao = t.code_oaci ? ` · ${t.code_oaci}` : '';
  const cap = `${t.capacite_pax ?? 0} pax / ${t.capacite_cargo_kg ?? 0} kg`;
  return `${base}${icao} — ${cap}`;
}

export default function AdminInventaireClient({ profiles }: { profiles: Profile[] }) {
  const [selectedUserId, setSelectedUserId] = useState<string>('');
  const [inventaire, setInventaire] = useState<InventaireItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [typesAvion, setTypesAvion] = useState<TypesAvion[]>([]);
  const [showAddForm, setShowAddForm] = useState(false);
  const [adding, setAdding] = useState(false);
  const [newAvion, setNewAvion] = useState({
    type_avion_id: '',
    immatriculation: '',
    nom_bapteme: '',
    aeroport_actuel: '',
  });

  useEffect(() => {
    fetch('/api/types-avion')
      .then((res) => res.json())
      .then((data) => {
        if (Array.isArray(data)) setTypesAvion(data);
      })
      .catch(() => console.error('Erreur chargement types avion'));
  }, []);

  async function loadInventaire(userId: string) {
    if (!userId) {
      setInventaire([]);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/inventaire?user_id=${encodeURIComponent(userId)}`);
      if (!res.ok) throw new Error('Erreur chargement inventaire');
      const data = await res.json();
      setInventaire(Array.isArray(data) ? data : []);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Erreur');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadInventaire(selectedUserId);
  }, [selectedUserId]);

  async function handleAddAvion(e: React.FormEvent) {
    e.preventDefault();
    if (!selectedUserId || !newAvion.type_avion_id) {
      setError('Sélectionnez un type d\'avion');
      return;
    }

    setAdding(true);
    setError(null);

    try {
      const res = await fetch('/api/admin/avions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          proprietaire_id: selectedUserId,
          type_avion_id: newAvion.type_avion_id,
          immatriculation: newAvion.immatriculation,
          nom_bapteme: newAvion.nom_bapteme,
          aeroport_actuel: newAvion.aeroport_actuel,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Erreur');

      setNewAvion({ type_avion_id: '', immatriculation: '', nom_bapteme: '', aeroport_actuel: '' });
      setShowAddForm(false);
      loadInventaire(selectedUserId);
      toast.success(data.message || 'Avion ajouté à l\'inventaire');
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Erreur';
      setError(msg);
      toast.error(msg);
    } finally {
      setAdding(false);
    }
  }

  const selectedIdentifiant = profiles.find((p) => p.id === selectedUserId)?.identifiant ?? '—';

  const typesAvionTries = useMemo(() => {
    return [...typesAvion].sort((a, b) => a.nom.localeCompare(b.nom, 'fr', { sensitivity: 'base' }));
  }, [typesAvion]);

  return (
    <div className="space-y-6">
      <div className="card">
        <label className="block text-sm font-medium text-slate-300 mb-2">Pilote</label>
        <select
          value={selectedUserId}
          onChange={(e) => {
            setSelectedUserId(e.target.value);
            setShowAddForm(false);
          }}
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
          <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
            <h2 className="text-lg font-semibold text-slate-100 flex items-center gap-2">
              <Package className="h-5 w-5 text-orange-400" />
              Inventaire de {selectedIdentifiant}
            </h2>
            <button
              type="button"
              onClick={() => setShowAddForm(!showAddForm)}
              className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                showAddForm ? 'bg-orange-600 text-white' : 'bg-orange-600 hover:bg-orange-700 text-white'
              }`}
            >
              <Plus className="h-4 w-4" />
              Ajouter un avion
            </button>
          </div>

          {showAddForm && (
            <form
              onSubmit={handleAddAvion}
              className="mb-6 p-4 rounded-lg border border-orange-500/30 bg-orange-500/5 grid gap-4 md:grid-cols-2 lg:grid-cols-3"
            >
              <div className="md:col-span-2 lg:col-span-1 lg:min-w-[min(100%,28rem)]">
                <label className="block text-sm font-medium text-slate-400 mb-1">Type d&apos;avion *</label>
                <select
                  value={newAvion.type_avion_id}
                  onChange={(e) => setNewAvion({ ...newAvion, type_avion_id: e.target.value })}
                  className="input w-full font-mono text-sm"
                  required
                >
                  <option value="">— Sélectionner —</option>
                  {typesAvionTries.map((t) => (
                    <option key={t.id} value={t.id}>
                      {libelleTypePourSelect(t)}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-400 mb-1">Immatriculation (auto si vide)</label>
                <input
                  type="text"
                  value={newAvion.immatriculation}
                  onChange={(e) => setNewAvion({ ...newAvion, immatriculation: e.target.value.toUpperCase() })}
                  className="input w-full"
                  placeholder="F-XXXX"
                  maxLength={10}
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-400 mb-1">Nom personnalisé</label>
                <input
                  type="text"
                  value={newAvion.nom_bapteme}
                  onChange={(e) => setNewAvion({ ...newAvion, nom_bapteme: e.target.value })}
                  className="input w-full"
                  placeholder="Optionnel"
                  maxLength={50}
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-400 mb-1">Aéroport initial (IRFD si vide)</label>
                <select
                  value={newAvion.aeroport_actuel}
                  onChange={(e) => setNewAvion({ ...newAvion, aeroport_actuel: e.target.value })}
                  className="input w-full"
                >
                  <option value="">IRFD (défaut)</option>
                  {AEROPORTS_PTFS.map((a) => (
                    <option key={a.code} value={a.code}>{a.code} - {a.nom}</option>
                  ))}
                </select>
              </div>
              <div className="flex items-end gap-2">
                <button
                  type="submit"
                  disabled={adding}
                  className="px-4 py-2 bg-orange-600 hover:bg-orange-700 disabled:opacity-50 text-white rounded-lg font-medium transition-colors flex items-center gap-2"
                >
                  {adding ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
                  Ajouter
                </button>
                <button
                  type="button"
                  onClick={() => setShowAddForm(false)}
                  className="px-4 py-2 bg-slate-700 hover:bg-slate-600 text-slate-200 rounded-lg font-medium transition-colors"
                >
                  Annuler
                </button>
              </div>
            </form>
          )}

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
                          {item.immatriculation && (
                            <span className="text-xs font-mono font-bold text-sky-400">{item.immatriculation}</span>
                          )}
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
              {!showAddForm && (
                <button
                  type="button"
                  onClick={() => setShowAddForm(true)}
                  className="mt-4 inline-flex items-center gap-2 text-sm text-orange-400 hover:text-orange-300"
                >
                  <Plus className="h-4 w-4" />
                  Ajouter le premier avion
                </button>
              )}
            </div>
          )}

          <div className="mt-4 flex justify-end">
            <button
              type="button"
              onClick={() => loadInventaire(selectedUserId)}
              className="btn-secondary flex items-center gap-2 text-sm"
            >
              <RefreshCw className="h-4 w-4" />
              Actualiser
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
