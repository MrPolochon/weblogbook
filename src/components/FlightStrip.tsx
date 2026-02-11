'use client';

import { useState, useRef, useCallback, useEffect } from 'react';
import { Trash2, GripVertical, CheckCircle, XCircle, Radio, Plane, MessageSquare } from 'lucide-react';

export type StripData = {
  id: string;
  numero_vol: string;
  aeroport_depart: string;
  aeroport_arrivee: string;
  type_vol: string;
  statut: string;
  created_at: string;
  accepted_at: string | null;
  immatriculation: string | null;
  type_avion_code_oaci: string | null;
  type_avion_nom: string | null;
  type_wake: string;
  code_transpondeur: string | null;
  squawk_attendu: string | null;
  sid_depart: string | null;
  strip_atd: string | null;
  strip_rwy: string | null;
  strip_fl: string | null;
  strip_fl_unit: string | null;
  strip_sid_atc: string | null;
  strip_note_1: string | null;
  strip_note_2: string | null;
  strip_note_3: string | null;
  strip_zone: string | null;
  strip_order: number;
  pilote_identifiant?: string | null;
  intentions_vol?: string | null;
  instructions_atc?: string | null;
  automonitoring?: boolean;
};

type EditableField = 'strip_atd' | 'strip_rwy' | 'strip_fl' | 'strip_fl_unit' | 'strip_sid_atc' | 'strip_note_1' | 'strip_note_2' | 'strip_note_3';

function getSquawkColor(code: string | null): string | null {
  if (!code) return null;
  const c = code.trim();
  if (c === '7500') return 'hijack';
  if (c === '7600') return 'radio';
  if (c === '7700') return 'emergency';
  return null;
}
function getSquawkLabel(code: string | null): string | null {
  if (!code) return null;
  const c = code.trim();
  if (c === '7500') return 'HIJACK';
  if (c === '7600') return 'RADIO FAIL';
  if (c === '7700') return 'EMERGENCY';
  return null;
}
function formatCtot(createdAt: string): string {
  try { return new Date(createdAt).toISOString().slice(11, 16); }
  catch { return '—'; }
}

