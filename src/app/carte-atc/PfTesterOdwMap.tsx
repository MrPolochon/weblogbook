'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Plane, RefreshCw, ZoomIn, ZoomOut, RotateCcw } from 'lucide-react';
import { PLANE_BLIP_D } from '@/lib/radar-utils';
import {
  PF_DEFAULT_SERVER_ID,
  PF_MAP_H,
  PF_MAP_W,
  PF_SERVER_ID_RE,
  PF_TILE_TREE,
} from '@/lib/pftester-odw';

type PfAircraft = {
  id: string;
  serverId: string;
  callsign: string;
  robloxUsername: string;
  heading: number;
  altitude: number;
  speed: number;
  model: string;
  livery: string;
  mapX: number;
  mapY: number;
};

type TrailPt = { x: number; y: number };

function tileUrl(z: number, x: number, y: number): string {
  return `/api/pftester-odw/tiles/${z}/${x}/${y}`;
}

function tilesForZoom(tileZoom: number) {
  const n = 2 ** tileZoom;
  const unit = PF_TILE_TREE / n;
  const list: { key: string; z: number; x: number; y: number; left: number; top: number; size: number }[] = [];
  const maxTx = Math.min(n - 1, Math.ceil(PF_MAP_W / unit) - 1);
  const maxTy = Math.min(n - 1, Math.ceil(PF_MAP_H / unit) - 1);
  for (let y = 0; y <= maxTy; y++) {
    for (let x = 0; x <= maxTx; x++) {
      list.push({
        key: `${tileZoom}-${x}-${y}`,
        z: tileZoom,
        x,
        y,
        left: x * unit,
        top: y * unit,
        size: unit,
      });
    }
  }
  return list;
}

