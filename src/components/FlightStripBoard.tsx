'use client';

import { useState, useRef, useCallback, useEffect, useMemo } from 'react';
import FlightStrip, { type StripData } from './FlightStrip';
import { useAtcTheme } from '@/contexts/AtcThemeContext';
import { AEROPORTS_PTFS } from '@/lib/aeroports-ptfs';
import { AIRPORT_TO_FIR } from '@/lib/cartography-data';
import type { OnlineSession } from './FlightStripBoardWrapper';
import { TRANSFER_HIERARCHY, ZONE_HINTS, ZONE_LABELS, type StripZoneId } from '@/lib/atc-ui';
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
  const isCenter = atcPosition === 'Center';
  const [transferDialog, setTransferDialog] = useState<string | null>(null);
  const [query, setQuery] = useState('');

  const [localStrips, setLocalStrips] = useState<StripData[]>(strips);
  const [draggedId, setDraggedId] = useState<string | null>(null);
  const stripsSignature = useMemo(
    () => strips.map((s) =>
      `${s.id}:${s.strip_zone ?? 'null'}:${s.strip_order}:${s.statut}:${s.code_transpondeur ?? ''}:${s.mode_transpondeur ?? ''}`,
    ).join('|'),
    [strips],
  );
  useEffect(() => {
    if (draggedId) {
      setLocalStrips((prev) => strips.map((s) => {
        if (s.id === draggedId) {
          const local = prev.find((l) => l.id === s.id);
          if (local) return { ...s, strip_zone: local.strip_zone, strip_order: local.strip_order };
        }
        return s;
      }));
    } else {
      setLocalStrips(strips);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stripsSignature]);

  const [dropTarget, setDropTarget] = useState<{ zone: ZoneOrNull; stripId?: string; position?: 'before' | 'after' } | null>(null);
  const dragCounters = useRef<Map<string, number>>(new Map());

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return localStrips;
    return localStrips.filter((s) =>
      [s.numero_vol, s.aeroport_depart, s.aeroport_arrivee, s.immatriculation, s.pilote_identifiant, s.code_transpondeur]
        .filter(Boolean)
        .some((v) => String(v).toLowerCase().includes(q)),
    );
  }, [localStrips, query]);

  const getZone = useCallback((zone: ZoneOrNull) =>
    filtered.filter((s) => s.strip_zone === zone).sort((a, b) => a.strip_order - b.strip_order),
  [filtered]);

  const unassigned = getZone(null);
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
    setDraggedId(stripId);
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', stripId);
    if (e.dataTransfer.setDragImage && e.currentTarget instanceof HTMLElement) {
      e.dataTransfer.setDragImage(e.currentTarget, e.currentTarget.offsetWidth / 2, 20);
    }
  }, []);

  const handleDragEnd = useCallback(() => {
    setDraggedId(null);
    setDropTarget(null);
    dragCounters.current.clear();
  }, []);

  const dropInZone = useCallback(async (stripId: string, zone: ZoneOrNull) => {
    const zoneStrips = localStrips.filter((s) => s.strip_zone === zone);
    const maxOrder = zoneStrips.reduce((max, s) => Math.max(max, s.strip_order), -1);
    const srcStrip = localStrips.find((s) => s.id === stripId);
    if (!srcStrip) return;
    const prevStrips = localStrips;
    setLocalStrips((prev) =>
      prev.map((s) => s.id === stripId ? { ...s, strip_zone: zone, strip_order: maxOrder + 1 } : s),
    );
    try {
      const res = await fetch(`/api/plans-vol/${stripId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'update_strip', strip_zone: zone, strip_order: maxOrder + 1 }),
      });
      if (!res.ok) throw new Error('Erreur API');
    } catch {
      setLocalStrips(prevStrips);
      onRefresh?.();
    }
  }, [localStrips, onRefresh]);

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
      setLocalStrips(prevStrips);
      onRefresh?.();
    }
  }, [localStrips, onRefresh]);

  const handleDrop = useCallback(async (e: React.DragEvent, zone: ZoneOrNull, targetStripId?: string, position?: 'before' | 'after') => {
    e.preventDefault();
    e.stopPropagation();
    const stripId = e.dataTransfer.getData('text/plain') || draggedId;
    setDraggedId(null);
    setDropTarget(null);
    dragCounters.current.clear();
    if (!stripId) return;
    if (targetStripId && position) {
      await dropNearStrip(stripId, targetStripId, zone, position);
    } else {
      await dropInZone(stripId, zone);
    }
  }, [draggedId, dropInZone, dropNearStrip]);

  const zoneKey = (zone: ZoneOrNull) => zone ?? '__null';

  const handleZoneDragEnter = useCallback((e: React.DragEvent, zone: ZoneOrNull) => {
    e.preventDefault();
    const key = zoneKey(zone);
    const count = (dragCounters.current.get(key) || 0) + 1;
    dragCounters.current.set(key, count);
    if (count === 1) setDropTarget({ zone });
  }, []);

  const handleZoneDragLeave = useCallback((e: React.DragEvent, zone: ZoneOrNull) => {
    e.preventDefault();
    const key = zoneKey(zone);
    const count = (dragCounters.current.get(key) || 0) - 1;
    dragCounters.current.set(key, Math.max(0, count));
    if (count <= 0) {
      dragCounters.current.delete(key);
      setDropTarget((prev) => prev?.zone === zone && !prev.stripId ? null : prev);
    }
  }, []);

  const handleZoneDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
  }, []);

  const handleStripDragOver = useCallback((e: React.DragEvent, targetId: string, zone: ZoneOrNull) => {
    e.preventDefault();
    e.stopPropagation();
    e.dataTransfer.dropEffect = 'move';
    if (targetId === draggedId) return;
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
    const mouseY = e.clientY - rect.top;
    const pos: 'before' | 'after' = mouseY < rect.height / 2 ? 'before' : 'after';
    setDropTarget((prev) => {
      if (prev?.stripId === targetId && prev.position === pos) return prev;
      return { zone, stripId: targetId, position: pos };
    });
  }, [draggedId]);

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

    return (
      <div key={s.id} className="relative">
        {isDropBefore && (
          <div className={`h-1 rounded-full mx-1 mb-1 ${isDark ? 'bg-sky-400' : 'bg-sky-500'} shadow-lg shadow-sky-500/50`} />
        )}
        <div
          draggable
          onDragStart={(e) => handleDragStart(e, s.id)}
          onDragEnd={handleDragEnd}
          onDragOver={(e) => handleStripDragOver(e, s.id, zone)}
          onDrop={(e) => handleDrop(e, zone, s.id, dropTarget?.stripId === s.id ? dropTarget.position : 'after')}
          className={`transition-opacity duration-150 ${isBeingDragged ? 'opacity-30' : 'opacity-100'} cursor-grab active:cursor-grabbing`}
        >
          <FlightStrip strip={s} onRefresh={refresh} onContextMenu={handleStripRightClickWithDouble} onTransferRequest={handleTransferClick} />
        </div>
        {isDropAfter && (
          <div className={`h-1 rounded-full mx-1 mt-1 ${isDark ? 'bg-sky-400' : 'bg-sky-500'} shadow-lg shadow-sky-500/50`} />
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
        className={`min-w-[280px] flex-1 flex flex-col rounded-xl border min-h-0 transition-shadow ${isDragOver ? ZONE_DROP[zone] : ZONE_COLORS[zone]}`}
        onDragEnter={(e) => handleZoneDragEnter(e, zone)}
        onDragLeave={(e) => handleZoneDragLeave(e, zone)}
        onDragOver={handleZoneDragOver}
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
        <div className="flex-1 p-1.5 flex flex-col gap-1.5 overflow-y-auto overflow-x-hidden min-h-[140px]">
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

  const bays: Array<{ id: ZoneId; strips: StripData[] }> = [
    { id: 'sol', strips: solStrips },
    { id: 'depart', strips: departStrips },
    ...(isCenter ? [{ id: 'transit' as ZoneId, strips: transitStrips }] : []),
    { id: 'arrivee', strips: arriveeStrips },
  ];

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
        onDragEnter={(e) => handleZoneDragEnter(e, null)}
        onDragLeave={(e) => handleZoneDragLeave(e, null)}
        onDragOver={handleZoneDragOver}
        onDrop={(e) => handleDrop(e, null)}
      >
        <header className={`px-3 py-1.5 flex items-center justify-between ${isDark ? 'bg-slate-800 text-slate-100' : 'bg-slate-200/90 text-slate-800'}`}>
          <p className="text-[11px] font-black uppercase tracking-[0.16em]">File d&apos;attente</p>
          <span className="text-[11px] font-black tabular-nums">{unassigned.length}</span>
        </header>
        <div className="p-1.5 flex flex-wrap gap-1.5 content-start max-h-44 overflow-y-auto">
          {unassigned.length === 0 ? (
            <div className={`w-full text-center py-4 rounded-lg border-2 border-dashed text-[11px] font-semibold italic ${
              isDragOverNull
                ? (isDark ? 'border-sky-400 text-sky-200 bg-sky-950/40' : 'border-sky-400 text-sky-700 bg-sky-50')
                : (isDark ? 'border-transparent text-slate-500' : 'border-transparent text-slate-500')
            }`}>
              {isDragOverNull ? 'Relâcher ici' : 'Aucun strip en attente d’affectation'}
            </div>
          ) : unassigned.map((s) => (
            <div key={s.id} className="w-full max-w-3xl">{renderStripItem(s, null)}</div>
          ))}
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
              {['Delivery', 'Clairance', 'Ground', 'Tower', 'APP', 'DEP', 'Center'].map((p) => <option key={p} value={p}>{p}</option>)}
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
