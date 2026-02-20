'use client';

import { useState, useEffect, useCallback, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Building2, Users, Plane, Crown, Clock, Settings, DollarSign, Save, RefreshCw, ChevronDown, Route, ShoppingCart, UserPlus, Send, X, Check, Loader2, Search, ImagePlus, Trash2, Radio, LogOut } from 'lucide-react';
import Image from 'next/image';
import Link from 'next/link';
import TarifsLiaisonsClient from './TarifsLiaisonsClient';
import CompagnieHubsClient from './CompagnieHubsClient';
import CompagnieAvionsClient from './CompagnieAvionsClient';
import CompagnieVolsFerryClient from './CompagnieVolsFerryClient';
import CompagniePretClient from './CompagniePretClient';
import CompagnieLocationsClient from './CompagnieLocationsClient';
import CompagnieAutorisationsClient from './CompagnieAutorisationsClient';
import { toLocaleDateStringUTC } from '@/lib/date-utils';

interface CompagnieOption {
  id: string;
  nom: string;
  role: 'employe' | 'pdg';
}

interface Compagnie {
  id: string;
  nom: string;
  code_oaci: string | null;
  callsign_telephonie: string | null;
  vban: string | null;
  pdg_identifiant: string;
  pourcentage_salaire: number;
  prix_billet_pax: number;
  prix_kg_cargo: number;
  logo_url: string | null;
  alliance_id: string | null;
}

interface Employe {
  id: string;
  piloteId: string;
  identifiant: string;
  heures: number;
}

interface Props {
  compagniesDisponibles: CompagnieOption[];
  selectedCompagnieId: string;
  compagnie: Compagnie;
  employes: Employe[];
  isPdg: boolean;
  soldeCompagnie: number;
}

function formatHeures(minutes: number): string {
  if (!minutes) return '0h';
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return m > 0 ? `${h}h ${m}min` : `${h}h`;
}

