import { createClient } from '@/lib/supabase/server';
import { FolderOpen } from 'lucide-react';
import Link from 'next/link';
import DocumentTree from '@/components/DocumentTree';

export default async function AtcDocumentsPage() {
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
        <h1 className="text-2xl font-semibold text-slate-900">Documents</h1>
        <p className="text-sm text-slate-500 mt-1">{totalFiles} document(s) disponible(s)</p>
      </div>

      <Link
        href="/manuel-controleur"
        className="flex items-center justify-between gap-3 rounded-xl border border-sky-300 bg-sky-50 px-4 py-3 hover:bg-sky-100"
      >
        <span className="text-sm font-semibold text-sky-900">Manuel des opérations et qualifications du contrôleur (MOQ)</span>
        <span className="text-xs text-sky-700">Lire / PDF</span>
      </Link>

      {!sections || sections.length === 0 ? (
        <div className="text-center py-16 border-2 border-dashed border-slate-300 rounded-xl">
          <FolderOpen className="h-12 w-12 text-slate-400 mx-auto mb-3" />
          <p className="text-slate-500 font-medium">Aucun document disponible</p>
        </div>
      ) : (
        <DocumentTree sections={sections as any} theme="light" />
      )}
    </div>
  );
}
