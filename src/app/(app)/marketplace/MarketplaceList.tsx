'use client';

import { useState, useMemo } from 'react';
import { Search, Plane, Users, Weight, Filter, X, Package, Shield, CheckCircle2,
  Sparkles, Ban, Clock, ChevronDown, ChevronUp, Star } from 'lucide-react';
import MarketplaceClient from './MarketplaceClient';

interface Avion {
  id: string;
  nom: string;
  constructeur: string | null;
  code_oaci: string | null;
  categorie: string | null;
  prix: number;
  capacite_pax: number;
  capacite_cargo_kg: number;
  est_militaire: boolean;
  est_cargo: boolean;
  rupture_fin_at?: string | null;
}

function formatRuptureCountdown(finAt: string): string {
  const ms = new Date(finAt).getTime() - Date.now();
  if (ms <= 0) return '';
  const h = Math.floor(ms / (60 * 60 * 1000));
  if (h >= 24) {
    const j = Math.floor(h / 24);
    const reste = h % 24;
    return reste > 0 ? `${j}j ${reste}h` : `${j}j`;
  }
  if (h >= 1) {
    const m = Math.floor((ms % (60 * 60 * 1000)) / (60 * 1000));
    return m > 0 ? `${h}h ${m}m` : `${h}h`;
  }
  const m = Math.floor(ms / (60 * 1000));
  return `${m}m`;
}

interface Compagnie {
  id: string;
  nom: string;
  solde: number;
}

interface Props {
  avions: Avion[];
  soldePerso: number;
  compagnies: Compagnie[];
  armeeCompte?: { id: string; solde: number } | null;
}

const CATEGORIES: Record<string, { label: string; color: string; emoji: string }> = {
  commercial: { label: 'Commercial', color: 'bg-sky-500/20 text-sky-400', emoji: '✈️' },
  cargo: { label: 'Cargo', color: 'bg-amber-500/20 text-amber-400', emoji: '📦' },
  leger: { label: 'Léger', color: 'bg-emerald-500/20 text-emerald-400', emoji: '🛩️' },
  helicoptere: { label: 'Hélicoptère', color: 'bg-purple-500/20 text-purple-400', emoji: '🚁' },
  amphibie: { label: 'Amphibie', color: 'bg-cyan-500/20 text-cyan-400', emoji: '🌊' },
  militaire: { label: 'Militaire', color: 'bg-red-500/20 text-red-400', emoji: '⚔️' },
  ravitailleur: { label: 'Ravitailleur', color: 'bg-orange-500/20 text-orange-400', emoji: '⛽' },
};

const SORT_OPTIONS = [
  { value: 'prix_asc', label: 'Prix croissant' },
  { value: 'prix_desc', label: 'Prix décroissant' },
  { value: 'nom', label: 'Nom A–Z' },
  { value: 'pax_desc', label: 'Capacité pax ↓' },
] as const;

type SortKey = typeof SORT_OPTIONS[number]['value'];

// Renvoie une valeur entre 0 et 100 pour simuler la capacité en % du range de prix
function prixPercent(prix: number, min: number, max: number): number {
  if (max <= min) return 100;
  return Math.round(((prix - min) / (max - min)) * 100);
}

