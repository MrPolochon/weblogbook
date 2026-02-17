'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { 
  Plus, Search, Plane, ShoppingCart, RefreshCw, Building2, User, 
  Tag, X, AlertCircle, Check, Trash2
} from 'lucide-react';

interface Compagnie {
  id: string;
  nom: string;
  solde: number;
}

interface InventaireItem {
  id: string;
  nom_personnalise: string | null;
  types_avion: { id: string; nom: string; code_oaci: string } | null;
  en_vol: boolean;
  en_vente: boolean;
  disponible: boolean;
  prixAchat: number;
  prixRevente: number;
}

interface FlotteItem {
  id: string;
  immatriculation: string;
  nom_bapteme: string | null;
  usure_percent: number;
  aeroport_actuel: string;
  compagnie_id: string;
  compagnie_nom: string;
  type_avion: { id: string; nom: string; code_oaci: string | null };
}

interface Annonce {
  id: string;
  titre: string;
  description: string | null;
  prix: number;
  etat: string;
  statut: string;
  created_at: string;
  vendeur_id: string | null;
  compagnie_vendeur_id: string | null;
  compagnie_avion_id?: string | null;
  vente_pdg_seulement?: boolean;
  types_avion: { id: string; nom: string; code_oaci: string; constructeur: string; capacite_pax: number; capacite_cargo_kg: number } | null;
  vendeur: { id: string; identifiant: string } | null;
  compagnie_vendeur: { id: string; nom: string } | null;
}

interface Props {
  userId: string;
  soldePerso: number;
  compagnies: Compagnie[];
  inventaire: InventaireItem[];
  flotteDisponible: FlotteItem[];
  isPdg: boolean;
  annonces: Annonce[];
  taxePourcent: number;
}

const ETATS = [
  { value: 'neuf', label: 'Neuf', color: 'text-green-400' },
  { value: 'excellent', label: 'Excellent', color: 'text-emerald-400' },
  { value: 'bon', label: 'Bon', color: 'text-blue-400' },
  { value: 'correct', label: 'Correct', color: 'text-yellow-400' },
  { value: 'usé', label: 'Usé', color: 'text-orange-400' },
];

