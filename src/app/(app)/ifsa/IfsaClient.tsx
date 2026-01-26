'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { 
  AlertTriangle, FileSearch, Gavel, Plus, X, Check, Loader2, 
  Clock, User, Building2, ChevronRight, Search, Eye, CheckCircle2
} from 'lucide-react';

interface Signalement {
  id: string;
  numero_signalement: string;
  type_signalement: string;
  titre: string;
  description: string;
  statut: string;
  preuves: string | null;
  created_at: string;
  reponse_ifsa: string | null;
  signale_par: { id: string; identifiant: string } | null;
  pilote_signale: { id: string; identifiant: string } | null;
  compagnie_signalee: { id: string; nom: string } | null;
  traite_par: { id: string; identifiant: string } | null;
}

interface Enquete {
  id: string;
  numero_dossier: string;
  titre: string;
  description: string | null;
  statut: string;
  priorite: string;
  conclusion: string | null;
  created_at: string;
  cloture_at: string | null;
  pilote_concerne: { id: string; identifiant: string } | null;
  compagnie_concernee: { id: string; nom: string } | null;
  enqueteur: { id: string; identifiant: string } | null;
  ouvert_par: { id: string; identifiant: string } | null;
}

interface Sanction {
  id: string;
  type_sanction: string;
  cible_type: string;
  motif: string;
  details: string | null;
  duree_jours: number | null;
  montant_amende: number | null;
  actif: boolean;
  created_at: string;
  expire_at: string | null;
  cleared_at: string | null;
  cible_pilote: { id: string; identifiant: string } | null;
  cible_compagnie: { id: string; nom: string } | null;
  emis_par: { id: string; identifiant: string } | null;
  cleared_by: { id: string; identifiant: string } | null;
}

interface Props {
  signalements: Signalement[];
  enquetes: Enquete[];
  sanctions: Sanction[];
  pilotes: Array<{ id: string; identifiant: string }>;
  compagnies: Array<{ id: string; nom: string }>;
  agentsIfsa: Array<{ id: string; identifiant: string }>;
}

const TYPES_SANCTIONS = [
  { value: 'avertissement', label: '⚠️ Avertissement', color: 'text-amber-400' },
  { value: 'suspension_temporaire', label: '🚫 Suspension temporaire', color: 'text-orange-400' },
  { value: 'suspension_licence', label: '🔴 Suspension de licence', color: 'text-red-400' },
  { value: 'retrait_licence', label: '❌ Retrait de licence', color: 'text-red-500' },
  { value: 'amende', label: '💰 Amende', color: 'text-yellow-400' }
];

const STATUTS_SIGNALEMENT = {
  nouveau: { label: 'Nouveau', color: 'bg-blue-500/20 text-blue-400' },
  en_examen: { label: 'En examen', color: 'bg-amber-500/20 text-amber-400' },
  enquete_ouverte: { label: 'Enquête ouverte', color: 'bg-purple-500/20 text-purple-400' },
  classe: { label: 'Classé', color: 'bg-emerald-500/20 text-emerald-400' },
  rejete: { label: 'Rejeté', color: 'bg-red-500/20 text-red-400' }
};

const STATUTS_ENQUETE = {
  ouverte: { label: 'Ouverte', color: 'bg-blue-500/20 text-blue-400' },
  en_cours: { label: 'En cours', color: 'bg-amber-500/20 text-amber-400' },
  cloturee: { label: 'Clôturée', color: 'bg-emerald-500/20 text-emerald-400' },
  classee: { label: 'Classée', color: 'bg-slate-500/20 text-slate-400' }
};

const PRIORITES = {
  basse: { label: 'Basse', color: 'text-slate-400' },
  normale: { label: 'Normale', color: 'text-blue-400' },
  haute: { label: 'Haute', color: 'text-orange-400' },
  urgente: { label: 'Urgente', color: 'text-red-400' }
};

