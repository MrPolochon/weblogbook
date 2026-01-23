'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { Trash2, BookOpen, Crown, Settings, Save, RefreshCw, Plane, Plus, X, Package, Users, Weight, Search } from 'lucide-react';

type Pilote = { id: string; identifiant: string };
type TypeAvion = {
  id: string;
  nom: string;
  code_oaci: string | null;
  categorie: string | null;
  est_militaire: boolean;
  est_cargo: boolean;
  capacite_pax: number;
  capacite_cargo_kg: number;
};
type FlotteItem = {
  id: string;
  type_avion_id: string;
  quantite: number;
  nom_personnalise: string | null;
  capacite_pax_custom: number | null;
  capacite_cargo_custom: number | null;
  types_avion: { id: string; nom: string; code_oaci: string | null; capacite_pax: number; capacite_cargo_kg: number } | null;
};
type C = { 
  id: string; 
  nom: string; 
  pdg_id: string | null;
  prix_billet_pax: number;
  prix_kg_cargo: number;
  pourcentage_salaire: number;
  vban: string | null;
  profiles: { identifiant: string }[] | { identifiant: string } | null;
};

function getPdgIdentifiant(profiles: C['profiles']): string | null {
  if (!profiles) return null;
  if (Array.isArray(profiles)) {
    return profiles[0]?.identifiant || null;
  }
  return profiles.identifiant || null;
}