export default function HangarMarketClient({
  userId,
  soldePerso,
  compagnies,
  inventaire,
  flotteDisponible,
  isPdg,
  annonces,
  taxePourcent
}: Props) {
  const router = useRouter();
  const [, startTransition] = useTransition();
  const [activeTab, setActiveTab] = useState<'acheter' | 'vendre'>('acheter');
  const [searchTerm, setSearchTerm] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  // Modal vente : personnel ou flotte
  const [showVendreModal, setShowVendreModal] = useState(false);
  const [typeVente, setTypeVente] = useState<'personnel' | 'flotte'>('personnel');
  const [selectedAvion, setSelectedAvion] = useState<string>('');
  const [selectedFlotteAvionId, setSelectedFlotteAvionId] = useState<string>('');
  const [ventePdgSeulement, setVentePdgSeulement] = useState(false);
  const [titre, setTitre] = useState('');
  const [description, setDescription] = useState('');
  const [prix, setPrix] = useState('');
  const [etat, setEtat] = useState('bon');

  // Modal achat
  const [showAchatModal, setShowAchatModal] = useState(false);
  const [selectedAnnonce, setSelectedAnnonce] = useState<Annonce | null>(null);
  const [acheterPour, setAcheterPour] = useState<string | null>(null);

  // Filtrer les annonces
  const annoncesFiltrees = annonces.filter(a => {
    const search = searchTerm.toLowerCase();
    return (
      a.titre.toLowerCase().includes(search) ||
      a.types_avion?.nom.toLowerCase().includes(search) ||
      a.vendeur?.identifiant.toLowerCase().includes(search) ||
      a.compagnie_vendeur?.nom.toLowerCase().includes(search)
    );
  });

  // Mes avions disponibles pour la vente
  const mesAvionsDisponibles = inventaire.filter(a => a.disponible);

  async function handleVendre() {
    setError('');
    setLoading(true);

    try {
      const body: Record<string, unknown> = {
        action: 'creer',
        titre,
        description: description || null,
        prix: parseInt(prix),
        etat
      };
      if (typeVente === 'flotte' && selectedFlotteAvionId) {
        body.compagnie_avion_id = selectedFlotteAvionId;
        body.vente_pdg_seulement = ventePdgSeulement;
      } else {
        body.inventaire_avion_id = selectedAvion || undefined;
      }

      const res = await fetch('/api/hangar-market', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body)
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Erreur');

      setSuccess('Annonce créée avec succès !');
      setShowVendreModal(false);
      resetVendreForm();
      startTransition(() => router.refresh());
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erreur');
    } finally {
      setLoading(false);
    }
  }

  async function handleAcheter() {
    if (!selectedAnnonce) return;
    setError('');
    setLoading(true);

    try {
      const res = await fetch('/api/hangar-market', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'acheter',
          annonce_id: selectedAnnonce.id,
          pour_compagnie_id: acheterPour || undefined
        })
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Erreur');

      setSuccess(data.message || 'Achat effectué !');
      setShowAchatModal(false);
      setSelectedAnnonce(null);
      setAcheterPour(null);
      startTransition(() => router.refresh());
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erreur');
    } finally {
      setLoading(false);
    }
  }

  async function handleAnnuler(annonceId: string) {
    if (!confirm('Annuler cette annonce ?')) return;
    setLoading(true);

    try {
      const res = await fetch(`/api/hangar-market?id=${annonceId}`, {
        method: 'DELETE'
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Erreur');

      setSuccess('Annonce annulée');
      startTransition(() => router.refresh());
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erreur');
    } finally {
      setLoading(false);
    }
  }

  function resetVendreForm() {
    setTypeVente('personnel');
    setSelectedAvion('');
    setSelectedFlotteAvionId('');
    setVentePdgSeulement(false);
    setTitre('');
    setDescription('');
    setPrix('');
    setEtat('bon');
  }

  function openVendreModal(mode: 'personnel' | 'flotte', flotteAvionId?: string) {
    setTypeVente(mode);
    setSelectedAvion('');
    const fid = flotteAvionId || '';
    setSelectedFlotteAvionId(fid);
    setVentePdgSeulement(false);
    const av = fid ? flotteDisponible.find(a => a.id === fid) : null;
    setTitre(av ? `${av.immatriculation} - ${av.type_avion.nom}` : '');
    setDescription('');
    setPrix('');
    setEtat('bon');
    setShowVendreModal(true);
  }

  function openAchatModal(annonce: Annonce) {
    setSelectedAnnonce(annonce);
    // Avion de flotte : achat obligatoire pour une compagnie
    const isFlotte = !!annonce.compagnie_avion_id;
    const firstCompagnie = isFlotte && compagnies.length > 0 ? compagnies[0].id : null;
    setAcheterPour(isFlotte ? firstCompagnie : null);
    setShowAchatModal(true);
  }

  const canBuyPersonal = (prix: number) => soldePerso >= prix * (1 + taxePourcent / 100);
  const canBuyForCompagnie = (prix: number, compagnie: Compagnie) => 
    compagnie.solde >= prix * (1 + taxePourcent / 100);

  return (
    <div className="space-y-6">
      {/* Messages */}
      {error && (
        <div className="p-4 bg-red-500/10 border border-red-500/30 rounded-lg flex items-center gap-3 text-red-300">
          <AlertCircle className="h-5 w-5 flex-shrink-0" />
          <p>{error}</p>
          <button onClick={() => setError('')} className="ml-auto"><X className="h-4 w-4" /></button>
        </div>
      )}
      {success && (
        <div className="p-4 bg-green-500/10 border border-green-500/30 rounded-lg flex items-center gap-3 text-green-300">
          <Check className="h-5 w-5 flex-shrink-0" />
          <p>{success}</p>
          <button onClick={() => setSuccess('')} className="ml-auto"><X className="h-4 w-4" /></button>
        </div>
      )}

      {/* Tabs */}
      <div className="flex gap-2">
        <button
          onClick={() => setActiveTab('acheter')}
          className={`px-4 py-2 rounded-lg font-medium transition-colors ${
            activeTab === 'acheter'
              ? 'bg-amber-600 text-white'
              : 'bg-slate-700 text-slate-300 hover:bg-slate-600'
          }`}
        >
          <ShoppingCart className="h-4 w-4 inline mr-2" />
          Acheter
        </button>
        <button
          onClick={() => setActiveTab('vendre')}
          className={`px-4 py-2 rounded-lg font-medium transition-colors ${
            activeTab === 'vendre'
              ? 'bg-amber-600 text-white'
              : 'bg-slate-700 text-slate-300 hover:bg-slate-600'
          }`}
        >
          <Tag className="h-4 w-4 inline mr-2" />
          Vendre
        </button>
      </div>

      {activeTab === 'acheter' && (
        <>
          {/* Recherche */}
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-5 w-5 text-slate-400" />
            <input
              type="text"
              placeholder="Rechercher un avion, vendeur..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full pl-10 pr-4 py-2 bg-slate-800 border border-slate-700 rounded-lg text-slate-200 placeholder-slate-500"
            />
          </div>

          {/* Liste des annonces */}
          {annoncesFiltrees.length === 0 ? (
            <div className="card text-center py-12">
              <Plane className="h-12 w-12 text-slate-600 mx-auto mb-4" />
              <p className="text-slate-400">Aucune annonce disponible</p>
            </div>
          ) : (
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
              {annoncesFiltrees.map((annonce) => {
                const isMyAnnonce = annonce.vendeur_id === userId || 
                  compagnies.some(c => c.id === annonce.compagnie_vendeur_id);
                const prixTotal = Math.round(annonce.prix * (1 + taxePourcent / 100));
                const etatInfo = ETATS.find(e => e.value === annonce.etat);

                return (
                  <div key={annonce.id} className="card hover:border-amber-500/50 transition-colors">
                    <div className="flex items-start justify-between mb-3">
                      <div>
                        <h3 className="font-semibold text-slate-100">{annonce.titre}</h3>
                        <p className="text-sm text-slate-400">
                          {annonce.types_avion?.nom} ({annonce.types_avion?.code_oaci})
                          {annonce.compagnie_avion_id && (
                            <span className="ml-2 text-xs text-sky-400">Flotte</span>
                          )}
                          {annonce.vente_pdg_seulement && (
                            <span className="ml-2 text-xs text-amber-400">PDG uniquement</span>
                          )}
                        </p>
                      </div>
                      <span className={`text-xs font-medium ${etatInfo?.color || 'text-slate-400'}`}>
                        {etatInfo?.label || annonce.etat}
                      </span>
                    </div>

                    {annonce.description && (
                      <p className="text-sm text-slate-400 mb-3 line-clamp-2">{annonce.description}</p>
                    )}

                    <div className="flex items-center gap-2 text-sm text-slate-400 mb-3">
                      {annonce.compagnie_vendeur ? (
                        <>
                          <Building2 className="h-4 w-4" />
                          <span>{annonce.compagnie_vendeur.nom}</span>
                        </>
                      ) : (
                        <>
                          <User className="h-4 w-4" />
                          <span>{annonce.vendeur?.identifiant || 'Anonyme'}</span>
                        </>
                      )}
                    </div>

                    <div className="flex items-center justify-between">
                      <div>
                        <p className="text-xl font-bold text-amber-400">
                          {prixTotal.toLocaleString('fr-FR')} F$
                        </p>
                        <p className="text-xs text-slate-500">
                          dont {Math.round(annonce.prix * taxePourcent / 100).toLocaleString('fr-FR')} F$ de taxe
                        </p>
                      </div>

                      {isMyAnnonce ? (
                        <button
                          onClick={() => handleAnnuler(annonce.id)}
                          disabled={loading}
                          className="px-3 py-1.5 bg-red-600 hover:bg-red-700 text-white rounded-lg text-sm font-medium transition-colors flex items-center gap-1.5"
                        >
                          <Trash2 className="h-4 w-4" />
                          Annuler
                        </button>
                      ) : (
                        <button
                          onClick={() => openAchatModal(annonce)}
                          className="px-3 py-1.5 bg-amber-600 hover:bg-amber-700 text-white rounded-lg text-sm font-medium transition-colors flex items-center gap-1.5"
                        >
                          <ShoppingCart className="h-4 w-4" />
                          Acheter
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </>
      )}

      {activeTab === 'vendre' && (
        <div className="space-y-6">
          <div className="flex flex-wrap gap-2">
            <button
              onClick={() => openVendreModal('personnel')}
              className="px-4 py-2 bg-amber-600 hover:bg-amber-700 text-white rounded-lg font-medium transition-colors flex items-center gap-2"
            >
              <Plus className="h-5 w-5" />
              Vendre un avion personnel
            </button>
            {isPdg && flotteDisponible.length > 0 && (
              <button
                onClick={() => openVendreModal('flotte')}
                className="px-4 py-2 bg-sky-600 hover:bg-sky-700 text-white rounded-lg font-medium transition-colors flex items-center gap-2"
              >
                <Building2 className="h-5 w-5" />
                Vendre un avion de ma flotte
              </button>
            )}
          </div>

          {/* Avions de ma flotte (PDG) */}
          {isPdg && flotteDisponible.length > 0 && (
            <div className="card border-sky-500/30">
              <h3 className="text-lg font-semibold text-slate-100 mb-4 flex items-center gap-2">
                <Building2 className="h-5 w-5 text-sky-400" />
                Avions de ma flotte (vendables)
              </h3>
              <div className="space-y-2">
                {flotteDisponible.map((av) => (
                  <div key={av.id} className="flex items-center justify-between p-3 bg-slate-800 rounded-lg">
                    <div className="flex items-center gap-3">
                      <Plane className="h-5 w-5 text-slate-400" />
                      <div>
                        <p className="text-slate-200 font-mono">{av.immatriculation}</p>
                        <p className="text-sm text-slate-500">
                          {av.type_avion.nom} ({av.type_avion.code_oaci}) — {av.compagnie_nom} · {av.aeroport_actuel} · {av.usure_percent}% usure
                        </p>
                      </div>
                    </div>
                    <button
                      onClick={() => openVendreModal('flotte', av.id)}
                      className="text-sm text-sky-400 hover:text-sky-300"
                    >
                      Mettre en vente
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Mes avions personnels */}
          <div className="card">
            <h3 className="text-lg font-semibold text-slate-100 mb-4">Mes avions personnels</h3>
            {inventaire.length === 0 ? (
              <p className="text-slate-400">Aucun avion dans votre inventaire</p>
            ) : (
              <div className="space-y-2">
                {inventaire.map((item) => (
                  <div key={item.id} className="flex items-center justify-between p-3 bg-slate-800 rounded-lg">
                    <div className="flex items-center gap-3">
                      <Plane className="h-5 w-5 text-slate-400" />
                      <div>
                        <p className="text-slate-200">{item.nom_personnalise || item.types_avion?.nom}</p>
                        <p className="text-sm text-slate-500">{item.types_avion?.code_oaci}</p>
                      </div>
                    </div>
                    <div className="text-right">
                      <div className="text-sm">
                        {item.en_vol && <span className="text-orange-400">En vol</span>}
                        {item.en_vente && <span className="text-amber-400">En vente</span>}
                        {item.disponible && <span className="text-green-400">Disponible</span>}
                      </div>
                      {item.prixRevente > 0 && (
                        <p className="text-xs text-slate-500">
                          Revente : <span className="text-amber-400">{item.prixRevente.toLocaleString('fr-FR')} F$</span>
                        </p>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Modal Vendre */}
      {showVendreModal && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4">
          <div className="bg-slate-800 rounded-xl border border-slate-700 p-6 max-w-lg w-full max-h-[90vh] overflow-y-auto">
            <h3 className="text-lg font-semibold text-slate-100 mb-4">
              {typeVente === 'flotte' ? 'Vendre un avion de ma flotte' : 'Créer une annonce (avion personnel)'}
            </h3>

            <div className="space-y-4">
              {typeVente === 'flotte' ? (
                <>
                  <div>
                    <label className="text-sm text-slate-400 mb-1 block">Avion de la flotte</label>
                    <select
                      value={selectedFlotteAvionId}
                      onChange={(e) => {
                        const id = e.target.value;
                        setSelectedFlotteAvionId(id);
                        const av = flotteDisponible.find(a => a.id === id);
                        if (av && !titre) setTitre(`${av.immatriculation} - ${av.type_avion.nom}`);
                      }}
                      className="w-full p-2 bg-slate-900 border border-slate-700 rounded-lg text-slate-200"
                    >
                      <option value="">Sélectionner un avion</option>
                      {flotteDisponible.map((av) => (
                        <option key={av.id} value={av.id}>
                          {av.immatriculation} — {av.type_avion.nom} ({av.compagnie_nom})
                        </option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="text-sm text-slate-400 mb-2 block">Visible par</label>
                    <div className="flex gap-4">
                      <label className="flex items-center gap-2 cursor-pointer">
                        <input
                          type="radio"
                          checked={!ventePdgSeulement}
                          onChange={() => setVentePdgSeulement(false)}
                          className="rounded border-slate-600 bg-slate-800 text-amber-500"
                        />
                        <span className="text-slate-200">Tout le monde</span>
                      </label>
                      <label className="flex items-center gap-2 cursor-pointer">
                        <input
                          type="radio"
                          checked={ventePdgSeulement}
                          onChange={() => setVentePdgSeulement(true)}
                          className="rounded border-slate-600 bg-slate-800 text-amber-500"
                        />
                        <span className="text-slate-200">PDG uniquement</span>
                      </label>
                    </div>
                    <p className="text-xs text-slate-500 mt-1">
                      « PDG uniquement » : seuls les dirigeants de compagnie pourront voir et acheter cette annonce.
                    </p>
                  </div>
                </>
              ) : (
                <select
                  value={selectedAvion}
                  onChange={(e) => {
                    const avionId = e.target.value;
                    setSelectedAvion(avionId);
                    if (avionId) {
                      const avion = mesAvionsDisponibles.find(a => a.id === avionId);
                      const prixSuggere = avion?.prixRevente || 0;
                      if (avion && !titre) {
                        setTitre(avion.nom_personnalise || avion.types_avion?.nom || '');
                      }
                      if (prixSuggere > 0) {
                        setPrix(prixSuggere.toString());
                      }
                    }
                  }}
                  className="w-full p-2 bg-slate-900 border border-slate-700 rounded-lg text-slate-200"
                >
                  <option value="">Sélectionner un avion</option>
                  {mesAvionsDisponibles.map((item) => (
                    <option key={item.id} value={item.id}>
                      {item.nom_personnalise || item.types_avion?.nom} ({item.types_avion?.code_oaci}) - Valeur : {item.prixRevente.toLocaleString('fr-FR')} F$
                    </option>
                  ))}
                </select>
              )}

              {/* Titre */}
              <input
                type="text"
                placeholder="Titre de l'annonce"
                value={titre}
                onChange={(e) => setTitre(e.target.value)}
                className="w-full p-2 bg-slate-900 border border-slate-700 rounded-lg text-slate-200 placeholder-slate-500"
              />

              {/* Description */}
              <textarea
                placeholder="Description (optionnel)"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                rows={3}
                className="w-full p-2 bg-slate-900 border border-slate-700 rounded-lg text-slate-200 placeholder-slate-500 resize-none"
              />

              {/* Prix */}
              <div>
                <label className="text-sm text-slate-400 mb-1 block">Prix de vente (F$)</label>
                <input
                  type="number"
                  min="1"
                  placeholder="Prix de vente"
                  value={prix}
                  onChange={(e) => setPrix(e.target.value)}
                  className="w-full p-2 bg-slate-900 border border-slate-700 rounded-lg text-slate-200 placeholder-slate-500"
                />
                {typeVente === 'personnel' && selectedAvion && (
                  <p className="text-xs text-amber-400 mt-1">
                    💡 Prix suggéré : 50% du prix d&apos;achat initial. Vous pouvez modifier librement.
                  </p>
                )}
              </div>

              {/* État (surtout pour personnel) */}
              <div>
                <label className="text-sm text-slate-400 mb-1 block">État de l&apos;avion</label>
                <select
                  value={etat}
                  onChange={(e) => setEtat(e.target.value)}
                  className="w-full p-2 bg-slate-900 border border-slate-700 rounded-lg text-slate-200"
                >
                  {ETATS.map((e) => (
                    <option key={e.value} value={e.value}>{e.label}</option>
                  ))}
                </select>
              </div>
            </div>

            {error && <p className="text-sm text-red-400 mt-4">{error}</p>}

            <div className="flex gap-3 mt-6">
              <button
                onClick={handleVendre}
                disabled={loading || !titre || !prix || (typeVente === 'personnel' ? !selectedAvion : !selectedFlotteAvionId)}
                className="flex-1 px-4 py-2 bg-amber-600 hover:bg-amber-700 disabled:opacity-50 text-white rounded-lg font-medium transition-colors flex items-center justify-center gap-2"
              >
                {loading ? <RefreshCw className="h-4 w-4 animate-spin" /> : <Tag className="h-4 w-4" />}
                Mettre en vente
              </button>
              <button
                onClick={() => { setShowVendreModal(false); resetVendreForm(); setError(''); }}
                className="px-4 py-2 bg-slate-700 hover:bg-slate-600 text-slate-200 rounded-lg font-medium transition-colors"
              >
                Annuler
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal Achat */}
      {showAchatModal && selectedAnnonce && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4">
          <div className="bg-slate-800 rounded-xl border border-slate-700 p-6 max-w-md w-full">
            <h3 className="text-lg font-semibold text-slate-100 mb-4">
              Acheter {selectedAnnonce.titre}
            </h3>
            
            <div className="mb-4">
              <p className="text-slate-400">
                {selectedAnnonce.types_avion?.nom} - État : {ETATS.find(e => e.value === selectedAnnonce.etat)?.label}
              </p>
              <p className="text-xl font-bold text-amber-400 mt-2">
                {Math.round(selectedAnnonce.prix * (1 + taxePourcent / 100)).toLocaleString('fr-FR')} F$
              </p>
              <p className="text-sm text-slate-500">
                Prix : {selectedAnnonce.prix.toLocaleString('fr-FR')} F$ + Taxe {taxePourcent}% : {Math.round(selectedAnnonce.prix * taxePourcent / 100).toLocaleString('fr-FR')} F$
              </p>
            </div>

            <div className="space-y-3 mb-6">
              {!selectedAnnonce.compagnie_avion_id && canBuyPersonal(selectedAnnonce.prix) && (
                <button
                  onClick={() => setAcheterPour(null)}
                  className={`w-full flex items-center gap-3 p-3 rounded-lg border transition-colors ${
                    acheterPour === null
                      ? 'border-amber-500 bg-amber-500/20'
                      : 'border-slate-600 hover:border-slate-500'
                  }`}
                >
                  <User className="h-5 w-5 text-emerald-400" />
                  <div className="text-left flex-1">
                    <p className="text-slate-200 font-medium">Usage personnel</p>
                    <p className="text-sm text-slate-400">Solde : {soldePerso.toLocaleString('fr-FR')} F$</p>
                  </div>
                </button>
              )}

              {selectedAnnonce.compagnie_avion_id && (
                <p className="text-sm text-sky-400 mb-2">Cet avion est un avion de flotte : l&apos;achat se fait pour une compagnie dont vous êtes PDG.</p>
              )}

              {compagnies.filter(c => canBuyForCompagnie(selectedAnnonce.prix, c)).map((c) => (
                <button
                  key={c.id}
                  onClick={() => setAcheterPour(c.id)}
                  className={`w-full flex items-center gap-3 p-3 rounded-lg border transition-colors ${
                    acheterPour === c.id
                      ? 'border-amber-500 bg-amber-500/20'
                      : 'border-slate-600 hover:border-slate-500'
                  }`}
                >
                  <Building2 className="h-5 w-5 text-sky-400" />
                  <div className="text-left flex-1">
                    <p className="text-slate-200 font-medium">{c.nom}</p>
                    <p className="text-sm text-slate-400">Solde : {c.solde.toLocaleString('fr-FR')} F$</p>
                  </div>
                </button>
              ))}

              {!selectedAnnonce.compagnie_avion_id && !canBuyPersonal(selectedAnnonce.prix) && compagnies.filter(c => canBuyForCompagnie(selectedAnnonce.prix, c)).length === 0 && (
                <p className="text-red-400 text-center py-4">Solde insuffisant pour cet achat</p>
              )}
              {selectedAnnonce.compagnie_avion_id && compagnies.filter(c => canBuyForCompagnie(selectedAnnonce.prix, c)).length === 0 && (
                <p className="text-red-400 text-center py-4">Aucune de vos compagnies n&apos;a un solde suffisant pour cet achat</p>
              )}
            </div>

            {error && <p className="text-sm text-red-400 mb-4">{error}</p>}

            <div className="flex gap-3">
              <button
                onClick={handleAcheter}
                disabled={loading || (selectedAnnonce.compagnie_avion_id ? !acheterPour : !canBuyPersonal(selectedAnnonce.prix) && acheterPour === null)}
                className="flex-1 px-4 py-2 bg-amber-600 hover:bg-amber-700 disabled:opacity-50 text-white rounded-lg font-medium transition-colors flex items-center justify-center gap-2"
              >
                {loading ? <RefreshCw className="h-4 w-4 animate-spin" /> : <ShoppingCart className="h-4 w-4" />}
                Confirmer l&apos;achat
              </button>
              <button
                onClick={() => { setShowAchatModal(false); setSelectedAnnonce(null); setError(''); }}
                className="px-4 py-2 bg-slate-700 hover:bg-slate-600 text-slate-200 rounded-lg font-medium transition-colors"
              >
                Annuler
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
