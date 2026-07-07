'use client';

import { useState, useEffect } from 'react';
import type { AirportGate } from '@/lib/types';

interface Props {
  aeroport: string | null;
  aircraftSize?: string | null;
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

type GateWithStatus = AirportGate & { available: boolean };

export default function PorteDepartSelect({ aeroport, aircraftSize: _aircraftSize, value, onChange, required = false, disabled = false }: Props) {
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
        // Si la valeur actuelle n'est plus dans la liste, la réinitialiser
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

  return (
    <div>
      {loading ? (
        <div className="h-10 rounded-xl border border-slate-600/50 bg-slate-900/50 flex items-center px-3 text-sm text-slate-400 animate-pulse">
          Chargement des portes…
        </div>
      ) : gates.length === 0 ? (
        <div className="h-10 rounded-xl border border-slate-700/50 bg-slate-900/30 flex items-center px-3 text-sm text-slate-500">
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
    </div>
  );
}
