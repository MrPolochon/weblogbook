'use client';

import { useState, useEffect, useCallback } from 'react';
import { LayoutGrid, RefreshCw } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import type { AirportGate } from '@/lib/types';

const GATE_TYPE_LABEL: Record<string, string> = {
  light:            'Light',
  medium:           'Medium',
  heavy:            'Heavy',
  super_heavy:      'Super Heavy',
  helicopter:       'Hélicoptère',
  cargo:            'Cargo',
  general_aviation: 'Av. Générale',
  unrestricted:     'Non restreint',
  special:          'Spécial',
};

const GATE_TYPE_COLOR: Record<string, string> = {
  light:            'bg-slate-500/20 text-slate-300 border-slate-500/30',
  medium:           'bg-sky-500/20 text-sky-300 border-sky-500/30',
  heavy:            'bg-blue-500/20 text-blue-300 border-blue-500/30',
  super_heavy:      'bg-purple-500/20 text-purple-300 border-purple-500/30',
  helicopter:       'bg-amber-500/20 text-amber-300 border-amber-500/30',
  cargo:            'bg-orange-500/20 text-orange-300 border-orange-500/30',
  general_aviation: 'bg-emerald-500/20 text-emerald-300 border-emerald-500/30',
  unrestricted:     'bg-teal-500/20 text-teal-300 border-teal-500/30',
  special:          'bg-red-500/20 text-red-300 border-red-500/30',
};

type PlanVolOccupant = {
  id: string;
  numero_vol: string;
  callsign?: string | null;
  aeroport_depart: string;
  aeroport_arrivee: string;
  statut: string;
};

type GateWithStatus = AirportGate & {
  available: boolean;
  /** Renseigné quand la porte est occupée via plans_vol.porte (source principale). */
  plan_vol: PlanVolOccupant | null;
  /** Renseigné quand la porte est occupée via l'ancienne table gate_assignments. */
  assignment: {
    id: string;
    assignment_type: string;
    status: string;
    plan_vol: { numero_vol: string; aeroport_depart: string; aeroport_arrivee: string } | null;
  } | null;
};

interface Props {
  gates: AirportGate[];
  aeroport: string;
}

export default function GatesView({ gates: initialGates, aeroport }: Props) {
  const [gates, setGates] = useState<GateWithStatus[]>(initialGates.map((g) => ({ ...g, available: true, plan_vol: null, assignment: null })));
  const [loading, setLoading] = useState(false);

  const loadGates = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/ground/gates?aeroport=${aeroport}`);
      const data = await res.json() as { gates?: GateWithStatus[] };
      if (data.gates) setGates(data.gates);
    } finally {
      setLoading(false);
    }
  }, [aeroport]);

  // Chargement initial
  useEffect(() => { void loadGates(); }, [loadGates]);

  // Rafraîchissement automatique quand un plan de vol est soumis ou modifié
  useEffect(() => {
    const supabase = createClient();
    const channel = supabase
      .channel(`gates-plans-vol-${aeroport}`)
      .on('postgres_changes', {
        event: '*',
        schema: 'public',
        table: 'plans_vol',
        filter: `aeroport_depart=eq.${aeroport}`,
      }, () => { void loadGates(); })
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [aeroport, loadGates]);

  // Grouper par terminal
  const terminals = Array.from(new Set(gates.map((g) => g.terminal ?? 'Hors terminal')));

  if (gates.length === 0) {
    return (
      <div className="rounded-xl border border-slate-700/40 bg-slate-800/20 p-12 text-center">
        <LayoutGrid className="h-10 w-10 text-slate-600 mx-auto mb-3" />
        <p className="text-slate-400">Aucune porte configurée pour cet aéroport</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-slate-400">{gates.length} porte(s) — {gates.filter((g) => g.available).length} disponible(s)</p>
        <button
          type="button"
          onClick={loadGates}
          disabled={loading}
          className="flex items-center gap-1.5 text-xs text-slate-400 hover:text-slate-200 transition-colors"
        >
          <RefreshCw className={`h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`} />
          Actualiser
        </button>
      </div>

      {terminals.map((terminal) => {
        const terminalGates = gates.filter((g) => (g.terminal ?? 'Hors terminal') === terminal);
        return (
          <div key={terminal} className="rounded-xl border border-slate-700/40 bg-slate-800/20 overflow-hidden">
            <div className="px-4 py-2.5 bg-slate-800/40 border-b border-slate-700/40">
              <h3 className="text-sm font-semibold text-slate-200">{terminal}</h3>
            </div>
            <div className="p-3 grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-2">
              {terminalGates.map((gate) => (
                <div
                  key={gate.id}
                  className={`rounded-xl border p-3 transition-all ${
                    gate.available
                      ? 'border-slate-700/40 bg-slate-700/20 hover:border-emerald-700/50'
                      : 'border-slate-600/30 bg-slate-800/40 opacity-60'
                  }`}
                >
                  <div className="flex items-start justify-between gap-1">
                    <span className="font-bold text-slate-100 text-sm">{gate.gate_code}</span>
                    <span className={`text-[10px] px-1.5 py-0.5 rounded-full border ${GATE_TYPE_COLOR[gate.gate_type] ?? ''}`}>
                      {GATE_TYPE_LABEL[gate.gate_type] ?? gate.gate_type}
                    </span>
                  </div>
                  {gate.max_aircraft_size && (
                    <p className="text-[10px] text-slate-500 mt-1">Max: {gate.max_aircraft_size}</p>
                  )}
                  {gate.available ? (
                    <p className="text-[10px] text-emerald-400 mt-1 font-medium">✓ Libre</p>
                  ) : gate.plan_vol ? (
                    <p className="text-[10px] text-amber-400 mt-1 font-medium">
                      ↑ {gate.plan_vol.numero_vol}
                    </p>
                  ) : gate.assignment ? (
                    <p className="text-[10px] text-amber-400 mt-1 font-medium">
                      {gate.assignment.assignment_type === 'depart' ? '↑' : '↓'}{' '}
                      {gate.assignment.plan_vol?.numero_vol ?? 'Occupé'}
                    </p>
                  ) : (
                    <p className="text-[10px] text-red-400 mt-1 font-medium">✗ Occupé</p>
                  )}
                  {gate.requires_separation && (
                    <p className="text-[10px] text-orange-400/80 mt-0.5">⚠ Séparation</p>
                  )}
                  {gate.reserved_for && (
                    <p className="text-[10px] text-indigo-400 mt-0.5">★ {gate.reserved_for}</p>
                  )}
                </div>
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );
}
