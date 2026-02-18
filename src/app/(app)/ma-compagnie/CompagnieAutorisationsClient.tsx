'use client';

import { useState, useEffect, useCallback } from 'react';
import { ShieldCheck, Plus, Loader2, Clock, CheckCircle2, XCircle, Ban, FileText, Search, Plane } from 'lucide-react';

interface TypeAvion {
  id: string;
  nom: string;
  code_oaci: string | null;
  constructeur: string | null;
}

interface Autorisation {
  id: string;
  numero_document: string;
  statut: string;
  motif_demande: string | null;
  motif_reponse: string | null;
  created_at: string;
  traite_at: string | null;
  type_avion: TypeAvion | null;
  demandeur: { id: string; identifiant: string } | null;
  traite_par: { id: string; identifiant: string } | null;
}

interface Props {
  compagnieId: string;
  isPdg?: boolean;
}

const STATUTS = {
  en_attente: { label: 'En attente', color: 'bg-amber-500/20 text-amber-400', icon: Clock },
  approuvee: { label: 'Approuvée', color: 'bg-emerald-500/20 text-emerald-400', icon: CheckCircle2 },
  refusee: { label: 'Refusée', color: 'bg-red-500/20 text-red-400', icon: XCircle },
  revoquee: { label: 'Révoquée', color: 'bg-slate-500/20 text-slate-400', icon: Ban },
};