export default function MarketplaceList({ avions, soldePerso, compagnies, armeeCompte = null }: Props) {
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedCategorie, setSelectedCategorie] = useState<string | null>(null);
  const [showOnlyAffordable, setShowOnlyAffordable] = useState(false);
  const [sortBy, setSortBy] = useState<SortKey>('prix_asc');
  const [showFilters, setShowFilters] = useState(false);

  // Plage de prix globale
  const globalPrixMin = useMemo(() => avions.length ? Math.min(...avions.map(a => a.prix)) : 0, [avions]);
  const globalPrixMax = useMemo(() => avions.length ? Math.max(...avions.map(a => a.prix)) : 0, [avions]);

  const [prixMin, setPrixMin] = useState(0);
  const [prixMax, setPrixMax] = useState(Infinity);

  // Initialiser les sliders avec les bornes réelles (une seule fois)
  useMemo(() => {
    if (globalPrixMax > 0 && prixMax === Infinity) {
      setPrixMax(globalPrixMax);
      setPrixMin(globalPrixMin);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [globalPrixMin, globalPrixMax]);

  const maxSolde = Math.max(soldePerso, ...compagnies.map(c => c.solde), armeeCompte?.solde || 0);

  const categoriesPresentes = useMemo(() => {
    const cats = new Set<string>();
    avions.forEach(a => { if (a.categorie) cats.add(a.categorie); });
    return Array.from(cats);
  }, [avions]);

  const avionsFiltres = useMemo(() => {
    let result = [...avions];

    if (searchTerm) {
      const search = searchTerm.toLowerCase();
      result = result.filter(a =>
        a.nom.toLowerCase().includes(search) ||
        a.constructeur?.toLowerCase().includes(search) ||
        a.code_oaci?.toLowerCase().includes(search) ||
        a.categorie?.toLowerCase().includes(search)
      );
    }
    if (selectedCategorie) result = result.filter(a => a.categorie === selectedCategorie);
    if (showOnlyAffordable) result = result.filter(a => a.prix <= maxSolde);
    result = result.filter(a => a.prix >= prixMin && a.prix <= prixMax);

    switch (sortBy) {
      case 'prix_asc': result.sort((a, b) => a.prix - b.prix); break;
      case 'prix_desc': result.sort((a, b) => b.prix - a.prix); break;
      case 'nom': result.sort((a, b) => a.nom.localeCompare(b.nom)); break;
      case 'pax_desc': result.sort((a, b) => b.capacite_pax - a.capacite_pax); break;
    }
    return result;
  }, [avions, searchTerm, selectedCategorie, showOnlyAffordable, sortBy, maxSolde, prixMin, prixMax]);

  function clearFilters() {
    setSearchTerm('');
    setSelectedCategorie(null);
    setShowOnlyAffordable(false);
    setSortBy('prix_asc');
    setPrixMin(globalPrixMin);
    setPrixMax(globalPrixMax);
  }

  const hasActiveFilters =
    searchTerm || selectedCategorie || showOnlyAffordable || sortBy !== 'prix_asc' ||
    prixMin > globalPrixMin || prixMax < globalPrixMax;

  const nbAffordable = useMemo(() => avions.filter(a => a.prix <= maxSolde).length, [avions, maxSolde]);
  const nbEnRupture = useMemo(() => {
    const now = Date.now();
    return avions.filter(a => a.rupture_fin_at && new Date(a.rupture_fin_at).getTime() > now).length;
  }, [avions]);

  return (
    <div className="card">
      {/* ── En-tête ── */}
      <div className="flex items-center justify-between mb-4 flex-wrap gap-3">
        <h2 className="text-lg font-semibold text-slate-100 flex items-center gap-2">
          <Plane className="h-5 w-5 text-purple-400" />
          Avions disponibles
          <span className="text-sm font-normal text-slate-500">
            ({avionsFiltres.length} / {avions.length})
          </span>
          {nbAffordable > 0 && (
            <span className="text-xs font-medium px-2 py-0.5 rounded-full bg-emerald-500/15 text-emerald-300 ring-1 ring-emerald-500/30 inline-flex items-center gap-1">
              <Sparkles className="h-3 w-3" />
              {nbAffordable} accessible{nbAffordable > 1 ? 's' : ''}
            </span>
          )}
          {nbEnRupture > 0 && (
            <span className="text-xs font-medium px-2 py-0.5 rounded-full bg-rose-500/15 text-rose-300 ring-1 ring-rose-500/30 inline-flex items-center gap-1">
              <Ban className="h-3 w-3" />
              {nbEnRupture} en rupture
            </span>
          )}
        </h2>
        <div className="flex items-center gap-2">
          {hasActiveFilters && (
            <button
              onClick={clearFilters}
              className="text-xs text-slate-400 hover:text-slate-200 flex items-center gap-1"
            >
              <X className="h-3 w-3" /> Effacer
            </button>
          )}
          <button
            onClick={() => setShowFilters(v => !v)}
            className={`flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-medium border transition-colors ${
              showFilters || hasActiveFilters
                ? 'bg-purple-500/20 text-purple-300 border-purple-500/40'
                : 'bg-slate-800/50 text-slate-400 border-slate-700/50 hover:text-slate-200'
            }`}
          >
            <Filter className="h-3.5 w-3.5" />
            Filtres
            {showFilters ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
          </button>
        </div>
      </div>

      {/* ── Barre de recherche ── */}
      <div className="relative mb-4">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-5 w-5 text-slate-500" />
        <input
          type="text"
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          placeholder="Rechercher par nom, constructeur, code OACI..."
          className="input w-full pl-10 pr-4"
        />
      </div>

      {/* ── Panneau filtres avancés ── */}
      {showFilters && (
        <div className="mb-6 p-4 rounded-xl bg-slate-900/50 border border-slate-700/40 space-y-4 animate-in fade-in slide-in-from-top-2 duration-200">
          {/* Catégories */}
          <div>
            <p className="text-xs text-slate-500 uppercase tracking-wide mb-2">Type d&apos;appareil</p>
            <div className="flex flex-wrap gap-1.5">
              {categoriesPresentes.map(cat => {
                const config = CATEGORIES[cat] || { label: cat, color: 'bg-slate-500/20 text-slate-400', emoji: '✈️' };
                const count = avions.filter(a => a.categorie === cat).length;
                return (
                  <button
                    key={cat}
                    onClick={() => setSelectedCategorie(selectedCategorie === cat ? null : cat)}
                    className={`px-2.5 py-1 rounded-full text-xs font-medium transition-all hover:-translate-y-0.5 flex items-center gap-1.5 ${
                      selectedCategorie === cat
                        ? config.color + ' ring-1 ring-current scale-105'
                        : 'bg-slate-800/50 text-slate-400 hover:text-slate-200'
                    }`}
                  >
                    <span>{config.emoji}</span>
                    {config.label}
                    <span className="text-[10px] opacity-70 tabular-nums">{count}</span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Slider de prix */}
          {globalPrixMax > globalPrixMin && (
            <div>
              <p className="text-xs text-slate-500 uppercase tracking-wide mb-2">Fourchette de prix</p>
              <div className="space-y-2">
                <div className="flex justify-between text-xs text-slate-400 tabular-nums">
                  <span className="text-emerald-300 font-semibold">{prixMin.toLocaleString('fr-FR')} F$</span>
                  <span className="text-purple-300 font-semibold">{prixMax.toLocaleString('fr-FR')} F$</span>
                </div>
                <div className="relative h-5 flex items-center">
                  {/* Track */}
                  <div className="absolute w-full h-1.5 rounded-full bg-slate-700/60" />
                  {/* Active range */}
                  <div
                    className="absolute h-1.5 rounded-full bg-gradient-to-r from-emerald-400 to-purple-400"
                    style={{
                      left: `${prixPercent(prixMin, globalPrixMin, globalPrixMax)}%`,
                      right: `${100 - prixPercent(prixMax, globalPrixMin, globalPrixMax)}%`,
                    }}
                  />
                  {/* Min thumb */}
                  <input
                    type="range"
                    min={globalPrixMin}
                    max={globalPrixMax}
                    step={Math.max(1, Math.floor((globalPrixMax - globalPrixMin) / 100))}
                    value={prixMin}
                    onChange={(e) => {
                      const v = parseInt(e.target.value);
                      if (v < prixMax) setPrixMin(v);
                    }}
                    className="absolute w-full h-1.5 opacity-0 cursor-pointer"
                    style={{ zIndex: prixMin > globalPrixMax - (globalPrixMax - globalPrixMin) * 0.1 ? 5 : 3 }}
                  />
                  {/* Max thumb */}
                  <input
                    type="range"
                    min={globalPrixMin}
                    max={globalPrixMax}
                    step={Math.max(1, Math.floor((globalPrixMax - globalPrixMin) / 100))}
                    value={prixMax}
                    onChange={(e) => {
                      const v = parseInt(e.target.value);
                      if (v > prixMin) setPrixMax(v);
                    }}
                    className="absolute w-full h-1.5 opacity-0 cursor-pointer"
                    style={{ zIndex: 4 }}
                  />
                </div>
                <div className="flex justify-between text-[10px] text-slate-600 tabular-nums">
                  <span>{globalPrixMin.toLocaleString('fr-FR')} F$</span>
                  <span>{globalPrixMax.toLocaleString('fr-FR')} F$</span>
                </div>
              </div>
            </div>
          )}

          {/* Tri + filtre abordable */}
          <div className="flex flex-wrap items-center gap-3">
            <div className="flex items-center gap-2">
              <label className="text-xs text-slate-500">Trier par</label>
              <select
                value={sortBy}
                onChange={(e) => setSortBy(e.target.value as SortKey)}
                className="bg-slate-800/70 border border-slate-700/50 rounded-lg px-2 py-1 text-xs text-slate-300 focus:outline-none focus:ring-1 focus:ring-purple-500/50"
              >
                {SORT_OPTIONS.map(o => (
                  <option key={o.value} value={o.value}>{o.label}</option>
                ))}
              </select>
            </div>
            <button
              onClick={() => setShowOnlyAffordable(!showOnlyAffordable)}
              className={`px-2.5 py-1 rounded-lg text-xs font-medium transition-all flex items-center gap-1.5 ${
                showOnlyAffordable
                  ? 'bg-emerald-500/20 text-emerald-400 ring-1 ring-emerald-500/50'
                  : 'bg-slate-800/50 text-slate-400 hover:text-slate-200'
              }`}
            >
              <Package className="h-3 w-3" />
              Abordables seulement
            </button>
          </div>
        </div>
      )}

      {/* ── Raccourcis de tri rapide (visible quand filtres fermés) ── */}
      {!showFilters && (
        <div className="flex flex-wrap gap-1.5 items-center mb-5">
          {SORT_OPTIONS.map(o => (
            <button
              key={o.value}
              onClick={() => setSortBy(o.value)}
              className={`px-2.5 py-1 rounded-full text-xs font-medium transition-all ${
                sortBy === o.value
                  ? 'bg-purple-500/20 text-purple-300 ring-1 ring-purple-500/40'
                  : 'bg-slate-800/50 text-slate-400 hover:text-slate-200'
              }`}
            >
              {o.label}
            </button>
          ))}
          <span className="text-slate-600 text-xs">|</span>
          <button
            onClick={() => setShowOnlyAffordable(!showOnlyAffordable)}
            className={`px-2.5 py-1 rounded-lg text-xs font-medium transition-all flex items-center gap-1 ${
              showOnlyAffordable
                ? 'bg-emerald-500/20 text-emerald-400 ring-1 ring-emerald-500/50'
                : 'bg-slate-800/50 text-slate-400 hover:text-slate-200'
            }`}
          >
            <Sparkles className="h-3 w-3" />
            Accessibles
          </button>
        </div>
      )}

      {/* ── Grille de cartes ── */}
      {avionsFiltres.length > 0 ? (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 stagger-enter">
          {avionsFiltres.map((avion) => {
            const catConfig = CATEGORIES[avion.categorie || ''] || { label: avion.categorie, color: 'bg-slate-500/20 text-slate-400', emoji: '✈️' };
            const affordable = avion.prix <= maxSolde;
            const ratio = maxSolde > 0 ? Math.min(1, maxSolde / avion.prix) : 0;
            const enRupture = !!avion.rupture_fin_at && new Date(avion.rupture_fin_at).getTime() > Date.now();

            return (
              <div
                key={avion.id}
                className={`group relative bg-slate-800/50 rounded-xl border transition-all duration-200 hover:-translate-y-1 hover:shadow-lg overflow-hidden ${
                  enRupture
                    ? 'border-rose-500/40 hover:border-rose-400/60 hover:shadow-rose-500/10 opacity-80 grayscale-[20%]'
                    : affordable
                      ? 'border-emerald-500/30 hover:border-emerald-400/60 hover:shadow-emerald-500/10'
                      : 'border-slate-700/50 hover:border-purple-500/50 hover:shadow-purple-500/10'
                }`}
              >
                {/* Bande colorée en haut */}
                <div className={`h-1 w-full ${
                  enRupture ? 'bg-rose-500/60' : affordable ? 'bg-emerald-500/60' : 'bg-slate-700/60'
                }`} />

                <div className="p-4">
                  {/* Badges en haut à droite */}
                  <div className="absolute top-3 right-3 flex flex-col items-end gap-1">
                    {enRupture ? (
                      <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full bg-rose-500/20 text-rose-200 ring-1 ring-rose-500/40 text-[10px] font-medium animate-pulse-soft">
                        <Ban className="h-3 w-3" /> Rupture
                      </span>
                    ) : affordable ? (
                      <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full bg-emerald-500/15 text-emerald-300 ring-1 ring-emerald-500/30 text-[10px] font-medium">
                        <CheckCircle2 className="h-3 w-3" /> Accessible
                      </span>
                    ) : null}
                    {/* Badge "Neuf" */}
                    <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full bg-sky-500/15 text-sky-300 ring-1 ring-sky-500/25 text-[10px] font-medium">
                      <Star className="h-2.5 w-2.5" /> Neuf
                    </span>
                  </div>

                  {/* Titre + infos */}
                  <div className="pr-20 mb-3">
                    <h3 className="font-semibold text-slate-100 truncate">{avion.nom}</h3>
                    <div className="flex items-center gap-2 mt-1 flex-wrap">
                      {avion.code_oaci && (
                        <span className="text-xs text-slate-500 font-mono bg-slate-900/60 px-1.5 py-0.5 rounded">
                          {avion.code_oaci}
                        </span>
                      )}
                      {avion.categorie && (
                        <span className={`text-xs px-1.5 py-0.5 rounded flex items-center gap-1 ${catConfig.color}`}>
                          {catConfig.emoji} {catConfig.label}
                        </span>
                      )}
                    </div>
                  </div>

                  <div className="space-y-1.5 mb-4">
                    {avion.constructeur && (
                      <p className="text-xs text-slate-500 italic">{avion.constructeur}</p>
                    )}
                    {avion.capacite_pax > 0 && (
                      <div className="flex items-center gap-2 text-sm text-slate-400">
                        <Users className="h-4 w-4 text-sky-400/70" />
                        <span>{avion.capacite_pax} passagers</span>
                      </div>
                    )}
                    {avion.capacite_cargo_kg > 0 && (
                      <div className="flex items-center gap-2 text-sm text-slate-400">
                        <Weight className="h-4 w-4 text-amber-400/70" />
                        <span>{avion.capacite_cargo_kg.toLocaleString('fr-FR')} kg cargo</span>
                      </div>
                    )}
                    {avion.est_militaire && (
                      <div className="flex items-center gap-2 text-xs text-red-400 bg-red-500/10 rounded px-2 py-1 mt-2">
                        <Shield className="h-3 w-3" />
                        <span>Espace militaire ou vols personnels</span>
                      </div>
                    )}
                  </div>

                  {/* Rupture countdown */}
                  {enRupture && avion.rupture_fin_at && (
                    <div className="mb-3 rounded-lg bg-rose-500/10 border border-rose-500/30 p-2.5 flex items-start gap-2">
                      <Clock className="h-4 w-4 text-rose-300 shrink-0 mt-0.5 animate-pulse-soft" />
                      <div className="min-w-0 text-xs">
                        <p className="text-rose-200 font-semibold">Indisponible</p>
                        <p className="text-rose-200/70">
                          Retour estimé dans{' '}
                          <span className="font-semibold text-rose-100 tabular-nums">
                            {formatRuptureCountdown(avion.rupture_fin_at)}
                          </span>
                        </p>
                        <p className="text-rose-200/40 text-[10px] mt-0.5">
                          ({new Date(avion.rupture_fin_at).toLocaleString('fr-FR')})
                        </p>
                      </div>
                    </div>
                  )}

                  {/* Barre de progression d'accessibilité */}
                  {!enRupture && !affordable && maxSolde > 0 && (
                    <div className="mb-3">
                      <div className="h-1.5 rounded-full bg-slate-900/60 overflow-hidden">
                        <div
                          className="h-full bg-gradient-to-r from-amber-400 to-amber-200 transition-all duration-500"
                          style={{ width: `${Math.max(2, ratio * 100)}%` }}
                        />
                      </div>
                      <p className="text-[10px] text-amber-300/70 mt-1 tabular-nums">
                        {Math.round(ratio * 100)}% couvert · manque{' '}
                        {(avion.prix - maxSolde).toLocaleString('fr-FR')} F$
                      </p>
                    </div>
                  )}

                  {/* Prix + bouton */}
                  <div className="flex items-end justify-between gap-2 pt-1">
                    <div>
                      <p className={`text-2xl font-bold tabular-nums leading-none ${
                        enRupture ? 'text-rose-300/70 line-through' : affordable ? 'text-emerald-300' : 'text-slate-200'
                      }`}>
                        {avion.prix.toLocaleString('fr-FR')}
                      </p>
                      <p className="text-xs text-slate-500 mt-0.5">F$ — prix catalogue</p>
                    </div>
                    {enRupture ? (
                      <button
                        type="button"
                        disabled
                        className="px-4 py-2 text-xs font-semibold rounded-lg bg-rose-500/10 text-rose-300/70 ring-1 ring-rose-500/30 cursor-not-allowed inline-flex items-center gap-1.5"
                      >
                        <Ban className="h-3.5 w-3.5" />
                        Indisponible
                      </button>
                    ) : (
                      <MarketplaceClient
                        avionId={avion.id}
                        avionNom={avion.nom}
                        prix={avion.prix}
                        estMilitaire={avion.est_militaire}
                        soldePerso={soldePerso}
                        compagnies={compagnies}
                        armeeCompte={armeeCompte}
                      />
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        <div className="text-center py-16 animate-fade-in">
          <div className="inline-flex h-20 w-20 items-center justify-center rounded-full bg-slate-800/60 ring-1 ring-slate-700/60 mb-4">
            <Plane className="h-10 w-10 text-slate-600" />
          </div>
          <p className="text-slate-300 font-semibold text-lg">Aucun avion trouvé</p>
          <p className="text-sm text-slate-500 mt-1 max-w-xs mx-auto">
            Essayez d&apos;élargir la fourchette de prix ou réinitialisez les filtres.
          </p>
          <button
            onClick={clearFilters}
            className="mt-5 inline-flex items-center gap-1.5 text-sm text-purple-300 hover:text-purple-200 px-5 py-2.5 rounded-xl bg-purple-500/10 hover:bg-purple-500/20 transition-colors ring-1 ring-purple-500/30"
          >
            <X className="h-4 w-4" />
            Réinitialiser les filtres
          </button>
        </div>
      )}
    </div>
  );
}
