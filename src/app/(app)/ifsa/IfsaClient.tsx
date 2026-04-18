'use client';

import { useState, useEffect, useTransition } from 'react';
import { createPortal } from 'react-dom';
import { useRouter } from 'next/navigation';
import { 
  AlertTriangle, FileSearch, Gavel, Plus, X, Check, Loader2, 
  Clock, User, Building2, ChevronRight, Search, Eye, CheckCircle2, BookOpen, Landmark,
  ShieldCheck, XCircle, Ban, Plane, Wrench, MapPin, Hash, Calendar, Timer
} from 'lucide-react';
import { formatDateMediumUTC, formatTimeUTC, toLocaleDateStringUTC, toLocaleStringUTC } from '@/lib/date-utils';
import { formatDuree } from '@/lib/utils';
import CarteIdentite from '@/components/CarteIdentite';

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

// État d'édition d'une enquête
interface EnqueteEditState {
  titre: string;
  description: string;
  conclusion: string;
  priorite: string;
  statut: string;
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

interface IfsaLicence {
  id: string;
  type: string;
  type_avion_id: string | null;
  langue: string | null;
  date_delivrance: string | null;
  date_expiration: string | null;
  a_vie: boolean;
  note: string | null;
  types_avion: { nom: string; constructeur: string } | null;
}

interface IfsaTransaction {
  id: string;
  type: string;
  montant: number;
  libelle: string;
  description?: string | null;
  created_at: string;
}

interface IfsaCompte {
  id: string;
  vban: string;
  solde: number;
  type: string;
}

interface IfsaVol {
  id: string;
  duree_minutes: number | null;
  depart_utc: string;
  arrivee_utc: string | null;
  statut: string;
  compagnie_libelle?: string | null;
  type_vol?: string | null;
  role_pilote?: string | null;
  callsign?: string | null;
  type_avion_militaire?: string | null;
  aeroport_depart?: string | null;
  aeroport_arrivee?: string | null;
  instruction_type?: string | null;
  type_avion?: { nom?: string } | null;
  pilote?: { identifiant?: string } | null;
  copilote?: { identifiant?: string } | null;
  instructeur?: { identifiant?: string } | null;
}

interface IfsaCarte {
  couleur_fond: string;
  logo_url: string | null;
  photo_url: string | null;
  titre: string;
  sous_titre: string | null;
  nom_affiche: string | null;
  organisation: string | null;
  numero_carte: string | null;
  date_delivrance: string | null;
  date_expiration: string | null;
  cases_haut: string[];
  cases_bas: string[];
}

interface IfsaPiloteData {
  profile: { id: string; identifiant: string; role: string | null; heures_initiales_minutes: number | null };
  compte: IfsaCompte | null;
  transactions: IfsaTransaction[];
  licences: IfsaLicence[];
  logbook: { totalMinutes: number; vols: IfsaVol[] };
  carte: IfsaCarte | null;
}

interface IfsaCompagnieData {
  compagnie: { id: string; nom: string; vban: string | null; pdg_id: string | null };
  compte: IfsaCompte | null;
  transactions: IfsaTransaction[];
  pilotes: Array<{ id: string; identifiant: string; role: string | null }>;
  logbook: { totalMinutes: number; vols: IfsaVol[] };
}

interface Props {
  signalements: Signalement[];
  enquetes: Enquete[];
  sanctions: Sanction[];
  pilotes: Array<{ id: string; identifiant: string; role: string | null }>;
  compagnies: Array<{ id: string; nom: string }>;
  compagniesAvecPilotes: Array<{ id: string; nom: string; pilotes: Array<{ id: string; identifiant: string; role: string | null }> }>;
  pilotesChomage: Array<{ id: string; identifiant: string; role: string | null }>;
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

export default function IfsaClient({ signalements, enquetes, sanctions, pilotes, compagnies, compagniesAvecPilotes, pilotesChomage, agentsIfsa }: Props) {
  const router = useRouter();
  const [, startTransition] = useTransition();
  const [activeTab, setActiveTab] = useState<'signalements' | 'enquetes' | 'sanctions' | 'donnees' | 'autorisations' | 'avion'>('signalements');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [dataError, setDataError] = useState('');

  const [mounted, setMounted] = useState(false);
  useEffect(() => { setMounted(true); }, []);

  const [selectedCompagnieId, setSelectedCompagnieId] = useState('');
  const [selectedPiloteId, setSelectedPiloteId] = useState('');
  const [compagnieData, setCompagnieData] = useState<IfsaCompagnieData | null>(null);
  const [piloteData, setPiloteData] = useState<IfsaPiloteData | null>(null);
  const [loadingCompagnie, setLoadingCompagnie] = useState(false);
  const [loadingPilote, setLoadingPilote] = useState(false);
  const [verificationLoading, setVerificationLoading] = useState(false);
  const [verificationResult, setVerificationResult] = useState<{
    soldeCalculee: number;
    soldeCompte: number;
    conforme: boolean;
    virements: Array<{
      id: string;
      type: string;
      montant: number;
      libelle: string;
      created_at: string;
      autre_partie: { vban: string; label: string } | null;
    }>;
    context?: { type: 'compagnie' | 'pilote'; id: string };
  } | null>(null);
  const [showVirementsModal, setShowVirementsModal] = useState(false);
  const compagniesPilotesCount = new Map(compagniesAvecPilotes.map((c) => [c.id, c.pilotes.length]));


  // Recherche avion par immatriculation
  interface IfsaAvionData {
    avion: {
      id: string;
      immatriculation: string;
      nom_bapteme: string | null;
      usure_percent: number;
      aeroport_actuel: string;
      statut: string;
      detruit: boolean;
      detruit_at: string | null;
      detruit_raison: string | null;
      created_at: string;
      updated_at: string | null;
      source: 'compagnie' | 'personnel';
    };
    typeAvion: { id: string; nom: string; constructeur: string; prix: number } | null;
    proprietaire: { type: 'compagnie' | 'personnel'; nom: string; id: string } | null;
    plansVol: Array<{
      id: string;
      numero_vol: string;
      statut: string;
      aeroport_depart: string;
      aeroport_arrivee: string;
      type_vol: string;
      vol_commercial: boolean;
      vol_ferry: boolean;
      vol_militaire: boolean;
      heure_depart_estimee: string | null;
      heure_depart_reelle: string | null;
      heure_arrivee_estimee: string | null;
      heure_arrivee_reelle: string | null;
      duree_estimee_minutes: number | null;
      callsign: string | null;
      nature_transport: string | null;
      created_at: string;
      pilote: { id: string; identifiant: string } | null;
      copilote: { id: string; identifiant: string } | null;
      compagnie: { id: string; nom: string } | null;
    }>;
    plansNonClotures: Array<{
      id: string;
      numero_vol: string;
      statut: string;
      aeroport_depart: string;
      aeroport_arrivee: string;
      pilote: { id: string; identifiant: string } | null;
      copilote: { id: string; identifiant: string } | null;
      created_at: string;
    }>;
    totalMinutesVol: number;
    reparations: Array<{ id: string; libelle: string; montant: number; type: string; created_at: string }>;
  }

  const [avionSearchImmat, setAvionSearchImmat] = useState('');
  const [avionData, setAvionData] = useState<IfsaAvionData | null>(null);
  const [loadingAvion, setLoadingAvion] = useState(false);
  const [avionError, setAvionError] = useState('');

  async function searchAvion() {
    const immat = avionSearchImmat.trim().toUpperCase();
    if (!immat || immat.length < 2) {
      setAvionError('Immatriculation requise (min 2 caractères)');
      return;
    }
    setLoadingAvion(true);
    setAvionError('');
    setAvionData(null);
    try {
      const res = await fetch(`/api/ifsa/avion?immatriculation=${encodeURIComponent(immat)}`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Erreur');
      setAvionData(data);
    } catch (err) {
      setAvionError(err instanceof Error ? err.message : 'Erreur');
    } finally {
      setLoadingAvion(false);
    }
  }

  // Autorisations d'exploitation
  interface AutorisationExploitation {
    id: string;
    numero_document: string;
    statut: string;
    motif_demande: string | null;
    motif_reponse: string | null;
    created_at: string;
    traite_at: string | null;
    compagnie: { id: string; nom: string } | null;
    type_avion: { id: string; nom: string; code_oaci: string | null; constructeur: string | null } | null;
    demandeur: { id: string; identifiant: string } | null;
    traite_par: { id: string; identifiant: string } | null;
  }
  const [autorisationsExploit, setAutorisationsExploit] = useState<AutorisationExploitation[]>([]);
  const [loadingAutorisations, setLoadingAutorisations] = useState(false);
  const [autorisationMotifReponse, setAutorisationMotifReponse] = useState('');
  const [autorisationFilter, setAutorisationFilter] = useState<'en_attente' | 'approuvee' | 'toutes'>('en_attente');
  const [autorisationsEnAttenteCount, setAutorisationsEnAttenteCount] = useState(0);

  useEffect(() => {
    fetch('/api/autorisations-exploitation?toutes=true&statut=en_attente')
      .then(res => res.ok ? res.json() : [])
      .then(data => setAutorisationsEnAttenteCount(Array.isArray(data) ? data.length : 0))
      .catch(() => {});
  }, []);

  async function loadAutorisationsExploit(filtre?: string) {
    setLoadingAutorisations(true);
    try {
      const statutParam = (filtre || autorisationFilter) === 'toutes' ? '' : `&statut=${filtre || autorisationFilter}`;
      const res = await fetch(`/api/autorisations-exploitation?toutes=true${statutParam}`);
      if (res.ok) {
        const data = await res.json();
        setAutorisationsExploit(data.map((a: any) => ({
          ...a,
          compagnie: Array.isArray(a.compagnie) ? a.compagnie[0] : a.compagnie,
          type_avion: Array.isArray(a.type_avion) ? a.type_avion[0] : a.type_avion,
          demandeur: Array.isArray(a.demandeur) ? a.demandeur[0] : a.demandeur,
          traite_par: Array.isArray(a.traite_par) ? a.traite_par[0] : a.traite_par,
        })));
      }
    } catch {
      setError('Erreur chargement autorisations');
    } finally {
      setLoadingAutorisations(false);
    }
  }

  async function handleTraiterAutorisation(id: string, action: 'approuver' | 'refuser' | 'revoquer') {
    setLoading(true);
    setError('');
    try {
      const res = await fetch('/api/autorisations-exploitation', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, action, motif_reponse: autorisationMotifReponse || null }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Erreur');
      setSuccess(data.message || 'Action effectuée');
      setAutorisationMotifReponse('');
      loadAutorisationsExploit();
      fetch('/api/autorisations-exploitation?toutes=true&statut=en_attente')
        .then(res => res.ok ? res.json() : [])
        .then(d => setAutorisationsEnAttenteCount(Array.isArray(d) ? d.length : 0))
        .catch(() => {});
      setTimeout(() => setSuccess(''), 5000);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erreur');
    } finally {
      setLoading(false);
    }
  }

  // Modals
  const [showSanctionModal, setShowSanctionModal] = useState(false);
  const [showEnqueteModal, setShowEnqueteModal] = useState(false);
  const [selectedSignalement, setSelectedSignalement] = useState<Signalement | null>(null);
  const [selectedEnquete, setSelectedEnquete] = useState<Enquete | null>(null);
  const [showEnqueteDetailModal, setShowEnqueteDetailModal] = useState(false);
  const [enqueteEditState, setEnqueteEditState] = useState<EnqueteEditState | null>(null);

  // Formulaire sanction
  const [sanctionType, setSanctionType] = useState('avertissement');
  const [sanctionCibleType, setSanctionCibleType] = useState<'pilote' | 'compagnie'>('pilote');
  const [sanctionCibleId, setSanctionCibleId] = useState('');
  const [sanctionMotif, setSanctionMotif] = useState('');
  const [sanctionDetails, setSanctionDetails] = useState('');
  const [sanctionDuree, setSanctionDuree] = useState('');
  const [sanctionMontant, setSanctionMontant] = useState('');
  const [sanctionVbanDestination, setSanctionVbanDestination] = useState('');
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

    // Vérifier que le VBAN est renseigné pour les amendes
    if (sanctionType === 'amende' && !sanctionVbanDestination.trim()) {
      setError('Le VBAN du compte destinataire est requis pour les amendes');
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
          montant_amende: sanctionMontant ? parseInt(sanctionMontant) : null,
          vban_destination: sanctionVbanDestination.trim() || null
        })
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Erreur');

      setSuccess('Sanction émise avec succès');
      setShowSanctionModal(false);
      resetSanctionForm();
      startTransition(() => router.refresh());
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
      startTransition(() => router.refresh());
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
      startTransition(() => router.refresh());
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
      startTransition(() => router.refresh());
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
      startTransition(() => router.refresh());
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
    setSanctionVbanDestination('');
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

  function openEnqueteDetail(enq: Enquete) {
    setSelectedEnquete(enq);
    setEnqueteEditState({
      titre: enq.titre,
      description: enq.description || '',
      conclusion: enq.conclusion || '',
      priorite: enq.priorite,
      statut: enq.statut,
    });
    setShowEnqueteDetailModal(true);
  }

  async function handleSaveEnqueteEdit() {
    if (!selectedEnquete || !enqueteEditState) return;
    
    setLoading(true);
    try {
      const res = await fetch('/api/ifsa/enquetes', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: selectedEnquete.id,
          titre: enqueteEditState.titre,
          description: enqueteEditState.description || null,
          conclusion: enqueteEditState.conclusion || null,
          priorite: enqueteEditState.priorite,
          statut: enqueteEditState.statut,
        })
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Erreur');

      setSuccess('Enquête mise à jour');
      setShowEnqueteDetailModal(false);
      setSelectedEnquete(null);
      setEnqueteEditState(null);
      startTransition(() => router.refresh());
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erreur');
    } finally {
      setLoading(false);
    }
  }