/* ============================================================ */
/*  INLINE EDIT — champ modifiable dans le strip                  */
/* ============================================================ */
function InlineEdit({
  value, field, planId, placeholder, maxLength, onSaved, large,
}: {
  value: string | null; field: EditableField; planId: string;
  placeholder: string; maxLength?: number; onSaved?: () => void; large?: boolean;
}) {
  const [editing, setEditing] = useState(false);
  const [text, setText] = useState(value || '');
  const [saving, setSaving] = useState(false);
  const [hovered, setHovered] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  // Force focus when editing starts — runs after render so input exists in DOM
  useEffect(() => {
    if (editing && inputRef.current) {
      inputRef.current.focus();
      inputRef.current.select();
    }
  }, [editing]);

  // Sync external value when not editing
  useEffect(() => {
    if (!editing) setText(value || '');
  }, [value, editing]);

  const save = useCallback(async (val: string) => {
    setSaving(true);
    try {
      const res = await fetch(`/api/plans-vol/${planId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'update_strip', [field]: val }),
      });
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        console.error('Strip save error:', d.error || res.statusText);
      }
    } catch (err) {
      console.error('Strip save error:', err);
    }
    setSaving(false);
    setEditing(false);
    onSaved?.();
  }, [planId, field, onSaved]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') { e.preventDefault(); save(text); }
    if (e.key === 'Escape') { setEditing(false); setText(value || ''); }
  };

  const clearField = (e: React.MouseEvent) => {
    e.stopPropagation();
    setText('');
    save('');
  };

  if (editing) {
    return (
      <input
        ref={inputRef}
        className={`bg-white text-slate-900 border-2 border-sky-400 rounded outline-none w-full font-mono z-10 ${large ? 'text-sm px-1 py-0.5' : 'text-xs px-1 py-0.5'}`}
        value={text}
        maxLength={maxLength || 20}
        onChange={(e) => setText(e.target.value)}
        onKeyDown={handleKeyDown}
        onBlur={() => save(text)}
        onClick={(e) => e.stopPropagation()}
        disabled={saving}
      />
    );
  }

  return (
    <div
      className={`relative cursor-text min-h-[22px] flex items-center rounded px-0.5 transition-colors ${hovered ? 'bg-white/50 ring-1 ring-sky-300' : ''}`}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      onClick={(e) => {
        e.stopPropagation();
        setEditing(true);
        setText(value || '');
      }}
    >
      <span className={`font-mono leading-snug ${large ? 'text-sm font-bold' : 'text-xs'} ${value ? 'text-slate-900' : 'text-slate-400 italic'}`}>
        {value || placeholder}
      </span>
      {hovered && value && (
        <button type="button" onClick={clearField} className="absolute -top-1 -right-1 p-0.5 bg-red-500 text-white rounded-full hover:bg-red-600 z-10 shadow" title="Effacer">
          <Trash2 className="h-2.5 w-2.5" />
        </button>
      )}
    </div>
  );
}

/* ============================================================ */
/*  FL / ft toggle                                                */
/* ============================================================ */
function FlUnitToggle({ planId, unit, onSaved }: { planId: string; unit: string | null; onSaved?: () => void }) {
  const current = unit || 'FL';
  const toggle = async (e: React.MouseEvent) => {
    e.stopPropagation();
    const next = current === 'FL' ? 'ft' : 'FL';
    await fetch(`/api/plans-vol/${planId}`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'update_strip', strip_fl_unit: next }),
    });
    onSaved?.();
  };
  return (
    <button type="button" onClick={toggle} className="text-[9px] font-bold text-sky-700 hover:text-sky-500 bg-sky-100 hover:bg-sky-200 rounded px-1 leading-none" title={`Basculer FL/ft`}>
      {current}
    </button>
  );
}

/* ============================================================ */
/*  ACTION BAR                                                     */
/* ============================================================ */
function StripActionBar({ strip, onRefresh }: { strip: StripData; onRefresh?: () => void }) {
  const [loading, setLoading] = useState<string | null>(null);
  const [showRefuse, setShowRefuse] = useState(false);
  const [showInstructions, setShowInstructions] = useState(false);
  const [refuseReason, setRefuseReason] = useState('');
  const [instructionsText, setInstructionsText] = useState(strip.instructions_atc || '');

  const callAction = async (action: string, body: Record<string, unknown> = {}) => {
    setLoading(action);
    try {
      const res = await fetch(`/api/plans-vol/${strip.id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action, ...body }) });
      const d = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(d.error || 'Erreur');
      onRefresh?.();
    } catch (e) { alert(e instanceof Error ? e.message : 'Erreur'); }
    finally { setLoading(null); }
  };

  const statut = strip.statut;
  const isAutomonitoring = strip.automonitoring;

  if (showRefuse) {
    return (
      <div className="px-2 py-2 bg-red-50 border-t border-red-200 space-y-1" onClick={(e) => e.stopPropagation()}>
        <textarea autoFocus value={refuseReason} onChange={(e) => setRefuseReason(e.target.value)} placeholder="Raison du refus…" className="w-full text-xs border border-red-300 rounded px-2 py-1 bg-white text-slate-800 min-h-[36px] resize-none" />
        <div className="flex gap-1.5">
          <button type="button" onClick={async () => { if (!refuseReason.trim()) { alert('Raison obligatoire'); return; } await callAction('refuser', { refusal_reason: refuseReason.trim() }); setShowRefuse(false); setRefuseReason(''); }} disabled={loading === 'refuser'} className="px-2 py-0.5 text-[10px] font-semibold bg-red-600 text-white rounded hover:bg-red-700 disabled:opacity-50">{loading === 'refuser' ? '…' : 'Confirmer refus'}</button>
          <button type="button" onClick={() => { setShowRefuse(false); setRefuseReason(''); }} className="px-2 py-0.5 text-[10px] text-slate-600">Annuler</button>
        </div>
      </div>
    );
  }

  if (showInstructions) {
    return (
      <div className="px-2 py-2 bg-sky-50 border-t border-sky-200 space-y-1" onClick={(e) => e.stopPropagation()}>
        <textarea autoFocus value={instructionsText} onChange={(e) => setInstructionsText(e.target.value)} placeholder="Instructions ATC…" className="w-full text-xs border border-sky-300 rounded px-2 py-1 bg-white text-slate-800 min-h-[36px] resize-none" />
        <div className="flex gap-1.5">
          <button type="button" onClick={async () => { await callAction('instructions', { instructions: instructionsText }); setShowInstructions(false); }} disabled={loading === 'instructions'} className="px-2 py-0.5 text-[10px] font-semibold bg-sky-600 text-white rounded hover:bg-sky-700 disabled:opacity-50">{loading === 'instructions' ? '…' : 'Enregistrer'}</button>
          <button type="button" onClick={() => setShowInstructions(false)} className="px-2 py-0.5 text-[10px] text-slate-600">Annuler</button>
        </div>
      </div>
    );
  }

  const hasActions = (statut === 'en_attente' || statut === 'depose' || statut === 'en_attente_cloture' || statut === 'en_cours' || statut === 'accepte');
  if (!hasActions) return null;

  return (
    <div className="px-1.5 py-1 border-t border-slate-200 bg-slate-50/80 flex items-center gap-1 flex-wrap" onClick={(e) => e.stopPropagation()}>
      {strip.pilote_identifiant && (
        <span className="text-[9px] text-slate-500 mr-auto flex items-center gap-0.5"><Plane className="h-2.5 w-2.5" />{strip.pilote_identifiant}</span>
      )}
      {(statut === 'en_attente' || statut === 'depose') && (
        <>
          <button type="button" onClick={() => callAction('accepter')} disabled={loading !== null} className="inline-flex items-center gap-0.5 px-1.5 py-0.5 text-[10px] font-semibold bg-emerald-600 text-white rounded hover:bg-emerald-700 disabled:opacity-50"><CheckCircle className="h-3 w-3" />{loading === 'accepter' ? '…' : 'Accepter'}</button>
          <button type="button" onClick={() => setShowRefuse(true)} disabled={loading !== null} className="inline-flex items-center gap-0.5 px-1.5 py-0.5 text-[10px] font-semibold bg-red-600 text-white rounded hover:bg-red-700 disabled:opacity-50"><XCircle className="h-3 w-3" />Refuser</button>
        </>
      )}
      {statut === 'en_attente_cloture' && (
        <button type="button" onClick={() => callAction('confirmer_cloture')} disabled={loading !== null} className="inline-flex items-center gap-0.5 px-1.5 py-0.5 text-[10px] font-semibold bg-emerald-600 text-white rounded hover:bg-emerald-700 disabled:opacity-50 animate-pulse"><CheckCircle className="h-3 w-3" />{loading === 'confirmer_cloture' ? '…' : 'Confirmer clôture'}</button>
      )}
      {(statut === 'en_cours' || statut === 'accepte') && !isAutomonitoring && (
        <button type="button" onClick={() => callAction('transferer', { automonitoring: true })} disabled={loading !== null} className="inline-flex items-center gap-0.5 px-1.5 py-0.5 text-[10px] font-semibold bg-purple-600 text-white rounded hover:bg-purple-700 disabled:opacity-50"><Radio className="h-3 w-3" />{loading === 'transferer' ? '…' : 'Autosurv.'}</button>
      )}
      {(statut === 'en_cours' || statut === 'accepte' || statut === 'en_attente_cloture') && (
        <button type="button" onClick={() => { setInstructionsText(strip.instructions_atc || ''); setShowInstructions(true); }} disabled={loading !== null} className="inline-flex items-center gap-0.5 px-1.5 py-0.5 text-[10px] font-semibold bg-sky-600 text-white rounded hover:bg-sky-700 disabled:opacity-50"><MessageSquare className="h-3 w-3" />Instr.</button>
      )}
    </div>
  );
}

