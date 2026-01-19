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
    .select('heures_initiales_minutes, blocked_until, role')
    .eq('id', user.id)
    .single();

  const isAdmin = profile?.role === 'admin';

  const blocked = profile?.blocked_until
    ? new Date(profile.blocked_until) > new Date()
    : false;

  const admin = createAdminClient();
  const [{ data: vols }, { data: volsEnAttentePilote }, { data: volsEnAttenteCopilote }, { data: volsRefuseParCopilote }, { data: volsEnAttenteInstructeur }] = await Promise.all([
    admin.from('vols').select(`
      id, pilote_id, copilote_id, instructeur_id, duree_minutes, depart_utc, arrivee_utc, statut, compagnie_libelle, type_vol, role_pilote,
      aeroport_depart, aeroport_arrivee, instruction_type,
      refusal_count, refusal_reason,
      type_avion:types_avion(nom, constructeur),
      instructeur:profiles!vols_instructeur_id_fkey(identifiant),
      pilote:profiles!vols_pilote_id_fkey(identifiant),
      copilote:profiles!vols_copilote_id_fkey(identifiant)
    `).or(`pilote_id.eq.${user.id},copilote_id.eq.${user.id},instructeur_id.eq.${user.id}`).in('statut', ['en_attente', 'validé', 'refusé']).order('depart_utc', { ascending: false }),
    supabase.from('vols').select('id, depart_utc, aeroport_depart, aeroport_arrivee, pilote:profiles!vols_pilote_id_fkey(identifiant)').eq('copilote_id', user.id).eq('statut', 'en_attente_confirmation_pilote').order('depart_utc', { ascending: false }),
    supabase.from('vols').select('id, depart_utc, aeroport_depart, aeroport_arrivee, copilote:profiles!vols_copilote_id_fkey(identifiant)').eq('pilote_id', user.id).eq('statut', 'en_attente_confirmation_copilote').order('depart_utc', { ascending: false }),
    supabase.from('vols').select('id, depart_utc, aeroport_depart, aeroport_arrivee, copilote:profiles!vols_copilote_id_fkey(identifiant)').eq('pilote_id', user.id).eq('statut', 'refuse_par_copilote').order('depart_utc', { ascending: false }),
    admin.from('vols').select('id, depart_utc, aeroport_depart, aeroport_arrivee, instructeur:profiles!vols_instructeur_id_fkey(identifiant)').eq('pilote_id', user.id).eq('statut', 'en_attente_confirmation_instructeur').order('depart_utc', { ascending: false }),
  ]);

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

      {volsEnAttentePilote && volsEnAttentePilote.length > 0 && (
        <div className="card border-amber-500/30 bg-amber-500/5">
          <h2 className="text-lg font-medium text-amber-200 mb-2">En attente que le pilote confirme</h2>
          <p className="text-sm text-slate-400 mb-3">Vous avez indiqué ces vols comme co-pilote. Ils n’apparaîtront dans les logbooks qu’après confirmation du pilote.</p>
          <ul className="space-y-2">
            {volsEnAttentePilote.map((v) => (
              <li key={v.id} className="flex items-center justify-between py-2 border-b border-slate-700/30 last:border-0">
                <span className="text-slate-300">
                  {format(new Date(v.depart_utc), 'dd MMM yyyy', { locale: fr })} — {v.aeroport_depart || '—'} → {v.aeroport_arrivee || '—'}
                  {' · Pilote: '}{(Array.isArray(v.pilote) ? v.pilote[0] : v.pilote)?.identifiant ?? '—'}
                </span>
                <span className="flex items-center gap-2">
                  <Link href={`/logbook/vol/${v.id}`} className="text-sm text-sky-400 hover:underline">Modifier</Link>
                  <VolDeleteButton volId={v.id} />
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {volsEnAttenteCopilote && volsEnAttenteCopilote.length > 0 && (
        <div className="card border-amber-500/30 bg-amber-500/5">
          <h2 className="text-lg font-medium text-amber-200 mb-2">En attente que le co-pilote confirme</h2>
          <p className="text-sm text-slate-400 mb-3">Vous avez indiqué ces vols avec un co-pilote. Ils n&apos;apparaîtront dans les logbooks qu&apos;après confirmation du co-pilote.</p>
          <ul className="space-y-2">
            {volsEnAttenteCopilote.map((v) => (
              <li key={v.id} className="flex items-center justify-between py-2 border-b border-slate-700/30 last:border-0">
                <span className="text-slate-300">
                  {format(new Date(v.depart_utc), 'dd MMM yyyy', { locale: fr })} — {v.aeroport_depart || '—'} → {v.aeroport_arrivee || '—'}
                  {' · Co-pilote: '}{(Array.isArray(v.copilote) ? v.copilote[0] : v.copilote)?.identifiant ?? '—'}
                </span>
                <span className="flex items-center gap-2">
                  <Link href={`/logbook/vol/${v.id}`} className="text-sm text-sky-400 hover:underline">Modifier</Link>
                  <VolDeleteButton volId={v.id} />
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {volsEnAttenteInstructeur && volsEnAttenteInstructeur.length > 0 && (
        <div className="card border-sky-500/30 bg-sky-500/5">
          <h2 className="text-lg font-medium text-sky-200 mb-2">En attente que l&apos;instructeur confirme</h2>
          <p className="text-sm text-slate-400 mb-3">Vols d&apos;instruction. L&apos;instructeur indiqué validera directement — le vol ne passe pas par la file des admins. Seul l&apos;instructeur peut supprimer.</p>
          <ul className="space-y-2">
            {volsEnAttenteInstructeur.map((v) => (
              <li key={v.id} className="flex items-center justify-between py-2 border-b border-slate-700/30 last:border-0">
                <span className="text-slate-300">
                  {format(new Date(v.depart_utc), 'dd MMM yyyy', { locale: fr })} — {v.aeroport_depart || '—'} → {v.aeroport_arrivee || '—'}
                  {' · Instructeur: '}{(Array.isArray(v.instructeur) ? v.instructeur[0] : v.instructeur)?.identifiant ?? '—'}
                </span>
                <span className="flex items-center gap-2">
                  <Link href={`/logbook/vol/${v.id}`} className="text-sm text-sky-400 hover:underline">Modifier</Link>
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {volsRefuseParCopilote && volsRefuseParCopilote.length > 0 && (
        <div className="card border-red-500/30 bg-red-500/5">
          <h2 className="text-lg font-medium text-red-200 mb-2">Le co-pilote a refusé de confirmer</h2>
          <p className="text-sm text-slate-400 mb-3">Le co-pilote indiqué a refusé d&apos;être associé à ces vols. Modifiez le co-pilote ou retirez-le pour renvoyer le vol.</p>
          <ul className="space-y-2">
            {volsRefuseParCopilote.map((v) => (
              <li key={v.id} className="flex items-center justify-between py-2 border-b border-slate-700/30 last:border-0">
                <span className="text-slate-300">
                  {format(new Date(v.depart_utc), 'dd MMM yyyy', { locale: fr })} — {v.aeroport_depart || '—'} → {v.aeroport_arrivee || '—'}
                  {' · Co-pilote indiqué: '}{(Array.isArray(v.copilote) ? v.copilote[0] : v.copilote)?.identifiant ?? '—'}
                </span>
                <span className="flex items-center gap-2">
                  <Link href={`/logbook/vol/${v.id}`} className="text-sm text-sky-400 hover:underline">Modifier</Link>
                  <VolDeleteButton volId={v.id} />
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}

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
                    <td className="py-3 pr-4 text-slate-300">{v.instructeur_id === user.id ? 'Instructeur' : v.copilote_id === user.id ? 'Co-pilote' : v.role_pilote}</td>
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
                      <VolDeleteButton
                        volId={v.id}
                        canDelete={isAdmin || (v.type_vol === 'Instruction' && v.instructeur_id ? v.instructeur_id === user.id : (v.pilote_id === user.id || v.copilote_id === user.id))}
                      />
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
