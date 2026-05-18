'use client';

import { useMemo, useState } from 'react';
import { DEFAULT_POSITIONS, AIRPORT_NAMES, PTFS_OFFICIAL_CHART_SRC, SVG_W, SVG_H } from '@/lib/cartography-data';

type NotamStatus = 'actif' | 'aVenir' | 'expire' | 'annule';

export type NotamLite = {
  id: string;
  code_aeroport: string;
  du_at: string;
  au_at: string;
  permanent?: boolean | null;
  annule: boolean;
  status: NotamStatus;
};

export default function NotamsMap({
  notams,
  onAirportClick,
}: {
  notams: NotamLite[];
  onAirportClick: (code: string) => void;
}) {
  const [hovered, setHovered] = useState<string | null>(null);

  // Index NOTAMs par aeroport + statistiques pour la coloration des marqueurs.
  const byAirport = useMemo(() => {
    const map = new Map<string, { actif: number; aVenir: number; expire: number; total: number }>();
    for (const n of notams) {
      const code = (n.code_aeroport || '').toUpperCase();
      if (!code) continue;
      const cur = map.get(code) ?? { actif: 0, aVenir: 0, expire: 0, total: 0 };
      if (n.status === 'actif') cur.actif += 1;
      else if (n.status === 'aVenir') cur.aVenir += 1;
      else if (n.status === 'expire') cur.expire += 1;
      cur.total += 1;
      map.set(code, cur);
    }
    return map;
  }, [notams]);

  return (
    <div className="relative w-full overflow-hidden rounded-xl border border-slate-700/50 bg-slate-950/60 shadow-inner animate-fade-in">
      <svg
        viewBox={`0 0 ${SVG_W} ${SVG_H}`}
        className="block h-auto w-full select-none"
        role="img"
        aria-label="Carte des aéroports PTFS avec NOTAMs"
      >
        <defs>
          <radialGradient id="markerGlow" cx="50%" cy="50%" r="50%">
            <stop offset="0%" stopColor="rgba(248,113,113,0.55)" />
            <stop offset="100%" stopColor="rgba(248,113,113,0)" />
          </radialGradient>
        </defs>

        {/* Fond : carte officielle PTFS */}
        <image
          href={PTFS_OFFICIAL_CHART_SRC}
          x={0}
          y={0}
          width={SVG_W}
          height={SVG_H}
          preserveAspectRatio="xMidYMid slice"
          opacity={0.85}
        />

        {/* Voile sombre pour faire ressortir les marqueurs */}
        <rect x={0} y={0} width={SVG_W} height={SVG_H} fill="rgba(2,6,23,0.35)" />

        {/* Marqueurs aeroports */}
        {Object.entries(DEFAULT_POSITIONS).map(([code, pos]) => {
          const x = pos.x * (SVG_W / 100);
          const y = pos.y * (SVG_H / 100);
          const stats = byAirport.get(code);
          const isHovered = hovered === code;
          const hasActif = (stats?.actif ?? 0) > 0;
          const hasAVenir = (stats?.aVenir ?? 0) > 0;
          const hasExpire = (stats?.expire ?? 0) > 0;
          const total = stats?.total ?? 0;

          // Couleur du marqueur selon le statut le plus pertinent
          const markerColor = hasActif
            ? '#ef4444' // rouge actif
            : hasAVenir
              ? '#f59e0b' // ambre a venir
              : hasExpire
                ? '#94a3b8' // gris expire recent
                : '#475569'; // ardoise inactif (aucun NOTAM)

          const markerStroke = total > 0 ? '#0f172a' : '#1e293b';
          const labelColor = total > 0 ? '#f1f5f9' : '#64748b';
          const baseRadius = total > 0 ? 8 : 5;
          const radius = isHovered ? baseRadius + 3 : baseRadius;
          const name = AIRPORT_NAMES[code] || code;

          return (
            <g
              key={code}
              onClick={() => onAirportClick(code)}
              onMouseEnter={() => setHovered(code)}
              onMouseLeave={() => setHovered(null)}
              style={{ cursor: 'pointer', transition: 'transform 0.2s ease' }}
              transform={isHovered ? `translate(${x}, ${y})` : `translate(${x}, ${y})`}
            >
              {/* Halo pulsant pour aeroports avec NOTAM actif */}
              {hasActif && (
                <>
                  <circle r={20} fill="url(#markerGlow)" opacity={0.7}>
                    <animate
                      attributeName="r"
                      values="14;26;14"
                      dur="2.4s"
                      repeatCount="indefinite"
                    />
                    <animate
                      attributeName="opacity"
                      values="0.65;0.15;0.65"
                      dur="2.4s"
                      repeatCount="indefinite"
                    />
                  </circle>
                </>
              )}

              {/* Marqueur principal */}
              <circle
                r={radius}
                fill={markerColor}
                stroke={markerStroke}
                strokeWidth={2}
                style={{ transition: 'all 0.2s ease' }}
              />

              {/* Badge de comptage si plus d'un NOTAM */}
              {total > 1 && (
                <g transform={`translate(${baseRadius - 1}, ${-baseRadius - 1})`}>
                  <circle r={7} fill="#0f172a" stroke={markerColor} strokeWidth={1.5} />
                  <text
                    textAnchor="middle"
                    dominantBaseline="central"
                    fontSize={9}
                    fontWeight={700}
                    fill="#f8fafc"
                    style={{ pointerEvents: 'none' }}
                  >
                    {total > 9 ? '9+' : total}
                  </text>
                </g>
              )}

              {/* Code OACI sous le marqueur */}
              <text
                x={0}
                y={radius + 12}
                textAnchor="middle"
                fontSize={11}
                fontWeight={700}
                fill={labelColor}
                stroke="#0f172a"
                strokeWidth={2.5}
                paintOrder="stroke"
                style={{ pointerEvents: 'none', letterSpacing: '0.5px' }}
              >
                {code}
              </text>

              {/* Tooltip au survol */}
              {isHovered && (
                <g transform={`translate(0, ${-radius - 18})`} style={{ pointerEvents: 'none' }}>
                  <rect
                    x={-90}
                    y={-26}
                    width={180}
                    height={32}
                    rx={6}
                    fill="rgba(2,6,23,0.95)"
                    stroke={markerColor}
                    strokeWidth={1}
                  />
                  <text
                    x={0}
                    y={-13}
                    textAnchor="middle"
                    fontSize={11}
                    fontWeight={700}
                    fill="#f8fafc"
                  >
                    {name}
                  </text>
                  <text x={0} y={0} textAnchor="middle" fontSize={9} fill="#cbd5e1">
                    {total === 0
                      ? 'Aucun NOTAM'
                      : `${stats?.actif ?? 0} actif${(stats?.actif ?? 0) > 1 ? 's' : ''} · ${stats?.aVenir ?? 0} à venir · ${stats?.expire ?? 0} expiré${(stats?.expire ?? 0) > 1 ? 's' : ''}`}
                  </text>
                </g>
              )}
            </g>
          );
        })}
      </svg>

      {/* Legende */}
      <div className="absolute bottom-3 left-3 flex flex-wrap items-center gap-3 rounded-lg bg-slate-900/80 px-3 py-2 text-[11px] text-slate-300 backdrop-blur-sm border border-slate-700/50">
        <span className="flex items-center gap-1.5">
          <span className="inline-block h-2.5 w-2.5 rounded-full bg-red-500 ring-2 ring-red-500/30" />
          Actif
        </span>
        <span className="flex items-center gap-1.5">
          <span className="inline-block h-2.5 w-2.5 rounded-full bg-amber-500" />
          À venir
        </span>
        <span className="flex items-center gap-1.5">
          <span className="inline-block h-2.5 w-2.5 rounded-full bg-slate-400" />
          Expiré
        </span>
        <span className="flex items-center gap-1.5">
          <span className="inline-block h-1.5 w-1.5 rounded-full bg-slate-600" />
          Sans NOTAM
        </span>
      </div>

      {/* Astuce */}
      <div className="absolute top-3 right-3 rounded-lg bg-slate-900/80 px-3 py-1.5 text-[11px] text-slate-400 backdrop-blur-sm border border-slate-700/50">
        Cliquez sur un aéroport pour voir ses NOTAMs
      </div>
    </div>
  );
}
