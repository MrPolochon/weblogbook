'use client';

import { useState, useRef, useCallback, useEffect, useMemo, memo } from 'react';
import { createPortal } from 'react-dom';
import {
  Trash2, GripVertical, CheckCircle, XCircle, Radio, Plane, MessageSquare,
  AlertTriangle, Flame, PlaneLanding, ArrowRightLeft, MoreHorizontal,
} from 'lucide-react';
import { useAtcTheme } from '@/contexts/AtcThemeContext';
import { toast } from 'sonner';
import { formatCtot, getSquawkColor, getSquawkLabel, statutLabel } from '@/lib/atc-ui';

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
  mode_transpondeur: string | null;
  squawk_attendu: string | null;
  isDupe?: boolean;
  sid_depart: string | null;
  star_arrivee: string | null;
  route_ifr: string | null;
  strip_atd: string | null;
  strip_rwy: string | null;
  strip_fl: string | null;
  strip_fl_unit: string | null;
  strip_sid_atc: string | null;
  strip_note_1: string | null;
  strip_note_2: string | null;
  strip_note_3: string | null;
  strip_star: string | null;
  strip_route: string | null;
  strip_zone: string | null;
  strip_order: number;
  strip_pilote_text: string | null;
  strip_type_wake: string | null;
  pilote_identifiant?: string | null;
  intentions_vol?: string | null;
  niveau_croisiere?: string | null;
  heure_depart_estimee?: string | null;
  instructions_atc?: string | null;
  automonitoring?: boolean;
  isManual?: boolean;
  callsign_telephonie?: string | null;
  bria_conversation?: { role: string; text: string }[] | null;
  current_holder_user_id?: string | null;
  pending_transfer_aeroport?: string | null;
  pending_transfer_position?: string | null;
  siavi_avion_id?: string | null;
};

type EditableField =
  | 'strip_atd' | 'strip_rwy' | 'strip_fl' | 'strip_fl_unit' | 'strip_sid_atc'
  | 'strip_note_1' | 'strip_note_2' | 'strip_note_3' | 'strip_star' | 'strip_route'
  | 'numero_vol' | 'aeroport_depart' | 'aeroport_arrivee' | 'type_vol'
  | 'strip_pilote_text' | 'strip_type_wake';

/**
 * Le strip a une géométrie figée : cette largeur est le plancher, et les bays
 * de FlightStripBoard s'y adaptent pour qu'aucune colonne ne soit jamais rognée.
 */
export const STRIP_MIN_WIDTH = 360;

/** Hauteurs de lignes. Fixées pour que la structure ne bouge jamais. */
const LANE_H = 16;
const ROW_ID_H = 34;
const ROW_RTE_H = 30;
const ROW_CLR_H = 28;
const ROW_NOTE_H = 30;
const ROW_FULL_H = 34;
const BAR_H = 29;
const LABEL_H = 10;

/** Hauteur utile d'une valeur dans une cellule de hauteur `rowH`. */
const valueH = (rowH: number) => rowH - LABEL_H - 4;

/** Largeur d'avance moyenne d'un glyphe monospace, en fraction de la taille de police. */
const MONO_ADVANCE = 0.62;

const FLIGHT_RULES = ['IFR', 'VFR', 'SVFR', 'MEDEVAC'];

type Pal = {
  border: string; head: string; left: string; right: string; sep: string;
  txt: string; lbl: string; tab: string; ghost: string;
};

function playErrorBeep() {
  try {
    const AudioContext = window.AudioContext || (window as unknown as { webkitAudioContext: typeof window.AudioContext }).webkitAudioContext;
    if (!AudioContext) return;
    const ctx = new AudioContext();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.connect(gain); gain.connect(ctx.destination);
    osc.type = 'square';
    osc.frequency.setValueAtTime(880, ctx.currentTime);
    osc.frequency.setValueAtTime(440, ctx.currentTime + 0.1);
    gain.gain.setValueAtTime(0.25, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.35);
    osc.start(ctx.currentTime);
    osc.stop(ctx.currentTime + 0.35);
    osc.onended = () => ctx.close();
  } catch { /* son non dispo */ }
}

