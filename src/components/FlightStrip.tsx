'use client';

import { useState, useRef, useCallback } from 'react';
import { Trash2, GripVertical } from 'lucide-react';

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
  type_wake: string; // e.g. "B738/M"
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
};

type EditableField = 'strip_atd' | 'strip_rwy' | 'strip_fl' | 'strip_fl_unit' | 'strip_sid_atc' | 'strip_note_1' | 'strip_note_2' | 'strip_note_3';

// Transponder emergency colors
function getSquawkColor(code: string | null): string | null {
  if (!code) return null;
  const c = code.trim();
  if (c === '7500') return 'strip-hijack';
  if (c === '7600') return 'strip-radio';
  if (c === '7700') return 'strip-emergency';
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
  try {
    const d = new Date(createdAt);
    return d.toISOString().slice(11, 16);
  } catch {
    return '—';
  }
}

/* ------------------------------------------------------------------ */
/*  Inline-editable cell                                               */
/* ------------------------------------------------------------------ */
function InlineEdit({
  value,
  field,
  planId,
  placeholder,
  maxLength,
  onSaved,
  large,
}: {
  value: string | null;
  field: EditableField;
  planId: string;
  placeholder: string;
  maxLength?: number;
  onSaved?: () => void;
  large?: boolean;
}) {
  const [editing, setEditing] = useState(false);
  const [text, setText] = useState(value || '');
  const [saving, setSaving] = useState(false);
  const [hovered, setHovered] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const save = useCallback(async (val: string) => {
    setSaving(true);
    try {
      await fetch(`/api/plans-vol/${planId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'update_strip', [field]: val }),
      });
      onSaved?.();
    } catch { /* ignore */ }
    setSaving(false);
    setEditing(false);
  }, [planId, field, onSaved]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') { e.preventDefault(); save(text); }
    if (e.key === 'Escape') { setEditing(false); setText(value || ''); }
  };

  const clear = async (e: React.MouseEvent) => {
    e.stopPropagation();
    setText('');
    await save('');
  };

  if (editing) {
    return (
      <input
        ref={inputRef}
        autoFocus
        className={`bg-white text-slate-900 border border-sky-400 rounded outline-none w-full font-mono ${large ? 'text-sm px-1 py-0.5' : 'text-xs px-1 py-0'}`}
        value={text}
        maxLength={maxLength || 20}
        onChange={(e) => setText(e.target.value)}
        onKeyDown={handleKeyDown}
        onBlur={() => save(text)}
        disabled={saving}
      />
    );
  }

  return (
    <div
      className="relative cursor-text min-h-[20px] flex items-center group/edit"
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      onClick={(e) => { e.stopPropagation(); setEditing(true); setText(value || ''); }}
    >
      <span className={`font-mono leading-snug ${large ? 'text-sm font-bold' : 'text-xs'} ${value ? 'text-slate-900' : 'text-slate-400 italic'}`}>
        {value || placeholder}
      </span>
      {hovered && value && (
        <button
          type="button"
          onClick={clear}
          className="absolute -top-1.5 -right-1.5 p-0.5 bg-red-500 text-white rounded-full hover:bg-red-600 z-10 shadow"
          title="Effacer"
        >
          <Trash2 className="h-3 w-3" />
        </button>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  FL / ft toggle                                                      */
/* ------------------------------------------------------------------ */
function FlUnitToggle({ planId, unit, onSaved }: { planId: string; unit: string | null; onSaved?: () => void }) {
  const current = unit || 'FL';

  const toggle = async (e: React.MouseEvent) => {
    e.stopPropagation();
    const next = current === 'FL' ? 'ft' : 'FL';
    await fetch(`/api/plans-vol/${planId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'update_strip', strip_fl_unit: next }),
    });
    onSaved?.();
  };

  return (
    <button
      type="button"
      onClick={toggle}
      className="text-[10px] font-bold text-sky-700 hover:text-sky-500 bg-sky-100 hover:bg-sky-200 rounded px-1 py-0.5 leading-none"
      title={`Basculer entre FL et ft (actuellement ${current})`}
    >
      {current}
    </button>
  );
}