export default function CompagnieAutorisationsClient({ compagnieId, isPdg = false }: Props) {
  const [autorisations, setAutorisations] = useState<Autorisation[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  // Formulaire nouvelle demande
  const [showForm, setShowForm] = useState(false);
  const [typesAvion, setTypesAvion] = useState<TypeAvion[]>([]);
  const [loadingTypes, setLoadingTypes] = useState(false);
  const [selectedTypeAvionId, setSelectedTypeAvionId] = useState('');
  const [motifDemande, setMotifDemande] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [searchType, setSearchType] = useState('');

  const loadAutorisations = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/autorisations-exploitation?compagnie_id=${compagnieId}`);
      if (res.ok) {
        const data = await res.json();
        setAutorisations(data.map((a: any) => ({
          ...a,
          type_avion: Array.isArray(a.type_avion) ? a.type_avion[0] : a.type_avion,
          demandeur: Array.isArray(a.demandeur) ? a.demandeur[0] : a.demandeur,
          traite_par: Array.isArray(a.traite_par) ? a.traite_par[0] : a.traite_par,
        })));
      }
    } catch {
      setError('Erreur chargement autorisations');
    } finally {
      setLoading(false);
    }
  }, [compagnieId]);

  useEffect(() => {
    loadAutorisations();
  }, [loadAutorisations]);

  async function loadTypesAvion() {
    setLoadingTypes(true);
    try {
      const res = await fetch('/api/marketplace');
      if (res.ok) {
        const data = await res.json();
        setTypesAvion(data);
      }
    } catch {
      setError('Erreur chargement types avion');
    } finally {
      setLoadingTypes(false);
    }
  }

  function handleOpenForm() {
    setShowForm(true);
    setSelectedTypeAvionId('');
    setMotifDemande('');
    setSearchType('');
    if (typesAvion.length === 0) {
      loadTypesAvion();
    }
  }

  async function handleSubmit() {
    if (!selectedTypeAvionId) {
      setError('Sélectionnez un type d\'avion');
      return;
    }
    setSubmitting(true);
    setError('');

    try {
      const res = await fetch('/api/autorisations-exploitation', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          compagnie_id: compagnieId,
          type_avion_id: selectedTypeAvionId,
          motif_demande: motifDemande || null,
        }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Erreur');

      setSuccess(data.message || 'Demande envoyée');
      setShowForm(false);
      loadAutorisations();
      setTimeout(() => setSuccess(''), 5000);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erreur');
    } finally {
      setSubmitting(false);
    }
  }

  // Types déjà demandés (en_attente ou approuvés)
  const typesDejaActifs = new Set(
    autorisations
      .filter(a => a.statut === 'en_attente' || a.statut === 'approuvee')
      .map(a => a.type_avion?.id)
      .filter(Boolean)
  );

  const typesDisponibles = typesAvion.filter(t =>
    !typesDejaActifs.has(t.id) &&
    (searchType === '' || t.nom.toLowerCase().includes(searchType.toLowerCase()) || (t.constructeur || '').toLowerCase().includes(searchType.toLowerCase()))
  );

  const autorisationsApprouvees = autorisations.filter(a => a.statut === 'approuvee');
  const autorisationsEnAttente = autorisations.filter(a => a.statut === 'en_attente');
  const autorisationsAutres = autorisations.filter(a => a.statut !== 'approuvee' && a.statut !== 'en_attente');

  return (
    <div className="card">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-lg font-semibold text-slate-100 flex items-center gap-2">
          <ShieldCheck className="h-5 w-5 text-sky-400" />
          Autorisations d&apos;exploitation
        </h2>
        {isPdg && (
          <button
            onClick={handleOpenForm}
            className="btn-primary text-sm flex items-center gap-1.5"
          >
            <Plus className="h-4 w-4" />
            Nouvelle demande
          </button>
        )}
      </div>

      <p className="text-xs text-slate-400 mb-4">
        Chaque type d&apos;avion nécessite une autorisation d&apos;exploitation approuvée par l&apos;IFSA avant de pouvoir être acheté pour la compagnie.
      </p>

      {error && <p className="text-red-400 text-sm mb-3">{error}</p>}
      {success && <p className="text-emerald-400 text-sm mb-3">{success}</p>}

      {/* Formulaire nouvelle demande */}
      {showForm && isPdg && (
        <div className="mb-6 p-4 rounded-xl bg-sky-500/5 border border-sky-500/20">
          <h3 className="text-sm font-semibold text-slate-200 mb-3 flex items-center gap-2">
            <FileText className="h-4 w-4 text-sky-400" />
            Demande d&apos;autorisation d&apos;exploitation
          </h3>

          {loadingTypes ? (
            <div className="flex items-center gap-2 text-slate-400 text-sm">
              <Loader2 className="h-4 w-4 animate-spin" />
              Chargement des types d&apos;avion...
            </div>
          ) : (
            <>
              <div className="mb-3">
                <label className="label">Type d&apos;avion</label>
                <div className="relative mb-2">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-500" />
                  <input
                    type="text"
                    value={searchType}
                    onChange={e => setSearchType(e.target.value)}
                    placeholder="Rechercher un avion..."
                    className="input w-full pl-9"
                  />
                </div>
                <div className="max-h-48 overflow-y-auto rounded-lg border border-slate-700 bg-slate-800/50">
                  {typesDisponibles.length === 0 ? (
                    <p className="text-slate-500 text-xs p-3">
                      {searchType ? 'Aucun résultat' : 'Tous les types sont déjà demandés ou autorisés'}
                    </p>
                  ) : (
                    typesDisponibles.map(t => (
                      <button
                        key={t.id}
                        onClick={() => setSelectedTypeAvionId(t.id)}
                        className={`w-full text-left px-3 py-2 text-sm flex items-center gap-2 transition-colors ${
                          selectedTypeAvionId === t.id
                            ? 'bg-sky-500/20 text-sky-300'
                            : 'text-slate-300 hover:bg-slate-700/50'
                        }`}
                      >
                        <Plane className="h-3.5 w-3.5 flex-shrink-0" />
                        <span className="font-medium">{t.nom}</span>
                        {t.constructeur && <span className="text-slate-500 text-xs">({t.constructeur})</span>}
                      </button>
                    ))
                  )}
                </div>
              </div>

              <div className="mb-3">
                <label className="label">Motif de la demande (optionnel)</label>
                <textarea
                  value={motifDemande}
                  onChange={e => setMotifDemande(e.target.value)}
                  placeholder="Expliquez pourquoi vous souhaitez exploiter ce type d'avion..."
                  className="input w-full h-20 resize-none"
                />
              </div>

              <div className="flex gap-2">
                <button
                  onClick={handleSubmit}
                  disabled={submitting || !selectedTypeAvionId}
                  className="btn-primary text-sm flex items-center gap-1.5"
                >
                  {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <ShieldCheck className="h-4 w-4" />}
                  Envoyer la demande
                </button>
                <button
                  onClick={() => setShowForm(false)}
                  className="px-3 py-1.5 rounded-lg text-sm text-slate-400 hover:bg-slate-700 transition-colors"
                >
                  Annuler
                </button>
              </div>
            </>
          )}
        </div>
      )}

      {loading ? (
        <div className="flex items-center gap-2 text-slate-400 text-sm py-6 justify-center">
          <Loader2 className="h-4 w-4 animate-spin" />
          Chargement...
        </div>
      ) : autorisations.length === 0 ? (
        <p className="text-slate-500 text-sm text-center py-6">
          Aucune autorisation d&apos;exploitation. {isPdg ? 'Faites une demande pour pouvoir acheter des avions.' : ''}
        </p>
      ) : (
        <div className="space-y-4">
          {/* Autorisations approuvées */}
          {autorisationsApprouvees.length > 0 && (
            <div>
              <h3 className="text-xs font-semibold text-emerald-400 uppercase tracking-wider mb-2">
                Autorisées ({autorisationsApprouvees.length})
              </h3>
              <div className="grid gap-2 sm:grid-cols-2">
                {autorisationsApprouvees.map(a => (
                  <AutorisationCard key={a.id} autorisation={a} />
                ))}
              </div>
            </div>
          )}

          {/* En attente */}
          {autorisationsEnAttente.length > 0 && (
            <div>
              <h3 className="text-xs font-semibold text-amber-400 uppercase tracking-wider mb-2">
                En attente ({autorisationsEnAttente.length})
              </h3>
              <div className="grid gap-2 sm:grid-cols-2">
                {autorisationsEnAttente.map(a => (
                  <AutorisationCard key={a.id} autorisation={a} />
                ))}
              </div>
            </div>
          )}

          {/* Refusées / Révoquées */}
          {autorisationsAutres.length > 0 && (
            <details className="group">
              <summary className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2 cursor-pointer hover:text-slate-300">
                Refusées / Révoquées ({autorisationsAutres.length})
              </summary>
              <div className="grid gap-2 sm:grid-cols-2 mt-2">
                {autorisationsAutres.map(a => (
                  <AutorisationCard key={a.id} autorisation={a} />
                ))}
              </div>
            </details>
          )}
        </div>
      )}
    </div>
  );
}

function AutorisationCard({ autorisation }: { autorisation: Autorisation }) {
  const statut = STATUTS[autorisation.statut as keyof typeof STATUTS] || STATUTS.en_attente;
  const StatutIcon = statut.icon;

  return (
    <div className="p-3 rounded-lg bg-slate-800/50 border border-slate-700/50">
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-center gap-2 min-w-0">
          <Plane className="h-4 w-4 text-sky-400 flex-shrink-0" />
          <span className="text-sm font-medium text-slate-200 truncate">
            {autorisation.type_avion?.nom || 'Type inconnu'}
          </span>
        </div>
        <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium whitespace-nowrap ${statut.color}`}>
          <StatutIcon className="h-3 w-3" />
          {statut.label}
        </span>
      </div>
      <div className="mt-1.5 text-xs text-slate-500 space-y-0.5">
        <p className="font-mono">{autorisation.numero_document}</p>
        {autorisation.type_avion?.constructeur && (
          <p>{autorisation.type_avion.constructeur}</p>
        )}
        {autorisation.motif_reponse && (
          <p className="text-slate-400 italic">&laquo; {autorisation.motif_reponse} &raquo;</p>
        )}
        {autorisation.traite_par && (
          <p>Traité par {autorisation.traite_par.identifiant}</p>
        )}
      </div>
    </div>
  );
}
