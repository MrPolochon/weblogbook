import type { Metadata } from 'next';
import { Suspense } from 'react';
import PerfPtfsClient from './PerfPtfsClient';

export const metadata: Metadata = {
  title: 'Calculateur de performance PTFS',
  description: 'Calcule les performances décollage et atterrissage pour PTFS (Pilot Training Flight Simulator) — par cityuser.',
};

export default function PerfPtfsPage() {
  return (
    <Suspense fallback={<div className="py-12 text-center text-slate-400">Chargement du calculateur…</div>}>
      <PerfPtfsClient />
    </Suspense>
  );
}
