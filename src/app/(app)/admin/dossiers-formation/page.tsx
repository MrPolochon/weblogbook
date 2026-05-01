import Link from 'next/link';
import { ArrowLeft, GraduationCap } from 'lucide-react';
import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';

export const dynamic = 'force-dynamic';

type ArchiveRow = {
  id: string;
  eleve_identifiant_snapshot: string;
  licence_code: string;
  licence_label_snapshot: string | null;
  instructeur_identifiant_snapshot: string | null;
  storage_bucket: string;
  storage_path: string;
  completed_at: string;
};

export default async function AdminFormationArchivesPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).single();
  if (profile?.role !== 'admin') redirect('/');

  const { data: archives, error } = await supabase
    .from('instruction_formation_archives')
    .select(
      'id, eleve_identifiant_snapshot, licence_code, licence_label_snapshot, instructeur_identifiant_snapshot, storage_bucket, storage_path, completed_at',
    )
    .order('completed_at', { ascending: false })
    .limit(500);

  const adminSdk = createAdminClient();

  const rowsWithUrls = await Promise.all(
    ((archives || []) as ArchiveRow[]).map(async (row) => {
      const bucket = row.storage_bucket || 'documents';
      const { data: signed } = await adminSdk.storage.from(bucket).createSignedUrl(row.storage_path, 7200);
      return { row, signedUrl: signed?.signedUrl ?? null };
    }),
  );

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-4">
        <Link href="/admin" className="text-slate-400 hover:text-slate-200">
          <ArrowLeft className="h-5 w-5" />
        </Link>
        <div className="flex items-start gap-3">
          <GraduationCap className="h-8 w-8 text-sky-400 shrink-0 mt-1" />
          <div>
            <h1 className="text-2xl font-semibold text-slate-100">DOSSIER FORMATION</h1>
            <p className="text-slate-400 text-sm mt-1">
              Archives PDF générées à la fin d&apos;une formation vol ou ATC. Stockage sous{' '}
              <code className="text-sky-300/90 bg-slate-800/80 px-1 rounded">DOSSIER FORMATION/&lt;code formation&gt;/</code>{' '}
              dans le bucket documents.
            </p>
          </div>
        </div>
      </div>

      {error ? (
        <div className="rounded-lg border border-amber-700/50 bg-amber-950/30 p-4 text-amber-200 text-sm">
          Impossible de charger les archives ({error.message}). Exécutez la migration SQL{' '}
          <code className="text-amber-100">supabase/add_instruction_notes_transfer_archives.sql</code> si la table n&apos;existe pas encore.
        </div>
      ) : rowsWithUrls.length === 0 ? (
        <p className="text-slate-500">Aucune archive pour le moment.</p>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-slate-700/50">
          <table className="min-w-full text-sm">
            <thead className="bg-slate-800/60 text-left text-slate-400">
              <tr>
                <th className="p-3 font-medium">Date clôture</th>
                <th className="p-3 font-medium">Élève</th>
                <th className="p-3 font-medium">Formation</th>
                <th className="p-3 font-medium">Instructeur</th>
                <th className="p-3 font-medium">Fichier</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-700/40">
              {rowsWithUrls.map(({ row, signedUrl }) => (
                <tr key={row.id} className="text-slate-200 hover:bg-slate-800/30">
                  <td className="p-3 whitespace-nowrap text-slate-400">
                    {new Date(row.completed_at).toLocaleString('fr-FR')}
                  </td>
                  <td className="p-3 font-medium">{row.eleve_identifiant_snapshot}</td>
                  <td className="p-3">
                    <span className="text-slate-300">{row.licence_label_snapshot || row.licence_code}</span>
                    <span className="text-slate-500 ml-1">({row.licence_code})</span>
                  </td>
                  <td className="p-3 text-slate-400">{row.instructeur_identifiant_snapshot ?? '—'}</td>
                  <td className="p-3">
                    {signedUrl ? (
                      <a
                        href={signedUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-sky-400 hover:text-sky-300 underline"
                      >
                        Télécharger PDF
                      </a>
                    ) : (
                      <span className="text-amber-500/90 text-xs">Lien indisponible</span>
                    )}
                    <div className="text-[11px] text-slate-600 mt-1 break-all max-w-xs">{row.storage_path}</div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