/* ============================================================ */
/*  Cellule du strip (wrapper simplifié)                          */
/* ============================================================ */
function Cell({ children, className = '' }: { children: React.ReactNode; className?: string }) {
  return <div className={`px-1.5 py-1 ${className}`}>{children}</div>;
}

/* ============================================================ */
/*  STRIP COMPONENT — conforme au format ATC standard              */
/* ============================================================ */
/*
  Reference layout (7 data columns):
  ┌──────┬──────────┬──────┬─────────╫──────────┬──────────┬──────────┐
  │ ATD  │ TYPE/W   │  1   │  NOTE   ║ SQUAWK   │ CLR REV  │ INFO     │
  ├──────┼──────────┴──────┼─────────╫──────────┼──────────┴──────────┤
  │ ADES │ CALLSIGN       │  ADEP   ║ SID      │  (type vol)         │
  ├──────┼──────────┬──────┴─────────╫──────────┼─────────────────────┤
  │ RWY  │ CTOT     │ TAIL          ║ FL xxx   │ STATUT              │
  └──────┴──────────┴───────────────╨──────────┴─────────────────────┘
  ⠿ drag handle on the left
*/
export default function FlightStrip({
  strip, onRefresh, onContextMenu, dragHandleProps,
}: {
  strip: StripData;
  onRefresh?: () => void;
  onContextMenu?: (e: React.MouseEvent, stripId: string) => void;
  dragHandleProps?: { draggable: true; onDragStart: (e: React.DragEvent) => void; onDragEnd: (e: React.DragEvent) => void; };
}) {
  const sqColor = getSquawkColor(strip.code_transpondeur);
  const sqLabel = getSquawkLabel(strip.code_transpondeur);
  const isEmergency = !!sqColor;
  const squawkMismatch = strip.squawk_attendu && strip.code_transpondeur && strip.code_transpondeur !== strip.squawk_attendu;
  const noSquawk = strip.squawk_attendu && !strip.code_transpondeur;

  // Color scheme
  const border = isEmergency ? (sqColor === 'hijack' ? 'border-red-700' : sqColor === 'radio' ? 'border-amber-600' : 'border-red-600') : 'border-[#8fbc8f]';
  const leftBg = isEmergency ? (sqColor === 'hijack' ? 'bg-red-100' : sqColor === 'radio' ? 'bg-amber-100' : 'bg-red-100') : 'bg-[#d5ecd5]';
  const rightBg = isEmergency ? (sqColor === 'hijack' ? 'bg-red-200' : sqColor === 'radio' ? 'bg-amber-200' : 'bg-red-200') : 'bg-[#f5f0c8]';
  const topBg = isEmergency ? (sqColor === 'hijack' ? 'bg-red-200' : sqColor === 'radio' ? 'bg-amber-200' : 'bg-red-200') : 'bg-[#c5dcc5]';
  const sep = isEmergency ? 'border-red-300' : 'border-[#8fbc8f]';
  const txt = 'text-slate-900';
  const lbl = 'text-slate-500';

  return (
    <div className={`border ${border} rounded shadow-sm select-none overflow-hidden`} onContextMenu={(e) => { e.preventDefault(); onContextMenu?.(e, strip.id); }}>
      {/* Emergency banner */}
      {sqLabel && <div className="bg-black text-white text-center text-xs font-black tracking-[0.3em] py-0.5 animate-pulse">{sqLabel}</div>}
      {(squawkMismatch || noSquawk) && !sqLabel && (
        <div className="bg-amber-400 text-black text-center text-[10px] font-bold py-0.5">
          {noSquawk ? '⚠ PAS DE TRANSPONDEUR' : `⚠ SQUAWK INCORRECT (attendu: ${strip.squawk_attendu})`}
        </div>
      )}

      <div className="flex">
        {/* ═══ DRAG HANDLE ═══ */}
        <div
          className={`w-5 flex items-center justify-center cursor-grab active:cursor-grabbing ${topBg} border-r ${sep} shrink-0`}
          {...dragHandleProps}
        >
          <GripVertical className="h-3.5 w-3.5 text-slate-400" />
        </div>

        {/* ═══ STRIP BODY ═══ */}
        <div className="flex-1 flex">
          {/* ─── LEFT SECTION (4 cols) ─── */}
          <div className="flex-1 min-w-0">
            {/* ROW 1 */}
            <div className={`flex ${topBg} border-b ${sep}`}>
              <Cell className={`w-[70px] border-r ${sep}`}>
                <div className={`text-[9px] ${lbl} leading-none`}>ATD</div>
                <InlineEdit value={strip.strip_atd} field="strip_atd" planId={strip.id} placeholder="—" onSaved={onRefresh} maxLength={5} large />
              </Cell>
              <Cell className={`w-[100px] border-r ${sep}`}>
                <div className={`text-[9px] ${lbl} leading-none`}>TYPE/W</div>
                <span className={`text-sm font-mono font-bold ${txt}`}>{strip.type_wake}</span>
              </Cell>
              <Cell className={`w-[50px] border-r ${sep} text-center`}>
                <div className={`text-[9px] ${lbl} leading-none`}>{strip.type_vol}</div>
                <span className={`text-xs font-mono font-bold ${txt}`}>1</span>
              </Cell>
              <Cell className="flex-1">
                <div className={`text-[9px] ${lbl} leading-none`}>NOTE</div>
                <InlineEdit value={strip.strip_note_1} field="strip_note_1" planId={strip.id} placeholder="—" onSaved={onRefresh} maxLength={20} />
              </Cell>
            </div>
            {/* ROW 2 */}
            <div className={`flex ${leftBg} border-b ${sep}`}>
              <Cell className={`w-[70px] border-r ${sep}`}>
                <div className={`text-[9px] ${lbl} leading-none`}>ADES</div>
                <span className={`text-base font-mono font-black ${txt} leading-tight`}>{strip.aeroport_arrivee}</span>
              </Cell>
              <Cell className={`w-[150px] border-r ${sep}`}>
                <div className={`text-[9px] ${lbl} leading-none`}>CALLSIGN</div>
                <span className={`text-lg font-mono font-black tracking-wide ${txt} leading-tight`}>{strip.numero_vol}</span>
              </Cell>
              <Cell className="flex-1">
                <div className={`text-[9px] ${lbl} leading-none`}>ADEP</div>
                <span className={`text-sm font-mono font-semibold ${txt}`}>{strip.aeroport_depart}</span>
              </Cell>
            </div>
            {/* ROW 3 */}
            <div className={`flex ${leftBg}`}>
              <Cell className={`w-[70px] border-r ${sep}`}>
                <div className={`text-[9px] ${lbl} leading-none`}>RWY</div>
                <InlineEdit value={strip.strip_rwy} field="strip_rwy" planId={strip.id} placeholder="—" onSaved={onRefresh} maxLength={5} large />
              </Cell>
              <Cell className={`w-[100px] border-r ${sep}`}>
                <div className={`text-[9px] ${lbl} leading-none`}>CTOT</div>
                <span className={`text-sm font-mono font-semibold ${txt}`}>{formatCtot(strip.created_at)}</span>
              </Cell>
              <Cell className="flex-1">
                <div className={`text-[9px] ${lbl} leading-none`}>TAIL</div>
                <span className={`text-sm font-mono font-bold ${txt}`}>{strip.immatriculation || '—'}</span>
              </Cell>
            </div>
          </div>

          {/* ─── RED DIVIDER ─── */}
          <div className="w-[3px] bg-red-500 shrink-0" />

          {/* ─── RIGHT SECTION — CLEARANCE (3 cols) ─── */}
          <div className={`w-[280px] shrink-0 ${rightBg}`}>
            {/* ROW 1 */}
            <div className={`flex border-b ${sep}`}>
              <Cell className={`w-[90px] border-r ${sep}`}>
                <div className={`text-[9px] ${lbl} leading-none`}>SQUAWK</div>
                <span className={`text-sm font-mono font-black ${txt}`}>{strip.code_transpondeur || '—'}</span>
              </Cell>
              <Cell className={`w-[90px] border-r ${sep}`}>
                <div className={`text-[9px] ${lbl} leading-none`}>CLR REV</div>
                <InlineEdit value={strip.strip_note_2} field="strip_note_2" planId={strip.id} placeholder="—" onSaved={onRefresh} maxLength={20} />
              </Cell>
              <Cell className="flex-1">
                <div className={`text-[9px] ${lbl} leading-none`}>INFO</div>
                <InlineEdit value={strip.strip_note_3} field="strip_note_3" planId={strip.id} placeholder="—" onSaved={onRefresh} maxLength={30} />
              </Cell>
            </div>
            {/* ROW 2 */}
            <div className={`flex border-b ${sep}`}>
              <Cell className={`w-[90px] border-r ${sep}`}>
                <div className={`text-[9px] ${lbl} leading-none`}>SID</div>
                <InlineEdit value={strip.strip_sid_atc || strip.sid_depart} field="strip_sid_atc" planId={strip.id} placeholder="—" onSaved={onRefresh} maxLength={15} large />
              </Cell>
              <Cell className="flex-1">
                <span className={`text-[10px] font-mono ${txt}`}>{strip.type_avion_nom || ''}</span>
              </Cell>
            </div>
            {/* ROW 3 */}
            <div className="flex">
              <Cell className={`w-[90px] border-r ${sep}`}>
                <div className="flex items-center gap-0.5">
                  <FlUnitToggle planId={strip.id} unit={strip.strip_fl_unit} onSaved={onRefresh} />
                  <span className={`text-[9px] ${lbl}`}>ALT</span>
                </div>
                <InlineEdit value={strip.strip_fl} field="strip_fl" planId={strip.id} placeholder="—" onSaved={onRefresh} maxLength={5} large />
              </Cell>
              <Cell className="flex-1">
                <div className={`text-[9px] ${lbl} leading-none`}>STATUT</div>
                <span className={`text-[11px] font-semibold uppercase ${
                  strip.statut === 'en_cours' ? 'text-sky-700' :
                  strip.statut === 'en_attente_cloture' ? 'text-orange-700' :
                  strip.statut === 'accepte' ? 'text-emerald-700' :
                  (strip.statut === 'depose' || strip.statut === 'en_attente') ? 'text-amber-700' : txt
                }`}>
                  {strip.statut === 'en_cours' ? 'EN VOL' :
                   strip.statut === 'en_attente_cloture' ? 'CLÔTURE' :
                   strip.statut === 'accepte' ? 'ACCEPTÉ' :
                   strip.statut === 'depose' ? 'DÉPOSÉ' :
                   strip.statut === 'en_attente' ? 'EN ATTENTE' :
                   strip.statut}
                </span>
              </Cell>
            </div>
          </div>
        </div>
      </div>

      {/* ACTION BAR */}
      <StripActionBar strip={strip} onRefresh={onRefresh} />
    </div>
  );
}
