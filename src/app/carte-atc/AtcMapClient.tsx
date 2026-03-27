'use client';

import { useState, useCallback, useRef, useEffect } from 'react';
import { RefreshCw, Radio } from 'lucide-react';
import {
  DEFAULT_FIR_ZONES,
  DEFAULT_ISLANDS,
  DEFAULT_POSITIONS,
  DEFAULT_VORS,
  DEFAULT_WAYPOINTS,
  AIRPORT_NAMES,
  type FIRZone,
  type Island,
  type Point,
} from '@/lib/cartography-data';

interface AtcSession {
  aeroport: string;
  position: string;
  started_at: string;
  callsign: string | null;
}

const POSITION_PRIORITY = ['Center', 'APP', 'DEP', 'Tower', 'Ground', 'Delivery', 'Clairance'] as const;

function formatDuration(startedAt: string): string {
  const ms = Date.now() - new Date(startedAt).getTime();
  const mins = Math.floor(ms / 60000);
  if (mins < 60) return `${mins}min`;
  const h = Math.floor(mins / 60);
  return `${h}h${String(mins % 60).padStart(2, '0')}`;
}

function FourPointStar({ cx, cy, outerR, innerR, rotation = 0, fill, stroke, strokeWidth = 1, opacity = 1 }: {
  cx: number; cy: number; outerR: number; innerR: number; rotation?: number;
  fill: string; stroke: string; strokeWidth?: number; opacity?: number;
}) {
  const points: string[] = [];
  for (let i = 0; i < 8; i++) {
    const angle = (i * 45 + rotation) * (Math.PI / 180);
    const r = i % 2 === 0 ? outerR : innerR;
    points.push(`${cx + r * Math.cos(angle - Math.PI / 2)},${cy + r * Math.sin(angle - Math.PI / 2)}`);
  }
  return <polygon points={points.join(' ')} fill={fill} stroke={stroke} strokeWidth={strokeWidth} opacity={opacity} />;
}

