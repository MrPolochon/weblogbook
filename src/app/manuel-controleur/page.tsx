import Link from 'next/link';
import { ArrowLeft, Download, Radio } from 'lucide-react';
import { MANUEL_CONTROLEUR_PDF } from '@/lib/support/manuel-controleur';

export const metadata = {
  title: 'Manuel des opérations et qualifications du contrôleur — PTFS France',
  description: 'Grades ATC RS1 à RZA, habilitations, heures exigées et protocole d’examen.',
};

export default function ManuelControleurPage() {
  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 flex flex-col">
      <header className="p-4 flex flex-wrap items-center justify-between gap-3">
        <Link href="/documents" className="inline-flex items-center gap-2 text-slate-400 hover:text-white">
          <ArrowLeft className="h-5 w-5" />
          Documents
        </Link>
        <a
          href={MANUEL_CONTROLEUR_PDF}
          download
          className="inline-flex items-center gap-2 rounded-xl bg-sky-600 hover:bg-sky-500 px-4 py-2 text-sm font-semibold text-white"
        >
          <Download className="h-4 w-4" />
          Télécharger le PDF
        </a>
      </header>
      <main className="flex-1 px-4 pb-8">
        <div className="max-w-5xl mx-auto">
          <div className="text-center mb-6">
            <div className="inline-flex items-center justify-center p-3 rounded-2xl bg-sky-500/20 border border-sky-400/30 mb-3">
              <Radio className="h-8 w-8 text-sky-300" />
            </div>
            <h1 className="text-3xl font-bold text-white">Manuel des opérations et qualifications</h1>
            <p className="text-slate-400 mt-2 text-sm max-w-2xl mx-auto">
              Normes de compétence et d’habilitation des contrôleurs PTFS France :
              grades <strong className="text-slate-200">RS1 à RZA</strong>, positions autorisées,
              heures de service exigées et protocole d’examen.
            </p>
          </div>
          <iframe
            title="Manuel des opérations et qualifications du contrôleur"
            src={MANUEL_CONTROLEUR_PDF}
            className="w-full h-[80vh] rounded-2xl border border-slate-700 bg-slate-950"
          />
        </div>
      </main>
    </div>
  );
}
