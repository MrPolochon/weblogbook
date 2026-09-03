'use client';

import { useState, useRef, useCallback, useEffect, useMemo } from 'react';
import FlightStrip, { STRIP_MIN_WIDTH, type StripData } from './FlightStrip';
import { useAtcTheme } from '@/contexts/AtcThemeContext';
import { AEROPORTS_PTFS } from '@/lib/aeroports-ptfs';
import { AIRPORT_TO_FIR } from '@/lib/cartography-data';
import type { OnlineSession } from './FlightStripBoardWrapper';
import { toast } from 'sonner';
import { TRANSFER_HIERARCHY, ZONE_HINTS, ZONE_LABELS, getVisibleZones, isRecommendedZone, type StripZoneId } from '@/lib/atc-ui';
import { Search, ArrowRightLeft, Radio, X } from 'lucide-react';

type ZoneId = StripZoneId;
type ZoneOrNull = ZoneId | null;

const ZONE_COLORS_LIGHT: Record<ZoneId, string> = {
  sol: 'border-amber-400/80 bg-amber-50/50',
  depart: 'border-sky-400/80 bg-sky-50/50',
  arrivee: 'border-emerald-400/80 bg-emerald-50/50',
  transit: 'border-violet-400/80 bg-violet-50/50',
};
const ZONE_COLORS_DARK: Record<ZoneId, string> = {
  sol: 'border-amber-700/70 bg-amber-950/25',
  depart: 'border-sky-700/70 bg-sky-950/25',
  arrivee: 'border-emerald-700/70 bg-emerald-950/25',
  transit: 'border-violet-700/70 bg-violet-950/25',
};
const ZONE_HEADER_LIGHT: Record<ZoneId, string> = {
  sol: 'bg-amber-300/90 text-amber-950',
  depart: 'bg-sky-300/90 text-sky-950',
  arrivee: 'bg-emerald-300/90 text-emerald-950',
  transit: 'bg-violet-300/90 text-violet-950',
};
const ZONE_HEADER_DARK: Record<ZoneId, string> = {
  sol: 'bg-amber-900 text-amber-100',
  depart: 'bg-sky-900 text-sky-100',
  arrivee: 'bg-emerald-900 text-emerald-100',
  transit: 'bg-violet-900 text-violet-100',
};
const ZONE_DROP_LIGHT: Record<ZoneId, string> = {
  sol: 'ring-2 ring-amber-400 bg-amber-100/80',
  depart: 'ring-2 ring-sky-400 bg-sky-100/80',
  arrivee: 'ring-2 ring-emerald-400 bg-emerald-100/80',
  transit: 'ring-2 ring-violet-400 bg-violet-100/80',
};
const ZONE_DROP_DARK: Record<ZoneId, string> = {
  sol: 'ring-2 ring-amber-400 bg-amber-900/50',
  depart: 'ring-2 ring-sky-400 bg-sky-900/50',
  arrivee: 'ring-2 ring-emerald-400 bg-emerald-900/50',
  transit: 'ring-2 ring-violet-400 bg-violet-900/50',
};
const ZONE_DOT: Record<ZoneId, string> = {
  sol: 'bg-amber-400',
  depart: 'bg-sky-400',
  arrivee: 'bg-emerald-400',
  transit: 'bg-violet-400',
};

/**
 * Largeur minimale d'une bay : celle du strip, plus le padding interne (2 × 6 px)
 * et les bordures (2 × 1 px). Sans cette marge, la dernière colonne du strip
 * était rognée.
 */
const BAY_MIN_WIDTH = STRIP_MIN_WIDTH + 14;

