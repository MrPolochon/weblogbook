'use client';

import { useState, useRef, useCallback, useEffect } from 'react';
import { Trash2, GripVertical, CheckCircle, XCircle, Radio, Plane, MessageSquare } from 'lucide-react';
import { useAtcTheme } from '@/contexts/AtcThemeContext';

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
/*  Stratégie de persistance :                                    */
/*   - Le texte est gardé localement après sauvegarde             */
/*   - On ne fait PAS de router.refresh() après un edit inline    */
/*   - Si l'API échoue, le texte reste affiché avec bordure rouge */
/*   - Le sync serveur ne peut pas écraser une valeur locale      */
/* ============================================================ */
const NOT_SET = Symbol('NOT_SET');

function InlineEdit({
  value, field, planId, placeholder, maxLength, large,
}: {
  value: string | null; field: EditableField; planId: string;
  placeholder: string; maxLength?: number; onSaved?: () => void; large?: boolean;
}) {
  const [editing, setEditing] = useState(false);
  const [text, setText] = useState(value || '');
  // localOverride: symbol NOT_SET = never modified locally, string = local override
  const localOverride = useRef<string | typeof NOT_SET>(NOT_SET);
  const [, forceRender] = useState(0);
  const [saving, setSaving] = useState(false);
  const [hovered, setHovered] = useState(false);
  const [error, setError] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  // Force focus when editing starts
  useEffect(() => {
    if (editing && inputRef.current) {
      inputRef.current.focus();
      inputRef.current.select();
    }
  }, [editing]);

  // What to display: local override if set, otherwise server value
  const hasLocal = localOverride.current !== NOT_SET;
  const displayValue = hasLocal ? (localOverride.current as string) : (value || '');

  // Sync from server — only when we have NO local override
  useEffect(() => {
    if (!editing && !saving && !hasLocal) {
      setText(value || '');
    }
  }, [value, editing, saving, hasLocal]);

  // When server catches up to our local value, clear the override
  useEffect(() => {
    if (hasLocal && value === localOverride.current) {
      localOverride.current = NOT_SET;
    }
  }, [value, hasLocal]);

  const save = useCallback(async (val: string) => {
    setSaving(true);
    setError(false);
    const trimmed = val.trim();
    // Immediately set local override so text is visible even before API responds
    localOverride.current = trimmed;
    forceRender((n) => n + 1);

    try {
      const res = await fetch(`/api/plans-vol/${planId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'update_strip', [field]: trimmed || '' }),
      });
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        console.error('Strip save error:', d.error || res.statusText);
        setError(true);
        // Keep localOverride — text stays visible with a red border
      }
    } catch (err) {
      console.error('Strip save error:', err);
      setError(true);
      // Keep localOverride — text stays visible with a red border
    }
    setSaving(false);
    setEditing(false);
  }, [planId, field]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') { e.preventDefault(); save(text); }
    if (e.key === 'Escape') { setEditing(false); setText(displayValue); }
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
        className={`bg-white text-slate-900 border-2 border-sky-500 rounded outline-none w-full font-mono z-10 font-bold ${large ? 'text-base px-1 py-1' : 'text-sm px-1 py-0.5'}`}
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
      className={`relative cursor-text min-h-[24px] flex items-center rounded px-0.5 transition-colors ${hovered ? 'bg-white/30 ring-1 ring-sky-400' : ''} ${error ? 'ring-1 ring-red-400 bg-red-50/30' : ''}`}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      onClick={(e) => {
        e.stopPropagation();
        setEditing(true);
        setText(displayValue);
        setError(false);
      }}
      title={error ? 'Erreur de sauvegarde — cliquer pour réessayer' : undefined}
    >
      <span className={`font-mono leading-snug ${large ? 'text-base font-bold' : 'text-sm font-semibold'}`}>
        {displayValue || placeholder}
      </span>
      {error && <span className="text-[8px] text-red-500 ml-0.5">!</span>}
      {hovered && displayValue && !error && (
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
function FlUnitToggle({ planId, unit }: { planId: string; unit: string | null; onSaved?: () => void }) {
  const [current, setCurrent] = useState(unit || 'FL');
  const toggle = async (e: React.MouseEvent) => {
    e.stopPropagation();
    const next = current === 'FL' ? 'ft' : 'FL';
    setCurrent(next); // Optimistic update
    try {
      const res = await fetch(`/api/plans-vol/${planId}`, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'update_strip', strip_fl_unit: next }),
      });
      if (!res.ok) {
        console.error('FlUnitToggle save error');
        setCurrent(current); // Revert on error
      }
    } catch {
      setCurrent(current); // Revert on error
    }
  };
  return (
    <button type="button" onClick={toggle} className="text-[11px] font-black text-sky-700 hover:text-sky-500 bg-sky-100 hover:bg-sky-200 rounded px-1.5 py-0.5 leading-none shadow-sm" title={`Basculer FL/ft`}>
      {current}
    </button>
  );
}

/* ============================================================ */
/*  ACTION BAR                                                     */
/* ============================================================ */
function StripActionBar({ strip, onRefresh }: { strip: StripData; onRefresh?: () => void }) {
  const { theme } = useAtcTheme();
  const isDark = theme === 'dark';
  const [loading, setLoading] = useState<string | null>(null);
  const [showRefuse, setShowRefuse] = useState(false);
  const [showCancelConfirm, setShowCancelConfirm] = useState(false);
  const [refuseReason, setRefuseReason] = useState('');

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
      <div className={`px-2 py-2 border-t space-y-1 ${isDark ? 'bg-red-950 border-red-800' : 'bg-red-50 border-red-200'}`} onClick={(e) => e.stopPropagation()}>
        <textarea autoFocus value={refuseReason} onChange={(e) => setRefuseReason(e.target.value)} placeholder="Raison du refus…" className={`w-full text-sm border rounded px-2 py-1 min-h-[36px] resize-none font-semibold ${isDark ? 'bg-slate-900 text-slate-100 border-red-700 placeholder:text-slate-500' : 'bg-white text-slate-800 border-red-300'}`} />
        <div className="flex gap-1.5">
          <button type="button" onClick={async () => { if (!refuseReason.trim()) { alert('Raison obligatoire'); return; } await callAction('refuser', { refusal_reason: refuseReason.trim() }); setShowRefuse(false); setRefuseReason(''); }} disabled={loading === 'refuser'} className="px-2 py-1 text-xs font-bold bg-red-600 text-white rounded hover:bg-red-700 disabled:opacity-50 shadow-sm">{loading === 'refuser' ? '…' : 'Confirmer refus'}</button>
          <button type="button" onClick={() => { setShowRefuse(false); setRefuseReason(''); }} className={`px-2 py-1 text-xs font-semibold ${isDark ? 'text-slate-300' : 'text-slate-600'}`}>Annuler</button>
        </div>
      </div>
    );
  }

  if (showCancelConfirm) {
    return (
      <div className={`px-2 py-2 border-t space-y-2 ${isDark ? 'bg-orange-950 border-orange-800' : 'bg-orange-50 border-orange-200'}`} onClick={(e) => e.stopPropagation()}>
        <div className="flex items-start gap-2">
          <div className={`p-1 rounded ${isDark ? 'bg-orange-900' : 'bg-orange-200'}`}>
            <XCircle className={`h-4 w-4 ${isDark ? 'text-orange-300' : 'text-orange-700'}`} />
          </div>
          <div className="flex-1">
            <p className={`text-sm font-bold ${isDark ? 'text-orange-200' : 'text-orange-900'}`}>Annuler le vol ?</p>
            <p className={`text-xs ${isDark ? 'text-orange-300' : 'text-orange-700'}`}>
              Le plan de vol <span className="font-mono font-bold">{strip.numero_vol}</span> sera définitivement supprimé.
            </p>
          </div>
        </div>
        <div className="flex gap-1.5">
          <button type="button" onClick={async () => { await callAction('annuler'); setShowCancelConfirm(false); }} disabled={loading === 'annuler'} className="flex-1 px-2 py-1.5 text-xs font-bold bg-red-600 text-white rounded hover:bg-red-700 disabled:opacity-50 shadow-sm">
            {loading === 'annuler' ? '…' : 'Confirmer l\'annulation'}
          </button>
          <button type="button" onClick={() => setShowCancelConfirm(false)} className={`px-3 py-1.5 text-xs font-bold rounded ${isDark ? 'bg-slate-700 text-slate-200 hover:bg-slate-600' : 'bg-slate-200 text-slate-700 hover:bg-slate-300'}`}>
            Retour
          </button>
        </div>
      </div>
    );
  }

  const hasActions = (statut === 'en_attente' || statut === 'depose' || statut === 'en_attente_cloture' || statut === 'en_cours' || statut === 'accepte');
  if (!hasActions) return null;

  return (
    <div className={`px-1.5 py-1 border-t ${isDark ? 'border-slate-700 bg-slate-900/80' : 'border-slate-200 bg-slate-50/80'} flex items-center gap-1 flex-wrap`} onClick={(e) => e.stopPropagation()}>
      {strip.pilote_identifiant && (
        <span className={`text-[11px] mr-auto flex items-center gap-1 font-bold ${isDark ? 'text-slate-300' : 'text-slate-600'}`}><Plane className="h-3 w-3" />{strip.pilote_identifiant}</span>
      )}
      {(statut === 'en_attente' || statut === 'depose') && (
        <>
          <button type="button" onClick={() => callAction('accepter')} disabled={loading !== null} className="inline-flex items-center gap-1 px-2 py-1 text-xs font-bold bg-emerald-600 text-white rounded hover:bg-emerald-700 disabled:opacity-50 shadow-sm"><CheckCircle className="h-3.5 w-3.5" />{loading === 'accepter' ? '…' : 'Accepter'}</button>
          <button type="button" onClick={() => setShowRefuse(true)} disabled={loading !== null} className="inline-flex items-center gap-1 px-2 py-1 text-xs font-bold bg-red-600 text-white rounded hover:bg-red-700 disabled:opacity-50 shadow-sm"><XCircle className="h-3.5 w-3.5" />Refuser</button>
        </>
      )}
      {statut === 'en_attente_cloture' && (
        <button type="button" onClick={() => callAction('confirmer_cloture')} disabled={loading !== null} className="inline-flex items-center gap-1 px-2 py-1 text-xs font-bold bg-emerald-600 text-white rounded hover:bg-emerald-700 disabled:opacity-50 animate-pulse shadow-sm"><CheckCircle className="h-3.5 w-3.5" />{loading === 'confirmer_cloture' ? '…' : 'Confirmer clôture'}</button>
      )}
      {(statut === 'en_cours' || statut === 'accepte') && !isAutomonitoring && (
        <button type="button" onClick={() => callAction('transferer', { automonitoring: true })} disabled={loading !== null} className="inline-flex items-center gap-1 px-2 py-1 text-xs font-bold bg-purple-600 text-white rounded hover:bg-purple-700 disabled:opacity-50 shadow-sm"><Radio className="h-3.5 w-3.5" />{loading === 'transferer' ? '…' : 'Autosurv.'}</button>
      )}
      {(statut === 'en_attente' || statut === 'depose' || statut === 'en_cours' || statut === 'accepte' || statut === 'en_attente_cloture') && (
        <button type="button" onClick={() => setShowCancelConfirm(true)} disabled={loading !== null} className="inline-flex items-center gap-1 px-2 py-1 text-xs font-bold bg-orange-600 text-white rounded hover:bg-orange-700 disabled:opacity-50 shadow-sm"><XCircle className="h-3.5 w-3.5" />Annuler vol</button>
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
  const { theme } = useAtcTheme();
  const isDark = theme === 'dark';
  
  const sqColor = getSquawkColor(strip.code_transpondeur);
  const sqLabel = getSquawkLabel(strip.code_transpondeur);
  const isEmergency = !!sqColor;
  const squawkMismatch = strip.squawk_attendu && strip.code_transpondeur && strip.code_transpondeur !== strip.squawk_attendu;
  const noSquawk = strip.squawk_attendu && !strip.code_transpondeur;

  // Color scheme - Mode clair
  const lightBorder = isEmergency ? (sqColor === 'hijack' ? 'border-red-700' : sqColor === 'radio' ? 'border-amber-600' : 'border-red-600') : 'border-[#8fbc8f]';
  const lightLeftBg = isEmergency ? (sqColor === 'hijack' ? 'bg-red-100' : sqColor === 'radio' ? 'bg-amber-100' : 'bg-red-100') : 'bg-[#d5ecd5]';
  const lightRightBg = isEmergency ? (sqColor === 'hijack' ? 'bg-red-200' : sqColor === 'radio' ? 'bg-amber-200' : 'bg-red-200') : 'bg-[#f5f0c8]';
  const lightTopBg = isEmergency ? (sqColor === 'hijack' ? 'bg-red-200' : sqColor === 'radio' ? 'bg-amber-200' : 'bg-red-200') : 'bg-[#c5dcc5]';
  const lightSep = isEmergency ? 'border-red-300' : 'border-[#8fbc8f]';
  const lightTxt = 'text-slate-900';
  const lightLbl = 'text-slate-600';

  // Color scheme - Mode sombre (couleurs inversées avec meilleur contraste)
  const darkBorder = isEmergency ? (sqColor === 'hijack' ? 'border-red-500' : sqColor === 'radio' ? 'border-amber-500' : 'border-red-500') : 'border-emerald-600';
  const darkLeftBg = isEmergency ? (sqColor === 'hijack' ? 'bg-red-950' : sqColor === 'radio' ? 'bg-amber-950' : 'bg-red-950') : 'bg-emerald-950';
  const darkRightBg = isEmergency ? (sqColor === 'hijack' ? 'bg-red-900' : sqColor === 'radio' ? 'bg-amber-900' : 'bg-red-900') : 'bg-yellow-950';
  const darkTopBg = isEmergency ? (sqColor === 'hijack' ? 'bg-red-900' : sqColor === 'radio' ? 'bg-amber-900' : 'bg-red-900') : 'bg-emerald-900';
  const darkSep = isEmergency ? 'border-red-700' : 'border-emerald-700';
  const darkTxt = 'text-slate-100';
  const darkLbl = 'text-slate-300';

  // Appliquer le bon thème
  const border = isDark ? darkBorder : lightBorder;
  const leftBg = isDark ? darkLeftBg : lightLeftBg;
  const rightBg = isDark ? darkRightBg : lightRightBg;
  const topBg = isDark ? darkTopBg : lightTopBg;
  const sep = isDark ? darkSep : lightSep;
  const txt = isDark ? darkTxt : lightTxt;
  const lbl = isDark ? darkLbl : lightLbl;

  return (
    <div className={`border ${border} rounded shadow-sm select-none overflow-hidden`} onContextMenu={(e) => { e.preventDefault(); onContextMenu?.(e, strip.id); }}>
      {/* Emergency banner */}
      {sqLabel && <div className={`text-center text-sm font-black tracking-[0.3em] py-1 animate-pulse ${isDark ? 'bg-red-600 text-white' : 'bg-black text-white'}`}>{sqLabel}</div>}
      {(squawkMismatch || noSquawk) && !sqLabel && (
        <div className={`text-center text-xs font-bold py-1 ${isDark ? 'bg-amber-500 text-black' : 'bg-amber-400 text-black'}`}>
          {noSquawk ? '⚠ PAS DE TRANSPONDEUR' : `⚠ SQUAWK INCORRECT (attendu: ${strip.squawk_attendu})`}
        </div>
      )}

      <div className="flex">
        {/* ═══ DRAG HANDLE ═══ */}
        <div
          className={`w-5 flex items-center justify-center cursor-grab active:cursor-grabbing ${topBg} border-r ${sep} shrink-0`}
          {...dragHandleProps}
        >
          <GripVertical className={`h-3.5 w-3.5 ${isDark ? 'text-slate-400' : 'text-slate-400'}`} />
        </div>

        {/* ═══ STRIP BODY ═══ */}
        <div className="flex-1 flex">
          {/* ─── LEFT SECTION (4 cols) ─── */}
          <div className="flex-1 min-w-0">
            {/* ROW 1 */}
            <div className={`flex ${topBg} border-b ${sep}`}>
              <Cell className={`w-[70px] border-r ${sep}`}>
                <div className={`text-[10px] ${lbl} leading-none font-semibold mb-0.5`}>ATD</div>
                <InlineEdit value={strip.strip_atd} field="strip_atd" planId={strip.id} placeholder="—" onSaved={onRefresh} maxLength={5} large />
              </Cell>
              <Cell className={`w-[100px] border-r ${sep}`}>
                <div className={`text-[10px] ${lbl} leading-none font-semibold mb-0.5`}>TYPE/W</div>
                <span className={`text-base font-mono font-bold ${txt}`}>{strip.type_wake}</span>
              </Cell>
              <Cell className={`w-[50px] border-r ${sep} text-center`}>
                <div className={`text-[10px] ${lbl} leading-none font-semibold mb-0.5`}>{strip.type_vol}</div>
                <span className={`text-sm font-mono font-bold ${txt}`}>1</span>
              </Cell>
              <Cell className="flex-1">
                <div className={`text-[10px] ${lbl} leading-none font-semibold mb-0.5`}>NOTE</div>
                <InlineEdit value={strip.strip_note_1} field="strip_note_1" planId={strip.id} placeholder="—" onSaved={onRefresh} maxLength={20} />
              </Cell>
            </div>
            {/* ROW 2 */}
            <div className={`flex ${leftBg} border-b ${sep}`}>
              <Cell className={`w-[70px] border-r ${sep}`}>
                <div className={`text-[10px] ${lbl} leading-none font-semibold mb-0.5`}>ADES</div>
                <span className={`text-lg font-mono font-black ${txt} leading-tight`}>{strip.aeroport_arrivee}</span>
              </Cell>
              <Cell className={`w-[150px] border-r ${sep}`}>
                <div className={`text-[10px] ${lbl} leading-none font-semibold mb-0.5`}>CALLSIGN</div>
                <span className={`text-xl font-mono font-black tracking-wide ${txt} leading-tight`}>{strip.numero_vol}</span>
              </Cell>
              <Cell className="flex-1">
                <div className={`text-[10px] ${lbl} leading-none font-semibold mb-0.5`}>ADEP</div>
                <span className={`text-base font-mono font-bold ${txt}`}>{strip.aeroport_depart}</span>
              </Cell>
            </div>
            {/* ROW 3 */}
            <div className={`flex ${leftBg}`}>
              <Cell className={`w-[70px] border-r ${sep}`}>
                <div className={`text-[10px] ${lbl} leading-none font-semibold mb-0.5`}>RWY</div>
                <InlineEdit value={strip.strip_rwy} field="strip_rwy" planId={strip.id} placeholder="—" onSaved={onRefresh} maxLength={5} large />
              </Cell>
              <Cell className={`w-[100px] border-r ${sep}`}>
                <div className={`text-[10px] ${lbl} leading-none font-semibold mb-0.5`}>CTOT</div>
                <span className={`text-base font-mono font-bold ${txt}`}>{formatCtot(strip.created_at)}</span>
              </Cell>
              <Cell className="flex-1">
                <div className={`text-[10px] ${lbl} leading-none font-semibold mb-0.5`}>TAIL</div>
                <span className={`text-base font-mono font-bold ${txt}`}>{strip.immatriculation || '—'}</span>
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
                <div className={`text-[10px] ${lbl} leading-none font-semibold mb-0.5`}>SQUAWK</div>
                <span className={`text-base font-mono font-black ${txt}`}>{strip.code_transpondeur || '—'}</span>
              </Cell>
              <Cell className={`w-[90px] border-r ${sep}`}>
                <div className={`text-[10px] ${lbl} leading-none font-semibold mb-0.5`}>CLR REV</div>
                <InlineEdit value={strip.strip_note_2} field="strip_note_2" planId={strip.id} placeholder="—" onSaved={onRefresh} maxLength={20} />
              </Cell>
              <Cell className="flex-1">
                <div className={`text-[10px] ${lbl} leading-none font-semibold mb-0.5`}>INFO</div>
                <InlineEdit value={strip.strip_note_3} field="strip_note_3" planId={strip.id} placeholder="—" onSaved={onRefresh} maxLength={30} />
              </Cell>
            </div>
            {/* ROW 2 */}
            <div className={`flex border-b ${sep}`}>
              <Cell className={`w-[90px] border-r ${sep}`}>
                <div className={`text-[10px] ${lbl} leading-none font-semibold mb-0.5`}>SID</div>
                <InlineEdit value={strip.strip_sid_atc || strip.sid_depart} field="strip_sid_atc" planId={strip.id} placeholder="—" onSaved={onRefresh} maxLength={15} large />
              </Cell>
              <Cell className="flex-1">
                <span className={`text-xs font-mono font-semibold ${txt}`}>{strip.type_avion_nom || ''}</span>
              </Cell>
            </div>
            {/* ROW 3 */}
            <div className="flex">
              <Cell className={`w-[90px] border-r ${sep}`}>
                <div className="flex items-center gap-1 mb-0.5">
                  <FlUnitToggle planId={strip.id} unit={strip.strip_fl_unit} onSaved={onRefresh} />
                  <span className={`text-[10px] ${lbl} font-semibold`}>ALT</span>
                </div>
                <InlineEdit value={strip.strip_fl} field="strip_fl" planId={strip.id} placeholder="—" onSaved={onRefresh} maxLength={5} large />
              </Cell>
              <Cell className="flex-1">
                <div className={`text-[10px] ${lbl} leading-none font-semibold mb-0.5`}>STATUT</div>
                <span className={`text-xs font-bold uppercase ${
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
