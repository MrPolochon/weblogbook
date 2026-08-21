import Link from 'next/link';
import { ArrowLeft, Download, GraduationCap } from 'lucide-react';
import { LIVRET_PROGRESSION_PDF } from '@/lib/support/livret-progression';

export const metadata = {
  title: 'Livret de progression — AéroSchool',
  description: 'Objectifs CAT 1 à 5 : QCM AeroSchool puis pratique Instruction.',
};

export default function LivretProgressionPage() {
  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 flex flex-col">
      <header className="p-4 flex flex-wrap items-center justify-between gap-3">
        <Link href="/aeroschool" className="inline-flex items-center gap-2 text-slate-400 hover:text-white">
          <ArrowLeft className="h-5 w-5" />
          AeroSchool
        </Link>
        <a
          href={LIVRET_PROGRESSION_PDF}
          download
          className="inline-flex items-center gap-2 rounded-xl bg-amber-600 hover:bg-amber-500 px-4 py-2 text-sm font-semibold text-white"
        >
          <Download className="h-4 w-4" />
          Télécharger le PDF
        </a>
      </header>
      <main className="flex-1 px-4 pb-8">
        <div className="max-w-5xl mx-auto">
          <div className="text-center mb-6">
            <div className="inline-flex items-center justify-center p-3 rounded-2xl bg-amber-500/20 border border-amber-400/30 mb-3">
              <GraduationCap className="h-8 w-8 text-amber-300" />
            </div>
            <h1 className="text-3xl font-bold text-white">Livret de progression</h1>
            <p className="text-slate-400 mt-2 text-sm max-w-2xl mx-auto">
              Chaque catégorie CAT 1 à 5 : d’abord le <strong className="text-slate-200">QCM sur AeroSchool</strong>,
              ensuite la <strong className="text-slate-200">partie pratique</strong> dans Instruction.
            </p>
          </div>
          <iframe
            title="Livret de progression AéroSchool"
            src={LIVRET_PROGRESSION_PDF}
            className="w-full h-[80vh] rounded-2xl border border-slate-700 bg-slate-950"
          />
        </div>
      </main>
    </div>
  );
}
