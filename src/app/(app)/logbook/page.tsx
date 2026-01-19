import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import Link from 'next/link';
import { formatDuree } from '@/lib/utils';
import { format } from 'date-fns';
import { fr } from 'date-fns/locale';
import { Plus } from 'lucide-react';
import VolDeleteButton from '@/components/VolDeleteButton';

export default async function LogbookPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;

  const { data: profile } = await supabase
    .from('profiles')
    .select('heures_initiales_minutes, blocked_until')
    .eq('id', user.id)
    .single();

  const blocked = profile?.blocked_until
    ? new Date(profile.blocked_until) > new Date()
    : false;

  const admin = createAdminClient();
  const { data: vols } = await admin
    .from('vols')
    .select(`
      id, pilote_id, copilote_id, duree_minutes, depart_utc, arrivee_utc, statut, compagnie_libelle, type_vol, role_pilote,
      aeroport_depart, aeroport_arrivee, instruction_type,
      refusal_count, refusal_reason,
      type_avion:types_avion(nom, constructeur),
      instructeur:profiles!vols_instructeur_id_fkey(identifiant),
      pilote:profiles!vols_pilote_id_fkey(identifiant),
      copilote:profiles!vols_copilote_id_fkey(identifiant)
    `)
    .or(`pilote_id.eq.${user.id},copilote_id.eq.${user.id}`)
    .order('depart_utc', { ascending: false });

  const totalValides = (vols || []).filter((v) => v.statut === 'validé');
  const totalMinutes =
    (profile?.heures_initiales_minutes ?? 0) +
    totalValides.reduce((s, v) => s + (v.duree_minutes || 0), 0);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <h1 className="text-2xl font-semibold text-slate-100">Mon logbook</h1>
        {!blocked && (
          <Link href="/logbook/nouveau" className="btn-primary inline-flex gap-2">
            <Plus className="h-4 w-4" />
            Nouveau vol
          </Link>
        )}
        {blocked && (
          <p className="text-amber-400 text-sm">
            Vous ne pouvez pas ajouter de vol pour le moment.
          </p>
        )}
      </div>

      <div className="card">
        <h2 className="text-lg font-medium text-slate-200 mb-1">Total temps de vol</h2>
        <p className="text-3xl font-bold text-sky-400">{formatDuree(totalMinutes)}</p>
      </div>

      <div className="card">
        <h2 className="text-lg font-medium text-slate-200 mb-4">Vols</h2>
        {!vols || vols.length === 0 ? (
          <p className="text-slate-500">Aucun vol enregistré.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-600 text-left text-slate-400">
                  <th className="pb-2 pr-4">Date</th>
                  <th className="pb-2 pr-4">Départ</th>
                  <th className="pb-2 pr-4">Arrivée</th>
                  <th className="pb-2 pr-4">Appareil</th>
                  <th className="pb-2 pr-4">Compagnie</th>
                  <th className="pb-2 pr-4">Durée</th>
                  <th className="pb-2 pr-4">Type</th>
                  <th className="pb-2 pr-4">Rôle</th>
                  <th className="pb-2 pr-4">Statut</th>
                  <th className="pb-2 w-10"> </th>
                </tr>
              </thead>
              <tbody>
                {vols.map((v) => (
                  <tr key={v.id} className="border-b border-slate-700/50">
                    <td className="py-3 pr-4 text-slate-300">
                      {(v.statut === 'refusé' && (v.refusal_count ?? 0) < 3) || v.statut === 'en_attente' ? (
                        <Link href={`/logbook/vol/${v.id}`} className="text-sky-400 hover:underline">
                          {format(new Date(v.depart_utc), 'dd MMM yyyy', { locale: fr })}
                        </Link>
                      ) : (
                        format(new Date(v.depart_utc), 'dd MMM yyyy', { locale: fr })
                      )}
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
                    <td className="py-3 pr-4 text-slate-300">{v.compagnie_libelle || '—'}</td>
                    <td className="py-3 pr-4 text-slate-300">{formatDuree(v.duree_minutes || 0)}</td>
                    <td className="py-3 pr-4 text-slate-300">
                      {v.type_vol}
                      {v.type_vol === 'Instruction' && (v.instructeur || v.instruction_type) && (
                        <span className="block text-xs text-slate-500 mt-0.5">
                          par {(Array.isArray(v.instructeur) ? v.instructeur[0] : v.instructeur)?.identifiant ?? '—'}
                          {v.instruction_type ? ` — ${v.instruction_type}` : ''}
                        </span>
                      )}
                      {v.copilote_id && (() => {
                        const estPilote = v.pilote_id === user.id;
                        const autre = estPilote ? (Array.isArray(v.copilote) ? v.copilote[0] : v.copilote) : (Array.isArray(v.pilote) ? v.pilote[0] : v.pilote);
                        return (
                          <span className="block text-xs text-slate-500 mt-0.5">
                            {estPilote ? 'Copilote: ' : 'Pilote: '}{autre?.identifiant ?? '—'}
                          </span>
                        );
                      })()}
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
                      <VolDeleteButton volId={v.id} />
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
