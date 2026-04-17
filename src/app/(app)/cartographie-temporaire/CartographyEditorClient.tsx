'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Check,
  Copy,
  Eye,
  EyeOff,
  FileText,
  Grip,
  MapPin,
  Minus,
  Move,
  Plus,
  Radio,
  RotateCcw,
  Save,
  Trash2,
} from 'lucide-react';
import {
  buildCartographyExport,
  createDefaultCartographyDraft,
  PTFS_OFFICIAL_CHART_SRC,
  SVG_H,
  SVG_W,
  type CartographyDraftData,
  type FIRZone,
  type Island,
  type Point,
  type VorPoint,
  type Waypoint,
} from '@/lib/cartography-data';
import { AEROPORTS_PTFS } from '@/lib/aeroports-ptfs';

type EditLayer = 'airports' | 'islands' | 'fir' | 'waypoints' | 'vors';
type InteractionMode = 'edit' | 'pan';

interface EditorMeta {
  id: string | null;
  title: string;
  last_autosaved_at: string | null;
  updated_at: string | null;
}

interface EditorProps {
  initialDraft?: {
    title: string;
    payload: CartographyDraftData;
    last_autosaved_at: string | null;
    updated_at: string | null;
  } | null;
}

interface ViewBox {
  x: number;
  y: number;
  w: number;
  h: number;
}

type DragState =
  | { type: 'airport'; code: string }
  | { type: 'island-point'; id: string; pointIndex: number }
  | { type: 'fir-point'; id: string; pointIndex: number }
  | { type: 'waypoint'; code: string }
  | { type: 'vor'; code: string }
  | null;

const MIN_VIEWBOX_W = 80;
const ZOOM_FACTOR = 0.84;
const DEFAULT_VIEWBOX: ViewBox = { x: 0, y: 0, w: SVG_W, h: SVG_H };

function clampViewBox(next: ViewBox): ViewBox {
  const ratio = SVG_H / SVG_W;
  const w = Math.max(MIN_VIEWBOX_W, Math.min(SVG_W, next.w));
  const h = w * ratio;
  const x = Math.max(0, Math.min(SVG_W - w, next.x));
  const y = Math.max(0, Math.min(SVG_H - h, next.y));
  return { x, y, w, h };
}

/** Échelle et offsets réels (SVG `meet` = bandes possibles ; la carte ne remplit pas tout le `getBoundingClientRect`). */
function viewBoxMeetLayout(rect: DOMRect, vb: ViewBox) {
  const scale = Math.min(rect.width / vb.w, rect.height / vb.h);
  const drawW = scale * vb.w;
  const drawH = scale * vb.h;
  const offsetX = rect.left + (rect.width - drawW) / 2;
  const offsetY = rect.top + (rect.height - drawH) / 2;
  return { scale, offsetX, offsetY };
}

function viewBoxClientToUser(rect: DOMRect, vb: ViewBox, clientX: number, clientY: number): Point {
  const { scale, offsetX, offsetY } = viewBoxMeetLayout(rect, vb);
  const x = vb.x + (clientX - offsetX) / scale;
  const y = vb.y + (clientY - offsetY) / scale;
  return { x, y };
}

function formatDate(value: string | null) {
  if (!value) return 'Jamais';
  return new Date(value).toLocaleString('fr-FR');
}

