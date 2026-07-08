'use client';

import { useState, useEffect } from 'react';
import type { AirportGate, AircraftSize } from '@/lib/types';
import { DoorOpen, AlertTriangle, Info } from 'lucide-react';

interface Props {
  aeroport: string | null;
  aircraftSize?: AircraftSize | string | null;
  value: string;
  onChange: (value: string) => void;
  required?: boolean;
  disabled?: boolean;
}

const GATE_TYPE_LABEL: Record<string, string> = {
  light:            'Light',
  medium:           'Medium',
  heavy:            'Heavy',
  super_heavy:      'Super Heavy',
  helicopter:       'Hélicoptère',
  general_aviation: 'Av. Générale',
  unrestricted:     'Non restreint',
  special:          'Spécial',
  cargo:            'Cargo',
};

const SIZE_ORDER: Record<string, number> = {
  light: 0,
  medium: 1,
  heavy: 2,
  super_heavy: 3,
};

type GateWithStatus = AirportGate & { available: boolean };

export default function PorteDepartSelect({
  aeroport,
  aircraftSize,
  value,
  onChange,
  required = false,
  disabled = false,
}: Props) {
  const [gates, setGates] = useState<GateWithStatus[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!aeroport) {
      setGates([]);
      onChange('');
      return;
    }

    setLoading(true);
    fetch(`/api/ground/gates?aeroport=${aeroport}`)
      .then((r) => r.json())
      .then((d: { gates?: GateWithStatus[] }) => {
        const filtered = (d.gates ?? []).filter((g) => g.gate_type !== 'special');
        setGates(filtered);
        if (value && !filtered.find((g) => g.gate_code === value)) {
          onChange('');
        }
      })
      .catch(() => setGates([]))
      .finally(() => setLoading(false));
  }, [aeroport]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!aeroport) return null;

  const groupedByTerminal = gates.reduce<Record<string, GateWithStatus[]>>((acc, g) => {
    const t = g.terminal ?? 'Hors terminal';
    if (!acc[t]) acc[t] = [];
    acc[t].push(g);
    return acc;
  }, {});

  const selectedGate = gates.find((g) => g.gate_code === value);

  // Vérifier compatibilité taille avion avec la porte sélectionnée
  const isIncompatible =
    selectedGate?.max_aircraft_size &&
    aircraftSize &&
    typeof aircraftSize === 'string' &&
    SIZE_ORDER[aircraftSize] !== undefined &&
    SIZE_ORDER[selectedGate.max_aircraft_size] !== undefined
      ? SIZE_ORDER[aircraftSize] > SIZE_ORDER[selectedGate.max_aircraft_size]
      : false;

  // Compter les portes compatibles avec la taille de l'avion
  const gatesCompatibles =
    aircraftSize && typeof aircraftSize === 'string' && SIZE_ORDER[aircraftSize] !== undefined
      ? gates.filter(
          (g) =>
            g.gate_type === 'unrestricted' ||
            !g.max_aircraft_size ||
            SIZE_ORDER[g.max_aircraft_size] >= SIZE_ORDER[aircraftSize as string]
        )
      : gates;

  return (
    <div className="space-y-2">
      {loading ? (
        <div className="h-10 rounded-xl border border-slate-600/50 bg-slate-900/50 flex items-center px-3 text-sm text-slate-400 animate-pulse">
          <DoorOpen className="h-3.5 w-3.5 mr-2 shrink-0" />
          Chargement des portes…
        </div>
      ) : gates.length === 0 ? (
        <div className="h-10 rounded-xl border border-slate-700/50 bg-slate-900/30 flex items-center px-3 text-sm text-slate-500">
          <DoorOpen className="h-3.5 w-3.5 mr-2 shrink-0" />
          Aucune porte configurée pour {aeroport}
        </div>
      ) : (
        <select
          value={value}
          onChange={(e) => onChange(e.target.value)}
          required={required}
          disabled={disabled}
          className="w-full rounded-xl border border-slate-600/50 bg-slate-900/50 px-3 py-2.5 text-sm text-slate-100 focus:border-emerald-500/60 focus:ring-2 focus:ring-emerald-500/20 outline-none transition-colors disabled:opacity-50"
        >
          <option value="">— Sélectionner une porte —</option>
          {Object.entries(groupedByTerminal).map(([terminal, termGates]) => (
            <optgroup key={terminal} label={terminal}>
              {termGates.map((gate) => (
                <option key={gate.id} value={gate.gate_code} disabled={!gate.available}>
                  {gate.gate_code}
                  {gate.gate_type ? ` (${GATE_TYPE_LABEL[gate.gate_type] ?? gate.gate_type})` : ''}
                  {gate.max_aircraft_size ? ` — max ${gate.max_aircraft_size}` : ''}
                  {gate.reserved_for ? ` — réservé ${gate.reserved_for}` : ''}
                  {!gate.available ? ' [Occupé]' : ''}
                </option>
              ))}
            </optgroup>
          ))}
        </select>
      )}

      {/* Détails de la porte sélectionnée */}
      {selectedGate && (
        <div className="flex flex-wrap items-center gap-1.5 text-[11px]">
          <span className="inline-flex items-center gap-1 rounded-md border border-slate-600/50 bg-slate-800/50 px-2 py-0.5 text-slate-300 font-mono">
            <DoorOpen className="h-3 w-3" />
            {GATE_TYPE_LABEL[selectedGate.gate_type] ?? selectedGate.gate_type}
          </span>
          {selectedGate.max_aircraft_size && (
            <span className="inline-flex items-center gap-1 rounded-md border border-slate-600/50 bg-slate-800/50 px-2 py-0.5 text-slate-400">
              Max&nbsp;<span className="font-semibold text-slate-200">{selectedGate.max_aircraft_size}</span>
            </span>
          )}
          {selectedGate.requires_separation && (
            <span className="inline-flex items-center gap-1 rounded-md border border-amber-500/40 bg-amber-500/10 px-2 py-0.5 text-amber-300">
              <AlertTriangle className="h-3 w-3" />
              Séparation requise
            </span>
          )}
          {isIncompatible && (
            <span className="inline-flex items-center gap-1 rounded-md border border-red-500/40 bg-red-500/10 px-2 py-0.5 text-red-300">
              <AlertTriangle className="h-3 w-3" />
              Taille incompatible
            </span>
          )}
          {selectedGate.available && !isIncompatible && (
            <span className="inline-flex items-center gap-1 rounded-md border border-emerald-500/40 bg-emerald-500/10 px-2 py-0.5 text-emerald-300">
              Disponible
            </span>
          )}
        </div>
      )}

      {/* Avertissement si aucune porte compatible pour la taille */}
      {!loading &&
        gates.length > 0 &&
        aircraftSize &&
        gatesCompatibles.length === 0 && (
          <div className="flex items-start gap-2 rounded-lg border border-amber-500/30 bg-amber-500/10 p-2.5">
            <AlertTriangle className="h-3.5 w-3.5 shrink-0 text-amber-400 mt-0.5" />
            <p className="text-xs text-amber-200">
              Aucune porte disponible pour un appareil de taille{' '}
              <span className="font-semibold">{aircraftSize}</span> à {aeroport}.
              Vous pouvez tout de même choisir une porte non restreinte.
            </p>
          </div>
        )}

      {/* Note informative si des portes sont occupées */}
      {!loading && gates.length > 0 && gates.some((g) => !g.available) && !value && (
        <p className="flex items-center gap-1 text-[10px] text-slate-500">
          <Info className="h-3 w-3 shrink-0" />
          Les portes marquées [Occupé] sont actuellement utilisées.
        </p>
      )}
    </div>
  );
}
