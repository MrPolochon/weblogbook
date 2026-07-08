'use client';

import { useState, useEffect, useCallback } from 'react';
import { LayoutGrid, X, RefreshCw, Plane, ArrowUp, ChevronLeft } from 'lucide-react';

interface PlanVolData {
  id: string;
  callsign: string | null;
  immatriculation: string | null;
  porte: string | null;
  statut: string;
  aeroport_depart: string;
  aeroport_arrivee: string;
  type_avion: string | null;
}

interface GateData {
  id: string;
  aeroport: string;
  gate_code: string;
  gate_type: string;
  terminal: string | null;
  available: boolean;
  plan_vol: PlanVolData | null;
}

interface Props {
  aeroport: string | null;
}

const STATUT_LABELS: Record<string, string> = {
  depose: 'Déposé',
  en_attente: 'En attente',
  accepte: 'Accepté',
  en_cours: 'En vol',
  en_attente_cloture: 'Clôture',
};

export default function AtcGestionParkingsPanel({ aeroport }: Props) {
  const [open, setOpen] = useState(false);
  const [gates, setGates] = useState<GateData[]>([]);
  const [loading, setLoading] = useState(false);

  const loadGates = useCallback(async () => {
    if (!aeroport) return;
    setLoading(true);
    try {
      const res = await fetch(`/api/ground/gates?aeroport=${aeroport}`);
      const data = await res.json() as { gates?: GateData[] };
      setGates(data.gates ?? []);
    } finally {
      setLoading(false);
    }
  }, [aeroport]);

  useEffect(() => {
    if (open) loadGates();
  }, [open, loadGates]);

  if (!aeroport) return null;

  const occupied = gates.filter((g) => !g.available).length;
  const total = gates.length;

  const byTerminal = gates.reduce<Record<string, GateData[]>>((acc, g) => {
    const t = g.terminal ?? 'Hors terminal';
    if (!acc[t]) acc[t] = [];
    acc[t].push(g);
    return acc;
  }, {});

  return (
    <>
      {/* Bouton d'ouverture */}
      <button
        type="button"
        onClick={() => setOpen(v => !v)}
        title="Gestion Parkings"
        aria-label="Ouvrir le panel gestion parkings"
        className="fixed right-0 top-1/3 -translate-y-1/2 z-30 flex flex-col items-center justify-center gap-1 rounded-l-xl border border-r-0 border-slate-700/50 bg-slate-800/60 px-2 py-6 hover:bg-slate-700/80 active:bg-slate-700 transition-colors shadow-xl cursor-pointer"
      >
        <LayoutGrid className="h-4 w-4 text-slate-400" />
        <span className="text-[9px] font-bold text-slate-400" style={{ writingMode: 'vertical-rl', transform: 'rotate(180deg)' }}>
          Parkings
        </span>
        {occupied > 0 && (
          <span className="flex h-4 min-w-[1rem] items-center justify-center rounded-full bg-sky-500 text-[9px] font-bold text-white">
            {occupied}
          </span>
        )}
        <ChevronLeft className={`h-3 w-3 text-slate-400 transition-transform duration-300 ${open ? 'rotate-180' : ''}`} />
      </button>

      {open && (
        <div className="fixed inset-0 z-40 bg-black/20 backdrop-blur-[1px]" onClick={() => setOpen(false)} />
      )}
      <div className={`fixed right-0 top-[4.5rem] h-[calc(100vh-4.5rem)] z-50 w-[420px] max-w-[100vw] bg-[#0a0f1c] border-l border-slate-700/50 shadow-2xl flex flex-col transform transition-transform duration-300 ease-in-out ${open ? 'translate-x-0' : 'translate-x-full'}`}>
            {/* Header */}
            <div className="flex items-center justify-between px-4 py-3 border-b border-slate-700/50 bg-slate-800/30">
              <div className="flex items-center gap-2">
                <LayoutGrid className="h-4 w-4 text-slate-400" />
                <span className="font-bold text-slate-100 text-sm">Gestion Parkings — {aeroport}</span>
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={loadGates}
                  className="flex items-center gap-1 text-xs text-slate-400 hover:text-slate-200 px-2 py-1 rounded"
                >
                  <RefreshCw className={`h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`} />
                </button>
                <button
                  type="button"
                  onClick={() => setOpen(false)}
                  className="flex items-center justify-center h-8 w-8 rounded-lg border border-slate-700/50 text-slate-400"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
            </div>

            {/* Stats */}
            <div className="flex gap-2 p-3 border-b border-slate-700/30">
              <div className="flex-1 rounded-lg border border-emerald-800/40 bg-emerald-900/10 p-2 text-center">
                <p className="text-lg font-black text-emerald-400">{total - occupied}</p>
                <p className="text-[10px] text-emerald-400/70">Libres</p>
              </div>
              <div className="flex-1 rounded-lg border border-sky-800/40 bg-sky-900/10 p-2 text-center">
                <p className="text-lg font-black text-sky-400">{occupied}</p>
                <p className="text-[10px] text-sky-400/70">Occupés</p>
              </div>
              <div className="flex-1 rounded-lg border border-slate-700/40 bg-slate-800/20 p-2 text-center">
                <p className="text-lg font-black text-slate-300">{total}</p>
                <p className="text-[10px] text-slate-400/70">Total</p>
              </div>
            </div>

            {/* Contenu */}
            <div className="flex-1 overflow-y-auto p-3 space-y-3">
              {total === 0 ? (
                <div className="text-center py-8 text-slate-500 text-sm">
                  Aucune porte configurée pour {aeroport}
                </div>
              ) : (
                Object.entries(byTerminal).map(([terminal, terminalGates]) => (
                  <div key={terminal}>
                    <p className="text-[10px] font-bold uppercase tracking-wider text-slate-500 mb-1.5">{terminal}</p>
                    <div className="space-y-1">
                      {terminalGates.map((gate) => (
                        <GateRow key={gate.id} gate={gate} />
                      ))}
                    </div>
                  </div>
                ))
              )}
            </div>
      </div>
    </>
  );
}

