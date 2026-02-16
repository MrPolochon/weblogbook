import { createClient } from '@/lib/supabase/server';
import Link from 'next/link';
import { FolderOpen, FileText, File, Image, Download, FileSpreadsheet, FileArchive, FolderClosed } from 'lucide-react';
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