/* ------------------------------------------------------------------ */
/*  STRIP COMPONENT                                                     */
/* ------------------------------------------------------------------ */
export default function FlightStrip({
  strip,
  onRefresh,
  onContextMenu,
  dragHandleProps,
}: {
  strip: StripData;
  onRefresh?: () => void;
  onContextMenu?: (e: React.MouseEvent, stripId: string) => void;
  dragHandleProps?: {
    draggable: true;
    onDragStart: (e: React.DragEvent) => void;
  };
}) {
  const squawkClass = getSquawkColor(strip.code_transpondeur);
  const squawkLabel = getSquawkLabel(strip.code_transpondeur);
  const isEmergency = !!squawkClass;

  // Check if squawk matches expected
  const squawkMismatch = strip.squawk_attendu && strip.code_transpondeur && strip.code_transpondeur !== strip.squawk_attendu;
  const noSquawk = strip.squawk_attendu && !strip.code_transpondeur;

  const handleCtxMenu = (e: React.MouseEvent) => {
    e.preventDefault();
    onContextMenu?.(e, strip.id);
  };

  // Couleurs de base
  const borderColor = isEmergency
    ? (squawkClass === 'strip-hijack' ? 'border-red-700' : squawkClass === 'strip-radio' ? 'border-amber-600' : 'border-red-600')
    : 'border-emerald-400';
  const mainBg = isEmergency
    ? (squawkClass === 'strip-hijack' ? 'bg-red-800' : squawkClass === 'strip-radio' ? 'bg-amber-700' : 'bg-red-700')
    : 'bg-[#e8f5e9]';
  const headerBg = isEmergency ? 'bg-black/20' : 'bg-[#c8e6c9]';
  const clearanceBg = isEmergency ? 'bg-black/10' : 'bg-[#fff9c4]';
  const textColor = isEmergency ? 'text-white' : 'text-slate-900';
  const labelColor = isEmergency ? 'text-white/60' : 'text-slate-500';
  const dividerColor = isEmergency ? 'divide-white/20' : 'divide-emerald-300';
  const borderSepColor = isEmergency ? 'border-white/20' : 'border-emerald-300';

  return (
    <div
      className={`border-2 ${borderColor} rounded-lg shadow-md select-none overflow-hidden ${mainBg}`}
      onContextMenu={handleCtxMenu}
    >
      {/* Emergency banner */}
      {squawkLabel && (
        <div className="bg-black text-white text-center text-sm font-black tracking-[0.3em] py-1 animate-pulse">
          {squawkLabel}
        </div>
      )}

      {/* Squawk mismatch warning */}
      {(squawkMismatch || noSquawk) && !squawkLabel && (
        <div className="bg-amber-500 text-black text-center text-xs font-bold py-1">
          {noSquawk ? '⚠ PAS DE TRANSPONDEUR' : `⚠ SQUAWK INCORRECT (attendu: ${strip.squawk_attendu})`}
        </div>
      )}

      {/* Strip body - 3 rows x 7 columns */}
      <div className="flex">
        {/* Drag handle */}
        <div
          className={`w-6 flex items-center justify-center cursor-grab active:cursor-grabbing ${headerBg} border-r ${borderSepColor} shrink-0`}
          {...dragHandleProps}
        >
          <GripVertical className={`h-4 w-4 ${isEmergency ? 'text-white/40' : 'text-slate-400'}`} />
        </div>

        {/* Main grid */}
        <div className={`flex-1 grid grid-cols-[minmax(70px,1fr)_minmax(90px,1.2fr)_45px_minmax(70px,1fr)_minmax(75px,1fr)_minmax(75px,1fr)_minmax(90px,1.2fr)] ${dividerColor}`}>
          {/* ====== ROW 1 ====== */}
          <div className={`px-2 py-1.5 ${headerBg} border-b border-r ${borderSepColor}`}>
            <div className={`text-[10px] ${labelColor} font-medium leading-tight`}>ATD</div>
            <InlineEdit value={strip.strip_atd} field="strip_atd" planId={strip.id} placeholder="—" onSaved={onRefresh} maxLength={5} large />
          </div>
          <div className={`px-2 py-1.5 ${headerBg} border-b border-r ${borderSepColor}`}>
            <div className={`text-[10px] ${labelColor} font-medium leading-tight`}>TYPE/W</div>
            <span className={`text-sm font-mono font-bold ${textColor}`}>{strip.type_wake}</span>
          </div>
          <div className={`px-2 py-1.5 ${headerBg} border-b border-r ${borderSepColor} text-center`}>
            <div className={`text-[10px] ${labelColor} font-medium leading-tight`}>NB</div>
            <span className={`text-sm font-mono font-bold ${textColor}`}>1</span>
          </div>
          <div className={`px-2 py-1.5 ${headerBg} border-b border-r ${borderSepColor}`}>
            <div className={`text-[10px] ${labelColor} font-medium leading-tight`}>NOTE</div>
            <InlineEdit value={strip.strip_note_1} field="strip_note_1" planId={strip.id} placeholder="…" onSaved={onRefresh} maxLength={20} />
          </div>
          {/* Clearance zone (right side) */}
          <div className={`px-2 py-1.5 ${clearanceBg} border-b border-r border-l-[3px] border-l-red-500 ${borderSepColor}`}>
            <div className={`text-[10px] ${labelColor} font-medium leading-tight`}>SQUAWK</div>
            <span className={`text-sm font-mono font-black ${textColor}`}>
              {strip.code_transpondeur || '—'}
            </span>
          </div>
          <div className={`px-2 py-1.5 ${clearanceBg} border-b border-r ${borderSepColor}`}>
            <div className={`text-[10px] ${labelColor} font-medium leading-tight`}>CLR REV</div>
            <InlineEdit value={strip.strip_note_2} field="strip_note_2" planId={strip.id} placeholder="…" onSaved={onRefresh} maxLength={20} />
          </div>
          <div className={`px-2 py-1.5 ${clearanceBg} border-b ${borderSepColor}`}>
            <div className={`text-[10px] ${labelColor} font-medium leading-tight`}>INFO</div>
            <InlineEdit value={strip.strip_note_3} field="strip_note_3" planId={strip.id} placeholder="…" onSaved={onRefresh} maxLength={30} />
          </div>

          {/* ====== ROW 2 ====== */}
          <div className={`px-2 py-1.5 border-b border-r ${borderSepColor}`}>
            <div className={`text-[10px] ${labelColor} font-medium leading-tight`}>ADES</div>
            <span className={`text-base font-mono font-black ${textColor}`}>{strip.aeroport_arrivee}</span>
          </div>
          <div className={`px-2 py-1.5 col-span-2 border-b border-r ${borderSepColor}`}>
            <div className={`text-[10px] ${labelColor} font-medium leading-tight`}>CALLSIGN</div>
            <span className={`text-base font-mono font-black tracking-wide ${textColor}`}>{strip.numero_vol}</span>
          </div>
          <div className={`px-2 py-1.5 border-b border-r ${borderSepColor}`}>
            {/* spacer — aeroport depart info */}
            <div className={`text-[10px] ${labelColor} font-medium leading-tight`}>ADEP</div>
            <span className={`text-sm font-mono font-semibold ${textColor}`}>{strip.aeroport_depart}</span>
          </div>
          <div className={`px-2 py-1.5 ${clearanceBg} border-b border-r border-l-[3px] border-l-red-500 ${borderSepColor}`}>
            <div className={`text-[10px] ${labelColor} font-medium leading-tight`}>SID</div>
            <InlineEdit value={strip.strip_sid_atc || strip.sid_depart} field="strip_sid_atc" planId={strip.id} placeholder="—" onSaved={onRefresh} maxLength={15} large />
          </div>
          <div className={`px-2 py-1.5 ${clearanceBg} border-b col-span-2 ${borderSepColor}`}>
            <div className={`text-[10px] ${labelColor} font-medium leading-tight`}>{strip.type_vol}</div>
            <span className={`text-xs font-mono ${textColor}`}>{strip.type_avion_nom || ''}</span>
          </div>

          {/* ====== ROW 3 ====== */}
          <div className={`px-2 py-1.5 border-r ${borderSepColor}`}>
            <div className={`text-[10px] ${labelColor} font-medium leading-tight`}>RWY</div>
            <InlineEdit value={strip.strip_rwy} field="strip_rwy" planId={strip.id} placeholder="—" onSaved={onRefresh} maxLength={5} large />
          </div>
          <div className={`px-2 py-1.5 border-r ${borderSepColor}`}>
            <div className={`text-[10px] ${labelColor} font-medium leading-tight`}>CTOT</div>
            <span className={`text-sm font-mono font-semibold ${textColor}`}>{formatCtot(strip.created_at)}</span>
          </div>
          <div className={`px-2 py-1.5 col-span-2 border-r ${borderSepColor}`}>
            <div className={`text-[10px] ${labelColor} font-medium leading-tight`}>TAIL</div>
            <span className={`text-sm font-mono font-bold ${textColor}`}>{strip.immatriculation || '—'}</span>
          </div>
          <div className={`px-2 py-1.5 ${clearanceBg} border-r border-l-[3px] border-l-red-500 ${borderSepColor}`}>
            <div className="flex items-center gap-1">
              <FlUnitToggle planId={strip.id} unit={strip.strip_fl_unit} onSaved={onRefresh} />
              <span className={`text-[10px] ${labelColor}`}>ALT</span>
            </div>
            <InlineEdit value={strip.strip_fl} field="strip_fl" planId={strip.id} placeholder="—" onSaved={onRefresh} maxLength={5} large />
          </div>
          <div className={`px-2 py-1.5 ${clearanceBg} col-span-2`}>
            {/* Statut info */}
            <div className={`text-[10px] ${labelColor} font-medium leading-tight`}>STATUT</div>
            <span className={`text-xs font-semibold uppercase ${
              strip.statut === 'en_cours' ? 'text-sky-700' :
              strip.statut === 'en_attente_cloture' ? 'text-orange-700' :
              strip.statut === 'accepte' ? 'text-emerald-700' :
              strip.statut === 'depose' || strip.statut === 'en_attente' ? 'text-amber-700' :
              textColor
            }`}>
              {strip.statut === 'en_cours' ? 'EN VOL' :
               strip.statut === 'en_attente_cloture' ? 'CLÔTURE' :
               strip.statut === 'accepte' ? 'ACCEPTÉ' :
               strip.statut === 'depose' ? 'DÉPOSÉ' :
               strip.statut === 'en_attente' ? 'ATTENTE' :
               strip.statut}
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}