export default function MaCompagnieClient({ 
  compagniesDisponibles, 
  selectedCompagnieId, 
  compagnie, 
  employes, 
  isPdg,
  soldeCompagnie 
}: Props) {
  const router = useRouter();
  const [, startTransition] = useTransition();
  const [showSettings, setShowSettings] = useState(false);
  const [pourcentageSalaire, setPourcentageSalaire] = useState(compagnie.pourcentage_salaire.toString());
  const [prixBillet, setPrixBillet] = useState(compagnie.prix_billet_pax.toString());
  const [prixCargo, setPrixCargo] = useState(compagnie.prix_kg_cargo.toString());
  const [codeOaci, setCodeOaci] = useState(compagnie.code_oaci || '');
  const [callsignTel, setCallsignTel] = useState(compagnie.callsign_telephonie || '');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  // Logo compagnie
  const [logoUrl, setLogoUrl] = useState<string | null>(compagnie.logo_url);
  const [uploadingLogo, setUploadingLogo] = useState(false);
  const [logoError, setLogoError] = useState('');
  const [logoSuccess, setLogoSuccess] = useState('');

  // Recrutement
  const [showRecrutement, setShowRecrutement] = useState(false);
  const [searchPilote, setSearchPilote] = useState('');
  const [pilotesRecherche, setPilotesRecherche] = useState<Array<{id: string; identifiant: string}>>([]);
  const [selectedPilote, setSelectedPilote] = useState<{id: string; identifiant: string} | null>(null);
  const [messageInvitation, setMessageInvitation] = useState('');
  const [sendingInvite, setSendingInvite] = useState(false);
  const [invitationsEnvoyees, setInvitationsEnvoyees] = useState<Array<{id: string; pilote: {id: string; identifiant: string}; statut: string; created_at: string}>>([]);
  const [loadingInvitations, setLoadingInvitations] = useState(false);
  const [quittingAlliance, setQuittingAlliance] = useState(false);

  // Charger les invitations envoyées
  const loadInvitations = useCallback(async () => {
    setLoadingInvitations(true);
    try {
      const res = await fetch(`/api/recrutement?type=envoyees&compagnie_id=${compagnie.id}`);
      if (res.ok) {
        const data = await res.json();
        setInvitationsEnvoyees(data.map((inv: any) => ({
          id: inv.id,
          pilote: Array.isArray(inv.pilote) ? inv.pilote[0] : inv.pilote,
          statut: inv.statut,
          created_at: inv.created_at
        })));
      }
    } catch (e) {
      console.error('Erreur chargement invitations:', e);
    } finally {
      setLoadingInvitations(false);
    }
  }, [compagnie.id]);

  useEffect(() => {
    if (isPdg && compagnie.id) {
      loadInvitations();
    }
  }, [isPdg, compagnie.id, loadInvitations]);

  // Recherche de pilotes
  async function handleSearchPilote(query: string) {
    setSearchPilote(query);
    if (query.length < 2) {
      setPilotesRecherche([]);
      return;
    }
    try {
      const res = await fetch(`/api/pilotes/search?q=${encodeURIComponent(query)}`);
      if (res.ok) {
        const data = await res.json();
        // Exclure les pilotes déjà employés
        const employeIds = employes.map(e => e.piloteId);
        setPilotesRecherche(data.filter((p: any) => !employeIds.includes(p.id)));
      }
    } catch (e) {
      console.error('Erreur recherche pilotes:', e);
    }
  }

  async function handleEnvoyerInvitation() {
    if (!selectedPilote) return;
    setSendingInvite(true);
    setError('');

    try {
      const res = await fetch('/api/recrutement', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          compagnie_id: compagnie.id,
          pilote_id: selectedPilote.id,
          message_invitation: messageInvitation || null
        })
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Erreur');

      setSuccess(data.message || 'Invitation envoyée !');
      setSelectedPilote(null);
      setSearchPilote('');
      setMessageInvitation('');
      setPilotesRecherche([]);
      loadInvitations();
      setTimeout(() => setSuccess(''), 5000);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erreur');
    } finally {
      setSendingInvite(false);
    }
  }

  async function handleAnnulerInvitation(invitationId: string) {
    if (!confirm('Annuler cette invitation ?')) return;

    try {
      const res = await fetch(`/api/recrutement?id=${invitationId}`, { method: 'DELETE' });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Erreur');

      setSuccess('Invitation annulée');
      loadInvitations();
      setTimeout(() => setSuccess(''), 3000);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erreur');
    }
  }

  async function handleUploadLogo(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith('image/')) {
      setLogoError('Le fichier doit être une image');
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      setLogoError('Fichier trop volumineux (max 5 MB)');
      return;
    }
    setUploadingLogo(true);
    setLogoError('');
    setLogoSuccess('');
    try {
      const formData = new FormData();
      formData.append('file', file);
      formData.append('compagnie_id', compagnie.id);
      const res = await fetch('/api/compagnies/logo', { method: 'POST', body: formData });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Erreur');
      setLogoUrl(data.logo_url);
      setLogoSuccess(`Logo mis à jour ! ${data.cartes_mises_a_jour} carte(s) mise(s) à jour.`);
      setTimeout(() => setLogoSuccess(''), 5000);
      startTransition(() => router.refresh());
    } catch (err) {
      setLogoError(err instanceof Error ? err.message : 'Erreur upload');
    } finally {
      setUploadingLogo(false);
      // Reset input
      e.target.value = '';
    }
  }

  async function handleDeleteLogo() {
    if (!confirm('Supprimer le logo de la compagnie ? Il sera retiré de toutes les cartes des employés.')) return;
    setUploadingLogo(true);
    setLogoError('');
    try {
      const res = await fetch(`/api/compagnies/logo?compagnie_id=${compagnie.id}`, { method: 'DELETE' });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Erreur');
      setLogoUrl(null);
      setLogoSuccess('Logo supprimé');
      setTimeout(() => setLogoSuccess(''), 3000);
      startTransition(() => router.refresh());
    } catch (err) {
      setLogoError(err instanceof Error ? err.message : 'Erreur');
    } finally {
      setUploadingLogo(false);
    }
  }

  function handleCompagnieChange(e: React.ChangeEvent<HTMLSelectElement>) {
    router.push(`/ma-compagnie?c=${e.target.value}`);
  }

  async function handleQuitterAlliance() {
    if (!compagnie.alliance_id || !confirm('Quitter l\'alliance ? Votre compagnie ne sera plus membre.')) return;
    setQuittingAlliance(true);
    setError('');
    try {
      const res = await fetch(`/api/alliances/${compagnie.alliance_id}/quitter`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ compagnie_id: compagnie.id }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Erreur');
      setSuccess('Vous avez quitté l\'alliance.');
      setTimeout(() => setSuccess(''), 3000);
      startTransition(() => router.refresh());
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erreur');
    } finally {
      setQuittingAlliance(false);
    }
  }

  async function handleSaveSettings() {
    setError('');
    setSuccess('');
    setSaving(true);

    try {
      const res = await fetch(`/api/compagnies/${compagnie.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          pourcentage_salaire: parseInt(pourcentageSalaire) || 20,
          prix_billet_pax: parseInt(prixBillet) || 100,
          prix_kg_cargo: parseInt(prixCargo) || 5,
          code_oaci: codeOaci || null,
          callsign_telephonie: callsignTel || null,
        })
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Erreur');

      setSuccess('Paramètres sauvegardés');
      setTimeout(() => setSuccess(''), 3000);
      startTransition(() => router.refresh());
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erreur');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div className="flex items-center gap-3">
          <Building2 className="h-8 w-8 text-sky-400" />
          {compagniesDisponibles.length > 1 ? (
            <select
              value={selectedCompagnieId}
              onChange={handleCompagnieChange}
              className="text-2xl font-bold text-slate-100 bg-transparent border-none cursor-pointer hover:text-sky-300 transition-colors appearance-none pr-8"
              style={{ backgroundImage: 'none' }}
            >
              {compagniesDisponibles.map(c => (
                <option key={c.id} value={c.id} className="bg-slate-800 text-slate-100">
                  {c.nom} {c.role === 'pdg' ? '(PDG)' : ''}
                </option>
              ))}
            </select>
          ) : (
            <h1 className="text-2xl font-bold text-slate-100">{compagnie.nom}</h1>
          )}
          {compagniesDisponibles.length > 1 && (
            <ChevronDown className="h-5 w-5 text-slate-400 -ml-6 pointer-events-none" />
          )}
        </div>
        <div className="flex items-center gap-2">
          {isPdg && (
            <>
              <button
                onClick={() => setShowSettings(!showSettings)}
                className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
                  showSettings 
                    ? 'bg-sky-500/20 text-sky-300 border border-sky-500/50' 
                    : 'bg-slate-700 text-slate-300 hover:bg-slate-600'
                }`}
              >
                <Settings className="h-4 w-4" />
                Paramètres
              </button>
              {compagnie.alliance_id && (
                <>
                  <Link href="/alliance" className="flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm font-medium bg-slate-700 text-slate-300 hover:bg-slate-600">
                    <Users className="h-4 w-4" />
                    Alliance
                  </Link>
                  <button
                    onClick={handleQuitterAlliance}
                    disabled={quittingAlliance}
                    className="flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm font-medium bg-red-900/30 text-red-300 hover:bg-red-900/50 disabled:opacity-50"
                  >
                    <LogOut className="h-4 w-4" />
                    {quittingAlliance ? 'En cours…' : 'Quitter l\'alliance'}
                  </button>
                </>
              )}
              <span className="flex items-center gap-2 px-3 py-1.5 bg-amber-500/20 text-amber-300 rounded-full text-sm font-medium">
                <Crown className="h-4 w-4" />
                PDG
              </span>
            </>
          )}
        </div>
      </div>

      {/* Paramètres PDG */}
      {isPdg && showSettings && (
        <div className="card border-sky-500/30 bg-sky-500/5">
          <h2 className="text-lg font-semibold text-slate-100 mb-4 flex items-center gap-2">
            <Settings className="h-5 w-5 text-sky-400" />
            Paramètres de la compagnie
          </h2>
          
          {error && <p className="text-red-400 text-sm mb-3">{error}</p>}
          {success && <p className="text-emerald-400 text-sm mb-3">{success}</p>}
          
          <div className="grid gap-4 sm:grid-cols-3">
            <div>
              <label className="label flex items-center gap-2">
                <DollarSign className="h-4 w-4 text-emerald-400" />
                Salaire pilotes (%)
              </label>
              <input
                type="number"
                value={pourcentageSalaire}
                onChange={(e) => setPourcentageSalaire(e.target.value)}
                min="0"
                max="100"
                className="input w-full"
              />
              <p className="text-xs text-slate-500 mt-1">% du revenu reversé aux pilotes</p>
            </div>
            <div>
              <label className="label flex items-center gap-2">
                <Users className="h-4 w-4 text-sky-400" />
                Prix billet passager (F$)
              </label>
              <input
                type="number"
                value={prixBillet}
                onChange={(e) => setPrixBillet(e.target.value)}
                min="1"
                className="input w-full"
              />
            </div>
            <div>
              <label className="label flex items-center gap-2">
                <Plane className="h-4 w-4 text-amber-400" />
                Prix cargo/kg (F$)
              </label>
              <input
                type="number"
                value={prixCargo}
                onChange={(e) => setPrixCargo(e.target.value)}
                min="1"
                className="input w-full"
              />
            </div>
          </div>

          <div className="mt-4 pt-4 border-t border-slate-700">
            <h3 className="text-sm font-semibold text-slate-200 mb-3 flex items-center gap-2">
              <Radio className="h-4 w-4 text-sky-400" />
              Identité radio (Callsign)
            </h3>
            <p className="text-xs text-slate-400 mb-3">
              Le code OACI sert de préfixe au numéro de vol (ex: AFR4546). Le nom radio est affiché aux contrôleurs ATC (ex: AIRFRANCE).
            </p>
            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <label className="label">Code OACI (3-4 lettres)</label>
                <input
                  type="text"
                  value={codeOaci}
                  onChange={(e) => setCodeOaci(e.target.value.toUpperCase().replace(/[^A-Z]/g, ''))}
                  maxLength={4}
                  placeholder="AFR"
                  className="input w-full font-mono uppercase"
                />
                <p className="text-xs text-slate-500 mt-1">Ex: AFR, LUF, BAW, UAE</p>
              </div>
              <div>
                <label className="label">Nom radio (téléphonie)</label>
                <input
                  type="text"
                  value={callsignTel}
                  onChange={(e) => setCallsignTel(e.target.value.toUpperCase())}
                  maxLength={30}
                  placeholder="AIRFRANCE"
                  className="input w-full font-mono uppercase"
                />
                <p className="text-xs text-slate-500 mt-1">Ex: AIRFRANCE, LUFTHANSA, SPEEDBIRD</p>
              </div>
            </div>
          </div>
          
          <button
            onClick={handleSaveSettings}
            disabled={saving}
            className="btn-primary mt-4 flex items-center gap-2"
          >
            {saving ? <RefreshCw className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
            Sauvegarder
          </button>

          {/* Section Logo */}
          <div className="mt-6 pt-6 border-t border-slate-700">
            <h3 className="text-sm font-semibold text-slate-200 mb-3 flex items-center gap-2">
              <ImagePlus className="h-4 w-4 text-sky-400" />
              Logo de la compagnie
            </h3>
            <p className="text-xs text-slate-400 mb-3">
              Ce logo sera automatiquement appliqué sur les cartes d&apos;identité de tous vos employés et de vous-même.
              Les cartes staff (noires) ne sont pas affectées.
            </p>
            {logoError && <p className="text-red-400 text-sm mb-2">{logoError}</p>}
            {logoSuccess && <p className="text-emerald-400 text-sm mb-2">{logoSuccess}</p>}
            
            <div className="flex items-center gap-4">
              {logoUrl ? (
                <div className="relative group">
                  <Image
                    src={logoUrl}
                    alt="Logo compagnie"
                    width={80}
                    height={80}
                    className="rounded-lg border border-slate-600 object-contain bg-white p-1"
                    unoptimized
                  />
                  <button
                    onClick={handleDeleteLogo}
                    disabled={uploadingLogo}
                    className="absolute -top-2 -right-2 bg-red-600 text-white rounded-full p-1 opacity-0 group-hover:opacity-100 transition-opacity hover:bg-red-500"
                    title="Supprimer le logo"
                  >
                    <Trash2 className="h-3 w-3" />
                  </button>
                </div>
              ) : (
                <div className="w-20 h-20 rounded-lg border-2 border-dashed border-slate-600 flex items-center justify-center text-slate-500">
                  <ImagePlus className="h-6 w-6" />
                </div>
              )}
              <div>
                <label className="btn-primary text-sm cursor-pointer flex items-center gap-2">
                  {uploadingLogo ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <ImagePlus className="h-4 w-4" />
                  )}
                  {logoUrl ? 'Changer le logo' : 'Uploader un logo'}
                  <input
                    type="file"
                    accept="image/*"
                    className="hidden"
                    onChange={handleUploadLogo}
                    disabled={uploadingLogo}
                  />
                </label>
                <p className="text-xs text-slate-500 mt-1">PNG, JPG, max 5 MB</p>
              </div>
            </div>
          </div>
        </div>
      )}

      <div className="grid gap-6 lg:grid-cols-2">
        {/* Infos compagnie */}
        <div className="card">
          <h2 className="text-lg font-semibold text-slate-100 mb-4 flex items-center gap-2">
            <Building2 className="h-5 w-5 text-sky-400" />
            Informations
          </h2>
          <div className="space-y-3">
            <div className="flex items-center gap-3">
              {logoUrl && (
                <Image
                  src={logoUrl}
                  alt={`Logo ${compagnie.nom}`}
                  width={48}
                  height={48}
                  className="rounded-lg border border-slate-600 object-contain bg-white p-0.5"
                  unoptimized
                />
              )}
              <div>
                <p className="text-sm text-slate-400">Nom</p>
                <p className="text-slate-200 font-medium">{compagnie.nom}</p>
              </div>
            </div>
            {(compagnie.code_oaci || compagnie.callsign_telephonie) && (
              <div>
                <p className="text-sm text-slate-400">Identité radio</p>
                <p className="text-slate-200 font-mono">
                  {compagnie.code_oaci && <span className="bg-sky-500/20 text-sky-300 px-1.5 py-0.5 rounded text-sm mr-2">{compagnie.code_oaci}</span>}
                  {compagnie.callsign_telephonie && <span className="text-slate-300">{compagnie.callsign_telephonie}</span>}
                </p>
              </div>
            )}
            <div>
              <p className="text-sm text-slate-400">PDG</p>
              <p className="text-slate-200 flex items-center gap-2">
                <Crown className="h-4 w-4 text-amber-400" />
                {compagnie.pdg_identifiant}
              </p>
            </div>
            {compagnie.vban && (
              <div>
                <p className="text-sm text-slate-400">VBAN Entreprise</p>
                <p className="text-slate-200 font-mono text-sm break-all">{compagnie.vban}</p>
              </div>
            )}
            <div className="pt-2 border-t border-slate-700">
              <p className="text-sm text-slate-400">Tarification</p>
              <div className="flex gap-4 mt-1">
                <span className="text-slate-300 text-sm">
                  <span className="text-emerald-400">{compagnie.pourcentage_salaire}%</span> salaire pilotes
                </span>
                <span className="text-slate-300 text-sm">
                  <span className="text-sky-400">{compagnie.prix_billet_pax} F$</span>/pax
                </span>
                <span className="text-slate-300 text-sm">
                  <span className="text-amber-400">{compagnie.prix_kg_cargo} F$</span>/kg
                </span>
              </div>
            </div>
          </div>
        </div>

        {/* Liste des pilotes */}
        <div className="card">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-semibold text-slate-100 flex items-center gap-2">
              <Users className="h-5 w-5 text-sky-400" />
              Pilotes ({employes.length})
            </h2>
            {isPdg && (
              <button
                onClick={() => setShowRecrutement(!showRecrutement)}
                className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
                  showRecrutement 
                    ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/50' 
                    : 'bg-emerald-600 text-white hover:bg-emerald-700'
                }`}
              >
                <UserPlus className="h-4 w-4" />
                Recruter
              </button>
            )}
          </div>
          {employes.length > 0 ? (
            <div className="space-y-2 max-h-64 overflow-y-auto">
              {employes.map((emp) => (
                <div 
                  key={emp.id} 
                  className="flex items-center justify-between bg-slate-800/30 rounded-lg p-3 border border-slate-700/30"
                >
                  <span className="text-slate-200 font-medium">{emp.identifiant}</span>
                  <span className="text-sm text-slate-400 flex items-center gap-1">
                    <Clock className="h-3.5 w-3.5" />
                    {formatHeures(emp.heures)}
                  </span>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-slate-400 text-sm">Aucun pilote employé.</p>
          )}
        </div>
      </div>

      {/* Section Recrutement (PDG uniquement) */}
      {isPdg && showRecrutement && (
        <div className="card border-emerald-500/30 bg-emerald-500/5">
          <h2 className="text-lg font-semibold text-slate-100 mb-4 flex items-center gap-2">
            <UserPlus className="h-5 w-5 text-emerald-400" />
            Recruter un pilote
          </h2>

          <div className="grid gap-6 lg:grid-cols-2">
            {/* Formulaire d'invitation */}
            <div className="space-y-4">
              <div>
                <label className="label">Rechercher un pilote</label>
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
                  <input
                    type="text"
                    value={searchPilote}
                    onChange={(e) => handleSearchPilote(e.target.value)}
                    placeholder="Entrez un identifiant..."
                    className="input w-full pl-10"
                  />
                </div>
                
                {/* Résultats de recherche */}
                {pilotesRecherche.length > 0 && !selectedPilote && (
                  <div className="mt-2 bg-slate-800 rounded-lg border border-slate-700 max-h-40 overflow-y-auto">
                    {pilotesRecherche.map((pilote) => (
                      <button
                        key={pilote.id}
                        onClick={() => {
                          setSelectedPilote(pilote);
                          setSearchPilote(pilote.identifiant);
                          setPilotesRecherche([]);
                        }}
                        className="w-full px-4 py-2 text-left text-slate-200 hover:bg-slate-700 transition-colors"
                      >
                        {pilote.identifiant}
                      </button>
                    ))}
                  </div>
                )}

                {/* Pilote sélectionné */}
                {selectedPilote && (
                  <div className="mt-2 flex items-center gap-2 bg-emerald-500/20 rounded-lg px-3 py-2">
                    <Check className="h-4 w-4 text-emerald-400" />
                    <span className="text-emerald-300 font-medium">{selectedPilote.identifiant}</span>
                    <button
                      onClick={() => {
                        setSelectedPilote(null);
                        setSearchPilote('');
                      }}
                      className="ml-auto text-slate-400 hover:text-slate-200"
                    >
                      <X className="h-4 w-4" />
                    </button>
                  </div>
                )}
              </div>

              <div>
                <label className="label">Message personnalisé (optionnel)</label>
                <textarea
                  value={messageInvitation}
                  onChange={(e) => setMessageInvitation(e.target.value)}
                  placeholder="Bonjour, nous serions ravis de vous accueillir dans notre équipe..."
                  rows={3}
                  className="input w-full resize-none"
                />
              </div>

              <button
                onClick={handleEnvoyerInvitation}
                disabled={!selectedPilote || sendingInvite}
                className="btn-primary w-full flex items-center justify-center gap-2 disabled:opacity-50"
              >
                {sendingInvite ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Send className="h-4 w-4" />
                )}
                Envoyer l&apos;invitation
              </button>
            </div>

            {/* Invitations en attente */}
            <div>
              <h3 className="text-sm font-medium text-slate-400 mb-3">Invitations envoyées</h3>
              {loadingInvitations ? (
                <div className="flex items-center justify-center py-8">
                  <Loader2 className="h-6 w-6 animate-spin text-slate-400" />
                </div>
              ) : invitationsEnvoyees.length === 0 ? (
                <p className="text-slate-500 text-sm">Aucune invitation envoyée.</p>
              ) : (
                <div className="space-y-2 max-h-64 overflow-y-auto">
                  {invitationsEnvoyees.map((inv) => (
                    <div 
                      key={inv.id} 
                      className={`flex items-center justify-between p-3 rounded-lg border ${
                        inv.statut === 'en_attente' 
                          ? 'bg-amber-500/10 border-amber-500/30' 
                          : inv.statut === 'acceptee'
                          ? 'bg-emerald-500/10 border-emerald-500/30'
                          : 'bg-red-500/10 border-red-500/30'
                      }`}
                    >
                      <div>
                        <p className="text-slate-200 font-medium">{inv.pilote?.identifiant || 'Inconnu'}</p>
                        <p className="text-xs text-slate-500">
                          {toLocaleDateStringUTC(inv.created_at)} UTC
                        </p>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className={`text-xs font-medium px-2 py-1 rounded ${
                          inv.statut === 'en_attente' 
                            ? 'bg-amber-500/20 text-amber-300' 
                            : inv.statut === 'acceptee'
                            ? 'bg-emerald-500/20 text-emerald-300'
                            : inv.statut === 'refusee'
                            ? 'bg-red-500/20 text-red-300'
                            : 'bg-slate-500/20 text-slate-300'
                        }`}>
                          {inv.statut === 'en_attente' ? 'En attente' : 
                           inv.statut === 'acceptee' ? 'Acceptée' :
                           inv.statut === 'refusee' ? 'Refusée' : 'Annulée'}
                        </span>
                        {inv.statut === 'en_attente' && (
                          <button
                            onClick={() => handleAnnulerInvitation(inv.id)}
                            className="text-red-400 hover:text-red-300"
                            title="Annuler"
                          >
                            <X className="h-4 w-4" />
                          </button>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Solde compagnie */}
      {isPdg && (
        <div className="card bg-gradient-to-r from-emerald-500/10 to-sky-500/10 border-emerald-500/20">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-slate-400">Solde de la compagnie</p>
              <p className={`text-2xl font-bold ${soldeCompagnie > 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                {soldeCompagnie.toLocaleString('fr-FR')} F$
              </p>
            </div>
            <Link
              href="/felitz-bank"
              className="text-sm text-sky-400 hover:text-sky-300"
            >
              Voir les transactions →
            </Link>
          </div>
        </div>
      )}

      {/* Prêt bancaire */}
      {isPdg && <CompagniePretClient compagnieId={compagnie.id} />}

      {/* Locations d'avions */}
      {isPdg && <CompagnieLocationsClient compagnieId={compagnie.id} />}

      {/* Hubs */}
      {isPdg && <CompagnieHubsClient compagnieId={compagnie.id} />}

      {/* Autorisations d'exploitation */}
      <CompagnieAutorisationsClient compagnieId={compagnie.id} isPdg={isPdg} />

      {/* Flotte individuelle */}
      <CompagnieAvionsClient compagnieId={compagnie.id} soldeCompagnie={soldeCompagnie} isPdg={isPdg} />

      {/* Vols Ferry (PDG uniquement) */}
      {isPdg && <CompagnieVolsFerryClient compagnieId={compagnie.id} />}

      {/* Tarifs par liaison (PDG uniquement) */}
      {isPdg && (
        <div className="card">
          <h2 className="text-lg font-semibold text-slate-100 mb-4 flex items-center gap-2">
            <Route className="h-5 w-5 text-amber-400" />
            Tarifs par liaison
          </h2>
          <TarifsLiaisonsClient 
            compagnieId={compagnie.id} 
            prixBilletDefaut={compagnie.prix_billet_pax} 
          />
        </div>
      )}

      {/* Lien vers Felitz Bank si PDG */}
      {isPdg && (
        <Link 
          href="/felitz-bank"
          className="card hover:bg-slate-800/70 transition-colors flex items-center gap-4"
        >
          <div className="p-3 rounded-lg bg-emerald-500/20">
            <DollarSign className="h-6 w-6 text-emerald-400" />
          </div>
          <div>
            <p className="font-semibold text-slate-200">Gérer les finances</p>
            <p className="text-sm text-slate-400">Accéder au compte Felitz Bank de la compagnie</p>
          </div>
        </Link>
      )}
    </div>
  );
}
