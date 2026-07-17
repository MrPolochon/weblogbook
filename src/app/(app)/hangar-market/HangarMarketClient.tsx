'use client';

import { useState, useEffect, useTransition, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { useRouter } from 'next/navigation';
import {
  Plus, Search, Plane, ShoppingCart, RefreshCw, Building2, User,
  Tag, X, AlertCircle, Check, Trash2, DollarSign, Zap, Filter,
  ChevronDown, ChevronUp, TrendingDown, Users, Weight, Clock,
  ArrowDownUp,
} from 'lucide-react';

interface Compagnie {
  id: string;
  nom: string;
  solde: number;
}

interface InventaireItem {
  id: string;
  nom_personnalise: string | null;
  immatriculation: string | null;
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
  types_avion: {
    id: string; nom: string; code_oaci: string; constructeur: string;
    capacite_pax: number; capacite_cargo_kg: number;
  } | null;
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
  reventesRapidesUsees: number;
}

const ETATS: { value: string; label: string; color: string; bg: string; usurePct: number }[] = [
  { value: 'neuf',     label: 'Neuf',    color: 'text-green-400',   bg: 'bg-green-500/15 ring-green-500/30',   usurePct: 0 },
  { value: 'excellent',label: 'Excellent',color:'text-emerald-400', bg: 'bg-emerald-500/15 ring-emerald-500/30', usurePct: 15 },
  { value: 'bon',      label: 'Bon',     color: 'text-blue-400',    bg: 'bg-blue-500/15 ring-blue-500/30',     usurePct: 35 },
  { value: 'correct',  label: 'Correct', color: 'text-yellow-400',  bg: 'bg-yellow-500/15 ring-yellow-500/30', usurePct: 60 },
  { value: 'usé',      label: 'Usé',     color: 'text-orange-400',  bg: 'bg-orange-500/15 ring-orange-500/30', usurePct: 80 },
];

const SORT_OPTS = [
  { value: 'prix_asc',  label: 'Prix ↑' },
  { value: 'prix_desc', label: 'Prix ↓' },
  { value: 'date_desc', label: 'Plus récent' },
  { value: 'etat_asc',  label: 'Meilleur état' },
] as const;
type SortKey = typeof SORT_OPTS[number]['value'];

function UsureBar({ etat }: { etat: string }) {
  const info = ETATS.find(e => e.value === etat);
  const pct = info?.usurePct ?? 50;
  const barColor =
    pct < 20 ? 'bg-green-400' :
    pct < 45 ? 'bg-emerald-400' :
    pct < 65 ? 'bg-yellow-400' :
    'bg-orange-400';
  return (
    <div className="space-y-0.5">
      <div className="flex justify-between text-[10px] text-slate-500">
        <span>Usure</span>
        <span className={info?.color}>{info?.label ?? etat}</span>
      </div>
      <div className="h-1.5 rounded-full bg-slate-700/60 overflow-hidden">
        <div
          className={`h-full rounded-full transition-all ${barColor}`}
          style={{ width: `${Math.max(4, pct)}%` }}
        />
      </div>
    </div>
  );
}

export default function HangarMarketClient({
  userId, soldePerso, compagnies, inventaire, flotteDisponible,
  isPdg, annonces, taxePourcent, reventesRapidesUsees,
}: Props) {
  const router = useRouter();
  const [, startTransition] = useTransition();
  const [activeTab, setActiveTab] = useState<'acheter' | 'vendre' | 'mes-annonces'>('acheter');
  const [searchTerm, setSearchTerm] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  // ── Filtres (acheter) ──
  const [showFilters, setShowFilters] = useState(false);
  const [filterEtat, setFilterEtat] = useState<string | null>(null);
  const [filterType, setFilterType] = useState<string | null>(null);
  const [sortBy, setSortBy] = useState<SortKey>('date_desc');
  const globalMin = useMemo(() => annonces.length ? Math.min(...annonces.map(a => a.prix)) : 0, [annonces]);
  const globalMax = useMemo(() => annonces.length ? Math.max(...annonces.map(a => a.prix)) : 0, [annonces]);
  const [prixMin, setPrixMin] = useState(0);
  const [prixMax, setPrixMax] = useState(Infinity);
  useMemo(() => {
    if (globalMax > 0 && prixMax === Infinity) { setPrixMin(globalMin); setPrixMax(globalMax); }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [globalMin, globalMax]);

  // ── Modal vente ──
  const [showVendreModal, setShowVendreModal] = useState(false);
  const [typeVente, setTypeVente] = useState<'personnel' | 'flotte'>('personnel');
  const [selectedAvion, setSelectedAvion] = useState<string>('');
  const [selectedFlotteAvionId, setSelectedFlotteAvionId] = useState<string>('');
  const [ventePdgSeulement, setVentePdgSeulement] = useState(false);
  const [titre, setTitre] = useState('');
  const [description, setDescription] = useState('');
  const [prix, setPrix] = useState('');
  const [etat, setEtat] = useState('bon');

  // ── Modal achat ──
  const [showAchatModal, setShowAchatModal] = useState(false);
  const [selectedAnnonce, setSelectedAnnonce] = useState<Annonce | null>(null);
  const [acheterPour, setAcheterPour] = useState<string | null>(null);

  // ── Modal revente ──
  const [showReventeModal, setShowReventeModal] = useState(false);
  const [reventeType, setReventeType] = useState<'personnel' | 'flotte'>('personnel');
  const [reventeAvionId, setReventeAvionId] = useState('');
  const [reventeMode, setReventeMode] = useState<'rapide' | 'demande'>('rapide');

  const LIMITE_RAPIDE = 2;
  const reventesRapideRestantes = Math.max(0, LIMITE_RAPIDE - reventesRapidesUsees);

  const [mounted, setMounted] = useState(false);
  useEffect(() => { setMounted(true); }, []);

  // ── Types uniques présents dans les annonces ──
  const typesPresents = useMemo(() => {
    const map = new Map<string, string>();
    annonces.forEach(a => { if (a.types_avion) map.set(a.types_avion.id, a.types_avion.nom); });
    return Array.from(map.entries()).map(([id, nom]) => ({ id, nom }));
  }, [annonces]);

  // ── Mes annonces ──
  const mesCompagnieIds = useMemo(() => new Set(compagnies.map(c => c.id)), [compagnies]);
  const mesAnnonces = useMemo(() =>
    annonces.filter(a =>
      a.vendeur_id === userId ||
      (a.compagnie_vendeur_id && mesCompagnieIds.has(a.compagnie_vendeur_id))
    ),
    [annonces, userId, mesCompagnieIds]
  );

  // ── Filtrer + trier les annonces publiques ──
  const annoncesFiltrees = useMemo(() => {
    let r = [...annonces];
    if (searchTerm) {
      const s = searchTerm.toLowerCase();
      r = r.filter(a =>
        a.titre.toLowerCase().includes(s) ||
        a.types_avion?.nom.toLowerCase().includes(s) ||
        a.vendeur?.identifiant.toLowerCase().includes(s) ||
        a.compagnie_vendeur?.nom.toLowerCase().includes(s)
      );
    }
    if (filterEtat) r = r.filter(a => a.etat === filterEtat);
    if (filterType) r = r.filter(a => a.types_avion?.id === filterType);
    r = r.filter(a => a.prix >= prixMin && a.prix <= prixMax);
    switch (sortBy) {
      case 'prix_asc':  r.sort((a, b) => a.prix - b.prix); break;
      case 'prix_desc': r.sort((a, b) => b.prix - a.prix); break;
      case 'date_desc': r.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()); break;
      case 'etat_asc': {
        const order: Record<string, number> = { neuf: 0, excellent: 1, bon: 2, correct: 3, 'usé': 4 };
        r.sort((a, b) => (order[a.etat] ?? 9) - (order[b.etat] ?? 9)); break;
      }
    }
    return r;
  }, [annonces, searchTerm, filterEtat, filterType, prixMin, prixMax, sortBy]);

  const hasActiveFilters = filterEtat || filterType || searchTerm ||
    (prixMin > globalMin) || (prixMax < globalMax) || sortBy !== 'date_desc';

  function clearFilters() {
    setSearchTerm(''); setFilterEtat(null); setFilterType(null);
    setPrixMin(globalMin); setPrixMax(globalMax); setSortBy('date_desc');
  }

  const mesAvionsDisponibles = inventaire.filter(a => a.disponible);

  // ─────────────────── Handlers ───────────────────

  async function handleVendre() {
    setError(''); setLoading(true);
    try {
      const body: Record<string, unknown> = { action: 'creer', titre, description: description || null, prix: parseInt(prix), etat };
      if (typeVente === 'flotte' && selectedFlotteAvionId) {
        body.compagnie_avion_id = selectedFlotteAvionId; body.vente_pdg_seulement = ventePdgSeulement;
      } else { body.inventaire_avion_id = selectedAvion || undefined; }
      const res = await fetch('/api/hangar-market', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Erreur');
      setSuccess('Annonce créée !'); setShowVendreModal(false); resetVendreForm();
      startTransition(() => router.refresh());
    } catch (err) { setError(err instanceof Error ? err.message : 'Erreur'); }
    finally { setLoading(false); }
  }

  async function handleAcheter() {
    if (!selectedAnnonce) return;
    setError(''); setLoading(true);
    try {
      const res = await fetch('/api/hangar-market', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'acheter', annonce_id: selectedAnnonce.id, pour_compagnie_id: acheterPour || undefined }) });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Erreur');
      setSuccess(data.message || 'Achat effectué !'); setShowAchatModal(false); setSelectedAnnonce(null); setAcheterPour(null);
      startTransition(() => router.refresh());
    } catch (err) { setError(err instanceof Error ? err.message : 'Erreur'); }
    finally { setLoading(false); }
  }

  async function handleAnnuler(annonceId: string) {
    if (!confirm('Annuler cette annonce ?')) return;
    setLoading(true);
    try {
      const res = await fetch(`/api/hangar-market?id=${annonceId}`, { method: 'DELETE' });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Erreur');
      setSuccess('Annonce annulée'); startTransition(() => router.refresh());
    } catch (err) { setError(err instanceof Error ? err.message : 'Erreur'); }
    finally { setLoading(false); }
  }

  async function handleRevente() {
    setError(''); setLoading(true);
    try {
      const bodyData: Record<string, unknown> = { action: reventeMode === 'rapide' ? 'revente_directe' : 'demande_revente' };
      if (reventeType === 'flotte') bodyData.compagnie_avion_id = reventeAvionId;
      else bodyData.inventaire_avion_id = reventeAvionId;
      const res = await fetch('/api/hangar-market/revente', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(bodyData) });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Erreur');
      setSuccess(data.message || 'Demande envoyée'); setShowReventeModal(false); setReventeAvionId('');
      startTransition(() => router.refresh());
    } catch (err) { setError(err instanceof Error ? err.message : 'Erreur'); }
    finally { setLoading(false); }
  }

  function openReventeModal(type: 'personnel' | 'flotte', avionId?: string) {
    setReventeType(type); setReventeAvionId(avionId || '');
    setReventeMode(reventesRapideRestantes > 0 ? 'rapide' : 'demande');
    setShowReventeModal(true);
  }

  function resetVendreForm() {
    setTypeVente('personnel'); setSelectedAvion(''); setSelectedFlotteAvionId('');
    setVentePdgSeulement(false); setTitre(''); setDescription(''); setPrix(''); setEtat('bon');
  }

  function openVendreModal(mode: 'personnel' | 'flotte', flotteAvionId?: string) {
    setTypeVente(mode); setSelectedAvion('');
    const fid = flotteAvionId || ''; setSelectedFlotteAvionId(fid); setVentePdgSeulement(false);
    const av = fid ? flotteDisponible.find(a => a.id === fid) : null;
    setTitre(av ? `${av.immatriculation} - ${av.type_avion.nom}` : '');
    setDescription(''); setPrix(''); setEtat('bon'); setShowVendreModal(true);
  }

  function openAchatModal(annonce: Annonce) {
    setSelectedAnnonce(annonce);
    const isFlotte = !!annonce.compagnie_avion_id;
    const firstCompagnie = isFlotte && compagnies.length > 0 ? compagnies[0].id : null;
    setAcheterPour(isFlotte ? firstCompagnie : null);
    setShowAchatModal(true);
  }

  const canBuyPersonal = (p: number) => soldePerso >= p * (1 + taxePourcent / 100);
  const canBuyForCompagnie = (p: number, c: Compagnie) => c.solde >= p * (1 + taxePourcent / 100);

  // ─────────────────── RENDER ───────────────────

  return (
    <div className="space-y-6">
      {/* Messages flash */}
      {error && (
        <div className="p-4 bg-red-500/10 border border-red-500/30 rounded-lg flex items-center gap-3 text-red-300">
          <AlertCircle className="h-5 w-5 shrink-0" />
          <p className="flex-1">{error}</p>
          <button onClick={() => setError('')}><X className="h-4 w-4" /></button>
        </div>
      )}
      {success && (
        <div className="p-4 bg-green-500/10 border border-green-500/30 rounded-lg flex items-center gap-3 text-green-300">
          <Check className="h-5 w-5 shrink-0" />
          <p className="flex-1">{success}</p>
          <button onClick={() => setSuccess('')}><X className="h-4 w-4" /></button>
        </div>
      )}

      {/* ── Tabs ── */}
      <div className="flex gap-2 flex-wrap">
        {([ 
          { key: 'acheter', label: 'Acheter', icon: <ShoppingCart className="h-4 w-4" />, count: annonces.length },
          { key: 'vendre',  label: 'Vendre',  icon: <Tag className="h-4 w-4" /> },
          { key: 'mes-annonces', label: 'Mes annonces', icon: <User className="h-4 w-4" />, count: mesAnnonces.length },
        ] as const).map(tab => (
          <button
            key={tab.key}
            onClick={() => setActiveTab(tab.key)}
            className={`px-4 py-2 rounded-lg font-medium transition-colors flex items-center gap-2 ${
              activeTab === tab.key ? 'bg-amber-600 text-white shadow-lg shadow-amber-500/20' : 'bg-slate-700/70 text-slate-300 hover:bg-slate-600'
            }`}
          >
            {tab.icon}
            {tab.label}
            {'count' in tab && tab.count !== undefined && tab.count > 0 && (
              <span className={`text-xs px-1.5 py-0.5 rounded-full ${
                activeTab === tab.key ? 'bg-white/20 text-white' : 'bg-slate-600 text-slate-300'
              }`}>{tab.count}</span>
            )}
          </button>
        ))}
      </div>

      {/* ════════════════ ACHETER ════════════════ */}
      {activeTab === 'acheter' && (
        <>
          {/* Barre de recherche + toggle filtres */}
          <div className="flex gap-2">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-5 w-5 text-slate-400" />
              <input
                type="text"
                placeholder="Rechercher un avion, vendeur..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full pl-10 pr-4 py-2 bg-slate-800 border border-slate-700 rounded-lg text-slate-200 placeholder-slate-500 focus:outline-none focus:ring-1 focus:ring-amber-500/50"
              />
            </div>
            <button
              onClick={() => setShowFilters(v => !v)}
              className={`px-3 py-2 rounded-lg border text-sm font-medium flex items-center gap-1.5 transition-colors ${
                showFilters || hasActiveFilters
                  ? 'bg-amber-500/20 text-amber-300 border-amber-500/40'
                  : 'bg-slate-800 text-slate-400 border-slate-700 hover:text-slate-200'
              }`}
            >
              <Filter className="h-4 w-4" />
              Filtres
              {showFilters ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
            </button>
            {hasActiveFilters && (
              <button onClick={clearFilters} className="px-3 py-2 rounded-lg text-xs text-slate-400 hover:text-slate-200 border border-slate-700 bg-slate-800">
                <X className="h-4 w-4" />
              </button>
            )}
          </div>

          {/* Panneau filtres */}
          {showFilters && (
            <div className="p-4 rounded-xl bg-slate-900/60 border border-slate-700/50 space-y-4 animate-in fade-in slide-in-from-top-2 duration-200">
              {/* Type d'avion */}
              {typesPresents.length > 0 && (
                <div>
                  <p className="text-xs text-slate-500 uppercase tracking-wide mb-2">Type d&apos;avion</p>
                  <div className="flex flex-wrap gap-1.5">
                    {typesPresents.map(t => (
                      <button
                        key={t.id}
                        onClick={() => setFilterType(filterType === t.id ? null : t.id)}
                        className={`px-2.5 py-1 rounded-full text-xs font-medium transition-all ${
                          filterType === t.id
                            ? 'bg-amber-500/25 text-amber-300 ring-1 ring-amber-500/50 scale-105'
                            : 'bg-slate-800 text-slate-400 hover:text-slate-200'
                        }`}
                      >
                        {t.nom}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {/* État */}
              <div>
                <p className="text-xs text-slate-500 uppercase tracking-wide mb-2">État</p>
                <div className="flex flex-wrap gap-1.5">
                  {ETATS.map(e => (
                    <button
                      key={e.value}
                      onClick={() => setFilterEtat(filterEtat === e.value ? null : e.value)}
                      className={`px-2.5 py-1 rounded-full text-xs font-medium transition-all ${
                        filterEtat === e.value
                          ? `${e.color} ring-1 ring-current bg-current/10 scale-105`
                          : 'bg-slate-800 text-slate-400 hover:text-slate-200'
                      }`}
                    >
                      {e.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Plage de prix */}
              {globalMax > globalMin && (
                <div>
                  <p className="text-xs text-slate-500 uppercase tracking-wide mb-2">Fourchette de prix</p>
                  <div className="space-y-1.5">
                    <div className="flex justify-between text-xs text-slate-400 tabular-nums">
                      <span className="text-emerald-300 font-semibold">{prixMin.toLocaleString('fr-FR')} F$</span>
                      <span className="text-amber-300 font-semibold">{prixMax.toLocaleString('fr-FR')} F$</span>
                    </div>
                    <div className="relative h-5 flex items-center">
                      <div className="absolute w-full h-1.5 rounded-full bg-slate-700/60" />
                      <div
                        className="absolute h-1.5 rounded-full bg-gradient-to-r from-emerald-400 to-amber-400"
                        style={{
                          left: `${globalMax > globalMin ? ((prixMin - globalMin) / (globalMax - globalMin)) * 100 : 0}%`,
                          right: `${globalMax > globalMin ? (1 - (prixMax - globalMin) / (globalMax - globalMin)) * 100 : 0}%`,
                        }}
                      />
                      <input type="range" min={globalMin} max={globalMax} value={prixMin}
                        step={Math.max(1, Math.floor((globalMax - globalMin) / 100))}
                        onChange={(e) => { const v = +e.target.value; if (v < prixMax) setPrixMin(v); }}
                        className="absolute w-full h-1.5 opacity-0 cursor-pointer" style={{ zIndex: 3 }} />
                      <input type="range" min={globalMin} max={globalMax} value={prixMax}
                        step={Math.max(1, Math.floor((globalMax - globalMin) / 100))}
                        onChange={(e) => { const v = +e.target.value; if (v > prixMin) setPrixMax(v); }}
                        className="absolute w-full h-1.5 opacity-0 cursor-pointer" style={{ zIndex: 4 }} />
                    </div>
                  </div>
                </div>
              )}

              {/* Tri */}
              <div className="flex items-center gap-2">
                <ArrowDownUp className="h-4 w-4 text-slate-500" />
                <span className="text-xs text-slate-500">Trier par</span>
                <div className="flex gap-1 flex-wrap">
                  {SORT_OPTS.map(o => (
                    <button key={o.value} onClick={() => setSortBy(o.value)}
                      className={`px-2 py-0.5 rounded text-xs font-medium transition-colors ${
                        sortBy === o.value ? 'bg-amber-500/25 text-amber-300' : 'bg-slate-800 text-slate-400 hover:text-slate-200'
                      }`}>{o.label}</button>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* Liste annonces */}
          {annoncesFiltrees.length === 0 ? (
            <div className="text-center py-16 card">
              <div className="inline-flex h-20 w-20 items-center justify-center rounded-full bg-slate-800/60 ring-1 ring-slate-700/60 mb-4">
                <Plane className="h-10 w-10 text-slate-600" />
              </div>
              <p className="text-slate-300 font-semibold text-lg">Aucune annonce disponible</p>
              <p className="text-sm text-slate-500 mt-1">
                {hasActiveFilters ? 'Essayez de modifier vos filtres.' : 'Revenez plus tard !'}
              </p>
              {hasActiveFilters && (
                <button onClick={clearFilters} className="mt-4 inline-flex items-center gap-1.5 text-sm text-amber-300 hover:text-amber-200 px-4 py-2 rounded-lg bg-amber-500/10 hover:bg-amber-500/20 transition-colors ring-1 ring-amber-500/30">
                  <X className="h-4 w-4" /> Réinitialiser les filtres
                </button>
              )}
            </div>
          ) : (
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
              {annoncesFiltrees.map((annonce) => {
                const isMine = annonce.vendeur_id === userId || (annonce.compagnie_vendeur_id && mesCompagnieIds.has(annonce.compagnie_vendeur_id));
                const prixTotal = Math.round(annonce.prix * (1 + taxePourcent / 100));
                const etatInfo = ETATS.find(e => e.value === annonce.etat);
                const canBuy = !annonce.compagnie_avion_id
                  ? canBuyPersonal(annonce.prix) || compagnies.some(c => canBuyForCompagnie(annonce.prix, c))
                  : compagnies.filter(c => c.id !== annonce.compagnie_vendeur_id).some(c => canBuyForCompagnie(annonce.prix, c));

                return (
                  <div key={annonce.id} className={`card group hover:border-amber-500/60 hover:-translate-y-0.5 hover:shadow-lg hover:shadow-amber-500/10 transition-all duration-200 overflow-hidden ${isMine ? 'border-sky-500/30' : ''}`}>
                    {/* Bande état */}
                    <div className={`h-1 w-full mb-3 -mt-4 -mx-4 ${
                      etatInfo?.value === 'neuf' ? 'bg-green-500/60' :
                      etatInfo?.value === 'excellent' ? 'bg-emerald-500/60' :
                      etatInfo?.value === 'bon' ? 'bg-blue-500/60' :
                      etatInfo?.value === 'correct' ? 'bg-yellow-500/60' :
                      'bg-orange-500/60'
                    }`} style={{ width: 'calc(100% + 2rem)', marginLeft: '-1rem' }} />

                    {/* Header carte */}
                    <div className="flex items-start justify-between mb-2 gap-2">
                      <div className="min-w-0 flex-1">
                        <h3 className="font-semibold text-slate-100 truncate">{annonce.titre}</h3>
                        <p className="text-xs text-slate-400 mt-0.5">
                          {annonce.types_avion?.nom}
                          {annonce.types_avion?.code_oaci && (
                            <span className="ml-1 font-mono text-slate-500">({annonce.types_avion.code_oaci})</span>
                          )}
                        </p>
                      </div>
                      <div className="flex flex-col items-end gap-1 shrink-0">
                        {etatInfo && (
                          <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded-full ring-1 ${etatInfo.color} ${etatInfo.bg}`}>
                            {etatInfo.label}
                          </span>
                        )}
                        {annonce.compagnie_avion_id && (
                          <span className="text-[10px] text-sky-400 bg-sky-500/10 px-1.5 py-0.5 rounded-full ring-1 ring-sky-500/25">Flotte</span>
                        )}
                        {isMine && (
                          <span className="text-[10px] text-slate-400 bg-slate-700/60 px-1.5 py-0.5 rounded-full">Ma liste</span>
                        )}
                      </div>
                    </div>

                    {/* Barre usure */}
                    <div className="mb-3">
                      <UsureBar etat={annonce.etat} />
                    </div>

                    {/* Capacités */}
                    {(annonce.types_avion?.capacite_pax || annonce.types_avion?.capacite_cargo_kg) && (
                      <div className="flex gap-3 mb-3">
                        {(annonce.types_avion?.capacite_pax ?? 0) > 0 && (
                          <div className="flex items-center gap-1 text-xs text-slate-400">
                            <Users className="h-3.5 w-3.5 text-sky-400/70" />
                            {annonce.types_avion!.capacite_pax} pax
                          </div>
                        )}
                        {(annonce.types_avion?.capacite_cargo_kg ?? 0) > 0 && (
                          <div className="flex items-center gap-1 text-xs text-slate-400">
                            <Weight className="h-3.5 w-3.5 text-amber-400/70" />
                            {annonce.types_avion!.capacite_cargo_kg.toLocaleString('fr-FR')} kg
                          </div>
                        )}
                      </div>
                    )}

                    {annonce.description && (
                      <p className="text-xs text-slate-400 mb-3 line-clamp-2">{annonce.description}</p>
                    )}

                    {/* Vendeur */}
                    <div className="flex items-center gap-1.5 text-xs text-slate-500 mb-3">
                      {annonce.compagnie_vendeur ? (
                        <><Building2 className="h-3.5 w-3.5" /><span>{annonce.compagnie_vendeur.nom}</span></>
                      ) : (
                        <><User className="h-3.5 w-3.5" /><span>{annonce.vendeur?.identifiant || 'Anonyme'}</span></>
                      )}
                      <span className="text-slate-600">·</span>
                      <Clock className="h-3 w-3" />
                      <span>{new Date(annonce.created_at).toLocaleDateString('fr-FR')}</span>
                    </div>

                    {/* Prix + actions */}
                    <div className="flex items-end justify-between gap-2 pt-2 border-t border-slate-700/40">
                      <div>
                        <p className={`text-2xl font-bold tabular-nums leading-none ${canBuy ? 'text-amber-300' : 'text-slate-400'}`}>
                          {prixTotal.toLocaleString('fr-FR')}
                        </p>
                        <p className="text-[10px] text-slate-500 mt-0.5">
                          F$ (dont {Math.round(annonce.prix * taxePourcent / 100).toLocaleString('fr-FR')} F$ taxe)
                        </p>
                      </div>
                      <div className="flex gap-2">
                        {isMine ? (
                          <button
                            onClick={() => handleAnnuler(annonce.id)}
                            disabled={loading}
                            className="px-3 py-1.5 bg-red-600/80 hover:bg-red-600 text-white rounded-lg text-xs font-medium transition-colors flex items-center gap-1.5"
                          >
                            <Trash2 className="h-3.5 w-3.5" /> Retirer
                          </button>
                        ) : (
                          <button
                            onClick={() => openAchatModal(annonce)}
                            disabled={!canBuy}
                            className={`px-4 py-2 rounded-lg text-sm font-semibold transition-all flex items-center gap-1.5 shadow-lg ${
                              canBuy
                                ? 'bg-amber-600 hover:bg-amber-500 text-white shadow-amber-500/20 hover:shadow-amber-500/40'
                                : 'bg-slate-700 text-slate-500 cursor-not-allowed shadow-none'
                            }`}
                          >
                            <ShoppingCart className="h-4 w-4" />
                            {canBuy ? 'Acheter' : 'Solde insuf.'}
                          </button>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </>
      )}

      {/* ════════════════ VENDRE ════════════════ */}
      {activeTab === 'vendre' && (
        <div className="space-y-6">
          <div className="flex flex-wrap gap-2">
            <button
              onClick={() => openVendreModal('personnel')}
              className="px-4 py-2 bg-amber-600 hover:bg-amber-500 text-white rounded-lg font-medium transition-colors flex items-center gap-2 shadow-lg shadow-amber-500/20"
            >
              <Plus className="h-5 w-5" /> Vendre un avion personnel
            </button>
            {isPdg && flotteDisponible.length > 0 && (
              <button
                onClick={() => openVendreModal('flotte')}
                className="px-4 py-2 bg-sky-600 hover:bg-sky-500 text-white rounded-lg font-medium transition-colors flex items-center gap-2 shadow-lg shadow-sky-500/20"
              >
                <Building2 className="h-5 w-5" /> Vendre un avion de flotte
              </button>
            )}
          </div>

          {/* Revente rapide (50%) */}
          <div className="card border-emerald-500/30 bg-emerald-500/5">
            <div className="flex items-start gap-3 mb-3">
              <div className="h-10 w-10 rounded-xl bg-emerald-500/20 ring-1 ring-emerald-500/40 flex items-center justify-center shrink-0">
                <Zap className="h-5 w-5 text-emerald-400" />
              </div>
              <div>
                <h3 className="text-base font-semibold text-slate-100 flex items-center gap-2">
                  Revente rapide
                  <span className="text-xs font-normal px-2 py-0.5 rounded-full bg-emerald-500/15 text-emerald-400 ring-1 ring-emerald-500/30">
                    50% du prix d&apos;achat
                  </span>
                </h3>
                <p className="text-sm text-slate-400 mt-0.5">
                  Transaction immédiate · pas d&apos;approbation requise · {reventesRapideRestantes}/{LIMITE_RAPIDE} restantes cette semaine
                </p>
              </div>
            </div>
            <div className="flex flex-wrap gap-2">
              {mesAvionsDisponibles.length > 0 && (
                <button onClick={() => openReventeModal('personnel')} className="px-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg font-medium transition-colors flex items-center gap-2">
                  <TrendingDown className="h-4 w-4" /> Revendre un avion personnel
                </button>
              )}
              {isPdg && flotteDisponible.length > 0 && (
                <button onClick={() => openReventeModal('flotte')} className="px-4 py-2 bg-emerald-600/80 hover:bg-emerald-600 text-white rounded-lg font-medium transition-colors flex items-center gap-2">
                  <Building2 className="h-4 w-4" /> Revendre un avion de flotte
                </button>
              )}
            </div>
          </div>

          {/* Avions de flotte (PDG) */}
          {isPdg && flotteDisponible.length > 0 && (
            <div className="card border-sky-500/20">
              <h3 className="text-base font-semibold text-slate-100 mb-4 flex items-center gap-2">
                <Building2 className="h-5 w-5 text-sky-400" /> Avions de flotte disponibles
                <span className="text-xs font-normal text-slate-500">({flotteDisponible.length})</span>
              </h3>
              <div className="space-y-2">
                {flotteDisponible.map(av => (
                  <div key={av.id} className="flex items-center gap-3 p-3 bg-slate-800/60 rounded-xl hover:bg-slate-800 transition-colors group">
                    <div className="h-9 w-9 rounded-lg bg-slate-700/60 flex items-center justify-center shrink-0">
                      <Plane className="h-4.5 w-4.5 text-slate-400 group-hover:text-sky-400 transition-colors" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-slate-200 font-mono font-semibold text-sm">{av.immatriculation}</p>
                      <p className="text-xs text-slate-500 truncate">
                        {av.type_avion.nom} · {av.compagnie_nom} · {av.aeroport_actuel}
                      </p>
                      <div className="mt-1 w-24">
                        <div className="h-1 rounded-full bg-slate-700/60 overflow-hidden">
                          <div className={`h-full rounded-full ${av.usure_percent < 30 ? 'bg-green-400' : av.usure_percent < 60 ? 'bg-yellow-400' : 'bg-orange-400'}`} style={{ width: `${av.usure_percent}%` }} />
                        </div>
                        <p className="text-[10px] text-slate-500 mt-0.5">{av.usure_percent}% usure</p>
                      </div>
                    </div>
                    <div className="flex gap-2 shrink-0">
                      <button onClick={() => openReventeModal('flotte', av.id)} className="px-2.5 py-1.5 text-xs text-emerald-400 hover:text-emerald-300 bg-emerald-500/10 hover:bg-emerald-500/20 rounded-lg transition-colors flex items-center gap-1">
                        <Zap className="h-3 w-3" /> Revente 50%
                      </button>
                      <button onClick={() => openVendreModal('flotte', av.id)} className="px-2.5 py-1.5 text-xs text-sky-400 hover:text-sky-300 bg-sky-500/10 hover:bg-sky-500/20 rounded-lg transition-colors flex items-center gap-1">
                        <Tag className="h-3 w-3" /> Mettre en vente
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Mes avions personnels */}
          <div className="card">
            <h3 className="text-base font-semibold text-slate-100 mb-4 flex items-center gap-2">
              <User className="h-5 w-5 text-slate-400" /> Mes avions personnels
              <span className="text-xs font-normal text-slate-500">({inventaire.length})</span>
            </h3>
            {inventaire.length === 0 ? (
              <div className="text-center py-8">
                <Plane className="h-10 w-10 text-slate-600 mx-auto mb-2" />
                <p className="text-slate-400">Aucun avion dans votre inventaire</p>
              </div>
            ) : (
              <div className="space-y-2">
                {inventaire.map(item => (
                  <div key={item.id} className={`flex items-center gap-3 p-3 rounded-xl transition-colors group ${item.disponible ? 'bg-slate-800/60 hover:bg-slate-800' : 'bg-slate-800/30 opacity-60'}`}>
                    <div className="h-9 w-9 rounded-lg bg-slate-700/60 flex items-center justify-center shrink-0">
                      <Plane className="h-4.5 w-4.5 text-slate-400" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-slate-200 font-medium text-sm truncate">
                        {item.nom_personnalise || item.types_avion?.nom}
                      </p>
                      <div className="flex items-center gap-2 text-xs text-slate-500">
                        {item.immatriculation && <span className="font-mono font-bold text-sky-400">{item.immatriculation}</span>}
                        {item.types_avion?.code_oaci && <span>{item.types_avion.code_oaci}</span>}
                        <span className={`font-medium ${item.en_vol ? 'text-orange-400' : item.en_vente ? 'text-amber-400' : 'text-green-400'}`}>
                          {item.en_vol ? '✈ En vol' : item.en_vente ? '🏷 En vente' : '✓ Disponible'}
                        </span>
                      </div>
                      {item.prixRevente > 0 && (
                        <p className="text-[10px] text-slate-500 mt-0.5">
                          Valeur revente : <span className="text-amber-400">{item.prixRevente.toLocaleString('fr-FR')} F$</span>
                        </p>
                      )}
                    </div>
                    {item.disponible && (
                      <div className="flex gap-2 shrink-0">
                        <button
                          onClick={() => openReventeModal('personnel', item.id)}
                          className="px-2.5 py-1.5 text-xs text-emerald-400 hover:text-emerald-300 bg-emerald-500/10 hover:bg-emerald-500/20 rounded-lg transition-colors flex items-center gap-1"
                        >
                          <Zap className="h-3 w-3" />
                          {Math.round(item.prixAchat * 0.5).toLocaleString('fr-FR')} F$
                        </button>
                        <button
                          onClick={() => { setSelectedAvion(item.id); openVendreModal('personnel'); }}
                          className="px-2.5 py-1.5 text-xs text-amber-400 hover:text-amber-300 bg-amber-500/10 hover:bg-amber-500/20 rounded-lg transition-colors flex items-center gap-1"
                        >
                          <Tag className="h-3 w-3" /> Vendre
                        </button>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* ════════════════ MES ANNONCES ════════════════ */}
      {activeTab === 'mes-annonces' && (
        <div className="space-y-4">
          {mesAnnonces.length === 0 ? (
            <div className="text-center py-16 card">
              <div className="inline-flex h-20 w-20 items-center justify-center rounded-full bg-slate-800/60 ring-1 ring-slate-700/60 mb-4">
                <Tag className="h-10 w-10 text-slate-600" />
              </div>
              <p className="text-slate-300 font-semibold text-lg">Aucune annonce active</p>
              <p className="text-sm text-slate-500 mt-1">Vos annonces en cours apparaîtront ici.</p>
              <button onClick={() => setActiveTab('vendre')} className="mt-4 inline-flex items-center gap-1.5 text-sm text-amber-300 hover:text-amber-200 px-4 py-2 rounded-lg bg-amber-500/10 hover:bg-amber-500/20 transition-colors ring-1 ring-amber-500/30">
                <Plus className="h-4 w-4" /> Créer une annonce
              </button>
            </div>
          ) : (
            <div className="grid gap-4 md:grid-cols-2">
              {mesAnnonces.map(annonce => {
                const etatInfo = ETATS.find(e => e.value === annonce.etat);
                const prixTotal = Math.round(annonce.prix * (1 + taxePourcent / 100));
                return (
                  <div key={annonce.id} className="card border-sky-500/25 hover:border-sky-500/50 transition-colors">
                    <div className="flex items-start justify-between mb-3">
                      <div>
                        <h3 className="font-semibold text-slate-100">{annonce.titre}</h3>
                        <p className="text-xs text-slate-400 mt-0.5">{annonce.types_avion?.nom}</p>
                      </div>
                      <div className="flex flex-col items-end gap-1">
                        {etatInfo && (
                          <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded-full ring-1 ${etatInfo.color} ${etatInfo.bg}`}>{etatInfo.label}</span>
                        )}
                        <span className="text-[10px] text-slate-400">{new Date(annonce.created_at).toLocaleDateString('fr-FR')}</span>
                      </div>
                    </div>
                    <UsureBar etat={annonce.etat} />
                    <div className="flex items-center justify-between mt-3 pt-3 border-t border-slate-700/40">
                      <div>
                        <p className="text-xl font-bold tabular-nums text-amber-300">{prixTotal.toLocaleString('fr-FR')} F$</p>
                        <p className="text-[10px] text-slate-500">dont {Math.round(annonce.prix * taxePourcent / 100).toLocaleString('fr-FR')} F$ de taxe</p>
                      </div>
                      <button
                        onClick={() => handleAnnuler(annonce.id)}
                        disabled={loading}
                        className="px-3 py-1.5 bg-red-600/70 hover:bg-red-600 text-white rounded-lg text-xs font-medium transition-colors flex items-center gap-1.5"
                      >
                        <Trash2 className="h-3.5 w-3.5" /> Retirer l&apos;annonce
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* ════════════════ MODALS ════════════════ */}

      {/* Modal Vendre */}
      {showVendreModal && mounted && createPortal(
        <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4" onClick={e => { if (e.target === e.currentTarget) { setShowVendreModal(false); resetVendreForm(); setError(''); } }}>
          <div className="bg-slate-800 rounded-2xl border border-slate-700 p-6 max-w-lg w-full max-h-[90dvh] overflow-y-auto shadow-2xl">
            <div className="flex items-center justify-between mb-5">
              <h3 className="text-lg font-semibold text-slate-100 flex items-center gap-2">
                <Tag className="h-5 w-5 text-amber-400" />
                {typeVente === 'flotte' ? 'Vendre un avion de flotte' : 'Créer une annonce'}
              </h3>
              <button onClick={() => { setShowVendreModal(false); resetVendreForm(); setError(''); }} className="text-slate-500 hover:text-slate-300">
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="space-y-4">
              {typeVente === 'flotte' ? (
                <>
                  <div>
                    <label className="text-sm text-slate-400 mb-1 block">Avion de la flotte</label>
                    <select value={selectedFlotteAvionId} onChange={(e) => { const id = e.target.value; setSelectedFlotteAvionId(id); const av = flotteDisponible.find(a => a.id === id); if (av && !titre) setTitre(`${av.immatriculation} - ${av.type_avion.nom}`); }}
                      className="w-full p-2.5 bg-slate-900 border border-slate-700 rounded-xl text-slate-200 focus:outline-none focus:ring-1 focus:ring-amber-500/50">
                      <option value="">Sélectionner un avion</option>
                      {flotteDisponible.map(av => (
                        <option key={av.id} value={av.id}>{av.immatriculation} — {av.type_avion.nom} ({av.compagnie_nom}) · {av.usure_percent}% usure</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="text-sm text-slate-400 mb-2 block">Visible par</label>
                    <div className="flex gap-4">
                      <label className="flex items-center gap-2 cursor-pointer">
                        <input type="radio" checked={!ventePdgSeulement} onChange={() => setVentePdgSeulement(false)} className="rounded" />
                        <span className="text-slate-200 text-sm">Tout le monde</span>
                      </label>
                      <label className="flex items-center gap-2 cursor-pointer">
                        <input type="radio" checked={ventePdgSeulement} onChange={() => setVentePdgSeulement(true)} className="rounded" />
                        <span className="text-slate-200 text-sm">PDG uniquement</span>
                      </label>
                    </div>
                  </div>
                </>
              ) : (
                <div>
                  <label className="text-sm text-slate-400 mb-1 block">Avion à vendre</label>
                  <select value={selectedAvion} onChange={(e) => { const avionId = e.target.value; setSelectedAvion(avionId); if (avionId) { const avion = mesAvionsDisponibles.find(a => a.id === avionId); const prixSuggere = avion?.prixRevente || 0; if (avion && !titre) setTitre(avion.nom_personnalise || avion.types_avion?.nom || ''); if (prixSuggere > 0) setPrix(prixSuggere.toString()); } }}
                    className="w-full p-2.5 bg-slate-900 border border-slate-700 rounded-xl text-slate-200 focus:outline-none focus:ring-1 focus:ring-amber-500/50">
                    <option value="">Sélectionner un avion</option>
                    {mesAvionsDisponibles.map(item => (
                      <option key={item.id} value={item.id}>{item.nom_personnalise || item.types_avion?.nom} ({item.types_avion?.code_oaci}) — Valeur : {item.prixRevente.toLocaleString('fr-FR')} F$</option>
                    ))}
                  </select>
                </div>
              )}

              <input type="text" placeholder="Titre de l'annonce" value={titre} onChange={e => setTitre(e.target.value)} className="w-full p-2.5 bg-slate-900 border border-slate-700 rounded-xl text-slate-200 placeholder-slate-500 focus:outline-none focus:ring-1 focus:ring-amber-500/50" />
              <textarea placeholder="Description (optionnel)" value={description} onChange={e => setDescription(e.target.value)} rows={2} className="w-full p-2.5 bg-slate-900 border border-slate-700 rounded-xl text-slate-200 placeholder-slate-500 resize-none focus:outline-none focus:ring-1 focus:ring-amber-500/50" />

              <div>
                <label className="text-sm text-slate-400 mb-1 block">Prix de vente (F$)</label>
                <input type="number" min="1" placeholder="Prix" value={prix} onChange={e => setPrix(e.target.value)} className="w-full p-2.5 bg-slate-900 border border-slate-700 rounded-xl text-slate-200 placeholder-slate-500 focus:outline-none focus:ring-1 focus:ring-amber-500/50" />
                {typeVente === 'personnel' && selectedAvion && (
                  <p className="text-xs text-amber-400/80 mt-1">💡 Prix suggéré prérempli à 50% du prix d&apos;achat initial.</p>
                )}
              </div>

              <div>
                <label className="text-sm text-slate-400 mb-1 block">État de l&apos;avion</label>
                <div className="grid grid-cols-5 gap-1.5">
                  {ETATS.map(e => (
                    <button key={e.value} onClick={() => setEtat(e.value)}
                      className={`p-2 rounded-xl text-xs font-medium border text-center transition-all ${etat === e.value ? `${e.color} ${e.bg} border-current` : 'border-slate-700 bg-slate-900 text-slate-400 hover:border-slate-600'}`}>
                      {e.label}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            {error && <div className="mt-4 p-3 bg-red-500/10 border border-red-500/30 rounded-xl text-red-300 text-sm">{error}</div>}

            <div className="flex gap-3 mt-6">
              <button onClick={handleVendre} disabled={loading || !titre || !prix || (typeVente === 'personnel' ? !selectedAvion : !selectedFlotteAvionId)}
                className="flex-1 px-4 py-2.5 bg-amber-600 hover:bg-amber-500 disabled:opacity-50 text-white rounded-xl font-medium transition-colors flex items-center justify-center gap-2">
                {loading ? <RefreshCw className="h-4 w-4 animate-spin" /> : <Tag className="h-4 w-4" />}
                Mettre en vente
              </button>
              <button onClick={() => { setShowVendreModal(false); resetVendreForm(); setError(''); }} className="px-4 py-2.5 bg-slate-700 hover:bg-slate-600 text-slate-200 rounded-xl font-medium">Annuler</button>
            </div>
          </div>
        </div>,
        document.body
      )}

      {/* Modal Revente rapide */}
      {showReventeModal && mounted && createPortal(
        <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4" onClick={e => { if (e.target === e.currentTarget) { setShowReventeModal(false); setError(''); } }}>
          <div className="bg-slate-800 rounded-2xl border border-slate-700 p-6 max-w-lg w-full max-h-[90dvh] overflow-y-auto shadow-2xl">
            <div className="flex items-center justify-between mb-5">
              <h3 className="text-lg font-semibold text-slate-100 flex items-center gap-2">
                <Zap className="h-5 w-5 text-emerald-400" /> Revente d&apos;avion
              </h3>
              <button onClick={() => { setShowReventeModal(false); setError(''); }} className="text-slate-500 hover:text-slate-300"><X className="h-5 w-5" /></button>
            </div>

            {/* Choix mode */}
            <div className="grid grid-cols-2 gap-2 mb-5">
              <button onClick={() => setReventeMode('rapide')} disabled={reventesRapideRestantes === 0}
                className={`p-3 rounded-xl border text-left transition-all ${reventeMode === 'rapide' ? 'border-emerald-500 bg-emerald-500/15' : reventesRapideRestantes === 0 ? 'border-slate-700 opacity-40 cursor-not-allowed' : 'border-slate-600 hover:border-slate-500'}`}>
                <div className="flex items-center gap-2 mb-1">
                  <Zap className="h-4 w-4 text-emerald-400" />
                  <p className="text-sm font-semibold text-slate-100">Revente rapide</p>
                </div>
                <p className="text-xs text-slate-400">Instantané · pas d&apos;approbation</p>
                <div className="mt-2 flex items-center gap-1">
                  {[...Array(LIMITE_RAPIDE)].map((_, i) => (
                    <span key={i} className={`w-2 h-2 rounded-full ${i < reventesRapidesUsees ? 'bg-slate-600' : 'bg-emerald-400'}`} />
                  ))}
                  <span className="text-[10px] text-slate-400 ml-1">{reventesRapideRestantes}/{LIMITE_RAPIDE} restante{reventesRapideRestantes > 1 ? 's' : ''}</span>
                </div>
              </button>
              <button onClick={() => setReventeMode('demande')}
                className={`p-3 rounded-xl border text-left transition-all ${reventeMode === 'demande' ? 'border-amber-500 bg-amber-500/15' : 'border-slate-600 hover:border-slate-500'}`}>
                <div className="flex items-center gap-2 mb-1">
                  <Clock className="h-4 w-4 text-amber-400" />
                  <p className="text-sm font-semibold text-slate-100">Demande admin</p>
                </div>
                <p className="text-xs text-slate-400">Validation requise · illimité</p>
              </button>
            </div>

            {/* Sélection avion */}
            <div className="mb-4">
              <label className="text-sm text-slate-400 mb-1 block">Avion à revendre</label>
              <select value={reventeAvionId} onChange={e => setReventeAvionId(e.target.value)}
                className="w-full p-2.5 bg-slate-900 border border-slate-700 rounded-xl text-slate-200 focus:outline-none focus:ring-1 focus:ring-emerald-500/50">
                <option value="">Sélectionner un avion</option>
                {reventeType === 'personnel'
                  ? mesAvionsDisponibles.map(item => (
                      <option key={item.id} value={item.id}>
                        {item.nom_personnalise || item.types_avion?.nom} — Revente : {Math.round(item.prixAchat * 0.5).toLocaleString('fr-FR')} F$
                      </option>
                    ))
                  : flotteDisponible.map(av => (
                      <option key={av.id} value={av.id}>
                        {av.immatriculation} — {av.type_avion.nom} ({av.compagnie_nom}) · {av.usure_percent}% usure
                      </option>
                    ))}
              </select>
            </div>

            {/* Montant calculé */}
            {reventeAvionId && reventeType === 'personnel' && (() => {
              const av = mesAvionsDisponibles.find(a => a.id === reventeAvionId);
              const montant = av ? Math.round(av.prixAchat * 0.5) : 0;
              return montant > 0 ? (
                <div className="p-4 bg-emerald-500/10 border border-emerald-500/25 rounded-xl mb-4">
                  <p className="text-xs text-slate-400 mb-1">Montant {reventeMode === 'rapide' ? 'reçu immédiatement' : 'si approuvé'} :</p>
                  <p className="text-3xl font-bold text-emerald-300 tabular-nums">{montant.toLocaleString('fr-FR')} F$</p>
                  <p className="text-xs text-slate-500 mt-0.5">50% de {av!.prixAchat.toLocaleString('fr-FR')} F$</p>
                </div>
              ) : null;
            })()}

            {error && <div className="mb-4 p-3 bg-red-500/10 border border-red-500/30 rounded-xl text-red-300 text-sm">{error}</div>}

            <div className="flex gap-3">
              <button onClick={handleRevente} disabled={loading || !reventeAvionId}
                className={`flex-1 px-4 py-2.5 disabled:opacity-50 text-white rounded-xl font-medium transition-colors flex items-center justify-center gap-2 shadow-lg ${reventeMode === 'rapide' ? 'bg-emerald-600 hover:bg-emerald-500 shadow-emerald-500/20' : 'bg-amber-600 hover:bg-amber-500 shadow-amber-500/20'}`}>
                {loading ? <RefreshCw className="h-4 w-4 animate-spin" /> : <Zap className="h-4 w-4" />}
                {reventeMode === 'rapide' ? 'Revendre maintenant' : 'Envoyer la demande'}
              </button>
              <button onClick={() => { setShowReventeModal(false); setError(''); }} className="px-4 py-2.5 bg-slate-700 hover:bg-slate-600 text-slate-200 rounded-xl font-medium">Annuler</button>
            </div>
          </div>
        </div>,
        document.body
      )}

      {/* Modal Achat */}
      {showAchatModal && selectedAnnonce && mounted && createPortal(
        <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4" onClick={e => { if (e.target === e.currentTarget) { setShowAchatModal(false); setSelectedAnnonce(null); setError(''); } }}>
          <div className="bg-slate-800 rounded-2xl border border-slate-700 p-6 max-w-md w-full max-h-[90dvh] overflow-y-auto shadow-2xl">
            <div className="flex items-center justify-between mb-5">
              <h3 className="text-lg font-semibold text-slate-100 flex items-center gap-2">
                <ShoppingCart className="h-5 w-5 text-amber-400" /> Confirmer l&apos;achat
              </h3>
              <button onClick={() => { setShowAchatModal(false); setSelectedAnnonce(null); setError(''); }} className="text-slate-500 hover:text-slate-300"><X className="h-5 w-5" /></button>
            </div>

            {/* Résumé */}
            <div className="p-4 bg-slate-900/60 border border-slate-700/50 rounded-xl mb-5">
              <p className="font-semibold text-slate-100 mb-1">{selectedAnnonce.titre}</p>
              <p className="text-sm text-slate-400">{selectedAnnonce.types_avion?.nom}</p>
              <div className="mt-3">
                <UsureBar etat={selectedAnnonce.etat} />
              </div>
              <div className="mt-3 flex items-end gap-2">
                <div>
                  <p className="text-3xl font-bold text-amber-300 tabular-nums">
                    {Math.round(selectedAnnonce.prix * (1 + taxePourcent / 100)).toLocaleString('fr-FR')}
                  </p>
                  <p className="text-xs text-slate-500 leading-tight">F$ total</p>
                </div>
                <p className="text-xs text-slate-500 mb-1">
                  Prix : {selectedAnnonce.prix.toLocaleString('fr-FR')} + Taxe {taxePourcent}% : {Math.round(selectedAnnonce.prix * taxePourcent / 100).toLocaleString('fr-FR')} F$
                </p>
              </div>
            </div>

            <p className="text-sm text-slate-400 mb-3">Choisissez le compte à débiter :</p>
            <div className="space-y-2 mb-5">
              {!selectedAnnonce.compagnie_avion_id && canBuyPersonal(selectedAnnonce.prix) && (
                <button onClick={() => setAcheterPour(null)}
                  className={`w-full flex items-center gap-3 p-3 rounded-xl border transition-colors ${acheterPour === null ? 'border-amber-500 bg-amber-500/20' : 'border-slate-600 hover:border-slate-500'}`}>
                  <User className="h-5 w-5 text-emerald-400" />
                  <div className="text-left flex-1">
                    <p className="text-slate-200 font-medium">Usage personnel</p>
                    <p className="text-sm text-slate-400">{soldePerso.toLocaleString('fr-FR')} F$</p>
                  </div>
                </button>
              )}
              {selectedAnnonce.compagnie_avion_id && (
                <p className="text-xs text-sky-400 mb-2">Avion de flotte : achat obligatoire via une compagnie dont vous êtes PDG.</p>
              )}
              {compagnies.filter(c => canBuyForCompagnie(selectedAnnonce.prix, c) && c.id !== selectedAnnonce.compagnie_vendeur_id).map(c => (
                <button key={c.id} onClick={() => setAcheterPour(c.id)}
                  className={`w-full flex items-center gap-3 p-3 rounded-xl border transition-colors ${acheterPour === c.id ? 'border-amber-500 bg-amber-500/20' : 'border-slate-600 hover:border-slate-500'}`}>
                  <Building2 className="h-5 w-5 text-sky-400" />
                  <div className="text-left flex-1">
                    <p className="text-slate-200 font-medium">{c.nom}</p>
                    <p className="text-sm text-slate-400">{c.solde.toLocaleString('fr-FR')} F$</p>
                  </div>
                </button>
              ))}
              {!selectedAnnonce.compagnie_avion_id && !canBuyPersonal(selectedAnnonce.prix) && compagnies.filter(c => canBuyForCompagnie(selectedAnnonce.prix, c)).length === 0 && (
                <p className="text-red-400 text-center py-3 text-sm">Solde insuffisant pour cet achat</p>
              )}
            </div>

            {error && <div className="mb-4 p-3 bg-red-500/10 border border-red-500/30 rounded-xl text-red-300 text-sm">{error}</div>}

            <div className="flex gap-3">
              <button onClick={handleAcheter}
                disabled={loading || (selectedAnnonce.compagnie_avion_id ? !acheterPour : !canBuyPersonal(selectedAnnonce.prix) && acheterPour === null)}
                className="flex-1 px-4 py-2.5 bg-amber-600 hover:bg-amber-500 disabled:opacity-50 text-white rounded-xl font-semibold transition-colors flex items-center justify-center gap-2 shadow-lg shadow-amber-500/20">
                {loading ? <RefreshCw className="h-4 w-4 animate-spin" /> : <ShoppingCart className="h-4 w-4" />}
                Confirmer l&apos;achat
              </button>
              <button onClick={() => { setShowAchatModal(false); setSelectedAnnonce(null); setError(''); }} className="px-4 py-2.5 bg-slate-700 hover:bg-slate-600 text-slate-200 rounded-xl font-medium">Annuler</button>
            </div>
          </div>
        </div>,
        document.body
      )}
    </div>
  );
}
