import Link from 'next/link';
import { ArrowLeft, Download, ScrollText } from 'lucide-react';
import { CODE_DE_CONDUITE_PDF } from '@/lib/support/code-de-conduite';

export const metadata = {
  title: 'Code de conduite — MIXOU AIRLINES PTFS',
  description: 'Code de conduite officiel du serveur MIXOU AIRLINES PTFS, version V5.0.0.4.',
};

export default function CodeDeConduitePage() {
  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 flex flex-col">
      <header className="p-4 flex flex-wrap items-center justify-between gap-3">
        <Link
          href="/login"
          className="inline-flex items-center gap-2 text-slate-400 hover:text-white transition-colors"
        >
          <ArrowLeft className="h-5 w-5" />
          Retour
        </Link>
        <a
          href={CODE_DE_CONDUITE_PDF}
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
            <div className="inline-flex items-center justify-center p-3 rounded-2xl bg-indigo-500/20 border border-indigo-400/30 mb-3">
              <ScrollText className="h-8 w-8 text-indigo-300" />
            </div>
            <h1 className="text-3xl font-bold text-white">Code de conduite</h1>
            <p className="text-slate-400 mt-2 text-sm">
              MIXOU AIRLINES PTFS — Version V5.0.0.4 — Document officiel, accessible à tous.
            </p>
          </div>
          <iframe
            title="Code de conduite MIXOU AIRLINES PTFS"
            src={CODE_DE_CONDUITE_PDF}
            className="w-full h-[80vh] rounded-2xl border border-slate-700 bg-slate-950"
          />
        </div>
      </main>
    </div>
  );
}
