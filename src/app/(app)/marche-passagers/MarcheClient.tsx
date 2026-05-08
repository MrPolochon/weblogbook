'use client';

import { useState } from 'react';
import { Users, Package, Plane, MapPin, Palmtree, Radio, Factory } from 'lucide-react';
import MarchePassagersClient from './MarchePassagersClient';
import MarcheCargoClient from './MarcheCargoClient';

interface PassagerAeroport {
  code: string;
  nom: string;
  taille: 'international' | 'regional' | 'small' | 'military';
  tourisme: boolean;
  passagersMax: number;
  passagers_disponibles: number;
  passagers_max: number;
  derniere_regeneration: string | null;
  vor?: string;
  freq?: string;
}

interface CargoAeroport {
  code: string;
  nom: string;
  taille: 'international' | 'regional' | 'small' | 'military';
  industriel: boolean;
  cargoMax: number;
  cargo_disponible: number;
  cargo_max: number;
  derniere_regeneration: string | null;
  vor?: string;
  freq?: string;
}

type TabId = 'passagers' | 'cargo';

interface Props {
  passagersAeroports: PassagerAeroport[];
  cargoAeroports: CargoAeroport[];
}

export default function MarcheClient({ passagersAeroports, cargoAeroports }: Props) {
  const [activeTab, setActiveTab] = useState<TabId>('passagers');

  const totalPax = passagersAeroports.reduce((s, a) => s + a.passagers_disponibles, 0);
  const totalCargo = cargoAeroports.reduce((s, a) => s + a.cargo_disponible, 0);
  const nbHubs = passagersAeroports.filter(a => a.taille === 'international').length;
  const nbTourisme = passagersAeroports.filter(a => a.tourisme).length;
  const nbIndustriel = cargoAeroports.filter(a => a.industriel).length;

  function formatCargo(kg: number): string {
    if (kg >= 1000) return `${(kg / 1000).toFixed(1)}t`;
    return `${kg}kg`;
  }

  return (
    <div className="space-y-6 animate-page-reveal">
      {/* HUD Header */}
      <div className="relative overflow-hidden rounded-2xl border border-emerald-500/20 bg-gradient-to-br from-slate-900/95 via-slate-900/85 to-slate-950/95 shadow-[0_22px_42px_rgba(2,6,23,0.36),inset_0_1px_0_rgba(255,255,255,0.06)]">
        <div className="pointer-events-none absolute inset-0 bg-cockpit-grid opacity-60" />
        <div className="pointer-events-none absolute -right-24 -top-24 h-72 w-72 rounded-full bg-emerald-500/10 blur-3xl" />
        <div className="pointer-events-none absolute -left-16 -bottom-16 h-56 w-56 rounded-full bg-amber-500/10 blur-3xl" />
        <Plane
          className="pointer-events-none absolute top-3 -left-10 h-5 w-5 text-emerald-400/40 animate-plane-glide"
          style={{ animationDuration: '7s' }}
          aria-hidden
        />
        <div className="relative z-10 p-5 sm:p-7 space-y-4">
          <div className="flex items-start gap-4">
            <div className={`p-3 rounded-xl bg-gradient-to-br border ${
              activeTab === 'passagers'
                ? 'from-emerald-500/20 to-teal-500/20 border-emerald-500/20'
                : 'from-amber-500/20 to-orange-500/20 border-amber-500/20'
            }`}>
              {activeTab === 'passagers'
                ? <Users className="h-7 w-7 text-emerald-400" />
                : <Package className="h-7 w-7 text-amber-400" />
              }
            </div>
            <div className="flex-1">
              <h1 className="text-2xl font-bold text-slate-50 tracking-tight">
                {activeTab === 'passagers' ? 'Marché des passagers' : 'Marché du fret'}
              </h1>
              <p className="text-sm text-slate-400 mt-0.5">
                {activeTab === 'passagers'
                  ? 'Vue en temps réel de la disponibilité par aéroport'
                  : 'Vue en temps réel du cargo disponible par aéroport'}
              </p>
            </div>
          </div>

          {/* Dynamic indicators */}
          <div className="flex flex-wrap gap-3 text-xs">
            {activeTab === 'passagers' ? (
              <>
                <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-emerald-500/10 border border-emerald-500/20">
                  <Users className="h-3.5 w-3.5 text-emerald-400" />
                  <span className="text-emerald-300 font-medium">{totalPax.toLocaleString('fr-FR')} pax disponibles</span>
                </div>
                <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-purple-500/10 border border-purple-500/20">
                  <MapPin className="h-3.5 w-3.5 text-purple-400" />
                  <span className="text-purple-300 font-medium">{nbHubs} hub{nbHubs > 1 ? 's' : ''}</span>
                </div>
                <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-amber-500/10 border border-amber-500/20">
                  <Palmtree className="h-3.5 w-3.5 text-amber-400" />
                  <span className="text-amber-300 font-medium">{nbTourisme} touristique{nbTourisme > 1 ? 's' : ''}</span>
                </div>
              </>
            ) : (
              <>
                <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-amber-500/10 border border-amber-500/20">
                  <Package className="h-3.5 w-3.5 text-amber-400" />
                  <span className="text-amber-300 font-medium">{formatCargo(totalCargo)} disponible</span>
                </div>
                <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-purple-500/10 border border-purple-500/20">
                  <MapPin className="h-3.5 w-3.5 text-purple-400" />
                  <span className="text-purple-300 font-medium">{nbHubs} hub{nbHubs > 1 ? 's' : ''} cargo</span>
                </div>
                <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-emerald-500/10 border border-emerald-500/20">
                  <Factory className="h-3.5 w-3.5 text-emerald-400" />
                  <span className="text-emerald-300 font-medium">{nbIndustriel} zone{nbIndustriel > 1 ? 's' : ''} industrielle{nbIndustriel > 1 ? 's' : ''}</span>
                </div>
              </>
            )}
            <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-sky-500/10 border border-sky-500/20">
              <Radio className="h-3.5 w-3.5 text-sky-400" />
              <span className="text-sky-300 font-medium">{passagersAeroports.length} aéroports</span>
            </div>
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="flex p-1 rounded-xl bg-slate-800/40 border border-slate-800/60">
          <button
            onClick={() => setActiveTab('passagers')}
            className={`flex items-center gap-2 px-5 py-2.5 rounded-lg text-sm font-medium transition-all duration-200 ${
              activeTab === 'passagers'
                ? 'bg-emerald-600/80 text-white shadow-lg shadow-emerald-900/30 border border-emerald-500/40'
                : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/60'
            }`}
          >
            <Users className="h-4 w-4" />
            Passagers
          </button>
          <button
            onClick={() => setActiveTab('cargo')}
            className={`flex items-center gap-2 px-5 py-2.5 rounded-lg text-sm font-medium transition-all duration-200 ${
              activeTab === 'cargo'
                ? 'bg-amber-600/80 text-white shadow-lg shadow-amber-900/30 border border-amber-500/40'
                : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/60'
            }`}
          >
            <Package className="h-4 w-4" />
            Cargo
          </button>
        </div>

        {/* Legend */}
        <div className="flex flex-wrap gap-2">
          {[
            { color: 'bg-purple-500', border: 'border-purple-500/40', label: 'International' },
            { color: 'bg-sky-500', border: 'border-sky-500/40', label: 'Régional' },
            { color: 'bg-emerald-500', border: 'border-emerald-500/40', label: 'Small' },
            { color: 'bg-red-500', border: 'border-red-500/40', label: 'Militaire' },
          ].map(l => (
            <div key={l.label} className={`flex items-center gap-2 px-2.5 py-1 rounded-lg border ${l.border} bg-slate-800/40 text-xs`}>
              <div className={`w-2 h-2 rounded-full ${l.color}`} />
              <span className="text-slate-300">{l.label}</span>
            </div>
          ))}
          {activeTab === 'passagers' ? (
            <div className="flex items-center gap-2 px-2.5 py-1 rounded-lg border border-amber-500/40 bg-slate-800/40 text-xs">
              <Palmtree className="h-3 w-3 text-amber-400" />
              <span className="text-slate-300">Touristique</span>
            </div>
          ) : (
            <div className="flex items-center gap-2 px-2.5 py-1 rounded-lg border border-amber-500/40 bg-slate-800/40 text-xs">
              <Factory className="h-3 w-3 text-amber-400" />
              <span className="text-slate-300">Industriel</span>
            </div>
          )}
        </div>
      </div>

      {/* Content */}
      {activeTab === 'passagers' ? (
        <MarchePassagersClient aeroports={passagersAeroports} />
      ) : (
        <MarcheCargoClient aeroports={cargoAeroports} />
      )}
    </div>
  );
}