function GateRow({ gate }: { gate: GateData }) {
  const plan = gate.plan_vol;
  const isEnCours = plan?.statut === 'en_cours';

  return (
    <div className={`flex items-center gap-2 rounded-lg border px-2.5 py-2 text-xs ${
      gate.available
        ? 'border-emerald-800/30 bg-emerald-900/10'
        : isEnCours
        ? 'border-green-700/40 bg-green-900/20'
        : 'border-sky-700/40 bg-sky-900/20'
    }`}>
      <span className={`font-bold text-sm min-w-[70px] ${
        gate.available ? 'text-emerald-300' : isEnCours ? 'text-green-200' : 'text-sky-200'
      }`}>
        {gate.gate_code}
      </span>

      {gate.available ? (
        <span className="text-emerald-500/70">Libre</span>
      ) : plan ? (
        <div className="flex items-center gap-2 flex-1 min-w-0">
          <div className={`rounded-full p-0.5 ${isEnCours ? 'bg-green-800/40' : 'bg-sky-800/40'}`}>
            {isEnCours
              ? <ArrowUp className="h-2.5 w-2.5 text-green-400" />
              : <Plane className="h-2.5 w-2.5 text-sky-400" />
            }
          </div>
          <div className="min-w-0 flex-1">
            <p className="font-mono font-semibold text-slate-200 truncate">
              {plan.callsign ?? plan.immatriculation ?? '—'}
            </p>
            <p className="text-slate-400 text-[10px] truncate">
              {plan.aeroport_depart}→{plan.aeroport_arrivee}
              {plan.type_avion ? ` • ${plan.type_avion}` : ''}
            </p>
          </div>
          <span className={`text-[9px] font-bold shrink-0 ${isEnCours ? 'text-green-400' : 'text-sky-400'}`}>
            {STATUT_LABELS[plan.statut] ?? plan.statut}
          </span>
        </div>
      ) : (
        <span className="text-slate-500">Occupé</span>
      )}
    </div>
  );
}
