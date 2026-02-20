import type { Metadata } from 'next';
import PerfPtfsClient from './PerfPtfsClient';

export const metadata: Metadata = {
  title: 'Calculateur de performance PTFS',
  description: 'Calcule les performances décollage et atterrissage pour PTFS (Pilot Training Flight Simulator) — par cityuser.',
};

export default function PerfPtfsPage() {
  return <PerfPtfsClient />;
}
