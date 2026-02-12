'use client';

import { useState, useEffect, useMemo } from 'react';
import { MapPin, Building2, Star, ChevronDown, ChevronUp } from 'lucide-react';
import { AEROPORTS_PTFS } from '@/lib/aeroports-ptfs';

type HubData = {
  id: string;
  aeroport_code: string;
  est_hub_principal: boolean;
  compagnie_id: string;
  compagnies: { nom: string } | null;
};

type AeroportHubs = {
  code: string;
  nom: string;
  taille: string;
  compagnies: Array<{ nom: string; estPrincipal: boolean }>;
};

const TAILLE_COLORS: Record<string, string> = {
  international: 'bg-purple-500/20 text-purple-300 border-purple-500/30',
  regional: 'bg-sky-500/20 text-sky-300 border-sky-500/30',
  small: 'bg-emerald-500/20 text-emerald-300 border-emerald-500/30',
  military: 'bg-red-500/20 text-red-300 border-red-500/30',
};

const TAILLE_LABELS: Record<string, string> = {
  international: 'International',
  regional: 'Régional',
  small: 'Petit',
  military: 'Militaire',
};

export default function HubsMapSection() {
  const [hubs, setHubs] = useState<HubData[]>([]);
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState(true);
  const [selectedAeroport, setSelectedAeroport] = useState<string | null>(null);

  useEffect(() => {
    async function load() {
      try {
        const res = await fetch('/api/compagnies/hubs?all=1');
        const d = await res.json().catch(() => []);
        if (res.ok) setHubs(d || []);
      } catch {
        // silently fail
      } finally {
        setLoading(false);
      }
    }
    load();
  }, []);

  // Grouper les hubs par aéroport
  const aeroportsAvecHubs: AeroportHubs[] = useMemo(() => {
    const map = new Map<string, Array<{ nom: string; estPrincipal: boolean }>>();

    for (const h of hubs) {
      const compagnieNom = h.compagnies?.nom || 'Inconnue';
      if (!map.has(h.aeroport_code)) map.set(h.aeroport_code, []);
      map.get(h.aeroport_code)!.push({ nom: compagnieNom, estPrincipal: h.est_hub_principal });
    }

    // Fusionner avec les infos aéroport
    const result: AeroportHubs[] = [];
    for (const apt of AEROPORTS_PTFS) {
      const compagnies = map.get(apt.code) || [];
      result.push({
        code: apt.code,
        nom: apt.nom,
        taille: apt.taille,
        compagnies,
      });
    }

    // Trier : aéroports avec hubs en premier, puis par nombre de compagnies
    result.sort((a, b) => {
      if (a.compagnies.length > 0 && b.compagnies.length === 0) return -1;
      if (a.compagnies.length === 0 && b.compagnies.length > 0) return 1;
      return b.compagnies.length - a.compagnies.length;
    });

    return result;
  }, [hubs]);

  const aeroportsOccupes = aeroportsAvecHubs.filter(a => a.compagnies.length > 0);
  const aeroportsVides = aeroportsAvecHubs.filter(a => a.compagnies.length === 0);
  const selected = selectedAeroport ? aeroportsAvecHubs.find(a => a.code === selectedAeroport) : null;

  if (loading) return null;
  if (hubs.length === 0) return null;

  return (
    <div className="card mt-6">
      <button
        type="button"
        onClick={() => setExpanded(!expanded)}
        className="w-full flex items-center justify-between mb-2"
      >
        <h2 className="text-lg font-semibold text-slate-100 flex items-center gap-2">
          <MapPin className="h-5 w-5 text-emerald-400" />
          Hubs par aéroport
          <span className="text-sm font-normal text-slate-500">
            ({aeroportsOccupes.length} aéroport(s) avec hub)
          </span>
        </h2>
        {expanded ? <ChevronUp className="h-5 w-5 text-slate-400" /> : <ChevronDown className="h-5 w-5 text-slate-400" />}
      </button>

      {expanded && (
        <>
          {/* Grille des aéroports avec hubs */}
          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 mt-4">
            {aeroportsOccupes.map((apt) => (
              <button
                key={apt.code}
                type="button"
                onClick={() => setSelectedAeroport(selectedAeroport === apt.code ? null : apt.code)}
                className={`text-left p-3 rounded-lg border transition-all ${
                  selectedAeroport === apt.code
                    ? 'border-emerald-500/50 bg-emerald-500/10 ring-1 ring-emerald-500/30'
                    : 'border-slate-700/50 bg-slate-800/30 hover:border-slate-600/50'
                }`}
              >
                <div className="flex items-center justify-between mb-1">
                  <span className="font-mono font-bold text-slate-200">{apt.code}</span>
                  <span className={`text-[10px] px-1.5 py-0.5 rounded border ${TAILLE_COLORS[apt.taille] || 'bg-slate-500/20 text-slate-300'}`}>
                    {TAILLE_LABELS[apt.taille] || apt.taille}
                  </span>
                </div>
                <p className="text-xs text-slate-400 mb-2 truncate">{apt.nom}</p>
                <div className="flex items-center gap-1">
                  <Building2 className="h-3 w-3 text-sky-400" />
                  <span className="text-xs text-sky-300 font-medium">{apt.compagnies.length} compagnie(s)</span>
                </div>
              </button>
            ))}
          </div>

          {/* Aéroports vides (repliés) */}
          {aeroportsVides.length > 0 && (
            <div className="mt-3 pt-3 border-t border-slate-700/50">
              <p className="text-xs text-slate-500 mb-2">
                Aéroports sans hub ({aeroportsVides.length}) :
                <span className="text-slate-600 ml-1">
                  {aeroportsVides.map(a => a.code).join(', ')}
                </span>
              </p>
            </div>
          )}

          {/* Détail de l'aéroport sélectionné */}
          {selected && (
            <div className="mt-4 p-4 bg-slate-800/60 rounded-lg border border-slate-700/50">
              <div className="flex items-center gap-3 mb-3">
                <MapPin className="h-5 w-5 text-emerald-400" />
                <div>
                  <h3 className="font-bold text-slate-100">{selected.code} — {selected.nom}</h3>
                  <span className={`text-xs px-1.5 py-0.5 rounded border ${TAILLE_COLORS[selected.taille] || ''}`}>
                    {TAILLE_LABELS[selected.taille] || selected.taille}
                  </span>
                </div>
              </div>
              <div className="space-y-1.5">
                {selected.compagnies.map((c, i) => (
                  <div
                    key={i}
                    className={`flex items-center gap-2 px-3 py-2 rounded-md ${
                      c.estPrincipal
                        ? 'bg-emerald-500/10 border border-emerald-500/20'
                        : 'bg-slate-700/30'
                    }`}
                  >
                    <Building2 className={`h-4 w-4 ${c.estPrincipal ? 'text-emerald-400' : 'text-slate-400'}`} />
                    <span className={`text-sm font-medium ${c.estPrincipal ? 'text-emerald-300' : 'text-slate-300'}`}>
                      {c.nom}
                    </span>
                    {c.estPrincipal && (
                      <span className="inline-flex items-center gap-0.5 text-[10px] text-emerald-400 bg-emerald-500/20 rounded px-1.5 py-0.5 ml-auto">
                        <Star className="h-2.5 w-2.5 fill-emerald-400" />
                        Principal
                      </span>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
