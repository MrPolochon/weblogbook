import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { redirect } from 'next/navigation';
import Link from 'next/link';
import { formatDuree } from '@/lib/utils';
import { formatDateMediumUTC, formatTimeUTC } from '@/lib/date-utils';
import { ArrowLeft, Eye } from 'lucide-react';
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
      escadrille_ou_escadron, nature_vol_militaire, nature_vol_militaire_autre, aeroport_depart, aeroport_arrivee,
      pilote:profiles!vols_pilote_id_fkey(identifiant),
      copilote:profiles!vols_copilote_id_fkey(identifiant),
      equipage:vols_equipage_militaire(profile_id)
    `)
    .eq('type_vol', 'Vol militaire')
    .in('statut', ['en_attente', 'validé', 'refusé'])
    .order('depart_utc', { ascending: false });

  const totalValides = (vols || []).filter((v) => v.statut === 'validé');
  const totalMinutes = totalValides.reduce((s, v) => s + (v.duree_minutes || 0), 0);

  const libNature = (n: string | null, a: string | null) => {
    if (!n) return '—';
    const map: Record<string, string> = { entrainement: 'Entraînement', escorte: 'Escorte', sauvetage: 'Sauvetage', reconnaissance: 'Reconnaissance', autre: a || 'Autre' };
    return map[n] || n;
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-4">
        <Link href="/admin" className="text-slate-400 hover:text-slate-200">
          <ArrowLeft className="h-5 w-5" />
        </Link>
        <h1 className="text-2xl font-semibold text-slate-100">Tous les vols militaires</h1>
      </div>

      <div className="card">
        <h2 className="text-lg font-medium text-slate-200 mb-1">Résumé</h2>
        <p className="text-slate-300">
          <span className="font-medium text-sky-400">{vols?.length ?? 0}</span> vol(s) militaire(s) — 
          temps validé : <span className="font-medium text-sky-400">{formatDuree(totalMinutes)}</span>
        </p>
      </div>

      <div className="card">
        <h2 className="text-lg font-medium text-slate-200 mb-4">Vols militaires enregistrés</h2>
        {!vols || vols.length === 0 ? (
          <p className="text-slate-500">Aucun vol militaire enregistré.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-600 text-left text-slate-400">
                  <th className="pb-2 pr-4">Date</th>
                  <th className="pb-2 pr-4">Départ</th>
                  <th className="pb-2 pr-4">Arrivée</th>
                  <th className="pb-2 pr-4">Appareil</th>
                  <th className="pb-2 pr-4">Escadrille/Escadron</th>
                  <th className="pb-2 pr-4">Nature</th>
                  <th className="pb-2 pr-4">Durée</th>
                  <th className="pb-2 pr-4">Pilote / Équipage</th>
                  <th className="pb-2 pr-4">Statut</th>
                  <th className="pb-2 w-24"> </th>
                </tr>
              </thead>
              <tbody>
                {vols.map((v) => {
                  const piloteId = v.pilote_id;
                  const piloteIdentifiant = (Array.isArray(v.pilote) ? v.pilote[0] : v.pilote)?.identifiant ?? '—';
                  const equipageCount = Array.isArray(v.equipage) ? v.equipage.length : 0;
                  return (
                    <tr key={v.id} className="border-b border-slate-700/50">
                      <td className="py-3 pr-4 text-slate-300">
                        {format(new Date(v.depart_utc), 'dd MMM yyyy', { locale: fr })}
                      </td>
                      <td className="py-3 pr-4 text-slate-300">{v.aeroport_depart || '—'} {format(new Date(v.depart_utc), 'HH:mm')}</td>
                      <td className="py-3 pr-4 text-slate-300">{v.aeroport_arrivee || '—'} {v.arrivee_utc ? format(new Date(v.arrivee_utc), 'HH:mm') : '—'}</td>
                      <td className="py-3 pr-4 text-slate-300">{v.type_avion_militaire || '—'}</td>
                      <td className="py-3 pr-4 text-slate-300">{v.escadrille_ou_escadron === 'escadrille' ? 'Escadrille' : v.escadrille_ou_escadron === 'escadron' ? 'Escadron' : v.escadrille_ou_escadron || '—'}</td>
                      <td className="py-3 pr-4 text-slate-300">{libNature(v.nature_vol_militaire, v.nature_vol_militaire_autre)}</td>
                      <td className="py-3 pr-4 text-slate-300">{formatDuree(v.duree_minutes || 0)}</td>
                      <td className="py-3 pr-4 text-slate-300">
                        {piloteId ? (
                          <Link href={`/admin/pilotes/${piloteId}/logbook`} className="text-sky-400 hover:underline">
                            {piloteIdentifiant}
                          </Link>
                        ) : (
                          piloteIdentifiant
                        )}
                        {equipageCount > 0 && <span className="text-slate-500 ml-1">(+{equipageCount} équipage)</span>}
                      </td>
                      <td className="py-3 pr-4">
                        <span className={v.statut === 'validé' ? 'text-emerald-400' : v.statut === 'refusé' ? 'text-red-400' : 'text-amber-400'}>
                          {v.statut === 'validé' ? 'Validé' : v.statut === 'refusé' ? 'Refusé' : 'En attente'}
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