export default function IfsaClient({ signalements, enquetes, sanctions, pilotes, compagnies, agentsIfsa }: Props) {
  const router = useRouter();
  const [activeTab, setActiveTab] = useState<'signalements' | 'enquetes' | 'sanctions'>('signalements');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  // Modals
  const [showSanctionModal, setShowSanctionModal] = useState(false);
  const [showEnqueteModal, setShowEnqueteModal] = useState(false);
  const [selectedSignalement, setSelectedSignalement] = useState<Signalement | null>(null);
  const [selectedEnquete, setSelectedEnquete] = useState<Enquete | null>(null);

  // Formulaire sanction
  const [sanctionType, setSanctionType] = useState('avertissement');
  const [sanctionCibleType, setSanctionCibleType] = useState<'pilote' | 'compagnie'>('pilote');
  const [sanctionCibleId, setSanctionCibleId] = useState('');
  const [sanctionMotif, setSanctionMotif] = useState('');
  const [sanctionDetails, setSanctionDetails] = useState('');
  const [sanctionDuree, setSanctionDuree] = useState('');
  const [sanctionMontant, setSanctionMontant] = useState('');
  const [searchCible, setSearchCible] = useState('');

  // Formulaire enquête
  const [enqueteTitre, setEnqueteTitre] = useState('');
  const [enqueteDescription, setEnqueteDescription] = useState('');
  const [enquetePriorite, setEnquetePriorite] = useState('normale');
  const [enquetePiloteId, setEnquetePiloteId] = useState('');
  const [enqueteCompagnieId, setEnqueteCompagnieId] = useState('');

  // Filtres
  const pilotesFiltres = pilotes.filter(p => 
    p.identifiant.toLowerCase().includes(searchCible.toLowerCase())
  ).slice(0, 10);

  async function handleCreerSanction() {
    if (!sanctionCibleId || !sanctionMotif) {
      setError('Cible et motif requis');
      return;
    }

    setLoading(true);
    setError('');

    try {
      const res = await fetch('/api/ifsa/sanctions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type_sanction: sanctionType,
          cible_type: sanctionCibleType,
          cible_pilote_id: sanctionCibleType === 'pilote' ? sanctionCibleId : null,
          cible_compagnie_id: sanctionCibleType === 'compagnie' ? sanctionCibleId : null,
          motif: sanctionMotif,
          details: sanctionDetails || null,
          duree_jours: sanctionDuree ? parseInt(sanctionDuree) : null,
          montant_amende: sanctionMontant ? parseInt(sanctionMontant) : null
        })
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Erreur');

      setSuccess('Sanction émise avec succès');
      setShowSanctionModal(false);
      resetSanctionForm();
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erreur');
    } finally {
      setLoading(false);
    }
  }

  async function handleLeverSanction(sanctionId: string) {
    if (!confirm('Lever cette sanction ?')) return;

    setLoading(true);
    try {
      const res = await fetch('/api/ifsa/sanctions', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: sanctionId })
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Erreur');

      setSuccess('Sanction levée');
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erreur');
    } finally {
      setLoading(false);
    }
  }

  async function handleCreerEnquete(signalementId?: string) {
    if (!enqueteTitre) {
      setError('Titre requis');
      return;
    }

    setLoading(true);
    setError('');

    try {
      const res = await fetch('/api/ifsa/enquetes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          titre: enqueteTitre,
          description: enqueteDescription || null,
          priorite: enquetePriorite,
          pilote_concerne_id: enquetePiloteId || null,
          compagnie_concernee_id: enqueteCompagnieId || null,
          signalement_id: signalementId || null
        })
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Erreur');

      setSuccess(`Enquête ${data.enquete.numero_dossier} ouverte`);
      setShowEnqueteModal(false);
      setSelectedSignalement(null);
      resetEnqueteForm();
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erreur');
    } finally {
      setLoading(false);
    }
  }

  async function handleUpdateEnquete(enqueteId: string, updates: Record<string, unknown>) {
    setLoading(true);
    try {
      const res = await fetch('/api/ifsa/enquetes', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: enqueteId, ...updates })
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Erreur');

      setSuccess('Enquête mise à jour');
      setSelectedEnquete(null);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erreur');
    } finally {
      setLoading(false);
    }
  }

  async function handleUpdateSignalement(signalementId: string, updates: Record<string, unknown>) {
    setLoading(true);
    try {
      const res = await fetch('/api/ifsa/signalements', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: signalementId, ...updates })
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Erreur');

      setSuccess('Signalement mis à jour');
      setSelectedSignalement(null);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erreur');
    } finally {
      setLoading(false);
    }
  }

  function resetSanctionForm() {
    setSanctionType('avertissement');
    setSanctionCibleType('pilote');
    setSanctionCibleId('');
    setSanctionMotif('');
    setSanctionDetails('');
    setSanctionDuree('');
    setSanctionMontant('');
    setSearchCible('');
  }

  function resetEnqueteForm() {
    setEnqueteTitre('');
    setEnqueteDescription('');
    setEnquetePriorite('normale');
    setEnquetePiloteId('');
    setEnqueteCompagnieId('');
  }

  function openEnqueteFromSignalement(sig: Signalement) {
    setEnqueteTitre(`Suite signalement ${sig.numero_signalement}`);
    setEnqueteDescription(sig.description);
    if (sig.pilote_signale?.id) setEnquetePiloteId(sig.pilote_signale.id);
    if (sig.compagnie_signalee?.id) setEnqueteCompagnieId(sig.compagnie_signalee.id);
    setSelectedSignalement(sig);
    setShowEnqueteModal(true);
  }

  return (
    <div className="space-y-6">
      {/* Messages */}
      {error && (
        <div className="p-4 bg-red-500/10 border border-red-500/30 rounded-lg flex items-center gap-3 text-red-300">
          <X className="h-5 w-5" />
          <p>{error}</p>
          <button onClick={() => setError('')} className="ml-auto"><X className="h-4 w-4" /></button>
        </div>
      )}
      {success && (
        <div className="p-4 bg-emerald-500/10 border border-emerald-500/30 rounded-lg flex items-center gap-3 text-emerald-300">
          <Check className="h-5 w-5" />
          <p>{success}</p>
          <button onClick={() => setSuccess('')} className="ml-auto"><X className="h-4 w-4" /></button>
        </div>
      )}

      {/* Tabs */}
      <div className="flex gap-2 flex-wrap">
        <button
          onClick={() => setActiveTab('signalements')}
          className={`px-4 py-2 rounded-lg font-medium transition-colors ${
            activeTab === 'signalements' ? 'bg-indigo-600 text-white' : 'bg-slate-700 text-slate-300 hover:bg-slate-600'
          }`}
        >
          <AlertTriangle className="h-4 w-4 inline mr-2" />
          Signalements
          {signalements.filter(s => s.statut === 'nouveau').length > 0 && (
            <span className="ml-2 px-1.5 py-0.5 bg-red-500 text-white text-xs rounded-full">
              {signalements.filter(s => s.statut === 'nouveau').length}
            </span>
          )}
        </button>
        <button
          onClick={() => setActiveTab('enquetes')}
          className={`px-4 py-2 rounded-lg font-medium transition-colors ${
            activeTab === 'enquetes' ? 'bg-indigo-600 text-white' : 'bg-slate-700 text-slate-300 hover:bg-slate-600'
          }`}
        >
          <FileSearch className="h-4 w-4 inline mr-2" />
          Enquêtes
        </button>
        <button
          onClick={() => setActiveTab('sanctions')}
          className={`px-4 py-2 rounded-lg font-medium transition-colors ${
            activeTab === 'sanctions' ? 'bg-indigo-600 text-white' : 'bg-slate-700 text-slate-300 hover:bg-slate-600'
          }`}
        >
          <Gavel className="h-4 w-4 inline mr-2" />
          Sanctions
        </button>

        <div className="ml-auto flex gap-2">
          <button
            onClick={() => setShowEnqueteModal(true)}
            className="px-3 py-2 bg-purple-600 hover:bg-purple-700 text-white rounded-lg text-sm font-medium flex items-center gap-2"
          >
            <Plus className="h-4 w-4" />
            Nouvelle enquête
          </button>
          <button
            onClick={() => setShowSanctionModal(true)}
            className="px-3 py-2 bg-red-600 hover:bg-red-700 text-white rounded-lg text-sm font-medium flex items-center gap-2"
          >
            <Plus className="h-4 w-4" />
            Nouvelle sanction
          </button>
        </div>
      </div>

      {/* Contenu des tabs */}
      {activeTab === 'signalements' && (
        <div className="card">
          <h2 className="text-lg font-semibold text-slate-100 mb-4">Signalements reçus</h2>
          {signalements.length === 0 ? (
            <p className="text-slate-400">Aucun signalement.</p>
          ) : (
            <div className="space-y-3">
              {signalements.map((sig) => {
                const statutInfo = STATUTS_SIGNALEMENT[sig.statut as keyof typeof STATUTS_SIGNALEMENT] || STATUTS_SIGNALEMENT.nouveau;
                return (
                  <div key={sig.id} className="p-4 bg-slate-800/50 rounded-lg border border-slate-700 hover:border-slate-600 transition-colors">
                    <div className="flex items-start justify-between gap-4 flex-wrap">
                      <div className="flex-1">
                        <div className="flex items-center gap-2 mb-1 flex-wrap">
                          <span className="text-xs font-mono text-slate-500">{sig.numero_signalement}</span>
                          <span className={`text-xs font-medium px-2 py-0.5 rounded ${statutInfo.color}`}>
                            {statutInfo.label}
                          </span>
                          <span className="text-xs text-slate-500 capitalize">{sig.type_signalement}</span>
                        </div>
                        <h3 className="font-medium text-slate-200">{sig.titre}</h3>
                        <p className="text-sm text-slate-400 mt-1 line-clamp-2">{sig.description}</p>
                        <div className="flex items-center gap-4 mt-2 text-xs text-slate-500 flex-wrap">
                          <span className="flex items-center gap-1">
                            <User className="h-3 w-3" />
                            Par: {sig.signale_par?.identifiant || 'Anonyme'}
                          </span>
                          {sig.pilote_signale && (
                            <span className="flex items-center gap-1 text-red-400">
                              <User className="h-3 w-3" />
                              Contre: {sig.pilote_signale.identifiant}
                            </span>
                          )}
                          {sig.compagnie_signalee && (
                            <span className="flex items-center gap-1 text-red-400">
                              <Building2 className="h-3 w-3" />
                              Contre: {sig.compagnie_signalee.nom}
                            </span>
                          )}
                          <span className="flex items-center gap-1">
                            <Clock className="h-3 w-3" />
                            {new Date(sig.created_at).toLocaleDateString('fr-FR')}
                          </span>
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        {sig.statut === 'nouveau' && (
                          <>
                            <button
                              onClick={() => handleUpdateSignalement(sig.id, { statut: 'en_examen' })}
                              className="px-2 py-1 bg-amber-600 hover:bg-amber-700 text-white rounded text-xs font-medium"
                            >
                              Examiner
                            </button>
                            <button
                              onClick={() => openEnqueteFromSignalement(sig)}
                              className="px-2 py-1 bg-purple-600 hover:bg-purple-700 text-white rounded text-xs font-medium"
                            >
                              Ouvrir enquête
                            </button>
                          </>
                        )}
                        {sig.statut === 'en_examen' && (
                          <>
                            <button
                              onClick={() => openEnqueteFromSignalement(sig)}
                              className="px-2 py-1 bg-purple-600 hover:bg-purple-700 text-white rounded text-xs font-medium"
                            >
                              Ouvrir enquête
                            </button>
                            <button
                              onClick={() => handleUpdateSignalement(sig.id, { statut: 'classe' })}
                              className="px-2 py-1 bg-emerald-600 hover:bg-emerald-700 text-white rounded text-xs font-medium"
                            >
                              Classer
                            </button>
                            <button
                              onClick={() => handleUpdateSignalement(sig.id, { statut: 'rejete' })}
                              className="px-2 py-1 bg-red-600 hover:bg-red-700 text-white rounded text-xs font-medium"
                            >
                              Rejeter
                            </button>
                          </>
                        )}
                        <button
                          onClick={() => setSelectedSignalement(sig)}
                          className="p-1 text-slate-400 hover:text-slate-200"
                        >
                          <Eye className="h-4 w-4" />
                        </button>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {activeTab === 'enquetes' && (
        <div className="card">
          <h2 className="text-lg font-semibold text-slate-100 mb-4">Enquêtes en cours</h2>
          {enquetes.length === 0 ? (
            <p className="text-slate-400">Aucune enquête.</p>
          ) : (
            <div className="space-y-3">
              {enquetes.map((enq) => {
                const statutInfo = STATUTS_ENQUETE[enq.statut as keyof typeof STATUTS_ENQUETE] || STATUTS_ENQUETE.ouverte;
                const prioriteInfo = PRIORITES[enq.priorite as keyof typeof PRIORITES] || PRIORITES.normale;
                return (
                  <div key={enq.id} className="p-4 bg-slate-800/50 rounded-lg border border-slate-700">
                    <div className="flex items-start justify-between gap-4 flex-wrap">
                      <div className="flex-1">
                        <div className="flex items-center gap-2 mb-1 flex-wrap">
                          <span className="text-xs font-mono text-slate-500">{enq.numero_dossier}</span>
                          <span className={`text-xs font-medium px-2 py-0.5 rounded ${statutInfo.color}`}>
                            {statutInfo.label}
                          </span>
                          <span className={`text-xs font-medium ${prioriteInfo.color}`}>
                            {prioriteInfo.label}
                          </span>
                        </div>
                        <h3 className="font-medium text-slate-200">{enq.titre}</h3>
                        {enq.description && (
                          <p className="text-sm text-slate-400 mt-1 line-clamp-2">{enq.description}</p>
                        )}
                        <div className="flex items-center gap-4 mt-2 text-xs text-slate-500 flex-wrap">
                          <span>Enquêteur: {enq.enqueteur?.identifiant || 'Non assigné'}</span>
                          {enq.pilote_concerne && (
                            <span className="text-amber-400">Pilote: {enq.pilote_concerne.identifiant}</span>
                          )}
                          {enq.compagnie_concernee && (
                            <span className="text-amber-400">Compagnie: {enq.compagnie_concernee.nom}</span>
                          )}
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        {(enq.statut === 'ouverte' || enq.statut === 'en_cours') && (
                          <>
                            {enq.statut === 'ouverte' && (
                              <button
                                onClick={() => handleUpdateEnquete(enq.id, { statut: 'en_cours' })}
                                className="px-2 py-1 bg-amber-600 hover:bg-amber-700 text-white rounded text-xs font-medium"
                              >
                                Démarrer
                              </button>
                            )}
                            <button
                              onClick={() => handleUpdateEnquete(enq.id, { statut: 'cloturee' })}
                              className="px-2 py-1 bg-emerald-600 hover:bg-emerald-700 text-white rounded text-xs font-medium"
                            >
                              Clôturer
                            </button>
                            <button
                              onClick={() => handleUpdateEnquete(enq.id, { statut: 'classee' })}
                              className="px-2 py-1 bg-slate-600 hover:bg-slate-500 text-white rounded text-xs font-medium"
                            >
                              Classer
                            </button>
                          </>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {activeTab === 'sanctions' && (
        <div className="card">
          <h2 className="text-lg font-semibold text-slate-100 mb-4">Sanctions</h2>
          {sanctions.length === 0 ? (
            <p className="text-slate-400">Aucune sanction.</p>
          ) : (
            <div className="space-y-3">
              {sanctions.map((sanc) => {
                const typeInfo = TYPES_SANCTIONS.find(t => t.value === sanc.type_sanction);
                return (
                  <div 
                    key={sanc.id} 
                    className={`p-4 rounded-lg border ${
                      sanc.actif 
                        ? 'bg-red-500/10 border-red-500/30' 
                        : 'bg-slate-800/50 border-slate-700 opacity-60'
                    }`}
                  >
                    <div className="flex items-start justify-between gap-4 flex-wrap">
                      <div className="flex-1">
                        <div className="flex items-center gap-2 mb-1 flex-wrap">
                          <span className={`text-sm font-medium ${typeInfo?.color || 'text-slate-400'}`}>
                            {typeInfo?.label || sanc.type_sanction}
                          </span>
                          {!sanc.actif && (
                            <span className="text-xs font-medium px-2 py-0.5 rounded bg-emerald-500/20 text-emerald-400">
                              Levée
                            </span>
                          )}
                        </div>
                        <p className="text-slate-200 font-medium">{sanc.motif}</p>
                        {sanc.details && (
                          <p className="text-sm text-slate-400 mt-1">{sanc.details}</p>
                        )}
                        <div className="flex items-center gap-4 mt-2 text-xs text-slate-500 flex-wrap">
                          <span>
                            Cible: {sanc.cible_pilote?.identifiant || sanc.cible_compagnie?.nom || 'Inconnu'}
                          </span>
                          <span>Par: {sanc.emis_par?.identifiant || 'Système'}</span>
                          {sanc.duree_jours && <span>Durée: {sanc.duree_jours} jours</span>}
                          {sanc.montant_amende && <span>Amende: {sanc.montant_amende} F$</span>}
                          {sanc.cleared_by && (
                            <span className="text-emerald-400">Levée par: {sanc.cleared_by.identifiant}</span>
                          )}
                        </div>
                      </div>
                      {sanc.actif && (
                        <button
                          onClick={() => handleLeverSanction(sanc.id)}
                          disabled={loading}
                          className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded text-sm font-medium flex items-center gap-1"
                        >
                          <CheckCircle2 className="h-4 w-4" />
                          Lever
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* Modal Nouvelle Sanction */}
      {showSanctionModal && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4">
          <div className="bg-slate-800 rounded-xl border border-slate-700 p-6 max-w-lg w-full max-h-[90vh] overflow-y-auto">
            <h3 className="text-lg font-semibold text-slate-100 mb-4 flex items-center gap-2">
              <Gavel className="h-5 w-5 text-red-400" />
              Émettre une sanction
            </h3>

            <div className="space-y-4">
              {/* Type de sanction */}
              <div>
                <label className="label">Type de sanction</label>
                <select
                  value={sanctionType}
                  onChange={(e) => setSanctionType(e.target.value)}
                  className="input w-full"
                >
                  {TYPES_SANCTIONS.map(t => (
                    <option key={t.value} value={t.value}>{t.label}</option>
                  ))}
                </select>
              </div>

              {/* Cible */}
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => { setSanctionCibleType('pilote'); setSanctionCibleId(''); setSearchCible(''); }}
                  className={`flex-1 p-2 rounded-lg border ${
                    sanctionCibleType === 'pilote' ? 'border-red-500 bg-red-500/20' : 'border-slate-700'
                  }`}
                >
                  <User className="h-4 w-4 mx-auto mb-1" />
                  <p className="text-xs">Pilote</p>
                </button>
                <button
                  type="button"
                  onClick={() => { setSanctionCibleType('compagnie'); setSanctionCibleId(''); setSearchCible(''); }}
                  className={`flex-1 p-2 rounded-lg border ${
                    sanctionCibleType === 'compagnie' ? 'border-red-500 bg-red-500/20' : 'border-slate-700'
                  }`}
                >
                  <Building2 className="h-4 w-4 mx-auto mb-1" />
                  <p className="text-xs">Compagnie</p>
                </button>
              </div>

              {sanctionCibleType === 'pilote' ? (
                <div>
                  <label className="label">Pilote</label>
                  <div className="relative">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
                    <input
                      type="text"
                      value={searchCible}
                      onChange={(e) => { setSearchCible(e.target.value); setSanctionCibleId(''); }}
                      placeholder="Rechercher un pilote..."
                      className="input w-full pl-10"
                    />
                  </div>
                  {searchCible && pilotesFiltres.length > 0 && !sanctionCibleId && (
                    <div className="mt-1 bg-slate-900 rounded-lg border border-slate-700 max-h-32 overflow-y-auto">
                      {pilotesFiltres.map(p => (
                        <button
                          key={p.id}
                          type="button"
                          onClick={() => { setSanctionCibleId(p.id); setSearchCible(p.identifiant); }}
                          className="w-full px-3 py-2 text-left text-sm text-slate-200 hover:bg-slate-800"
                        >
                          {p.identifiant}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              ) : (
                <div>
                  <label className="label">Compagnie</label>
                  <select
                    value={sanctionCibleId}
                    onChange={(e) => setSanctionCibleId(e.target.value)}
                    className="input w-full"
                  >
                    <option value="">Sélectionner une compagnie</option>
                    {compagnies.map(c => (
                      <option key={c.id} value={c.id}>{c.nom}</option>
                    ))}
                  </select>
                </div>
              )}

              {/* Motif */}
              <div>
                <label className="label">Motif *</label>
                <input
                  type="text"
                  value={sanctionMotif}
                  onChange={(e) => setSanctionMotif(e.target.value)}
                  placeholder="Raison de la sanction"
                  className="input w-full"
                />
              </div>

              {/* Détails */}
              <div>
                <label className="label">Détails (optionnel)</label>
                <textarea
                  value={sanctionDetails}
                  onChange={(e) => setSanctionDetails(e.target.value)}
                  placeholder="Informations complémentaires..."
                  rows={2}
                  className="input w-full resize-none"
                />
              </div>

              {/* Durée pour suspension */}
              {sanctionType === 'suspension_temporaire' && (
                <div>
                  <label className="label">Durée (jours)</label>
                  <input
                    type="number"
                    value={sanctionDuree}
                    onChange={(e) => setSanctionDuree(e.target.value)}
                    min="1"
                    placeholder="Nombre de jours"
                    className="input w-full"
                  />
                </div>
              )}

              {/* Montant pour amende */}
              {sanctionType === 'amende' && (
                <div>
                  <label className="label">Montant (F$)</label>
                  <input
                    type="number"
                    value={sanctionMontant}
                    onChange={(e) => setSanctionMontant(e.target.value)}
                    min="1"
                    placeholder="Montant de l'amende"
                    className="input w-full"
                  />
                </div>
              )}
            </div>

            <div className="flex gap-3 mt-6">
              <button
                onClick={() => { setShowSanctionModal(false); resetSanctionForm(); }}
                className="flex-1 px-4 py-2 bg-slate-700 hover:bg-slate-600 text-slate-300 rounded-lg font-medium"
              >
                Annuler
              </button>
              <button
                onClick={handleCreerSanction}
                disabled={loading || !sanctionCibleId || !sanctionMotif}
                className="flex-1 px-4 py-2 bg-red-600 hover:bg-red-700 text-white rounded-lg font-medium flex items-center justify-center gap-2 disabled:opacity-50"
              >
                {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Gavel className="h-4 w-4" />}
                Émettre
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal Nouvelle Enquête */}
      {showEnqueteModal && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4">
          <div className="bg-slate-800 rounded-xl border border-slate-700 p-6 max-w-lg w-full max-h-[90vh] overflow-y-auto">
            <h3 className="text-lg font-semibold text-slate-100 mb-4 flex items-center gap-2">
              <FileSearch className="h-5 w-5 text-purple-400" />
              Ouvrir une enquête
            </h3>

            <div className="space-y-4">
              {selectedSignalement && (
                <div className="p-3 bg-blue-500/10 rounded-lg border border-blue-500/30">
                  <p className="text-xs text-blue-400">Lié au signalement {selectedSignalement.numero_signalement}</p>
                </div>
              )}

              <div>
                <label className="label">Titre *</label>
                <input
                  type="text"
                  value={enqueteTitre}
                  onChange={(e) => setEnqueteTitre(e.target.value)}
                  placeholder="Titre de l'enquête"
                  className="input w-full"
                />
              </div>

              <div>
                <label className="label">Description</label>
                <textarea
                  value={enqueteDescription}
                  onChange={(e) => setEnqueteDescription(e.target.value)}
                  placeholder="Détails de l'enquête..."
                  rows={3}
                  className="input w-full resize-none"
                />
              </div>

              <div>
                <label className="label">Priorité</label>
                <select
                  value={enquetePriorite}
                  onChange={(e) => setEnquetePriorite(e.target.value)}
                  className="input w-full"
                >
                  {Object.entries(PRIORITES).map(([key, val]) => (
                    <option key={key} value={key}>{val.label}</option>
                  ))}
                </select>
              </div>

              <div className="grid gap-4 sm:grid-cols-2">
                <div>
                  <label className="label">Pilote concerné</label>
                  <select
                    value={enquetePiloteId}
                    onChange={(e) => setEnquetePiloteId(e.target.value)}
                    className="input w-full"
                  >
                    <option value="">Aucun</option>
                    {pilotes.map(p => (
                      <option key={p.id} value={p.id}>{p.identifiant}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="label">Compagnie concernée</label>
                  <select
                    value={enqueteCompagnieId}
                    onChange={(e) => setEnqueteCompagnieId(e.target.value)}
                    className="input w-full"
                  >
                    <option value="">Aucune</option>
                    {compagnies.map(c => (
                      <option key={c.id} value={c.id}>{c.nom}</option>
                    ))}
                  </select>
                </div>
              </div>
            </div>

            <div className="flex gap-3 mt-6">
              <button
                onClick={() => { setShowEnqueteModal(false); setSelectedSignalement(null); resetEnqueteForm(); }}
                className="flex-1 px-4 py-2 bg-slate-700 hover:bg-slate-600 text-slate-300 rounded-lg font-medium"
              >
                Annuler
              </button>
              <button
                onClick={() => handleCreerEnquete(selectedSignalement?.id)}
                disabled={loading || !enqueteTitre}
                className="flex-1 px-4 py-2 bg-purple-600 hover:bg-purple-700 text-white rounded-lg font-medium flex items-center justify-center gap-2 disabled:opacity-50"
              >
                {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <FileSearch className="h-4 w-4" />}
                Ouvrir
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal Détails Signalement */}
      {selectedSignalement && !showEnqueteModal && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4">
          <div className="bg-slate-800 rounded-xl border border-slate-700 p-6 max-w-2xl w-full max-h-[90vh] overflow-y-auto">
            <div className="flex items-start justify-between mb-4">
              <div>
                <span className="text-xs font-mono text-slate-500">{selectedSignalement.numero_signalement}</span>
                <h3 className="text-lg font-semibold text-slate-100">{selectedSignalement.titre}</h3>
              </div>
              <button onClick={() => setSelectedSignalement(null)} className="text-slate-400 hover:text-slate-200">
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="space-y-4">
              <div>
                <p className="text-sm text-slate-400 mb-1">Description</p>
                <p className="text-slate-200 whitespace-pre-wrap">{selectedSignalement.description}</p>
              </div>

              {selectedSignalement.preuves && (
                <div>
                  <p className="text-sm text-slate-400 mb-1">Preuves</p>
                  <p className="text-slate-300">{selectedSignalement.preuves}</p>
                </div>
              )}

              <div className="grid gap-4 sm:grid-cols-2">
                <div>
                  <p className="text-sm text-slate-400">Signalé par</p>
                  <p className="text-slate-200">{selectedSignalement.signale_par?.identifiant || 'Anonyme'}</p>
                </div>
                <div>
                  <p className="text-sm text-slate-400">Date</p>
                  <p className="text-slate-200">{new Date(selectedSignalement.created_at).toLocaleString('fr-FR')}</p>
                </div>
              </div>

              {selectedSignalement.reponse_ifsa && (
                <div className="p-3 bg-blue-500/10 rounded-lg border border-blue-500/30">
                  <p className="text-xs text-blue-400 mb-1">Réponse IFSA</p>
                  <p className="text-blue-300">{selectedSignalement.reponse_ifsa}</p>
                </div>
              )}
            </div>

            <div className="flex gap-3 mt-6">
              <button
                onClick={() => setSelectedSignalement(null)}
                className="px-4 py-2 bg-slate-700 hover:bg-slate-600 text-slate-300 rounded-lg font-medium"
              >
                Fermer
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
