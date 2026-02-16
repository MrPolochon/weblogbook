import { createClient } from '@/lib/supabase/server';
import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';
import DocumentSections from './DocumentSections';

export default async function AdminDocumentsPage() {
  const supabase = await createClient();
  const { data: sections } = await supabase
    .from('document_sections')
    .select(`
      id, nom, ordre,
      document_files(id, nom_original, taille_bytes, created_at)
    `)
    .order('ordre');

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-4">
        <Link href="/admin" className="text-slate-400 hover:text-slate-200">
          <ArrowLeft className="h-5 w-5" />
        </Link>
        <h1 className="text-2xl font-semibold text-slate-100">Documents</h1>
      </div>
      <p className="text-slate-400 text-sm">
        Créez des sections, ajoutez des fichiers. Les pilotes peuvent les consulter et les télécharger.
      </p>
      <DocumentSections sections={sections || []} />
    </div>
  );
}