  function formatLicenceLabel(lic: IfsaLicence): string {
    if (lic.type === 'Qualification Type' && lic.types_avion) {
      return `Qualification Type ${lic.types_avion.constructeur} ${lic.types_avion.nom}`;
    }
    if (lic.type.startsWith('COM') && lic.langue) {
      return `${lic.type} ${lic.langue}`;
    }
    return lic.type;
  }

  function formatLicenceDate(dateStr: string | null): string {
    if (!dateStr) return '—';
    try {
      return formatDateMediumUTC(dateStr);
    } catch {
      return dateStr;
    }
  }

  async function loadCompagnieData(compagnieId: string) {
    if (!compagnieId) {
      setCompagnieData(null);
      return;
    }
    setLoadingCompagnie(true);
    setDataError('');
    try {
      const res = await fetch(`/api/ifsa/controle?type=compagnie&id=${encodeURIComponent(compagnieId)}`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Erreur');
      setCompagnieData(data);
    } catch (err) {
      setDataError(err instanceof Error ? err.message : 'Erreur');
      setCompagnieData(null);
    } finally {
      setLoadingCompagnie(false);
    }
  }

  async function loadPiloteData(piloteId: string) {
    if (!piloteId) {
      setPiloteData(null);
      return;
    }
    setLoadingPilote(true);
    setDataError('');
    try {
      const res = await fetch(`/api/ifsa/controle?type=pilote&id=${encodeURIComponent(piloteId)}`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Erreur');
      setPiloteData(data);
    } catch (err) {
      setDataError(err instanceof Error ? err.message : 'Erreur');
      setPiloteData(null);
    } finally {
      setLoadingPilote(false);
    }
  }

  function selectPilote(piloteId: string) {
    setSelectedPiloteId(piloteId);
    void loadPiloteData(piloteId);
  }

  async function verifierSolde(type: 'compagnie' | 'pilote', id: string) {
    if (!id) return;
    setVerificationLoading(true);
    setVerificationResult(null);
    try {
      const res = await fetch(`/api/ifsa/controle/verification?type=${type}&id=${encodeURIComponent(id)}`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Erreur');
      setVerificationResult({ ...data, context: { type, id } });
    } catch (err) {
      setDataError(err instanceof Error ? err.message : 'Erreur');
    } finally {
      setVerificationLoading(false);
    }
  }

  async function verifierOrigineVirements(type: 'compagnie' | 'pilote', id: string) {
    if (!id) return;
    setVerificationLoading(true);
    setVerificationResult(null);
    try {
      const res = await fetch(`/api/ifsa/controle/verification?type=${type}&id=${encodeURIComponent(id)}`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Erreur');
      setVerificationResult({ ...data, context: { type, id } });
      setShowVirementsModal(true);
    } catch (err) {
      setDataError(err instanceof Error ? err.message : 'Erreur');
    } finally {
      setVerificationLoading(false);
    }
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
        <button
          onClick={() => { setActiveTab('autorisations'); loadAutorisationsExploit(); }}
          className={`px-4 py-2 rounded-lg font-medium transition-colors ${
            activeTab === 'autorisations' ? 'bg-indigo-600 text-white' : 'bg-slate-700 text-slate-300 hover:bg-slate-600'
          }`}
        >
          <ShieldCheck className="h-4 w-4 inline mr-2" />
          Autorisations
          {autorisationsEnAttenteCount > 0 && (
            <span className="ml-2 px-1.5 py-0.5 bg-amber-500 text-white text-xs rounded-full">
              {autorisationsEnAttenteCount}
            </span>
          )}
        </button>
        <button
          onClick={() => setActiveTab('avion')}
          className={`px-4 py-2 rounded-lg font-medium transition-colors ${
            activeTab === 'avion' ? 'bg-indigo-600 text-white' : 'bg-slate-700 text-slate-300 hover:bg-slate-600'
          }`}
        >
          <Plane className="h-4 w-4 inline mr-2" />
          Recherche Avion
        </button>
        <button
          onClick={() => setActiveTab('donnees')}
          className={`px-4 py-2 rounded-lg font-medium transition-colors ${
            activeTab === 'donnees' ? 'bg-indigo-600 text-white' : 'bg-slate-700 text-slate-300 hover:bg-slate-600'
          }`}
        >
          <Landmark className="h-4 w-4 inline mr-2" />
          Données IFSA
        </button>

        {activeTab !== 'donnees' && activeTab !== 'autorisations' && activeTab !== 'avion' && (
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
        )}
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
                            {toLocaleDateStringUTC(sig.created_at)} UTC
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
            <div className="space-y-4">
              {enquetes.map((enq) => {
                const statutInfo = STATUTS_ENQUETE[enq.statut as keyof typeof STATUTS_ENQUETE] || STATUTS_ENQUETE.ouverte;
                const prioriteInfo = PRIORITES[enq.priorite as keyof typeof PRIORITES] || PRIORITES.normale;
                return (
                  <div 
                    key={enq.id} 
                    className="p-5 bg-slate-800/50 rounded-lg border border-slate-700 hover:border-slate-500 transition-colors cursor-pointer"
                    onClick={() => openEnqueteDetail(enq)}
                  >
                    {/* En-tête */}
                    <div className="flex items-start justify-between gap-4 flex-wrap mb-3">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-sm font-mono text-amber-400 font-semibold">{enq.numero_dossier}</span>
                        <span className={`text-xs font-medium px-2 py-0.5 rounded ${statutInfo.color}`}>
                          {statutInfo.label}
                        </span>
                        <span className={`text-xs font-semibold ${prioriteInfo.color}`}>
                          {prioriteInfo.label}
                        </span>
                      </div>
                      <div className="flex items-center gap-2" onClick={(e) => e.stopPropagation()}>
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

                    {/* Titre */}
                    <h3 className="text-lg font-semibold text-slate-100 mb-2">{enq.titre}</h3>
                    
                    {/* Description */}
                    {enq.description && (
                      <div className="mb-3 p-3 bg-slate-900/50 rounded-lg">
                        <p className="text-sm text-slate-300 whitespace-pre-wrap">{enq.description}</p>
                      </div>
                    )}
                    
                    {/* Conclusion (si clôturée) */}
                    {enq.conclusion && (
                      <div className="mb-3 p-3 bg-emerald-500/10 rounded-lg border border-emerald-500/30">
                        <p className="text-xs text-emerald-400 mb-1 font-semibold">Conclusion</p>
                        <p className="text-sm text-emerald-300 whitespace-pre-wrap">{enq.conclusion}</p>
                      </div>
                    )}

                    {/* Métadonnées */}
                    <div className="flex items-center gap-4 text-xs text-slate-500 flex-wrap border-t border-slate-700 pt-3 mt-3">
                      <span className="flex items-center gap-1">
                        <User className="h-3 w-3" />
                        Enquêteur: <span className="text-slate-300">{enq.enqueteur?.identifiant || 'Non assigné'}</span>
                      </span>
                      {enq.pilote_concerne && (
                        <span className="flex items-center gap-1 text-amber-400">
                          <User className="h-3 w-3" />
                          Pilote: {enq.pilote_concerne.identifiant}
                        </span>
                      )}
                      {enq.compagnie_concernee && (
                        <span className="flex items-center gap-1 text-amber-400">
                          <Building2 className="h-3 w-3" />
                          Compagnie: {enq.compagnie_concernee.nom}
                        </span>
                      )}
                      <span className="flex items-center gap-1">
                        <Clock className="h-3 w-3" />
                        Ouvert: {toLocaleDateStringUTC(enq.created_at)} UTC
                      </span>
                      {enq.cloture_at && (
                        <span className="flex items-center gap-1 text-emerald-400">
                          <CheckCircle2 className="h-3 w-3" />
                          Clôturé: {toLocaleDateStringUTC(enq.cloture_at)} UTC
                        </span>
                      )}
                    </div>

                    <p className="text-xs text-slate-600 mt-2 italic">Cliquer pour modifier</p>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {activeTab === 'donnees' && (
        <div className="grid gap-6 lg:grid-cols-2">
          <div className="card">
            <h2 className="text-lg font-semibold text-slate-100 mb-4">Compagnies</h2>
            <div className="space-y-3">
              <select
                value={selectedCompagnieId}
                onChange={(e) => {
                  const id = e.target.value;
                  setSelectedCompagnieId(id);
                  void loadCompagnieData(id);
                }}
                className="input w-full"
              >
                <option value="">— Sélectionner une compagnie —</option>
                {compagnies.map((c) => {
                  const count = compagniesPilotesCount.get(c.id) ?? 0;
                  const label = count > 0 ? `${c.nom} (${count})` : c.nom;
                  return (
                    <option key={c.id} value={c.id}>{label}</option>
                  );
                })}
              </select>

              {loadingCompagnie && <p className="text-sm text-slate-400">Chargement…</p>}
              {dataError && <p className="text-sm text-red-400">{dataError}</p>}

              {compagnieData && (
                <div className="space-y-4">
                  <div className="p-3 rounded-lg border border-slate-700/50 bg-slate-800/40">
                    <p className="text-xs text-slate-500">Compagnie</p>
                    <p className="text-slate-200 font-semibold">{compagnieData.compagnie.nom}</p>
                  </div>

                  <div className="p-3 rounded-lg border border-slate-700/50 bg-slate-900/40">
                    <p className="text-sm font-medium text-slate-200 mb-2 flex items-center gap-2">
                      <Landmark className="h-4 w-4 text-emerald-400" />
                      Compte entreprise
                    </p>
                    {compagnieData.compte ? (
                      <div className="space-y-2">
                        <p className="text-xs text-slate-500 font-mono break-all">{compagnieData.compte.vban}</p>
                        <p className="text-2xl font-bold text-emerald-300">
                          {compagnieData.compte.solde.toLocaleString('fr-FR')} F$
                        </p>
                        <div className="mt-3">
                          <p className="text-xs text-slate-400 mb-1">Transactions récentes</p>
                          {compagnieData.transactions && compagnieData.transactions.length > 0 ? (
                            <div className="space-y-1 max-h-72 overflow-y-auto">
                              {compagnieData.transactions.map((t: { id: string; type: string; montant: number; libelle?: string; description?: string | null; created_at: string }) => (
                                <div key={t.id} className="flex items-center justify-between text-sm border-b border-slate-700/40 pb-1 gap-2">
                                  <div className="flex-1 min-w-0">
                                    <span className="text-slate-400 break-all text-xs">{t.libelle || t.description || '—'}</span>
                                    <span className="text-[10px] text-slate-600 ml-2">{new Date(t.created_at).toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit', year: '2-digit', hour: '2-digit', minute: '2-digit' })}</span>
                                  </div>
                                  <span className={`whitespace-nowrap font-medium ${t.type === 'credit' ? 'text-emerald-400' : 'text-red-400'}`}>
                                    {t.type === 'credit' ? '+' : '-'}{Math.abs(t.montant).toLocaleString('fr-FR')} F$
                                  </span>
                                </div>
                              ))}
                            </div>
                          ) : (
                            <p className="text-xs text-slate-500">Aucune transaction</p>
                          )}
                        </div>
                        <div className="mt-3 flex flex-wrap gap-2">
                          <button
                            type="button"
                            onClick={() => verifierSolde('compagnie', selectedCompagnieId)}
                            disabled={verificationLoading}
                            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 hover:bg-emerald-500/30 disabled:opacity-50"
                          >
                            {verificationLoading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <ShieldCheck className="h-3.5 w-3.5" />}
                            Vérifier la solde
                          </button>
                          <button
                            type="button"
                            onClick={() => verifierOrigineVirements('compagnie', selectedCompagnieId)}
                            disabled={verificationLoading}
                            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg bg-sky-500/20 text-sky-400 border border-sky-500/30 hover:bg-sky-500/30 disabled:opacity-50"
                          >
                            {verificationLoading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Search className="h-3.5 w-3.5" />}
                            Vérifier l&apos;origine des virements
                          </button>
                        </div>
                        {verificationResult?.context?.type === 'compagnie' && verificationResult.context.id === selectedCompagnieId && (
                          <div className={`mt-2 px-3 py-2 rounded-lg text-xs ${verificationResult.conforme ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20' : 'bg-red-500/10 text-red-400 border border-red-500/20'}`}>
                            {verificationResult.conforme
                              ? 'Tout est normal : la solde calculée correspond au solde du compte.'
                              : `Solde anormale : calculée ${verificationResult.soldeCalculee.toLocaleString('fr-FR')} F$, compte ${verificationResult.soldeCompte.toLocaleString('fr-FR')} F$.`}
                          </div>
                        )}
                      </div>
                    ) : (
                      <p className="text-sm text-slate-500">Aucun compte entreprise.</p>
                    )}
                  </div>

                  <div className="p-3 rounded-lg border border-slate-700/50 bg-slate-800/40">
                    <p className="text-sm font-medium text-slate-200 mb-2">Pilotes de la compagnie</p>
                    {compagnieData.pilotes.length === 0 ? (
                      <p className="text-sm text-slate-500">Aucun pilote rattaché.</p>
                    ) : (
                      <div className="space-y-2 max-h-48 overflow-y-auto">
                        {compagnieData.pilotes.map((p) => (
                          <div key={p.id} className="flex items-center justify-between text-sm">
                            <span className="text-slate-300">
                              {p.identifiant}
                              {p.role === 'atc' && (
                                <span className="ml-2 text-xs text-amber-400">ATC uniquement</span>
                              )}
                            </span>
                            <button
                              type="button"
                              onClick={() => selectPilote(p.id)}
                              className="text-xs text-sky-400 hover:text-sky-300"
                            >
                              Voir pilote
                            </button>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>

                  <div className="p-3 rounded-lg border border-slate-700/50 bg-slate-900/40">
                    <p className="text-sm font-medium text-slate-200 mb-2 flex items-center gap-2">
                      <BookOpen className="h-4 w-4 text-sky-400" />
                      Logbook compagnie
                    </p>
                    <p className="text-xs text-slate-500 mb-2">
                      Total validé: {formatDuree(compagnieData.logbook.totalMinutes)}
                    </p>
                    {compagnieData.logbook.vols.length === 0 ? (
                      <p className="text-xs text-slate-500">Aucun vol.</p>
                    ) : (
                      <div className="overflow-x-auto">
                        <table className="w-full text-xs">
                          <thead>
                            <tr className="text-left text-slate-500 border-b border-slate-700/40">
                              <th className="py-1 pr-3">Date</th>
                              <th className="py-1 pr-3">Départ</th>
                              <th className="py-1 pr-3">Arrivée</th>
                              <th className="py-1 pr-3">Appareil</th>
                              <th className="py-1 pr-3">Pilote</th>
                              <th className="py-1 pr-3">Durée</th>
                              <th className="py-1">Statut</th>
                            </tr>
                          </thead>
                          <tbody>
                            {compagnieData.logbook.vols.map((v) => (
                              <tr key={v.id} className="border-b border-slate-800/40">
                                <td className="py-1 pr-3 text-slate-300">{formatDateMediumUTC(v.depart_utc)}</td>
                                <td className="py-1 pr-3 text-slate-300">{v.aeroport_depart || '—'} {formatTimeUTC(v.depart_utc)}</td>
                                <td className="py-1 pr-3 text-slate-300">{v.aeroport_arrivee || '—'} {v.arrivee_utc ? formatTimeUTC(v.arrivee_utc) : '—'}</td>
                                <td className="py-1 pr-3 text-slate-300">{(v.type_avion as { nom?: string })?.nom || v.type_avion_militaire || '—'}</td>
                                <td className="py-1 pr-3 text-slate-300">{(Array.isArray(v.pilote) ? v.pilote[0] : v.pilote)?.identifiant || '—'}</td>
                                <td className="py-1 pr-3 text-slate-300">{formatDuree(v.duree_minutes || 0)}</td>
                                <td className="py-1 text-slate-300">{v.statut}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>
          </div>

          <div className="card">
            <h2 className="text-lg font-semibold text-slate-100 mb-4">Pilotes</h2>
            <div className="space-y-3">
              <select
                value={selectedPiloteId}
                onChange={(e) => selectPilote(e.target.value)}
                className="input w-full"
              >
                <option value="">— Sélectionner un pilote —</option>
                {pilotes.filter((p) => p.role !== 'admin').map((p) => (
                  <option key={p.id} value={p.id}>{p.identifiant}</option>
                ))}
              </select>

              {pilotesChomage.length > 0 && (
                <div className="p-3 rounded-lg border border-slate-700/50 bg-slate-800/40">
                  <p className="text-sm font-medium text-slate-200 mb-2">Pilotes au chômage</p>
                  <div className="space-y-2 max-h-40 overflow-y-auto">
                    {pilotesChomage.map((p) => (
                      <div key={p.id} className="flex items-center justify-between text-sm">
                        <span className="text-slate-300">{p.identifiant}</span>
                        <button
                          type="button"
                          onClick={() => selectPilote(p.id)}
                          className="text-xs text-sky-400 hover:text-sky-300"
                        >
                          Voir
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {loadingPilote && <p className="text-sm text-slate-400">Chargement…</p>}
              {dataError && <p className="text-sm text-red-400">{dataError}</p>}

              {piloteData && (
                <div className="space-y-4">
                  {/* Carte d'identité et infos pilote */}
                  <div className="flex flex-col sm:flex-row gap-4">
                    <div className="flex-shrink-0">
                      <CarteIdentite 
                        carte={piloteData.carte} 
                        identifiant={piloteData.profile.identifiant} 
                        size="sm" 
                      />
                    </div>
                    <div className="flex-1">
                      <div className="p-3 rounded-lg border border-slate-700/50 bg-slate-800/40 h-full">
                        <p className="text-xs text-slate-500">Pilote</p>
                        <p className="text-slate-200 font-semibold text-lg">{piloteData.profile.identifiant}</p>
                        {piloteData.profile.role === 'atc' && (
                          <p className="text-xs text-amber-400 mt-1">ATC uniquement</p>
                        )}
                      </div>
                    </div>
                  </div>

                  <div className="p-3 rounded-lg border border-slate-700/50 bg-slate-900/40">
                    <p className="text-sm font-medium text-slate-200 mb-2 flex items-center gap-2">
                      <Landmark className="h-4 w-4 text-emerald-400" />
                      Compte personnel
                    </p>
                    {piloteData.compte ? (
                      <div className="space-y-2">
                        <p className="text-xs text-slate-500 font-mono break-all">{piloteData.compte.vban}</p>
                        <p className="text-2xl font-bold text-emerald-300">
                          {piloteData.compte.solde.toLocaleString('fr-FR')} F$
                        </p>
                        <div className="mt-3">
                          <p className="text-xs text-slate-400 mb-1">Transactions récentes</p>
                          {piloteData.transactions && piloteData.transactions.length > 0 ? (
                            <div className="space-y-1 max-h-72 overflow-y-auto">
                              {piloteData.transactions.map((t: { id: string; type: string; montant: number; libelle?: string; description?: string | null; created_at: string }) => (
                                <div key={t.id} className="flex items-center justify-between text-sm border-b border-slate-700/40 pb-1 gap-2">
                                  <div className="flex-1 min-w-0">
                                    <span className="text-slate-400 break-all text-xs">{t.libelle || t.description || '—'}</span>
                                    <span className="text-[10px] text-slate-600 ml-2">{new Date(t.created_at).toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit', year: '2-digit', hour: '2-digit', minute: '2-digit' })}</span>
                                  </div>
                                  <span className={`whitespace-nowrap font-medium ${t.type === 'credit' ? 'text-emerald-400' : 'text-red-400'}`}>
                                    {t.type === 'credit' ? '+' : '-'}{Math.abs(t.montant).toLocaleString('fr-FR')} F$
                                  </span>
                                </div>
                              ))}
                            </div>
                          ) : (
                            <p className="text-xs text-slate-500">Aucune transaction</p>
                          )}
                        </div>
                        <div className="mt-3 flex flex-wrap gap-2">
                          <button
                            type="button"
                            onClick={() => verifierSolde('pilote', selectedPiloteId)}
                            disabled={verificationLoading}
                            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 hover:bg-emerald-500/30 disabled:opacity-50"
                          >
                            {verificationLoading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <ShieldCheck className="h-3.5 w-3.5" />}
                            Vérifier la solde
                          </button>
                          <button
                            type="button"
                            onClick={() => verifierOrigineVirements('pilote', selectedPiloteId)}
                            disabled={verificationLoading}
                            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg bg-sky-500/20 text-sky-400 border border-sky-500/30 hover:bg-sky-500/30 disabled:opacity-50"
                          >
                            {verificationLoading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Search className="h-3.5 w-3.5" />}
                            Vérifier l&apos;origine des virements
                          </button>
                        </div>
                        {verificationResult?.context?.type === 'pilote' && verificationResult.context.id === selectedPiloteId && (
                          <div className={`mt-2 px-3 py-2 rounded-lg text-xs ${verificationResult.conforme ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20' : 'bg-red-500/10 text-red-400 border border-red-500/20'}`}>
                            {verificationResult.conforme
                              ? 'Tout est normal : la solde calculée correspond au solde du compte.'
                              : `Solde anormale : calculée ${verificationResult.soldeCalculee.toLocaleString('fr-FR')} F$, compte ${verificationResult.soldeCompte.toLocaleString('fr-FR')} F$.`}
                          </div>
                        )}
                      </div>
                    ) : (
                      <p className="text-sm text-slate-500">Aucun compte personnel.</p>
                    )}
                  </div>

                  <div className="p-3 rounded-lg border border-slate-700/50 bg-slate-800/40">
                    <p className="text-sm font-medium text-slate-200 mb-2">Licences</p>
                    {piloteData.licences.length === 0 ? (
                      <p className="text-xs text-slate-500">Aucune licence.</p>
                    ) : (
                      <div className="space-y-2 max-h-56 overflow-y-auto">
                        {piloteData.licences.map((lic) => (
                          <div key={lic.id} className="text-xs text-slate-300 border-b border-slate-800/50 pb-2">
                            <p className="font-semibold">{formatLicenceLabel(lic)}</p>
                            <p className="text-slate-500">
                              {lic.a_vie ? 'À vie' : `Expire le ${formatLicenceDate(lic.date_expiration)}`}
                            </p>
                            {lic.date_delivrance && (
                              <p className="text-slate-500">Délivré le {formatLicenceDate(lic.date_delivrance)}</p>
                            )}
                            {lic.note && <p className="text-slate-500">{lic.note}</p>}
                          </div>
                        ))}
                      </div>
                    )}
                  </div>

                  <div className="p-3 rounded-lg border border-slate-700/50 bg-slate-900/40">
                    <p className="text-sm font-medium text-slate-200 mb-2 flex items-center gap-2">
                      <BookOpen className="h-4 w-4 text-sky-400" />
                      Logbook pilote
                    </p>
                    <p className="text-xs text-slate-500 mb-2">
                      Total validé: {formatDuree(piloteData.logbook.totalMinutes)}
                    </p>
                    {piloteData.logbook.vols.length === 0 ? (
                      <p className="text-xs text-slate-500">Aucun vol.</p>
                    ) : (
                      <div className="overflow-x-auto">
                        <table className="w-full text-xs">
                          <thead>
                            <tr className="text-left text-slate-500 border-b border-slate-700/40">
                              <th className="py-1 pr-3">Date</th>
                              <th className="py-1 pr-3">Départ</th>
                              <th className="py-1 pr-3">Arrivée</th>
                              <th className="py-1 pr-3">Appareil</th>
                              <th className="py-1 pr-3">Compagnie</th>
                              <th className="py-1 pr-3">Durée</th>
                              <th className="py-1">Statut</th>
                            </tr>
                          </thead>
                          <tbody>
                            {piloteData.logbook.vols.map((v) => (
                              <tr key={v.id} className="border-b border-slate-800/40">
                                <td className="py-1 pr-3 text-slate-300">{formatDateMediumUTC(v.depart_utc)}</td>
                                <td className="py-1 pr-3 text-slate-300">{v.aeroport_depart || '—'} {formatTimeUTC(v.depart_utc)}</td>
                                <td className="py-1 pr-3 text-slate-300">{v.aeroport_arrivee || '—'} {v.arrivee_utc ? formatTimeUTC(v.arrivee_utc) : '—'}</td>
                                <td className="py-1 pr-3 text-slate-300">{(v.type_avion as { nom?: string })?.nom || v.type_avion_militaire || '—'}</td>
                                <td className="py-1 pr-3 text-slate-300">{v.compagnie_libelle || '—'}</td>
                                <td className="py-1 pr-3 text-slate-300">{formatDuree(v.duree_minutes || 0)}</td>
                                <td className="py-1 text-slate-300">{v.statut}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {activeTab === 'avion' && (
        <div className="space-y-6">
          {/* Barre de recherche */}
          <div className="card">
            <h2 className="text-lg font-semibold text-slate-100 mb-4 flex items-center gap-2">
              <Plane className="h-5 w-5 text-sky-400" />
              Recherche par immatriculation
            </h2>
            <div className="flex gap-3">
              <div className="relative flex-1">
                <Hash className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
                <input
                  type="text"
                  value={avionSearchImmat}
                  onChange={(e) => setAvionSearchImmat(e.target.value.toUpperCase())}
                  onKeyDown={(e) => { if (e.key === 'Enter') searchAvion(); }}
                  placeholder="Ex: F-HZUK, IR-A320-01..."
                  className="input w-full pl-10 font-mono"
                />
              </div>
              <button
                onClick={searchAvion}
                disabled={loadingAvion}
                className="px-5 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg font-medium flex items-center gap-2 disabled:opacity-50"
              >
                {loadingAvion ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}
                Rechercher
              </button>
            </div>
            {avionError && (
              <p className="text-sm text-red-400 mt-2">{avionError}</p>
            )}
          </div>

          {/* Résultats */}
          {avionData && (
            <>
              {/* Fiche avion */}
              <div className="card">
                <div className="flex items-start justify-between gap-4 flex-wrap mb-4">
                  <div>
                    <div className="flex items-center gap-3 mb-1">
                      <h2 className="text-xl font-bold text-slate-100 font-mono">{avionData.avion.immatriculation}</h2>
                      {avionData.avion.nom_bapteme && (
                        <span className="text-sm text-slate-400 italic">&laquo; {avionData.avion.nom_bapteme} &raquo;</span>
                      )}
                    </div>
                    <p className="text-sm text-slate-400">
                      {avionData.typeAvion ? `${avionData.typeAvion.constructeur} ${avionData.typeAvion.nom}` : 'Type inconnu'}
                      {avionData.typeAvion?.prix ? ` — Prix neuf : ${avionData.typeAvion.prix.toLocaleString('fr-FR')} F$` : ''}
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className={`px-3 py-1 rounded-full text-xs font-medium ${
                      avionData.avion.detruit ? 'bg-red-500/20 text-red-400' :
                      avionData.avion.statut === 'ground' ? 'bg-emerald-500/20 text-emerald-400' :
                      avionData.avion.statut === 'in_flight' ? 'bg-sky-500/20 text-sky-400' :
                      avionData.avion.statut === 'maintenance' ? 'bg-amber-500/20 text-amber-400' :
                      'bg-red-500/20 text-red-400'
                    }`}>
                      {avionData.avion.detruit ? 'Détruit' :
                       avionData.avion.statut === 'ground' ? 'Au sol' :
                       avionData.avion.statut === 'in_flight' ? 'En vol' :
                       avionData.avion.statut === 'maintenance' ? 'Maintenance' :
                       'Bloqué'}
                    </span>
                    <span className={`px-3 py-1 rounded-full text-xs font-medium ${
                      avionData.avion.source === 'compagnie' ? 'bg-purple-500/20 text-purple-400' : 'bg-sky-500/20 text-sky-400'
                    }`}>
                      {avionData.avion.source === 'compagnie' ? 'Flotte compagnie' : 'Avion personnel'}
                    </span>
                  </div>
                </div>

                <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                  <div className="p-3 rounded-lg bg-slate-800/50 border border-slate-700/50">
                    <p className="text-xs text-slate-500 flex items-center gap-1"><User className="h-3 w-3" /> Propriétaire</p>
                    <p className="text-sm font-medium text-slate-200 mt-1">
                      {avionData.proprietaire?.nom || 'Inconnu'}
                      <span className="text-xs text-slate-500 ml-1">
                        ({avionData.proprietaire?.type === 'compagnie' ? 'Compagnie' : 'Personnel'})
                      </span>
                    </p>
                  </div>
                  <div className="p-3 rounded-lg bg-slate-800/50 border border-slate-700/50">
                    <p className="text-xs text-slate-500 flex items-center gap-1"><MapPin className="h-3 w-3" /> Position actuelle</p>
                    <p className="text-sm font-medium text-slate-200 mt-1 font-mono">{avionData.avion.aeroport_actuel}</p>
                  </div>
                  <div className="p-3 rounded-lg bg-slate-800/50 border border-slate-700/50">
                    <p className="text-xs text-slate-500 flex items-center gap-1"><Wrench className="h-3 w-3" /> État / Usure</p>
                    <div className="mt-1 flex items-center gap-2">
                      <div className="flex-1 bg-slate-700 rounded-full h-2">
                        <div
                          className={`h-2 rounded-full ${
                            avionData.avion.usure_percent > 70 ? 'bg-emerald-400' :
                            avionData.avion.usure_percent > 30 ? 'bg-amber-400' : 'bg-red-400'
                          }`}
                          style={{ width: `${avionData.avion.usure_percent}%` }}
                        />
                      </div>
                      <span className="text-sm font-medium text-slate-200">{avionData.avion.usure_percent}%</span>
                    </div>
                  </div>
                  <div className="p-3 rounded-lg bg-slate-800/50 border border-slate-700/50">
                    <p className="text-xs text-slate-500 flex items-center gap-1"><Timer className="h-3 w-3" /> Heures de vol</p>
                    <p className="text-sm font-medium text-slate-200 mt-1">{formatDuree(avionData.totalMinutesVol)}</p>
                  </div>
                </div>

                <div className="grid gap-4 sm:grid-cols-2 mt-4">
                  <div className="p-3 rounded-lg bg-slate-800/50 border border-slate-700/50">
                    <p className="text-xs text-slate-500 flex items-center gap-1"><Calendar className="h-3 w-3" /> Date d&apos;acquisition</p>
                    <p className="text-sm text-slate-200 mt-1">{formatDateMediumUTC(avionData.avion.created_at)}</p>
                  </div>
                  <div className="p-3 rounded-lg bg-slate-800/50 border border-slate-700/50">
                    <p className="text-xs text-slate-500 flex items-center gap-1"><BookOpen className="h-3 w-3" /> Plans de vol totaux</p>
                    <p className="text-sm text-slate-200 mt-1">{avionData.plansVol.length} plans de vol enregistrés</p>
                  </div>
                </div>

                {avionData.avion.detruit && (
                  <div className="mt-4 p-3 bg-red-500/10 border border-red-500/30 rounded-lg">
                    <p className="text-sm font-medium text-red-400">Avion détruit</p>
                    {avionData.avion.detruit_at && (
                      <p className="text-xs text-red-300/70 mt-1">Le {formatDateMediumUTC(avionData.avion.detruit_at)}</p>
                    )}
                    {avionData.avion.detruit_raison && (
                      <p className="text-xs text-red-300/70 mt-1">Raison : {avionData.avion.detruit_raison}</p>
                    )}
                  </div>
                )}
              </div>

              {/* Plans de vol non clôturés */}
              {avionData.plansNonClotures.length > 0 && (
                <div className="card border-amber-500/30">
                  <h3 className="text-lg font-semibold text-amber-400 mb-3 flex items-center gap-2">
                    <AlertTriangle className="h-5 w-5" />
                    Plans de vol non clôturés ({avionData.plansNonClotures.length})
                  </h3>
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="text-left text-slate-500 border-b border-slate-700/40 text-xs">
                          <th className="py-2 pr-3">N° Vol</th>
                          <th className="py-2 pr-3">Statut</th>
                          <th className="py-2 pr-3">Départ</th>
                          <th className="py-2 pr-3">Arrivée</th>
                          <th className="py-2 pr-3">Pilote</th>
                          <th className="py-2">Date</th>
                        </tr>
                      </thead>
                      <tbody>
                        {avionData.plansNonClotures.map((p) => (
                          <tr key={p.id} className="border-b border-slate-800/40">
                            <td className="py-2 pr-3 text-amber-300 font-mono">{p.numero_vol}</td>
                            <td className="py-2 pr-3">
                              <span className={`px-2 py-0.5 rounded text-xs font-medium ${
                                p.statut === 'depose' ? 'bg-blue-500/20 text-blue-400' :
                                p.statut === 'en_attente' ? 'bg-amber-500/20 text-amber-400' :
                                p.statut === 'accepte' ? 'bg-emerald-500/20 text-emerald-400' :
                                p.statut === 'en_cours' ? 'bg-sky-500/20 text-sky-400' :
                                p.statut === 'automonitoring' ? 'bg-purple-500/20 text-purple-400' :
                                p.statut === 'en_attente_cloture' ? 'bg-orange-500/20 text-orange-400' :
                                'bg-slate-500/20 text-slate-400'
                              }`}>
                                {p.statut.replace(/_/g, ' ')}
                              </span>
                            </td>
                            <td className="py-2 pr-3 text-slate-300">{p.aeroport_depart}</td>
                            <td className="py-2 pr-3 text-slate-300">{p.aeroport_arrivee}</td>
                            <td className="py-2 pr-3 text-slate-300">{p.pilote?.identifiant || '—'}</td>
                            <td className="py-2 text-slate-400 text-xs">{formatDateMediumUTC(p.created_at)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              {/* Historique complet des plans de vol */}
              <div className="card">
                <h3 className="text-lg font-semibold text-slate-100 mb-3 flex items-center gap-2">
                  <BookOpen className="h-5 w-5 text-sky-400" />
                  Historique des vols ({avionData.plansVol.length})
                </h3>
                {avionData.plansVol.length === 0 ? (
                  <p className="text-slate-400 text-sm">Aucun plan de vol enregistré pour cet avion.</p>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full text-xs">
                      <thead>
                        <tr className="text-left text-slate-500 border-b border-slate-700/40">
                          <th className="py-2 pr-2">N° Vol</th>
                          <th className="py-2 pr-2">Statut</th>
                          <th className="py-2 pr-2">Type</th>
                          <th className="py-2 pr-2">Départ</th>
                          <th className="py-2 pr-2">Arrivée</th>
                          <th className="py-2 pr-2">Pilote</th>
                          <th className="py-2 pr-2">Copilote</th>
                          <th className="py-2 pr-2">Compagnie</th>
                          <th className="py-2 pr-2">Callsign</th>
                          <th className="py-2 pr-2">Départ réel</th>
                          <th className="py-2 pr-2">Arrivée réelle</th>
                          <th className="py-2">Date dépôt</th>
                        </tr>
                      </thead>
                      <tbody>
                        {avionData.plansVol.map((p) => {
                          const isCloture = p.statut === 'cloture';
                          const isNonCloture = !['cloture', 'refuse', 'annule'].includes(p.statut);
                          return (
                            <tr key={p.id} className={`border-b border-slate-800/40 ${isNonCloture ? 'bg-amber-500/5' : ''}`}>
                              <td className="py-1.5 pr-2 text-slate-200 font-mono">{p.numero_vol}</td>
                              <td className="py-1.5 pr-2">
                                <span className={`px-1.5 py-0.5 rounded text-xs font-medium ${
                                  isCloture ? 'bg-emerald-500/20 text-emerald-400' :
                                  p.statut === 'refuse' ? 'bg-red-500/20 text-red-400' :
                                  p.statut === 'annule' ? 'bg-slate-500/20 text-slate-400' :
                                  'bg-amber-500/20 text-amber-400'
                                }`}>
                                  {p.statut.replace(/_/g, ' ')}
                                </span>
                              </td>
                              <td className="py-1.5 pr-2 text-slate-400">
                                {p.vol_ferry ? 'Ferry' : p.vol_militaire ? 'Militaire' : p.vol_commercial ? 'Commercial' : p.type_vol}
                              </td>
                              <td className="py-1.5 pr-2 text-slate-300 font-mono">{p.aeroport_depart}</td>
                              <td className="py-1.5 pr-2 text-slate-300 font-mono">{p.aeroport_arrivee}</td>
                              <td className="py-1.5 pr-2 text-slate-300">{p.pilote?.identifiant || '—'}</td>
                              <td className="py-1.5 pr-2 text-slate-300">{p.copilote?.identifiant || '—'}</td>
                              <td className="py-1.5 pr-2 text-slate-300">{p.compagnie?.nom || '—'}</td>
                              <td className="py-1.5 pr-2 text-slate-400 font-mono">{p.callsign || '—'}</td>
                              <td className="py-1.5 pr-2 text-slate-400">
                                {p.heure_depart_reelle ? `${formatDateMediumUTC(p.heure_depart_reelle)} ${formatTimeUTC(p.heure_depart_reelle)}` : '—'}
                              </td>
                              <td className="py-1.5 pr-2 text-slate-400">
                                {p.heure_arrivee_reelle ? `${formatDateMediumUTC(p.heure_arrivee_reelle)} ${formatTimeUTC(p.heure_arrivee_reelle)}` : '—'}
                              </td>
                              <td className="py-1.5 text-slate-500">{formatDateMediumUTC(p.created_at)}</td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>

              {/* Historique réparations */}
              {avionData.reparations.length > 0 && (
                <div className="card">
                  <h3 className="text-lg font-semibold text-slate-100 mb-3 flex items-center gap-2">
                    <Wrench className="h-5 w-5 text-amber-400" />
                    Historique maintenance / réparations ({avionData.reparations.length})
                  </h3>
                  <div className="space-y-2">
                    {avionData.reparations.map((r) => (
                      <div key={r.id} className="flex items-center justify-between text-sm border-b border-slate-700/40 pb-2">
                        <div className="flex-1">
                          <p className="text-slate-300">{r.libelle}</p>
                          <p className="text-xs text-slate-500">{formatDateMediumUTC(r.created_at)}</p>
                        </div>
                        <span className={`font-medium ${r.type === 'credit' ? 'text-emerald-400' : 'text-red-400'}`}>
                          {r.type === 'credit' ? '+' : '-'}{Math.abs(r.montant).toLocaleString('fr-FR')} F$
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      )}

      {activeTab === 'autorisations' && (
        <div className="card">
          <div className="flex items-center justify-between mb-4 flex-wrap gap-3">
            <h2 className="text-lg font-semibold text-slate-100 flex items-center gap-2">
              <ShieldCheck className="h-5 w-5 text-sky-400" />
              Autorisations d&apos;exploitation
            </h2>
            <div className="flex gap-2">
              {(['en_attente', 'approuvee', 'toutes'] as const).map(f => (
                <button
                  key={f}
                  onClick={() => { setAutorisationFilter(f); loadAutorisationsExploit(f); }}
                  className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
                    autorisationFilter === f ? 'bg-indigo-600 text-white' : 'bg-slate-700 text-slate-300 hover:bg-slate-600'
                  }`}
                >
                  {f === 'en_attente' ? 'En attente' : f === 'approuvee' ? 'Approuvées' : 'Toutes'}
                </button>
              ))}
            </div>
          </div>

          {loadingAutorisations ? (
            <div className="flex items-center gap-2 text-slate-400 text-sm py-6 justify-center">
              <Loader2 className="h-4 w-4 animate-spin" />
              Chargement...
            </div>
          ) : autorisationsExploit.length === 0 ? (
            <p className="text-slate-400 text-center py-6">Aucune demande d&apos;autorisation.</p>
          ) : (
            <div className="space-y-3">
              {autorisationsExploit.map((auth) => {
                const isEnAttente = auth.statut === 'en_attente';
                const isApprouvee = auth.statut === 'approuvee';
                return (
                  <div
                    key={auth.id}
                    className={`p-4 rounded-lg border ${
                      isEnAttente
                        ? 'bg-amber-500/5 border-amber-500/30'
                        : isApprouvee
                        ? 'bg-emerald-500/5 border-emerald-500/30'
                        : 'bg-slate-800/50 border-slate-700 opacity-60'
                    }`}
                  >
                    <div className="flex items-start justify-between gap-4 flex-wrap">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-1 flex-wrap">
                          <Plane className="h-4 w-4 text-sky-400 flex-shrink-0" />
                          <span className="text-sm font-medium text-slate-200">
                            {auth.type_avion?.nom || 'Type inconnu'}
                          </span>
                          {auth.type_avion?.constructeur && (
                            <span className="text-xs text-slate-500">({auth.type_avion.constructeur})</span>
                          )}
                          <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium ${
                            isEnAttente ? 'bg-amber-500/20 text-amber-400' :
                            isApprouvee ? 'bg-emerald-500/20 text-emerald-400' :
                            auth.statut === 'refusee' ? 'bg-red-500/20 text-red-400' :
                            'bg-slate-500/20 text-slate-400'
                          }`}>
                            {isEnAttente && <Clock className="h-3 w-3" />}
                            {isApprouvee && <CheckCircle2 className="h-3 w-3" />}
                            {auth.statut === 'refusee' && <XCircle className="h-3 w-3" />}
                            {auth.statut === 'revoquee' && <Ban className="h-3 w-3" />}
                            {isEnAttente ? 'En attente' : isApprouvee ? 'Approuvée' : auth.statut === 'refusee' ? 'Refusée' : 'Révoquée'}
                          </span>
                        </div>
                        <div className="text-xs text-slate-500 space-y-0.5 mt-1">
                          <p>
                            <span className="font-mono">{auth.numero_document}</span>
                            {' — '}
                            Compagnie: <span className="text-slate-300">{auth.compagnie?.nom || '?'}</span>
                            {' — '}
                            Demandeur: <span className="text-slate-300">{auth.demandeur?.identifiant || '?'}</span>
                          </p>
                          {auth.motif_demande && (
                            <p className="text-slate-400">Motif: &laquo; {auth.motif_demande} &raquo;</p>
                          )}
                          {auth.motif_reponse && (
                            <p className="text-slate-400 italic">Réponse IFSA: &laquo; {auth.motif_reponse} &raquo;</p>
                          )}
                          {auth.traite_par && (
                            <p>Traité par: {auth.traite_par.identifiant}</p>
                          )}
                        </div>
                      </div>

                      {/* Actions IFSA */}
                      <div className="flex flex-col gap-2">
                        {isEnAttente && (
                          <>
                            <input
                              type="text"
                              placeholder="Motif (optionnel)"
                              value={autorisationMotifReponse}
                              onChange={e => setAutorisationMotifReponse(e.target.value)}
                              className="input text-xs px-2 py-1 w-48"
                            />
                            <div className="flex gap-1.5">
                              <button
                                onClick={() => handleTraiterAutorisation(auth.id, 'approuver')}
                                disabled={loading}
                                className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded text-xs font-medium flex items-center gap-1"
                              >
                                <CheckCircle2 className="h-3.5 w-3.5" />
                                Approuver
                              </button>
                              <button
                                onClick={() => handleTraiterAutorisation(auth.id, 'refuser')}
                                disabled={loading}
                                className="px-3 py-1.5 bg-red-600 hover:bg-red-700 text-white rounded text-xs font-medium flex items-center gap-1"
                              >
                                <XCircle className="h-3.5 w-3.5" />
                                Refuser
                              </button>
                            </div>
                          </>
                        )}
                        {isApprouvee && (
                          <>
                            <input
                              type="text"
                              placeholder="Motif révocation"
                              value={autorisationMotifReponse}
                              onChange={e => setAutorisationMotifReponse(e.target.value)}
                              className="input text-xs px-2 py-1 w-48"
                            />
                            <button
                              onClick={() => handleTraiterAutorisation(auth.id, 'revoquer')}
                              disabled={loading}
                              className="px-3 py-1.5 bg-orange-600 hover:bg-orange-700 text-white rounded text-xs font-medium flex items-center gap-1"
                            >
                              <Ban className="h-3.5 w-3.5" />
                              Révoquer
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
      {showSanctionModal && mounted && createPortal(
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4">
          <div className="bg-slate-800 rounded-xl border border-slate-700 p-6 max-w-lg w-full max-h-[90dvh] overflow-y-auto">
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
                <>
                  <div>
                    <label className="label">Montant (F$) *</label>
                    <input
                      type="number"
                      value={sanctionMontant}
                      onChange={(e) => setSanctionMontant(e.target.value)}
                      min="1"
                      placeholder="Montant de l'amende"
                      className="input w-full"
                    />
                  </div>
                  <div>
                    <label className="label">VBAN du compte destinataire *</label>
                    <input
                      type="text"
                      value={sanctionVbanDestination}
                      onChange={(e) => setSanctionVbanDestination(e.target.value.replace(/\s+/g, '').toUpperCase())}
                      onPaste={(e) => {
                        e.preventDefault();
                        const pasted = e.clipboardData.getData('text').trim().replace(/\s+/g, '').toUpperCase();
                        setSanctionVbanDestination(pasted);
                      }}
                      placeholder="Ex: VBAN-XXXX-XXXX-XXXX"
                      className="input w-full font-mono"
                    />
                    <p className="text-xs text-slate-500 mt-1">
                      Le compte où l&apos;amende sera versée (compte IFSA ou étatique)
                    </p>
                  </div>
                </>
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
        </div>,
        document.body
      )}

      {/* Modal Nouvelle Enquête */}
      {showEnqueteModal && mounted && createPortal(
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4">
          <div className="bg-slate-800 rounded-xl border border-slate-700 p-6 max-w-lg w-full max-h-[90dvh] overflow-y-auto">
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
        </div>,
        document.body
      )}

      {/* Modal Détails Signalement */}
      {selectedSignalement && !showEnqueteModal && mounted && createPortal(
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4">
          <div className="bg-slate-800 rounded-xl border border-slate-700 p-6 max-w-2xl w-full max-h-[90dvh] overflow-y-auto">
            <div className="flex items-start justify-between mb-4">
              <div>
                <span className="text-xs font-mono text-slate-500">{selectedSignalement.numero_signalement}</span>
                <h3 className="text-lg font-semibold text-slate-100">{selectedSignalement.titre}</h3>
              </div>
              <button onClick={() => setSelectedSignalement(null)} className="text-slate-400 hover:text-slate-200" aria-label="Fermer">
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
                  <p className="text-sm text-slate-400">Date (UTC)</p>
                  <p className="text-slate-200">{toLocaleStringUTC(selectedSignalement.created_at)} UTC</p>
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
        </div>,
        document.body
      )}

      {/* Modal Détail/Édition Enquête */}
      {showEnqueteDetailModal && selectedEnquete && enqueteEditState && mounted && createPortal(
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4">
          <div className="bg-slate-800 rounded-xl border border-slate-700 p-6 max-w-3xl w-full max-h-[90dvh] overflow-y-auto">
            <div className="flex items-start justify-between mb-4">
              <div>
                <span className="text-sm font-mono text-amber-400 font-semibold">{selectedEnquete.numero_dossier}</span>
                <h3 className="text-xl font-semibold text-slate-100 mt-1">Modifier l&apos;enquête</h3>
              </div>
              <button 
                onClick={() => { setShowEnqueteDetailModal(false); setSelectedEnquete(null); setEnqueteEditState(null); }}
                className="text-slate-400 hover:text-slate-200"
                aria-label="Fermer"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="space-y-4">
              {/* Titre */}
              <div>
                <label className="label">Titre de l&apos;enquête</label>
                <input
                  type="text"
                  value={enqueteEditState.titre}
                  onChange={(e) => setEnqueteEditState({ ...enqueteEditState, titre: e.target.value })}
                  className="input w-full text-lg font-semibold"
                  placeholder="Titre de l'enquête"
                />
              </div>

              {/* Statut et Priorité */}
              <div className="grid gap-4 sm:grid-cols-2">
                <div>
                  <label className="label">Statut</label>
                  <select
                    value={enqueteEditState.statut}
                    onChange={(e) => setEnqueteEditState({ ...enqueteEditState, statut: e.target.value })}
                    className="input w-full"
                  >
                    {Object.entries(STATUTS_ENQUETE).map(([key, val]) => (
                      <option key={key} value={key}>{val.label}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="label">Priorité</label>
                  <select
                    value={enqueteEditState.priorite}
                    onChange={(e) => setEnqueteEditState({ ...enqueteEditState, priorite: e.target.value })}
                    className="input w-full"
                  >
                    {Object.entries(PRIORITES).map(([key, val]) => (
                      <option key={key} value={key}>{val.label}</option>
                    ))}
                  </select>
                </div>
              </div>

              {/* Description */}
              <div>
                <label className="label">Description / Rapport d&apos;enquête</label>
                <textarea
                  value={enqueteEditState.description}
                  onChange={(e) => setEnqueteEditState({ ...enqueteEditState, description: e.target.value })}
                  placeholder="Détails de l'enquête, faits, observations, témoignages..."
                  rows={8}
                  className="input w-full resize-y font-mono text-sm"
                />
                <p className="text-xs text-slate-500 mt-1">
                  Vous pouvez écrire un rapport complet ici. Le texte sera conservé tel quel.
                </p>
              </div>

              {/* Conclusion */}
              <div>
                <label className="label">Conclusion (optionnel)</label>
                <textarea
                  value={enqueteEditState.conclusion}
                  onChange={(e) => setEnqueteEditState({ ...enqueteEditState, conclusion: e.target.value })}
                  placeholder="Résumé des conclusions, recommandations, décisions..."
                  rows={4}
                  className="input w-full resize-y"
                />
              </div>

              {/* Informations contextuelles (lecture seule) */}
              <div className="p-4 bg-slate-900/50 rounded-lg border border-slate-700">
                <h4 className="text-sm font-semibold text-slate-300 mb-3">Informations</h4>
                <div className="grid gap-3 sm:grid-cols-2 text-sm">
                  <div>
                    <span className="text-slate-500">Enquêteur:</span>
                    <span className="ml-2 text-slate-200">{selectedEnquete.enqueteur?.identifiant || 'Non assigné'}</span>
                  </div>
                  <div>
                    <span className="text-slate-500">Ouvert par:</span>
                    <span className="ml-2 text-slate-200">{selectedEnquete.ouvert_par?.identifiant || 'Inconnu'}</span>
                  </div>
                  {selectedEnquete.pilote_concerne && (
                    <div>
                      <span className="text-slate-500">Pilote concerné:</span>
                      <span className="ml-2 text-amber-400">{selectedEnquete.pilote_concerne.identifiant}</span>
                    </div>
                  )}
                  {selectedEnquete.compagnie_concernee && (
                    <div>
                      <span className="text-slate-500">Compagnie concernée:</span>
                      <span className="ml-2 text-amber-400">{selectedEnquete.compagnie_concernee.nom}</span>
                    </div>
                  )}
                  <div>
                    <span className="text-slate-500">Date d&apos;ouverture:</span>
                    <span className="ml-2 text-slate-200">{toLocaleStringUTC(selectedEnquete.created_at)} UTC</span>
                  </div>
                  {selectedEnquete.cloture_at && (
                    <div>
                      <span className="text-slate-500">Date de clôture:</span>
                      <span className="ml-2 text-emerald-400">{toLocaleStringUTC(selectedEnquete.cloture_at)} UTC</span>
                    </div>
                  )}
                </div>
              </div>
            </div>

            <div className="flex gap-3 mt-6">
              <button
                onClick={() => { setShowEnqueteDetailModal(false); setSelectedEnquete(null); setEnqueteEditState(null); }}
                className="flex-1 px-4 py-2 bg-slate-700 hover:bg-slate-600 text-slate-300 rounded-lg font-medium"
              >
                Annuler
              </button>
              <button
                onClick={handleSaveEnqueteEdit}
                disabled={loading || !enqueteEditState.titre}
                className="flex-1 px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg font-medium flex items-center justify-center gap-2 disabled:opacity-50"
              >
                {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
                Enregistrer
              </button>
            </div>
          </div>
        </div>,
        document.body
      )}

      {showVirementsModal && verificationResult && mounted && createPortal(
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4">
          <div className="bg-slate-800 rounded-xl border border-slate-700 p-6 max-w-2xl w-full max-h-[90dvh] overflow-y-auto">
            <h3 className="text-lg font-semibold text-slate-100 mb-4 flex items-center gap-2">
              <Search className="h-5 w-5 text-sky-400" />
              Origine des virements
            </h3>
            {verificationResult.virements.length === 0 ? (
              <p className="text-slate-400 text-sm">Aucun virement dans l&apos;historique.</p>
            ) : (
              <div className="space-y-3">
                {verificationResult.virements.map((v) => (
                  <div
                    key={v.id}
                    className="p-3 rounded-lg border border-slate-700/50 bg-slate-900/40 flex flex-wrap items-center justify-between gap-2"
                  >
                    <div className="flex-1 min-w-0">
                      <p className="text-sm text-slate-300 truncate">{v.libelle}</p>
                      <p className="text-xs text-slate-500 mt-0.5">
                        {v.type === 'credit' ? 'Reçu de' : 'Envoyé à'}: {v.autre_partie?.label ?? v.autre_partie?.vban ?? '—'}
                        {v.autre_partie?.vban && v.autre_partie.vban !== v.autre_partie.label && (
                          <span className="text-slate-600 ml-1">({v.autre_partie.vban})</span>
                        )}
                      </p>
                      <p className="text-xs text-slate-500">{formatDateMediumUTC(v.created_at)}</p>
                    </div>
                    <span className={`font-semibold ${v.type === 'credit' ? 'text-emerald-400' : 'text-red-400'}`}>
                      {v.type === 'credit' ? '+' : '-'}{v.montant.toLocaleString('fr-FR')} F$
                    </span>
                  </div>
                ))}
              </div>
            )}
            <div className="mt-6 flex justify-end">
              <button
                onClick={() => setShowVirementsModal(false)}
                className="px-4 py-2 bg-slate-700 hover:bg-slate-600 text-slate-300 rounded-lg font-medium"
              >
                Fermer
              </button>
            </div>
          </div>
        </div>,
        document.body
      )}
    </div>
  );
}
