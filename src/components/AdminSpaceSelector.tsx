'use client';

import { useState, useEffect, useRef } from 'react';
import Link from 'next/link';
import { createPortal } from 'react-dom';
import { Globe, Plane, Radio, Flame, Wrench, LayoutDashboard, X } from 'lucide-react';

const SPACES = [
  {
    href: '/logbook',
    icon: Plane,
    label: 'Espace Pilote',
    desc: 'Logbook, plans de vol, compagnie',
    color: 'sky',
  },
  {
    href: '/atc',
    icon: Radio,
    label: 'Espace ATC',
    desc: 'Contrôle aérien, strips de vol',
    color: 'emerald',
  },
  {
    href: '/siavi',
    icon: Flame,
    label: 'Espace SIAVI',
    desc: 'Service médical, MEDEVAC',
    color: 'red',
  },
  {
    href: '/ground',
    icon: Wrench,
    label: 'Ground Crew',
    desc: 'Services au sol, boarding',
    color: 'amber',
  },
  {
    href: '/admin',
    icon: LayoutDashboard,
    label: 'Administration',
    desc: 'Gestion globale de la plateforme',
    color: 'purple',
  },
] as const;

const COLOR_CLASSES: Record<string, { border: string; bg: string; text: string; hover: string }> = {
  sky:     { border: 'border-sky-700/50',     bg: 'bg-sky-900/20',     text: 'text-sky-300',     hover: 'hover:border-sky-600/60 hover:bg-sky-900/30' },
  emerald: { border: 'border-emerald-700/50', bg: 'bg-emerald-900/20', text: 'text-emerald-300', hover: 'hover:border-emerald-600/60 hover:bg-emerald-900/30' },
  red:     { border: 'border-red-700/50',     bg: 'bg-red-900/20',     text: 'text-red-300',     hover: 'hover:border-red-600/60 hover:bg-red-900/30' },
  amber:   { border: 'border-amber-700/50',   bg: 'bg-amber-900/20',   text: 'text-amber-300',   hover: 'hover:border-amber-600/60 hover:bg-amber-900/30' },
  purple:  { border: 'border-purple-700/50',  bg: 'bg-purple-900/20',  text: 'text-purple-300',  hover: 'hover:border-purple-600/60 hover:bg-purple-900/30' },
};

interface Props {
  /** Classe CSS additionnelle pour le bouton déclencheur */
  triggerClassName?: string;
}

export default function AdminSpaceSelector({ triggerClassName }: Props) {
  const [open, setOpen] = useState(false);
  const [mounted, setMounted] = useState(false);
  const triggerRef = useRef<HTMLButtonElement>(null);

  useEffect(() => { setMounted(true); }, []);

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        onClick={() => setOpen(true)}
        className={triggerClassName ?? 'flex items-center gap-1.5 rounded-lg px-3 py-2 text-sm font-semibold border border-slate-700/50 text-slate-300 hover:border-purple-500/40 hover:bg-purple-500/10 hover:text-purple-200 transition-colors'}
      >
        <Globe className="h-3.5 w-3.5 shrink-0" />
        <span className="hidden lg:inline">Changer d&apos;espace</span>
        <span className="lg:hidden">Espaces</span>
      </button>

      {mounted && open && createPortal(
        <div className="fixed inset-0 z-[9999] flex items-center justify-center p-4" role="dialog" aria-modal="true">
          {/* Overlay */}
          <div
            className="absolute inset-0 bg-black/70 backdrop-blur-sm"
            onClick={() => setOpen(false)}
          />

          {/* Modale */}
          <div className="relative z-10 w-full max-w-md rounded-2xl border border-slate-700/60 bg-[#0d1120] shadow-2xl overflow-hidden">
            {/* Header */}
            <div className="flex items-center justify-between px-5 py-4 border-b border-slate-700/50">
              <div className="flex items-center gap-2">
                <Globe className="h-5 w-5 text-purple-400" />
                <h2 className="text-base font-bold text-slate-100">Changer d&apos;espace</h2>
              </div>
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="flex items-center justify-center h-8 w-8 rounded-lg border border-slate-700/50 text-slate-400 hover:text-slate-200 transition-colors"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            {/* Grille d'espaces */}
            <div className="p-4 grid grid-cols-1 gap-2">
              {SPACES.map((space) => {
                const colors = COLOR_CLASSES[space.color];
                const Icon = space.icon;
                return (
                  <Link
                    key={space.href}
                    href={space.href}
                    onClick={() => setOpen(false)}
                    className={`flex items-center gap-4 rounded-xl border p-4 transition-all ${colors.border} ${colors.bg} ${colors.hover}`}
                  >
                    <div className={`flex h-10 w-10 items-center justify-center rounded-xl bg-black/30 border ${colors.border}`}>
                      <Icon className={`h-5 w-5 ${colors.text}`} />
                    </div>
                    <div>
                      <p className={`font-semibold text-sm ${colors.text}`}>{space.label}</p>
                      <p className="text-xs text-slate-400 mt-0.5">{space.desc}</p>
                    </div>
                  </Link>
                );
              })}
            </div>
          </div>
        </div>,
        document.body,
      )}
    </>
  );
}
