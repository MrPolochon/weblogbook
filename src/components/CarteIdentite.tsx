'use client';

import Image from 'next/image';
import { useMemo } from 'react';

type CarteData = {
  couleur_fond: string;
  logo_url: string | null;
  photo_url: string | null;
  titre: string;
  sous_titre: string | null;
  nom_affiche: string | null;
  organisation: string | null;
  numero_carte: string | null;
  date_delivrance: string | null;
  date_expiration: string | null;
  cases_haut: string[];
  cases_bas: string[];
};

type Props = {
  carte: CarteData | null;
  identifiant?: string;
  size?: 'sm' | 'md' | 'lg';
  className?: string;
  /** Active un effet de tilt 3D au hover (desactive en mode reduce-motion). */
  interactive?: boolean;
};

const SIZE_CONFIG = {
  sm: { width: 200, height: 280, fontSize: 'text-[9px]', titleSize: 'text-sm', padding: 'p-2.5', gap: 'gap-1.5' },
  md: { width: 300, height: 420, fontSize: 'text-xs', titleSize: 'text-xl', padding: 'p-3.5', gap: 'gap-2' },
  lg: { width: 380, height: 530, fontSize: 'text-sm', titleSize: 'text-2xl', padding: 'p-5', gap: 'gap-3' },
} as const;

const PHOTO_DIM = {
  sm: { w: 64, h: 78 },
  md: { w: 96, h: 116 },
  lg: { w: 120, h: 144 },
} as const;

const LOGO_DIM = {
  sm: 52,
  md: 80,
  lg: 100,
} as const;

function formatDate(dateStr: string | null): string {
  if (!dateStr) return '—';
  try {
    return new Date(dateStr).toLocaleDateString('fr-FR');
  } catch {
    return dateStr;
  }
}

/**
 * Eclaircit/assombrit une couleur hex pour creer un degrade.
 * Renvoie #rrggbb.
 */
function shiftHex(hex: string, percent: number): string {
  let h = hex.replace('#', '');
  if (h.length === 3) h = h.split('').map((c) => c + c).join('');
  const num = parseInt(h, 16);
  const r = Math.max(0, Math.min(255, ((num >> 16) & 0xff) + Math.round(255 * (percent / 100))));
  const g = Math.max(0, Math.min(255, ((num >> 8) & 0xff) + Math.round(255 * (percent / 100))));
  const b = Math.max(0, Math.min(255, (num & 0xff) + Math.round(255 * (percent / 100))));
  return `#${[r, g, b].map((v) => v.toString(16).padStart(2, '0')).join('')}`;
}

