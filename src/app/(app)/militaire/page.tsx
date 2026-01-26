import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { redirect } from 'next/navigation';
import Link from 'next/link';
import { formatDuree } from '@/lib/utils';
import { formatDateMediumUTC, formatTimeUTC } from '@/lib/date-utils';
import { Plus } from 'lucide-react';
import VolDeleteButton from '@/components/VolDeleteButton';

export default async function MilitairePage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const { data: profile } = await supabase.from('profiles').select('armee, role, heures_initiales_minutes').eq('id', user.id).single();
  if (!profile?.armee && profile?.role !== 'admin') redirect('/logbook');

  const admin = createAdminClient();
  const selectVols = `
    id, pilote_id, copilote_id, chef_escadron_id, duree_minutes, depart_utc, arrivee_utc, statut, type_avion_militaire, role_pilote, callsign,
    escadrille_ou_escadron, nature_vol_militaire, nature_vol_militaire_autre, aeroport_depart, aeroport_arrivee,
    pilote:profiles!vols_pilote_id_fkey(identifiant),
    copilote:profiles!vols_copilote_id_fkey(identifiant),
    equipage:vols_equipage_militaire(profile_id)
  `;

  const [{ data: vols1 }, { data: eqData }] = await Promise.all([
    admin.from('vols').select(selectVols).eq('type_vol', 'Vol militaire').or(`pilote_id.eq.${user.id},copilote_id.eq.${user.id},chef_escadron_id.eq.${user.id}`).in('statut', ['en_attente', 'validé', 'refusé']).order('depart_utc', { ascending: false }),
    admin.from('vols_equipage_militaire').select('vol_id').eq('profile_id', user.id),
  ]);

  const volIdsEq = Array.from(new Set((eqData || []).map((r) => r.vol_id)));
  let vols2: typeof vols1 = [];
  if (volIdsEq.length > 0) {
    const { data } = await admin.from('vols').select(selectVols).eq('type_vol', 'Vol militaire').in('id', volIdsEq).in('statut', ['en_attente', 'validé', 'refusé']).order('depart_utc', { ascending: false });
    vols2 = data || [];
  }

  const byId = new Map((vols1 || []).map((v) => [v.id, v]));
  for (const v of vols2) { if (!byId.has(v.id)) byId.set(v.id, v); }
  const vols = Array.from(byId.values()).sort((a, b) => new Date(b.depart_utc).getTime() - new Date(a.depart_utc).getTime());

  const totalValides = vols.filter((v) => v.statut === 'validé');
  const totalMinutes = totalValides.reduce((s, v) => s + (v.duree_minutes || 0), 0);

  const libNature = (n: string | null, a: string | null) => {
    if (!n) return '—';
    const map: Record<string, string> = { entrainement: 'Entraînement', escorte: 'Escorte', sauvetage: 'Sauvetage', reconnaissance: 'Reconnaissance', autre: a || 'Autre' };
    return map[n] || n;
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <h1 className="text-2xl font-semibold text-slate-100">Espace militaire</h1>
        <Link href="/militaire/nouveau" className="btn-primary inline-flex gap-2">
          <Plus className="h-4 w-4" />
          Nouveau vol militaire
        </Link>
      </div>

      <div className="card">
        <h2 className="text-lg font-medium text-slate-200 mb-1">Total temps de vol (militaires validés)</h2>
        <p className="text-3xl font-bold text-sky-400">{formatDuree(totalMinutes)}</p>
      </div>

      <div className="card">
        <h2 className="text-lg font-medium text-slate-200 mb-4">Vols militaires</h2>
        {!vols || vols.length === 0 ? (
          <p className="text-slate-500">Aucun vol militaire.</p>
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
                  <th className="pb-2 pr-4">Rôle</th>
                  <th className="pb-2 pr-4">Statut</th>
                  <th className="pb-2 w-10"> </th>
                </tr>
              </thead>
              <tbody>
                {vols.map((v) => (
                  <tr key={v.id} className="border-b border-slate-700/50">
                    <td className="py-3 pr-4 text-slate-300">
                      {formatDateMediumUTC(v.depart_utc)}
                    </td>
                    <td className="py-3 pr-4 text-slate-300">{v.aeroport_depart || '—'} {formatTimeUTC(v.depart_utc)}</td>
                    <td className="py-3 pr-4 text-slate-300">{v.aeroport_arrivee || '—'} {v.arrivee_utc ? formatTimeUTC(v.arrivee_utc) : '—'}</td>
                    <td className="py-3 pr-4 text-slate-300">{v.type_avion_militaire || '—'}</td>
                    <td className="py-3 pr-4 text-slate-300">{v.escadrille_ou_escadron === 'escadrille' ? 'Escadrille' : v.escadrille_ou_escadron === 'escadron' ? 'Escadron' : v.escadrille_ou_escadron || '—'}</td>
                    <td className="py-3 pr-4 text-slate-300">{libNature(v.nature_vol_militaire, v.nature_vol_militaire_autre)}</td>
                    <td className="py-3 pr-4 text-slate-300">{formatDuree(v.duree_minutes || 0)}</td>
                    <td className="py-3 pr-4 text-slate-300">{v.chef_escadron_id === user.id ? 'Chef d\'escadron' : v.copilote_id === user.id ? 'Co-pilote' : v.pilote_id === user.id ? 'Pilote' : (Array.isArray(v.equipage) ? v.equipage : []).some((e: { profile_id?: string }) => e.profile_id === user.id) ? 'Membre' : 'Pilote'}</td>
                    <td className="py-3 pr-4">
                      <span className={v.statut === 'validé' ? 'text-emerald-400' : v.statut === 'refusé' ? 'text-red-400' : 'text-amber-400'}>
                        {v.statut === 'validé' ? 'Validé' : v.statut === 'refusé' ? 'Refusé' : 'En attente'}
                      </span>
                    </td>
                    <td className="py-3">
                      <VolDeleteButton volId={v.id} canDelete={v.pilote_id === user.id || v.copilote_id === user.id || v.chef_escadron_id === user.id} />
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
