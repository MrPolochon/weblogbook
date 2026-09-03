'use client';

import { useState, useRef, useCallback, useEffect, memo } from 'react';
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

const NOT_SET = Symbol('NOT_SET');

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

function InlineEdit({
  value, field, planId, placeholder, maxLength, large, wrap, onSaved, className = '',
}: {
  value: string | null; field: EditableField; planId: string;
  placeholder: string; maxLength?: number; onSaved?: () => void; large?: boolean; wrap?: boolean; className?: string;
}) {
  const [editing, setEditing] = useState(false);
  const [text, setText] = useState(value || '');
  const localOverride = useRef<string | typeof NOT_SET>(NOT_SET);
  const [, forceRender] = useState(0);
  const [saving, setSaving] = useState(false);
  const [hovered, setHovered] = useState(false);
  const [error, setError] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (editing && inputRef.current) {
      inputRef.current.focus();
      inputRef.current.select();
    }
  }, [editing]);

  const hasLocal = localOverride.current !== NOT_SET;
  const displayValue = hasLocal ? (localOverride.current as string) : (value || '');

  useEffect(() => {
    if (!editing && !saving && !hasLocal) setText(value || '');
  }, [value, editing, saving, hasLocal]);

  useEffect(() => {
    if (hasLocal && value === localOverride.current) localOverride.current = NOT_SET;
  }, [value, hasLocal]);

  const save = useCallback(async (val: string) => {
    setSaving(true);
    setError(false);
    const trimmed = val.trim();
    localOverride.current = trimmed;
    forceRender((n) => n + 1);
    try {
      const res = await fetch(`/api/plans-vol/${planId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'update_strip', [field]: trimmed || '' }),
      });
      if (res.ok) onSaved?.();
      else setError(true);
    } catch {
      setError(true);
    }
    setSaving(false);
    setEditing(false);
  }, [planId, field, onSaved]);

  if (editing) {
    return (
      <input
        ref={inputRef}
        className={`bg-white text-slate-900 border border-sky-500 rounded-sm outline-none w-full font-mono font-bold ${large ? 'text-[15px] px-1 py-0.5' : 'text-[13px] px-1 py-0.5'}`}
        value={text}
        maxLength={maxLength || 20}
        onChange={(e) => setText(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') { e.preventDefault(); save(text); }
          if (e.key === 'Escape') { setEditing(false); setText(displayValue); }
        }}
        onBlur={() => save(text)}
        onClick={(e) => e.stopPropagation()}
        disabled={saving}
      />
    );
  }

  return (
    <div
      data-no-drag="true"
      className={`relative cursor-text min-h-[20px] flex ${wrap ? 'items-start' : 'items-center'} rounded-sm px-0.5 transition-colors ${hovered ? 'bg-sky-400/20 ring-1 ring-sky-400/70' : ''} ${error ? 'ring-1 ring-red-400 bg-red-50/30' : ''} ${className}`}
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
      <span
        title={displayValue || undefined}
        className={`font-mono leading-tight ${wrap ? 'whitespace-normal break-words' : 'truncate'} ${large ? 'text-[15px] font-black' : 'text-[13px] font-semibold'} ${!displayValue ? 'opacity-40' : ''}`}
      >
        {displayValue || placeholder}
      </span>
      {error && <span className="text-[8px] text-red-500 ml-0.5">!</span>}
      {hovered && displayValue && !error && (
        <button
          type="button"
          onClick={(e) => { e.stopPropagation(); setText(''); save(''); }}
          className="absolute -top-1 -right-1 p-0.5 bg-red-500 text-white rounded-full hover:bg-red-600 z-10 shadow"
          title="Effacer"
        >
          <Trash2 className="h-2.5 w-2.5" />
        </button>
      )}
    </div>
  );
}

function FlUnitToggle({ planId, unit, onSaved }: { planId: string; unit: string | null; onSaved?: () => void }) {
  const [current, setCurrent] = useState(unit || 'FL');
  const prevRef = useRef(current);
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
    <button type="button" onClick={toggle} className="text-[9px] font-black tracking-wide rounded px-1 py-0.5 leading-none bg-black/15 hover:bg-black/25" title="Basculer FL/ft">
      {current}
    </button>
  );
}

function Cell({ children, className = '' }: { children: React.ReactNode; className?: string }) {
  return <div className={`px-1.5 py-1 min-w-0 ${className}`}>{children}</div>;
}

function Label({ children, className = '' }: { children: React.ReactNode; className?: string }) {
  return <div className={`text-[8px] font-bold uppercase tracking-[0.14em] leading-none mb-0.5 ${className}`}>{children}</div>;
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
      className={`rounded-lg shadow-2xl border p-3 ${dark ? 'bg-slate-900 border-sky-500 text-slate-100' : 'bg-white border-sky-400 text-slate-900'}`}
    >
      <div className={`text-[10px] font-bold uppercase tracking-wider mb-1 ${dark ? 'text-sky-400' : 'text-sky-600'}`}>{title}</div>
      <div className="text-sm font-medium leading-relaxed break-words whitespace-pre-wrap">{children}</div>
    </div>,
    document.body,
  );
}

function StripActionBar({
  strip, onRefresh, onTransferRequest, onOptimisticStatut, isDark,
}: {
  strip: StripData;
  onRefresh?: () => void;
  onTransferRequest?: (stripId: string, event?: React.MouseEvent) => void;
  onOptimisticStatut?: (s: string) => void;
  isDark: boolean;
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
  const btn = 'inline-flex items-center gap-1 px-2 py-1 text-[11px] font-bold rounded-md disabled:opacity-50 shadow-sm';

  const resetIncident = () => { setIncidentDescription(''); setIncidentPhoto(null); };

  const submitIncident = async (actionType: 'crash' | 'atterrissage_urgence') => {
    if (busyRef.current) return;
    busyRef.current = true;
    setLoading(actionType);
    const optimistic = OPTIMISTIC_STATUT[actionType];
    if (optimistic) onOptimisticStatut?.(optimistic);
    try {
      const res = await fetch(`/api/plans-vol/${strip.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: actionType, description: incidentDescription.trim() || undefined }),
      });
      const d = await res.json().catch(() => ({}));
      if (!res.ok) {
        if (optimistic) onOptimisticStatut?.(strip.statut);
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

  if (showRefuse) {
    return (
      <div className={`px-2 py-2 border-t space-y-1 ${isDark ? 'bg-red-950 border-red-800' : 'bg-red-50 border-red-200'}`} onClick={(e) => e.stopPropagation()}>
        <textarea autoFocus value={refuseReason} onChange={(e) => setRefuseReason(e.target.value)} placeholder="Raison du refus…" className={`w-full text-sm border rounded px-2 py-1 min-h-[36px] resize-none font-semibold ${isDark ? 'bg-slate-900 text-slate-100 border-red-700 placeholder:text-slate-500' : 'bg-white text-slate-800 border-red-300'}`} />
        <div className="flex gap-1.5">
          <button type="button" onClick={async () => { if (!refuseReason.trim()) { toast.error('Raison obligatoire'); return; } await callAction('refuser', { refusal_reason: refuseReason.trim() }); setShowRefuse(false); setRefuseReason(''); }} disabled={loading === 'refuser'} className="px-2 py-1 text-xs font-bold bg-red-600 text-white rounded hover:bg-red-700 disabled:opacity-50">{loading === 'refuser' ? '…' : 'Confirmer refus'}</button>
          <button type="button" onClick={() => { setShowRefuse(false); setRefuseReason(''); }} className={`px-2 py-1 text-xs font-semibold ${isDark ? 'text-slate-300' : 'text-slate-600'}`}>Annuler</button>
        </div>
      </div>
    );
  }

  if (showCancelConfirm) {
    return (
      <div className={`px-2 py-2 border-t space-y-2 ${isDark ? 'bg-orange-950 border-orange-800' : 'bg-orange-50 border-orange-200'}`} onClick={(e) => e.stopPropagation()}>
        <p className={`text-sm font-bold ${isDark ? 'text-orange-200' : 'text-orange-900'}`}>Annuler {strip.numero_vol} ? Le plan sera définitivement supprimé.</p>
        <div className="flex gap-1.5">
          <button type="button" onClick={async () => { await callAction('annuler'); setShowCancelConfirm(false); }} disabled={loading === 'annuler'} className="flex-1 px-2 py-1.5 text-xs font-bold bg-red-600 text-white rounded hover:bg-red-700 disabled:opacity-50">{loading === 'annuler' ? '…' : 'Confirmer l\'annulation'}</button>
          <button type="button" onClick={() => setShowCancelConfirm(false)} className={`px-3 py-1.5 text-xs font-bold rounded ${isDark ? 'bg-slate-700 text-slate-200' : 'bg-slate-200 text-slate-700'}`}>Retour</button>
        </div>
      </div>
    );
  }

  if (showCrashConfirm || showUrgenceConfirm) {
    const crash = showCrashConfirm;
    return (
      <div className={`px-2 py-2 border-t space-y-2 ${crash ? (isDark ? 'bg-red-950 border-red-800' : 'bg-red-50 border-red-300') : (isDark ? 'bg-amber-950 border-amber-800' : 'bg-amber-50 border-amber-300')}`} onClick={(e) => e.stopPropagation()}>
        <p className={`text-sm font-bold ${crash ? (isDark ? 'text-red-200' : 'text-red-900') : (isDark ? 'text-amber-200' : 'text-amber-900')}`}>
          {crash ? `Signaler un CRASH pour ${strip.numero_vol} ?` : `Atterrissage d'urgence pour ${strip.numero_vol} ?`}
        </p>
        <p className={`text-xs ${isDark ? 'text-slate-400' : 'text-slate-600'}`}>L&apos;avion sera bloqué en attente d&apos;examen staff.</p>
        <textarea value={incidentDescription} onChange={(e) => setIncidentDescription(e.target.value)} placeholder="Description (optionnel)…" rows={2} className={`w-full text-xs border rounded px-2 py-1 resize-none ${isDark ? 'bg-slate-900 text-slate-100 border-slate-600' : 'bg-white text-slate-800 border-slate-300'}`} />
        <label className={`flex items-center gap-2 text-xs cursor-pointer ${isDark ? 'text-slate-300' : 'text-slate-600'}`}>
          <span className={`shrink-0 px-2 py-0.5 rounded border text-[10px] font-semibold ${isDark ? 'border-slate-600 bg-slate-800' : 'border-slate-300 bg-white'}`}>📷 {incidentPhoto ? incidentPhoto.name.slice(0, 20) : 'Photo'}</span>
          <input type="file" accept="image/*" className="hidden" onChange={(e) => setIncidentPhoto(e.target.files?.[0] ?? null)} />
        </label>
        <div className="flex gap-1.5">
          <button
            type="button"
            onClick={async () => {
              await submitIncident(crash ? 'crash' : 'atterrissage_urgence');
              setShowCrashConfirm(false);
              setShowUrgenceConfirm(false);
              resetIncident();
            }}
            disabled={loading !== null || uploadingPhoto}
            className={`flex-1 px-2 py-1.5 text-xs font-bold text-white rounded disabled:opacity-50 ${crash ? 'bg-red-700 hover:bg-red-800' : 'bg-amber-600 hover:bg-amber-700'}`}
          >
            {uploadingPhoto ? 'Upload…' : loading ? '…' : crash ? 'Confirmer CRASH' : 'Confirmer urgence'}
          </button>
          <button type="button" onClick={() => { setShowCrashConfirm(false); setShowUrgenceConfirm(false); resetIncident(); }} className={`px-3 py-1.5 text-xs font-bold rounded ${isDark ? 'bg-slate-700 text-slate-200' : 'bg-slate-200 text-slate-700'}`}>Retour</button>
        </div>
      </div>
    );
  }

  const hasActions = statut === 'en_attente' || statut === 'depose' || statut === 'en_attente_cloture' || statut === 'en_cours' || statut === 'accepte';
  if (!hasActions) return null;

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

  return (
    <div data-no-drag="true" className={`px-1.5 py-1 border-t flex items-center gap-1 flex-wrap ${isDark ? 'border-white/10 bg-black/25' : 'border-black/10 bg-black/[0.04]'}`} onClick={(e) => e.stopPropagation()}>
      {strip.isManual ? (
        <span className={`text-[11px] mr-auto flex items-center gap-1 font-bold min-w-0 ${isDark ? 'text-slate-300' : 'text-slate-600'}`}>
          <Plane className="h-3 w-3 shrink-0" />
          <InlineEdit value={strip.strip_pilote_text} field="strip_pilote_text" planId={strip.id} placeholder="Pilote…" maxLength={30} />
        </span>
      ) : strip.pilote_identifiant ? (
        <span className={`text-[11px] mr-auto flex items-center gap-1 font-bold truncate ${isDark ? 'text-slate-300' : 'text-slate-700'}`}>
          <Plane className="h-3 w-3 shrink-0" />{strip.pilote_identifiant}
        </span>
      ) : <span className="mr-auto" />}

      {(statut === 'en_attente' || statut === 'depose') && (
        <>
          <button type="button" onClick={() => callAction('accepter')} disabled={loading !== null} className={`${btn} bg-emerald-600 text-white hover:bg-emerald-700`}><CheckCircle className="h-3.5 w-3.5" />{loading === 'accepter' ? '…' : 'Accepter'}</button>
          <button type="button" onClick={() => setShowRefuse(true)} disabled={loading !== null} className={`${btn} bg-red-600 text-white hover:bg-red-700`}><XCircle className="h-3.5 w-3.5" />Refuser</button>
        </>
      )}
      {statut === 'en_attente_cloture' && (
        <button type="button" onClick={() => callAction('confirmer_cloture')} disabled={loading !== null} className={`${btn} bg-emerald-600 text-white hover:bg-emerald-700 animate-pulse`}><CheckCircle className="h-3.5 w-3.5" />{loading === 'confirmer_cloture' ? '…' : 'Confirmer clôture'}</button>
      )}
      {(statut === 'en_cours' || statut === 'accepte') && !isAutomonitoring && (
        <button type="button" onClick={() => callAction('transferer', { automonitoring: true })} disabled={loading !== null} className={`${btn} bg-violet-600 text-white hover:bg-violet-700`}><Radio className="h-3.5 w-3.5" />{loading === 'transferer' ? '…' : 'Autosurv.'}</button>
      )}
      {strip.current_holder_user_id && onTransferRequest && (
        <button type="button" onClick={(e) => onTransferRequest(strip.id, e)} disabled={loading !== null} className={`${btn} bg-sky-600 text-white hover:bg-sky-700`}><ArrowRightLeft className="h-3.5 w-3.5" />Transférer</button>
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

      <div className="relative">
        <button
          type="button"
          onClick={() => setShowMore((v) => !v)}
          className={`${btn} ${isDark ? 'bg-slate-800 text-slate-200 hover:bg-slate-700' : 'bg-white/80 text-slate-700 hover:bg-white'}`}
          title="Plus d'actions"
        >
          <MoreHorizontal className="h-3.5 w-3.5" />
        </button>
        {showMore && (
          <div className={`absolute right-0 bottom-full mb-1 z-20 min-w-[160px] rounded-lg border shadow-xl py-1 ${isDark ? 'bg-slate-900 border-slate-700' : 'bg-white border-slate-200'}`}>
            {strip.bria_conversation && strip.bria_conversation.length > 0 && (
              <button type="button" onClick={() => { setShowBriaLog(true); setShowMore(false); }} className={`w-full text-left px-3 py-1.5 text-xs font-semibold flex items-center gap-2 ${isDark ? 'hover:bg-slate-800 text-amber-200' : 'hover:bg-slate-50 text-amber-800'}`}>
                <Radio className="h-3.5 w-3.5" /> Historique BRIA
              </button>
            )}
            {(statut === 'en_cours' || statut === 'accepte' || statut === 'en_attente_cloture') && (
              <>
                <button type="button" onClick={() => { setShowCrashConfirm(true); setShowMore(false); }} className={`w-full text-left px-3 py-1.5 text-xs font-semibold flex items-center gap-2 ${isDark ? 'hover:bg-slate-800 text-red-300' : 'hover:bg-red-50 text-red-700'}`}>
                  <Flame className="h-3.5 w-3.5" /> CRASH
                </button>
                <button type="button" onClick={() => { setShowUrgenceConfirm(true); setShowMore(false); }} className={`w-full text-left px-3 py-1.5 text-xs font-semibold flex items-center gap-2 ${isDark ? 'hover:bg-slate-800 text-amber-300' : 'hover:bg-amber-50 text-amber-800'}`}>
                  <PlaneLanding className="h-3.5 w-3.5" /> Urgence
                </button>
              </>
            )}
            <button type="button" onClick={() => { setShowCancelConfirm(true); setShowMore(false); }} className={`w-full text-left px-3 py-1.5 text-xs font-semibold flex items-center gap-2 ${isDark ? 'hover:bg-slate-800 text-orange-300' : 'hover:bg-orange-50 text-orange-800'}`}>
              <XCircle className="h-3.5 w-3.5" /> Annuler le vol
            </button>
          </div>
        )}
      </div>

      {showBriaLog && createPortal(
        <div className="fixed inset-0 z-[2147483647] flex items-center justify-center bg-black/60" onClick={() => setShowBriaLog(false)}>
          <div className={`rounded-xl shadow-2xl border p-5 w-[480px] max-w-[90vw] max-h-[70vh] overflow-y-auto ${isDark ? 'bg-slate-900 border-amber-700 text-slate-100' : 'bg-white border-amber-400 text-slate-900'}`} onClick={(e) => e.stopPropagation()}>
            <div className={`text-xs font-bold uppercase tracking-wider mb-3 flex items-center gap-2 ${isDark ? 'text-amber-400' : 'text-amber-600'}`}>
              <Radio className="h-4 w-4" /> Historique BRIA
            </div>
            <div className="space-y-2">
              {(strip.bria_conversation || []).map((msg, i) => (
                <div key={i} className={`flex ${msg.role === 'bria' ? 'justify-start' : 'justify-end'}`}>
                  <div className={`max-w-[85%] rounded-lg px-3 py-2 text-xs whitespace-pre-line ${
                    msg.role === 'bria'
                      ? (isDark ? 'bg-amber-900/50 border border-amber-700/40 text-amber-100' : 'bg-amber-50 border border-amber-200 text-amber-900')
                      : (isDark ? 'bg-sky-900/50 border border-sky-700/40 text-sky-100' : 'bg-sky-50 border border-sky-200 text-sky-900')
                  }`}>
                    <span className={`text-xs font-bold block mb-0.5 ${msg.role === 'bria' ? (isDark ? 'text-amber-400' : 'text-amber-600') : (isDark ? 'text-sky-400' : 'text-sky-600')}`}>{msg.role === 'bria' ? 'BRIA' : 'Pilote'}</span>
                    {msg.text}
                  </div>
                </div>
              ))}
            </div>
            <button type="button" onClick={() => setShowBriaLog(false)} className={`mt-4 w-full py-2 text-xs font-bold rounded-lg ${isDark ? 'bg-slate-700 text-slate-200 hover:bg-slate-600' : 'bg-slate-200 text-slate-700 hover:bg-slate-300'}`}>Fermer</button>
          </div>
        </div>,
        document.body,
      )}
    </div>
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
  const squawkMismatch = strip.squawk_attendu && strip.code_transpondeur && strip.code_transpondeur !== strip.squawk_attendu;
  const noSquawk = strip.squawk_attendu && !strip.code_transpondeur;

  const pal = (() => {
    if (isEmergency) {
      const hijack = sqColor === 'hijack';
      const radio = sqColor === 'radio';
      return isDark
        ? { border: hijack || !radio ? 'border-red-500' : 'border-amber-500', left: radio ? 'bg-amber-950' : 'bg-red-950', right: radio ? 'bg-amber-900' : 'bg-red-900', top: radio ? 'bg-amber-900' : 'bg-red-900', sep: radio ? 'border-amber-800' : 'border-red-800', txt: 'text-slate-100', lbl: 'text-red-200/70', tab: radio ? 'bg-amber-500' : 'bg-red-600' }
        : { border: hijack || !radio ? 'border-red-700' : 'border-amber-600', left: radio ? 'bg-amber-100' : 'bg-red-100', right: radio ? 'bg-amber-200' : 'bg-red-200', top: radio ? 'bg-amber-200' : 'bg-red-200', sep: radio ? 'border-amber-300' : 'border-red-300', txt: 'text-slate-900', lbl: 'text-red-800/70', tab: radio ? 'bg-amber-500' : 'bg-red-600' };
    }
    if (isDupe) {
      return isDark
        ? { border: 'border-red-500', left: 'bg-slate-800', right: 'bg-slate-700', top: 'bg-slate-700', sep: 'border-slate-500', txt: 'text-slate-500', lbl: 'text-slate-500', tab: 'bg-red-700' }
        : { border: 'border-red-600', left: 'bg-slate-200', right: 'bg-slate-300', top: 'bg-slate-300', sep: 'border-slate-400', txt: 'text-slate-400', lbl: 'text-slate-400', tab: 'bg-red-600' };
    }
    if (isClotureRequested) {
      return isDark
        ? { border: 'border-red-500', left: 'bg-red-950', right: 'bg-red-900', top: 'bg-red-900', sep: 'border-red-800', txt: 'text-slate-100', lbl: 'text-red-200/70', tab: 'bg-red-600' }
        : { border: 'border-red-500', left: 'bg-red-50', right: 'bg-red-100', top: 'bg-red-100', sep: 'border-red-300', txt: 'text-slate-900', lbl: 'text-red-800/70', tab: 'bg-red-600' };
    }
    if (isManual) {
      return isDark
        ? { border: 'border-indigo-500/70', left: 'bg-indigo-950', right: 'bg-indigo-900', top: 'bg-indigo-900', sep: 'border-indigo-800', txt: 'text-slate-100', lbl: 'text-indigo-200/70', tab: 'bg-indigo-500' }
        : { border: 'border-[#6d7eab]', left: 'bg-[#d8e0f0]', right: 'bg-[#ece4f7]', top: 'bg-[#c9d3e8]', sep: 'border-[#8b9bc4]', txt: 'text-slate-900', lbl: 'text-slate-600', tab: 'bg-indigo-500' };
    }
    return isDark
      ? { border: 'border-emerald-700/80', left: 'bg-[#0d2418]', right: 'bg-[#2a2410]', top: 'bg-[#12301f]', sep: 'border-emerald-800/80', txt: 'text-slate-100', lbl: 'text-emerald-200/60', tab: statut === 'en_cours' ? 'bg-sky-500' : statut === 'accepte' ? 'bg-emerald-500' : 'bg-amber-500' }
      : { border: 'border-[#6f9a6f]', left: 'bg-[#d7ecd7]', right: 'bg-[#f3ecc4]', top: 'bg-[#c5dcc5]', sep: 'border-[#8fbc8f]', txt: 'text-slate-900', lbl: 'text-slate-600', tab: statut === 'en_cours' ? 'bg-sky-600' : statut === 'accepte' ? 'bg-emerald-600' : 'bg-amber-500' };
  })();

  const statutColor =
    statut === 'en_cours' ? (isDark ? 'text-sky-300' : 'text-sky-800') :
    statut === 'en_attente_cloture' ? (isDark ? 'text-orange-300' : 'text-orange-800') :
    statut === 'accepte' ? (isDark ? 'text-emerald-300' : 'text-emerald-800') :
    (statut === 'depose' || statut === 'en_attente') ? (isDark ? 'text-amber-300' : 'text-amber-800') :
    statut === 'automonitoring' ? (isDark ? 'text-violet-300' : 'text-violet-800') : pal.txt;

  return (
    <div
      className={`w-full min-w-[460px] overflow-hidden border ${pal.border} rounded-md shadow-sm select-none ${isClotureRequested && !isDupe ? 'atc-strip-closure' : ''} ${isDupe && !isEmergency ? 'atc-strip-dupe' : ''}`}
      onContextMenu={(e) => { e.preventDefault(); onContextMenu?.(e, strip.id); }}
    >
      {sqLabel && (
        <div className={`text-center text-[11px] font-black tracking-[0.32em] py-0.5 animate-pulse ${isDark ? 'bg-red-600 text-white' : 'bg-black text-white'}`}>{sqLabel}</div>
      )}
      {isDupe && !isEmergency && (
        <div className="atc-strip-dupe-banner text-center text-[11px] font-black tracking-[0.28em] py-0.5 bg-red-700 text-white">
          DUPE SQUAWK — MODE C
        </div>
      )}
      {isClotureRequested && !isDupe && (
        <div className="text-center text-[11px] font-bold py-0.5 bg-red-600 text-white animate-pulse">
          DEMANDE DE CLÔTURE
        </div>
      )}
      {(squawkMismatch || noSquawk) && !sqLabel && !isDupe && (
        <div className={`text-center text-[10px] font-bold py-0.5 ${isDark ? 'bg-amber-500 text-black' : 'bg-amber-400 text-black'}`}>
          {noSquawk ? 'PAS DE TRANSPONDEUR' : `SQUAWK INCORRECT (attendu : ${strip.squawk_attendu})`}
        </div>
      )}
      {strip.pending_transfer_aeroport && (
        <div className="text-center text-[10px] font-black tracking-widest py-0.5 bg-amber-600 text-black">
          OUTBOUND → {strip.pending_transfer_position || 'ATC'} {strip.pending_transfer_aeroport}
        </div>
      )}
      {(strip.siavi_avion_id || /medevac/i.test(strip.type_vol || '')) && (
        <div className="text-center text-[10px] font-black tracking-[0.28em] py-0.5 bg-red-700 text-white">
          MEDEVAC
        </div>
      )}

      <div className="flex">
        <div
          data-drag-handle="true"
          title="Glisser le strip"
          className={`w-6 shrink-0 flex items-center justify-center cursor-grab active:cursor-grabbing ${pal.tab}`}
        >
          <span className="text-[9px] font-black tracking-widest text-white pointer-events-none" style={{ writingMode: 'vertical-rl', transform: 'rotate(180deg)' }}>
            {isManual ? 'MAN' : (strip.type_vol || 'IFR')}
          </span>
        </div>
        <div
          data-drag-handle="true"
          title="Glisser le strip"
          className={`w-6 flex items-center justify-center cursor-grab active:cursor-grabbing ${pal.top} border-r ${pal.sep} shrink-0`}
        >
          <GripVertical className={`h-4 w-4 pointer-events-none ${isDark ? 'text-white/55' : 'text-black/40'}`} />
        </div>

        <div className="flex-1 min-w-0 flex">
          <div className="min-w-[260px] flex-1">
            <div className={`grid grid-cols-[64px_92px_44px_minmax(0,1fr)] ${pal.top} border-b ${pal.sep}`}>
              <Cell className={`border-r ${pal.sep}`}>
                <Label className={pal.lbl}>ATD</Label>
                <InlineEdit value={strip.strip_atd} field="strip_atd" planId={strip.id} placeholder="—" onSaved={onRefresh} maxLength={5} large />
              </Cell>
              <Cell className={`border-r ${pal.sep}`}>
                <Label className={pal.lbl}>TYPE / W</Label>
                {isManual ? (
                  <InlineEdit value={strip.strip_type_wake} field="strip_type_wake" planId={strip.id} placeholder="—" onSaved={onRefresh} maxLength={10} large />
                ) : (
                  <span className={`text-[15px] font-mono font-black ${pal.txt}`}>{strip.type_wake}</span>
                )}
                {!isManual && (
                  <span className={`text-[9px] font-black font-mono tracking-widest leading-none mt-0.5 block ${modeTranspondeur === 'S' ? (isDark ? 'text-sky-400/80' : 'text-sky-700') : pal.lbl}`}>
                    {modeTranspondeur === 'S' ? '/S' : modeTranspondeur === 'A' ? '/A' : '/C'}
                  </span>
                )}
              </Cell>
              <Cell className={`border-r ${pal.sep} text-center`}>
                {isManual ? (
                  <>
                    <Label className={pal.lbl}>TYPE</Label>
                    <InlineEdit value={strip.type_vol} field="type_vol" planId={strip.id} placeholder="VFR" onSaved={onRefresh} maxLength={3} />
                  </>
                ) : (
                  <>
                    <Label className={pal.lbl}>{strip.type_vol}</Label>
                    <span className={`text-sm font-mono font-black ${pal.txt}`}>1</span>
                  </>
                )}
              </Cell>
              <Cell>
                <Label className={pal.lbl}>NOTE</Label>
                <InlineEdit value={strip.strip_note_1} field="strip_note_1" planId={strip.id} placeholder="—" onSaved={onRefresh} maxLength={20} />
              </Cell>
            </div>

            <div className={`grid grid-cols-[64px_minmax(0,1fr)_88px] ${pal.left} border-b ${pal.sep}`}>
              <Cell className={`border-r ${pal.sep}`}>
                <Label className={pal.lbl}>ADES</Label>
                {isManual ? (
                  <InlineEdit value={strip.aeroport_arrivee} field="aeroport_arrivee" planId={strip.id} placeholder="????" onSaved={onRefresh} maxLength={4} large />
                ) : (
                  <span className={`text-lg font-mono font-black ${pal.txt} leading-tight`}>{strip.aeroport_arrivee}</span>
                )}
              </Cell>
              <Cell className={`border-r ${pal.sep}`}>
                <Label className={pal.lbl}>CALLSIGN</Label>
                {isManual ? (
                  <InlineEdit value={strip.numero_vol} field="numero_vol" planId={strip.id} placeholder="????" onSaved={onRefresh} maxLength={10} large />
                ) : (
                  <div className="flex flex-col min-w-0">
                    <span className={`text-xl font-mono font-black tracking-wide ${pal.txt} leading-none truncate`}>{strip.numero_vol}</span>
                    {strip.callsign_telephonie && (
                      <span className={`text-[10px] font-semibold ${pal.lbl} leading-tight mt-0.5 tracking-wider truncate`}>{strip.callsign_telephonie}</span>
                    )}
                  </div>
                )}
              </Cell>
              <Cell>
                <Label className={pal.lbl}>ADEP</Label>
                {isManual ? (
                  <InlineEdit value={strip.aeroport_depart} field="aeroport_depart" planId={strip.id} placeholder="????" onSaved={onRefresh} maxLength={4} large />
                ) : (
                  <span className={`text-base font-mono font-black ${pal.txt}`}>{strip.aeroport_depart}</span>
                )}
              </Cell>
            </div>

            <div className={`grid grid-cols-[64px_92px_minmax(0,1fr)] ${pal.left}`}>
              <Cell className={`border-r ${pal.sep}`}>
                <Label className={pal.lbl}>RWY</Label>
                <InlineEdit value={strip.strip_rwy} field="strip_rwy" planId={strip.id} placeholder="—" onSaved={onRefresh} maxLength={5} large />
              </Cell>
              <Cell className={`border-r ${pal.sep}`}>
                <Label className={pal.lbl}>CTOT</Label>
                <span className={`text-[15px] font-mono font-black tabular-nums ${pal.txt}`}>{formatCtot(strip.heure_depart_estimee || strip.created_at)}</span>
              </Cell>
              <Cell>
                <Label className={pal.lbl}>TAIL</Label>
                <span className={`text-[13px] font-mono font-bold ${pal.txt} truncate`}>{strip.immatriculation || '—'}</span>
              </Cell>
            </div>
          </div>

          <div className="w-[3px] bg-red-500 shrink-0" />

          <div className={`min-w-[188px] flex-1 ${pal.right}`}>
            <div className={`grid grid-cols-[72px_72px_minmax(0,1fr)] border-b ${pal.sep}`}>
              <Cell className={`border-r ${pal.sep}`}>
                <div className="flex items-center justify-between mb-0.5 gap-1">
                  <Label className={`${pal.lbl} mb-0`}>SQWK</Label>
                  <span className={`text-[8px] font-black px-1 rounded leading-none ${
                    modeTranspondeur === 'S'
                      ? (isDark ? 'bg-sky-700 text-sky-100' : 'bg-sky-200 text-sky-800')
                      : isDupe ? 'bg-red-700 text-white' : (isDark ? 'bg-slate-700 text-slate-300' : 'bg-slate-200 text-slate-700')
                  }`}>{modeTranspondeur}</span>
                </div>
                <span className={`text-[15px] font-mono font-black tabular-nums ${isDupe ? (isDark ? 'text-slate-600' : 'text-slate-400') : pal.txt}`}>
                  {strip.code_transpondeur || '—'}
                </span>
              </Cell>
              <Cell className={`border-r ${pal.sep}`}>
                <Label className={pal.lbl}>CLR</Label>
                <InlineEdit value={strip.strip_note_2} field="strip_note_2" planId={strip.id} placeholder="—" onSaved={onRefresh} maxLength={20} />
              </Cell>
              <Cell className="min-w-0">
                <Label className={pal.lbl}>INFO</Label>
                <InlineEdit value={strip.strip_note_3} field="strip_note_3" planId={strip.id} placeholder="—" onSaved={onRefresh} maxLength={30} />
              </Cell>
            </div>
            <div className={`grid grid-cols-2 border-b ${pal.sep}`}>
              <Cell className={`min-w-0 border-r ${pal.sep}`}>
                <Label className={pal.lbl}>SID</Label>
                <InlineEdit value={strip.strip_sid_atc || strip.sid_depart} field="strip_sid_atc" planId={strip.id} placeholder="—" onSaved={onRefresh} maxLength={24} wrap />
              </Cell>
              <Cell className="min-w-0">
                <Label className={pal.lbl}>STAR</Label>
                <InlineEdit value={strip.strip_star || strip.star_arrivee} field="strip_star" planId={strip.id} placeholder="—" onSaved={onRefresh} maxLength={24} wrap />
              </Cell>
            </div>
            <div className={`border-b ${pal.sep}`}>
              <Cell>
                <Label className={pal.lbl}>ROUTE</Label>
                <InlineEdit value={strip.strip_route || strip.route_ifr} field="strip_route" planId={strip.id} placeholder="—" onSaved={onRefresh} maxLength={80} wrap />
              </Cell>
            </div>
            <div className="grid grid-cols-[88px_minmax(0,1fr)]">
              <Cell className={`border-r ${pal.sep}`}>
                <div className="flex items-center gap-1 mb-0.5">
                  <FlUnitToggle planId={strip.id} unit={strip.strip_fl_unit} onSaved={onRefresh} />
                  <Label className={`${pal.lbl} mb-0`}>ALT</Label>
                </div>
                <InlineEdit value={strip.strip_fl} field="strip_fl" planId={strip.id} placeholder="—" onSaved={onRefresh} maxLength={5} large />
              </Cell>
              <Cell className="min-w-0">
                <Label className={pal.lbl}>STATUT</Label>
                <span className={`text-[12px] font-black uppercase tracking-wide ${statutColor}`}>{statutLabel(statut)}</span>
              </Cell>
            </div>
          </div>
        </div>
      </div>

      <StripActionBar
        strip={{ ...strip, statut }}
        onRefresh={onRefresh}
        onTransferRequest={onTransferRequest}
        onOptimisticStatut={setOptimisticStatut}
        isDark={isDark}
      />
    </div>
  );
}

const FlightStrip = memo(FlightStripImpl);
export default FlightStrip;
