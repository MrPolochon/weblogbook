import { createClient } from '@/lib/supabase/server';
import { FolderOpen } from 'lucide-react';
import Link from 'next/link';
import DocumentTree from '@/components/DocumentTree';

export default async function DocumentsPage() {
  const supabase = await createClient();

  const { data: sections } = await supabase
    .from('document_sections')
    .select(`
      id, nom, ordre, parent_id,
      document_files(id, nom_original, taille_bytes, created_at)
    `)
    .order('ordre', { ascending: true });

  const totalFiles = (sections || []).reduce((sum, s) => sum + ((s.document_files as unknown[])?.length || 0), 0);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-slate-100">Documents</h1>
        <p className="text-sm text-slate-400 mt-1">
          {totalFiles} document(s) disponible(s) au téléchargement
        </p>
      </div>

      <div className="space-y-2">
        <Link
          href="/code-de-conduite"
          className="flex items-center justify-between gap-3 rounded-xl border border-indigo-500/30 bg-indigo-500/10 px-4 py-3 hover:bg-indigo-500/15"
        >
          <span className="text-sm font-semibold text-indigo-200">Code de conduite MIXOU AIRLINES PTFS — V5.0.0.4</span>
          <span className="text-xs text-indigo-300">Lire / PDF</span>
        </Link>

        <Link
          href="/livret-progression"
          className="flex items-center justify-between gap-3 rounded-xl border border-amber-500/30 bg-amber-500/10 px-4 py-3 hover:bg-amber-500/15"
        >
          <span className="text-sm font-semibold text-amber-200">Livret de progression pilote — CAT 1 à 5</span>
          <span className="text-xs text-amber-300">Lire / PDF</span>
        </Link>

        <Link
          href="/manuel-controleur"
          className="flex items-center justify-between gap-3 rounded-xl border border-sky-500/30 bg-sky-500/10 px-4 py-3 hover:bg-sky-500/15"
        >
          <span className="text-sm font-semibold text-sky-200">Manuel des opérations et qualifications du contrôleur (MOQ)</span>
          <span className="text-xs text-sky-300">Lire / PDF</span>
        </Link>
      </div>

      {!sections || sections.length === 0 ? (
        <div className="text-center py-16 border-2 border-dashed border-slate-700/50 rounded-xl">
          <FolderOpen className="h-12 w-12 text-slate-600 mx-auto mb-3" />
          <p className="text-slate-400 font-medium">Aucun document disponible</p>
          <p className="text-slate-500 text-sm mt-1">Les documents seront ajoutés par l&apos;administration.</p>
        </div>
      ) : (
        <DocumentTree sections={sections as any} theme="dark" />
      )}
    </div>
  );
}