export default function CarteIdentite({ carte, identifiant, size = 'md', className = '', interactive = false }: Props) {
  const data: CarteData = carte || {
    couleur_fond: '#1E3A8A',
    logo_url: null,
    photo_url: null,
    titre: 'IFSA',
    sous_titre: "délivré par l'instance de l'IFSA",
    nom_affiche: identifiant || '—',
    organisation: 'IFSA',
    numero_carte: '000 00 000000',
    date_delivrance: null,
    date_expiration: null,
    cases_haut: [],
    cases_bas: [],
  };

  const s = SIZE_CONFIG[size];
  const photoDim = PHOTO_DIM[size];
  const logoDim = LOGO_DIM[size];

  // Degrade premium derive de la couleur de fond
  const bgGradient = useMemo(() => {
    const base = data.couleur_fond || '#1E3A8A';
    const lighter = shiftHex(base, 10);
    const darker = shiftHex(base, -22);
    return `linear-gradient(140deg, ${lighter} 0%, ${base} 45%, ${darker} 100%)`;
  }, [data.couleur_fond]);

  const isStaff = data.couleur_fond === '#1F2937';

  return (
    <div
      className={`carte-identite group relative ${interactive ? 'carte-interactive' : ''} ${className}`}
      style={{ width: s.width, perspective: interactive ? '1200px' : undefined }}
    >
      <div
        className="relative rounded-xl shadow-[0_18px_42px_-12px_rgba(0,0,0,0.65),0_4px_12px_-4px_rgba(0,0,0,0.4)] ring-1 ring-white/5 overflow-hidden transition-transform duration-500 ease-out will-change-transform"
        style={{
          background: bgGradient,
          minHeight: s.height,
        }}
      >
        {/* Texture grille subtile */}
        <div
          aria-hidden="true"
          className="absolute inset-0 opacity-[0.07] pointer-events-none mix-blend-overlay"
          style={{
            backgroundImage:
              'linear-gradient(rgba(255,255,255,0.6) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.6) 1px, transparent 1px)',
            backgroundSize: '14px 14px',
          }}
        />

        {/* Halo lumineux haut-droit */}
        <div
          aria-hidden="true"
          className="absolute -top-12 -right-8 h-40 w-40 rounded-full opacity-30 blur-3xl pointer-events-none"
          style={{ background: shiftHex(data.couleur_fond, 35) }}
        />

        {/* Bande "shine" diagonale au hover */}
        {interactive && (
          <div
            aria-hidden="true"
            className="absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity duration-500 pointer-events-none carte-shine"
          />
        )}

        {/* Bande STAFF dore si carte STAFF */}
        {isStaff && (
          <div
            aria-hidden="true"
            className="absolute top-0 inset-x-0 h-1.5 pointer-events-none"
            style={{ background: 'linear-gradient(90deg, #fbbf24 0%, #f59e0b 50%, #fbbf24 100%)' }}
          />
        )}

        <div className={`${s.padding} flex flex-col h-full relative ${s.gap}`} style={{ minHeight: s.height }}>
          {/* Bandeau titre */}
          <div className="bg-white/95 backdrop-blur-sm rounded-md px-3 py-2 shadow-inner ring-1 ring-black/5">
            <h2 className={`${s.titleSize} font-extrabold text-center text-slate-900 tracking-tight leading-tight`}>
              {data.titre}
            </h2>
          </div>

          {/* Cases du haut (qualifications) */}
          {data.cases_haut.length > 0 && (
            <div className="flex gap-1">
              {data.cases_haut.map((c, i) => (
                <div key={i} className="flex-1 bg-white/90 rounded px-1 py-1 text-center ring-1 ring-black/5">
                  <span className={`${s.fontSize} font-bold text-slate-900 tracking-wide`}>{c}</span>
                </div>
              ))}
            </div>
          )}

          {/* Sous-titre */}
          {data.sous_titre && (
            <p className={`${s.fontSize} text-white/90 text-center italic leading-snug px-1`}>
              {data.sous_titre}
            </p>
          )}

          {/* Logo + photo */}
          <div className="flex items-center gap-2.5 my-1">
            {/* Logo */}
            <div className="flex-1 flex items-center justify-center">
              {data.logo_url ? (
                <div
                  className="rounded-lg bg-white/90 backdrop-blur-sm ring-1 ring-black/5 p-1 shadow-inner"
                  style={{ width: logoDim, height: logoDim }}
                >
                  <Image
                    src={data.logo_url}
                    alt="Logo"
                    width={logoDim}
                    height={logoDim}
                    className="object-contain w-full h-full"
                    unoptimized
                  />
                </div>
              ) : (
                <div
                  className="rounded-full border-2 border-dashed border-white/30 flex items-center justify-center"
                  style={{ width: logoDim, height: logoDim }}
                >
                  <span className={`${s.fontSize} text-white/40 font-bold tracking-widest`}>LOGO</span>
                </div>
              )}
            </div>

            {/* Photo */}
            <div className="flex-1 flex justify-center">
              {data.photo_url ? (
                <div
                  className="rounded-md overflow-hidden ring-2 ring-white/30 shadow-lg bg-white"
                  style={{ width: photoDim.w, height: photoDim.h }}
                >
                  <Image
                    src={data.photo_url}
                    alt="Photo"
                    width={photoDim.w}
                    height={photoDim.h}
                    className="object-cover w-full h-full"
                    unoptimized
                  />
                </div>
              ) : (
                <div
                  className="rounded-md bg-slate-200/80 flex items-center justify-center ring-2 ring-white/20"
                  style={{ width: photoDim.w, height: photoDim.h }}
                >
                  <span className={`${s.fontSize} text-slate-500 font-medium`}>Photo</span>
                </div>
              )}
            </div>
          </div>

          {/* Informations */}
          <div className="space-y-0.5 text-white drop-shadow-sm">
            {(data.date_expiration || data.date_delivrance) && (
              <p className={`${size === 'sm' ? 'text-sm' : size === 'md' ? 'text-lg' : 'text-xl'} font-bold tabular-nums tracking-tight`}>
                {formatDate(data.date_expiration || data.date_delivrance)}
              </p>
            )}

            <p className={`${size === 'sm' ? 'text-sm' : size === 'md' ? 'text-base' : 'text-lg'} font-bold uppercase tracking-wide leading-tight`}>
              {data.nom_affiche || identifiant || '—'}
            </p>

            <p className={`${s.fontSize} font-semibold text-white/90`}>
              {data.organisation}
            </p>

            <p className={`${s.fontSize} font-mono text-white/85 tracking-widest`}>
              {data.numero_carte || '000 00 000000'}
            </p>
          </div>

          {/* Cases du bas (categories) */}
          {data.cases_bas.length > 0 && (
            <div className="flex gap-1 mt-auto pt-3 overflow-hidden">
              {data.cases_bas.map((c, i) => (
                <div key={i} className="flex-1 min-w-0 bg-white/95 rounded px-1 py-2 text-center ring-1 ring-black/5">
                  <span className={`${size === 'sm' ? 'text-base' : size === 'md' ? 'text-xl' : 'text-2xl'} font-extrabold text-slate-900 truncate block`}>
                    {c}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
