'use client';

import { useState, useMemo } from 'react';
import { Search, Plane, Users, Weight, Filter, X, Package, Shield, CheckCircle2, Sparkles } from 'lucide-react';
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

const CATEGORIES: Record<string, { label: string; color: string }> = {
  commercial: { label: 'Commercial', color: 'bg-sky-500/20 text-sky-400' },
  cargo: { label: 'Cargo', color: 'bg-amber-500/20 text-amber-400' },
  leger: { label: 'Léger', color: 'bg-emerald-500/20 text-emerald-400' },
  helicoptere: { label: 'Hélicoptère', color: 'bg-purple-500/20 text-purple-400' },
  amphibie: { label: 'Amphibie', color: 'bg-cyan-500/20 text-cyan-400' },
  militaire: { label: 'Militaire', color: 'bg-red-500/20 text-red-400' },
  ravitailleur: { label: 'Ravitailleur', color: 'bg-orange-500/20 text-orange-400' },
};

export default function MarketplaceList({ avions, soldePerso, compagnies, armeeCompte = null }: Props) {
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedCategorie, setSelectedCategorie] = useState<string | null>(null);
  const [showOnlyAffordable, setShowOnlyAffordable] = useState(false);
  const [sortBy, setSortBy] = useState<'prix_asc' | 'prix_desc' | 'nom'>('prix_asc');

  // Calculer le solde max disponible (perso + compagnies)
  const maxSolde = Math.max(soldePerso, ...compagnies.map(c => c.solde), armeeCompte?.solde || 0);

  // Extraire les catégories uniques présentes
  const categoriesPresentes = useMemo(() => {
    const cats = new Set<string>();
    avions.forEach(a => {
      if (a.categorie) cats.add(a.categorie);
    });
    return Array.from(cats);
  }, [avions]);

  // Filtrer et trier les avions
  const avionsFiltres = useMemo(() => {
    let result = [...avions];

    // Filtre par recherche
    if (searchTerm) {
      const search = searchTerm.toLowerCase();
      result = result.filter(a => 
        a.nom.toLowerCase().includes(search) ||
        a.constructeur?.toLowerCase().includes(search) ||
        a.code_oaci?.toLowerCase().includes(search) ||
        a.categorie?.toLowerCase().includes(search)
      );
    }

    // Filtre par catégorie
    if (selectedCategorie) {
      result = result.filter(a => a.categorie === selectedCategorie);
    }

    // Filtre par prix abordable
    if (showOnlyAffordable) {
      result = result.filter(a => a.prix <= maxSolde);
    }

    // Tri
    switch (sortBy) {
      case 'prix_asc':
        result.sort((a, b) => a.prix - b.prix);
        break;
      case 'prix_desc':
        result.sort((a, b) => b.prix - a.prix);
        break;
      case 'nom':
        result.sort((a, b) => a.nom.localeCompare(b.nom));
        break;
    }

    return result;
  }, [avions, searchTerm, selectedCategorie, showOnlyAffordable, sortBy, maxSolde]);

  const clearFilters = () => {
    setSearchTerm('');
    setSelectedCategorie(null);
    setShowOnlyAffordable(false);
    setSortBy('prix_asc');
  };

  const hasActiveFilters = searchTerm || selectedCategorie || showOnlyAffordable || sortBy !== 'prix_asc';

  const nbAffordable = useMemo(() => avions.filter(a => a.prix <= maxSolde).length, [avions, maxSolde]);

  return (
    <div className="card">
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
        </h2>
        {hasActiveFilters && (
          <button
            onClick={clearFilters}
            className="text-xs text-slate-400 hover:text-slate-200 flex items-center gap-1"
          >
            <X className="h-3 w-3" />
            Effacer les filtres
          </button>
        )}
      </div>

      {/* Barre de recherche et filtres */}
      <div className="space-y-3 mb-6">
        {/* Recherche */}
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-5 w-5 text-slate-500" />
          <input
            type="text"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            placeholder="Rechercher par nom, constructeur, code OACI..."
            className="input w-full pl-10 pr-4"
          />
        </div>

        {/* Filtres en ligne */}
        <div className="flex flex-wrap gap-2 items-center">
          <Filter className="h-4 w-4 text-slate-500" />
          
          {/* Catégories */}
          <div className="flex flex-wrap gap-1">
            {categoriesPresentes.map(cat => {
              const config = CATEGORIES[cat] || { label: cat, color: 'bg-slate-500/20 text-slate-400' };
              const count = avions.filter(a => a.categorie === cat).length;
              return (
                <button
                  key={cat}
                  onClick={() => setSelectedCategorie(selectedCategorie === cat ? null : cat)}
                  className={`px-2.5 py-1 rounded-full text-xs font-medium transition-all hover:-translate-y-0.5 ${
                    selectedCategorie === cat
                      ? config.color + ' ring-1 ring-current scale-105'
                      : 'bg-slate-800/50 text-slate-400 hover:text-slate-200'
                  }`}
                >
                  {config.label}
                  <span className="ml-1.5 text-[10px] opacity-70 tabular-nums">{count}</span>
                </button>
              );
            })}
          </div>

          <span className="text-slate-600">|</span>

          {/* Filtre abordable */}
          <button
            onClick={() => setShowOnlyAffordable(!showOnlyAffordable)}
            className={`px-2.5 py-1 rounded-lg text-xs font-medium transition-all flex items-center gap-1 ${
              showOnlyAffordable
                ? 'bg-emerald-500/20 text-emerald-400 ring-1 ring-emerald-500/50'
                : 'bg-slate-800/50 text-slate-400 hover:text-slate-200'
            }`}
          >
            <Package className="h-3 w-3" />
            Abordables
          </button>

          <span className="text-slate-600">|</span>

          {/* Tri */}
          <select
            value={sortBy}
            onChange={(e) => setSortBy(e.target.value as typeof sortBy)}
            className="bg-slate-800/50 border border-slate-700/50 rounded-lg px-2 py-1 text-xs text-slate-300 focus:outline-none focus:ring-1 focus:ring-purple-500/50"
          >
            <option value="prix_asc">Prix croissant</option>
            <option value="prix_desc">Prix décroissant</option>
            <option value="nom">Nom A-Z</option>
          </select>
        </div>
      </div>
      
      {avionsFiltres.length > 0 ? (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 stagger-enter">
          {avionsFiltres.map((avion) => {
            const catConfig = CATEGORIES[avion.categorie || ''] || { label: avion.categorie, color: 'bg-slate-500/20 text-slate-400' };
            const affordable = avion.prix <= maxSolde;
            const ratio = maxSolde > 0 ? Math.min(1, maxSolde / avion.prix) : 0;
            return (
              <div
                key={avion.id}
                className={`group relative bg-slate-800/50 rounded-xl p-4 border transition-all duration-200 hover:-translate-y-1 hover:shadow-lg ${
                  affordable
                    ? 'border-emerald-500/30 hover:border-emerald-400/60 hover:shadow-emerald-500/10'
                    : 'border-slate-700/50 hover:border-purple-500/50 hover:shadow-purple-500/10'
                }`}
              >
                {affordable && (
                  <div className="absolute top-2 right-2 inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full bg-emerald-500/15 text-emerald-300 ring-1 ring-emerald-500/30 text-[10px] font-medium">
                    <CheckCircle2 className="h-3 w-3" />
                    Accessible
                  </div>
                )}

                <div className="flex items-start justify-between mb-3">
                  <div className="min-w-0 pr-16">
                    <h3 className="font-semibold text-slate-100 truncate">{avion.nom}</h3>
                    <div className="flex items-center gap-2 mt-1 flex-wrap">
                      {avion.code_oaci && (
                        <span className="text-xs text-slate-500 font-mono bg-slate-900/60 px-1.5 py-0.5 rounded">
                          {avion.code_oaci}
                        </span>
                      )}
                      {avion.categorie && (
                        <span className={`text-xs px-1.5 py-0.5 rounded ${catConfig.color}`}>
                          {catConfig.label}
                        </span>
                      )}
                    </div>
                  </div>
                  <Plane className="h-8 w-8 text-slate-600 group-hover:text-purple-400 group-hover:rotate-12 transition-all duration-300 absolute top-9 right-3" />
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

                {/* Barre d'accessibilité au prix */}
                {!affordable && maxSolde > 0 && (
                  <div className="mb-3">
                    <div className="h-1 rounded-full bg-slate-900/60 overflow-hidden">
                      <div
                        className="h-full bg-gradient-to-r from-amber-400 to-amber-200 transition-all duration-500"
                        style={{ width: `${Math.max(2, ratio * 100)}%` }}
                      />
                    </div>
                    <p className="text-[10px] text-amber-300/70 mt-1 tabular-nums">
                      {Math.round(ratio * 100)}% du prix couvert · manque {(avion.prix - maxSolde).toLocaleString('fr-FR')} F$
                    </p>
                  </div>
                )}

                <div className="flex items-center justify-between gap-2">
                  <div>
                    <p className={`text-xl font-bold tabular-nums ${affordable ? 'text-emerald-300' : 'text-slate-400'}`}>
                      {avion.prix.toLocaleString('fr-FR')}
                    </p>
                    <p className="text-[10px] text-slate-500 -mt-0.5">F$</p>
                  </div>
                  <MarketplaceClient
                    avionId={avion.id}
                    avionNom={avion.nom}
                    prix={avion.prix}
                    estMilitaire={avion.est_militaire}
                    soldePerso={soldePerso}
                    compagnies={compagnies}
                    armeeCompte={armeeCompte}
                  />
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        <div className="text-center py-12 animate-fade-in">
          <div className="inline-flex h-16 w-16 items-center justify-center rounded-full bg-slate-800/60 ring-1 ring-slate-700/60 mb-4">
            <Search className="h-8 w-8 text-slate-500" />
          </div>
          <p className="text-slate-300 font-medium">Aucun avion ne correspond à votre recherche.</p>
          <p className="text-sm text-slate-500 mt-1">Essayez un autre filtre ou réinitialisez la sélection.</p>
          <button
            onClick={clearFilters}
            className="mt-4 inline-flex items-center gap-1.5 text-sm text-purple-300 hover:text-purple-200 px-4 py-2 rounded-lg bg-purple-500/10 hover:bg-purple-500/20 transition-colors ring-1 ring-purple-500/30"
          >
            <X className="h-4 w-4" />
            Réinitialiser les filtres
          </button>
        </div>
      )}
    </div>
  );
}
