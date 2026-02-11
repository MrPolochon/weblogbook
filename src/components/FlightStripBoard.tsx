'use client';

import { useState, useRef, useCallback, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import FlightStrip, { type StripData } from './FlightStrip';

type ZoneId = 'sol' | 'depart' | 'arrivee';

const ZONE_LABELS: Record<ZoneId, string> = {
  sol: 'Trafic au sol',
  depart: 'Trafic au départ',
  arrivee: "Trafic à l'arrivée",
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
  const [dragId, setDragId] = useState<string | null>(null);
  const [hoverZone, setHoverZone] = useState<string | null>(null);
  const ctxRef = useRef<HTMLDivElement>(null);

  const getZone = useCallback((zone: ZoneId | null) =>
    strips.filter((s) => s.strip_zone === zone).sort((a, b) => a.strip_order - b.strip_order),
  [strips]);

  const unassigned = getZone(null);
  const solStrips = getZone('sol');
  const departStrips = getZone('depart');
  const arriveeStrips = getZone('arrivee');

  // Close context menu on outside click
  useEffect(() => {
    if (!contextMenu) return;
    const handler = (e: MouseEvent) => {
      if (ctxRef.current && !ctxRef.current.contains(e.target as Node)) setContextMenu(null);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [contextMenu]);

  /* ======== Context menu ======== */
  const handleContextMenu = useCallback((e: React.MouseEvent, stripId: string) => {
    e.preventDefault();
    setContextMenu({ x: e.clientX, y: e.clientY, stripId });
  }, []);

  /* ======== Move to zone (API) ======== */
  const moveToZone = useCallback(async (stripId: string, zone: ZoneId | null) => {
    setContextMenu(null);
    const zoneStrips = strips.filter((s) => s.strip_zone === zone);
    const maxOrder = zoneStrips.reduce((max, s) => Math.max(max, s.strip_order), -1);
    await fetch(`/api/plans-vol/${stripId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'update_strip', strip_zone: zone, strip_order: maxOrder + 1 }),
    });
    router.refresh();
  }, [strips, router]);

  const openTransferDialog = useCallback((stripId: string) => {
    setContextMenu(null);
    setTransferDialog(stripId);
  }, []);

  const setAutomonitoring = useCallback(async (stripId: string) => {
    setContextMenu(null);
    try {
      const res = await fetch(`/api/plans-vol/${stripId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'transferer', automonitoring: true }),
      });
      const d = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(d.error || 'Erreur');
      router.refresh();
    } catch (e) { alert(e instanceof Error ? e.message : 'Erreur'); }
  }, [router]);

  /* ======== DRAG & DROP ======== */
  const onDragStart = useCallback((e: React.DragEvent, id: string) => {
    setDragId(id);
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', id);
    // Mini ghost
    const ghost = document.createElement('div');
    ghost.textContent = strips.find((s) => s.id === id)?.numero_vol || '';
    ghost.style.cssText = 'position:fixed;top:-999px;left:-999px;padding:4px 12px;background:#0ea5e9;color:#fff;border-radius:6px;font:bold 12px monospace;';
    document.body.appendChild(ghost);
    e.dataTransfer.setDragImage(ghost, 40, 14);
    requestAnimationFrame(() => document.body.removeChild(ghost));
  }, [strips]);

  const onDragEnd = useCallback(() => {
    setDragId(null);
    setHoverZone(null);
  }, []);

  const onDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
  }, []);

  const onDropOnZone = useCallback(async (e: React.DragEvent, zone: ZoneId | null) => {
    e.preventDefault();
    setHoverZone(null);
    const id = e.dataTransfer.getData('text/plain') || dragId;
    if (!id) return;
    setDragId(null);
    await moveToZone(id, zone);
  }, [dragId, moveToZone]);

  const onDropOnStrip = useCallback(async (e: React.DragEvent, targetId: string, zone: ZoneId | null) => {
    e.preventDefault();
    e.stopPropagation();
    setHoverZone(null);
    const srcId = e.dataTransfer.getData('text/plain') || dragId;
    if (!srcId || srcId === targetId) { setDragId(null); return; }

    const zoneStrips = strips.filter((s) => s.strip_zone === zone).sort((a, b) => a.strip_order - b.strip_order);
    const targetIdx = zoneStrips.findIndex((s) => s.id === targetId);
    const reordered = zoneStrips.filter((s) => s.id !== srcId);
    const srcStrip = strips.find((s) => s.id === srcId);
    if (srcStrip) reordered.splice(targetIdx >= 0 ? targetIdx : reordered.length, 0, { ...srcStrip, strip_zone: zone, strip_order: 0 });
    const batch = reordered.map((s, i) => ({ id: s.id, strip_zone: zone, strip_order: i }));

    setDragId(null);
    await fetch(`/api/plans-vol/${srcId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'reorder_strips', strips: batch }),
    });
    router.refresh();
  }, [strips, dragId, router]);

  const refresh = useCallback(() => router.refresh(), [router]);

  /* ======== Make dragHandleProps for each strip ======== */
  const makeDragProps = (id: string) => ({
    draggable: true as const,
    onDragStart: (e: React.DragEvent) => onDragStart(e, id),
    onDragEnd,
  });

  /* ======== Render a zone ======== */
  const renderZone = (zone: ZoneId, zs: StripData[]) => {
    const dropping = hoverZone === zone && !!dragId;
    return (
      <div
        key={zone}
        className={`flex-1 min-w-[480px] border-2 rounded-lg flex flex-col transition-all ${ZONE_COLORS[zone]} ${dropping ? 'ring-4 ring-sky-300 scale-[1.005]' : ''}`}
        onDragOver={onDragOver}
        onDragEnter={() => setHoverZone(zone)}
        onDragLeave={() => setHoverZone(null)}
        onDrop={(e) => onDropOnZone(e, zone)}
      >
        <div className={`px-3 py-1.5 text-sm font-bold uppercase tracking-wider ${ZONE_HEADER[zone]} rounded-t-md flex items-center justify-between`}>
          <span>{ZONE_LABELS[zone]}</span>
          <span className="text-xs font-normal opacity-70">{zs.length} vol(s)</span>
        </div>
        <div className="flex-1 p-2 space-y-2 overflow-y-auto max-h-[calc(100vh-320px)]">
          {zs.length === 0 ? (
            <p className="text-slate-400 text-sm italic text-center py-6">{dropping ? 'Déposer ici' : 'Glissez un strip ici'}</p>
          ) : zs.map((s) => (
            <div key={s.id} onDragOver={onDragOver} onDrop={(e) => onDropOnStrip(e, s.id, zone)} className={`transition-opacity ${dragId === s.id ? 'opacity-30' : ''}`}>
              <FlightStrip strip={s} onRefresh={refresh} onContextMenu={handleContextMenu} dragHandleProps={makeDragProps(s.id)} />
            </div>
          ))}
        </div>
      </div>
    );
  };

  return (
    <div className="flex flex-col gap-4 h-full">
      {/* 3 zones */}
      <div className="flex gap-3 flex-1 min-h-0 overflow-x-auto pb-1">
        {renderZone('sol', solStrips)}
        {renderZone('depart', departStrips)}
        {renderZone('arrivee', arriveeStrips)}
      </div>

      {/* Unassigned */}
      <div
        className={`border-2 rounded-lg transition-all ${hoverZone === 'unassigned' && dragId ? 'border-sky-400 bg-sky-50/60 ring-4 ring-sky-300' : 'border-slate-300 bg-slate-50/60'}`}
        onDragOver={onDragOver}
        onDragEnter={() => setHoverZone('unassigned')}
        onDragLeave={() => setHoverZone(null)}
        onDrop={(e) => onDropOnZone(e, null)}
      >
        <div className="px-3 py-1.5 text-sm font-bold uppercase tracking-wider bg-slate-200 text-slate-700 rounded-t-md flex items-center justify-between">
          <span>Non assignés</span>
          <span className="text-xs font-normal opacity-70">{unassigned.length} vol(s)</span>
        </div>
        <div className="p-2 space-y-2 max-h-60 overflow-y-auto">
          {unassigned.length === 0 ? (
            <p className="text-slate-400 text-sm italic text-center py-3">Tous les strips sont assignés.</p>
          ) : unassigned.map((s) => (
            <div key={s.id} onDragOver={onDragOver} onDrop={(e) => onDropOnStrip(e, s.id, null)} className={`transition-opacity ${dragId === s.id ? 'opacity-30' : ''}`}>
              <FlightStrip strip={s} onRefresh={refresh} onContextMenu={handleContextMenu} dragHandleProps={makeDragProps(s.id)} />
            </div>
          ))}
        </div>
      </div>

      {/* Context menu */}
      {contextMenu && (
        <div ref={ctxRef} className="fixed z-50 bg-white border border-slate-300 rounded-xl shadow-2xl py-1 min-w-[190px]" style={{ left: contextMenu.x, top: contextMenu.y }}>
          <p className="px-3 py-1 text-[10px] text-slate-400 uppercase tracking-wider font-semibold">Déplacer vers</p>
          {(['sol', 'depart', 'arrivee'] as ZoneId[]).map((z) => (
            <button key={z} type="button" className="w-full text-left px-3 py-1.5 text-sm text-slate-700 hover:bg-slate-100" onClick={() => moveToZone(contextMenu.stripId, z)}>{ZONE_LABELS[z]}</button>
          ))}
          <button type="button" className="w-full text-left px-3 py-1.5 text-sm text-slate-500 hover:bg-slate-100" onClick={() => moveToZone(contextMenu.stripId, null)}>↩ Non assigné</button>
          <hr className="my-1 border-slate-200" />
          <button type="button" className="w-full text-left px-3 py-1.5 text-sm text-sky-600 hover:bg-sky-50 font-medium" onClick={() => openTransferDialog(contextMenu.stripId)}>Transférer…</button>
          <button type="button" className="w-full text-left px-3 py-1.5 text-sm text-purple-600 hover:bg-purple-50 font-medium" onClick={() => setAutomonitoring(contextMenu.stripId)}>Autosurveillance</button>
          <hr className="my-1 border-slate-200" />
          <button type="button" className="w-full text-left px-3 py-1.5 text-sm text-slate-400 hover:bg-slate-100" onClick={() => setContextMenu(null)}>Annuler</button>
        </div>
      )}

      {/* Transfer dialog */}
      {transferDialog && <TransferDialog planId={transferDialog} onClose={() => setTransferDialog(null)} />}
    </div>
  );
}

/* ============================================================ */
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
      if (autoSurv) body.automonitoring = true;
      else { body.aeroport = aeroport; body.position = position; }
      const res = await fetch(`/api/plans-vol/${planId}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
      const d = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(d.error || 'Erreur');
      router.refresh(); onClose();
    } catch (e) { alert(e instanceof Error ? e.message : 'Erreur'); }
    finally { setLoading(false); }
  };

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50" onClick={onClose}>
      <div className="bg-white rounded-xl shadow-2xl p-6 w-96" onClick={(e) => e.stopPropagation()}>
        <h3 className="text-lg font-semibold text-slate-900 mb-4">Transférer le vol</h3>
        <div className="space-y-3">
          <div>
            <label className="text-sm text-slate-600">Aéroport</label>
            <input className="w-full border rounded-lg px-3 py-2 text-sm font-mono" placeholder="IRFD" value={aeroport} onChange={(e) => setAeroport(e.target.value.toUpperCase())} disabled={autoSurv} />
          </div>
          <div>
            <label className="text-sm text-slate-600">Position</label>
            <select className="w-full border rounded-lg px-3 py-2 text-sm" value={position} onChange={(e) => setPosition(e.target.value)} disabled={autoSurv}>
              <option value="">— Sélectionner —</option>
              {['Delivery','Clairance','Ground','Tower','APP','DEP','Center'].map((p) => <option key={p} value={p}>{p}</option>)}
            </select>
          </div>
          <label className="flex items-center gap-2 text-sm text-slate-700">
            <input type="checkbox" checked={autoSurv} onChange={(e) => setAutoSurv(e.target.checked)} /> Autosurveillance
          </label>
        </div>
        <div className="flex gap-3 mt-5">
          <button type="button" className="flex-1 bg-sky-600 text-white rounded-lg py-2 text-sm font-medium hover:bg-sky-700 disabled:opacity-50" onClick={handleTransfer} disabled={loading || (!autoSurv && (!aeroport || !position))}>{loading ? '…' : 'Transférer'}</button>
          <button type="button" className="flex-1 bg-slate-200 text-slate-700 rounded-lg py-2 text-sm font-medium hover:bg-slate-300" onClick={onClose}>Annuler</button>
        </div>
      </div>
    </div>
  );
}
