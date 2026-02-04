import { createClient } from '@/lib/supabase/server';
import Link from 'next/link';
import { FolderOpen, FileText } from 'lucide-react';

export default async function SiaviDocumentsPage() {
  const supabase = await createClient();

  const { data: sections } = await supabase
    .from('document_sections')
    .select(`
      id, nom, ordre,
      document_files(id, nom_original, created_at)
    `)
    .order('ordre', { ascending: true });

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold text-red-900">Documents</h1>
      {!sections || sections.length === 0 ? (
        <p className="text-slate-600">Aucune section pour le moment.</p>
      ) : (
        <div className="space-y-4">
          {sections.map((s) => (
            <div key={s.id} className="rounded-xl border border-red-200 bg-white p-4">
              <h2 className="flex items-center gap-2 font-medium text-red-800 mb-3">
                <FolderOpen className="h-5 w-5 text-red-600" />
                {s.nom}
              </h2>
              {s.document_files && (s.document_files as unknown[]).length > 0 ? (
                <ul className="space-y-2">
                  {(s.document_files as { id: string; nom_original: string; created_at: string }[]).map((f) => (
                    <li key={f.id}>
                      <Link
                        href={`/api/documents/download/${f.id}`}
                        className="flex items-center gap-2 text-red-700 hover:text-red-900 hover:underline"
                      >
                        <FileText className="h-4 w-4" />
                        {f.nom_original}
                      </Link>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-slate-600 text-sm">Aucun fichier.</p>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