export default function FlightStripBoard({
  strips, atcPosition, atcAeroport, onlineSessions, onRefresh,
}: {
  strips: StripData[];
  atcPosition?: string;
  atcAeroport?: string;
  onlineSessions?: OnlineSession[];
  onRefresh?: () => void;
}) {
  const { theme } = useAtcTheme();
  const isDark = theme === 'dark';
  const [transferDialog, setTransferDialog] = useState<string | null>(null);
  const [query, setQuery] = useState('');

  const [localStrips, setLocalStrips] = useState<StripData[]>(strips);
  const [draggedId, setDraggedId] = useState<string | null>(null);
  const draggedIdRef = useRef<string | null>(null);
  const pendingMoves = useRef<Map<string, { zone: ZoneOrNull; order: number; at: number }>>(new Map());
  const dropTargetRef = useRef<{ zone: ZoneOrNull; stripId?: string; position?: 'before' | 'after' } | null>(null);

  const applyPending = useCallback((incoming: StripData[]) => {
    const now = Date.now();
    return incoming.map((s) => {
      const p = pendingMoves.current.get(s.id);
      if (!p) return s;
      if (now - p.at > 8_000) {
        pendingMoves.current.delete(s.id);
        return s;
      }
      if ((s.strip_zone ?? null) === p.zone && s.strip_order === p.order) {
        pendingMoves.current.delete(s.id);
        return s;
      }
      return { ...s, strip_zone: p.zone, strip_order: p.order };
    });
  }, []);

  const stripsSignature = useMemo(
    () => strips.map((s) =>
      `${s.id}:${s.strip_zone ?? 'null'}:${s.strip_order}:${s.statut}:${s.code_transpondeur ?? ''}:${s.mode_transpondeur ?? ''}`,
    ).join('|'),
    [strips],
  );
  useEffect(() => {
    setLocalStrips((prev) => {
      const next = applyPending(strips);
      if (draggedIdRef.current) {
        return next.map((s) => {
          if (s.id !== draggedIdRef.current) return s;
          const local = prev.find((l) => l.id === s.id);
          if (!local) return s;
          return { ...s, strip_zone: local.strip_zone, strip_order: local.strip_order };
        });
      }
      return next;
    });
  }, [stripsSignature, applyPending, strips]);

  type DropHint = { zone: ZoneOrNull; stripId?: string; position?: 'before' | 'after' };
  const [dropTarget, setDropTarget] = useState<DropHint | null>(null);
  const setDrop = useCallback((next: DropHint | null | ((prev: DropHint | null) => DropHint | null)) => {
    const value = typeof next === 'function' ? next(dropTargetRef.current) : next;
    const prev = dropTargetRef.current;
    if (
      prev?.zone === value?.zone &&
      prev?.stripId === value?.stripId &&
      prev?.position === value?.position
    ) return;
    dropTargetRef.current = value;
    setDropTarget(value);
  }, []);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return localStrips;
    return localStrips.filter((s) =>
      [s.numero_vol, s.aeroport_depart, s.aeroport_arrivee, s.immatriculation, s.pilote_identifiant, s.code_transpondeur]
        .filter(Boolean)
        .some((v) => String(v).toLowerCase().includes(q)),
    );
  }, [localStrips, query]);

  const visibleZones = useMemo(
    () => new Set<ZoneId>(getVisibleZones(atcPosition)),
    [atcPosition],
  );

  const getZone = useCallback((zone: ZoneOrNull) =>
    filtered.filter((s) => s.strip_zone === zone).sort((a, b) => a.strip_order - b.strip_order),
  [filtered]);

  const unassigned = useMemo(
    () =>
      filtered
        .filter((s) => !s.strip_zone || !visibleZones.has(s.strip_zone as ZoneId))
        .sort((a, b) => a.strip_order - b.strip_order),
    [filtered, visibleZones],
  );
  const solStrips = getZone('sol');
  const departStrips = getZone('depart');
  const arriveeStrips = getZone('arrivee');
  const transitStrips = getZone('transit');

  const lastRightClick = useRef<{ id: string; time: number } | null>(null);
  const handleStripRightClickWithDouble = useCallback((e: React.MouseEvent, stripId: string) => {
    e.preventDefault();
    const now = Date.now();
    if (lastRightClick.current && lastRightClick.current.id === stripId && now - lastRightClick.current.time < 400) {
      setTransferDialog(stripId);
      lastRightClick.current = null;
      return;
    }
    lastRightClick.current = { id: stripId, time: now };
  }, []);

  const handleDragStart = useCallback((e: React.DragEvent, stripId: string) => {
    const from = e.target as HTMLElement | null;
    if (from?.closest('button, input, select, textarea, a, [contenteditable="true"], [data-no-drag]')) {
      e.preventDefault();
      return;
    }
    draggedIdRef.current = stripId;
    setDraggedId(stripId);
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', stripId);
    if (e.dataTransfer.setDragImage && e.currentTarget instanceof HTMLElement) {
      e.dataTransfer.setDragImage(e.currentTarget, Math.min(80, e.currentTarget.offsetWidth / 4), 16);
    }
  }, []);

  const handleDragEnd = useCallback(() => {
    draggedIdRef.current = null;
    setDraggedId(null);
    setDrop(null);
  }, [setDrop]);

  const dropInZone = useCallback(async (stripId: string, zone: ZoneOrNull) => {
    const zoneStrips = localStrips.filter((s) => s.strip_zone === zone);
    const maxOrder = zoneStrips.reduce((max, s) => Math.max(max, s.strip_order), -1);
    const srcStrip = localStrips.find((s) => s.id === stripId);
    if (!srcStrip) return;
    if (zone && !isRecommendedZone(atcPosition, zone)) {
      toast.message(`Phase inhabituelle pour ${atcPosition ?? 'cette position'} — strip déplacé quand même.`);
    }
    const nextOrder = maxOrder + 1;
    pendingMoves.current.set(stripId, { zone, order: nextOrder, at: Date.now() });
    const prevStrips = localStrips;
    setLocalStrips((prev) =>
      prev.map((s) => s.id === stripId ? { ...s, strip_zone: zone, strip_order: nextOrder } : s),
    );
    try {
      const res = await fetch(`/api/plans-vol/${stripId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'update_strip', strip_zone: zone, strip_order: nextOrder }),
      });
      if (!res.ok) throw new Error('Erreur API');
    } catch {
      pendingMoves.current.delete(stripId);
      setLocalStrips(prevStrips);
      onRefresh?.();
    }
  }, [localStrips, onRefresh, atcPosition]);

  const dropNearStrip = useCallback(async (stripId: string, targetId: string, zone: ZoneOrNull, position: 'before' | 'after') => {
    if (stripId === targetId) return;
    const zoneStrips = localStrips.filter((s) => s.strip_zone === zone).sort((a, b) => a.strip_order - b.strip_order);
    const reordered = zoneStrips.filter((s) => s.id !== stripId);
    const srcStrip = localStrips.find((s) => s.id === stripId);
    if (!srcStrip) return;
    const targetIdx = reordered.findIndex((s) => s.id === targetId);
    const insertIdx = position === 'before'
      ? (targetIdx >= 0 ? targetIdx : reordered.length)
      : (targetIdx >= 0 ? targetIdx + 1 : reordered.length);
    reordered.splice(insertIdx, 0, { ...srcStrip, strip_zone: zone, strip_order: 0 });
    const batch = reordered.map((s, i) => ({ id: s.id, strip_zone: zone, strip_order: i }));
    const prevStrips = localStrips;
    for (const [i, s] of reordered.entries()) {
      pendingMoves.current.set(s.id, { zone, order: i, at: Date.now() });
    }
    setLocalStrips(localStrips.map((s) => {
      const idx = reordered.findIndex((r) => r.id === s.id);
      if (idx >= 0) return { ...s, strip_zone: zone, strip_order: idx };
      return s;
    }));
    try {
      const res = await fetch(`/api/plans-vol/${stripId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'reorder_strips', strips: batch }),
      });
      if (!res.ok) throw new Error('Erreur API');
    } catch {
      for (const s of reordered) pendingMoves.current.delete(s.id);
      setLocalStrips(prevStrips);
      onRefresh?.();
    }
  }, [localStrips, onRefresh]);

  const handleDrop = useCallback(async (e: React.DragEvent, zone: ZoneOrNull, targetStripId?: string, position?: 'before' | 'after') => {
    e.preventDefault();
    e.stopPropagation();
    const stripId = e.dataTransfer.getData('text/plain') || draggedIdRef.current || draggedId;
    const hint = dropTargetRef.current;
    const nearId = targetStripId ?? (hint?.zone === zone ? hint.stripId : undefined);
    const nearPos = position ?? (hint?.zone === zone ? hint.position : undefined);
    draggedIdRef.current = null;
    setDraggedId(null);
    setDrop(null);
    if (!stripId) return;
    if (nearId && nearPos && nearId !== stripId) {
      await dropNearStrip(stripId, nearId, zone, nearPos);
    } else {
      await dropInZone(stripId, zone);
    }
  }, [draggedId, dropInZone, dropNearStrip, setDrop]);

  /**
   * L'indice de dépôt est recalculé à chaque `dragover`, jamais accumulé sur des
   * paires enter/leave : traverser les enfants d'une bay ne peut plus le
   * désynchroniser ni faire disparaître la cible.
   */
  const handleZoneDragOver = useCallback((e: React.DragEvent, zone: ZoneOrNull) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    setDrop({ zone });
  }, [setDrop]);

  const handleStripDragOver = useCallback((e: React.DragEvent, targetId: string, zone: ZoneOrNull) => {
    e.preventDefault();
    e.stopPropagation();
    e.dataTransfer.dropEffect = 'move';
    if (targetId === (draggedIdRef.current ?? draggedId)) {
      setDrop({ zone });
      return;
    }
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
    const pos: 'before' | 'after' = e.clientY - rect.top < rect.height / 2 ? 'before' : 'after';
    setDrop({ zone, stripId: targetId, position: pos });
  }, [draggedId, setDrop]);

  const refresh = useCallback(() => onRefresh?.(), [onRefresh]);

  const quickTransferTargets = useMemo(() => {
    if (!atcPosition || !atcAeroport || !onlineSessions) return [];
    const allowedPositions = TRANSFER_HIERARCHY[atcPosition] ?? [];
    const myFir = AIRPORT_TO_FIR[atcAeroport] ?? '';
    const seen = new Set<string>();
    const targets: { aeroport: string; position: string; label: string }[] = [];

    const addTarget = (apt: string, pos: string, label: string) => {
      const key = `${apt}:${pos}`;
      if (seen.has(key)) return;
      seen.add(key);
      targets.push({ aeroport: apt, position: pos, label });
    };

    for (const pos of allowedPositions) {
      if (pos === 'Center') continue;
      const isFirWide = (
        ((atcPosition === 'APP' || atcPosition === 'DEP') && pos === 'Tower') ||
        (atcPosition === 'Center' && (pos === 'APP' || pos === 'DEP'))
      );
      if (isFirWide) {
        for (const s of onlineSessions) {
          if (s.position !== pos) continue;
          const sFir = AIRPORT_TO_FIR[s.aeroport] ?? '';
          if (sFir === myFir) {
            addTarget(s.aeroport, pos, s.aeroport === atcAeroport ? pos : `${pos} ${s.aeroport}`);
          }
        }
        continue;
      }
      const online = onlineSessions.find((s) => s.aeroport === atcAeroport && s.position === pos);
      if (online) addTarget(atcAeroport, pos, pos);
    }

    if (allowedPositions.includes('Center')) {
      for (const s of onlineSessions) {
        if (s.position === 'Center') addTarget(s.aeroport, 'Center', `Center ${s.aeroport}`);
      }
    }
    if (atcPosition === 'Center') {
      for (const s of onlineSessions) {
        if (s.position === 'Center' && s.aeroport !== atcAeroport) {
          addTarget(s.aeroport, 'Center', `Center ${s.aeroport}`);
        }
      }
    }
    return targets;
  }, [atcPosition, atcAeroport, onlineSessions]);

  const [quickTransferMenu, setQuickTransferMenu] = useState<{ stripId: string; x: number; y: number } | null>(null);

  const handleTransferClick = useCallback((stripId: string, event?: React.MouseEvent) => {
    if (quickTransferTargets.length === 0) {
      setTransferDialog(stripId);
      return;
    }
    if (event) {
      const rect = (event.currentTarget as HTMLElement).getBoundingClientRect();
      setQuickTransferMenu({ stripId, x: rect.left, y: rect.bottom + 4 });
    } else {
      setTransferDialog(stripId);
    }
  }, [quickTransferTargets]);

  const doQuickTransfer = useCallback(async (stripId: string, aeroport: string, position: string) => {
    setQuickTransferMenu(null);
    try {
      const res = await fetch(`/api/plans-vol/${stripId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'transferer', aeroport, position }),
      });
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        throw new Error(d.error || 'Erreur');
      }
      onRefresh?.();
    } catch (e) {
      alert(e instanceof Error ? e.message : 'Erreur');
    }
  }, [onRefresh]);

  const renderStripItem = (s: StripData, zone: ZoneOrNull) => {
    const isBeingDragged = draggedId === s.id;
    const isDropBefore = dropTarget?.stripId === s.id && dropTarget.position === 'before';
    const isDropAfter = dropTarget?.stripId === s.id && dropTarget.position === 'after';

    const marker = isDark ? 'bg-sky-400' : 'bg-sky-500';

    return (
      <div key={s.id} className="relative min-w-0">
        {/* Repères de dépôt en absolu : insérer un strip ne décale plus la pile. */}
        {isDropBefore && (
          <div className={`pointer-events-none absolute -top-1 left-1 right-1 z-10 h-1 rounded-full shadow-lg shadow-sky-500/50 ${marker}`} />
        )}
        <div
          draggable
          onDragStart={(e) => handleDragStart(e, s.id)}
          onDragEnd={handleDragEnd}
          onDragOver={(e) => handleStripDragOver(e, s.id, zone)}
          onDrop={(e) => handleDrop(e, zone, s.id, dropTargetRef.current?.stripId === s.id ? dropTargetRef.current.position : 'after')}
          className={`min-w-0 cursor-grab transition-opacity duration-150 active:cursor-grabbing ${isBeingDragged ? 'opacity-40' : 'opacity-100'}`}
        >
          <FlightStrip strip={s} onRefresh={refresh} onContextMenu={handleStripRightClickWithDouble} onTransferRequest={handleTransferClick} />
        </div>
        {isDropAfter && (
          <div className={`pointer-events-none absolute -bottom-1 left-1 right-1 z-10 h-1 rounded-full shadow-lg shadow-sky-500/50 ${marker}`} />
        )}
      </div>
    );
  };

  const renderBay = (zone: ZoneId, zs: StripData[]) => {
    const isDragOver = !!draggedId && dropTarget?.zone === zone;
    const ZONE_COLORS = isDark ? ZONE_COLORS_DARK : ZONE_COLORS_LIGHT;
    const ZONE_HEADER = isDark ? ZONE_HEADER_DARK : ZONE_HEADER_LIGHT;
    const ZONE_DROP = isDark ? ZONE_DROP_DARK : ZONE_DROP_LIGHT;

    return (
      <section
        key={zone}
        style={{ minWidth: BAY_MIN_WIDTH }}
        className={`flex min-h-0 flex-1 flex-col rounded-xl border transition-shadow ${isDragOver ? ZONE_DROP[zone] : ZONE_COLORS[zone]}`}
        onDragOver={(e) => handleZoneDragOver(e, zone)}
        onDrop={(e) => handleDrop(e, zone)}
      >
        <header className={`px-3 py-1.5 flex items-center justify-between rounded-t-xl ${ZONE_HEADER[zone]}`}>
          <div className="flex items-center gap-2 min-w-0">
            <span className={`h-2 w-2 rounded-full ${ZONE_DOT[zone]} shadow`} />
            <div className="min-w-0">
              <p className="text-[11px] font-black uppercase tracking-[0.16em] leading-none">{ZONE_LABELS[zone]}</p>
              <p className="text-[9px] font-medium opacity-70 mt-0.5 truncate">{ZONE_HINTS[zone]}</p>
            </div>
          </div>
          <span className="text-[11px] font-black tabular-nums bg-black/10 rounded-full px-2 py-0.5">{zs.length}</span>
        </header>
        <div className="flex min-h-[140px] flex-1 flex-col gap-1.5 overflow-y-auto overflow-x-hidden p-1.5">
          {zs.length === 0 ? (
            <div className={`flex-1 min-h-[88px] rounded-lg border-2 border-dashed flex items-center justify-center text-[11px] font-semibold italic ${
              isDragOver
                ? (isDark ? 'border-sky-400 text-sky-200 bg-sky-950/40' : 'border-sky-400 text-sky-700 bg-sky-50')
                : (isDark ? 'border-white/10 text-slate-500' : 'border-black/10 text-slate-500')
            }`}>
              {isDragOver ? 'Relâcher ici' : 'Bay vide — glisser un strip'}
            </div>
          ) : zs.map((s) => renderStripItem(s, zone))}
        </div>
      </section>
    );
  };

  const zoneStripsById: Record<ZoneId, StripData[]> = {
    sol: solStrips,
    depart: departStrips,
    arrivee: arriveeStrips,
    transit: transitStrips,
  };
  const bays: Array<{ id: ZoneId; strips: StripData[] }> = getVisibleZones(atcPosition).map((id) => ({
    id,
    strips: zoneStripsById[id],
  }));

  const isDragOverNull = !!draggedId && dropTarget?.zone === null;

  return (
    <div className="flex flex-col gap-2 h-full min-h-0">
      <div className={`flex items-center gap-2 px-1 ${isDark ? 'text-slate-300' : 'text-slate-700'}`}>
        <div className={`relative flex-1 max-w-xs ${isDark ? 'text-slate-200' : 'text-slate-800'}`}>
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 opacity-50" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Filtrer callsign, ICAO, squawk…"
            className={`w-full pl-8 pr-3 py-1.5 text-xs font-mono rounded-lg border outline-none ${
              isDark
                ? 'bg-slate-950/70 border-slate-700 text-slate-100 placeholder:text-slate-500 focus:border-sky-500'
                : 'bg-white/80 border-slate-300 text-slate-900 placeholder:text-slate-400 focus:border-sky-500'
            }`}
          />
        </div>
        <span className="text-[11px] font-semibold tabular-nums opacity-70">
          {filtered.length}/{localStrips.length} strip{localStrips.length > 1 ? 's' : ''}
        </span>
        <span className={`hidden sm:inline text-[10px] ${isDark ? 'text-slate-500' : 'text-slate-500'}`}>
          Double clic droit = transfert
        </span>
      </div>

      <div className="flex gap-2 flex-1 min-h-0 overflow-x-auto">
        {bays.map((z) => renderBay(z.id, z.strips))}
      </div>

      <section
        className={`rounded-xl border transition-shadow shrink-0 ${
          isDragOverNull
            ? (isDark ? 'ring-2 ring-slate-400 bg-slate-800/80' : 'ring-2 ring-slate-400 bg-slate-100/80')
            : (isDark ? 'border-slate-700 bg-slate-950/40' : 'border-slate-300/80 bg-white/40')
        }`}
        onDragOver={(e) => handleZoneDragOver(e, null)}
        onDrop={(e) => handleDrop(e, null)}
      >
        <header className={`px-3 py-1.5 flex items-center justify-between ${isDark ? 'bg-slate-800 text-slate-100' : 'bg-slate-200/90 text-slate-800'}`}>
          <p className="text-[11px] font-black uppercase tracking-[0.16em]">File d&apos;attente</p>
          <span className="text-[11px] font-black tabular-nums">{unassigned.length}</span>
        </header>
        <div
          className="grid max-h-52 gap-1.5 overflow-y-auto p-1.5"
          style={{ gridTemplateColumns: `repeat(auto-fill, minmax(${STRIP_MIN_WIDTH}px, 1fr))` }}
        >
          {unassigned.length === 0 ? (
            <div style={{ gridColumn: '1 / -1' }} className={`rounded-lg border-2 border-dashed py-4 text-center text-[11px] font-semibold italic ${
              isDragOverNull
                ? (isDark ? 'border-sky-400 bg-sky-950/40 text-sky-200' : 'border-sky-400 bg-sky-50 text-sky-700')
                : 'border-transparent text-slate-500'
            }`}>
              {isDragOverNull ? 'Relâcher ici' : 'Aucun strip en attente d’affectation'}
            </div>
          ) : unassigned.map((s) => renderStripItem(s, null))}
        </div>
      </section>

      {quickTransferMenu && (
        <div className="fixed inset-0 z-40" onClick={() => setQuickTransferMenu(null)}>
          <div
            style={{ position: 'fixed', top: quickTransferMenu.y, left: quickTransferMenu.x, zIndex: 50 }}
            className={`w-56 rounded-xl border shadow-2xl py-1 ${isDark ? 'bg-slate-900 border-slate-700' : 'bg-white border-slate-200'}`}
            onClick={(e) => e.stopPropagation()}
          >
            <div className={`px-3 py-1.5 text-[10px] font-black uppercase tracking-wider flex items-center gap-1.5 ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>
              <ArrowRightLeft className="h-3 w-3" /> Transférer vers
            </div>
            {quickTransferTargets.map((t) => (
              <button
                key={`${t.aeroport}-${t.position}`}
                type="button"
                onClick={() => doQuickTransfer(quickTransferMenu.stripId, t.aeroport, t.position)}
                className={`w-full text-left px-3 py-2 text-sm font-semibold ${isDark ? 'text-slate-200 hover:bg-slate-800' : 'text-slate-800 hover:bg-slate-100'}`}
              >
                {t.label}
              </button>
            ))}
            <button
              type="button"
              onClick={() => { setTransferDialog(quickTransferMenu.stripId); setQuickTransferMenu(null); }}
              className={`w-full text-left px-3 py-2 text-xs font-semibold border-t ${isDark ? 'text-slate-400 hover:bg-slate-800 border-slate-700' : 'text-slate-500 hover:bg-slate-50 border-slate-200'}`}
            >
              Autre position…
            </button>
          </div>
        </div>
      )}

      {transferDialog && (
        <TransferDialog
          planId={transferDialog}
          onlineSessions={onlineSessions}
          onClose={() => setTransferDialog(null)}
          onRefresh={onRefresh}
        />
      )}
    </div>
  );
}

