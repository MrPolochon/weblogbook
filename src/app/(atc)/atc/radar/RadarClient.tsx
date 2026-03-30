'use client';

import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import {
  SVG_W, SVG_H,
  DEFAULT_POSITIONS, DEFAULT_ISLANDS, DEFAULT_FIR_ZONES,
  toSVG, detectSTCA, calculateHeading,
  PHASE_LABELS,
  type RadarTarget, type STCAPair, type Point,
} from '@/lib/radar-utils';
import { DEFAULT_VORS, DEFAULT_WAYPOINTS } from '@/lib/cartography-data';

const POLL_INTERVAL = 3000;
const TRAIL_LENGTH = 4;
const PTL_BASE_LENGTH = 40;
const RANGE_LEVELS = [
  { label: '25', factor: 0.25 },
  { label: '50', factor: 0.5 },
  { label: '100', factor: 1.0 },
  { label: '200', factor: 2.0 },
];
const CHAR_SIZES = ['S', 'M', 'L'] as const;
const CHAR_SIZE_PX = { S: 7, M: 9, L: 11 } as const;

/** Silhouette avion centrée sur (0,0), nez vers le haut (−Y), ~10 u de haut — rotation = cap magnétique ATC */
const PLANE_BLIP_D =
  'M0,-5.2 L1.35,-0.85 L2.8,-0.3 L2.8,0.55 L1.15,0.55 L1.15,3.6 L-1.15,3.6 L-1.15,0.55 L-2.8,0.55 L-2.8,-0.3 L-1.35,-0.85 Z';

interface DataBlockOffset { dx: number; dy: number }

