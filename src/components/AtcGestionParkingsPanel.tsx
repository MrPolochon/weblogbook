'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import {
  LayoutGrid, X, RefreshCw, Plane, PlaneLanding, ArrowUpRight, ChevronLeft,
} from 'lucide-react';
import { toast } from 'sonner';
import { createClient } from '@/lib/supabase/client';
import { useAtcTheme } from '@/contexts/AtcThemeContext';

interface PlanVolData {
  id: string;
  callsign: string | null;
  numero_vol?: string | null;
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
  max_aircraft_size: string | null;
  terminal: string | null;
  available: boolean;
  occupancy_type: 'depart' | 'arrivee' | null;
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
  automonitoring: 'Autosurv.',
  en_attente_cloture: 'Clôture',
};

const GATE_TYPE_LABEL: Record<string, string> = {
  light: 'Light',
  medium: 'Medium',
  heavy: 'Heavy',
  super_heavy: 'Super Heavy',
  helicopter: 'Héli',
  cargo: 'Cargo',
  general_aviation: 'AG',
  unrestricted: 'Libre',
  special: 'Spécial',
};

function flightLabel(plan: Pick<PlanVolData, 'callsign' | 'numero_vol' | 'immatriculation'>): string {
  return plan.callsign || plan.numero_vol || plan.immatriculation || '—';
}