function TransferDialog({
  planId, onlineSessions, onClose, onRefresh,
}: {
  planId: string;
  onlineSessions?: OnlineSession[];
  onClose: () => void;
  onRefresh?: () => void;
}) {
  const { theme } = useAtcTheme();
  const isDark = theme === 'dark';
  const [aeroport, setAeroport] = useState('');
  const [position, setPosition] = useState('');
  const [loading, setLoading] = useState(false);
  const [autoSurv, setAutoSurv] = useState(false);

  const handleTransfer = async (apt?: string, pos?: string, auto?: boolean) => {
    setLoading(true);
    try {
      const body: Record<string, unknown> = { action: 'transferer' };
      if (auto ?? autoSurv) body.automonitoring = true;
      else {
        body.aeroport = apt ?? aeroport;
        body.position = pos ?? position;
      }
      const res = await fetch(`/api/plans-vol/${planId}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
      const d = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(d.error || 'Erreur');
      onRefresh?.();
      onClose();
    } catch (e) {
      alert(e instanceof Error ? e.message : 'Erreur');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/65 flex items-center justify-center z-50 p-4" onClick={onClose}>
      <div className={`rounded-2xl shadow-2xl p-5 w-full max-w-md border ${isDark ? 'bg-slate-950 border-slate-700' : 'bg-white border-slate-200'}`} onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-4">
          <h3 className={`text-base font-black tracking-wide ${isDark ? 'text-slate-100' : 'text-slate-900'}`}>Transfert de strip</h3>
          <button type="button" onClick={onClose} className={isDark ? 'text-slate-400 hover:text-white' : 'text-slate-500 hover:text-slate-900'}><X className="h-4 w-4" /></button>
        </div>

        {onlineSessions && onlineSessions.length > 0 && !autoSurv && (
          <div className="mb-4">
            <p className={`text-[10px] font-black uppercase tracking-wider mb-2 ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>Positions en ligne</p>
            <div className="flex flex-wrap gap-1.5">
              {onlineSessions.map((s) => (
                <button
                  key={`${s.aeroport}-${s.position}-${s.user_id}`}
                  type="button"
                  disabled={loading}
                  onClick={() => handleTransfer(s.aeroport, s.position, false)}
                  className={`inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border text-xs font-bold ${
                    isDark
                      ? 'border-slate-700 bg-slate-900 text-slate-100 hover:border-sky-500 hover:bg-sky-950'
                      : 'border-slate-200 bg-slate-50 text-slate-800 hover:border-sky-400 hover:bg-sky-50'
                  }`}
                >
                  <Radio className="h-3 w-3 text-emerald-500" />
                  {s.aeroport} {s.position}
                </button>
              ))}
            </div>
          </div>
        )}

        <div className="space-y-3">
          <div>
            <label className={`text-[10px] font-black uppercase tracking-wider ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>Aéroport</label>
            <select className={`mt-1 w-full border rounded-lg px-3 py-2 text-sm font-mono font-bold ${isDark ? 'bg-slate-900 border-slate-700 text-slate-100' : 'bg-white border-slate-300 text-slate-900'}`} value={aeroport} onChange={(e) => setAeroport(e.target.value)} disabled={autoSurv}>
              <option value="">— Sélectionner —</option>
              {AEROPORTS_PTFS.map((apt) => (
                <option key={apt.code} value={apt.code}>{apt.code} – {apt.nom}</option>
              ))}
            </select>
          </div>
          <div>
            <label className={`text-[10px] font-black uppercase tracking-wider ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>Position</label>
            <select className={`mt-1 w-full border rounded-lg px-3 py-2 text-sm font-semibold ${isDark ? 'bg-slate-900 border-slate-700 text-slate-100' : 'bg-white border-slate-300 text-slate-900'}`} value={position} onChange={(e) => setPosition(e.target.value)} disabled={autoSurv}>
              <option value="">— Sélectionner —</option>
              {['Delivery', 'Clairance', 'Ground', 'Tower', 'APP', 'DEP', 'Center', 'AFIS'].map((p) => <option key={p} value={p}>{p}</option>)}
            </select>
          </div>
          <label className={`flex items-center gap-2 text-sm font-semibold ${isDark ? 'text-slate-300' : 'text-slate-700'}`}>
            <input type="checkbox" checked={autoSurv} onChange={(e) => setAutoSurv(e.target.checked)} className="w-4 h-4" /> Autosurveillance
          </label>
        </div>
        <div className="flex gap-2 mt-5">
          <button type="button" className="flex-1 bg-sky-600 text-white rounded-lg py-2 text-sm font-bold hover:bg-sky-700 disabled:opacity-50" onClick={() => handleTransfer()} disabled={loading || (!autoSurv && (!aeroport || !position))}>{loading ? '…' : 'Transférer'}</button>
          <button type="button" className={`flex-1 rounded-lg py-2 text-sm font-bold ${isDark ? 'bg-slate-800 text-slate-200' : 'bg-slate-200 text-slate-700'}`} onClick={onClose}>Annuler</button>
        </div>
      </div>
    </div>
  );
}
