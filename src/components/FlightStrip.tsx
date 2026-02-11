'use client';

import { useState, useRef, useCallback } from 'react';
import { Trash2 } from 'lucide-react';

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
  squawk_attendu: string | null; // code transpondeur attendu (si attribué)
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
  if (c === '7500') return 'bg-red-700 border-red-900'; // Hijack
  if (c === '7600') return 'bg-amber-600 border-amber-800'; // Radio failure
  if (c === '7700') return 'bg-red-600 border-red-800'; // Emergency
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
    return d.toISOString().slice(11, 16); // HH:MM UTC
  } catch {
    return '—';
  }
}

function InlineEdit({
  value,
  field,
  planId,
  placeholder,
  className,
  maxLength,
  onSaved,
}: {
  value: string | null;
  field: EditableField;
  planId: string;
  placeholder: string;
  className?: string;
  maxLength?: number;
  onSaved?: () => void;
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
        className={`bg-white/90 text-slate-900 text-xs px-0.5 py-0 border border-sky-400 rounded outline-none w-full font-mono ${className || ''}`}
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
      className={`relative cursor-pointer min-h-[16px] flex items-center ${className || ''}`}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      onClick={() => { setEditing(true); setText(value || ''); }}
    >
      <span className={`text-xs font-mono truncate ${value ? '' : 'text-slate-400 italic'}`}>
        {value || placeholder}
      </span>
      {hovered && value && (
        <button
          type="button"
          onClick={clear}
          className="absolute -top-1 -right-1 p-0.5 bg-red-500 text-white rounded-full hover:bg-red-600 z-10"
          title="Effacer"
        >
          <Trash2 className="h-2.5 w-2.5" />
        </button>
      )}
    </div>
  );
}

function FlUnitToggle({ planId, unit, onSaved }: { planId: string; unit: string | null; onSaved?: () => void }) {
  const current = unit || 'FL';

  const toggle = async () => {
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
      className="text-[9px] font-bold text-sky-700 hover:text-sky-500 bg-sky-100 hover:bg-sky-200 rounded px-0.5 leading-tight"
      title={`Basculer entre FL et ft (actuellement ${current})`}
    >
      {current}
    </button>
  );
}