export default function CompagniesList({ compagnies, pilotes, typesAvion }: { compagnies: C[]; pilotes: Pilote[]; typesAvion: TypeAvion[] }) {
  const router = useRouter();
  const [deleting, setDeleting] = useState<string | null>(null);
  const [editing, setEditing] = useState<string | null>(null);
  const [managingFlotte, setManagingFlotte] = useState<string | null>(null);

  async function handleDelete(id: string, nom: string) {
    if (!confirm(`Supprimer « ${nom} » ? Le nom restera affiché sur les vols déjà enregistrés.`)) return;
    setDeleting(id);
    try {
      const res = await fetch(`/api/compagnies/${id}`, { method: 'DELETE' });
      if (!res.ok) throw new Error('Erreur');
      router.refresh();
    } finally {
      setDeleting(null);
    }
  }

  if (compagnies.length === 0) return <p className="text-slate-500">Aucune compagnie.</p>;

  return (
    <div className="card">
      <h2 className="text-lg font-medium text-slate-200 mb-4">Liste des compagnies</h2>
      <div className="space-y-4">
        {compagnies.map((c) => (
          <div key={c.id} className="border-b border-slate-700/50 pb-4 last:border-0 last:pb-0">
            <div className="flex items-center justify-between mb-2">
              <div>
                <span className="text-slate-200 font-medium">{c.nom}</span>
                {getPdgIdentifiant(c.profiles) && (
                  <span className="ml-2 text-sm text-amber-400 flex items-center gap-1 inline-flex">
                    <Crown className="h-3 w-3" />
                    {getPdgIdentifiant(c.profiles)}
                  </span>
                )}
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => setManagingFlotte(managingFlotte === c.id ? null : c.id)}
                  className={`rounded p-1.5 transition-colors ${managingFlotte === c.id ? 'bg-purple-600/20 text-purple-400' : 'text-slate-400 hover:bg-slate-700/50 hover:text-purple-400'}`}
                  title="Gérer la flotte"
                >
                  <Plane className="h-4 w-4" />
                </button>
                <button
                  onClick={() => setEditing(editing === c.id ? null : c.id)}
                  className={`rounded p-1.5 transition-colors ${editing === c.id ? 'bg-sky-600/20 text-sky-400' : 'text-slate-400 hover:bg-slate-700/50 hover:text-sky-400'}`}
                  title="Paramètres"
                >
                  <Settings className="h-4 w-4" />
                </button>
                <Link
                  href={`/admin/compagnies/${c.id}/logbook`}
                  className="rounded p-1.5 text-slate-400 hover:bg-slate-700/50 hover:text-sky-400"
                  title="Voir le logbook"
                >
                  <BookOpen className="h-4 w-4" />
                </Link>
                <button
                  onClick={() => handleDelete(c.id, c.nom)}
                  disabled={deleting === c.id}
                  className="rounded p-1.5 text-slate-400 hover:bg-slate-700/50 hover:text-red-400 disabled:opacity-50"
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              </div>
            </div>
            
            {c.vban && (
              <p className="text-xs text-slate-500 font-mono mb-2">{c.vban}</p>
            )}
            
            {editing === c.id && (
              <CompagnieSettings compagnie={c} pilotes={pilotes} onClose={() => setEditing(null)} />
            )}
            
            {managingFlotte === c.id && (
              <CompagnieFlotteManager compagnieId={c.id} compagnieNom={c.nom} typesAvion={typesAvion} onClose={() => setManagingFlotte(null)} />
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

function CompagnieSettings({ compagnie, pilotes, onClose }: { compagnie: C; pilotes: Pilote[]; onClose: () => void }) {
  const router = useRouter();
  const [pdgId, setPdgId] = useState(compagnie.pdg_id || '');
  const [prixBillet, setPrixBillet] = useState(compagnie.prix_billet_pax.toString());
  const [prixCargo, setPrixCargo] = useState(compagnie.prix_kg_cargo.toString());
  const [salaire, setSalaire] = useState(compagnie.pourcentage_salaire.toString());
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  async function handleSave() {
    setError('');
    setLoading(true);

    try {
      const res = await fetch(`/api/compagnies/${compagnie.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          pdg_id: pdgId || null,
          prix_billet_pax: parseInt(prixBillet) || 100,
          prix_kg_cargo: parseInt(prixCargo) || 5,
          pourcentage_salaire: parseInt(salaire) || 20
        })
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Erreur');

      router.refresh();
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erreur');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="mt-3 p-3 bg-slate-800/50 rounded-lg border border-slate-700/50 space-y-3">
      <div className="grid gap-3 sm:grid-cols-2">
        <div>
          <label className="block text-xs font-medium text-slate-400 mb-1">PDG</label>
          <select
            value={pdgId}
            onChange={(e) => setPdgId(e.target.value)}
            className="input w-full text-sm"
          >
            <option value="">Aucun PDG</option>
            {pilotes.map((p) => (
              <option key={p.id} value={p.id}>{p.identifiant}</option>
            ))}
          </select>
        </div>
        <div>
          <label className="block text-xs font-medium text-slate-400 mb-1">% salaire pilote</label>
          <input
            type="number"
            value={salaire}
            onChange={(e) => setSalaire(e.target.value)}
            min="0"
            max="100"
            className="input w-full text-sm"
          />
        </div>
        <div>
          <label className="block text-xs font-medium text-slate-400 mb-1">Prix billet passager (F$)</label>
          <input
            type="number"
            value={prixBillet}
            onChange={(e) => setPrixBillet(e.target.value)}
            min="0"
            className="input w-full text-sm"
          />
        </div>
        <div>
          <label className="block text-xs font-medium text-slate-400 mb-1">Prix kg cargo (F$)</label>
          <input
            type="number"
            value={prixCargo}
            onChange={(e) => setPrixCargo(e.target.value)}
            min="0"
            className="input w-full text-sm"
          />
        </div>
      </div>
      
      {error && <p className="text-xs text-red-400">{error}</p>}
      
      <div className="flex gap-2">
        <button
          onClick={handleSave}
          disabled={loading}
          className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white rounded-lg text-sm font-medium transition-colors flex items-center gap-1"
        >
          {loading ? <RefreshCw className="h-3 w-3 animate-spin" /> : <Save className="h-3 w-3" />}
          Enregistrer
        </button>
        <button
          onClick={onClose}
          className="px-3 py-1.5 bg-slate-700 hover:bg-slate-600 text-slate-200 rounded-lg text-sm font-medium transition-colors"
        >
          Annuler
        </button>
      </div>
    </div>
  );
}

// Composant de gestion de la flotte d'une compagnie
function CompagnieFlotteManager({ 
  compagnieId, 
  compagnieNom, 
  typesAvion, 
  onClose 
}: { 
  compagnieId: string; 
  compagnieNom: string; 
  typesAvion: TypeAvion[]; 
  onClose: () => void;
}) {
  const router = useRouter();
  const [flotte, setFlotte] = useState<FlotteItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [adding, setAdding] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedAvion, setSelectedAvion] = useState<string>('');
  const [quantite, setQuantite] = useState('1');
  const [error, setError] = useState('');
  const [deletingId, setDeletingId] = useState<string | null>(null);

  // Charger la flotte existante
  useEffect(() => {
    async function loadFlotte() {
      try {
        const res = await fetch(`/api/compagnies/flotte?compagnie_id=${compagnieId}`);
        const data = await res.json();
        if (res.ok) {
          setFlotte(data || []);
        }
      } catch (e) {
        console.error('Erreur chargement flotte:', e);
      } finally {
        setLoading(false);
      }
    }
    loadFlotte();
  }, [compagnieId]);

  // Filtrer les avions pour la recherche
  const filteredAvions = typesAvion.filter(a => {
    const search = searchTerm.toLowerCase();
    return a.nom.toLowerCase().includes(search) || 
           (a.code_oaci?.toLowerCase().includes(search)) ||
           (a.categorie?.toLowerCase().includes(search));
  });

  // Ajouter un avion à la flotte
  async function handleAddAvion() {
    if (!selectedAvion) {
      setError('Sélectionnez un avion');
      return;
    }
    
    setError('');
    setAdding(true);

    try {
      const res = await fetch('/api/compagnies/flotte', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          compagnie_id: compagnieId,
          type_avion_id: selectedAvion,
          quantite: parseInt(quantite) || 1
        })
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Erreur');

      // Recharger la flotte
      const resFlotte = await fetch(`/api/compagnies/flotte?compagnie_id=${compagnieId}`);
      const flotteData = await resFlotte.json();
      setFlotte(flotteData || []);
      
      setSelectedAvion('');
      setQuantite('1');
      setSearchTerm('');
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erreur');
    } finally {
      setAdding(false);
    }
  }

  // Supprimer un avion de la flotte
  async function handleDeleteFlotte(id: string) {
    if (!confirm('Retirer cet avion de la flotte ?')) return;
    
    setDeletingId(id);
    try {
      const res = await fetch(`/api/compagnies/flotte?id=${id}`, { method: 'DELETE' });
      if (!res.ok) throw new Error('Erreur');
      
      setFlotte(flotte.filter(f => f.id !== id));
      router.refresh();
    } catch (e) {
      console.error('Erreur suppression:', e);
    } finally {
      setDeletingId(null);
    }
  }

  // Modifier la quantité
  async function handleUpdateQuantite(id: string, newQuantite: number) {
    if (newQuantite < 1) return;
    
    try {
      const res = await fetch('/api/compagnies/flotte', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, quantite: newQuantite })
      });
      
      if (!res.ok) throw new Error('Erreur');
      
      setFlotte(flotte.map(f => f.id === id ? { ...f, quantite: newQuantite } : f));
      router.refresh();
    } catch (e) {
      console.error('Erreur mise à jour:', e);
    }
  }

  return (
    <div className="mt-3 p-4 bg-purple-900/20 rounded-lg border border-purple-500/30 space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold text-purple-300 flex items-center gap-2">
          <Plane className="h-4 w-4" />
          Flotte de {compagnieNom}
        </h3>
        <button onClick={onClose} className="text-slate-400 hover:text-slate-200">
          <X className="h-4 w-4" />
        </button>
      </div>

      {/* Formulaire d'ajout */}
      <div className="p-3 bg-slate-800/50 rounded-lg border border-slate-700/50 space-y-3">
        <p className="text-xs font-medium text-slate-400 flex items-center gap-1">
          <Plus className="h-3 w-3" /> Ajouter un avion à la flotte
        </p>
        
        {/* Recherche */}
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-500" />
          <input
            type="text"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            placeholder="Rechercher un avion..."
            className="input w-full pl-9 text-sm"
          />
        </div>
        
        {/* Sélection de l'avion */}
        <div className="max-h-48 overflow-y-auto space-y-1 border border-slate-700/50 rounded-lg p-2 bg-slate-900/50">
          {filteredAvions.length === 0 ? (
            <p className="text-xs text-slate-500 text-center py-2">Aucun avion trouvé</p>
          ) : (
            filteredAvions.map(avion => (
              <button
                key={avion.id}
                onClick={() => setSelectedAvion(avion.id)}
                className={`w-full text-left p-2 rounded-lg text-sm transition-colors flex items-center justify-between ${
                  selectedAvion === avion.id 
                    ? 'bg-purple-600/30 border border-purple-500/50' 
                    : 'hover:bg-slate-700/50 border border-transparent'
                }`}
              >
                <div>
                  <span className="text-slate-200 font-medium">{avion.nom}</span>
                  {avion.code_oaci && (
                    <span className="ml-2 text-xs text-slate-500 font-mono">{avion.code_oaci}</span>
                  )}
                </div>
                <div className="flex items-center gap-2 text-xs text-slate-500">
                  {avion.capacite_pax > 0 && (
                    <span className="flex items-center gap-0.5">
                      <Users className="h-3 w-3" /> {avion.capacite_pax}
                    </span>
                  )}
                  {avion.capacite_cargo_kg > 0 && (
                    <span className="flex items-center gap-0.5">
                      <Weight className="h-3 w-3" /> {avion.capacite_cargo_kg}kg
                    </span>
                  )}
                  {avion.est_cargo && (
                    <span className="px-1.5 py-0.5 bg-amber-500/20 text-amber-400 rounded text-xs">Cargo</span>
                  )}
                </div>
              </button>
            ))
          )}
        </div>
        
        {/* Quantité */}
        <div className="flex items-center gap-3">
          <div className="flex-1">
            <label className="block text-xs text-slate-400 mb-1">Quantité</label>
            <input
              type="number"
              value={quantite}
              onChange={(e) => setQuantite(e.target.value)}
              min="1"
              className="input w-full text-sm"
            />
          </div>
          <button
            onClick={handleAddAvion}
            disabled={adding || !selectedAvion}
            className="mt-5 px-4 py-2 bg-purple-600 hover:bg-purple-700 disabled:opacity-50 text-white rounded-lg text-sm font-medium transition-colors flex items-center gap-1"
          >
            {adding ? <RefreshCw className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
            Ajouter
          </button>
        </div>
        
        {error && <p className="text-xs text-red-400">{error}</p>}
      </div>

      {/* Liste de la flotte existante */}
      <div>
        <p className="text-xs font-medium text-slate-400 mb-2 flex items-center gap-1">
          <Package className="h-3 w-3" /> Flotte actuelle ({flotte.length} type{flotte.length > 1 ? 's' : ''})
        </p>
        
        {loading ? (
          <div className="flex items-center justify-center py-4">
            <RefreshCw className="h-5 w-5 text-slate-400 animate-spin" />
          </div>
        ) : flotte.length === 0 ? (
          <p className="text-xs text-slate-500 text-center py-4 bg-slate-800/30 rounded-lg">
            Aucun avion dans la flotte
          </p>
        ) : (
          <div className="space-y-2">
            {flotte.map(item => (
              <div 
                key={item.id} 
                className="flex items-center justify-between p-2 bg-slate-800/50 rounded-lg border border-slate-700/50"
              >
                <div className="flex items-center gap-3">
                  <Plane className="h-4 w-4 text-purple-400" />
                  <div>
                    <span className="text-slate-200 text-sm font-medium">
                      {item.types_avion?.nom || 'Avion inconnu'}
                    </span>
                    {item.types_avion?.code_oaci && (
                      <span className="ml-2 text-xs text-slate-500 font-mono">
                        {item.types_avion.code_oaci}
                      </span>
                    )}
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <div className="flex items-center gap-1">
                    <button
                      onClick={() => handleUpdateQuantite(item.id, item.quantite - 1)}
                      disabled={item.quantite <= 1}
                      className="w-6 h-6 rounded bg-slate-700 hover:bg-slate-600 disabled:opacity-50 text-slate-300 text-sm"
                    >
                      -
                    </button>
                    <span className="w-8 text-center text-slate-200 text-sm font-medium">
                      {item.quantite}
                    </span>
                    <button
                      onClick={() => handleUpdateQuantite(item.id, item.quantite + 1)}
                      className="w-6 h-6 rounded bg-slate-700 hover:bg-slate-600 text-slate-300 text-sm"
                    >
                      +
                    </button>
                  </div>
                  <button
                    onClick={() => handleDeleteFlotte(item.id)}
                    disabled={deletingId === item.id}
                    className="p-1.5 text-slate-400 hover:text-red-400 hover:bg-red-500/10 rounded disabled:opacity-50"
                  >
                    {deletingId === item.id ? (
                      <RefreshCw className="h-4 w-4 animate-spin" />
                    ) : (
                      <Trash2 className="h-4 w-4" />
                    )}
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