export default function PfTesterOdwMap({ defaultServerId }: { defaultServerId: string }) {
  const [serverId, setServerId] = useState(defaultServerId || PF_DEFAULT_SERVER_ID);
  const [aircraft, setAircraft] = useState<PfAircraft[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [zoom, setZoom] = useState(1.15);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [isPanning, setIsPanning] = useState(false);
  const panStartRef = useRef<{ x: number; y: number; mouseX: number; mouseY: number } | null>(null);
  const pinchStartRef = useRef<{ distance: number; zoom: number } | null>(null);
  const mapContainerRef = useRef<HTMLDivElement>(null);
  const [trails, setTrails] = useState<Record<string, TrailPt[]>>({});

  const fetchFlights = useCallback(async () => {
    try {
      const res = await fetch(`/api/pftester-odw/flights?serverId=${encodeURIComponent(serverId)}`, {
        cache: 'no-store',
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || 'Erreur trafic');
      setAircraft(Array.isArray(data.aircraft) ? data.aircraft : []);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Erreur trafic');
    }
    setLoading(false);
  }, [serverId]);

  useEffect(() => {
    setLoading(true);
    setTrails({});
    fetchFlights();
    const t = setInterval(fetchFlights, 4000);
    return () => clearInterval(t);
  }, [fetchFlights]);

  useEffect(() => {
    setTrails((prev) => {
      const next: Record<string, TrailPt[]> = {};
      let changed = false;
      for (const a of aircraft) {
        const y = PF_MAP_H - a.mapY;
        const pts = prev[a.id] ? prev[a.id].slice() : [];
        const last = pts[pts.length - 1];
        const dx = last ? a.mapX - last.x : 99;
        const dy = last ? y - last.y : 99;
        if (!last || dx * dx + dy * dy >= 0.03) {
          pts.push({ x: a.mapX, y });
          if (pts.length > 90) pts.splice(0, pts.length - 90);
          changed = true;
        }
        next[a.id] = pts;
      }
      if (!changed && Object.keys(prev).length === Object.keys(next).length) {
        const sameIds = Object.keys(next).every((id) => prev[id]);
        if (sameIds) return prev;
      }
      return next;
    });
  }, [aircraft]);

  const updateZoom = useCallback((next: number) => {
    setZoom(Math.max(1, Math.min(8, next)));
  }, []);

  function startPan(clientX: number, clientY: number) {
    panStartRef.current = { x: pan.x, y: pan.y, mouseX: clientX, mouseY: clientY };
    setIsPanning(true);
  }
  function movePan(clientX: number, clientY: number) {
    if (!panStartRef.current) return;
    setPan({
      x: panStartRef.current.x + (clientX - panStartRef.current.mouseX),
      y: panStartRef.current.y + (clientY - panStartRef.current.mouseY),
    });
  }
  function endPan() {
    panStartRef.current = null;
    setIsPanning(false);
  }
  function touchDistance(touches: React.TouchList) {
    const dx = touches[0].clientX - touches[1].clientX;
    const dy = touches[0].clientY - touches[1].clientY;
    return Math.hypot(dx, dy);
  }

  const tileZoom = Math.max(1, Math.min(5, Math.round(zoom + 1)));
  const tiles = useMemo(() => {
    const base = tilesForZoom(1);
    if (tileZoom <= 1) return base;
    return [...base, ...tilesForZoom(tileZoom)];
  }, [tileZoom]);

  const selected = aircraft.find((a) => a.id === selectedId) ?? null;

  return (
    <div className="flex-1 min-h-0 w-full flex flex-col md:flex-row gap-3 md:gap-4">
      <div
        className="flex-1 min-h-0 relative rounded-xl border border-cyan-700/40 bg-slate-950 overflow-hidden touch-none"
        ref={mapContainerRef}
        onWheel={(e) => {
          e.preventDefault();
          updateZoom(zoom + (e.deltaY < 0 ? 0.18 : -0.18));
        }}
        onMouseDown={(e) => startPan(e.clientX, e.clientY)}
        onMouseMove={(e) => movePan(e.clientX, e.clientY)}
        onMouseUp={endPan}
        onMouseLeave={endPan}
        onTouchStart={(e) => {
          if (e.touches.length === 2) {
            pinchStartRef.current = { distance: touchDistance(e.touches), zoom };
          } else if (e.touches.length === 1) {
            startPan(e.touches[0].clientX, e.touches[0].clientY);
          }
        }}
        onTouchMove={(e) => {
          if (e.touches.length === 2 && pinchStartRef.current) {
            e.preventDefault();
            updateZoom(pinchStartRef.current.zoom * (touchDistance(e.touches) / pinchStartRef.current.distance));
          } else if (e.touches.length === 1) {
            movePan(e.touches[0].clientX, e.touches[0].clientY);
          }
        }}
        onTouchEnd={() => {
          pinchStartRef.current = null;
          endPan();
        }}
        style={{ cursor: zoom > 1 ? (isPanning ? 'grabbing' : 'grab') : 'default' }}
      >
        <div
          className="absolute inset-0"
          style={{
            transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})`,
            transformOrigin: 'center center',
            transition: isPanning ? 'none' : 'transform 0.12s ease-out',
          }}
        >
          <div className="absolute inset-0 flex items-center justify-center p-2">
            <div
              className="relative w-full h-full max-h-full"
              style={{ aspectRatio: `${PF_MAP_W} / ${PF_MAP_H}` }}
            >
              <div className="absolute inset-0 overflow-hidden bg-[#0b1c2c]">
                {tiles.map((t) => (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    key={t.key}
                    alt=""
                    draggable={false}
                    src={tileUrl(t.z, t.x, t.y)}
                    className="absolute max-w-none select-none pointer-events-none"
                    style={{
                      left: `${(t.left / PF_MAP_W) * 100}%`,
                      top: `${(t.top / PF_MAP_H) * 100}%`,
                      width: `${(t.size / PF_MAP_W) * 100}%`,
                      height: `${(t.size / PF_MAP_H) * 100}%`,
                    }}
                  />
                ))}
              </div>
              <svg viewBox={`0 0 ${PF_MAP_W} ${PF_MAP_H}`} className="absolute inset-0 w-full h-full pointer-events-none">
                {aircraft.map((a) => {
                  const isSelected = selectedId === a.id;
                  const htmlY = PF_MAP_H - a.mapY;
                  const color = isSelected ? '#fbbf24' : '#22d3ee';
                  const trail = trails[a.id];
                  const trailPoints = trail && trail.length > 1
                    ? trail.map((p) => `${p.x},${p.y}`).join(' ')
                    : '';
                  return (
                    <g
                      key={a.id}
                      className="pointer-events-auto"
                      style={{ cursor: 'pointer' }}
                      onClick={() => setSelectedId((prev) => (prev === a.id ? null : a.id))}
                    >
                      {trailPoints ? (
                        <polyline
                          points={trailPoints}
                          fill="none"
                          stroke={color}
                          strokeWidth={isSelected ? 0.55 : 0.35}
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          opacity={isSelected ? 0.95 : 0.7}
                        />
                      ) : null}
                      <circle cx={a.mapX} cy={htmlY} r="4" fill="transparent" />
                      <g transform={`translate(${a.mapX},${htmlY}) rotate(${a.heading}) scale(0.55)`}>
                        <path
                          d={PLANE_BLIP_D}
                          fill={color}
                          stroke="rgba(15,23,42,0.9)"
                          strokeWidth={0.35}
                          paintOrder="stroke fill"
                        />
                      </g>
                      <text
                        x={a.mapX + 2.2}
                        y={htmlY - 2.4}
                        fill={color}
                        fontSize="2.6"
                        fontFamily="monospace"
                        fontWeight="bold"
                        style={{ textShadow: '0 1px 2px rgba(0,0,0,0.9)' }}
                      >
                        {a.callsign || a.robloxUsername}
                      </text>
                    </g>
                  );
                })}
              </svg>
            </div>
          </div>
        </div>

        <div className="absolute bottom-3 right-3 flex flex-col gap-1.5 z-10">
          <button type="button" onClick={() => updateZoom(zoom + 0.35)} className="p-2 rounded-lg bg-slate-900/90 border border-slate-600 text-slate-200" title="Zoom +">
            <ZoomIn className="h-4 w-4" />
          </button>
          <button type="button" onClick={() => updateZoom(zoom - 0.35)} className="p-2 rounded-lg bg-slate-900/90 border border-slate-600 text-slate-200" title="Zoom −">
            <ZoomOut className="h-4 w-4" />
          </button>
          <button type="button" onClick={() => { setZoom(1.15); setPan({ x: 0, y: 0 }); }} className="p-2 rounded-lg bg-slate-900/90 border border-slate-600 text-slate-200" title="Recentrer">
            <RotateCcw className="h-4 w-4" />
          </button>
        </div>
      </div>

      <div className="w-full md:w-[320px] shrink-0 rounded-xl border border-cyan-700/40 bg-slate-900/70 flex flex-col min-h-[220px] md:min-h-0">
        <div className="p-3 border-b border-slate-700/50 space-y-2">
          <div className="flex items-center justify-between gap-2">
            <p className="text-slate-200 text-sm font-semibold">Trafic serveur privé</p>
            <button type="button" onClick={() => { setLoading(true); fetchFlights(); }} className="p-1.5 rounded-md bg-slate-800 text-slate-300 hover:bg-slate-700" title="Actualiser">
              <RefreshCw className={`h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`} />
            </button>
          </div>
          <label className="block text-[11px] text-slate-500">
            ID serveur
            <input
              className="mt-1 w-full rounded-md bg-slate-800 border border-slate-600 px-2 py-1.5 text-xs font-mono text-cyan-200"
              value={serverId}
              onChange={(e) => setServerId(e.target.value)}
              onBlur={() => {
                const v = serverId.trim();
                setServerId(PF_SERVER_ID_RE.test(v) ? v : PF_DEFAULT_SERVER_ID);
              }}
            />
          </label>
          <p className="text-[11px] text-cyan-300/80 font-mono">{aircraft.length} avion{aircraft.length > 1 ? 's' : ''}</p>
        </div>
        <div className="flex-1 overflow-y-auto p-3 space-y-2">
          {error && <p className="text-red-400 text-xs">{error}</p>}
          {loading && aircraft.length === 0 && <p className="text-slate-500 text-sm text-center py-8">Chargement…</p>}
          {!loading && !error && aircraft.length === 0 && (
            <div className="text-center py-10 space-y-2">
              <Plane className="h-8 w-8 text-slate-600 mx-auto" />
              <p className="text-slate-500 text-sm">Aucun avion sur ce serveur pour le moment.</p>
              <p className="text-slate-600 text-[11px] px-2">
                Le tracker n’affiche un appareil que s’il est actif in-game et reporté sur cet ID.
              </p>
            </div>
          )}
          {aircraft.map((a) => (
            <button
              key={a.id}
              type="button"
              onClick={() => setSelectedId((prev) => (prev === a.id ? null : a.id))}
              className={`w-full text-left rounded-lg p-2.5 text-[11px] border transition ${
                selectedId === a.id
                  ? 'border-amber-400/50 bg-amber-950/30 text-slate-100'
                  : 'border-slate-700/50 bg-slate-800/50 text-slate-300 hover:border-cyan-700/50'
              }`}
            >
              <span className="font-mono font-bold text-cyan-300">{a.callsign || '—'}</span>
              <span className="text-slate-500 mx-1">·</span>
              <span className="text-slate-400">{a.robloxUsername}</span>
              <br />
              <span className="text-slate-500">
                {a.model || '—'} {a.livery ? `· ${a.livery.replace(/_/g, ' ')}` : ''}
              </span>
              <br />
              <span className="text-slate-500">
                FL{Math.max(0, Math.round(a.altitude / 100)).toString().padStart(3, '0')} · {a.speed} kt · {a.heading.toString().padStart(3, '0')}°
              </span>
            </button>
          ))}
          {selected && (
            <div className="rounded-lg border border-amber-500/30 bg-amber-950/20 p-2.5 text-[11px] text-slate-300">
              <p className="font-semibold text-amber-200 mb-1">Sélection</p>
              <p>{selected.callsign} — {selected.robloxUsername}</p>
              <p>{selected.model} · {selected.livery.replace(/_/g, ' ')}</p>
              <p>Alt {Math.round(selected.altitude)} ft · {selected.speed} kt</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