export default function AtcMapClient() {
  const [sessions, setSessions] = useState<AtcSession[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedAirport, setSelectedAirport] = useState<string | null>(null);
  const mapContainerRef = useRef<HTMLDivElement>(null);
  const [now, setNow] = useState(Date.now());

  const fetchSessions = useCallback(async () => {
    try {
      const res = await fetch('/api/atc/online');
      if (res.ok) {
        const data = await res.json();
        setSessions(Array.isArray(data) ? data : []);
      }
    } catch { /* ignore */ }
    setLoading(false);
  }, []);

  useEffect(() => { fetchSessions(); }, [fetchSessions]);

  useEffect(() => {
    const interval = setInterval(() => {
      fetchSessions();
      setNow(Date.now());
    }, 15000);
    return () => clearInterval(interval);
  }, [fetchSessions]);

  const sessionsByAirport = new Map<string, AtcSession[]>();
  sessions.forEach(s => {
    const list = sessionsByAirport.get(s.aeroport) || [];
    list.push(s);
    sessionsByAirport.set(s.aeroport, list);
  });

  const centerAirports = new Set(
    sessions.filter(s => s.position === 'Center').map(s => s.aeroport)
  );

  const airportsWithATC = Array.from(sessionsByAirport.entries())
    .map(([code, sess]) => ({
      code,
      name: AIRPORT_NAMES[code] || code,
      sessions: sess.sort((a, b) =>
        POSITION_PRIORITY.indexOf(a.position as typeof POSITION_PRIORITY[number]) -
        POSITION_PRIORITY.indexOf(b.position as typeof POSITION_PRIORITY[number])
      ),
    }))
    .sort((a, b) => b.sessions.length - a.sessions.length);

  const hasPosition = (code: string, pos: string) =>
    sessionsByAirport.get(code)?.some(s => s.position === pos) || false;

  void now;

  return (
    <div className="min-h-screen bg-gradient-to-b from-slate-950 via-slate-900 to-slate-950">
      <header className="border-b border-slate-700/50 bg-slate-900/80 backdrop-blur-sm">
        <div className="max-w-[1600px] mx-auto px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Radio className="h-6 w-6 text-emerald-400" />
            <h1 className="text-xl font-bold text-slate-100">Carte ATC en direct</h1>
            <span className="text-xs px-2 py-0.5 rounded-full bg-emerald-600/20 text-emerald-400 border border-emerald-600/30">
              {sessions.length} contrôleur{sessions.length > 1 ? 's' : ''} en ligne
            </span>
          </div>
          <button onClick={() => { setLoading(true); fetchSessions(); }} className="p-2 rounded-lg bg-slate-800 text-slate-300 hover:bg-slate-700" title="Actualiser">
            <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
          </button>
        </div>
      </header>

      <div className="max-w-[1600px] mx-auto p-4 flex gap-4" style={{ height: 'calc(100vh - 60px)' }}>
        {/* Carte */}
        <div className="flex-1 relative rounded-xl border border-slate-700/50 bg-slate-800/30 overflow-hidden"
          ref={mapContainerRef}
        >
          <div style={{ width: '100%', height: '100%' }}>
            <svg viewBox="0 0 1024 787" className="w-full h-full" style={{ background: 'linear-gradient(180deg, #0f172a 0%, #1a2744 50%, #0f172a 100%)' }}>
              {/* Grille radar */}
              <defs>
                <pattern id="radarGrid" x="0" y="0" width="64" height="49.19" patternUnits="userSpaceOnUse">
                  <path d="M 64 0 L 0 0 0 49.19" fill="none" stroke="rgba(100,150,200,0.06)" strokeWidth="0.5" />
                </pattern>
              </defs>
              <rect width="1024" height="787" fill="url(#radarGrid)" />

              {/* FIR zones - seulement si CTR en ligne */}
              {DEFAULT_FIR_ZONES.map(fir => {
                if (!centerAirports.has(fir.code)) return null;
                return (
                  <g key={fir.id}>
                    <polygon
                      points={fir.points.map(p => `${p.x},${p.y}`).join(' ')}
                      fill={fir.color}
                      stroke={fir.borderColor}
                      strokeWidth="2"
                      strokeDasharray="8 4"
                      opacity="0.9"
                    />
                    <text
                      x={fir.points.reduce((s, p) => s + p.x, 0) / fir.points.length}
                      y={fir.points.reduce((s, p) => s + p.y, 0) / fir.points.length}
                      fill={fir.borderColor}
                      fontSize="14"
                      fontFamily="monospace"
                      fontWeight="bold"
                      textAnchor="middle"
                      opacity="0.7"
                    >
                      {fir.name}
                    </text>
                  </g>
                );
              })}

              {/* Iles */}
              {DEFAULT_ISLANDS.map(island => (
                <polygon
                  key={island.id}
                  points={island.points.map(p => `${p.x},${p.y}`).join(' ')}
                  fill={island.fill}
                  stroke={island.stroke}
                  strokeWidth="1.5"
                  opacity="0.18"
                />
              ))}

              {DEFAULT_WAYPOINTS.map((waypoint) => {
                const x = waypoint.x * 10.24;
                const y = waypoint.y * 7.87;
                return (
                  <g key={waypoint.code} opacity="0.34">
                    <circle cx={x} cy={y} r="1.5" fill="#84cc16" />
                    <text x={x + 4} y={y - 3} fill="#bef264" fontSize="6" fontFamily="monospace">
                      {waypoint.code}
                    </text>
                  </g>
                );
              })}

              {DEFAULT_VORS.map((vor) => {
                const x = vor.x * 10.24;
                const y = vor.y * 7.87;
                return (
                  <g key={vor.code} opacity="0.4">
                    <circle cx={x} cy={y} r="6" fill="none" stroke="#22d3ee" strokeWidth="1" />
                    <circle cx={x} cy={y} r="2" fill="#22d3ee" />
                    <text x={x + 8} y={y - 6} fill="#67e8f9" fontSize="7" fontFamily="monospace">
                      {vor.code}
                    </text>
                  </g>
                );
              })}

              {/* Overlays ATC pour chaque aéroport */}
              {Object.entries(DEFAULT_POSITIONS).map(([code, pos]) => {
                const x = pos.x * 10.24;
                const y = pos.y * 7.87;
                const hasATC = sessionsByAirport.has(code);
                const hasApp = hasPosition(code, 'APP');
                const hasDep = hasPosition(code, 'DEP');
                const hasTwr = hasPosition(code, 'Tower');
                const hasGnd = hasPosition(code, 'Ground');
                const hasDel = hasPosition(code, 'Delivery') || hasPosition(code, 'Clairance');

                return (
                  <g key={code} onClick={() => setSelectedAirport(selectedAirport === code ? null : code)} style={{ cursor: 'pointer' }}>
                    {/* APP - cercle bleu */}
                    {hasApp && (
                      <circle cx={x} cy={y} r="55" fill="rgba(59,130,246,0.06)" stroke="#3b82f6" strokeWidth="2" strokeDasharray="6 4" opacity="0.9">
                        <animate attributeName="r" values="52;58;52" dur="4s" repeatCount="indefinite" />
                      </circle>
                    )}

                    {/* DEP - cercle blanc */}
                    {hasDep && (
                      <circle cx={x} cy={y} r="45" fill="rgba(255,255,255,0.03)" stroke="rgba(255,255,255,0.5)" strokeWidth="1.5" strokeDasharray="5 5" opacity="0.8">
                        <animate attributeName="r" values="42;48;42" dur="5s" repeatCount="indefinite" />
                      </circle>
                    )}

                    {/* TWR - carré rouge */}
                    {hasTwr && (
                      <rect x={x - 16} y={y - 16} width="32" height="32" fill="rgba(239,68,68,0.12)" stroke="#ef4444" strokeWidth="2" rx="3" opacity="0.9" />
                    )}

                    {/* GND - étoile 4 branches cardinal (0°) */}
                    {hasGnd && (
                      <FourPointStar cx={x} cy={y} outerR={14} innerR={5} rotation={0} fill="rgba(245,158,11,0.8)" stroke="#f59e0b" strokeWidth={1.2} />
                    )}

                    {/* DEL/Clairance - étoile 4 branches 45° */}
                    {hasDel && (
                      <FourPointStar cx={x} cy={y} outerR={12} innerR={4} rotation={45} fill="rgba(16,185,129,0.8)" stroke="#10b981" strokeWidth={1.2} />
                    )}

                    {/* Point central aéroport */}
                    <circle cx={x} cy={y} r={hasATC ? 4 : 4} fill={hasATC ? '#10b981' : '#64748b'} stroke="white" strokeWidth={hasATC ? 1.5 : 1} opacity={hasATC ? 1 : 0.5} />

                    {/* Indicateur pulsant si ATC en ligne */}
                    {hasATC && (
                      <circle cx={x} cy={y} r="6" fill="none" stroke="#10b981" strokeWidth="1.5" opacity="0.6">
                        <animate attributeName="r" values="6;18;6" dur="2s" repeatCount="indefinite" />
                        <animate attributeName="opacity" values="0.6;0;0.6" dur="2s" repeatCount="indefinite" />
                      </circle>
                    )}

                    {/* Label aéroport */}
                    <text x={x} y={y + (hasATC ? 22 : 16)} fill={hasATC ? '#4ade80' : '#94a3b8'} fontSize={hasATC ? '9' : '7'} fontFamily="monospace" fontWeight={hasATC ? 'bold' : 'normal'} textAnchor="middle" style={{ textShadow: '0 1px 3px rgba(0,0,0,0.8)' }}>
                      {code}
                    </text>
                  </g>
                );
              })}
            </svg>
          </div>

          {/* Légende overlay */}
          <div className="absolute bottom-3 left-3 rounded-lg bg-slate-900/90 border border-slate-700/50 p-3 text-xs space-y-1.5 backdrop-blur-sm">
            <p className="text-slate-400 font-semibold mb-2">Légende</p>
            <div className="flex items-center gap-2"><span className="w-4 h-4 rounded-full border-2 border-blue-500 bg-blue-500/10" />  <span className="text-slate-300">APP (Approche)</span></div>
            <div className="flex items-center gap-2"><span className="w-4 h-4 rounded-full border border-white/60 bg-white/5" /> <span className="text-slate-300">DEP (Départ)</span></div>
            <div className="flex items-center gap-2"><span className="w-3.5 h-3.5 rounded-sm border-2 border-red-500 bg-red-500/15" /> <span className="text-slate-300">TWR (Tour)</span></div>
            <div className="flex items-center gap-2">
              <svg viewBox="0 0 16 16" className="w-4 h-4">
                <FourPointStar cx={8} cy={8} outerR={7} innerR={2.5} rotation={0} fill="rgba(245,158,11,0.8)" stroke="#f59e0b" strokeWidth={0.8} />
              </svg>
              <span className="text-slate-300">GND (Sol)</span>
            </div>
            <div className="flex items-center gap-2">
              <svg viewBox="0 0 16 16" className="w-4 h-4">
                <FourPointStar cx={8} cy={8} outerR={7} innerR={2.5} rotation={45} fill="rgba(16,185,129,0.8)" stroke="#10b981" strokeWidth={0.8} />
              </svg>
              <span className="text-slate-300">DEL (Clairance)</span>
            </div>
            <div className="flex items-center gap-2"><span className="w-4 h-0 border-t-2 border-dashed border-orange-500" style={{ borderColor: '#ff9632' }} /> <span className="text-slate-300">FIR (Center en ligne)</span></div>
          </div>
        </div>

        {/* Panneau latéral */}
        <div className="w-80 flex-shrink-0 rounded-xl border border-slate-700/50 bg-slate-800/30 overflow-hidden flex flex-col">
          <div className="p-4 border-b border-slate-700/30">
            <h2 className="font-semibold text-slate-100 text-sm">Contrôleurs en ligne</h2>
          </div>
          <div className="flex-1 overflow-y-auto p-3 space-y-2">
            {loading && <p className="text-slate-500 text-sm text-center py-8">Chargement...</p>}
            {!loading && airportsWithATC.length === 0 && (
              <div className="text-center py-12 space-y-2">
                <Radio className="h-8 w-8 text-slate-600 mx-auto" />
                <p className="text-slate-500 text-sm">Aucun contrôleur en ligne</p>
              </div>
            )}
            {airportsWithATC.map(ap => (
              <button
                key={ap.code}
                onClick={() => setSelectedAirport(selectedAirport === ap.code ? null : ap.code)}
                className={`w-full text-left rounded-lg p-3 transition border ${
                  selectedAirport === ap.code
                    ? 'bg-emerald-900/20 border-emerald-600/30'
                    : 'bg-slate-800/40 border-slate-700/30 hover:bg-slate-700/40'
                }`}
              >
                <div className="flex items-center justify-between mb-1.5">
                  <span className="font-mono font-bold text-emerald-400 text-sm">{ap.code}</span>
                  <span className="text-slate-500 text-xs">{ap.name}</span>
                </div>
                <div className="space-y-1">
                  {ap.sessions.map(s => (
                    <div key={`${s.aeroport}-${s.position}`} className="flex items-center justify-between text-xs">
                      <div className="flex items-center gap-1.5">
                        <span className={`w-1.5 h-1.5 rounded-full ${
                          s.position === 'Center' ? 'bg-orange-400' :
                          s.position === 'APP' ? 'bg-blue-400' :
                          s.position === 'DEP' ? 'bg-white' :
                          s.position === 'Tower' ? 'bg-red-400' :
                          s.position === 'Ground' ? 'bg-amber-400' :
                          'bg-emerald-400'
                        }`} />
                        <span className="text-slate-300">{s.position}</span>
                      </div>
                      <div className="flex items-center gap-2">
                        {s.callsign && <span className="text-slate-500">{s.callsign}</span>}
                        <span className="text-slate-600">{formatDuration(s.started_at)}</span>
                      </div>
                    </div>
                  ))}
                </div>
              </button>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
