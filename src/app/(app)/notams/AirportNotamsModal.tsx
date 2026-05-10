'use client';

import { useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { X, MapPin, AlertTriangle, Clock, CheckCircle2 } from 'lucide-react';
import NotamCard from './NotamCard';
import NotamDeleteButton from './NotamDeleteButton';
import { AIRPORT_NAMES } from '@/lib/cartography-data';

type Notam = {
  id: string;
  identifiant: string;
  code_aeroport: string;
  du_at: string;
  au_at: string;
  champ_a: string | null;
  champ_e: string;
  champ_d: string | null;
  champ_q: string | null;
  priorite: string | null;
  reference_fr: string | null;
  annule: boolean;
};

type Filter = 'tous' | 'actifs' | 'aVenir' | 'expires';

function classifyNotam(n: Notam, now: number): 'actif' | 'aVenir' | 'expire' | 'annule' {
  if (n.annule) return 'annule';
  const du = new Date(n.du_at).getTime();
  const au = new Date(n.au_at).getTime();
  if (now < du) return 'aVenir';
  if (now > au) return 'expire';
  return 'actif';
}

export default function AirportNotamsModal({
  airportCode,
  notams,
  canManageNotams,
  filter,
  onClose,
}: {
  airportCode: string;
  notams: Notam[];
  canManageNotams: boolean;
  filter: Filter;
  onClose: () => void;
}) {
  const modalRef = useRef<HTMLDivElement | null>(null);

  // Echap pour fermer + focus initial + verrou du scroll body
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = prev;
    };
  }, [onClose]);

  const now = Date.now();
  const ofAirport = notams.filter((n) => (n.code_aeroport || '').toUpperCase() === airportCode);

  const counts = ofAirport.reduce(
    (acc, n) => {
      const s = classifyNotam(n, now);
      if (s === 'actif') acc.actif += 1;
      else if (s === 'aVenir') acc.aVenir += 1;
      else if (s === 'expire') acc.expire += 1;
      return acc;
    },
    { actif: 0, aVenir: 0, expire: 0 }
  );

  const filtered = ofAirport
    .filter((n) => {
      const s = classifyNotam(n, now);
      if (filter === 'actifs') return s === 'actif';
      if (filter === 'aVenir') return s === 'aVenir';
      if (filter === 'expires') return s === 'expire';
      return true;
    })
    .sort((a, b) => {
      const sa = classifyNotam(a, now);
      const sb = classifyNotam(b, now);
      const order = { actif: 0, aVenir: 1, expire: 2, annule: 3 } as const;
      if (order[sa] !== order[sb]) return order[sa] - order[sb];
      return new Date(b.au_at).getTime() - new Date(a.au_at).getTime();
    });

  const airportName = AIRPORT_NAMES[airportCode] || airportCode;

  // SSR safety
  if (typeof document === 'undefined') return null;

  return createPortal(
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-fade-in"
      onClick={onClose}
    >
      <div
        ref={modalRef}
        className="w-full max-w-3xl max-h-[85vh] rounded-2xl shadow-2xl overflow-hidden flex flex-col border border-slate-700 bg-slate-950 text-slate-100 animate-slide-in"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-start justify-between gap-3 px-5 py-4 border-b border-slate-800 bg-gradient-to-r from-slate-900 to-slate-950">
          <div className="flex items-start gap-3 min-w-0">
            <div className="p-2 rounded-lg bg-sky-500/15 ring-1 ring-sky-400/30 shrink-0">
              <MapPin className="h-5 w-5 text-sky-400" />
            </div>
            <div className="min-w-0">
              <div className="flex items-baseline gap-2 flex-wrap">
                <h2 className="text-xl font-bold text-slate-100 font-mono tracking-wider">{airportCode}</h2>
                <span className="text-sm text-slate-400 truncate">{airportName}</span>
              </div>
              <div className="flex flex-wrap items-center gap-2 mt-1.5 text-xs">
                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-red-500/15 text-red-300 ring-1 ring-red-500/30">
                  <AlertTriangle className="h-3 w-3" />
                  {counts.actif} actif{counts.actif > 1 ? 's' : ''}
                </span>
                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-amber-500/15 text-amber-300 ring-1 ring-amber-500/30">
                  <Clock className="h-3 w-3" />
                  {counts.aVenir} à venir
                </span>
                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-slate-500/15 text-slate-400 ring-1 ring-slate-500/30">
                  <CheckCircle2 className="h-3 w-3" />
                  {counts.expire} expiré{counts.expire > 1 ? 's' : ''}
                </span>
              </div>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-2 rounded-lg text-slate-400 hover:text-slate-100 hover:bg-slate-800 transition shrink-0"
            aria-label="Fermer"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto px-5 py-4 space-y-3">
          {filtered.length === 0 ? (
            <div className="text-center py-10">
              <MapPin className="h-10 w-10 text-slate-600 mx-auto mb-2" />
              <p className="text-slate-400 text-sm">
                Aucun NOTAM
                {filter === 'actifs' && ' actif'}
                {filter === 'aVenir' && ' à venir'}
                {filter === 'expires' && ' expiré'}
                {' '}pour {airportCode}.
              </p>
            </div>
          ) : (
            filtered.map((n, idx) => (
              <div
                key={n.id}
                className="animate-slide-up"
                style={{ animationDelay: `${Math.min(idx * 40, 320)}ms` }}
              >
                <NotamCard
                  n={n}
                  variant="default"
                  adminDeleteButton={
                    canManageNotams ? <NotamDeleteButton notamId={n.id} variant="default" /> : undefined
                  }
                />
              </div>
            ))
          )}
        </div>
      </div>
    </div>,
    document.body
  );
}