export default function RadarClient({ userId }: { userId: string }) {
  const [targets, setTargets] = useState<RadarTarget[]>([]);
  const [dataSource, setDataSource] = useState<string>('interpolation');
  const [selected, setSelected] = useState<string | null>(null);
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number; targetId: string } | null>(null);
  const [stcaPairs, setStcaPairs] = useState<STCAPair[]>([]);
  const trailsRef = useRef<Map<string, Point[]>>(new Map());
  const blockOffsetsRef = useRef<Map<string, DataBlockOffset>>(new Map());

  const [centerAirport, setCenterAirport] = useState<string>('');
  const [rangeIdx, setRangeIdx] = useState(2);
  const [showIslands, setShowIslands] = useState(true);
  const [showFIR, setShowFIR] = useState(true);
  const [showAirports, setShowAirports] = useState(true);
  const [filterType, setFilterType] = useState<'ALL' | 'IFR' | 'VFR' | 'UNK'>('ALL');
  const [charSize, setCharSize] = useState<typeof CHAR_SIZES[number]>('M');
  const [showPTL, setShowPTL] = useState(true);
  const [stcaEnabled, setStcaEnabled] = useState(true);
  const [showUnknown, setShowUnknown] = useState(true);
  const [sweepAngle, setSweepAngle] = useState(0);

  const [actionModal, setActionModal] = useState<{ type: string; targetId: string } | null>(null);
  const [actionValue, setActionValue] = useState('');
  const [actionLoading, setActionLoading] = useState(false);

  const [atcSessions, setAtcSessions] = useState<{ aeroport: string; position: string }[]>([]);

  const svgRef = useRef<SVGSVGElement>(null);
  const draggingRef = useRef<{ id: string; startX: number; startY: number; origDx: number; origDy: number } | null>(null);

  const stcaTargetIds = useMemo(() => {
    const set = new Set<string>();
    stcaPairs.forEach(p => { set.add(p.targetA); set.add(p.targetB); });
    return set;
  }, [stcaPairs]);

  const fetchTargets = useCallback(async () => {
    try {
      const res = await fetch('/api/radar/targets');
      if (!res.ok) return;
      const data = await res.json();
      const newTargets: RadarTarget[] = data.targets ?? [];
      setTargets(newTargets);
      setDataSource(data.source ?? 'interpolation');

      const trails = trailsRef.current;
      for (const t of newTargets) {
        const trail = trails.get(t.id) ?? [];
        trail.unshift({ ...t.position });
        if (trail.length > TRAIL_LENGTH) trail.length = TRAIL_LENGTH;
        trails.set(t.id, trail);
      }

      if (stcaEnabled) {
        setStcaPairs(detectSTCA(newTargets, 30, 10));
      }
    } catch { /* ignore */ }
  }, [stcaEnabled]);

  useEffect(() => {
    fetchTargets();
    const interval = setInterval(fetchTargets, POLL_INTERVAL);
    return () => clearInterval(interval);
  }, [fetchTargets]);

  useEffect(() => {
    let raf: number;
    let last = performance.now();
    function animate(now: number) {
      const dt = now - last;
      last = now;
      setSweepAngle(prev => (prev + dt * 0.09) % 360);
      raf = requestAnimationFrame(animate);
    }
    raf = requestAnimationFrame(animate);
    return () => cancelAnimationFrame(raf);
  }, []);

  useEffect(() => {
    fetch('/api/atc/online').then(r => r.json()).then(data => {
      if (Array.isArray(data)) {
        setAtcSessions(data.map((s: { aeroport: string; position: string }) => ({
          aeroport: s.aeroport, position: s.position,
        })));
      }
    }).catch(() => {});
  }, []);

  const viewBox = useMemo(() => {
    const range = RANGE_LEVELS[rangeIdx];
    if (!centerAirport || !DEFAULT_POSITIONS[centerAirport]) {
      const w = SVG_W / range.factor;
      const h = SVG_H / range.factor;
      return `${(SVG_W - w) / 2} ${(SVG_H - h) / 2} ${w} ${h}`;
    }
    const pos = toSVG(DEFAULT_POSITIONS[centerAirport]);
    const w = SVG_W / range.factor;
    const h = SVG_H / range.factor;
    return `${pos.x - w / 2} ${pos.y - h / 2} ${w} ${h}`;
  }, [centerAirport, rangeIdx]);

  const filteredTargets = useMemo(() => {
    let result = targets;
    if (!showUnknown) {
      result = result.filter(t => t.identified !== false);
    }
    if (filterType === 'ALL') return result;
    if (filterType === 'UNK') return result.filter(t => !t.identified);
    return result.filter(t => t.type_vol === filterType);
  }, [targets, filterType, showUnknown]);

  const identifiedCount = useMemo(() => targets.filter(t => t.identified).length, [targets]);
  const unknownCount = useMemo(() => targets.filter(t => !t.identified).length, [targets]);

  const selectedTarget = useMemo(
    () => targets.find(t => t.id === selected) ?? null,
    [targets, selected],
  );

  async function doAction(action: string, planId: string, value?: string) {
    setActionLoading(true);
    try {
      await fetch('/api/radar/actions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action, plan_vol_id: planId, value }),
      });
      fetchTargets();
    } catch { /* ignore */ }
    setActionLoading(false);
    setContextMenu(null);
    setActionModal(null);
    setActionValue('');
  }

  function handleSvgClick(e: React.MouseEvent<SVGSVGElement>) {
    if (contextMenu) { setContextMenu(null); return; }
    const target = (e.target as SVGElement).closest('[data-target-id]');
    if (target) {
      setSelected(target.getAttribute('data-target-id'));
    } else {
      setSelected(null);
    }
  }

  function handleSvgContextMenu(e: React.MouseEvent<SVGSVGElement>) {
    e.preventDefault();
    const target = (e.target as SVGElement).closest('[data-target-id]');
    if (!target) { setContextMenu(null); return; }
    const id = target.getAttribute('data-target-id')!;
    setSelected(id);
    setContextMenu({ x: e.clientX, y: e.clientY, targetId: id });
  }

  function handleSvgDoubleClick(e: React.MouseEvent<SVGSVGElement>) {
    const target = (e.target as SVGElement).closest('[data-target-id]');
    if (target) {
      const id = target.getAttribute('data-target-id')!;
      const t = targets.find(t => t.id === id);
      if (t) {
        const nearestApt = Object.entries(DEFAULT_POSITIONS).reduce((best, [code, pos]) => {
          const svgPos = toSVG(pos);
          const d = Math.sqrt((svgPos.x - t.position.x) ** 2 + (svgPos.y - t.position.y) ** 2);
          return d < best.d ? { code, d } : best;
        }, { code: '', d: Infinity });
        if (nearestApt.code) setCenterAirport(nearestApt.code);
      }
    }
  }

  function startBlockDrag(e: React.PointerEvent, targetId: string) {
    e.stopPropagation();
    const offset = blockOffsetsRef.current.get(targetId) ?? { dx: 20, dy: -10 };
    draggingRef.current = { id: targetId, startX: e.clientX, startY: e.clientY, origDx: offset.dx, origDy: offset.dy };
    const onMove = (me: PointerEvent) => {
      if (!draggingRef.current) return;
      const svg = svgRef.current;
      if (!svg) return;
      const vb = svg.viewBox.baseVal;
      const rect = svg.getBoundingClientRect();
      const scaleX = vb.width / rect.width;
      const scaleY = vb.height / rect.height;
      const dxPx = me.clientX - draggingRef.current.startX;
      const dyPx = me.clientY - draggingRef.current.startY;
      blockOffsetsRef.current.set(targetId, {
        dx: draggingRef.current.origDx + dxPx * scaleX,
        dy: draggingRef.current.origDy + dyPx * scaleY,
      });
      setTargets(prev => [...prev]);
    };
    const onUp = () => {
      draggingRef.current = null;
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
    };
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
  }

  const fontSize = CHAR_SIZE_PX[charSize];
  const utcNow = new Date().toISOString().substring(11, 19);

  return (
    <div className="flex flex-col h-[calc(100vh-4rem)] bg-[#080808] text-[#00ff41] select-none overflow-hidden -mx-4 -my-6">
      {stcaEnabled && stcaPairs.length > 0 && (
        <div className="bg-red-900/80 text-red-200 px-4 py-1 text-xs font-mono flex items-center gap-4 flex-shrink-0 animate-pulse">
          <span className="font-bold">⚠ STCA</span>
          {stcaPairs.map((p, i) => {
            const a = targets.find(t => t.id === p.targetA);
            const b = targets.find(t => t.id === p.targetB);
            return (
              <span key={i}>
                {a?.callsign ?? '?'} / {b?.callsign ?? '?'} ({p.horizontalDistance.toFixed(0)}u, ΔFL{p.verticalSeparation.toFixed(0)})
              </span>
            );
          })}
        </div>
      )}

      <div className="flex flex-1 min-h-0">
        <div className="flex-1 relative">
          <svg
            ref={svgRef}
            viewBox={viewBox}
            className="w-full h-full"
            style={{ background: '#080808' }}
            onClick={handleSvgClick}
            onContextMenu={handleSvgContextMenu}
            onDoubleClick={handleSvgDoubleClick}
          >
            <defs>
              <radialGradient id="sweepGrad" cx="50%" cy="50%" r="50%">
                <stop offset="0%" stopColor="#00ff41" stopOpacity="0.08" />
                <stop offset="100%" stopColor="#00ff41" stopOpacity="0" />
              </radialGradient>
            </defs>

            {[128, 256, 384].map(r => (
              <circle key={r} cx={SVG_W / 2} cy={SVG_H / 2} r={r} fill="none" stroke="#0a2a15" strokeWidth="0.5" />
            ))}
            <line x1={0} y1={SVG_H / 2} x2={SVG_W} y2={SVG_H / 2} stroke="#0a2a15" strokeWidth="0.3" />
            <line x1={SVG_W / 2} y1={0} x2={SVG_W / 2} y2={SVG_H} stroke="#0a2a15" strokeWidth="0.3" />

            <line
              x1={SVG_W / 2}
              y1={SVG_H / 2}
              x2={SVG_W / 2 + Math.cos((sweepAngle * Math.PI) / 180) * 600}
              y2={SVG_H / 2 + Math.sin((sweepAngle * Math.PI) / 180) * 600}
              stroke="#00ff41"
              strokeWidth="1"
              opacity="0.15"
            />

            {showFIR && DEFAULT_FIR_ZONES.map(fir => (
              <g key={fir.id}>
                <polygon
                  points={fir.points.map(p => `${p.x},${p.y}`).join(' ')}
                  fill="none"
                  stroke="#0d3320"
                  strokeWidth="1"
                  strokeDasharray="6 4"
                  opacity="0.6"
                />
                <text
                  x={fir.points.reduce((s, p) => s + p.x, 0) / fir.points.length}
                  y={fir.points.reduce((s, p) => s + p.y, 0) / fir.points.length}
                  fill="#0d4a28"
                  fontSize="10"
                  fontFamily="monospace"
                  textAnchor="middle"
                  opacity="0.5"
                >
                  {fir.name}
                </text>
              </g>
            ))}

            {showIslands && DEFAULT_ISLANDS.map(island => (
              <polygon
                key={island.id}
                points={island.points.map(p => `${p.x},${p.y}`).join(' ')}
                fill="#0d2a18"
                stroke="#1a4a30"
                strokeWidth="0.8"
                opacity="0.12"
              />
            ))}

            {DEFAULT_WAYPOINTS.map((waypoint) => {
              const point = toSVG(waypoint);
              return (
                <g key={waypoint.code} opacity="0.3">
                  <circle cx={point.x} cy={point.y} r="1.1" fill="#84cc16" />
                  <text x={point.x + 4} y={point.y - 3} fill="#65a30d" fontSize="5" fontFamily="monospace">
                    {waypoint.code}
                  </text>
                </g>
              );
            })}

            {DEFAULT_VORS.map((vor) => {
              const point = toSVG(vor);
              return (
                <g key={vor.code} opacity="0.35">
                  <circle cx={point.x} cy={point.y} r="5" fill="none" stroke="#22d3ee" strokeWidth="0.6" />
                  <circle cx={point.x} cy={point.y} r="1.5" fill="#22d3ee" />
                  <text x={point.x + 6} y={point.y - 5} fill="#0891b2" fontSize="5" fontFamily="monospace">
                    {vor.code}
                  </text>
                </g>
              );
            })}

            {showAirports && Object.entries(DEFAULT_POSITIONS).map(([code, pos]) => {
              const svgPos = toSVG(pos);
              return (
                <g key={code}>
                  <line x1={svgPos.x - 4} y1={svgPos.y} x2={svgPos.x + 4} y2={svgPos.y} stroke="#00cc44" strokeWidth="0.8" opacity="0.5" />
                  <line x1={svgPos.x} y1={svgPos.y - 4} x2={svgPos.x} y2={svgPos.y + 4} stroke="#00cc44" strokeWidth="0.8" opacity="0.5" />
                  <text x={svgPos.x} y={svgPos.y + 12} fill="#00cc44" fontSize="6" fontFamily="monospace" textAnchor="middle" opacity="0.5">
                    {code}
                  </text>
                </g>
              );
            })}

            {filteredTargets.map(target => {
              const isSelected = target.id === selected;
              const isSTCA = stcaTargetIds.has(target.id);
              const isAssumedByMe = target.assumed_by === userId;
              const isTransfer = !!target.assumed_by && !isAssumedByMe;
              const isUnknown = !target.identified;
              const trail = trailsRef.current.get(target.id) ?? [];
              const blockOffset = blockOffsetsRef.current.get(target.id) ?? { dx: 20, dy: -10 };

              let blipColor = '#cccccc';
              if (isSTCA) blipColor = '#ff3333';
              else if (isUnknown) blipColor = '#ff9632';
              else if (target.on_ground) blipColor = '#666666';
              else if (isAssumedByMe) blipColor = '#00ff41';
              else if (isTransfer) blipColor = '#ffcc00';

              let labelColor = '#cccccc';
              if (isSTCA) labelColor = '#ff3333';
              else if (isUnknown) labelColor = '#ff9632';
              else if (isAssumedByMe) labelColor = '#00ff41';
              else if (isTransfer) labelColor = '#ffcc00';

              const trailForHeading = trailsRef.current.get(target.id) ?? [];
              let headingDeg = target.heading;
              if (trailForHeading.length >= 2) {
                const pNew = trailForHeading[0];
                const pOld = trailForHeading[1];
                const tdist = Math.hypot(pNew.x - pOld.x, pNew.y - pOld.y);
                if (tdist > 0.25) headingDeg = calculateHeading(pOld, pNew);
              }
              const headingRad = (headingDeg * Math.PI) / 180;
              const ptlLen = PTL_BASE_LENGTH;
              const labelStroke = 'rgba(2,6,23,0.92)';

              return (
                <g key={target.id} data-target-id={target.id} style={{ cursor: 'pointer' }}>
                  {trail.map((pos, i) => (
                    <circle
                      key={i}
                      cx={pos.x}
                      cy={pos.y}
                      r={1.2}
                      fill={blipColor}
                      opacity={0.55 - i * 0.12}
                    />
                  ))}

                  {showPTL && !target.on_ground && (
                    <line
                      x1={target.position.x}
                      y1={target.position.y}
                      x2={target.position.x + Math.sin(headingRad) * ptlLen}
                      y2={target.position.y - Math.cos(headingRad) * ptlLen}
                      stroke={blipColor}
                      strokeWidth="0.55"
                      strokeDasharray="3 2"
                      opacity="0.45"
                    />
                  )}

                  <g transform={`translate(${target.position.x},${target.position.y}) rotate(${headingDeg})`}>
                    <path
                      d={PLANE_BLIP_D}
                      fill={blipColor}
                      stroke={isSelected ? '#ffffff' : 'rgba(0,0,0,0.55)'}
                      strokeWidth={isSelected ? 0.45 : 0.22}
                      strokeLinejoin="round"
                    >
                      {(isSTCA || isUnknown) && (
                        <animate attributeName="opacity" values="1;0.45;1" dur={isSTCA ? '0.5s' : '1.4s'} repeatCount="indefinite" />
                      )}
                    </path>
                  </g>

                  <line
                    x1={target.position.x}
                    y1={target.position.y}
                    x2={target.position.x + blockOffset.dx}
                    y2={target.position.y + blockOffset.dy}
                    stroke={labelColor}
                    strokeWidth="0.3"
                    opacity="0.4"
                  />

                  <g
                    onPointerDown={(e) => startBlockDrag(e, target.id)}
                    style={{ cursor: 'grab' }}
                  >
                    {isUnknown ? (
                      <text
                        x={target.position.x + blockOffset.dx}
                        y={target.position.y + blockOffset.dy}
                        fill={labelColor}
                        stroke={labelStroke}
                        strokeWidth={1.15}
                        paintOrder="stroke fill"
                        fontSize={fontSize}
                        fontFamily="monospace"
                        fontWeight={isSelected ? 'bold' : 'normal'}
                      >
                        <animate attributeName="opacity" values="1;0.5;1" dur="2s" repeatCount="indefinite" />
                        <tspan x={target.position.x + blockOffset.dx} dy="0" stroke={labelStroke} paintOrder="stroke fill">
                          {target.roblox_username || 'INCONNU'}
                        </tspan>
                        <tspan x={target.position.x + blockOffset.dx} dy={fontSize + 1} fill="#fdba74" stroke={labelStroke} paintOrder="stroke fill">
                          PAS DE PDV
                        </tspan>
                      </text>
                    ) : (
                      <text
                        x={target.position.x + blockOffset.dx}
                        y={target.position.y + blockOffset.dy}
                        fill={labelColor}
                        stroke={labelStroke}
                        strokeWidth={1.15}
                        paintOrder="stroke fill"
                        fontSize={fontSize}
                        fontFamily="monospace"
                        fontWeight={isSelected ? 'bold' : 'normal'}
                      >
                        {isSTCA && <animate attributeName="opacity" values="1;0.3;1" dur="0.5s" repeatCount="indefinite" />}
                        <tspan x={target.position.x + blockOffset.dx} dy="0" stroke={labelStroke} paintOrder="stroke fill">{target.callsign}</tspan>
                        <tspan x={target.position.x + blockOffset.dx} dy={fontSize + 1} stroke={labelStroke} paintOrder="stroke fill">
                          {target.altitude_unit}{target.altitude ?? '???'} {target.progress > 0.5 ? '↓' : '↑'}
                        </tspan>
                        <tspan x={target.position.x + blockOffset.dx} dy={fontSize + 1} stroke={labelStroke} paintOrder="stroke fill">
                          A{target.squawk ?? '????'}
                        </tspan>
                        <tspan x={target.position.x + blockOffset.dx} dy={fontSize + 1} stroke={labelStroke} paintOrder="stroke fill">
                          {target.aeroport_arrivee}→
                        </tspan>
                      </text>
                    )}
                  </g>
                </g>
              );
            })}
          </svg>

          {contextMenu && (
            <div
              className="fixed z-50 bg-[#111] border border-[#0d3320] rounded shadow-xl py-1 text-xs font-mono min-w-[180px]"
              style={{ left: contextMenu.x, top: contextMenu.y }}
              onClick={e => e.stopPropagation()}
            >
              {(() => {
                const ct = targets.find(t => t.id === contextMenu.targetId);
                if (!ct) return null;
                const isMyTraffic = ct.assumed_by === userId;

                if (!ct.identified) {
                  return (
                    <>
                      <div className="px-3 py-1.5 text-[#ff9632] font-bold border-b border-[#0d3320]">
                        {ct.roblox_username || 'INCONNU'}
                      </div>
                      <div className="px-3 py-1.5 text-[#666] italic">
                        Cible non identifiée — pas de plan de vol
                      </div>
                      <button
                        className="w-full text-left px-3 py-1.5 hover:bg-[#0d3320] text-[#ff9632]"
                        onClick={() => { setActionModal({ type: 'tag_unknown', targetId: ct.id }); setContextMenu(null); }}
                      >
                        Associer à un plan (ID)
                      </button>
                    </>
                  );
                }

                return (
                  <>
                    <div className="px-3 py-1.5 text-[#00ff41] font-bold border-b border-[#0d3320]">
                      {ct.callsign}
                    </div>
                    {!isMyTraffic && (
                      <button
                        className="w-full text-left px-3 py-1.5 hover:bg-[#0d3320] text-[#00ff41]"
                        onClick={() => doAction('assume', ct.id)}
                        disabled={actionLoading}
                      >
                        Assume
                      </button>
                    )}
                    {isMyTraffic && (
                      <button
                        className="w-full text-left px-3 py-1.5 hover:bg-[#0d3320] text-[#ffcc00]"
                        onClick={() => doAction('release', ct.id)}
                        disabled={actionLoading}
                      >
                        Release
                      </button>
                    )}
                    {isMyTraffic && (
                      <button
                        className="w-full text-left px-3 py-1.5 hover:bg-[#0d3320] text-[#cccccc]"
                        onClick={() => { setActionModal({ type: 'transfer', targetId: ct.id }); setContextMenu(null); }}
                      >
                        Transfer →
                      </button>
                    )}
                    <button
                      className="w-full text-left px-3 py-1.5 hover:bg-[#0d3320] text-[#cccccc]"
                      onClick={() => { setActionModal({ type: 'set_altitude', targetId: ct.id }); setContextMenu(null); }}
                    >
                      Set FL
                    </button>
                    <button
                      className="w-full text-left px-3 py-1.5 hover:bg-[#0d3320] text-[#cccccc]"
                      onClick={() => { setActionModal({ type: 'set_squawk', targetId: ct.id }); setContextMenu(null); }}
                    >
                      Set Squawk
                    </button>
                    <button
                      className="w-full text-left px-3 py-1.5 hover:bg-[#0d3320] text-[#cccccc]"
                      onClick={() => { setSelected(ct.id); setContextMenu(null); }}
                    >
                      Voir plan de vol
                    </button>
                  </>
                );
              })()}
            </div>
          )}
        </div>

        {selectedTarget && (
          <div className="w-72 bg-[#0a0a0a] border-l border-[#0d3320] flex flex-col overflow-y-auto flex-shrink-0">
            <div className="p-3 border-b border-[#0d3320]">
              <div className="flex items-center justify-between">
                <span className={`font-mono font-bold text-sm ${selectedTarget.identified ? 'text-[#00ff41]' : 'text-[#ff9632]'}`}>
                  {selectedTarget.identified ? selectedTarget.callsign : (selectedTarget.roblox_username || 'INCONNU')}
                </span>
                <button onClick={() => setSelected(null)} className="text-[#666] hover:text-[#ccc] text-xs">✕</button>
              </div>
              {selectedTarget.identified ? (
                <span className="text-[#666] font-mono text-xs">{selectedTarget.numero_vol}</span>
              ) : (
                <span className="text-[#996622] font-mono text-xs">Cible non identifiée</span>
              )}
            </div>
            <div className="p-3 space-y-2 text-xs font-mono">
              {selectedTarget.identified ? (
                <>
                  <Row label="Type" value={selectedTarget.type_vol} />
                  <Row label="Départ" value={selectedTarget.aeroport_depart} />
                  <Row label="Arrivée" value={selectedTarget.aeroport_arrivee} />
                  <Row label="Altitude" value={`${selectedTarget.altitude_unit}${selectedTarget.altitude ?? '???'}`} />
                  <Row label="Squawk" value={selectedTarget.squawk ?? '????'} />
                  <Row label="Cap" value={`${selectedTarget.heading.toFixed(0)}°`} />
                  <Row label="Progression" value={`${(selectedTarget.progress * 100).toFixed(0)}%`} />
                  <Row label="Phase" value={PHASE_LABELS[selectedTarget.flight_phase]} />
                  <Row label="Temps prévu" value={`${selectedTarget.temps_prev_min} min`} />
                  {selectedTarget.route && <Row label="Route" value={selectedTarget.route} />}
                  {selectedTarget.sid && <Row label="SID" value={selectedTarget.sid} />}
                  {selectedTarget.star && <Row label="STAR" value={selectedTarget.star} />}
                  <Row label="Pilote" value={selectedTarget.pilote_identifiant ?? '—'} />
                  <Row label="Contrôle" value={selectedTarget.assumed_position ? `${selectedTarget.assumed_aeroport} ${selectedTarget.assumed_position}` : 'Non assumé'} />
                  <Row label="Source" value={selectedTarget.source} />
                  <div className="pt-2 flex gap-1">
                    {selectedTarget.assumed_by !== userId ? (
                      <button className="flex-1 bg-[#0d3320] hover:bg-[#1a4a30] text-[#00ff41] py-1 rounded text-center" onClick={() => doAction('assume', selectedTarget.id)}>
                        Assume
                      </button>
                    ) : (
                      <button className="flex-1 bg-[#3a2a00] hover:bg-[#4a3a10] text-[#ffcc00] py-1 rounded text-center" onClick={() => doAction('release', selectedTarget.id)}>
                        Release
                      </button>
                    )}
                  </div>
                </>
              ) : (
                <>
                  <Row label="Source" value="capture" />
                  <Row label="Position" value={`${selectedTarget.position.x.toFixed(0)}, ${selectedTarget.position.y.toFixed(0)}`} />
                  {selectedTarget.roblox_username && (
                    <Row label="Roblox" value={selectedTarget.roblox_username} />
                  )}
                  <div className="pt-3 border-t border-[#0d3320] mt-3">
                    <p className="text-[#996622] text-[10px] leading-relaxed">
                      Cette cible a été détectée sur la minimap mais ne correspond à aucun plan de vol actif.
                      Le pilote n&apos;a probablement pas déposé de plan de vol.
                    </p>
                  </div>
                  <button
                    className="w-full mt-2 rounded bg-[#3b2a10] hover:bg-[#5a3a10] text-[#ffcc80] py-1.5"
                    onClick={() => setActionModal({ type: 'tag_unknown', targetId: selectedTarget.id })}
                  >
                    Associer à un plan de vol
                  </button>
                </>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Control bar */}
      <div className="bg-[#0a0a0a] border-t border-[#0d3320] px-3 py-1.5 flex items-center gap-3 text-xs font-mono flex-shrink-0 flex-wrap">
        <select
          value={centerAirport}
          onChange={e => setCenterAirport(e.target.value)}
          className="bg-[#111] border border-[#0d3320] text-[#00ff41] px-2 py-1 rounded text-xs"
        >
          <option value="">APT SELECT</option>
          {Object.keys(DEFAULT_POSITIONS).map(code => (
            <option key={code} value={code}>{code}</option>
          ))}
        </select>

        <div className="flex items-center gap-1">
          <span className="text-[#666]">RANGE</span>
          {RANGE_LEVELS.map((r, i) => (
            <button
              key={r.label}
              onClick={() => setRangeIdx(i)}
              className={`px-1.5 py-0.5 rounded text-[10px] ${i === rangeIdx ? 'bg-[#0d3320] text-[#00ff41]' : 'text-[#666] hover:text-[#00ff41]'}`}
            >
              {r.label}
            </button>
          ))}
        </div>

        <div className="flex items-center gap-1">
          <span className="text-[#666]">MAPS</span>
          <button onClick={() => setShowIslands(v => !v)} className={showIslands ? 'text-[#00ff41]' : 'text-[#333]'}>ISL</button>
          <button onClick={() => setShowFIR(v => !v)} className={showFIR ? 'text-[#00ff41]' : 'text-[#333]'}>FIR</button>
          <button onClick={() => setShowAirports(v => !v)} className={showAirports ? 'text-[#00ff41]' : 'text-[#333]'}>APT</button>
        </div>

        <div className="flex items-center gap-1">
          <span className="text-[#666]">FILTER</span>
          {(['ALL', 'IFR', 'VFR', 'UNK'] as const).map(f => (
            <button key={f} onClick={() => setFilterType(f)} className={`px-1.5 py-0.5 rounded text-[10px] ${filterType === f ? 'bg-[#0d3320] text-[#00ff41]' : 'text-[#666]'}`}>
              {f}
            </button>
          ))}
        </div>

        <button onClick={() => setShowPTL(v => !v)} className={showPTL ? 'text-[#00ff41]' : 'text-[#333]'}>PTL</button>

        <button
          onClick={() => setShowUnknown(v => !v)}
          className={showUnknown ? 'text-[#ff9632]' : 'text-[#333]'}
          title="Afficher/masquer les cibles inconnues"
        >
          UNK
        </button>

        <div className="flex items-center gap-1">
          <span className="text-[#666]">CHAR</span>
          {CHAR_SIZES.map(s => (
            <button key={s} onClick={() => setCharSize(s)} className={`px-1 py-0.5 text-[10px] ${charSize === s ? 'text-[#00ff41]' : 'text-[#666]'}`}>
              {s}
            </button>
          ))}
        </div>

        <button onClick={() => setStcaEnabled(v => !v)} className={stcaEnabled ? 'text-red-400' : 'text-[#333]'}>STCA</button>

        <button onClick={fetchTargets} className="text-[#00ff41] hover:text-white px-1">↻</button>

        <div className="ml-auto flex items-center gap-3 text-[#666]">
          <span className={dataSource === 'capture' ? 'text-[#00ff41]' : dataSource === 'mixed' ? 'text-[#ffcc00]' : 'text-[#ff9632]'}>
            {dataSource === 'capture' ? '● LIVE' : dataSource === 'mixed' ? '● MIX' : '● INTERP'}
          </span>
          <span>IDT: {identifiedCount}</span>
          {unknownCount > 0 && <span className="text-[#ff9632]">UNK: {unknownCount}</span>}
          <span className="tabular-nums">{utcNow} UTC</span>
        </div>
      </div>

      {actionModal && (
        <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center" onClick={() => { setActionModal(null); setActionValue(''); }}>
          <div className="bg-[#111] border border-[#0d3320] rounded-lg p-4 min-w-[280px] font-mono text-xs" onClick={e => e.stopPropagation()}>
            <h3 className="text-[#00ff41] font-bold mb-3">
              {actionModal.type === 'transfer' ? 'Transfer vers' :
               actionModal.type === 'set_altitude' ? 'Set FL' :
               actionModal.type === 'set_squawk' ? 'Set Squawk' : 'Associer cible INCONNUE'}
            </h3>

            {actionModal.type === 'transfer' ? (
              <div className="space-y-1 max-h-48 overflow-y-auto">
                {atcSessions.map((s, i) => (
                  <button
                    key={i}
                    className="w-full text-left px-2 py-1.5 hover:bg-[#0d3320] text-[#cccccc] rounded"
                    onClick={() => doAction('transfer', actionModal.targetId, `${s.aeroport}:${s.position}`)}
                    disabled={actionLoading}
                  >
                    {s.aeroport} — {s.position}
                  </button>
                ))}
                {atcSessions.length === 0 && <p className="text-[#666]">Aucun ATC en ligne</p>}
              </div>
            ) : (
              <div className="flex gap-2">
                <input
                  type="text"
                  value={actionValue}
                  onChange={e => setActionValue(e.target.value)}
                  className="flex-1 bg-[#0a0a0a] border border-[#0d3320] text-[#00ff41] px-2 py-1 rounded"
                  placeholder={
                    actionModal.type === 'set_altitude' ? 'ex: 350'
                      : actionModal.type === 'set_squawk' ? 'ex: 2471'
                        : 'ID du plan de vol'
                  }
                  autoFocus
                  onKeyDown={e => { if (e.key === 'Enter') doAction(actionModal.type, actionModal.targetId, actionValue); }}
                />
                <button
                  className="bg-[#0d3320] text-[#00ff41] px-3 py-1 rounded hover:bg-[#1a4a30]"
                  onClick={() => doAction(actionModal.type, actionModal.targetId, actionValue)}
                  disabled={actionLoading || !actionValue}
                >
                  OK
                </button>
              </div>
            )}

            <button className="mt-3 text-[#666] hover:text-[#ccc]" onClick={() => { setActionModal(null); setActionValue(''); }}>
              Annuler
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between">
      <span className="text-[#666]">{label}</span>
      <span className="text-[#00ff41]">{value}</span>
    </div>
  );
}
