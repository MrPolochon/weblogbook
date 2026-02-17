'use client';

import { useState, useRef, useCallback, useEffect, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import FlightStrip, { type StripData } from './FlightStrip';
import { X } from 'lucide-react';
import { useAtcTheme } from '@/contexts/AtcThemeContext';
import { AEROPORTS_PTFS } from '@/lib/aeroports-ptfs';

type ZoneId = 'sol' | 'depart' | 'arrivee';
type ZoneOrNull = ZoneId | null;

const ZONE_LABELS: Record<ZoneId, string> = {
  sol: 'Trafic au sol',
  depart: 'Trafic au départ',
  arrivee: "Trafic à l'arrivée",
};
const ZONE_COLORS_LIGHT: Record<ZoneId, string> = {
  sol: 'border-amber-400 bg-amber-50/60',
  depart: 'border-sky-400 bg-sky-50/60',
  arrivee: 'border-emerald-400 bg-emerald-50/60',
};
const ZONE_COLORS_DARK: Record<ZoneId, string> = {
  sol: 'border-amber-600 bg-amber-950/40',
  depart: 'border-sky-600 bg-sky-950/40',
  arrivee: 'border-emerald-600 bg-emerald-950/40',
};
const ZONE_HEADER_LIGHT: Record<ZoneId, string> = {
  sol: 'bg-amber-200 text-amber-900',
  depart: 'bg-sky-200 text-sky-900',
  arrivee: 'bg-emerald-200 text-emerald-900',
};
const ZONE_HEADER_DARK: Record<ZoneId, string> = {
  sol: 'bg-amber-800 text-amber-100',
  depart: 'bg-sky-800 text-sky-100',
  arrivee: 'bg-emerald-800 text-emerald-100',
};

export default function FlightStripBoard({ strips }: { strips: StripData[] }) {
  const router = useRouter();
  const [, startTransition] = useTransition();
  const { theme } = useAtcTheme();
  const isDark = theme === 'dark';
  const [transferDialog, setTransferDialog] = useState<string | null>(null);

  // ═══════════════════════════════════════════════
  //  PICK & PLACE — clic droit prend, clic gauche pose
  // ═══════════════════════════════════════════════
  const [pickedId, setPickedId] = useState<string | null>(null);
  const [cursorPos, setCursorPos] = useState({ x: 0, y: 0 });
  const [isDragging, setIsDragging] = useState(false);

  // Track cursor position when picking
  useEffect(() => {
    if (!pickedId) {
      setIsDragging(false);
      return;
    }
    
    setIsDragging(true);
    
    const handleMouseMove = (e: MouseEvent) => {
      setCursorPos({ x: e.clientX, y: e.clientY });
    };
    
    window.addEventListener('mousemove', handleMouseMove);
    return () => window.removeEventListener('mousemove', handleMouseMove);
  }, [pickedId]);

  // Cancel pick on Escape
  useEffect(() => {
    if (!pickedId) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setPickedId(null);
        setIsDragging(false);
      }
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
        setIsDragging(false);
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
    setIsDragging(false);
    const zoneStrips = strips.filter((s) => s.strip_zone === zone);
    const maxOrder = zoneStrips.reduce((max, s) => Math.max(max, s.strip_order), -1);
    await fetch(`/api/plans-vol/${stripId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'update_strip', strip_zone: zone, strip_order: maxOrder + 1 }),
    });
    startTransition(() => router.refresh());
  }, [pickedId, strips, router]);

  /* ═══ Place strip before/after another strip ═══ */
  const placeNearStrip = useCallback(async (targetId: string, zone: ZoneOrNull, position: 'before' | 'after') => {
    if (!pickedId || pickedId === targetId) { setPickedId(null); setIsDragging(false); return; }
    const stripId = pickedId;
    setPickedId(null);
    setIsDragging(false);

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
    startTransition(() => router.refresh());
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
    const ZONE_COLORS = isDark ? ZONE_COLORS_DARK : ZONE_COLORS_LIGHT;
    const ZONE_HEADER = isDark ? ZONE_HEADER_DARK : ZONE_HEADER_LIGHT;
    
    return (
      <div
        key={zone}
        className={`flex-1 min-w-[480px] border-2 rounded-lg flex flex-col transition-all ${ZONE_COLORS[zone]} ${canDrop ? (isDark ? 'ring-2 ring-sky-500 ring-dashed' : 'ring-2 ring-sky-300 ring-dashed') : ''}`}
        onClick={() => handleZoneClick(zone)}
      >
        <div className={`px-3 py-2 text-base font-bold uppercase tracking-wider ${ZONE_HEADER[zone]} rounded-t-md flex items-center justify-between`}>
          <span>{ZONE_LABELS[zone]}</span>
          <div className="flex items-center gap-2">
            <span className={`text-sm font-semibold ${isDark ? 'text-slate-200' : 'opacity-80'}`}>{zs.length} vol(s)</span>
            {canDrop && <span className={`text-xs font-bold rounded px-2 py-1 animate-pulse shadow-sm ${isDark ? 'bg-slate-700 text-slate-100' : 'bg-white/70'}`}>Cliquer pour poser</span>}
          </div>
        </div>
        <div className="flex-1 p-2 space-y-1 overflow-y-auto max-h-[calc(100vh-320px)]">
          {zs.length === 0 ? (
            <div className={`text-center py-8 rounded-lg border-2 border-dashed ${canDrop ? (isDark ? 'border-sky-500 bg-sky-950/50' : 'border-sky-400 bg-sky-50') : 'border-transparent'}`}>
              <p className={`text-base font-semibold italic ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>{canDrop ? 'Cliquer ici pour poser le strip' : 'Aucun strip'}</p>
            </div>
          ) : zs.map((s) => (
            <div
              key={s.id}
              className={`transition-all duration-300 ease-out relative ${pickedId === s.id ? 'opacity-0 scale-75' : 'opacity-100 scale-100'} ${canDrop && pickedId !== s.id ? 'cursor-pointer hover:scale-[1.02]' : ''}`}
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
        <div className={`px-5 py-3 rounded-lg flex items-center justify-between shadow-xl animate-in ${isDark ? 'bg-sky-700 text-slate-100' : 'bg-sky-600 text-white'}`}>
          <span className="text-base font-semibold">
            Strip <strong className="font-mono text-lg">{pickedStrip.numero_vol}</strong> sélectionné — <span className={isDark ? 'text-slate-200' : 'opacity-90'}>cliquez sur une zone ou à côté d&apos;un strip pour le poser. Clic droit ou Échap pour annuler.</span>
          </span>
          <button type="button" onClick={() => setPickedId(null)} className="p-1.5 hover:bg-white/20 rounded transition-colors" title="Annuler">
            <X className="h-5 w-5" />
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
        className={`border-2 rounded-lg transition-all ${pickedId ? (isDark ? 'ring-2 ring-sky-500 ring-dashed border-slate-600' : 'ring-2 ring-sky-300 ring-dashed border-slate-400') : (isDark ? 'border-slate-600' : 'border-slate-300')} ${isDark ? 'bg-slate-900/40' : 'bg-slate-50/60'}`}
        onClick={() => handleZoneClick(null)}
      >
        <div className={`px-3 py-2 text-base font-bold uppercase tracking-wider rounded-t-md flex items-center justify-between ${isDark ? 'bg-slate-700 text-slate-100' : 'bg-slate-200 text-slate-700'}`}>
          <span>Non assignés</span>
          <div className="flex items-center gap-2">
            <span className={`text-sm font-semibold ${isDark ? 'text-slate-300' : 'opacity-80'}`}>{unassigned.length} vol(s)</span>
            {pickedId && <span className={`text-xs font-bold rounded px-2 py-1 animate-pulse shadow-sm ${isDark ? 'bg-slate-600 text-slate-100' : 'bg-white/70'}`}>Cliquer pour poser</span>}
          </div>
        </div>
        <div className="p-2 space-y-1 max-h-60 overflow-y-auto">
          {unassigned.length === 0 ? (
            <div className={`text-center py-6 rounded-lg border-2 border-dashed ${pickedId ? (isDark ? 'border-sky-500 bg-sky-950/50' : 'border-sky-400 bg-sky-50') : 'border-transparent'}`}>
              <p className={`text-base font-semibold italic ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>{pickedId ? 'Cliquer ici pour poser' : 'Tous assignés.'}</p>
            </div>
          ) : unassigned.map((s) => (
            <div
              key={s.id}
              className={`transition-all duration-300 ease-out relative ${pickedId === s.id ? 'opacity-0 scale-75' : 'opacity-100 scale-100'} ${pickedId && pickedId !== s.id ? 'cursor-pointer hover:scale-[1.02]' : ''}`}
              onClick={(e) => handleStripAreaClick(e, s.id, null)}
            >
              <FlightStrip strip={s} onRefresh={refresh} onContextMenu={handleStripRightClickWithDouble} dragHandleProps={makeDragProps(s.id)} />
            </div>
          ))}
        </div>
      </div>

      {/* Transfer dialog */}
      {transferDialog && <TransferDialog planId={transferDialog} onClose={() => setTransferDialog(null)} />}

      {/* Floating strip that follows cursor */}
      {isDragging && pickedStrip && (
        <div
          className="fixed pointer-events-none z-[100]"
          style={{
            left: cursorPos.x,
            top: cursorPos.y,
            transform: 'translate(-50%, -50%) rotate(-3deg) scale(1.05)',
            transition: 'transform 0.1s ease-out',
          }}
        >
          <div className="animate-pulse shadow-2xl">
            <FlightStrip strip={pickedStrip} dragHandleProps={makeDragProps(pickedStrip.id)} />
          </div>
        </div>
      )}
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
