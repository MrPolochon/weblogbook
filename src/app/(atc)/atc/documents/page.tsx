import { createClient } from '@/lib/supabase/server';
import Link from 'next/link';
import { FolderOpen, FileText, File, Image, Download, FileSpreadsheet, FileArchive } from 'lucide-react';

function formatSize(bytes: number | null): string {
  if (!bytes) return '';
  if (bytes < 1024) return `${bytes} o`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} Ko`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} Mo`;
}

function getFileIcon(name: string) {
  const ext = name.split('.').pop()?.toLowerCase() || '';
  if (['jpg', 'jpeg', 'png', 'gif', 'webp', 'svg', 'bmp'].includes(ext)) return <Image className="h-5 w-5 text-pink-500" />;
  if (['pdf'].includes(ext)) return <FileText className="h-5 w-5 text-red-500" />;
  if (['xls', 'xlsx', 'csv'].includes(ext)) return <FileSpreadsheet className="h-5 w-5 text-emerald-600" />;
  if (['zip', 'rar', '7z', 'tar', 'gz'].includes(ext)) return <FileArchive className="h-5 w-5 text-amber-500" />;
  if (['doc', 'docx', 'txt', 'rtf', 'odt'].includes(ext)) return <FileText className="h-5 w-5 text-sky-600" />;
  return <File className="h-5 w-5 text-slate-400" />;
}

export default async function AtcDocumentsPage() {
  const supabase = await createClient();

  const { data: sections } = await supabase
    .from('document_sections')
    .select(`
      id, nom, ordre,
      document_files(id, nom_original, taille_bytes, created_at)
    `)
    .order('ordre', { ascending: true });

  const totalFiles = (sections || []).reduce((sum, s) => sum + ((s.document_files as unknown[])?.length || 0), 0);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-slate-900">Documents</h1>
        <p className="text-sm text-slate-500 mt-1">
          {totalFiles} document(s) disponible(s)
        </p>
      </div>

      {!sections || sections.length === 0 ? (
        <div className="text-center py-16 border-2 border-dashed border-slate-300 rounded-xl">
          <FolderOpen className="h-12 w-12 text-slate-400 mx-auto mb-3" />
          <p className="text-slate-500 font-medium">Aucun document disponible</p>
        </div>
      ) : (
        <div className="space-y-5">
          {sections.map((s) => {
            const files = (s.document_files || []) as { id: string; nom_original: string; taille_bytes: number | null; created_at: string }[];
            return (
              <div key={s.id} className="rounded-xl border border-slate-200 bg-white overflow-hidden shadow-sm">
                <div className="flex items-center gap-3 px-5 py-3 bg-slate-50 border-b border-slate-200">
                  <FolderOpen className="h-5 w-5 text-sky-600" />
                  <h2 className="font-semibold text-slate-800">{s.nom}</h2>
                  <span className="text-xs text-slate-400">{files.length} fichier(s)</span>
                </div>

                {files.length > 0 ? (
                  <ul className="divide-y divide-slate-100">
                    {files.map((f) => (
                      <li key={f.id}>
                        <Link
                          href={`/api/documents/download/${f.id}`}
                          className="flex items-center gap-3 px-5 py-3 hover:bg-sky-50 transition-colors group"
                        >
                          {getFileIcon(f.nom_original)}
                          <span className="text-sm text-slate-700 font-medium flex-1 truncate group-hover:text-sky-700 transition-colors">
                            {f.nom_original}
                          </span>
                          {f.taille_bytes ? (
                            <span className="text-xs text-slate-400 shrink-0">{formatSize(f.taille_bytes)}</span>
                          ) : null}
                          <Download className="h-4 w-4 text-slate-300 group-hover:text-sky-600 transition-colors shrink-0" />
                        </Link>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="text-slate-400 text-sm italic px-5 py-4">Aucun fichier.</p>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
