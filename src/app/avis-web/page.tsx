import Link from 'next/link';
import { ArrowLeft, MessagesSquare } from 'lucide-react';
import FlightReviewFeed from '@/components/FlightReviewFeed';

export const metadata = { title: 'Avis Web · weblogbook', description: 'Les expériences des voyageurs virtuels du réseau PTFS.' };

export default function AvisWebPage() {
  return <main className="min-h-screen bg-[#0b101b] px-4 py-8 text-slate-100 sm:px-6">
    <div className="mx-auto max-w-3xl">
      <Link href="/logbook" className="mb-8 inline-flex min-h-11 items-center gap-2 text-sm text-slate-400 hover:text-sky-200"><ArrowLeft size={16} /> Retour au site</Link>
      <header className="mb-7 border-b border-slate-700/60 pb-7">
        <div className="mb-3 flex items-center gap-3"><span className="rounded-xl bg-sky-500/15 p-3 text-sky-300"><MessagesSquare size={26} /></span><h1 className="text-3xl font-semibold tracking-tight">Avis Web</h1></div>
        <p className="text-slate-300">Les voyages se racontent ici.</p>
        <p className="mt-2 text-sm leading-relaxed text-slate-500">Les vols transportant des passagers ou du fret suscitent de 3 à 30 publications selon leur chargement. Ce fil conserve les 500 publications les plus récentes du réseau. Ces expériences de voyageurs virtuels sont fictives et font partie du jeu.</p>
      </header>
      <FlightReviewFeed />
    </div>
  </main>;
}