export default function FlightStrip({
  strip,
  onRefresh,
  onContextMenu,
}: {
  strip: StripData;
  onRefresh?: () => void;
  onContextMenu?: (e: React.MouseEvent, stripId: string) => void;
}) {
  const squawkEmergency = getSquawkColor(strip.code_transpondeur);
  const squawkLabel = getSquawkLabel(strip.code_transpondeur);

  // Check if squawk matches expected
  const squawkMismatch = strip.squawk_attendu && strip.code_transpondeur && strip.code_transpondeur !== strip.squawk_attendu;
  const noSquawk = strip.squawk_attendu && !strip.code_transpondeur;

  const baseBg = squawkEmergency || 'bg-emerald-50 border-emerald-300';
  const headerBg = squawkEmergency ? 'bg-black/20' : 'bg-emerald-200/60';

  const handleCtxMenu = (e: React.MouseEvent) => {
    e.preventDefault();
    onContextMenu?.(e, strip.id);
  };

  return (
    <div
      className={`border rounded-md shadow-sm text-[11px] select-none ${baseBg} overflow-hidden`}
      onContextMenu={handleCtxMenu}
    >
      {/* Emergency banner */}
      {squawkLabel && (
        <div className="bg-black text-white text-center text-xs font-black tracking-widest py-0.5 animate-pulse">
          {squawkLabel}
        </div>
      )}

      {/* Squawk mismatch warning */}
      {(squawkMismatch || noSquawk) && !squawkLabel && (
        <div className="bg-amber-500 text-black text-center text-[10px] font-bold py-0.5">
          {noSquawk ? 'PAS DE TRANSPONDEUR' : `SQUAWK INCORRECT (attendu: ${strip.squawk_attendu})`}
        </div>
      )}

      <div className="grid grid-cols-[60px_80px_40px_60px_65px_65px_80px] divide-x divide-emerald-300">
        {/* Row 1 */}
        <div className={`px-1 py-0.5 ${headerBg}`}>
          <div className="text-[9px] text-slate-500 leading-tight">ATD</div>
          <InlineEdit value={strip.strip_atd} field="strip_atd" planId={strip.id} placeholder="—" onSaved={onRefresh} maxLength={5} />
        </div>
        <div className={`px-1 py-0.5 ${headerBg}`}>
          <div className="text-[9px] text-slate-500 leading-tight">TYPE/W</div>
          <span className="text-xs font-mono font-semibold">{strip.type_wake}</span>
        </div>
        <div className={`px-1 py-0.5 ${headerBg} text-center`}>
          <div className="text-[9px] text-slate-500 leading-tight">NB</div>
          <span className="text-xs font-mono">1</span>
        </div>
        <div className={`px-1 py-0.5 ${headerBg}`}>
          <InlineEdit value={strip.strip_note_1} field="strip_note_1" planId={strip.id} placeholder="..." onSaved={onRefresh} maxLength={20} />
        </div>
        <div className={`px-1 py-0.5 border-l-2 border-l-red-400 ${squawkEmergency ? 'bg-white/20' : 'bg-yellow-50'}`}>
          <div className="text-[9px] text-slate-500 leading-tight">SQUAWK</div>
          <span className={`text-xs font-mono font-bold ${squawkEmergency ? 'text-white' : ''}`}>
            {strip.code_transpondeur || '—'}
          </span>
        </div>
        <div className={`px-1 py-0.5 ${squawkEmergency ? 'bg-white/10' : 'bg-yellow-50'}`}>
          <div className="text-[9px] text-slate-500 leading-tight">CLR REV</div>
          <InlineEdit value={strip.strip_note_2} field="strip_note_2" planId={strip.id} placeholder="..." onSaved={onRefresh} maxLength={20} />
        </div>
        <div className={`px-1 py-0.5 ${squawkEmergency ? 'bg-white/10' : 'bg-yellow-50'}`}>
          <div className="text-[9px] text-slate-500 leading-tight">INFO</div>
          <InlineEdit value={strip.strip_note_3} field="strip_note_3" planId={strip.id} placeholder="..." onSaved={onRefresh} maxLength={30} />
        </div>

        {/* Row 2 */}
        <div className="px-1 py-0.5">
          <div className="text-[9px] text-slate-500 leading-tight">ADES</div>
          <span className="text-xs font-mono font-black">{strip.aeroport_arrivee}</span>
        </div>
        <div className="px-1 py-0.5 col-span-2">
          <div className="text-[9px] text-slate-500 leading-tight">CALLSIGN</div>
          <span className="text-xs font-mono font-black tracking-wide">{strip.numero_vol}</span>
        </div>
        <div className="px-1 py-0.5">
          {/* empty spacer - same as image */}
        </div>
        <div className={`px-1 py-0.5 border-l-2 border-l-red-400 ${squawkEmergency ? 'bg-white/10' : 'bg-yellow-50'}`}>
          <div className="text-[9px] text-slate-500 leading-tight">SID</div>
          <InlineEdit value={strip.strip_sid_atc || strip.sid_depart} field="strip_sid_atc" planId={strip.id} placeholder="—" onSaved={onRefresh} maxLength={15} />
        </div>
        <div className={`px-1 py-0.5 col-span-2 ${squawkEmergency ? 'bg-white/10' : 'bg-yellow-50'}`}>
          {/* empty clearance continuation */}
        </div>

        {/* Row 3 */}
        <div className="px-1 py-0.5">
          <div className="text-[9px] text-slate-500 leading-tight">RWY</div>
          <InlineEdit value={strip.strip_rwy} field="strip_rwy" planId={strip.id} placeholder="—" onSaved={onRefresh} maxLength={5} />
        </div>
        <div className="px-1 py-0.5">
          <div className="text-[9px] text-slate-500 leading-tight">CTOT</div>
          <span className="text-xs font-mono">{formatCtot(strip.created_at)}</span>
        </div>
        <div className="px-1 py-0.5 col-span-2">
          <div className="text-[9px] text-slate-500 leading-tight">TAIL</div>
          <span className="text-xs font-mono font-semibold">{strip.immatriculation || '—'}</span>
        </div>
        <div className={`px-1 py-0.5 border-l-2 border-l-red-400 ${squawkEmergency ? 'bg-white/10' : 'bg-yellow-50'}`}>
          <div className="flex items-center gap-0.5">
            <FlUnitToggle planId={strip.id} unit={strip.strip_fl_unit} onSaved={onRefresh} />
          </div>
          <InlineEdit value={strip.strip_fl} field="strip_fl" planId={strip.id} placeholder="—" onSaved={onRefresh} maxLength={5} />
        </div>
        <div className={`px-1 py-0.5 col-span-2 ${squawkEmergency ? 'bg-white/10' : 'bg-yellow-50'}`}>
          {/* empty */}
        </div>
      </div>
    </div>
  );
}
