import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { redirect, notFound } from 'next/navigation';
import Link from 'next/link';
import { formatDuree } from '@/lib/utils';
import { format } from 'date-fns';
import { fr } from 'date-fns/locale';
import { ArrowLeft } from 'lucide-react';
import VolDeleteButton from '@/components/VolDeleteButton';

export default async function AdminMilitaireVolPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).single();
  if (profile?.role !== 'admin') redirect('/admin');

  const admin = createAdminClient();
  const { data: vol } = await admin
    .from('vols')
    .select(`
      id, pilote_id, copilote_id, chef_escadron_id, duree_minutes, depart_utc, arrivee_utc, statut, type_avion_militaire, callsign, commandant_bord,
      escadrille_ou_escadron, nature_vol_militaire, nature_vol_militaire_autre, aeroport_depart, aeroport_arrivee,
      mission_titre, mission_reward_base, mission_reward_final, mission_delay_minutes, mission_refusals, mission_status,
      pilote:profiles!vols_pilote_id_fkey(identifiant),
      copilote:profiles!vols_copilote_id_fkey(identifiant),
      chef:profiles!vols_chef_escadron_id_fkey(identifiant),
      equipage:vols_equipage_militaire(profile_id)
    `)
    .eq('id', id)
    .eq('type_vol', 'Vol militaire')
    .single();

  if (!vol) notFound();

  const libNature = (n: string | null, a: string | null) => {
    if (!n) return '—';
    const map: Record<string, string> = { entrainement: 'Entraînement', escorte: 'Escorte', sauvetage: 'Sauvetage', reconnaissance: 'Reconnaissance', autre: a || 'Autre' };
    return map[n] || n;
  };

  const piloteIdentifiant = (Array.isArray(vol.pilote) ? vol.pilote[0] : vol.pilote)?.identifiant ?? '—';
  const copiloteIdentifiant = (Array.isArray(vol.copilote) ? vol.copilote[0] : vol.copilote)?.identifiant ?? '—';
  const chefIdentifiant = (Array.isArray(vol.chef) ? vol.chef[0] : vol.chef)?.identifiant ?? '—';
  const equipageIds = (Array.isArray(vol.equipage) ? vol.equipage : []).map((e: { profile_id?: string }) => e.profile_id).filter(Boolean) as string[];

  let equipageIdentifiants: string[] = [];
  if (equipageIds.length > 0) {
    const { data: eqProfiles } = await admin.from('profiles').select('id, identifiant').in('id', equipageIds);
    equipageIdentifiants = (eqProfiles || []).map((p) => p.identifiant || '—');
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-4">
          <Link href="/admin/militaire" className="text-slate-400 hover:text-slate-200">
            <ArrowLeft className="h-5 w-5" />
          </Link>
          <h1 className="text-2xl font-semibold text-slate-100">Vol militaire</h1>
        </div>
        <VolDeleteButton volId={vol.id} />
      </div>

      <div className="card space-y-4">
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <span className="text-slate-500 text-sm">Date</span>
            <p className="text-slate-200">{format(new Date(vol.depart_utc), 'dd MMMM yyyy', { locale: fr })}</p>
          </div>
          <div>
            <span className="text-slate-500 text-sm">Heure départ (UTC)</span>
            <p className="text-slate-200">{format(new Date(vol.depart_utc), 'HH:mm')} — {vol.aeroport_depart || '—'}</p>
          </div>
          <div>
            <span className="text-slate-500 text-sm">Heure arrivée (UTC)</span>
            <p className="text-slate-200">{vol.arrivee_utc ? format(new Date(vol.arrivee_utc), 'HH:mm') : '—'} — {vol.aeroport_arrivee || '—'}</p>
          </div>
          <div>
            <span className="text-slate-500 text-sm">Durée</span>
            <p className="text-slate-200">{formatDuree(vol.duree_minutes || 0)}</p>
          </div>
          <div>
            <span className="text-slate-500 text-sm">Appareil</span>
            <p className="text-slate-200">{vol.type_avion_militaire || '—'}</p>
          </div>
          <div>
            <span className="text-slate-500 text-sm">Escadrille / Escadron</span>
            <p className="text-slate-200">{vol.escadrille_ou_escadron === 'escadrille' ? 'Escadrille' : vol.escadrille_ou_escadron === 'escadron' ? 'Escadron' : vol.escadrille_ou_escadron || '—'}</p>
          </div>
          <div>
            <span className="text-slate-500 text-sm">Nature</span>
            <p className="text-slate-200">{libNature(vol.nature_vol_militaire, vol.nature_vol_militaire_autre)}</p>
          </div>
          <div>
            <span className="text-slate-500 text-sm">Statut</span>
            <p>
              <span className={vol.statut === 'validé' ? 'text-emerald-400' : vol.statut === 'refusé' ? 'text-red-400' : 'text-amber-400'}>
                {vol.statut === 'validé' ? 'Validé' : vol.statut === 'refusé' ? 'Refusé' : 'En attente'}
              </span>
            </p>
          </div>
          {vol.callsign && (
            <div>
              <span className="text-slate-500 text-sm">Callsign</span>
              <p className="text-slate-200">{vol.callsign}</p>
            </div>
          )}
          {vol.commandant_bord && (
            <div>
              <span className="text-slate-500 text-sm">Commandant de bord</span>
              <p className="text-slate-200">{vol.commandant_bord}</p>
            </div>
          )}
          {vol.mission_titre && (
            <div>
              <span className="text-slate-500 text-sm">Mission</span>
              <p className="text-slate-200">
                {vol.mission_titre}
                {vol.mission_reward_base ? ` — base ${vol.mission_reward_base.toLocaleString('fr-FR')} F$` : ''}
                {vol.mission_reward_final ? ` — payé ${vol.mission_reward_final.toLocaleString('fr-FR')} F$` : ''}
                {vol.mission_delay_minutes != null ? ` — retard ${vol.mission_delay_minutes} min` : ''}
                {vol.mission_refusals != null ? ` — refus ${vol.mission_refusals}/3` : ''}
                {vol.mission_status ? ` — ${vol.mission_status}` : ''}
              </p>
            </div>
          )}
        </div>

        <div className="border-t border-slate-600/50 pt-4">
          <span className="text-slate-500 text-sm block mb-2">Participants</span>
          <ul className="space-y-1 text-slate-200">
            {vol.pilote_id && <li>Pilote (créateur) : <Link href={`/admin/pilotes/${vol.pilote_id}/logbook`} className="text-sky-400 hover:underline">{piloteIdentifiant}</Link></li>}
            {vol.copilote_id && <li>Co-pilote : <Link href={`/admin/pilotes/${vol.copilote_id}/logbook`} className="text-sky-400 hover:underline">{copiloteIdentifiant}</Link></li>}
            {vol.chef_escadron_id && <li>Chef d&apos;escadron : <Link href={`/admin/pilotes/${vol.chef_escadron_id}/logbook`} className="text-sky-400 hover:underline">{chefIdentifiant}</Link></li>}
            {equipageIdentifiants.length > 0 && <li>Équipage : {equipageIdentifiants.join(', ')}</li>}
          </ul>
        </div>
      </div>
    </div>
  );
}
