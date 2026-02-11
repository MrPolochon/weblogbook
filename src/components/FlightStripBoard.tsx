'use client';

import { useState, useRef, useCallback, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import FlightStrip, { type StripData } from './FlightStrip';

type ZoneId = 'sol' | 'depart' | 'arrivee';

const ZONE_LABELS: Record<ZoneId, string> = {
  sol: 'Trafic au sol',
  depart: 'Trafic au départ',
  arrivee: 'Trafic à l\'arrivée',
};

const ZONE_COLORS: Record<ZoneId, string> = {
  sol: 'border-amber-400 bg-amber-50/60',
  depart: 'border-sky-400 bg-sky-50/60',
  arrivee: 'border-emerald-400 bg-emerald-50/60',
};

const ZONE_HEADER: Record<ZoneId, string> = {
  sol: 'bg-amber-200 text-amber-900',
  depart: 'bg-sky-200 text-sky-900',
  arrivee: 'bg-emerald-200 text-emerald-900',
};

export default function FlightStripBoard({ strips }: { strips: StripData[] }) {
  const router = useRouter();
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number; stripId: string } | null>(null);
  const [transferDialog, setTransferDialog] = useState<string | null>(null);
  const [draggedStripId, setDraggedStripId] = useState<string | null>(null);
  const [dropTarget, setDropTarget] = useState<string | null>(null);
  const contextRef = useRef<HTMLDivElement>(null);

  // Sort strips by zone and order
  const getZoneStrips = useCallback((zone: ZoneId | null) => {
    return strips
      .filter((s) => s.strip_zone === zone)
      .sort((a, b) => a.strip_order - b.strip_order);
  }, [strips]);

  const unassigned = getZoneStrips(null);
  const solStrips = getZoneStrips('sol');
  const departStrips = getZoneStrips('depart');
  const arriveeStrips = getZoneStrips('arrivee');

  // Close context menu on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (contextRef.current && !contextRef.current.contains(e.target as Node)) {
        setContextMenu(null);
      }
    };
    if (contextMenu) {
      document.addEventListener('mousedown', handler);
      return () => document.removeEventListener('mousedown', handler);
    }
  }, [contextMenu]);

  // ---------- Context menu ----------
  const handleContextMenu = useCallback((e: React.MouseEvent, stripId: string) => {
    e.preventDefault();
    setContextMenu({ x: e.clientX, y: e.clientY, stripId });
  }, []);

  // ---------- Move to zone ----------
  const moveToZone = useCallback(async (stripId: string, zone: ZoneId | null) => {
    setContextMenu(null);
    const zoneStrips = strips.filter((s) => s.strip_zone === zone);
    const maxOrder = zoneStrips.reduce((max, s) => Math.max(max, s.strip_order), -1);
    await fetch(`/api/plans-vol/${stripId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        action: 'update_strip',
        strip_zone: zone,
        strip_order: maxOrder + 1,
      }),
    });
    router.refresh();
  }, [strips, router]);

  // ---------- Transfer dialog ----------
  const openTransferDialog = useCallback((stripId: string) => {
    setContextMenu(null);
    setTransferDialog(stripId);
  }, []);

  // ---------- Drag & drop ----------
  const handleDragStart = useCallback((e: React.DragEvent, stripId: string) => {
    setDraggedStripId(stripId);
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', stripId);
    // Set a transparent drag image so it's less obtrusive
    if (e.dataTransfer.setDragImage) {
      const el = document.createElement('div');
      el.style.width = '200px';
      el.style.height = '30px';
      el.style.background = 'rgba(0,0,0,0.2)';
      el.style.borderRadius = '6px';
      el.style.position = 'absolute';
      el.style.top = '-999px';
      document.body.appendChild(el);
      e.dataTransfer.setDragImage(el, 100, 15);
      setTimeout(() => document.body.removeChild(el), 0);
    }
  }, []);

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
  }, []);

  const handleDragEnterZone = useCallback((zone: string) => {
    setDropTarget(zone);
  }, []);

  const handleDragLeaveZone = useCallback(() => {
    setDropTarget(null);
  }, []);

  const handleDragEnd = useCallback(() => {
    setDraggedStripId(null);
    setDropTarget(null);
  }, []);

  const handleDropOnZone = useCallback(async (e: React.DragEvent, zone: ZoneId | null) => {
    e.preventDefault();
    setDropTarget(null);
    const stripId = e.dataTransfer.getData('text/plain') || draggedStripId;
    if (!stripId) return;
    setDraggedStripId(null);
    await moveToZone(stripId, zone);
  }, [draggedStripId, moveToZone]);

  const handleDropOnStrip = useCallback(async (e: React.DragEvent, targetStripId: string, zone: ZoneId | null) => {
    e.preventDefault();
    e.stopPropagation();
    setDropTarget(null);
    const srcId = e.dataTransfer.getData('text/plain') || draggedStripId;
    if (!srcId || srcId === targetStripId) { setDraggedStripId(null); return; }

    const zoneStrips = strips
      .filter((s) => s.strip_zone === zone)
      .sort((a, b) => a.strip_order - b.strip_order);

    const targetIdx = zoneStrips.findIndex((s) => s.id === targetStripId);
    const reordered = zoneStrips.filter((s) => s.id !== srcId);
    const srcStrip = strips.find((s) => s.id === srcId);
    if (srcStrip) {
      reordered.splice(targetIdx >= 0 ? targetIdx : reordered.length, 0, { ...srcStrip, strip_zone: zone, strip_order: 0 });
    }

    const batch = reordered.map((s, i) => ({ id: s.id, strip_zone: zone, strip_order: i }));

    setDraggedStripId(null);
    await fetch(`/api/plans-vol/${srcId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'reorder_strips', strips: batch }),
    });
    router.refresh();
  }, [strips, draggedStripId, router]);

  const onRefresh = useCallback(() => router.refresh(), [router]);

  // ---------- Navigate to plan on click ----------
  const handleStripClick = useCallback((stripId: string) => {
    window.open(`/atc/plan/${stripId}`, '_blank');
  }, []);

  // ---------- Render a zone ----------
  const renderZone = (zone: ZoneId, zoneStrips: StripData[]) => {
    const isDropping = dropTarget === zone && draggedStripId;
    return (
      <div
        key={zone}
        className={`flex-1 min-w-[540px] border-2 rounded-lg flex flex-col transition-all ${ZONE_COLORS[zone]} ${isDropping ? 'ring-4 ring-sky-300 scale-[1.01]' : ''}`}
        onDragOver={handleDragOver}
        onDragEnter={() => handleDragEnterZone(zone)}
        onDragLeave={handleDragLeaveZone}
        onDrop={(e) => handleDropOnZone(e, zone)}
      >
        <div className={`px-3 py-2 text-sm font-bold uppercase tracking-wider ${ZONE_HEADER[zone]} rounded-t-md flex items-center justify-between`}>
          <span>{ZONE_LABELS[zone]}</span>
          <span className="text-xs font-normal opacity-70">{zoneStrips.length} vol(s)</span>
        </div>
        <div className="flex-1 p-2 space-y-2 overflow-y-auto max-h-[calc(100vh-300px)]">
          {zoneStrips.length === 0 ? (
            <div className={`text-center py-8 ${isDropping ? '' : ''}`}>
              <p className="text-slate-400 text-sm italic">
                {isDropping ? 'Déposer ici' : 'Aucun strip — glissez-en un ici'}
              </p>
            </div>
          ) : (
            zoneStrips.map((s) => (
              <div
                key={s.id}
                onDragOver={handleDragOver}
                onDrop={(e) => handleDropOnStrip(e, s.id, zone)}
                className={`transition-all ${draggedStripId === s.id ? 'opacity-30 scale-95' : ''}`}
              >
                <FlightStrip
                  strip={s}
                  onRefresh={onRefresh}
                  onContextMenu={handleContextMenu}
                  dragHandleProps={{
                    draggable: true,
                    onDragStart: (e) => handleDragStart(e, s.id),
                  }}
                />
              </div>
            ))
          )}
        </div>
      </div>
    );
  };

  return (
    <div className="flex flex-col gap-4 h-full">
      {/* Main zones - horizontal scroll if needed */}
      <div className="flex gap-3 flex-1 min-h-0 overflow-x-auto pb-1">
        {renderZone('sol', solStrips)}
        {renderZone('depart', departStrips)}
        {renderZone('arrivee', arriveeStrips)}
      </div>

      {/* Unassigned strips at bottom */}
      <div
        className={`border-2 rounded-lg transition-all ${
          dropTarget === 'unassigned' && draggedStripId
            ? 'border-sky-400 bg-sky-50/60 ring-4 ring-sky-300'
            : 'border-slate-300 bg-slate-50/60'
        }`}
        onDragOver={handleDragOver}
        onDragEnter={() => handleDragEnterZone('unassigned')}
        onDragLeave={handleDragLeaveZone}
        onDrop={(e) => handleDropOnZone(e, null)}
      >
        <div className="px-3 py-2 text-sm font-bold uppercase tracking-wider bg-slate-200 text-slate-700 rounded-t-md flex items-center justify-between">
          <span>Non assignés</span>
          <span className="text-xs font-normal opacity-70">{unassigned.length} vol(s)</span>
        </div>
        <div className="p-3 space-y-2 max-h-60 overflow-y-auto">
          {unassigned.length === 0 ? (
            <p className="text-slate-400 text-sm italic text-center py-3">
              Tous les strips sont assignés à une zone.
            </p>
          ) : (
            unassigned.map((s) => (
              <div
                key={s.id}
                className={`transition-all cursor-pointer ${draggedStripId === s.id ? 'opacity-30 scale-95' : 'hover:ring-2 hover:ring-sky-300 rounded-lg'}`}
                onClick={() => handleStripClick(s.id)}
                title="Cliquer pour ouvrir le plan de vol"
              >
                <FlightStrip
                  strip={s}
                  onRefresh={onRefresh}
                  onContextMenu={handleContextMenu}
                  dragHandleProps={{
                    draggable: true,
                    onDragStart: (e) => handleDragStart(e, s.id),
                  }}
                />
              </div>
            ))
          )}
        </div>
      </div>

      {/* Context menu (right-click) */}
      {contextMenu && (
        <div
          ref={contextRef}
          className="fixed z-50 bg-white border border-slate-300 rounded-xl shadow-2xl py-1.5 min-w-[200px]"
          style={{ left: contextMenu.x, top: contextMenu.y }}
        >
          <p className="px-4 py-1 text-[10px] text-slate-400 uppercase tracking-wider font-semibold">Déplacer vers</p>
          {(['sol', 'depart', 'arrivee'] as ZoneId[]).map((z) => (
            <button
              key={z}
              type="button"
              className="w-full text-left px-4 py-2 text-sm text-slate-700 hover:bg-slate-100 transition-colors"
              onClick={() => moveToZone(contextMenu.stripId, z)}
            >
              {ZONE_LABELS[z]}
            </button>
          ))}
          <button
            type="button"
            className="w-full text-left px-4 py-2 text-sm text-slate-500 hover:bg-slate-100 transition-colors"
            onClick={() => moveToZone(contextMenu.stripId, null)}
          >
            ↩ Non assigné
          </button>
          <hr className="my-1 border-slate-200" />
          <button
            type="button"
            className="w-full text-left px-4 py-2 text-sm text-sky-600 hover:bg-sky-50 font-medium transition-colors"
            onClick={() => openTransferDialog(contextMenu.stripId)}
          >
            Transférer le vol…
          </button>
          <button
            type="button"
            className="w-full text-left px-4 py-2 text-sm text-emerald-600 hover:bg-emerald-50 font-medium transition-colors"
            onClick={() => { setContextMenu(null); handleStripClick(contextMenu.stripId); }}
          >
            Ouvrir le plan
          </button>
          <hr className="my-1 border-slate-200" />
          <button
            type="button"
            className="w-full text-left px-4 py-2 text-sm text-slate-400 hover:bg-slate-100 transition-colors"
            onClick={() => setContextMenu(null)}
          >
            Annuler
          </button>
        </div>
      )}

      {/* onDragEnd to cleanup */}
      {draggedStripId && (
        <div className="fixed inset-0 z-40" onDragEnd={handleDragEnd} style={{ pointerEvents: 'none' }} />
      )}

      {/* Transfer dialog */}
      {transferDialog && (
        <TransferDialog planId={transferDialog} onClose={() => setTransferDialog(null)} />
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Transfer dialog                                                     */
/* ------------------------------------------------------------------ */
function TransferDialog({ planId, onClose }: { planId: string; onClose: () => void }) {
  const router = useRouter();
  const [aeroport, setAeroport] = useState('');
  const [position, setPosition] = useState('');
  const [loading, setLoading] = useState(false);
  const [autoSurv, setAutoSurv] = useState(false);

  const handleTransfer = async () => {
    setLoading(true);
    try {
      const body: Record<string, unknown> = { action: 'transferer' };
      if (autoSurv) {
        body.automonitoring = true;
      } else {
        body.aeroport = aeroport;
        body.position = position;
      }
      const res = await fetch(`/api/plans-vol/${planId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const d = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(d.error || 'Erreur');
      router.refresh();
      onClose();
    } catch (e) {
      alert(e instanceof Error ? e.message : 'Erreur');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50" onClick={onClose}>
      <div className="bg-white rounded-xl shadow-2xl p-6 w-96" onClick={(e) => e.stopPropagation()}>
        <h3 className="text-lg font-semibold text-slate-900 mb-4">Transférer le vol</h3>
        <div className="space-y-3">
          <div>
            <label className="text-sm text-slate-600">Aéroport</label>
            <input
              className="w-full border rounded-lg px-3 py-2 text-sm font-mono"
              placeholder="IRFD"
              value={aeroport}
              onChange={(e) => setAeroport(e.target.value.toUpperCase())}
              disabled={autoSurv}
            />
          </div>
          <div>
            <label className="text-sm text-slate-600">Position</label>
            <select
              className="w-full border rounded-lg px-3 py-2 text-sm"
              value={position}
              onChange={(e) => setPosition(e.target.value)}
              disabled={autoSurv}
            >
              <option value="">— Sélectionner —</option>
              {['Delivery', 'Clairance', 'Ground', 'Tower', 'APP', 'DEP', 'Center'].map((p) => (
                <option key={p} value={p}>{p}</option>
              ))}
            </select>
          </div>
          <label className="flex items-center gap-2 text-sm text-slate-700">
            <input type="checkbox" checked={autoSurv} onChange={(e) => setAutoSurv(e.target.checked)} />
            Autosurveillance
          </label>
        </div>
        <div className="flex gap-3 mt-5">
          <button
            type="button"
            className="flex-1 bg-sky-600 text-white rounded-lg py-2 text-sm font-medium hover:bg-sky-700 disabled:opacity-50"
            onClick={handleTransfer}
            disabled={loading || (!autoSurv && (!aeroport || !position))}
          >
            {loading ? '…' : 'Transférer'}
          </button>
          <button
            type="button"
            className="flex-1 bg-slate-200 text-slate-700 rounded-lg py-2 text-sm font-medium hover:bg-slate-300"
            onClick={onClose}
          >
            Annuler
          </button>
        </div>
      </div>
    </div>
  );
}