/** Largeur réelle d'un élément, suivie en direct. */
function useBoxWidth<T extends HTMLElement>() {
  const ref = useRef<T | null>(null);
  const [width, setWidth] = useState(0);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const apply = (w: number) => setWidth((prev) => (Math.abs(prev - w) > 0.5 ? w : prev));
    apply(el.clientWidth);
    if (typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver((entries) => {
      const w = entries[0]?.contentRect.width;
      if (typeof w === 'number') apply(w);
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  return [ref, width] as const;
}

/**
 * Taille de police et nombre de lignes qui font tenir `text` dans une boîte de
 * `width` × `height`. La police étant monospace, l'encombrement est calculable :
 * pas de mesure itérative, donc aucun reflow ni saut de mise en page.
 *
 * On teste chaque nombre de lignes autorisé et on garde le plus lisible : un
 * texte court reste en grand sur une ligne, un texte long se replie.
 */
function fitBlock(
  text: string, width: number, height: number, maxLines: number, max: number, min: number,
): { size: number; lines: number } {
  if (!width || !text) return { size: max, lines: 1 };

  let best = { size: 0, lines: 1 };
  for (let lines = 1; lines <= maxLines; lines++) {
    const byWidth = (width * lines * 0.97) / (MONO_ADVANCE * text.length);
    const byHeight = (height / lines) * 0.84;
    const size = Math.min(max, byWidth, byHeight);
    if (size > best.size) best = { size, lines };
  }
  return { size: Math.max(min, best.size), lines: best.lines };
}

/** Valeur non modifiable, toujours entièrement lisible dans sa cellule. */
function FitValue({
  text, placeholder = '—', max, min = 6, lines = 1, height, tone, pal, bold = true,
}: {
  text: string | null | undefined;
  placeholder?: string;
  max: number;
  min?: number;
  lines?: number;
  height: number;
  tone?: string;
  pal: Pal;
  bold?: boolean;
}) {
  const [ref, width] = useBoxWidth<HTMLDivElement>();
  const filled = (text ?? '').trim();
  const shown = filled || placeholder;
  const fit = fitBlock(shown, width, height, lines, max, min);

  return (
    <div ref={ref} className="w-full overflow-hidden" style={{ height }}>
      <span
        title={filled || undefined}
        className={`block break-all font-mono ${bold ? 'font-black' : 'font-bold'} ${filled ? (tone ?? pal.txt) : pal.ghost}`}
        style={{ fontSize: `${fit.size}px`, lineHeight: `${height / fit.lines}px` }}
      >
        {shown}
      </span>
    </div>
  );
}

/**
 * Valeur éditable. L'input est superposé en absolu sur la valeur : la cellule
 * garde exactement la même taille en lecture, en saisie et en erreur.
 * Les écritures sont sérialisées par champ, la dernière frappe gagne toujours.
 */
function EditValue({
  value, field, planId, placeholder = '—', maxLength, max, min = 6, lines = 1,
  height, onSaved, pal, tone,
}: {
  value: string | null | undefined;
  field: EditableField;
  planId: string;
  placeholder?: string;
  maxLength: number;
  max: number;
  min?: number;
  lines?: number;
  height: number;
  onSaved?: () => void;
  pal: Pal;
  tone?: string;
}) {
  const [ref, width] = useBoxWidth<HTMLDivElement>();
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState('');
  const [optimistic, setOptimistic] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [failed, setFailed] = useState(false);
  const [hovered, setHovered] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const inflight = useRef(false);
  const queued = useRef<string | null>(null);
  const committed = useRef(false);

  const server = (value ?? '').trim();
  const current = optimistic ?? server;

  // Dès que le serveur renvoie la valeur écrite, on relâche l'affichage optimiste.
  useEffect(() => {
    if (optimistic !== null && server === optimistic) setOptimistic(null);
  }, [server, optimistic]);

  useEffect(() => {
    if (editing) {
      inputRef.current?.focus();
      inputRef.current?.select();
    }
  }, [editing]);

  const push = useCallback(async (next: string) => {
    if (inflight.current) {
      queued.current = next;
      return;
    }
    inflight.current = true;
    setSaving(true);
    let payload: string | null = next;
    try {
      while (payload !== null) {
        const res = await fetch(`/api/plans-vol/${planId}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ action: 'update_strip', [field]: payload }),
        });
        if (!res.ok) {
          setFailed(true);
          return;
        }
        setFailed(false);
        payload = queued.current;
        queued.current = null;
      }
      onSaved?.();
    } catch {
      setFailed(true);
    } finally {
      queued.current = null;
      inflight.current = false;
      setSaving(false);
    }
  }, [planId, field, onSaved]);

  const commit = useCallback((raw: string) => {
    if (committed.current) return;
    committed.current = true;
    setEditing(false);
    const next = raw.trim().slice(0, maxLength);
    if (next === current && !failed) return;
    setOptimistic(next);
    void push(next);
  }, [current, failed, maxLength, push]);

  const openEditor = useCallback(() => {
    committed.current = false;
    setDraft(current);
    setEditing(true);
  }, [current]);

  const clear = useCallback(() => {
    committed.current = true;
    setOptimistic('');
    void push('');
  }, [push]);

  const shown = current || placeholder;
  const fit = fitBlock(shown, width, height, lines, max, min);

  return (
    <div
      ref={ref}
      data-no-drag="true"
      className="relative w-full cursor-text overflow-hidden"
      style={{ height }}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      onClick={(e) => { e.stopPropagation(); if (!editing) openEditor(); }}
      title={failed ? 'Non enregistré — cliquer pour réessayer' : (current || undefined)}
    >
      <span
        className={`block break-all font-mono font-black ${current ? (tone ?? pal.txt) : pal.ghost}`}
        style={{ fontSize: `${fit.size}px`, lineHeight: `${height / fit.lines}px` }}
      >
        {shown}
      </span>

      {/* Repères d'état : superposés, donc sans effet sur la géométrie. */}
      {failed && <span className="pointer-events-none absolute inset-0 rounded-[2px] ring-1 ring-red-500" />}
      {saving && !failed && <span className="pointer-events-none absolute bottom-0 right-0 h-1 w-1 rounded-full bg-sky-400" />}

      {hovered && !editing && current && (
        <button
          type="button"
          onClick={(e) => { e.stopPropagation(); clear(); }}
          className="absolute right-0 top-0 flex h-3.5 w-3.5 items-center justify-center rounded-sm bg-red-600 text-white shadow"
          title="Effacer"
        >
          <Trash2 className="h-2 w-2" />
        </button>
      )}

      {editing && (
        <input
          ref={inputRef}
          value={draft}
          maxLength={maxLength}
          onChange={(e) => setDraft(e.target.value)}
          onMouseDown={(e) => e.stopPropagation()}
          onClick={(e) => e.stopPropagation()}
          onBlur={() => commit(draft)}
          onKeyDown={(e) => {
            e.stopPropagation();
            if (e.key === 'Enter') { e.preventDefault(); commit(draft); }
            if (e.key === 'Escape') { e.preventDefault(); committed.current = true; setEditing(false); }
          }}
          className="absolute inset-0 w-full rounded-[2px] border border-[#0ea5e9] bg-[#ffffff] px-1 font-mono text-[12px] font-bold text-[#0f172a] outline-none"
        />
      )}
    </div>
  );
}

/** Cellule : label figé sur une ligne, valeur en dessous, hauteur constante. */
function Cell({
  label, pal, rowH, className = '', right, children,
}: {
  label: string;
  pal: Pal;
  rowH: number;
  className?: string;
  right?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div className={`relative min-w-0 overflow-hidden px-1 pt-[2px] ${className}`} style={{ height: rowH }}>
      <div className="flex items-center justify-between gap-1" style={{ height: LABEL_H }}>
        <span className={`block truncate text-[8px] font-black uppercase leading-none tracking-[0.08em] ${pal.lbl}`}>
          {label}
        </span>
        {right}
      </div>
      {children}
    </div>
  );
}

function FlUnitToggle({ planId, unit, onSaved }: { planId: string; unit: string | null; onSaved?: () => void }) {
  const [current, setCurrent] = useState(unit || 'FL');
  const prevRef = useRef(current);

  useEffect(() => { if (unit) setCurrent(unit); }, [unit]);

  const toggle = async (e: React.MouseEvent) => {
    e.stopPropagation();
    const prev = current;
    prevRef.current = prev;
    const next = prev === 'FL' ? 'ft' : 'FL';
    setCurrent(next);
    try {
      const res = await fetch(`/api/plans-vol/${planId}`, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'update_strip', strip_fl_unit: next }),
      });
      if (res.ok) onSaved?.();
      else setCurrent(prevRef.current);
    } catch {
      setCurrent(prevRef.current);
    }
  };

  return (
    <button
      type="button"
      data-no-drag="true"
      onClick={toggle}
      className="shrink-0 rounded bg-black/20 px-1 text-[8px] font-black leading-none hover:bg-black/35"
      style={{ height: LABEL_H }}
      title="Basculer FL / ft"
    >
      {current}
    </button>
  );
}

function HoldTip({
  pos, dark, title, children,
}: {
  pos: { x: number; y: number }; dark: boolean; title: string; children: React.ReactNode;
}) {
  const pw = 380;
  const margin = 12;
  const estHeight = 120;
  const vw = typeof window !== 'undefined' ? window.innerWidth : 800;
  const vh = typeof window !== 'undefined' ? window.innerHeight : 600;
  const left = Math.max(margin, Math.min(pos.x, vw - pw - margin));
  const placeAbove = pos.y > vh / 2;
  let top = placeAbove ? pos.y - 8 : pos.y + 28;
  if (placeAbove && top - estHeight < margin) top = margin + estHeight;
  else if (!placeAbove && top + estHeight > vh - margin) top = vh - margin - estHeight;

  return createPortal(
    <div
      style={{
        position: 'fixed', zIndex: 2147483647, left, top,
        transform: placeAbove ? 'translateY(-100%)' : 'none',
        width: pw, maxWidth: '90vw', maxHeight: `${Math.min(vh - margin * 2, 400)}px`,
        overflow: 'auto', pointerEvents: 'none',
      }}
      className={`rounded-lg border p-3 shadow-2xl ${dark ? 'border-sky-500 bg-slate-900 text-slate-100' : 'border-sky-400 bg-white text-slate-900'}`}
    >
      <div className={`mb-1 text-[10px] font-bold uppercase tracking-wider ${dark ? 'text-sky-400' : 'text-sky-600'}`}>{title}</div>
      <div className="whitespace-pre-wrap break-words text-sm font-medium leading-relaxed">{children}</div>
    </div>,
    document.body,
  );
}

/** Boîte de dialogue en portail : les confirmations ne déforment plus le strip. */
function StripModal({
  isDark, tone, title, children, onClose,
}: {
  isDark: boolean;
  tone: 'red' | 'orange' | 'amber';
  title: string;
  children: React.ReactNode;
  onClose: () => void;
}) {
  const frame = isDark
    ? { red: 'border-red-700 bg-[#180a0c]', orange: 'border-orange-700 bg-[#181008]', amber: 'border-amber-700 bg-[#181206]' }
    : { red: 'border-red-300 bg-white', orange: 'border-orange-300 bg-white', amber: 'border-amber-300 bg-white' };
  const heading = isDark
    ? { red: 'text-red-300', orange: 'text-orange-300', amber: 'text-amber-300' }
    : { red: 'text-red-700', orange: 'text-orange-700', amber: 'text-amber-700' };

  return createPortal(
    <div
      className="fixed inset-0 z-[2147483646] flex items-center justify-center bg-black/70 p-4"
      onClick={onClose}
      onMouseDown={(e) => e.stopPropagation()}
    >
      <div
        className={`w-full max-w-sm rounded-xl border p-4 shadow-2xl ${frame[tone]}`}
        onClick={(e) => e.stopPropagation()}
      >
        <p className={`mb-3 text-sm font-black uppercase tracking-wider ${heading[tone]}`}>{title}</p>
        {children}
      </div>
    </div>,
    document.body,
  );
}

function StripActionBar({
  strip, onRefresh, onTransferRequest, onOptimisticStatut, isDark, pal,
}: {
  strip: StripData;
  onRefresh?: () => void;
  onTransferRequest?: (stripId: string, event?: React.MouseEvent) => void;
  onOptimisticStatut?: (s: string) => void;
  isDark: boolean;
  pal: Pal;
}) {
  const [loading, setLoading] = useState<string | null>(null);
  const [showRefuse, setShowRefuse] = useState(false);
  const [showCancelConfirm, setShowCancelConfirm] = useState(false);
  const [showCrashConfirm, setShowCrashConfirm] = useState(false);
  const [showUrgenceConfirm, setShowUrgenceConfirm] = useState(false);
  const [showMore, setShowMore] = useState(false);
  const [incidentDescription, setIncidentDescription] = useState('');
  const [incidentPhoto, setIncidentPhoto] = useState<File | null>(null);
  const [uploadingPhoto, setUploadingPhoto] = useState(false);
  const [refuseReason, setRefuseReason] = useState('');
  const [intentionsPos, setIntentionsPos] = useState<{ x: number; y: number } | null>(null);
  const [noteAtcPos, setNoteAtcPos] = useState<{ x: number; y: number } | null>(null);
  const [showBriaLog, setShowBriaLog] = useState(false);
  const busyRef = useRef(false);

  const OPTIMISTIC_STATUT: Record<string, string> = {
    accepter: 'accepte',
    cloture: 'cloture',
    automonitoring: 'automonitoring',
    en_cours: 'en_cours',
  };

  const callAction = async (action: string, body: Record<string, unknown> = {}) => {
    if (busyRef.current) return;
    busyRef.current = true;
    setLoading(action);
    const optimistic = OPTIMISTIC_STATUT[action];
    if (optimistic) onOptimisticStatut?.(optimistic);
    try {
      const res = await fetch(`/api/plans-vol/${strip.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action, ...body }),
      });
      const d = await res.json().catch(() => ({}));
      if (!res.ok) {
        if (optimistic) onOptimisticStatut?.(strip.statut);
        if (res.status === 400 || res.status === 409) onRefresh?.();
        throw new Error(d.error || 'Erreur');
      }
      onRefresh?.();
    } catch (e) {
      playErrorBeep();
      toast.error(e instanceof Error ? e.message : 'Erreur');
    } finally {
      setLoading(null);
      busyRef.current = false;
    }
  };

  const statut = strip.statut;
  const isAutomonitoring = strip.automonitoring;
  const btn = 'inline-flex shrink-0 items-center gap-1 rounded-md px-2 py-1 text-[11px] font-bold shadow-sm disabled:opacity-50';

  const resetIncident = () => { setIncidentDescription(''); setIncidentPhoto(null); };

  const submitIncident = async (actionType: 'crash' | 'atterrissage_urgence') => {
    if (busyRef.current) return;
    busyRef.current = true;
    setLoading(actionType);
    try {
      const res = await fetch(`/api/plans-vol/${strip.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: actionType, description: incidentDescription.trim() || undefined }),
      });
      const d = await res.json().catch(() => ({}));
      if (!res.ok) {
        if (res.status === 400 || res.status === 409) onRefresh?.();
        playErrorBeep();
        toast.error(d.error || 'Erreur');
        return;
      }
      if (incidentPhoto && d.incident_id) {
        setUploadingPhoto(true);
        try {
          const fd = new FormData();
          fd.append('photo', incidentPhoto);
          await fetch(`/api/incidents/${d.incident_id}/photos`, { method: 'POST', body: fd });
        } catch { /* photo non critique */ } finally { setUploadingPhoto(false); }
      }
      onRefresh?.();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Erreur');
    } finally {
      setLoading(null);
      busyRef.current = false;
    }
  };

  const hasActions = statut === 'en_attente' || statut === 'depose' || statut === 'en_attente_cloture' || statut === 'en_cours' || statut === 'accepte';

  const holdTip = (setter: (v: { x: number; y: number } | null) => void) => ({
    onMouseDown: (e: React.MouseEvent<HTMLButtonElement>) => {
      e.stopPropagation();
      const rect = e.currentTarget.getBoundingClientRect();
      setter({ x: rect.left, y: rect.top });
    },
    onMouseUp: () => setter(null),
    onMouseLeave: () => setter(null),
    onTouchStart: (e: React.TouchEvent<HTMLButtonElement>) => {
      e.stopPropagation();
      const rect = e.currentTarget.getBoundingClientRect();
      setter({ x: rect.left, y: rect.top });
    },
    onTouchEnd: () => setter(null),
  });

  const modalBtn = 'flex-1 rounded-lg px-2 py-2 text-xs font-bold text-white disabled:opacity-50';
  const modalCancel = `rounded-lg px-3 py-2 text-xs font-bold ${isDark ? 'bg-slate-700 text-slate-200' : 'bg-slate-200 text-slate-700'}`;
  const modalArea = `w-full resize-none rounded border px-2 py-1 text-xs ${isDark ? 'border-slate-600 bg-slate-900 text-slate-100' : 'border-slate-300 bg-white text-slate-800'}`;

  return (
    <div
      data-no-drag="true"
      className={`flex items-center gap-1 overflow-x-auto border-t px-1.5 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden ${isDark ? 'border-white/10 bg-black/30' : 'border-black/10 bg-black/[0.05]'}`}
      style={{ height: BAR_H }}
      onClick={(e) => e.stopPropagation()}
    >
      {strip.isManual ? (
        <div className={`mr-auto flex min-w-0 shrink-0 items-center gap-1 ${pal.lbl}`} style={{ width: 104 }}>
          <Plane className="h-3 w-3 shrink-0" />
          <EditValue
            value={strip.strip_pilote_text} field="strip_pilote_text" planId={strip.id}
            placeholder="Pilote…" maxLength={30} max={11} height={14} pal={pal} onSaved={onRefresh}
          />
        </div>
      ) : strip.pilote_identifiant ? (
        <span className={`mr-auto flex min-w-0 shrink items-center gap-1 truncate text-[11px] font-bold ${pal.lbl}`}>
          <Plane className="h-3 w-3 shrink-0" />
          <span className="truncate">{strip.pilote_identifiant}</span>
        </span>
      ) : <span className="mr-auto" />}

      {hasActions && (statut === 'en_attente' || statut === 'depose') && (
        <>
          <button type="button" onClick={() => callAction('accepter')} disabled={loading !== null} className={`${btn} bg-emerald-600 text-white hover:bg-emerald-700`}>
            <CheckCircle className="h-3.5 w-3.5" />{loading === 'accepter' ? '…' : 'Accepter'}
          </button>
          <button type="button" onClick={() => setShowRefuse(true)} disabled={loading !== null} className={`${btn} bg-red-600 text-white hover:bg-red-700`}>
            <XCircle className="h-3.5 w-3.5" />Refuser
          </button>
        </>
      )}
      {statut === 'en_attente_cloture' && (
        <button type="button" onClick={() => callAction('confirmer_cloture')} disabled={loading !== null} className={`${btn} animate-pulse bg-emerald-600 text-white hover:bg-emerald-700`}>
          <CheckCircle className="h-3.5 w-3.5" />{loading === 'confirmer_cloture' ? '…' : 'Clôture'}
        </button>
      )}
      {(statut === 'en_cours' || statut === 'accepte') && !isAutomonitoring && (
        <button type="button" onClick={() => callAction('transferer', { automonitoring: true })} disabled={loading !== null} className={`${btn} bg-violet-600 text-white hover:bg-violet-700`}>
          <Radio className="h-3.5 w-3.5" />{loading === 'transferer' ? '…' : 'Autosurv.'}
        </button>
      )}
      {strip.current_holder_user_id && onTransferRequest && (
        <button type="button" onClick={(e) => onTransferRequest(strip.id, e)} disabled={loading !== null} className={`${btn} bg-sky-600 text-white hover:bg-sky-700`}>
          <ArrowRightLeft className="h-3.5 w-3.5" />Transférer
        </button>
      )}

      {((strip.type_vol === 'VFR' && strip.intentions_vol) || (strip.type_vol === 'IFR' && strip.niveau_croisiere)) && (
        <>
          <button type="button" {...holdTip(setIntentionsPos)} className={`${btn} ${intentionsPos ? 'bg-sky-600 text-white' : (isDark ? 'bg-sky-900 text-sky-100 hover:bg-sky-800' : 'bg-sky-100 text-sky-800 hover:bg-sky-200')}`}>
            <MessageSquare className="h-3.5 w-3.5" />{strip.type_vol === 'IFR' && strip.niveau_croisiere ? 'CRZ' : 'Intentions'}
          </button>
          {intentionsPos && (
            <HoldTip pos={intentionsPos} dark={isDark} title={strip.type_vol === 'IFR' && strip.niveau_croisiere ? 'Niveau de croisière' : 'Intentions de vol'}>
              {strip.type_vol === 'IFR' && strip.niveau_croisiere ? `CRZ : FL ${strip.niveau_croisiere}` : (strip.intentions_vol || '')}
            </HoldTip>
          )}
        </>
      )}
      {strip.instructions_atc && (
        <>
          <button type="button" {...holdTip(setNoteAtcPos)} className={`${btn} ${noteAtcPos ? 'bg-amber-500 text-black' : (isDark ? 'bg-amber-900 text-amber-100 hover:bg-amber-800' : 'bg-amber-100 text-amber-900 hover:bg-amber-200')}`}>
            <AlertTriangle className="h-3.5 w-3.5" />Note
          </button>
          {noteAtcPos && (
            <HoldTip pos={noteAtcPos} dark={isDark} title="Note d'attention du pilote">{strip.instructions_atc}</HoldTip>
          )}
        </>
      )}

      <div className={`relative shrink-0 ${hasActions ? '' : 'hidden'}`}>
        <button
          type="button"
          onClick={() => setShowMore((v) => !v)}
          className={`${btn} ${isDark ? 'bg-slate-800 text-slate-200 hover:bg-slate-700' : 'bg-white text-slate-700 hover:bg-slate-100'}`}
          title="Plus d'actions"
        >
          <MoreHorizontal className="h-3.5 w-3.5" />
        </button>
        {showMore && (
          <>
            <div className="fixed inset-0 z-[60]" onClick={() => setShowMore(false)} />
            <div className={`absolute bottom-full right-0 z-[61] mb-1 min-w-[168px] rounded-lg border py-1 shadow-xl ${isDark ? 'border-slate-700 bg-slate-900' : 'border-slate-200 bg-white'}`}>
              {strip.bria_conversation && strip.bria_conversation.length > 0 && (
                <button type="button" onClick={() => { setShowBriaLog(true); setShowMore(false); }} className={`flex w-full items-center gap-2 px-3 py-1.5 text-left text-xs font-semibold ${isDark ? 'text-amber-200 hover:bg-slate-800' : 'text-amber-800 hover:bg-slate-50'}`}>
                  <Radio className="h-3.5 w-3.5" /> Historique BRIA
                </button>
              )}
              {(statut === 'en_cours' || statut === 'accepte' || statut === 'en_attente_cloture') && (
                <>
                  <button type="button" onClick={() => { setShowCrashConfirm(true); setShowMore(false); }} className={`flex w-full items-center gap-2 px-3 py-1.5 text-left text-xs font-semibold ${isDark ? 'text-red-300 hover:bg-slate-800' : 'text-red-700 hover:bg-red-50'}`}>
                    <Flame className="h-3.5 w-3.5" /> CRASH
                  </button>
                  <button type="button" onClick={() => { setShowUrgenceConfirm(true); setShowMore(false); }} className={`flex w-full items-center gap-2 px-3 py-1.5 text-left text-xs font-semibold ${isDark ? 'text-amber-300 hover:bg-slate-800' : 'text-amber-800 hover:bg-amber-50'}`}>
                    <PlaneLanding className="h-3.5 w-3.5" /> Urgence
                  </button>
                </>
              )}
              <button type="button" onClick={() => { setShowCancelConfirm(true); setShowMore(false); }} className={`flex w-full items-center gap-2 px-3 py-1.5 text-left text-xs font-semibold ${isDark ? 'text-orange-300 hover:bg-slate-800' : 'text-orange-800 hover:bg-orange-50'}`}>
                <XCircle className="h-3.5 w-3.5" /> Annuler le vol
              </button>
            </div>
          </>
        )}
      </div>

      {showRefuse && (
        <StripModal isDark={isDark} tone="red" title={`Refuser ${strip.numero_vol}`} onClose={() => { setShowRefuse(false); setRefuseReason(''); }}>
          <textarea
            autoFocus rows={3} value={refuseReason} onChange={(e) => setRefuseReason(e.target.value)}
            placeholder="Raison du refus…" className={modalArea}
          />
          <div className="mt-3 flex gap-2">
            <button
              type="button"
              onClick={async () => {
                if (!refuseReason.trim()) { toast.error('Raison obligatoire'); return; }
                await callAction('refuser', { refusal_reason: refuseReason.trim() });
                setShowRefuse(false); setRefuseReason('');
              }}
              disabled={loading === 'refuser'}
              className={`${modalBtn} bg-red-600 hover:bg-red-700`}
            >
              {loading === 'refuser' ? '…' : 'Confirmer le refus'}
            </button>
            <button type="button" onClick={() => { setShowRefuse(false); setRefuseReason(''); }} className={modalCancel}>Retour</button>
          </div>
        </StripModal>
      )}

      {showCancelConfirm && (
        <StripModal isDark={isDark} tone="orange" title={`Annuler ${strip.numero_vol}`} onClose={() => setShowCancelConfirm(false)}>
          <p className={`text-sm font-semibold ${isDark ? 'text-slate-200' : 'text-slate-700'}`}>
            Le plan de vol sera définitivement supprimé.
          </p>
          <div className="mt-3 flex gap-2">
            <button
              type="button"
              onClick={async () => { await callAction('annuler'); setShowCancelConfirm(false); }}
              disabled={loading === 'annuler'}
              className={`${modalBtn} bg-red-600 hover:bg-red-700`}
            >
              {loading === 'annuler' ? '…' : "Confirmer l'annulation"}
            </button>
            <button type="button" onClick={() => setShowCancelConfirm(false)} className={modalCancel}>Retour</button>
          </div>
        </StripModal>
      )}

      {(showCrashConfirm || showUrgenceConfirm) && (
        <StripModal
          isDark={isDark}
          tone={showCrashConfirm ? 'red' : 'amber'}
          title={showCrashConfirm ? `Crash — ${strip.numero_vol}` : `Atterrissage d'urgence — ${strip.numero_vol}`}
          onClose={() => { setShowCrashConfirm(false); setShowUrgenceConfirm(false); resetIncident(); }}
        >
          <p className={`mb-2 text-xs ${isDark ? 'text-slate-400' : 'text-slate-600'}`}>
            L&apos;avion sera bloqué en attente d&apos;examen staff.
          </p>
          <textarea
            rows={3} value={incidentDescription} onChange={(e) => setIncidentDescription(e.target.value)}
            placeholder="Description (optionnel)…" className={modalArea}
          />
          <label className={`mt-2 flex cursor-pointer items-center gap-2 text-xs ${isDark ? 'text-slate-300' : 'text-slate-600'}`}>
            <span className={`shrink-0 rounded border px-2 py-0.5 text-[10px] font-semibold ${isDark ? 'border-slate-600 bg-slate-800' : 'border-slate-300 bg-white'}`}>
              Photo {incidentPhoto ? `· ${incidentPhoto.name.slice(0, 18)}` : ''}
            </span>
            <input type="file" accept="image/*" className="hidden" onChange={(e) => setIncidentPhoto(e.target.files?.[0] ?? null)} />
          </label>
          <div className="mt-3 flex gap-2">
            <button
              type="button"
              onClick={async () => {
                const crash = showCrashConfirm;
                await submitIncident(crash ? 'crash' : 'atterrissage_urgence');
                setShowCrashConfirm(false); setShowUrgenceConfirm(false); resetIncident();
              }}
              disabled={loading !== null || uploadingPhoto}
              className={`${modalBtn} ${showCrashConfirm ? 'bg-red-700 hover:bg-red-800' : 'bg-amber-600 hover:bg-amber-700'}`}
            >
              {uploadingPhoto ? 'Upload…' : loading ? '…' : showCrashConfirm ? 'Confirmer le crash' : "Confirmer l'urgence"}
            </button>
            <button type="button" onClick={() => { setShowCrashConfirm(false); setShowUrgenceConfirm(false); resetIncident(); }} className={modalCancel}>Retour</button>
          </div>
        </StripModal>
      )}

      {showBriaLog && createPortal(
        <div className="fixed inset-0 z-[2147483647] flex items-center justify-center bg-black/70 p-4" onClick={() => setShowBriaLog(false)}>
          <div className={`max-h-[70vh] w-[480px] max-w-[90vw] overflow-y-auto rounded-xl border p-5 shadow-2xl ${isDark ? 'border-amber-700 bg-slate-900 text-slate-100' : 'border-amber-400 bg-white text-slate-900'}`} onClick={(e) => e.stopPropagation()}>
            <div className={`mb-3 flex items-center gap-2 text-xs font-bold uppercase tracking-wider ${isDark ? 'text-amber-400' : 'text-amber-600'}`}>
              <Radio className="h-4 w-4" /> Historique BRIA
            </div>
            <div className="space-y-2">
              {(strip.bria_conversation || []).map((msg, i) => (
                <div key={i} className={`flex ${msg.role === 'bria' ? 'justify-start' : 'justify-end'}`}>
                  <div className={`max-w-[85%] whitespace-pre-line rounded-lg px-3 py-2 text-xs ${
                    msg.role === 'bria'
                      ? (isDark ? 'border border-amber-700/40 bg-amber-900/50 text-amber-100' : 'border border-amber-200 bg-amber-50 text-amber-900')
                      : (isDark ? 'border border-sky-700/40 bg-sky-900/50 text-sky-100' : 'border border-sky-200 bg-sky-50 text-sky-900')
                  }`}>
                    <span className={`mb-0.5 block text-xs font-bold ${msg.role === 'bria' ? (isDark ? 'text-amber-400' : 'text-amber-600') : (isDark ? 'text-sky-400' : 'text-sky-600')}`}>
                      {msg.role === 'bria' ? 'BRIA' : 'Pilote'}
                    </span>
                    {msg.text}
                  </div>
                </div>
              ))}
            </div>
            <button type="button" onClick={() => setShowBriaLog(false)} className={`mt-4 w-full rounded-lg py-2 text-xs font-bold ${isDark ? 'bg-slate-700 text-slate-200 hover:bg-slate-600' : 'bg-slate-200 text-slate-700 hover:bg-slate-300'}`}>
              Fermer
            </button>
          </div>
        </div>,
        document.body,
      )}
    </div>
  );
}

/** Pastille d'état dans la bande supérieure. Hauteur figée, jamais de retour à la ligne. */
function Chip({ tone, children, pulse, title }: { tone: string; children: React.ReactNode; pulse?: boolean; title?: string }) {
  return (
    <span
      title={title}
      className={`inline-flex shrink-0 items-center gap-0.5 rounded px-1 text-[8px] font-black uppercase leading-none tracking-[0.1em] ${tone} ${pulse ? 'animate-pulse' : ''}`}
      style={{ height: LANE_H - 4 }}
    >
      {children}
    </span>
  );
}

function FlightStripImpl({
  strip, onRefresh, onContextMenu, onTransferRequest,
}: {
  strip: StripData;
  onRefresh?: () => void;
  onContextMenu?: (e: React.MouseEvent, stripId: string) => void;
  onTransferRequest?: (stripId: string, event?: React.MouseEvent) => void;
}) {
  const { theme } = useAtcTheme();
  const isDark = theme === 'dark';
  const [optimisticStatut, setOptimisticStatut] = useState<string | null>(null);
  useEffect(() => { setOptimisticStatut(null); }, [strip.statut]);
  const statut = optimisticStatut ?? strip.statut;
  const isClotureRequested = statut === 'en_attente_cloture';

  useEffect(() => {
    if (!isClotureRequested) return;
    try {
      const AudioContext = window.AudioContext || (window as unknown as { webkitAudioContext: typeof window.AudioContext }).webkitAudioContext;
      if (!AudioContext) return;
      const ctx = new AudioContext();
      const oscillator = ctx.createOscillator();
      const gainNode = ctx.createGain();
      oscillator.connect(gainNode);
      gainNode.connect(ctx.destination);
      oscillator.frequency.value = 400;
      gainNode.gain.value = 0.3;
      oscillator.start();
      setTimeout(() => { oscillator.frequency.value = 500; }, 200);
      setTimeout(() => { oscillator.frequency.value = 400; }, 400);
      setTimeout(() => { oscillator.stop(); ctx.close(); }, 600);
    } catch { /* audio */ }
  }, [isClotureRequested]);

  const sqColor = getSquawkColor(strip.code_transpondeur);
  const sqLabel = getSquawkLabel(strip.code_transpondeur);
  const isEmergency = !!sqColor;
  const isManual = strip.isManual ?? false;
  const isDupe = strip.isDupe ?? false;
  const modeTranspondeur = (strip.mode_transpondeur || 'C').toUpperCase();
  const squawkMismatch = Boolean(strip.squawk_attendu && strip.code_transpondeur && strip.code_transpondeur !== strip.squawk_attendu);
  const noSquawk = Boolean(strip.squawk_attendu && !strip.code_transpondeur);
  const isMedevac = Boolean(strip.siavi_avion_id) || /medevac/i.test(strip.type_vol || '');

  /**
   * Toutes les couleurs sont données en valeurs explicites : `globals.css`
   * réécrit `.text-slate-600` → `.text-slate-900` en `!important` sous
   * `body.atc-dark`, ce qui repeignait le texte du strip en clair sur un fond
   * clair (donc invisible) dès que le thème et la classe du body divergeaient.
   */
  const pal: Pal = useMemo(() => {
    if (isEmergency) {
      const radio = sqColor === 'radio';
      return isDark
        ? { border: radio ? 'border-[#f59e0b]' : 'border-[#ef4444]', head: radio ? 'bg-[#3a2a06]' : 'bg-[#3a0d0d]', left: radio ? 'bg-[#241c06]' : 'bg-[#260a0a]', right: radio ? 'bg-[#2e2408]' : 'bg-[#301010]', sep: radio ? 'border-[#78350f]' : 'border-[#7f1d1d]', txt: 'text-[#f8fafc]', lbl: 'text-[#fca5a5]', tab: radio ? 'bg-[#f59e0b]' : 'bg-[#dc2626]', ghost: 'text-[#7f4a4a]' }
        : { border: radio ? 'border-[#d97706]' : 'border-[#b91c1c]', head: radio ? 'bg-[#fde68a]' : 'bg-[#fecaca]', left: radio ? 'bg-[#fffbeb]' : 'bg-[#fef2f2]', right: radio ? 'bg-[#fef3c7]' : 'bg-[#fee2e2]', sep: radio ? 'border-[#fbbf24]' : 'border-[#fca5a5]', txt: 'text-[#0f172a]', lbl: 'text-[#7f1d1d]', tab: radio ? 'bg-[#f59e0b]' : 'bg-[#dc2626]', ghost: 'text-[#c98b8b]' };
    }
    if (isDupe) {
      return isDark
        ? { border: 'border-[#ef4444]', head: 'bg-[#1c2028]', left: 'bg-[#171a21]', right: 'bg-[#1c2028]', sep: 'border-[#475569]', txt: 'text-[#94a3b8]', lbl: 'text-[#64748b]', tab: 'bg-[#b91c1c]', ghost: 'text-[#475569]' }
        : { border: 'border-[#dc2626]', head: 'bg-[#cbd5e1]', left: 'bg-[#f1f5f9]', right: 'bg-[#e2e8f0]', sep: 'border-[#94a3b8]', txt: 'text-[#64748b]', lbl: 'text-[#64748b]', tab: 'bg-[#dc2626]', ghost: 'text-[#94a3b8]' };
    }
    if (isClotureRequested) {
      return isDark
        ? { border: 'border-[#ef4444]', head: 'bg-[#3a0f13]', left: 'bg-[#240a0d]', right: 'bg-[#2c0d11]', sep: 'border-[#7f1d1d]', txt: 'text-[#f8fafc]', lbl: 'text-[#fca5a5]', tab: 'bg-[#dc2626]', ghost: 'text-[#7f4a4a]' }
        : { border: 'border-[#ef4444]', head: 'bg-[#fecaca]', left: 'bg-[#fef2f2]', right: 'bg-[#fee2e2]', sep: 'border-[#fca5a5]', txt: 'text-[#0f172a]', lbl: 'text-[#7f1d1d]', tab: 'bg-[#dc2626]', ghost: 'text-[#c98b8b]' };
    }
    if (isManual) {
      return isDark
        ? { border: 'border-[#4f46e5]', head: 'bg-[#221d4d]', left: 'bg-[#191540]', right: 'bg-[#1f1a4a]', sep: 'border-[#3730a3]', txt: 'text-[#f8fafc]', lbl: 'text-[#c7d2fe]', tab: 'bg-[#6366f1]', ghost: 'text-[#6b6ba8]' }
        : { border: 'border-[#6d7eab]', head: 'bg-[#c9d3e8]', left: 'bg-[#e6ebf6]', right: 'bg-[#eee9f8]', sep: 'border-[#8b9bc4]', txt: 'text-[#0f172a]', lbl: 'text-[#475569]', tab: 'bg-[#6366f1]', ghost: 'text-[#94a3b8]' };
    }
    return isDark
      ? { border: 'border-[#047857]', head: 'bg-[#123021]', left: 'bg-[#0c2116]', right: 'bg-[#1e1c0d]', sep: 'border-[#064e3b]', txt: 'text-[#f8fafc]', lbl: 'text-[#a7f3d0]', tab: statut === 'en_cours' ? 'bg-[#0ea5e9]' : statut === 'accepte' ? 'bg-[#10b981]' : 'bg-[#f59e0b]', ghost: 'text-[#4d7a63]' }
      : { border: 'border-[#6f9a6f]', head: 'bg-[#c5dcc5]', left: 'bg-[#e2f2e2]', right: 'bg-[#f6f1d4]', sep: 'border-[#8fbc8f]', txt: 'text-[#0f172a]', lbl: 'text-[#475569]', tab: statut === 'en_cours' ? 'bg-[#0284c7]' : statut === 'accepte' ? 'bg-[#059669]' : 'bg-[#f59e0b]', ghost: 'text-[#94a3b8]' };
  }, [isEmergency, sqColor, isDupe, isClotureRequested, isManual, isDark, statut]);

  const statutTone =
    statut === 'en_cours' ? (isDark ? 'bg-[#075985] text-[#e0f2fe]' : 'bg-[#bae6fd] text-[#0c4a6e]') :
    statut === 'en_attente_cloture' ? 'bg-[#dc2626] text-[#ffffff]' :
    statut === 'accepte' ? (isDark ? 'bg-[#065f46] text-[#d1fae5]' : 'bg-[#a7f3d0] text-[#064e3b]') :
    (statut === 'depose' || statut === 'en_attente') ? (isDark ? 'bg-[#78350f] text-[#fef3c7]' : 'bg-[#fde68a] text-[#78350f]') :
    statut === 'automonitoring' ? (isDark ? 'bg-[#4c1d95] text-[#ede9fe]' : 'bg-[#ddd6fe] text-[#4c1d95]') :
    (isDark ? 'bg-[#1e293b] text-[#e2e8f0]' : 'bg-[#e2e8f0] text-[#1e293b]');

  const autoTone = isDark ? 'bg-[#4c1d95] text-[#ede9fe]' : 'bg-[#ddd6fe] text-[#4c1d95]';

  const cycleRule = async () => {
    if (!isManual) return;
    const idx = FLIGHT_RULES.indexOf((strip.type_vol || 'IFR').toUpperCase());
    const next = FLIGHT_RULES[(idx + 1) % FLIGHT_RULES.length];
    try {
      const res = await fetch(`/api/plans-vol/${strip.id}`, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'update_strip', type_vol: next }),
      });
      if (res.ok) onRefresh?.();
    } catch { /* le prochain refresh resynchronisera */ }
  };

  const sep = `border-r ${pal.sep}`;

  return (
    <div
      className={`w-full overflow-hidden rounded-md border shadow-sm select-none ${pal.border} ${isClotureRequested && !isDupe ? 'atc-strip-closure' : ''} ${isDupe && !isEmergency ? 'atc-strip-dupe' : ''}`}
      style={{ minWidth: STRIP_MIN_WIDTH }}
      onContextMenu={(e) => { e.preventDefault(); onContextMenu?.(e, strip.id); }}
    >
      <div className="flex">
        {/* Onglet vertical : règle de vol. Cliquable sur les strips manuels. */}
        <div
          data-drag-handle="true"
          onClick={isManual ? (e) => { e.stopPropagation(); void cycleRule(); } : undefined}
          title={isManual ? 'Glisser le strip · clic = changer la règle de vol' : 'Glisser le strip'}
          className={`flex w-[18px] shrink-0 items-center justify-center ${pal.tab} ${isManual ? 'cursor-pointer' : 'cursor-grab active:cursor-grabbing'}`}
        >
          <span
            className="pointer-events-none whitespace-nowrap text-[8px] font-black tracking-[0.14em] text-white"
            style={{ writingMode: 'vertical-rl', transform: 'rotate(180deg)' }}
          >
            {(strip.type_vol || 'IFR').toUpperCase().slice(0, 7)}
          </span>
        </div>

        {/* Poignée de déplacement */}
        <div
          data-drag-handle="true"
          title="Glisser le strip"
          className={`flex w-[18px] shrink-0 cursor-grab items-center justify-center active:cursor-grabbing ${pal.head} ${sep}`}
        >
          <GripVertical className={`pointer-events-none h-4 w-4 ${isDark ? 'text-white/50' : 'text-black/35'}`} />
        </div>

        <div className="min-w-0 flex-1">
          {/* Bande d'état : hauteur figée, pastilles jamais repliées */}
          <div
            className={`flex items-center gap-1 overflow-x-auto border-b px-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden ${pal.head} ${pal.sep}`}
            style={{ height: LANE_H }}
          >
            <Chip tone={statutTone} title={`Statut : ${statutLabel(statut)}`}>{statutLabel(statut)}</Chip>
            {sqLabel && <Chip tone="bg-[#dc2626] text-[#ffffff]" pulse title={`Squawk d'urgence ${strip.code_transpondeur}`}>{sqLabel}</Chip>}
            {isClotureRequested && !isDupe && <Chip tone="bg-[#dc2626] text-[#ffffff]" pulse title="Le pilote demande la clôture">Clôture</Chip>}
            {isDupe && <Chip tone="bg-[#b91c1c] text-[#ffffff]" pulse title="Deux vols au même squawk en mode C">Dupe</Chip>}
            {noSquawk && !sqLabel && <Chip tone="bg-[#f59e0b] text-[#000000]" title="Aucun code transpondeur affiché">No sqwk</Chip>}
            {squawkMismatch && !sqLabel && <Chip tone="bg-[#f59e0b] text-[#000000]" title={`Attendu : ${strip.squawk_attendu}`}>Sqwk ≠</Chip>}
            {strip.pending_transfer_aeroport && (
              <Chip tone="bg-[#d97706] text-[#000000]" title={`Transfert sortant vers ${strip.pending_transfer_position || 'ATC'} ${strip.pending_transfer_aeroport}`}>
                → {strip.pending_transfer_position || 'ATC'} {strip.pending_transfer_aeroport}
              </Chip>
            )}
            {isMedevac && <Chip tone="bg-[#b91c1c] text-[#ffffff]" title="Mission MEDEVAC">Medevac</Chip>}
            {strip.automonitoring && <Chip tone={autoTone} title="Vol en autosurveillance">Auto</Chip>}
          </div>

          {/* Identification */}
          <div
            className={`grid border-b ${pal.head} ${pal.sep}`}
            style={{ gridTemplateColumns: '2fr 1.15fr 1fr' }}
          >
            <Cell label="Callsign" pal={pal} rowH={ROW_ID_H} className={sep}>
              {isManual ? (
                <EditValue
                  value={strip.numero_vol} field="numero_vol" planId={strip.id} placeholder="????"
                  maxLength={10} max={19} height={valueH(ROW_ID_H)} pal={pal} onSaved={onRefresh}
                />
              ) : (
                <FitValue
                  text={strip.callsign_telephonie ? `${strip.numero_vol} ${strip.callsign_telephonie}` : strip.numero_vol}
                  max={19} height={valueH(ROW_ID_H)} pal={pal}
                />
              )}
            </Cell>
            <Cell label={`Type / ${modeTranspondeur}`} pal={pal} rowH={ROW_ID_H} className={sep}>
              {isManual ? (
                <EditValue
                  value={strip.strip_type_wake} field="strip_type_wake" planId={strip.id} placeholder="—"
                  maxLength={10} max={15} height={valueH(ROW_ID_H)} pal={pal} onSaved={onRefresh}
                />
              ) : (
                <FitValue text={strip.type_wake} max={15} height={valueH(ROW_ID_H)} pal={pal} />
              )}
            </Cell>
            <Cell label="Sqwk" pal={pal} rowH={ROW_ID_H}>
              <FitValue
                text={strip.code_transpondeur} max={15} height={valueH(ROW_ID_H)} pal={pal}
                tone={isEmergency ? (isDark ? 'text-[#fca5a5]' : 'text-[#b91c1c]') : undefined}
              />
            </Cell>
          </div>

          {/* Route sol */}
          <div
            className={`grid border-b ${pal.left} ${pal.sep}`}
            style={{ gridTemplateColumns: '1fr 1fr 0.85fr 0.95fr 0.95fr' }}
          >
            <Cell label="ADEP" pal={pal} rowH={ROW_RTE_H} className={sep}>
              {isManual ? (
                <EditValue value={strip.aeroport_depart} field="aeroport_depart" planId={strip.id} placeholder="????" maxLength={4} max={15} height={valueH(ROW_RTE_H)} pal={pal} onSaved={onRefresh} />
              ) : (
                <FitValue text={strip.aeroport_depart} max={15} height={valueH(ROW_RTE_H)} pal={pal} />
              )}
            </Cell>
            <Cell label="ADES" pal={pal} rowH={ROW_RTE_H} className={sep}>
              {isManual ? (
                <EditValue value={strip.aeroport_arrivee} field="aeroport_arrivee" planId={strip.id} placeholder="????" maxLength={4} max={15} height={valueH(ROW_RTE_H)} pal={pal} onSaved={onRefresh} />
              ) : (
                <FitValue text={strip.aeroport_arrivee} max={15} height={valueH(ROW_RTE_H)} pal={pal} />
              )}
            </Cell>
            <Cell label="RWY" pal={pal} rowH={ROW_RTE_H} className={sep}>
              <EditValue value={strip.strip_rwy} field="strip_rwy" planId={strip.id} maxLength={5} max={15} height={valueH(ROW_RTE_H)} pal={pal} onSaved={onRefresh} />
            </Cell>
            <Cell label="ATD" pal={pal} rowH={ROW_RTE_H} className={sep}>
              <EditValue value={strip.strip_atd} field="strip_atd" planId={strip.id} maxLength={5} max={15} height={valueH(ROW_RTE_H)} pal={pal} onSaved={onRefresh} />
            </Cell>
            <Cell label="CTOT" pal={pal} rowH={ROW_RTE_H}>
              <FitValue text={formatCtot(strip.heure_depart_estimee || strip.created_at)} max={15} height={valueH(ROW_RTE_H)} pal={pal} />
            </Cell>
          </div>

          {/* Clairance verticale et procédures */}
          <div
            className={`grid border-b ${pal.right} ${pal.sep}`}
            style={{ gridTemplateColumns: '1fr 1.5fr 1.5fr' }}
          >
            <Cell
              label="Alt"
              pal={pal}
              rowH={ROW_CLR_H}
              className={sep}
              right={<FlUnitToggle planId={strip.id} unit={strip.strip_fl_unit} onSaved={onRefresh} />}
            >
              <EditValue value={strip.strip_fl} field="strip_fl" planId={strip.id} maxLength={5} max={14} height={valueH(ROW_CLR_H)} pal={pal} onSaved={onRefresh} />
            </Cell>
            <Cell label="SID" pal={pal} rowH={ROW_CLR_H} className={sep}>
              <EditValue value={strip.strip_sid_atc || strip.sid_depart} field="strip_sid_atc" planId={strip.id} maxLength={24} max={13} height={valueH(ROW_CLR_H)} pal={pal} onSaved={onRefresh} />
            </Cell>
            <Cell label="STAR" pal={pal} rowH={ROW_CLR_H}>
              <EditValue value={strip.strip_star || strip.star_arrivee} field="strip_star" planId={strip.id} maxLength={24} max={13} height={valueH(ROW_CLR_H)} pal={pal} onSaved={onRefresh} />
            </Cell>
          </div>

          {/* Annotations contrôleur */}
          <div
            className={`grid border-b ${pal.right} ${pal.sep}`}
            style={{ gridTemplateColumns: '1fr 1fr 1.4fr' }}
          >
            <Cell label="CLR" pal={pal} rowH={ROW_NOTE_H} className={sep}>
              <EditValue value={strip.strip_note_2} field="strip_note_2" planId={strip.id} maxLength={20} max={13} lines={2} height={valueH(ROW_NOTE_H)} pal={pal} onSaved={onRefresh} />
            </Cell>
            <Cell label="Note" pal={pal} rowH={ROW_NOTE_H} className={sep}>
              <EditValue value={strip.strip_note_1} field="strip_note_1" planId={strip.id} maxLength={20} max={13} lines={2} height={valueH(ROW_NOTE_H)} pal={pal} onSaved={onRefresh} />
            </Cell>
            <Cell label="Info" pal={pal} rowH={ROW_NOTE_H}>
              <EditValue value={strip.strip_note_3} field="strip_note_3" planId={strip.id} maxLength={30} max={13} lines={2} height={valueH(ROW_NOTE_H)} pal={pal} onSaved={onRefresh} />
            </Cell>
          </div>

          {/* Route et immatriculation */}
          <div className={`grid ${pal.right}`} style={{ gridTemplateColumns: '1fr 0.42fr' }}>
            <Cell label="Route" pal={pal} rowH={ROW_FULL_H} className={sep}>
              <EditValue
                value={strip.strip_route || strip.route_ifr} field="strip_route" planId={strip.id}
                maxLength={80} max={12} lines={2} height={valueH(ROW_FULL_H)} pal={pal} onSaved={onRefresh}
              />
            </Cell>
            <Cell label="Tail" pal={pal} rowH={ROW_FULL_H}>
              <FitValue text={strip.immatriculation} max={12} height={valueH(ROW_FULL_H)} pal={pal} bold={false} />
            </Cell>
          </div>
        </div>
      </div>

      <StripActionBar
        strip={{ ...strip, statut }}
        onRefresh={onRefresh}
        onTransferRequest={onTransferRequest}
        onOptimisticStatut={setOptimisticStatut}
        isDark={isDark}
        pal={pal}
      />
    </div>
  );
}

const FlightStrip = memo(FlightStripImpl);
export default FlightStrip;