export default function AtcGestionParkingsPanel({ aeroport }: Props) {
  const { theme } = useAtcTheme();
  const isDark = theme === 'dark';
  const [open, setOpen] = useState(false);
  const [gates, setGates] = useState<GateData[]>([]);
  const [inbound, setInbound] = useState<PlanVolData[]>([]);
  const [loading, setLoading] = useState(false);
  const [assigningId, setAssigningId] = useState<string | null>(null);
  const [selectedPlanId, setSelectedPlanId] = useState<string | null>(null);
  const [assignError, setAssignError] = useState<string | null>(null);

  const loadGates = useCallback(async () => {
    if (!aeroport) return;
    setLoading(true);
    try {
      const res = await fetch(`/api/ground/gates?aeroport=${encodeURIComponent(aeroport)}`);
      const data = await res.json() as { gates?: GateData[]; inbound?: PlanVolData[]; error?: string };
      if (!res.ok) {
        setAssignError(data.error ?? 'Impossible de charger les parkings.');
        return;
      }
      setGates(data.gates ?? []);
      setInbound(data.inbound ?? []);
    } catch {
      setAssignError('Impossible de charger les parkings.');
    } finally {
      setLoading(false);
    }
  }, [aeroport]);

  useEffect(() => {
    if (!open || !aeroport) return;
    void loadGates();
    const timer = window.setInterval(() => { void loadGates(); }, 10000);
    const supabase = createClient();
    const channel = supabase
      .channel(`atc-parkings-${aeroport}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'plans_vol', filter: `aeroport_arrivee=eq.${aeroport}` }, () => { void loadGates(); })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'plans_vol', filter: `aeroport_depart=eq.${aeroport}` }, () => { void loadGates(); })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'gate_assignments', filter: `aeroport=eq.${aeroport}` }, () => { void loadGates(); })
      .subscribe();
    return () => {
      window.clearInterval(timer);
      void supabase.removeChannel(channel);
    };
  }, [open, aeroport, loadGates]);

  const selectedInbound = inbound.find((p) => p.id === selectedPlanId) ?? null;
  const selectedOccupied = useMemo(() => {
    if (!selectedPlanId) return null;
    return gates.find((g) => g.occupancy_type === 'arrivee' && g.plan_vol?.id === selectedPlanId) ?? null;
  }, [gates, selectedPlanId]);
  const selectedPlan = selectedInbound ?? selectedOccupied?.plan_vol ?? null;

  useEffect(() => {
    if (selectedPlanId && !selectedPlan) setSelectedPlanId(null);
  }, [selectedPlanId, selectedPlan]);

  if (!aeroport) return null;

  const occupiedDepart = gates.filter((g) => g.occupancy_type === 'depart');
  const occupiedArrivee = gates.filter((g) => g.occupancy_type === 'arrivee');
  const libres = gates.filter((g) => g.available);
  const occupied = occupiedDepart.length + occupiedArrivee.length;
  const total = gates.length;

  const byTerminal = gates.reduce<Record<string, GateData[]>>((acc, g) => {
    const t = g.terminal ?? 'Hors terminal';
    if (!acc[t]) acc[t] = [];
    acc[t].push(g);
    return acc;
  }, {});

  async function assignToGate(gate: GateData) {
    if (!selectedPlan || !aeroport) return;
    if (!gate.available && gate.plan_vol?.id !== selectedPlan.id) return;
    setAssignError(null);
    setAssigningId(gate.id);
    try {
      const res = await fetch(`/api/ground/gates/${gate.id}/assign`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          plan_vol_id: selectedPlan.id,
          assignment_type: 'arrivee',
          aeroport,
        }),
      });
      const data = await res.json() as { error?: string };
      if (!res.ok) {
        const msg = data.error ?? 'Attribution impossible.';
        setAssignError(msg);
        toast.error(msg);
        return;
      }
      toast.success(`${flightLabel(selectedPlan)} → ${gate.gate_code}`);
      setSelectedPlanId(null);
      await loadGates();
    } catch {
      const msg = 'Attribution impossible.';
      setAssignError(msg);
      toast.error(msg);
    } finally {
      setAssigningId(null);
    }
  }

  const panelBg = isDark ? 'bg-[#080c14]/95 border-slate-800' : 'bg-white/95 border-slate-300';
  const headerBorder = isDark ? 'border-slate-800 bg-slate-900/40' : 'border-slate-200 bg-slate-50';
  const muted = isDark ? 'text-slate-400' : 'text-slate-500';
  const title = isDark ? 'text-slate-100' : 'text-slate-900';
  const tabBtn = `fixed top-1/3 -translate-y-1/2 z-50 flex flex-col items-center justify-center gap-1 rounded-r-xl border border-l-0 px-2 py-6 shadow-xl cursor-pointer transition-all duration-300 ease-in-out ${
    isDark
      ? 'border-slate-700/50 bg-slate-900/80 hover:bg-slate-800'
      : 'border-slate-300 bg-white/90 hover:bg-slate-50'
  } ${open ? 'left-[420px]' : 'left-0'}`;

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        title="Gestion Parkings"
        aria-label="Ouvrir le panel gestion parkings"
        aria-expanded={open}
        className={tabBtn}
      >
        <LayoutGrid className={`h-4 w-4 ${muted}`} />
        <span className={`text-[9px] font-bold ${muted}`} style={{ writingMode: 'vertical-rl' }}>
          Parkings
        </span>
        {inbound.length > 0 && (
          <span className="flex h-4 min-w-[1rem] items-center justify-center rounded-full bg-sky-500 text-[9px] font-bold text-white">
            {inbound.length}
          </span>
        )}
        {inbound.length === 0 && occupied > 0 && (
          <span className={`flex h-4 min-w-[1rem] items-center justify-center rounded-full text-[9px] font-bold ${isDark ? 'bg-slate-700 text-slate-200' : 'bg-slate-200 text-slate-700'}`}>
            {occupied}
          </span>
        )}
        <ChevronLeft className={`h-3 w-3 ${muted} transition-transform duration-300 ${open ? '' : 'rotate-180'}`} />
      </button>

      <div
        className={`fixed inset-0 z-40 transition-opacity duration-300 bg-black/20 backdrop-blur-[1px] ${open ? 'opacity-100 pointer-events-auto' : 'opacity-0 pointer-events-none'}`}
        onClick={() => setOpen(false)}
      />
      <div className={`fixed left-0 top-0 h-full z-50 w-[420px] max-w-[100vw] border-r shadow-2xl flex flex-col transition-transform duration-300 ease-in-out ${panelBg} ${open ? 'translate-x-0' : '-translate-x-full'}`}>
        <div className={`flex items-center justify-between px-4 py-3 border-b ${headerBorder}`}>
          <div className="flex items-center gap-2">
            <LayoutGrid className={`h-4 w-4 ${muted}`} />
            <span className={`font-bold text-sm ${title}`}>Parkings — {aeroport}</span>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => { void loadGates(); }}
              className={`flex items-center gap-1 text-xs px-2 py-1 rounded ${muted} hover:opacity-80`}
            >
              <RefreshCw className={`h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`} />
            </button>
            <button
              type="button"
              onClick={() => setOpen(false)}
              className={`flex items-center justify-center h-8 w-8 rounded-lg border ${isDark ? 'border-slate-700/50 text-slate-400' : 'border-slate-300 text-slate-500'}`}
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>

        <div className={`flex gap-2 p-3 border-b ${isDark ? 'border-slate-800' : 'border-slate-200'}`}>
          <StatChip label="À placer" value={inbound.length} tone="sky" isDark={isDark} />
          <StatChip label="Libres" value={libres.length} tone="emerald" isDark={isDark} />
          <StatChip label="Départ" value={occupiedDepart.length} tone="amber" isDark={isDark} />
          <StatChip label="Arrivée" value={occupiedArrivee.length} tone="violet" isDark={isDark} />
        </div>

        <div className="flex-1 overflow-y-auto p-3 space-y-4">
          {assignError && (
            <p className={`text-xs rounded-lg border px-2.5 py-2 ${isDark ? 'border-red-800/50 bg-red-950/40 text-red-300' : 'border-red-200 bg-red-50 text-red-700'}`}>
              {assignError}
            </p>
          )}

          {selectedPlan && (
            <p className={`text-[11px] rounded-lg border px-2.5 py-2 ${isDark ? 'border-sky-800/60 bg-sky-950/40 text-sky-200' : 'border-sky-200 bg-sky-50 text-sky-800'}`}>
              {flightLabel(selectedPlan)} sélectionné — cliquez un stand <strong>libre</strong> pour attribuer
              {selectedOccupied ? ` (actuellement ${selectedOccupied.gate_code})` : ''}.
            </p>
          )}

          {inbound.length > 0 && (
            <section>
              <p className={`text-[10px] font-black uppercase tracking-wider mb-1.5 flex items-center gap-1.5 ${isDark ? 'text-sky-400' : 'text-sky-700'}`}>
                <PlaneLanding className="h-3 w-3" /> Arrivées à placer
              </p>
              <div className="flex flex-wrap gap-1.5">
                {inbound.map((plan) => {
                  const active = selectedPlanId === plan.id;
                  return (
                    <button
                      key={plan.id}
                      type="button"
                      onClick={() => {
                        setAssignError(null);
                        setSelectedPlanId((id) => (id === plan.id ? null : plan.id));
                      }}
                      className={`rounded-lg border px-2 py-1.5 text-left text-[11px] transition-colors ${
                        active
                          ? (isDark ? 'border-sky-400 bg-sky-500/30 text-sky-100' : 'border-sky-500 bg-sky-100 text-sky-900')
                          : (isDark ? 'border-slate-700 bg-slate-900/60 text-slate-200 hover:border-sky-700' : 'border-slate-200 bg-white text-slate-800 hover:border-sky-300')
                      }`}
                    >
                      <span className="font-mono font-bold">{flightLabel(plan)}</span>
                      <span className={`block text-[10px] ${muted}`}>
                        {plan.aeroport_depart}→{plan.aeroport_arrivee}
                        {plan.type_avion ? ` · ${plan.type_avion}` : ''}
                      </span>
                    </button>
                  );
                })}
              </div>
            </section>
          )}

          {total === 0 ? (
            <div className={`text-center py-8 text-sm ${muted}`}>
              Aucune porte configurée pour {aeroport}
            </div>
          ) : (
            Object.entries(byTerminal).map(([terminal, terminalGates]) => (
              <div key={terminal}>
                <p className={`text-[10px] font-bold uppercase tracking-wider mb-1.5 ${muted}`}>{terminal}</p>
                <div className="space-y-1">
                  {terminalGates.map((gate) => (
                    <GateRow
                      key={gate.id}
                      gate={gate}
                      isDark={isDark}
                      selectedPlanId={selectedPlanId}
                      busy={assigningId === gate.id}
                      canAssign={Boolean(selectedPlan) && (gate.available || gate.plan_vol?.id === selectedPlan?.id)}
                      onSelectOccupiedArrivee={() => {
                        if (gate.occupancy_type === 'arrivee' && gate.plan_vol) {
                          setAssignError(null);
                          setSelectedPlanId((id) => (id === gate.plan_vol!.id ? null : gate.plan_vol!.id));
                        }
                      }}
                      onAssign={() => { void assignToGate(gate); }}
                    />
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

function StatChip({
  label, value, tone, isDark,
}: { label: string; value: number; tone: 'sky' | 'emerald' | 'amber' | 'violet'; isDark: boolean }) {
  const tones = {
    sky: isDark ? 'border-sky-800/40 bg-sky-900/10 text-sky-400' : 'border-sky-200 bg-sky-50 text-sky-700',
    emerald: isDark ? 'border-emerald-800/40 bg-emerald-900/10 text-emerald-400' : 'border-emerald-200 bg-emerald-50 text-emerald-700',
    amber: isDark ? 'border-amber-800/40 bg-amber-900/10 text-amber-400' : 'border-amber-200 bg-amber-50 text-amber-800',
    violet: isDark ? 'border-violet-800/40 bg-violet-900/10 text-violet-400' : 'border-violet-200 bg-violet-50 text-violet-700',
  };
  return (
    <div className={`flex-1 rounded-lg border p-2 text-center ${tones[tone]}`}>
      <p className="text-lg font-black">{value}</p>
      <p className="text-[10px] opacity-70">{label}</p>
    </div>
  );
}

function GateRow({
  gate, isDark, selectedPlanId, busy, canAssign, onSelectOccupiedArrivee, onAssign,
}: {
  gate: GateData;
  isDark: boolean;
  selectedPlanId: string | null;
  busy: boolean;
  canAssign: boolean;
  onSelectOccupiedArrivee: () => void;
  onAssign: () => void;
}) {
  const plan = gate.plan_vol;
  const isDepart = gate.occupancy_type === 'depart';
  const isArrivee = gate.occupancy_type === 'arrivee';
  const selectedHere = Boolean(plan && selectedPlanId === plan.id);
  const typeLabel = GATE_TYPE_LABEL[gate.gate_type] ?? gate.gate_type;

  let wrap = isDark ? 'border-emerald-800/30 bg-emerald-900/10' : 'border-emerald-200 bg-emerald-50/80';
  let codeColor = isDark ? 'text-emerald-300' : 'text-emerald-700';
  if (isDepart) {
    wrap = isDark ? 'border-amber-700/40 bg-amber-900/15' : 'border-amber-200 bg-amber-50';
    codeColor = isDark ? 'text-amber-200' : 'text-amber-800';
  } else if (isArrivee) {
    wrap = isDark ? 'border-violet-700/40 bg-violet-900/15' : 'border-violet-200 bg-violet-50';
    codeColor = isDark ? 'text-violet-200' : 'text-violet-800';
  }
  if (selectedHere) {
    wrap = isDark ? 'border-sky-400 bg-sky-500/20' : 'border-sky-500 bg-sky-100';
  }
  if (canAssign && gate.available) {
    wrap += isDark ? ' hover:border-sky-400 cursor-pointer' : ' hover:border-sky-500 cursor-pointer';
  }

  const interactiveFree = canAssign && gate.available;
  const interactiveArrivee = isArrivee && Boolean(plan);

  return (
    <div
      role={interactiveFree || interactiveArrivee ? 'button' : undefined}
      tabIndex={interactiveFree || interactiveArrivee ? 0 : undefined}
      onClick={() => {
        if (busy) return;
        if (interactiveFree) onAssign();
        else if (interactiveArrivee) onSelectOccupiedArrivee();
      }}
      onKeyDown={(e) => {
        if (e.key !== 'Enter' && e.key !== ' ') return;
        e.preventDefault();
        if (busy) return;
        if (interactiveFree) onAssign();
        else if (interactiveArrivee) onSelectOccupiedArrivee();
      }}
      className={`flex items-center gap-2 rounded-lg border px-2.5 py-2 text-xs ${wrap} ${busy ? 'opacity-60' : ''}`}
    >
      <div className="min-w-[72px]">
        <span className={`font-bold text-sm ${codeColor}`}>{gate.gate_code}</span>
        <p className={`text-[9px] ${isDark ? 'text-slate-500' : 'text-slate-400'}`}>
          {typeLabel}{gate.max_aircraft_size ? ` · ${gate.max_aircraft_size}` : ''}
        </p>
      </div>

      {gate.available ? (
        <span className={isDark ? 'text-emerald-500/80' : 'text-emerald-600'}>
          {canAssign ? (busy ? 'Attribution…' : 'Attribuer ici') : 'Libre'}
        </span>
      ) : plan ? (
        <div className="flex items-center gap-2 flex-1 min-w-0">
          <div className={`rounded-full p-0.5 ${isArrivee ? (isDark ? 'bg-violet-800/40' : 'bg-violet-200') : (isDark ? 'bg-amber-800/40' : 'bg-amber-200')}`}>
            {isArrivee
              ? <PlaneLanding className={`h-2.5 w-2.5 ${isDark ? 'text-violet-300' : 'text-violet-700'}`} />
              : <ArrowUpRight className={`h-2.5 w-2.5 ${isDark ? 'text-amber-300' : 'text-amber-700'}`} />
            }
          </div>
          <div className="min-w-0 flex-1">
            <p className={`font-mono font-semibold truncate ${isDark ? 'text-slate-200' : 'text-slate-800'}`}>
              {flightLabel(plan)}
            </p>
            <p className={`text-[10px] truncate ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>
              {plan.aeroport_depart}→{plan.aeroport_arrivee}
              {plan.type_avion ? ` · ${plan.type_avion}` : ''}
            </p>
          </div>
          <span className={`text-[9px] font-bold shrink-0 ${isArrivee ? (isDark ? 'text-violet-300' : 'text-violet-700') : (isDark ? 'text-amber-300' : 'text-amber-700')}`}>
            {isArrivee ? 'ARR' : 'DEP'} · {STATUT_LABELS[plan.statut] ?? plan.statut}
          </span>
        </div>
      ) : (
        <span className={isDark ? 'text-slate-500' : 'text-slate-400'}>Occupé</span>
      )}
      {isArrivee && !selectedHere && (
        <Plane className={`h-3 w-3 shrink-0 ${isDark ? 'text-violet-500' : 'text-violet-400'}`} />
      )}
    </div>
  );
}
