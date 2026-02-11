'use client';

import { useState, useRef, useCallback, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import FlightStrip, { type StripData } from './FlightStrip';
import { X } from 'lucide-react';

type ZoneId = 'sol' | 'depart' | 'arrivee';
type ZoneOrNull = ZoneId | null;

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
  const [transferDialog, setTransferDialog] = useState<string | null>(null);

  // ═══════════════════════════════════════════════
  //  PICK & PLACE — clic droit prend, clic gauche pose
  // ═══════════════════════════════════════════════
  const [pickedId, setPickedId] = useState<string | null>(null);

  // Cancel pick on Escape
  useEffect(() => {
    if (!pickedId) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setPickedId(null);
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [pickedId]);

  // Cancel pick on right-click anywhere (when already picking)
  useEffect(() => {
    if (!pickedId) return;
    const handler = (e: MouseEvent) => {
      if (e.button === 2) {
        e.preventDefault();
        setPickedId(null);
      }
    };
    window.addEventListener('mousedown', handler);
    return () => window.removeEventListener('mousedown', handler);
  }, [pickedId]);

  const getZone = useCallback((zone: ZoneOrNull) =>
    strips.filter((s) => s.strip_zone === zone).sort((a, b) => a.strip_order - b.strip_order),
  [strips]);

  const unassigned = getZone(null);
  const solStrips = getZone('sol');
  const departStrips = getZone('depart');
  const arriveeStrips = getZone('arrivee');

  /* ═══ Right-click on a strip = pick it ═══ */
  const handleStripRightClick = useCallback((e: React.MouseEvent, stripId: string) => {
    e.preventDefault();
    // If already picking this one, cancel
    if (pickedId === stripId) {
      setPickedId(null);
      return;
    }
    setPickedId(stripId);
  }, [pickedId]);

  /* ═══ Double right-click = transfer dialog ═══ */
  // We handle this by tracking right-click timing
  const lastRightClick = useRef<{ id: string; time: number } | null>(null);
  const handleStripRightClickWithDouble = useCallback((e: React.MouseEvent, stripId: string) => {
    e.preventDefault();
    const now = Date.now();
    if (lastRightClick.current && lastRightClick.current.id === stripId && now - lastRightClick.current.time < 400) {
      // Double right-click → transfer
      setPickedId(null);
      setTransferDialog(stripId);
      lastRightClick.current = null;
      return;
    }
    lastRightClick.current = { id: stripId, time: now };
    // Single right-click → pick
    if (pickedId === stripId) {
      setPickedId(null);
    } else {
      setPickedId(stripId);
    }
  }, [pickedId]);

  /* ═══ Place strip in a zone (at the end) ═══ */
  const placeInZone = useCallback(async (zone: ZoneOrNull) => {
    if (!pickedId) return;
    const stripId = pickedId;
    setPickedId(null);
    const zoneStrips = strips.filter((s) => s.strip_zone === zone);
    const maxOrder = zoneStrips.reduce((max, s) => Math.max(max, s.strip_order), -1);
    await fetch(`/api/plans-vol/${stripId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'update_strip', strip_zone: zone, strip_order: maxOrder + 1 }),
    });
    router.refresh();
  }, [pickedId, strips, router]);

  /* ═══ Place strip before/after another strip ═══ */
  const placeNearStrip = useCallback(async (targetId: string, zone: ZoneOrNull, position: 'before' | 'after') => {
    if (!pickedId || pickedId === targetId) { setPickedId(null); return; }
    const stripId = pickedId;
    setPickedId(null);

    const zoneStrips = strips.filter((s) => s.strip_zone === zone).sort((a, b) => a.strip_order - b.strip_order);
    const targetIdx = zoneStrips.findIndex((s) => s.id === targetId);
    const reordered = zoneStrips.filter((s) => s.id !== stripId);
    const srcStrip = strips.find((s) => s.id === stripId);
    if (!srcStrip) return;

    const insertIdx = position === 'before'
      ? (targetIdx >= 0 ? reordered.findIndex((s) => s.id === targetId) : reordered.length)
      : (targetIdx >= 0 ? reordered.findIndex((s) => s.id === targetId) + 1 : reordered.length);

    reordered.splice(insertIdx, 0, { ...srcStrip, strip_zone: zone, strip_order: 0 });
    const batch = reordered.map((s, i) => ({ id: s.id, strip_zone: zone, strip_order: i }));

    await fetch(`/api/plans-vol/${stripId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'reorder_strips', strips: batch }),
    });
    router.refresh();
  }, [pickedId, strips, router]);

  /* ═══ Click on a strip wrapper → place picked strip there ═══ */
  const handleStripAreaClick = useCallback((e: React.MouseEvent, targetId: string, zone: ZoneOrNull) => {
    if (!pickedId || pickedId === targetId) return;
    e.stopPropagation();
    // Determine if mouse is on top or bottom half of the target
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
    const mouseY = e.clientY - rect.top;
    const isTopHalf = mouseY < rect.height / 2;
    placeNearStrip(targetId, zone, isTopHalf ? 'before' : 'after');
  }, [pickedId, placeNearStrip]);

  /* ═══ Click on zone empty area → place at end ═══ */
  const handleZoneClick = useCallback((zone: ZoneOrNull) => {
    if (!pickedId) return;
    placeInZone(zone);
  }, [pickedId, placeInZone]);

  const refresh = useCallback(() => router.refresh(), [router]);
  const pickedStrip = pickedId ? strips.find((s) => s.id === pickedId) : null;

  /* ═══ Drag handle props (grip icon, kept as backup) ═══ */
  const makeDragProps = (id: string) => ({
    draggable: true as const,
    onDragStart: (e: React.DragEvent) => {
      setPickedId(null); // Cancel pick mode if dragging
      e.dataTransfer.effectAllowed = 'move';
      e.dataTransfer.setData('text/plain', id);
    },
    onDragEnd: () => {},
  });

  /* ═══ Render a zone ═══ */
  const renderZone = (zone: ZoneId, zs: StripData[]) => {
    const canDrop = !!pickedId;
    return (
      <div
        key={zone}
        className={`flex-1 min-w-[480px] border-2 rounded-lg flex flex-col transition-all ${ZONE_COLORS[zone]} ${canDrop ? 'ring-2 ring-sky-300 ring-dashed' : ''}`}
        onClick={() => handleZoneClick(zone)}
      >
        <div className={`px-3 py-1.5 text-sm font-bold uppercase tracking-wider ${ZONE_HEADER[zone]} rounded-t-md flex items-center justify-between`}>
          <span>{ZONE_LABELS[zone]}</span>
          <div className="flex items-center gap-2">
            <span className="text-xs font-normal opacity-70">{zs.length} vol(s)</span>
            {canDrop && <span className="text-xs font-semibold bg-white/60 rounded px-1.5 py-0.5 animate-pulse">Cliquer pour poser</span>}
          </div>
        </div>
        <div className="flex-1 p-2 space-y-1 overflow-y-auto max-h-[calc(100vh-320px)]">
          {zs.length === 0 ? (
            <div className={`text-center py-6 rounded-lg border-2 border-dashed ${canDrop ? 'border-sky-400 bg-sky-50' : 'border-transparent'}`}>
              <p className="text-slate-400 text-sm italic">{canDrop ? 'Cliquer ici pour poser le strip' : 'Aucun strip'}</p>
            </div>
          ) : zs.map((s) => (
            <div
              key={s.id}
              className={`transition-all relative ${pickedId === s.id ? 'opacity-40 scale-[0.97]' : ''} ${canDrop && pickedId !== s.id ? 'cursor-pointer' : ''}`}
              onClick={(e) => handleStripAreaClick(e, s.id, zone)}
            >
              {/* Drop indicator line when hovering */}
              {canDrop && pickedId !== s.id && (
                <div className="absolute inset-x-0 top-0 h-1 bg-sky-400 rounded opacity-0 hover:opacity-100 transition-opacity z-20" />
              )}
              <FlightStrip strip={s} onRefresh={refresh} onContextMenu={handleStripRightClickWithDouble} dragHandleProps={makeDragProps(s.id)} />
            </div>
          ))}
        </div>
      </div>
    );
  };

  return (
    <div className="flex flex-col gap-4 h-full">
      {/* Pick mode banner */}
      {pickedStrip && (
        <div className="bg-sky-600 text-white px-4 py-2 rounded-lg flex items-center justify-between shadow-lg animate-in">
          <span className="text-sm font-medium">
            Strip <strong className="font-mono">{pickedStrip.numero_vol}</strong> sélectionné — <span className="opacity-80">cliquez sur une zone ou à côté d&apos;un strip pour le poser. Clic droit ou Échap pour annuler.</span>
          </span>
          <button type="button" onClick={() => setPickedId(null)} className="p-1 hover:bg-white/20 rounded transition-colors" title="Annuler">
            <X className="h-4 w-4" />
          </button>
        </div>
      )}

      {/* 3 zones */}
      <div className="flex gap-3 flex-1 min-h-0 overflow-x-auto pb-1">
        {renderZone('sol', solStrips)}
        {renderZone('depart', departStrips)}
        {renderZone('arrivee', arriveeStrips)}
      </div>

      {/* Unassigned */}
      <div
        className={`border-2 rounded-lg transition-all ${pickedId ? 'ring-2 ring-sky-300 ring-dashed border-slate-400' : 'border-slate-300'} bg-slate-50/60`}
        onClick={() => handleZoneClick(null)}
      >
        <div className="px-3 py-1.5 text-sm font-bold uppercase tracking-wider bg-slate-200 text-slate-700 rounded-t-md flex items-center justify-between">
          <span>Non assignés</span>
          <div className="flex items-center gap-2">
            <span className="text-xs font-normal opacity-70">{unassigned.length} vol(s)</span>
            {pickedId && <span className="text-xs font-semibold bg-white/60 rounded px-1.5 py-0.5 animate-pulse">Cliquer pour poser</span>}
          </div>
        </div>
        <div className="p-2 space-y-1 max-h-60 overflow-y-auto">
          {unassigned.length === 0 ? (
            <div className={`text-center py-3 rounded-lg border-2 border-dashed ${pickedId ? 'border-sky-400 bg-sky-50' : 'border-transparent'}`}>
              <p className="text-slate-400 text-sm italic">{pickedId ? 'Cliquer ici pour poser' : 'Tous assignés.'}</p>
            </div>
          ) : unassigned.map((s) => (
            <div
              key={s.id}
              className={`transition-all relative ${pickedId === s.id ? 'opacity-40 scale-[0.97]' : ''} ${pickedId && pickedId !== s.id ? 'cursor-pointer' : ''}`}
              onClick={(e) => handleStripAreaClick(e, s.id, null)}
            >
              <FlightStrip strip={s} onRefresh={refresh} onContextMenu={handleStripRightClickWithDouble} dragHandleProps={makeDragProps(s.id)} />
            </div>
          ))}
        </div>
      </div>

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
