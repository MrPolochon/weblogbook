import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { redirect } from 'next/navigation';
import Link from 'next/link';
import { formatDuree } from '@/lib/utils';
import { formatDateMediumUTC, formatTimeUTC } from '@/lib/date-utils';
import { ArrowLeft, Eye, Shield } from 'lucide-react';
import { LIB_STATUT, libEscadrille, libNatureVol } from '@/lib/armee';
import VolDeleteButton from '@/components/VolDeleteButton';

export default async function AdminMilitairePage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).single();
  if (profile?.role !== 'admin') redirect('/admin');

  const admin = createAdminClient();
  const { data: vols } = await admin
    .from('vols')
    .select(`
      id, pilote_id, copilote_id, chef_escadron_id, duree_minutes, depart_utc, arrivee_utc, statut, type_avion_militaire, callsign,
      escadrille_ou_escadron, nature_vol_militaire, nature_vol_militaire_autre, aeroport_depart, aeroport_arrivee, mission_id,
      pilote:profiles!vols_pilote_id_fkey(identifiant),
      copilote:profiles!vols_copilote_id_fkey(identifiant),
      equipage:vols_equipage_militaire(profile_id)
    `)
    .eq('type_vol', 'Vol militaire')
    .in('statut', ['en_attente', 'validé', 'refusé'])
    .order('depart_utc', { ascending: false });

  const totalValides = (vols || []).filter((v) => v.statut === 'validé');
  const totalMinutes = totalValides.reduce((s, v) => s + (v.duree_minutes || 0), 0);
  const enAttente = (vols || []).filter((v) => v.statut === 'en_attente').length;

  return (
    <div className="space-y-6 max-w-6xl mx-auto animate-page-reveal">
      <div className="flex items-center gap-4">
        <Link href="/admin" className="p-2 rounded-lg text-slate-400 hover:text-slate-200 hover:bg-slate-800/60 transition-colors">
          <ArrowLeft className="h-5 w-5" />
        </Link>
        <div className="flex items-center gap-3">
          <Shield className="h-6 w-6 text-red-400" />
          <h1 className="text-2xl font-semibold text-slate-100">Vols militaires</h1>
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        <div className="rounded-xl border border-slate-700/50 bg-slate-800/30 p-4">
          <p className="text-xs text-slate-500">Total</p>
          <p className="text-2xl font-bold text-slate-100">{vols?.length ?? 0}</p>
        </div>
        <div className="rounded-xl border border-amber-500/20 bg-amber-500/5 p-4">
          <p className="text-xs text-amber-400/80">En attente</p>
          <p className="text-2xl font-bold text-amber-300">{enAttente}</p>
        </div>
        <div className="rounded-xl border border-emerald-500/20 bg-emerald-500/5 p-4">
          <p className="text-xs text-emerald-400/80">Temps validé</p>
          <p className="text-2xl font-bold text-emerald-300">{formatDuree(totalMinutes)}</p>
        </div>
      </div>

      <div className="rounded-xl border border-slate-700/50 bg-slate-800/30 p-5">
        <h2 className="text-lg font-medium text-slate-200 mb-4">Registre</h2>
        {!vols || vols.length === 0 ? (
          <p className="text-slate-500">Aucun vol militaire enregistré.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-600 text-left text-slate-400">
                  <th className="pb-2 pr-4">Date</th>
                  <th className="pb-2 pr-4">Trajet</th>
                  <th className="pb-2 pr-4">Appareil</th>
                  <th className="pb-2 pr-4">Type</th>
                  <th className="pb-2 pr-4">Nature</th>
                  <th className="pb-2 pr-4">Durée</th>
                  <th className="pb-2 pr-4">Pilote</th>
                  <th className="pb-2 pr-4">Statut</th>
                  <th className="pb-2 w-24"> </th>
                </tr>
              </thead>
              <tbody>
                {vols.map((v) => {
                  const piloteIdentifiant = (Array.isArray(v.pilote) ? v.pilote[0] : v.pilote)?.identifiant ?? '—';
                  const equipageCount = Array.isArray(v.equipage) ? v.equipage.length : 0;
                  const statut = LIB_STATUT[v.statut] || LIB_STATUT.en_attente;
                  return (
                    <tr key={v.id} className="border-b border-slate-700/50 hover:bg-slate-800/40 transition-colors">
                      <td className="py-3 pr-4 text-slate-300">{formatDateMediumUTC(v.depart_utc)}</td>
                      <td className="py-3 pr-4 text-slate-300 font-mono text-xs">
                        {v.aeroport_depart || '—'}→{v.aeroport_arrivee || '—'}
                        <span className="block text-slate-500">{formatTimeUTC(v.depart_utc)}</span>
                      </td>
                      <td className="py-3 pr-4 text-slate-300">{v.type_avion_militaire || '—'}</td>
                      <td className="py-3 pr-4 text-slate-300">{libEscadrille(v.escadrille_ou_escadron)}</td>
                      <td className="py-3 pr-4 text-slate-300">
                        {libNatureVol(v.nature_vol_militaire, v.nature_vol_militaire_autre)}
                        {v.mission_id && <span className="ml-1 text-xs text-sky-400">· mission</span>}
                      </td>
                      <td className="py-3 pr-4 text-slate-300">{formatDuree(v.duree_minutes || 0)}</td>
                      <td className="py-3 pr-4 text-slate-300">
                        {v.pilote_id ? (
                          <Link href={`/admin/pilotes/${v.pilote_id}/logbook`} className="text-sky-400 hover:underline">
                            {piloteIdentifiant}
                          </Link>
                        ) : (
                          piloteIdentifiant
                        )}
                        {equipageCount > 0 && <span className="text-slate-500 ml-1">(+{equipageCount})</span>}
                      </td>
                      <td className="py-3 pr-4">
                        <span className={`text-xs px-2 py-0.5 rounded-full border ${statut.bg} ${statut.color}`}>
                          {statut.label}
                        </span>
                      </td>
                      <td className="py-3">
                        <div className="flex items-center gap-1">
                          <Link
                            href={`/admin/militaire/vol/${v.id}`}
                            className="rounded p-1.5 text-slate-400 hover:bg-slate-700/50 hover:text-sky-400"
                            title="Voir"
                          >
                            <Eye className="h-4 w-4" />
                          </Link>
                          <VolDeleteButton volId={v.id} />
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
