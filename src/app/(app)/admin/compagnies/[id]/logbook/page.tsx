import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { redirect, notFound } from 'next/navigation';
import Link from 'next/link';
import { formatDuree } from '@/lib/utils';
import { format } from 'date-fns';
import { fr } from 'date-fns/locale';
import { ArrowLeft, BookOpen, Pencil } from 'lucide-react';
import VolDeleteButton from '@/components/VolDeleteButton';

export default async function AdminCompagnieLogbookPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id: compagnieId } = await params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).single();
  if (profile?.role !== 'admin') redirect('/admin');

  const admin = createAdminClient();
  const { data: c } = await admin
    .from('compagnies')
    .select('id, nom')
    .eq('id', compagnieId)
    .single();

  if (!c) notFound();

  const { data: vols } = await admin
    .from('vols')
    .select(`
      id, pilote_id, copilote_id, duree_minutes, depart_utc, arrivee_utc, statut, type_vol, role_pilote,
      aeroport_depart, aeroport_arrivee, instruction_type,
      type_avion:types_avion(nom, constructeur),
      pilote:profiles!vols_pilote_id_fkey(identifiant),
      copilote:profiles!vols_copilote_id_fkey(identifiant),
      instructeur:profiles!vols_instructeur_id_fkey(identifiant)
    `)
    .eq('compagnie_id', compagnieId)
    .in('statut', ['en_attente', 'validé', 'refusé'])
    .order('depart_utc', { ascending: false });

  const totalValides = (vols || []).filter((v) => v.statut === 'validé');
  const totalMinutes = totalValides.reduce((s, v) => s + (v.duree_minutes || 0), 0);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center gap-4">
        <Link href="/admin/compagnies" className="text-slate-400 hover:text-slate-200">
          <ArrowLeft className="h-5 w-5" />
        </Link>
        <h1 className="text-2xl font-semibold text-slate-100 flex items-center gap-2">
          <BookOpen className="h-6 w-6" />
          Logbook — {c.nom}
        </h1>
      </div>

      <div className="card grid grid-cols-2 gap-4 sm:grid-cols-3">
        <div>
          <h2 className="text-sm font-medium text-slate-400">Vols (validés)</h2>
          <p className="text-xl font-bold text-sky-400">{totalValides.length}</p>
        </div>
        <div>
          <h2 className="text-sm font-medium text-slate-400">Total temps de vol</h2>
          <p className="text-xl font-bold text-sky-400">{formatDuree(totalMinutes)}</p>
        </div>
      </div>

      <div className="card">
        <h2 className="text-lg font-medium text-slate-200 mb-4">Vols</h2>
        {!vols || vols.length === 0 ? (
          <p className="text-slate-500">Aucun vol enregistré pour cette compagnie.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-600 text-left text-slate-400">
                  <th className="pb-2 pr-4">Date</th>
                  <th className="pb-2 pr-4">Départ</th>
                  <th className="pb-2 pr-4">Arrivée</th>
                  <th className="pb-2 pr-4">Appareil</th>
                  <th className="pb-2 pr-4">Pilote</th>
                  <th className="pb-2 pr-4">Durée</th>
                  <th className="pb-2 pr-4">Type</th>
                  <th className="pb-2 pr-4">Rôle</th>
                  <th className="pb-2 pr-4">Statut</th>
                  <th className="pb-2 w-20"> </th>
                </tr>
              </thead>
              <tbody>
                {vols.map((v) => (
                  <tr key={v.id} className="border-b border-slate-700/50">
                    <td className="py-3 pr-4 text-slate-300">
                      {format(new Date(v.depart_utc), 'dd MMM yyyy', { locale: fr })}
                    </td>
                    <td className="py-3 pr-4 text-slate-300">
                      {v.aeroport_depart || '—'} {format(new Date(v.depart_utc), 'HH:mm')}
                    </td>
                    <td className="py-3 pr-4 text-slate-300">
                      {v.aeroport_arrivee || '—'} {v.arrivee_utc ? format(new Date(v.arrivee_utc), 'HH:mm') : '—'}
                    </td>
                    <td className="py-3 pr-4 text-slate-300">
                      {(v.type_avion as { nom?: string })?.nom || '—'}
                    </td>
                    <td className="py-3 pr-4 text-slate-300">
                      {(Array.isArray(v.pilote) ? v.pilote[0] : v.pilote)?.identifiant ?? '—'}
                    </td>
                    <td className="py-3 pr-4 text-slate-300">{formatDuree(v.duree_minutes || 0)}</td>
                    <td className="py-3 pr-4 text-slate-300">
                      {v.type_vol}
                      {v.type_vol === 'Instruction' && (v.instructeur || v.instruction_type) && (
                        <span className="block text-xs text-slate-500 mt-0.5">
                          par {(Array.isArray(v.instructeur) ? v.instructeur[0] : v.instructeur)?.identifiant ?? '—'}
                          {v.instruction_type ? ` — ${v.instruction_type}` : ''}
                        </span>
                      )}
                      {v.copilote_id && (
                        <span className="block text-xs text-slate-500 mt-0.5">
                          Pilote: {(Array.isArray(v.pilote) ? v.pilote[0] : v.pilote)?.identifiant ?? '—'}
                          {' — Copilote: '}{(Array.isArray(v.copilote) ? v.copilote[0] : v.copilote)?.identifiant ?? '—'}
                        </span>
                      )}
                    </td>
                    <td className="py-3 pr-4 text-slate-300">{v.role_pilote}</td>
                    <td className="py-3 pr-4">
                      <span
                        className={
                          v.statut === 'validé'
                            ? 'text-emerald-400'
                            : v.statut === 'refusé'
                              ? 'text-red-400'
                              : 'text-amber-400'
                        }
                      >
                        {v.statut === 'validé' ? 'Validé' : v.statut === 'refusé' ? 'Refusé' : 'En attente'}
                      </span>
                    </td>
                    <td className="py-3">
                      <div className="flex items-center gap-1">
                        <Link
                          href={`/logbook/vol/${v.id}?from=admin-compagnie&cid=${compagnieId}`}
                          className="rounded p-1.5 text-slate-400 hover:bg-slate-700/50 hover:text-sky-400"
                          title="Modifier"
                        >
                          <Pencil className="h-4 w-4" />
                        </Link>
                        <VolDeleteButton volId={v.id} />
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
