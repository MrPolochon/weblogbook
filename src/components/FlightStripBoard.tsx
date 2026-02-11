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
  sol: 'border-amber-400 bg-amber-50/50',
  depart: 'border-sky-400 bg-sky-50/50',
  arrivee: 'border-emerald-400 bg-emerald-50/50',
};

const ZONE_HEADER: Record<ZoneId, string> = {
  sol: 'bg-amber-100 text-amber-800',
  depart: 'bg-sky-100 text-sky-800',
  arrivee: 'bg-emerald-100 text-emerald-800',
};

export default function FlightStripBoard({ strips }: { strips: StripData[] }) {
  const router = useRouter();
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number; stripId: string } | null>(null);
  const [transferDialog, setTransferDialog] = useState<string | null>(null);
  const [draggedStripId, setDraggedStripId] = useState<string | null>(null);
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

  const handleContextMenu = useCallback((e: React.MouseEvent, stripId: string) => {
    e.preventDefault();
    setContextMenu({ x: e.clientX, y: e.clientY, stripId });
  }, []);

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

  const openTransferDialog = useCallback((stripId: string) => {
    setContextMenu(null);
    setTransferDialog(stripId);
  }, []);

  // Drag & drop between strips for reordering
  const handleDragStart = useCallback((e: React.DragEvent, stripId: string) => {
    setDraggedStripId(stripId);
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', stripId);
  }, []);

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
  }, []);

  const handleDropOnZone = useCallback(async (e: React.DragEvent, zone: ZoneId | null) => {
    e.preventDefault();
    const stripId = e.dataTransfer.getData('text/plain') || draggedStripId;
    if (!stripId) return;
    setDraggedStripId(null);
    await moveToZone(stripId, zone);
  }, [draggedStripId, moveToZone]);

  const handleDropOnStrip = useCallback(async (e: React.DragEvent, targetStripId: string, zone: ZoneId | null) => {
    e.preventDefault();
    e.stopPropagation();
    const srcId = e.dataTransfer.getData('text/plain') || draggedStripId;
    if (!srcId || srcId === targetStripId) { setDraggedStripId(null); return; }

    const zoneStrips = strips
      .filter((s) => s.strip_zone === zone)
      .sort((a, b) => a.strip_order - b.strip_order);

    const targetIdx = zoneStrips.findIndex((s) => s.id === targetStripId);
    const reordered = zoneStrips.filter((s) => s.id !== srcId);
    const srcStrip = strips.find((s) => s.id === srcId);
    if (srcStrip) {
      reordered.splice(targetIdx, 0, { ...srcStrip, strip_zone: zone, strip_order: 0 });
    }

    const batch = reordered.map((s, i) => ({ id: s.id, strip_zone: zone, strip_order: i }));
    // also add the source strip if it was from another zone
    if (!zoneStrips.find((s) => s.id === srcId)) {
      // Already handled in splice above
    }

    setDraggedStripId(null);
    await fetch(`/api/plans-vol/${srcId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'reorder_strips', strips: batch }),
    });
    router.refresh();
  }, [strips, draggedStripId, router]);

  const onRefresh = useCallback(() => router.refresh(), [router]);

  const renderZone = (zone: ZoneId, zoneStrips: StripData[]) => (
    <div
      key={zone}
      className={`flex-1 min-w-[350px] border-2 rounded-lg ${ZONE_COLORS[zone]} flex flex-col`}
      onDragOver={handleDragOver}
      onDrop={(e) => handleDropOnZone(e, zone)}
    >
      <div className={`px-3 py-1.5 text-xs font-bold uppercase tracking-wider ${ZONE_HEADER[zone]} rounded-t-md`}>
        {ZONE_LABELS[zone]} ({zoneStrips.length})
      </div>
      <div className="flex-1 p-2 space-y-1.5 overflow-y-auto max-h-[calc(100vh-280px)]">
        {zoneStrips.length === 0 ? (
          <p className="text-slate-400 text-xs text-center py-4 italic">Aucun strip</p>
        ) : (
          zoneStrips.map((s) => (
            <div
              key={s.id}
              draggable
              onDragStart={(e) => handleDragStart(e, s.id)}
              onDragOver={handleDragOver}
              onDrop={(e) => handleDropOnStrip(e, s.id, zone)}
              className={`transition-opacity ${draggedStripId === s.id ? 'opacity-30' : ''}`}
            >
              <FlightStrip strip={s} onRefresh={onRefresh} onContextMenu={handleContextMenu} />
            </div>
          ))
        )}
      </div>
    </div>
  );

  return (
    <div className="flex flex-col gap-3 h-full">
      {/* Main zones */}
      <div className="flex gap-3 flex-1 min-h-0">
        {renderZone('sol', solStrips)}
        {renderZone('depart', departStrips)}
        {renderZone('arrivee', arriveeStrips)}
      </div>

      {/* Unassigned strips at bottom */}
      <div
        className="border-2 border-slate-300 bg-slate-50/50 rounded-lg"
        onDragOver={handleDragOver}
        onDrop={(e) => handleDropOnZone(e, null)}
      >
        <div className="px-3 py-1 text-xs font-bold uppercase tracking-wider bg-slate-200 text-slate-700 rounded-t-md">
          Non assignés ({unassigned.length})
        </div>
        <div className="p-2 flex flex-wrap gap-1.5 max-h-48 overflow-y-auto">
          {unassigned.length === 0 ? (
            <p className="text-slate-400 text-xs italic">Tous les strips sont assignés à une zone.</p>
          ) : (
            unassigned.map((s) => (
              <div
                key={s.id}
                draggable
                onDragStart={(e) => handleDragStart(e, s.id)}
                className={`w-[490px] transition-opacity ${draggedStripId === s.id ? 'opacity-30' : ''}`}
              >
                <FlightStrip strip={s} onRefresh={onRefresh} onContextMenu={handleContextMenu} />
              </div>
            ))
          )}
        </div>
      </div>

      {/* Context menu */}
      {contextMenu && (
        <div
          ref={contextRef}
          className="fixed z-50 bg-white border border-slate-300 rounded-lg shadow-xl py-1 min-w-[180px]"
          style={{ left: contextMenu.x, top: contextMenu.y }}
        >
          <p className="px-3 py-1 text-[10px] text-slate-400 uppercase tracking-wider">Déplacer vers</p>
          {(['sol', 'depart', 'arrivee'] as ZoneId[]).map((z) => (
            <button
              key={z}
              type="button"
              className="w-full text-left px-3 py-1.5 text-sm text-slate-700 hover:bg-slate-100"
              onClick={() => moveToZone(contextMenu.stripId, z)}
            >
              {ZONE_LABELS[z]}
            </button>
          ))}
          <button
            type="button"
            className="w-full text-left px-3 py-1.5 text-sm text-slate-500 hover:bg-slate-100"
            onClick={() => moveToZone(contextMenu.stripId, null)}
          >
            Non assigné
          </button>
          <hr className="my-1 border-slate-200" />
          <button
            type="button"
            className="w-full text-left px-3 py-1.5 text-sm text-sky-600 hover:bg-sky-50"
            onClick={() => openTransferDialog(contextMenu.stripId)}
          >
            Transférer le vol...
          </button>
          <hr className="my-1 border-slate-200" />
          <button
            type="button"
            className="w-full text-left px-3 py-1.5 text-sm text-slate-400 hover:bg-slate-100"
            onClick={() => setContextMenu(null)}
          >
            Annuler
          </button>
        </div>
      )}

      {/* Transfer dialog (double right-click) */}
      {transferDialog && (
        <TransferDialog planId={transferDialog} onClose={() => setTransferDialog(null)} />
      )}
    </div>
  );
}

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
            {loading ? '...' : 'Transférer'}
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
