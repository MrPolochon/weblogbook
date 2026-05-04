'use client';

import { useState, useRef, useCallback, useEffect, useTransition, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import FlightStrip, { type StripData } from './FlightStrip';
import { useAtcTheme } from '@/contexts/AtcThemeContext';
import { AEROPORTS_PTFS } from '@/lib/aeroports-ptfs';
import { AIRPORT_TO_FIR } from '@/lib/cartography-data';
import type { OnlineSession } from './FlightStripBoardWrapper';

const TRANSFER_HIERARCHY: Record<string, string[]> = {
  Delivery: ['Ground'],
  Ground: ['Delivery', 'Clairance', 'Tower'],
  Clairance: ['Ground'],
  Tower: ['Ground', 'APP', 'DEP'],
  APP: ['Tower', 'Center'],
  DEP: ['Tower', 'Center'],
  Center: ['APP', 'DEP'],
};

type ZoneId = 'sol' | 'depart' | 'arrivee' | 'transit';
type ZoneOrNull = ZoneId | null;

const ZONE_LABELS: Record<ZoneId, string> = {
  sol: 'Trafic au sol',
  depart: 'Trafic au départ',
  arrivee: "Trafic à l'arrivée",
  transit: 'En transit',
};
const ZONE_COLORS_LIGHT: Record<ZoneId, string> = {
  sol: 'border-amber-400 bg-amber-50/60',
  depart: 'border-sky-400 bg-sky-50/60',
  arrivee: 'border-emerald-400 bg-emerald-50/60',
  transit: 'border-violet-400 bg-violet-50/60',
};
const ZONE_COLORS_DARK: Record<ZoneId, string> = {
  sol: 'border-amber-600 bg-amber-950/40',
  depart: 'border-sky-600 bg-sky-950/40',
  arrivee: 'border-emerald-600 bg-emerald-950/40',
  transit: 'border-violet-600 bg-violet-950/40',
};
const ZONE_HEADER_LIGHT: Record<ZoneId, string> = {
  sol: 'bg-amber-200 text-amber-900',
  depart: 'bg-sky-200 text-sky-900',
  arrivee: 'bg-emerald-200 text-emerald-900',
  transit: 'bg-violet-200 text-violet-900',
};
const ZONE_HEADER_DARK: Record<ZoneId, string> = {
  sol: 'bg-amber-800 text-amber-100',
  depart: 'bg-sky-800 text-sky-100',
  arrivee: 'bg-emerald-800 text-emerald-100',
  transit: 'bg-violet-800 text-violet-100',
};

const ZONE_DROP_LIGHT: Record<ZoneId, string> = {
  sol: 'ring-4 ring-amber-400 bg-amber-100/80',
  depart: 'ring-4 ring-sky-400 bg-sky-100/80',
  arrivee: 'ring-4 ring-emerald-400 bg-emerald-100/80',
  transit: 'ring-4 ring-violet-400 bg-violet-100/80',
};
const ZONE_DROP_DARK: Record<ZoneId, string> = {
  sol: 'ring-4 ring-amber-500 bg-amber-900/60',
  depart: 'ring-4 ring-sky-500 bg-sky-900/60',
  arrivee: 'ring-4 ring-emerald-500 bg-emerald-900/60',
  transit: 'ring-4 ring-violet-500 bg-violet-900/60',
};

export default function FlightStripBoard({ strips, atcPosition, atcAeroport, onlineSessions }: { strips: StripData[]; atcPosition?: string; atcAeroport?: string; onlineSessions?: OnlineSession[] }) {
  const router = useRouter();
  const { theme } = useAtcTheme();
  const isDark = theme === 'dark';
  const isCenter = atcPosition === 'Center';
  const [transferDialog, setTransferDialog] = useState<string | null>(null);

  // État local pour mises à jour optimistes (déplacement immédiat au drop).
  // On ne resync l'état local depuis les props QUE si l'identité des strips ou leur
  // ordre/zone change réellement (sinon un nouveau tableau identique en contenu mais
  // de référence différente déclenchait un reset et faisait revenir le strip à sa
  // position serveur en plein drag).
  const [localStrips, setLocalStrips] = useState<StripData[]>(strips);
  const stripsSignature = useMemo(
    () => strips.map(s => `${s.id}:${s.strip_zone ?? 'null'}:${s.strip_order}`).join('|'),
    [strips]
  );
  useEffect(() => {
    setLocalStrips(strips);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stripsSignature]);

  // ═══════════════════════════════════════════════
  //  DRAG & DROP
  // ═══════════════════════════════════════════════
  const [draggedId, setDraggedId] = useState<string | null>(null);
  const [dropTarget, setDropTarget] = useState<{ zone: ZoneOrNull; stripId?: string; position?: 'before' | 'after' } | null>(null);
  const dragCounters = useRef<Map<string, number>>(new Map());

  const getZone = useCallback((zone: ZoneOrNull) =>
    localStrips.filter((s) => s.strip_zone === zone).sort((a, b) => a.strip_order - b.strip_order),
  [localStrips]);

  const unassigned = getZone(null);
  const solStrips = getZone('sol');
  const departStrips = getZone('depart');
  const arriveeStrips = getZone('arrivee');
  const transitStrips = getZone('transit');

  // ─── Double right-click = transfer dialog ───
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

  // ─── Drag start ───
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

  // ─── Drop: place strip in zone (at end) — mise à jour optimiste ───
  const dropInZone = useCallback(async (stripId: string, zone: ZoneOrNull) => {
    const zoneStrips = localStrips.filter((s) => s.strip_zone === zone);
    const maxOrder = zoneStrips.reduce((max, s) => Math.max(max, s.strip_order), -1);
    const srcStrip = localStrips.find((s) => s.id === stripId);
    if (!srcStrip) return;
    const prevStrips = localStrips;
    setLocalStrips((prev) =>
      prev.map((s) => s.id === stripId ? { ...s, strip_zone: zone, strip_order: maxOrder + 1 } : s)
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
      router.refresh();
    }
  }, [localStrips, router]);

  // ─── Drop: place strip before/after another — mise à jour optimiste ───
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
    const newStrips = localStrips.map((s) => {
      const idx = reordered.findIndex((r) => r.id === s.id);
      if (idx >= 0) return { ...s, strip_zone: zone, strip_order: idx };
      return s;
    });
    setLocalStrips(newStrips);
    try {
      const res = await fetch(`/api/plans-vol/${stripId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'reorder_strips', strips: batch }),
      });
      if (!res.ok) throw new Error('Erreur API');
    } catch {
      setLocalStrips(prevStrips);
      router.refresh();
    }
  }, [localStrips, router]);

  // ─── Handle drop event ───
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

  // ─── Zone drag enter/leave/over ───
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

  // ─── Strip-level drag over (for precise insert position) ───
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

  const refresh = useCallback(() => router.refresh(), [router]);

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

      // APP/DEP → Tower : toutes les Tower de la FIR
      // Center → APP/DEP : toutes les APP/DEP de la FIR
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

      // Autres positions : même aéroport uniquement
      const online = onlineSessions.find(s => s.aeroport === atcAeroport && s.position === pos);
      if (online) {
        addTarget(atcAeroport, pos, pos);
      }
    }

    // Centers : tous les Centers en ligne
    if (allowedPositions.includes('Center')) {
      for (const s of onlineSessions) {
        if (s.position === 'Center') {
          addTarget(s.aeroport, 'Center', `Center ${s.aeroport}`);
        }
      }
    }

    // Center → tous les autres Centers
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
      router.refresh();
    } catch (e) {
      alert(e instanceof Error ? e.message : 'Erreur');
    }
  }, [router]);

  // ─── Render a strip item with drag support ───
  const renderStripItem = (s: StripData, zone: ZoneOrNull) => {
    const isBeingDragged = draggedId === s.id;
    const isDropBefore = dropTarget?.stripId === s.id && dropTarget.position === 'before';
    const isDropAfter = dropTarget?.stripId === s.id && dropTarget.position === 'after';

    return (
      <div key={s.id} className="relative">
        {isDropBefore && (
          <div className={`h-1.5 rounded-full mx-1 mb-1 transition-all ${isDark ? 'bg-sky-400' : 'bg-sky-500'} shadow-lg shadow-sky-500/50`} />
        )}
        <div
          draggable
          onDragStart={(e) => handleDragStart(e, s.id)}
          onDragEnd={handleDragEnd}
          onDragOver={(e) => handleStripDragOver(e, s.id, zone)}
          onDrop={(e) => handleDrop(e, zone, s.id, dropTarget?.stripId === s.id ? dropTarget.position : 'after')}
          className={`transition-all duration-200 ${isBeingDragged ? 'opacity-30 scale-95' : 'opacity-100'} cursor-grab active:cursor-grabbing`}
        >
          <FlightStrip strip={s} onRefresh={refresh} onContextMenu={handleStripRightClickWithDouble} onTransferRequest={handleTransferClick} />
        </div>
        {isDropAfter && (
          <div className={`h-1.5 rounded-full mx-1 mt-1 transition-all ${isDark ? 'bg-sky-400' : 'bg-sky-500'} shadow-lg shadow-sky-500/50`} />
        )}
      </div>
    );
  };

  // ─── Render a zone ───
  const renderZone = (zone: ZoneId, zs: StripData[]) => {
    const isDragOver = !!draggedId && dropTarget?.zone === zone;
    const ZONE_COLORS = isDark ? ZONE_COLORS_DARK : ZONE_COLORS_LIGHT;
    const ZONE_HEADER = isDark ? ZONE_HEADER_DARK : ZONE_HEADER_LIGHT;
    const ZONE_DROP = isDark ? ZONE_DROP_DARK : ZONE_DROP_LIGHT;

    return (
      <div
        key={zone}
        className={`flex-1 min-w-[480px] border-2 rounded-lg flex flex-col transition-all duration-200 ${isDragOver ? ZONE_DROP[zone] : ZONE_COLORS[zone]}`}
        onDragEnter={(e) => handleZoneDragEnter(e, zone)}
        onDragLeave={(e) => handleZoneDragLeave(e, zone)}
        onDragOver={handleZoneDragOver}
        onDrop={(e) => handleDrop(e, zone)}
      >
        <div className={`px-3 py-2 text-base font-bold uppercase tracking-wider ${ZONE_HEADER[zone]} rounded-t-md flex items-center justify-between`}>
          <span>{ZONE_LABELS[zone]}</span>
          <div className="flex items-center gap-2">
            <span className={`text-sm font-semibold ${isDark ? 'text-slate-200' : 'opacity-80'}`}>{zs.length} vol(s)</span>
            {isDragOver && <span className={`text-xs font-bold rounded px-2 py-1 animate-pulse shadow-sm ${isDark ? 'bg-slate-700 text-slate-100' : 'bg-white/70'}`}>Relâcher pour poser</span>}
          </div>
        </div>
        <div className="flex-1 p-2 space-y-1 overflow-y-auto max-h-[calc(100dvh-320px)]">
          {zs.length === 0 ? (
            <div className={`text-center py-8 rounded-lg border-2 border-dashed transition-all ${isDragOver ? (isDark ? 'border-sky-400 bg-sky-950/50' : 'border-sky-400 bg-sky-50') : 'border-transparent'}`}>
              <p className={`text-base font-semibold italic ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>
                {isDragOver ? 'Relâcher ici' : 'Aucun strip'}
              </p>
            </div>
          ) : zs.map((s) => renderStripItem(s, zone))}
        </div>
      </div>
    );
  };

  return (
    <div className="flex flex-col gap-4 h-full">
      {/* Zones */}
      <div className="flex gap-3 flex-1 min-h-0 overflow-x-auto pb-1">
        {renderZone('sol', solStrips)}
        {renderZone('depart', departStrips)}
        {isCenter && renderZone('transit', transitStrips)}
        {renderZone('arrivee', arriveeStrips)}
      </div>

      {/* Unassigned */}
      {(() => {
        const isDragOverNull = !!draggedId && dropTarget?.zone === null;
        return (
          <div
            className={`border-2 rounded-lg transition-all duration-200 ${isDragOverNull ? (isDark ? 'ring-4 ring-slate-400 bg-slate-800/80' : 'ring-4 ring-slate-400 bg-slate-100/80') : (isDark ? 'border-slate-600 bg-slate-900/40' : 'border-slate-300 bg-slate-50/60')}`}
            onDragEnter={(e) => handleZoneDragEnter(e, null)}
            onDragLeave={(e) => handleZoneDragLeave(e, null)}
            onDragOver={handleZoneDragOver}
            onDrop={(e) => handleDrop(e, null)}
          >
            <div className={`px-3 py-2 text-base font-bold uppercase tracking-wider rounded-t-md flex items-center justify-between ${isDark ? 'bg-slate-700 text-slate-100' : 'bg-slate-200 text-slate-700'}`}>
              <span>Non assign&eacute;s</span>
              <div className="flex items-center gap-2">
                <span className={`text-sm font-semibold ${isDark ? 'text-slate-300' : 'opacity-80'}`}>{unassigned.length} vol(s)</span>
                {isDragOverNull && <span className={`text-xs font-bold rounded px-2 py-1 animate-pulse shadow-sm ${isDark ? 'bg-slate-600 text-slate-100' : 'bg-white/70'}`}>Relâcher pour poser</span>}
              </div>
            </div>
            <div className="p-2 space-y-1 max-h-60 overflow-y-auto">
              {unassigned.length === 0 ? (
                <div className={`text-center py-6 rounded-lg border-2 border-dashed transition-all ${isDragOverNull ? (isDark ? 'border-sky-400 bg-sky-950/50' : 'border-sky-400 bg-sky-50') : 'border-transparent'}`}>
                  <p className={`text-base font-semibold italic ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>{isDragOverNull ? 'Relâcher ici' : 'Tous assignés.'}</p>
                </div>
              ) : unassigned.map((s) => renderStripItem(s, null))}
            </div>
          </div>
        );
      })()}

      {/* Quick transfer menu */}
      {quickTransferMenu && (
        <div className="fixed inset-0 z-40" onClick={() => setQuickTransferMenu(null)}>
          <div
            style={{ position: 'fixed', top: quickTransferMenu.y, left: quickTransferMenu.x, zIndex: 50 }}
            className={`w-52 rounded-lg border shadow-xl py-1 ${isDark ? 'bg-slate-800 border-slate-600' : 'bg-white border-slate-300'}`}
            onClick={e => e.stopPropagation()}
          >
            <div className={`px-3 py-1.5 text-xs font-bold uppercase tracking-wider ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>
              Transférer vers
            </div>
            {quickTransferTargets.map((t) => (
              <button
                key={`${t.aeroport}-${t.position}`}
                type="button"
                onClick={() => doQuickTransfer(quickTransferMenu.stripId, t.aeroport, t.position)}
                className={`w-full text-left px-3 py-2 text-sm font-semibold transition-colors ${isDark ? 'text-slate-200 hover:bg-slate-700' : 'text-slate-800 hover:bg-slate-100'}`}
              >
                {t.label}
              </button>
            ))}
            {quickTransferTargets.length === 0 && (
              <p className={`px-3 py-2 text-sm italic ${isDark ? 'text-slate-500' : 'text-slate-400'}`}>Aucune position en ligne</p>
            )}
          </div>
        </div>
      )}

      {/* Transfer dialog (double clic droit) */}
      {transferDialog && <TransferDialog planId={transferDialog} onClose={() => setTransferDialog(null)} />}
    </div>
  );
}

/* ============================================================ */
function TransferDialog({ planId, onClose }: { planId: string; onClose: () => void }) {
  const router = useRouter();
  const [, startTransition] = useTransition();
  const { theme } = useAtcTheme();
  const isDark = theme === 'dark';
  const [aeroport, setAeroport] = useState('');
  const [position, setPosition] = useState('');
  const [loading, setLoading] = useState(false);
  const [autoSurv, setAutoSurv] = useState(false);

  const handleTransfer = async () => {
    setLoading(true);
    try {
      const body: Record<string, unknown> = { action: 'transferer' };
      if (autoSurv) body.automonitoring = true;
      else { body.aeroport = aeroport; body.position = position; }
      const res = await fetch(`/api/plans-vol/${planId}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
      const d = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(d.error || 'Erreur');
      startTransition(() => router.refresh()); onClose();
    } catch (e) { alert(e instanceof Error ? e.message : 'Erreur'); }
    finally { setLoading(false); }
  };

  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50" onClick={onClose}>
      <div className={`rounded-xl shadow-2xl p-6 w-96 ${isDark ? 'bg-slate-800' : 'bg-white'}`} onClick={(e) => e.stopPropagation()}>
        <h3 className={`text-lg font-bold mb-4 ${isDark ? 'text-slate-100' : 'text-slate-900'}`}>Transférer le vol</h3>
        <div className="space-y-3">
          <div>
            <label className={`text-sm font-semibold ${isDark ? 'text-slate-300' : 'text-slate-600'}`}>Aéroport</label>
            <select
              className={`w-full border rounded-lg px-3 py-2 text-sm font-mono font-bold ${isDark ? 'bg-slate-900 border-slate-600 text-slate-100' : 'bg-white border-slate-300 text-slate-900'}`}
              value={aeroport}
              onChange={(e) => setAeroport(e.target.value)}
              disabled={autoSurv}
            >
              <option value="">— Sélectionner un aéroport —</option>
              {AEROPORTS_PTFS.map((apt) => (
                <option key={apt.code} value={apt.code}>
                  {apt.code} – {apt.nom}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className={`text-sm font-semibold ${isDark ? 'text-slate-300' : 'text-slate-600'}`}>Position</label>
            <select className={`w-full border rounded-lg px-3 py-2 text-sm font-semibold ${isDark ? 'bg-slate-900 border-slate-600 text-slate-100' : 'bg-white border-slate-300 text-slate-900'}`} value={position} onChange={(e) => setPosition(e.target.value)} disabled={autoSurv}>
              <option value="">— Sélectionner —</option>
              {['Delivery','Clairance','Ground','Tower','APP','DEP','Center'].map((p) => <option key={p} value={p}>{p}</option>)}
            </select>
          </div>
          <label className={`flex items-center gap-2 text-sm font-semibold ${isDark ? 'text-slate-300' : 'text-slate-700'}`}>
            <input type="checkbox" checked={autoSurv} onChange={(e) => setAutoSurv(e.target.checked)} className="w-4 h-4" /> Autosurveillance
          </label>
        </div>
        <div className="flex gap-3 mt-5">
          <button type="button" className="flex-1 bg-sky-600 text-white rounded-lg py-2 text-sm font-bold hover:bg-sky-700 disabled:opacity-50 shadow-sm" onClick={handleTransfer} disabled={loading || (!autoSurv && (!aeroport || !position))}>{loading ? '…' : 'Transférer'}</button>
          <button type="button" className={`flex-1 rounded-lg py-2 text-sm font-bold shadow-sm ${isDark ? 'bg-slate-700 text-slate-200 hover:bg-slate-600' : 'bg-slate-200 text-slate-700 hover:bg-slate-300'}`} onClick={onClose}>Annuler</button>
        </div>
      </div>
    </div>
  );
}