export default function CartographyEditorClient({ initialDraft = null }: EditorProps) {
  const [draftTitle, setDraftTitle] = useState(initialDraft?.title ?? 'Brouillon cartographie');
  const [data, setData] = useState<CartographyDraftData>(initialDraft?.payload ?? createDefaultCartographyDraft());
  const [meta, setMeta] = useState<EditorMeta>({
    id: null,
    title: initialDraft?.title ?? 'Brouillon cartographie',
    last_autosaved_at: initialDraft?.last_autosaved_at ?? null,
    updated_at: initialDraft?.updated_at ?? null,
  });
  const [activeLayer, setActiveLayer] = useState<EditLayer>('airports');
  const [mode, setMode] = useState<InteractionMode>('edit');
  const [showGrid, setShowGrid] = useState(true);
  const [showOfficialBg, setShowOfficialBg] = useState(true);
  const [visibleLayers, setVisibleLayers] = useState({ airports: true, islands: true, fir: true, waypoints: true, vors: true });
  const [viewBox, setViewBox] = useState<ViewBox>(DEFAULT_VIEWBOX);
  const [selectedIsland, setSelectedIsland] = useState<string | null>(data.islands[0]?.id ?? null);
  const [selectedFir, setSelectedFir] = useState<string | null>(data.firZones[0]?.id ?? null);
  const [selectedWaypoint, setSelectedWaypoint] = useState<string | null>(data.waypoints[0]?.code ?? null);
  const [selectedVor, setSelectedVor] = useState<string | null>(data.vors[0]?.code ?? null);
  const [newItemName, setNewItemName] = useState('');
  const [saving, setSaving] = useState(false);
  const [status, setStatus] = useState<string>('Prêt');
  const [copiedKey, setCopiedKey] = useState<string | null>(null);
  const [showGuidelines, setShowGuidelines] = useState(false);
  const svgRef = useRef<SVGSVGElement>(null);
  const dragRef = useRef<DragState>(null);
  const panRef = useRef<{ startX: number; startY: number; original: ViewBox } | null>(null);
  /** Évite qu’un `click` sur le SVG ajoute un sommet juste après un relâchement de glissement (poignée / aéroport / etc.). */
  const suppressMapClickAfterDragRef = useRef(false);
  const dirtyRef = useRef(false);

  const exports = useMemo(() => buildCartographyExport(data), [data]);
  const handleRadius = useMemo(() => Math.max(1.4, Math.min(4, viewBox.w / 220)), [viewBox.w]);
  /** Poignées FIR / îles : disque visible plafonné (évite les “plateaux” énormes vue carte entière). */
  const shapeEditHandleR = useMemo(() => {
    const scaled = viewBox.w * 0.011;
    const visual = Math.min(scaled, 7);
    return Math.max(handleRadius * 1.65, 3.5, visual);
  }, [handleRadius, viewBox.w]);
  /** Légère marge de clic autour du disque sans masquer la carte. */
  const shapeEditHitR = useMemo(
    () => Math.min(shapeEditHandleR * 1.35, shapeEditHandleR + 4),
    [shapeEditHandleR],
  );
  const fineStroke = useMemo(() => Math.max(0.6, Math.min(2, viewBox.w / 320)), [viewBox.w]);

  const getSvgCoordinates = useCallback((clientX: number, clientY: number): Point => {
    if (!svgRef.current) return { x: 0, y: 0 };
    const rect = svgRef.current.getBoundingClientRect();
    return viewBoxClientToUser(rect, viewBox, clientX, clientY);
  }, [viewBox]);

  const zoomAt = useCallback((direction: 'in' | 'out', clientX?: number, clientY?: number) => {
    const factor = direction === 'in' ? ZOOM_FACTOR : 1 / ZOOM_FACTOR;
    setViewBox((prev) => {
      const rect = svgRef.current?.getBoundingClientRect();
      let focusX = prev.x + prev.w / 2;
      let focusY = prev.y + prev.h / 2;
      if (rect && clientX !== undefined && clientY !== undefined) {
        const p = viewBoxClientToUser(rect, prev, clientX, clientY);
        focusX = p.x;
        focusY = p.y;
      }

      const newW = prev.w * factor;
      const newH = prev.h * factor;
      const next = {
        x: focusX - ((focusX - prev.x) / prev.w) * newW,
        y: focusY - ((focusY - prev.y) / prev.h) * newH,
        w: newW,
        h: newH,
      };
      return clampViewBox(next);
    });
  }, []);

  const saveDraft = useCallback(async (silent = false) => {
    if (!silent) {
      setSaving(true);
      setStatus('Sauvegarde...');
    }

    try {
      const res = await fetch('/api/cartography/draft', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: draftTitle,
          payload: data,
        }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'Erreur de sauvegarde');

      dirtyRef.current = false;
      setMeta((prev) => ({
        ...prev,
        title: draftTitle,
        last_autosaved_at: json.draft?.last_autosaved_at ?? prev.last_autosaved_at,
        updated_at: json.draft?.updated_at ?? prev.updated_at,
      }));
      setStatus(silent ? 'Autosauvegardé' : 'Sauvegardé');
    } catch (error) {
      setStatus(error instanceof Error ? error.message : 'Erreur de sauvegarde');
    } finally {
      if (!silent) {
        setSaving(false);
      }
    }
  }, [data, draftTitle]);

  useEffect(() => {
    const id = window.setInterval(() => {
      if (dirtyRef.current) {
        void saveDraft(true);
      }
    }, 30000);
    return () => window.clearInterval(id);
  }, [saveDraft]);

  const markDirty = useCallback(() => {
    dirtyRef.current = true;
    setStatus('Modifications non sauvegardées');
  }, []);

  const updatePositions = useCallback((updater: (prev: CartographyDraftData['positions']) => CartographyDraftData['positions']) => {
    setData((prev) => ({ ...prev, positions: updater(prev.positions) }));
    markDirty();
  }, [markDirty]);

  const updateIslands = useCallback((updater: (prev: Island[]) => Island[]) => {
    setData((prev) => ({ ...prev, islands: updater(prev.islands) }));
    markDirty();
  }, [markDirty]);

  const updateFirZones = useCallback((updater: (prev: FIRZone[]) => FIRZone[]) => {
    setData((prev) => ({ ...prev, firZones: updater(prev.firZones) }));
    markDirty();
  }, [markDirty]);

  const updateWaypoints = useCallback((updater: (prev: Waypoint[]) => Waypoint[]) => {
    setData((prev) => ({ ...prev, waypoints: updater(prev.waypoints) }));
    markDirty();
  }, [markDirty]);

  const updateVors = useCallback((updater: (prev: VorPoint[]) => VorPoint[]) => {
    setData((prev) => ({ ...prev, vors: updater(prev.vors) }));
    markDirty();
  }, [markDirty]);

  /** La molette sur le SVG : `onWheel` React est souvent passif → `preventDefault` ignoré et la page défile encore. */
  useEffect(() => {
    const el = svgRef.current;
    if (!el) return;
    const onWheel = (event: WheelEvent) => {
      event.preventDefault();
      event.stopPropagation();
      zoomAt(event.deltaY < 0 ? 'in' : 'out', event.clientX, event.clientY);
    };
    el.addEventListener('wheel', onWheel, { passive: false });
    return () => el.removeEventListener('wheel', onWheel);
  }, [zoomAt]);

  const startPan = useCallback((event: React.PointerEvent<SVGSVGElement>) => {
    panRef.current = {
      startX: event.clientX,
      startY: event.clientY,
      original: viewBox,
    };
    event.currentTarget.setPointerCapture(event.pointerId);
  }, [viewBox]);

  const handlePointerDown = useCallback((event: React.PointerEvent<SVGSVGElement>) => {
    if (mode === 'pan' || event.button === 1) {
      startPan(event);
    }
  }, [mode, startPan]);

  const handlePointerMove = useCallback((event: React.PointerEvent<SVGSVGElement>) => {
    const dragState = dragRef.current;
    if (dragState) {
      const coords = getSvgCoordinates(event.clientX, event.clientY);
      if (dragState.type === 'airport') {
        updatePositions((prev) => ({
          ...prev,
          [dragState.code]: {
            x: Math.max(0, Math.min(100, coords.x / 10.24)),
            y: Math.max(0, Math.min(100, coords.y / 7.87)),
          },
        }));
      } else if (dragState.type === 'island-point') {
        updateIslands((prev) => prev.map((island) => {
          if (island.id !== dragState.id) return island;
          const nextPoints = [...island.points];
          nextPoints[dragState.pointIndex] = {
            x: Math.round(coords.x),
            y: Math.round(coords.y),
          };
          return { ...island, points: nextPoints };
        }));
      } else if (dragState.type === 'fir-point') {
        updateFirZones((prev) => prev.map((fir) => {
          if (fir.id !== dragState.id) return fir;
          const nextPoints = [...fir.points];
          nextPoints[dragState.pointIndex] = {
            x: Math.round(coords.x),
            y: Math.round(coords.y),
          };
          return { ...fir, points: nextPoints };
        }));
      } else if (dragState.type === 'waypoint') {
        updateWaypoints((prev) => prev.map((waypoint) => waypoint.code === dragState.code
          ? {
            ...waypoint,
            x: Math.max(0, Math.min(100, coords.x / 10.24)),
            y: Math.max(0, Math.min(100, coords.y / 7.87)),
          }
          : waypoint));
      } else if (dragState.type === 'vor') {
        updateVors((prev) => prev.map((vor) => vor.code === dragState.code
          ? {
            ...vor,
            x: Math.max(0, Math.min(100, coords.x / 10.24)),
            y: Math.max(0, Math.min(100, coords.y / 7.87)),
          }
          : vor));
      }
      return;
    }

    if (panRef.current) {
      const rect = svgRef.current?.getBoundingClientRect();
      if (!rect) return;
      const orig = panRef.current.original;
      const scale = Math.min(rect.width / orig.w, rect.height / orig.h);
      const dx = (event.clientX - panRef.current.startX) / scale;
      const dy = (event.clientY - panRef.current.startY) / scale;
      setViewBox(clampViewBox({
        ...orig,
        x: orig.x - dx,
        y: orig.y - dy,
      }));
    }
  }, [getSvgCoordinates, updateFirZones, updateIslands, updatePositions, updateVors, updateWaypoints]);

  const handlePointerUp = useCallback((event: React.PointerEvent<SVGSVGElement>) => {
    const hadDrag = dragRef.current !== null;
    dragRef.current = null;
    panRef.current = null;
    if (hadDrag) {
      suppressMapClickAfterDragRef.current = true;
    }
    const svg = svgRef.current;
    if (svg?.hasPointerCapture(event.pointerId)) {
      svg.releasePointerCapture(event.pointerId);
    }
  }, []);

  const addPointToSelectedShape = useCallback((event: React.MouseEvent<SVGSVGElement>) => {
    if (suppressMapClickAfterDragRef.current) {
      suppressMapClickAfterDragRef.current = false;
      return;
    }
    if (mode !== 'edit') return;
    if (activeLayer === 'islands' && selectedIsland) {
      const p = getSvgCoordinates(event.clientX, event.clientY);
      const coords = { x: Math.round(p.x), y: Math.round(p.y) };
      updateIslands((prev) => prev.map((island) => island.id === selectedIsland
        ? { ...island, points: [...island.points, coords] }
        : island));
    } else if (activeLayer === 'fir' && selectedFir) {
      const p = getSvgCoordinates(event.clientX, event.clientY);
      const coords = { x: Math.round(p.x), y: Math.round(p.y) };
      updateFirZones((prev) => prev.map((fir) => fir.id === selectedFir
        ? { ...fir, points: [...fir.points, coords] }
        : fir));
    }
  }, [activeLayer, getSvgCoordinates, mode, selectedFir, selectedIsland, updateFirZones, updateIslands]);

  const deleteShapePoint = useCallback((type: 'island' | 'fir', id: string, pointIndex: number) => {
    if (type === 'island') {
      updateIslands((prev) => prev.map((island) => island.id === id
        ? { ...island, points: island.points.filter((_, idx) => idx !== pointIndex) }
        : island));
    } else {
      updateFirZones((prev) => prev.map((fir) => fir.id === id
        ? { ...fir, points: fir.points.filter((_, idx) => idx !== pointIndex) }
        : fir));
    }
  }, [updateFirZones, updateIslands]);

  const addItem = useCallback(() => {
    const label = newItemName.trim();
    if (!label) return;

    if (activeLayer === 'islands') {
      const id = label.toLowerCase().replace(/\s+/g, '_');
      updateIslands((prev) => [...prev, {
        id,
        name: label,
        points: [{ x: 500, y: 360 }, { x: 535, y: 360 }, { x: 535, y: 390 }, { x: 500, y: 390 }],
        fill: '#4a7a5a',
        stroke: '#1a3d2a',
      }]);
      setSelectedIsland(id);
    } else if (activeLayer === 'fir') {
      const code = label.toUpperCase().slice(0, 8);
      const id = `${code.toLowerCase()}_fir`;
      updateFirZones((prev) => [...prev, {
        id,
        code,
        name: `${label} FIR`,
        points: [{ x: 420, y: 280 }, { x: 580, y: 280 }, { x: 580, y: 420 }, { x: 420, y: 420 }],
        color: 'rgba(255,200,0,0.15)',
        borderColor: '#ffc800',
      }]);
      setSelectedFir(id);
    } else if (activeLayer === 'waypoints') {
      const code = label.toUpperCase().slice(0, 10);
      updateWaypoints((prev) => [...prev, { code, x: 50, y: 50 }]);
      setSelectedWaypoint(code);
    } else if (activeLayer === 'vors') {
      const code = label.toUpperCase().slice(0, 6);
      updateVors((prev) => [...prev, { code, name: label, freq: '000.00', x: 50, y: 50 }]);
      setSelectedVor(code);
    }

    setNewItemName('');
  }, [activeLayer, newItemName, updateFirZones, updateIslands, updateVors, updateWaypoints]);

  const copyExport = useCallback(async (key: string, value: string) => {
    await navigator.clipboard.writeText(value);
    setCopiedKey(key);
    window.setTimeout(() => setCopiedKey(null), 1500);
  }, []);

  const selectedIslandData = data.islands.find((item) => item.id === selectedIsland) ?? null;
  const selectedFirData = data.firZones.find((item) => item.id === selectedFir) ?? null;
  const selectedWaypointData = data.waypoints.find((item) => item.code === selectedWaypoint) ?? null;
  const selectedVorData = data.vors.find((item) => item.code === selectedVor) ?? null;

  return (
    <div className="space-y-4">
      <div className="rounded-2xl border border-cyan-500/20 bg-slate-900/70 p-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="text-2xl font-semibold text-slate-100">Cartographie temporaire</h1>
            <p className="text-sm text-slate-400">
              Fond officiel visible uniquement ici. Les cartes publiques garderont le style du site.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <button onClick={() => setShowGuidelines((value) => !value)} className={`rounded-lg px-3 py-2 text-sm ${showGuidelines ? 'bg-amber-600 text-white' : 'bg-slate-800 text-slate-300'}`}>
              <FileText className="mr-2 inline h-4 w-4" />
              Consignes
            </button>
            <button onClick={() => setMode(mode === 'edit' ? 'pan' : 'edit')} className={`rounded-lg px-3 py-2 text-sm ${mode === 'pan' ? 'bg-cyan-600 text-white' : 'bg-slate-800 text-slate-300'}`}>
              {mode === 'pan' ? <Move className="mr-2 inline h-4 w-4" /> : <Grip className="mr-2 inline h-4 w-4" />}
              {mode === 'pan' ? 'Pan actif' : 'Mode édition'}
            </button>
            <button onClick={() => zoomAt('in')} className="rounded-lg bg-slate-800 px-3 py-2 text-slate-300"><Plus className="h-4 w-4" /></button>
            <button onClick={() => zoomAt('out')} className="rounded-lg bg-slate-800 px-3 py-2 text-slate-300"><Minus className="h-4 w-4" /></button>
            <button onClick={() => setViewBox(DEFAULT_VIEWBOX)} className="rounded-lg bg-slate-800 px-3 py-2 text-slate-300"><RotateCcw className="h-4 w-4" /></button>
            <button onClick={() => void saveDraft(false)} disabled={saving} className="rounded-lg bg-emerald-600 px-3 py-2 text-white disabled:opacity-60">
              <Save className="mr-2 inline h-4 w-4" />
              {saving ? 'Sauvegarde...' : 'Sauvegarder'}
            </button>
          </div>
        </div>
      </div>

      {showGuidelines && (
        <div className="rounded-2xl border border-amber-500/30 bg-amber-500/10 p-4">
          <h2 className="text-sm font-semibold text-amber-300">Consignes cartographie</h2>
          <div className="mt-3 space-y-2 text-sm text-amber-100/90">
            <p>Les cartographes doivent dessiner par-dessus la carte enroute officielle visible en fond dans cet éditeur.</p>
            <p>Il faut retracer les FIR, les îles, placer les aéroports, puis ajouter les points IFR et VOR si possible.</p>
            <p>La FIR de St Barth est intégrée à celle de Rockford : `IBTH` doit donc rester dans `IRFD`.</p>
            <p>La FIR de Skopelos est intégrée à celle d&apos;IZOL : `ISKP` doit donc rester dans `IZOL`.</p>
            <p>Le fond officiel sert uniquement de référence de tracing : les cartes publiques doivent garder le style visuel du site.</p>
          </div>
        </div>
      )}

      <div className="grid gap-4 xl:grid-cols-[1fr_360px]">
        <div className="overflow-hidden rounded-2xl border border-slate-700/50 bg-slate-950">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-800 px-4 py-3">
            <input
              value={draftTitle}
              onChange={(event) => {
                setDraftTitle(event.target.value);
                markDirty();
              }}
              className="min-w-[260px] rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-slate-100"
              placeholder="Nom du brouillon"
            />
            <div className="flex flex-wrap gap-2 text-xs">
              <button onClick={() => setShowOfficialBg((value) => !value)} className={`rounded-md px-2 py-1 ${showOfficialBg ? 'bg-cyan-600/20 text-cyan-300' : 'bg-slate-800 text-slate-500'}`}>
                {showOfficialBg ? <Eye className="mr-1 inline h-3 w-3" /> : <EyeOff className="mr-1 inline h-3 w-3" />}
                Fond officiel
              </button>
              <button onClick={() => setShowGrid((value) => !value)} className={`rounded-md px-2 py-1 ${showGrid ? 'bg-cyan-600/20 text-cyan-300' : 'bg-slate-800 text-slate-500'}`}>
                Grille
              </button>
              <span className="rounded-md bg-slate-900 px-2 py-1 text-slate-400">{status}</span>
            </div>
          </div>

          <div className="relative h-[78vh] min-h-[700px] overscroll-contain [touch-action:none]">
            <svg
              ref={svgRef}
              viewBox={`${viewBox.x} ${viewBox.y} ${viewBox.w} ${viewBox.h}`}
              className="h-full w-full bg-slate-950"
              onPointerDown={handlePointerDown}
              onPointerMove={handlePointerMove}
              onPointerUp={handlePointerUp}
              onPointerLeave={handlePointerUp}
              onClick={addPointToSelectedShape}
            >
              <defs>
                <pattern id="cartoGrid" width="16" height="16" patternUnits="userSpaceOnUse">
                  <path d="M 16 0 L 0 0 0 16" fill="none" stroke="rgba(100,150,200,0.08)" strokeWidth="0.4" />
                </pattern>
              </defs>
              <rect width={SVG_W} height={SVG_H} fill="#08111f" />
              {showOfficialBg && (
                <>
                  <image href={PTFS_OFFICIAL_CHART_SRC} x="0" y="0" width={SVG_W} height={SVG_H} preserveAspectRatio="none" opacity="0.9" />
                  <rect width={SVG_W} height={SVG_H} fill="rgba(4, 10, 18, 0.18)" />
                </>
              )}
              {showGrid && <rect width={SVG_W} height={SVG_H} fill="url(#cartoGrid)" />}

              {visibleLayers.fir && data.firZones.map((fir) => (
                <g key={fir.id}>
                  <polygon
                    points={fir.points.map((point) => `${point.x},${point.y}`).join(' ')}
                    fill={fir.color}
                    stroke={selectedFir === fir.id ? '#fff' : fir.borderColor}
                    strokeWidth={fineStroke}
                    fillOpacity="0.22"
                    strokeOpacity="0.86"
                  />
                  <text
                    x={fir.points.reduce((sum, point) => sum + point.x, 0) / fir.points.length}
                    y={fir.points.reduce((sum, point) => sum + point.y, 0) / fir.points.length}
                    fill={fir.borderColor}
                    fontSize={Math.max(7, viewBox.w / 120)}
                    fontFamily="monospace"
                    textAnchor="middle"
                  >
                    {fir.code}
                  </text>
                </g>
              ))}

              {visibleLayers.islands && data.islands.map((island) => (
                <polygon
                  key={island.id}
                  points={island.points.map((point) => `${point.x},${point.y}`).join(' ')}
                  fill={island.fill}
                  stroke={selectedIsland === island.id ? '#ffffff' : island.stroke}
                  strokeWidth={fineStroke}
                  fillOpacity="0.28"
                  strokeOpacity="0.85"
                />
              ))}

              {visibleLayers.airports && Object.entries(data.positions).map(([code, pos]) => {
                const airport = AEROPORTS_PTFS.find((item) => item.code === code);
                const x = pos.x * 10.24;
                const y = pos.y * 7.87;
                const fill = airport?.taille === 'international'
                  ? '#a855f7'
                  : airport?.taille === 'regional'
                    ? '#0ea5e9'
                    : airport?.taille === 'military'
                      ? '#ef4444'
                      : '#10b981';
                return (
                  <g key={code}>
                    <circle
                      cx={x}
                      cy={y}
                      r={handleRadius * 2.4}
                      fill={fill}
                      stroke="#fff"
                      strokeWidth={fineStroke}
                      onPointerDown={(event) => {
                        if (mode !== 'edit') return;
                        event.stopPropagation();
                        try {
                          svgRef.current?.setPointerCapture(event.pointerId);
                        } catch {
                          /* certains navigateurs */
                        }
                        dragRef.current = { type: 'airport', code };
                      }}
                    />
                    <text x={x} y={y + 9} fill="#f8fafc" fontSize={Math.max(5, viewBox.w / 170)} fontFamily="monospace" textAnchor="middle">
                      {code}
                    </text>
                  </g>
                );
              })}

              {/* Waypoints / VOR au-dessus des aéroports : sinon les gros disques d&apos;aéroport volent le clic (ex. MOGTA près d&apos;un hub). */}
              {visibleLayers.waypoints && data.waypoints.map((waypoint) => {
                const x = waypoint.x * 10.24;
                const y = waypoint.y * 7.87;
                const grabR = Math.max(handleRadius * 1.8, 6);
                return (
                  <g key={waypoint.code}>
                    <circle
                      cx={x}
                      cy={y}
                      r={grabR}
                      fill={selectedWaypoint === waypoint.code ? '#d9f99d' : '#84cc16'}
                      fillOpacity={0.92}
                      stroke={selectedWaypoint === waypoint.code ? '#facc15' : 'rgba(255,255,255,0.35)'}
                      strokeWidth={fineStroke}
                      style={{ cursor: mode === 'edit' ? 'grab' : undefined }}
                      onPointerDown={(event) => {
                        if (mode !== 'edit') return;
                        event.stopPropagation();
                        try {
                          svgRef.current?.setPointerCapture(event.pointerId);
                        } catch {
                          /* ignore */
                        }
                        dragRef.current = { type: 'waypoint', code: waypoint.code };
                        setSelectedWaypoint(waypoint.code);
                      }}
                    />
                    <text x={x + 4} y={y - 3} fill="#d9f99d" fontSize={Math.max(5, viewBox.w / 165)} fontFamily="monospace" pointerEvents="none">
                      {waypoint.code}
                    </text>
                  </g>
                );
              })}

              {visibleLayers.vors && data.vors.map((vor) => {
                const x = vor.x * 10.24;
                const y = vor.y * 7.87;
                return (
                  <g key={vor.code}>
                    <circle
                      cx={x}
                      cy={y}
                      r={handleRadius * 2.2}
                      fill="none"
                      stroke={selectedVor === vor.code ? '#ffffff' : '#22d3ee'}
                      strokeWidth={fineStroke}
                      style={{ cursor: mode === 'edit' ? 'grab' : undefined }}
                      onPointerDown={(event) => {
                        if (mode !== 'edit') return;
                        event.stopPropagation();
                        try {
                          svgRef.current?.setPointerCapture(event.pointerId);
                        } catch {
                          /* ignore */
                        }
                        dragRef.current = { type: 'vor', code: vor.code };
                        setSelectedVor(vor.code);
                      }}
                    />
                    <circle cx={x} cy={y} r={handleRadius} fill="#22d3ee" pointerEvents="none" />
                    <text x={x + 7} y={y - 5} fill="#67e8f9" fontSize={Math.max(5, viewBox.w / 165)} fontFamily="monospace" pointerEvents="none">
                      {vor.code}
                    </text>
                  </g>
                );
              })}

              {visibleLayers.fir && selectedFirData && activeLayer === 'fir' && selectedFirData.points.map((point, pointIndex) => {
                const next = selectedFirData.points[(pointIndex + 1) % selectedFirData.points.length];
                const guideStroke = Math.max(fineStroke * 1.35, 1);
                return (
                  <g key={`${selectedFirData.id}-${pointIndex}`}>
                    <line
                      x1={point.x}
                      y1={point.y}
                      x2={next.x}
                      y2={next.y}
                      stroke="#ffffff"
                      strokeWidth={guideStroke}
                      strokeDasharray={`${guideStroke * 2} ${guideStroke * 2}`}
                      opacity="0.85"
                      pointerEvents="none"
                    />
                    <circle
                      cx={point.x}
                      cy={point.y}
                      r={shapeEditHitR}
                      fill="transparent"
                      pointerEvents="all"
                      style={{ cursor: mode === 'edit' ? 'grab' : undefined }}
                      onPointerDown={(event) => {
                        if (mode !== 'edit') return;
                        event.stopPropagation();
                        try {
                          svgRef.current?.setPointerCapture(event.pointerId);
                        } catch { /* ignore */ }
                        dragRef.current = { type: 'fir-point', id: selectedFirData.id, pointIndex };
                      }}
                      onContextMenu={(event) => {
                        event.preventDefault();
                        deleteShapePoint('fir', selectedFirData.id, pointIndex);
                      }}
                    />
                    <circle
                      cx={point.x}
                      cy={point.y}
                      r={shapeEditHandleR}
                      fill={selectedFirData.borderColor}
                      stroke="#fff"
                      strokeWidth={Math.max(fineStroke, 1)}
                      style={{ cursor: mode === 'edit' ? 'grab' : undefined }}
                      pointerEvents="none"
                    />
                  </g>
                );
              })}

              {visibleLayers.islands && selectedIslandData && activeLayer === 'islands' && selectedIslandData.points.map((point, pointIndex) => {
                const next = selectedIslandData.points[(pointIndex + 1) % selectedIslandData.points.length];
                const guideStroke = Math.max(fineStroke * 1.35, 1);
                return (
                  <g key={`${selectedIslandData.id}-${pointIndex}`}>
                    <line
                      x1={point.x}
                      y1={point.y}
                      x2={next.x}
                      y2={next.y}
                      stroke="#ffffff"
                      strokeWidth={guideStroke}
                      strokeDasharray={`${guideStroke * 2} ${guideStroke * 2}`}
                      opacity="0.8"
                      pointerEvents="none"
                    />
                    <circle
                      cx={point.x}
                      cy={point.y}
                      r={shapeEditHitR}
                      fill="transparent"
                      pointerEvents="all"
                      style={{ cursor: mode === 'edit' ? 'grab' : undefined }}
                      onPointerDown={(event) => {
                        if (mode !== 'edit') return;
                        event.stopPropagation();
                        try {
                          svgRef.current?.setPointerCapture(event.pointerId);
                        } catch { /* ignore */ }
                        dragRef.current = { type: 'island-point', id: selectedIslandData.id, pointIndex };
                      }}
                      onContextMenu={(event) => {
                        event.preventDefault();
                        deleteShapePoint('island', selectedIslandData.id, pointIndex);
                      }}
                    />
                    <circle
                      cx={point.x}
                      cy={point.y}
                      r={shapeEditHandleR}
                      fill="#fff"
                      stroke={selectedIslandData.fill}
                      strokeWidth={Math.max(fineStroke, 1)}
                      style={{ cursor: mode === 'edit' ? 'grab' : undefined }}
                      pointerEvents="none"
                    />
                  </g>
                );
              })}
            </svg>
          </div>
        </div>

        <aside className="space-y-4">
          <div className="rounded-2xl border border-slate-700/50 bg-slate-900/70 p-4">
            <h2 className="mb-3 text-sm font-semibold text-slate-200">Outil actif</h2>
            <div className="grid grid-cols-2 gap-2">
              {([
                ['airports', 'Aéroports'],
                ['islands', 'Îles'],
                ['fir', 'FIR'],
                ['waypoints', 'Waypoints'],
                ['vors', 'IFR / VOR'],
              ] as const).map(([key, label]) => (
                <button
                  key={key}
                  onClick={() => setActiveLayer(key)}
                  className={`rounded-lg px-3 py-2 text-sm ${activeLayer === key ? 'bg-cyan-600 text-white' : 'bg-slate-800 text-slate-300'}`}
                >
                  {label}
                </button>
              ))}
            </div>

            <h2 className="mt-4 mb-2 text-sm font-semibold text-slate-200">Visibilité</h2>
            <div className="space-y-1">
              {([
                ['airports', 'Aéroports', '#a855f7'],
                ['islands', 'Îles', '#6ee7b7'],
                ['fir', 'FIR', '#fbbf24'],
                ['waypoints', 'Waypoints', '#38bdf8'],
                ['vors', 'IFR / VOR', '#f87171'],
              ] as const).map(([key, label, color]) => (
                <label key={key} className="flex items-center gap-2 px-2 py-1 rounded-lg hover:bg-slate-800/50 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={visibleLayers[key]}
                    onChange={() => setVisibleLayers(prev => ({ ...prev, [key]: !prev[key] }))}
                    className="rounded border-slate-600"
                  />
                  <span className="w-2 h-2 rounded-full" style={{ backgroundColor: color }} />
                  <span className="text-xs text-slate-300">{label}</span>
                </label>
              ))}
            </div>
            <p className="mt-3 text-xs text-slate-400">
              Molette pour zoomer. Passe en mode pan si tu veux te déplacer sans éditer.
            </p>
          </div>

          <div className="rounded-2xl border border-slate-700/50 bg-slate-900/70 p-4 space-y-3">
            <h2 className="text-sm font-semibold text-slate-200">Sélection</h2>

            {activeLayer === 'islands' && (
              <>
                <select value={selectedIsland ?? ''} onChange={(event) => setSelectedIsland(event.target.value || null)} className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-100">
                  {data.islands.map((island) => <option key={island.id} value={island.id}>{island.name}</option>)}
                </select>
                <div className="flex gap-2">
                  <input value={newItemName} onChange={(event) => setNewItemName(event.target.value)} placeholder="Nouvelle île" className="flex-1 rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-100" />
                  <button onClick={addItem} className="rounded-lg bg-emerald-600 px-3 py-2 text-white"><Plus className="h-4 w-4" /></button>
                </div>
                {selectedIslandData && (
                  <div className="space-y-2">
                    <input
                      value={selectedIslandData.name}
                      onChange={(event) => updateIslands((prev) => prev.map((island) => island.id === selectedIslandData.id ? { ...island, name: event.target.value } : island))}
                      className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-100"
                      placeholder="Nom de l'île"
                    />
                    <button
                      onClick={() => {
                        updateIslands((prev) => prev.filter((island) => island.id !== selectedIslandData.id));
                        setSelectedIsland(data.islands.find((item) => item.id !== selectedIslandData.id)?.id ?? null);
                      }}
                      className="w-full rounded-lg bg-red-600/15 px-3 py-2 text-sm text-red-300"
                    >
                      <Trash2 className="mr-2 inline h-4 w-4" />
                      Supprimer l&apos;île
                    </button>
                  </div>
                )}
              </>
            )}

            {activeLayer === 'fir' && (
              <>
                <select value={selectedFir ?? ''} onChange={(event) => setSelectedFir(event.target.value || null)} className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-100">
                  {data.firZones.map((fir) => <option key={fir.id} value={fir.id}>{fir.name}</option>)}
                </select>
                <div className="flex gap-2">
                  <input value={newItemName} onChange={(event) => setNewItemName(event.target.value)} placeholder="Nouvelle FIR" className="flex-1 rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-100" />
                  <button onClick={addItem} className="rounded-lg bg-emerald-600 px-3 py-2 text-white"><Plus className="h-4 w-4" /></button>
                </div>
                {selectedFirData && (
                  <div className="space-y-2">
                    <div className="grid gap-2 md:grid-cols-2">
                      <input
                        value={selectedFirData.code}
                        onChange={(event) => updateFirZones((prev) => prev.map((fir) => fir.id === selectedFirData.id ? { ...fir, code: event.target.value.toUpperCase() } : fir))}
                        className="rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-100"
                        placeholder="Code FIR"
                      />
                      <input
                        value={selectedFirData.name}
                        onChange={(event) => updateFirZones((prev) => prev.map((fir) => fir.id === selectedFirData.id ? { ...fir, name: event.target.value } : fir))}
                        className="rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-100"
                        placeholder="Nom FIR"
                      />
                    </div>
                    <button
                      onClick={() => {
                        updateFirZones((prev) => prev.filter((fir) => fir.id !== selectedFirData.id));
                        setSelectedFir(data.firZones.find((item) => item.id !== selectedFirData.id)?.id ?? null);
                      }}
                      className="w-full rounded-lg bg-red-600/15 px-3 py-2 text-sm text-red-300"
                    >
                      <Trash2 className="mr-2 inline h-4 w-4" />
                      Supprimer la FIR
                    </button>
                  </div>
                )}
              </>
            )}

            {activeLayer === 'waypoints' && (
              <>
                <select value={selectedWaypoint ?? ''} onChange={(event) => setSelectedWaypoint(event.target.value || null)} className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-100">
                  {data.waypoints.map((waypoint) => <option key={waypoint.code} value={waypoint.code}>{waypoint.code}</option>)}
                </select>
                <div className="flex gap-2">
                  <input value={newItemName} onChange={(event) => setNewItemName(event.target.value)} placeholder="Nouveau waypoint" className="flex-1 rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-100" />
                  <button onClick={addItem} className="rounded-lg bg-emerald-600 px-3 py-2 text-white"><Plus className="h-4 w-4" /></button>
                </div>
                {selectedWaypointData && (
                  <div className="space-y-2">
                    <input
                      value={selectedWaypointData.code}
                      onChange={(event) => updateWaypoints((prev) => prev.map((waypoint) => waypoint.code === selectedWaypointData.code ? { ...waypoint, code: event.target.value.toUpperCase() } : waypoint))}
                      className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-100"
                      placeholder="Code waypoint"
                    />
                    <button
                      onClick={() => {
                        updateWaypoints((prev) => prev.filter((waypoint) => waypoint.code !== selectedWaypointData.code));
                        setSelectedWaypoint(data.waypoints.find((item) => item.code !== selectedWaypointData.code)?.code ?? null);
                      }}
                      className="w-full rounded-lg bg-red-600/15 px-3 py-2 text-sm text-red-300"
                    >
                      <Trash2 className="mr-2 inline h-4 w-4" />
                      Supprimer le waypoint
                    </button>
                  </div>
                )}
              </>
            )}

            {activeLayer === 'vors' && (
              <>
                <select value={selectedVor ?? ''} onChange={(event) => setSelectedVor(event.target.value || null)} className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-100">
                  {data.vors.map((vor) => <option key={vor.code} value={vor.code}>{vor.code}</option>)}
                </select>
                <div className="flex gap-2">
                  <input value={newItemName} onChange={(event) => setNewItemName(event.target.value)} placeholder="Nouveau point IFR/VOR" className="flex-1 rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-100" />
                  <button onClick={addItem} className="rounded-lg bg-emerald-600 px-3 py-2 text-white"><Plus className="h-4 w-4" /></button>
                </div>
                {selectedVorData && (
                  <div className="grid gap-2">
                    <input
                      value={selectedVorData.code}
                      onChange={(event) => updateVors((prev) => prev.map((vor) => vor.code === selectedVorData.code ? { ...vor, code: event.target.value.toUpperCase() } : vor))}
                      className="rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-100"
                      placeholder="Code"
                    />
                    <input
                      value={selectedVorData.name}
                      onChange={(event) => updateVors((prev) => prev.map((vor) => vor.code === selectedVorData.code ? { ...vor, name: event.target.value } : vor))}
                      className="rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-100"
                      placeholder="Nom"
                    />
                    <input
                      value={selectedVorData.freq}
                      onChange={(event) => updateVors((prev) => prev.map((vor) => vor.code === selectedVorData.code ? { ...vor, freq: event.target.value } : vor))}
                      className="rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-100"
                      placeholder="Fréquence"
                    />
                    <button
                      onClick={() => {
                        updateVors((prev) => prev.filter((vor) => vor.code !== selectedVorData.code));
                        setSelectedVor(data.vors.find((item) => item.code !== selectedVorData.code)?.code ?? null);
                      }}
                      className="w-full rounded-lg bg-red-600/15 px-3 py-2 text-sm text-red-300"
                    >
                      <Trash2 className="mr-2 inline h-4 w-4" />
                      Supprimer le point IFR/VOR
                    </button>
                  </div>
                )}
              </>
            )}

            <p className="text-xs text-slate-400">
              {activeLayer === 'waypoints' || activeLayer === 'vors' ? (
                <>
                  <strong className="text-slate-300">Waypoints / IFR&nbsp;:</strong> cliquez sur le disque coloré et glissez pour déplacer (mode édition). Les points sont au-dessus des aéroports pour pouvoir les saisir près d&apos;un hub.
                </>
              ) : activeLayer === 'fir' || activeLayer === 'islands' ? (
                <>
                  <strong className="text-slate-300">FIR / îles&nbsp;:</strong> poignées sur les sommets ; petite zone de clic un peu plus large que le disque. Glisser pour déplacer. Clic sur la carte pour ajouter un sommet. Clic droit sur une poignée pour le supprimer. Zoomez pour affiner.
                </>
              ) : (
                <>
                  <strong className="text-slate-300">Aéroports&nbsp;:</strong> glisser le disque coloré pour repositionner. Les autres calques ont leurs propres contrôles ci-dessus.
                </>
              )}
            </p>
          </div>

          <div className="rounded-2xl border border-slate-700/50 bg-slate-900/70 p-4 space-y-3">
            <h2 className="text-sm font-semibold text-slate-200">Brouillon</h2>
            <p className="text-xs text-slate-400">Dernière autosauvegarde : {formatDate(meta.last_autosaved_at)}</p>
            <p className="text-xs text-slate-400">Dernière modification serveur : {formatDate(meta.updated_at)}</p>
          </div>

          <div className="rounded-2xl border border-slate-700/50 bg-slate-900/70 p-4 space-y-3">
            <h2 className="text-sm font-semibold text-slate-200">Exports pour les admins</h2>
            {Object.entries(exports).map(([key, value]) => (
              <button
                key={key}
                onClick={() => void copyExport(key, value)}
                className="flex w-full items-center justify-between rounded-lg bg-slate-950 px-3 py-2 text-sm text-slate-300"
              >
                <span>{key}</span>
                {copiedKey === key ? <Check className="h-4 w-4 text-emerald-400" /> : <Copy className="h-4 w-4" />}
              </button>
            ))}
          </div>
        </aside>
      </div>
    </div>
  );
}
