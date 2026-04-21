'use client';

import Link from 'next/link';
import { HeartPulse, ArrowRight, Pause, Play, MapPin, Clock } from 'lucide-react';

interface SegmentInfo {
  id: string;
  numero_vol: string;
  aeroport_depart: string;
  aeroport_arrivee: string;
  type_vol: string;
  temps_prev_min: number;
  medevac_segment_index: number | null;
  medevac_total_segments: number | null;
  statut: string;
}

interface Props {
  segmentClos: SegmentInfo;
  segmentSuivant: SegmentInfo;
}

export default function MedevacPauseBanner({ segmentClos, segmentSuivant }: Props) {
  const currentIdx = segmentSuivant.medevac_segment_index || 2;
  const total = segmentSuivant.medevac_total_segments || 2;

  return (
    <div className="relative overflow-hidden rounded-2xl border-2 border-amber-500/50 bg-gradient-to-br from-amber-500/10 via-red-500/5 to-rose-500/10 p-6 shadow-xl">
      <div className="absolute top-0 right-0 w-40 h-40 bg-amber-500/10 rounded-full -translate-y-1/2 translate-x-1/2 pointer-events-none"></div>
      <div className="absolute bottom-0 left-0 w-32 h-32 bg-red-500/10 rounded-full translate-y-1/2 -translate-x-1/2 pointer-events-none"></div>

      <div className="relative flex flex-col gap-5">
        {/* Header */}
        <div className="flex items-center gap-3">
          <div className="p-3 rounded-xl bg-amber-500/20 backdrop-blur">
            <Pause className="h-6 w-6 text-amber-300" />
          </div>
          <div className="flex-1">
            <div className="flex items-center gap-2 mb-1">
              <HeartPulse className="h-4 w-4 text-red-400" />
              <span className="text-xs uppercase tracking-wider text-red-300/80 font-semibold">
                Mission MEDEVAC {segmentClos.numero_vol}
              </span>
              <span className="px-2 py-0.5 rounded-full text-xs font-bold bg-amber-500/20 text-amber-200 border border-amber-500/30">
                {currentIdx}/{total}
              </span>
            </div>
            <h2 className="text-xl font-bold text-amber-100">Pause temporaire</h2>
            <p className="text-sm text-amber-200/70">
              Segment {currentIdx - 1} clôturé — prêt à reprendre vers la prochaine destination.
            </p>
          </div>
        </div>

        {/* Trajet précédent / suivant */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <div className="rounded-xl bg-slate-800/50 border border-slate-700/50 p-4">
            <div className="flex items-center gap-2 text-xs uppercase tracking-wider text-slate-400 mb-2">
              <MapPin className="h-3 w-3" />
              Segment terminé ({(segmentClos.medevac_segment_index || 1)}/{total})
            </div>
            <div className="flex items-center gap-2 text-sm">
              <span className="font-mono text-sm px-2 py-1 rounded bg-slate-700/50 text-slate-300">
                {segmentClos.aeroport_depart}
              </span>
              <ArrowRight className="h-3 w-3 text-slate-500" />
              <span className="font-mono text-sm px-2 py-1 rounded bg-emerald-500/20 text-emerald-300">
                {segmentClos.aeroport_arrivee}
              </span>
            </div>
          </div>
          <div className="rounded-xl bg-red-500/10 border border-red-500/30 p-4">
            <div className="flex items-center gap-2 text-xs uppercase tracking-wider text-red-300 mb-2">
              <Play className="h-3 w-3" />
              Segment suivant ({currentIdx}/{total})
            </div>
            <div className="flex items-center gap-2 text-sm mb-2">
              <span className="font-mono text-sm px-2 py-1 rounded bg-sky-500/20 text-sky-300">
                {segmentSuivant.aeroport_depart}
              </span>
              <ArrowRight className="h-3 w-3 text-slate-500" />
              <span className="font-mono text-sm px-2 py-1 rounded bg-red-500/20 text-red-300">
                {segmentSuivant.aeroport_arrivee}
              </span>
            </div>
            <div className="flex items-center gap-3 text-xs text-slate-400">
              <span className="inline-flex items-center gap-1">
                <Clock className="h-3 w-3" />
                {segmentSuivant.temps_prev_min} min
              </span>
              <span className="px-1.5 py-0.5 rounded bg-slate-700/50 text-slate-300 font-mono">
                {segmentSuivant.type_vol}
              </span>
            </div>
          </div>
        </div>

        {/* CTA */}
        <div className="flex flex-col sm:flex-row gap-3 items-stretch sm:items-center">
          <Link
            href={`/logbook/plans-vol/${segmentSuivant.id}/reprendre`}
            className="flex-1 inline-flex items-center justify-center gap-2 px-5 py-3 rounded-xl bg-gradient-to-r from-red-600 to-rose-700 hover:from-red-700 hover:to-rose-800 text-white font-bold text-base shadow-lg transition-all"
          >
            <Play className="h-5 w-5" />
            Reprendre le vol — {segmentSuivant.type_vol === 'IFR' ? 'Choisir SID / STAR' : 'Saisir les intentions'}
          </Link>
        </div>

        <p className="text-xs text-slate-400 italic">
          {segmentSuivant.type_vol === 'IFR'
            ? 'Vous devrez saisir la SID de départ et la STAR d\'arrivée avant que le plan ne soit envoyé à l\'ATC.'
            : 'Vous devrez saisir vos intentions de vol VFR avant que le plan ne soit envoyé à l\'ATC.'}
        </p>
      </div>
    </div>
  );
}
