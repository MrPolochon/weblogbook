import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { redirect, notFound } from 'next/navigation';
import Link from 'next/link';
import { ArrowLeft, Clock, MapPin, Plane, Users, Target, Edit2 } from 'lucide-react';
import { formatDuree } from '@/lib/utils';
import { formatDateMediumUTC, formatTimeUTC } from '@/lib/date-utils';
import { ARME_MISSIONS } from '@/lib/armee-missions';
import VolDeleteButton from '@/components/VolDeleteButton';

const LIB_NATURE: Record<string, string> = {
  entrainement: 'Entraînement',
  escorte: 'Escorte',
  sauvetage: 'Sauvetage',
  reconnaissance: 'Reconnaissance',
  autre: 'Autre',
};

export default async function VolMilitaireDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const { data: profile } = await supabase.from('profiles').select('armee, role').eq('id', user.id).single();
  if (!profile?.armee && profile?.role !== 'admin') redirect('/logbook');

  const admin = createAdminClient();
  const { data: vol } = await admin
    .from('vols')
    .select(`
      id, pilote_id, copilote_id, chef_escadron_id, duree_minutes, depart_utc, arrivee_utc,
      statut, type_vol, type_avion_militaire, role_pilote, callsign, commandant_bord,
      escadrille_ou_escadron, nature_vol_militaire, nature_vol_militaire_autre,
      aeroport_depart, aeroport_arrivee, mission_id, mission_status,
      mission_reward_final, mission_refusals,
      pilote:profiles!vols_pilote_id_fkey(identifiant),
      copilote:profiles!vols_copilote_id_fkey(identifiant)
    `)
    .eq('id', id)
    .eq('type_vol', 'Vol militaire')
    .single();

  if (!vol) notFound();

  const { data: equipage } = await admin
    .from('vols_equipage_militaire')
    .select('profile_id, profiles(identifiant)')
    .eq('vol_id', id);

  let chefEscadronIdentifiant: string | null = null;
  if (vol.chef_escadron_id) {
    const { data: chef } = await admin.from('profiles').select('identifiant').eq('id', vol.chef_escadron_id).single();
    chefEscadronIdentifiant = chef?.identifiant || null;
  }

  const mission = vol.mission_id ? ARME_MISSIONS.find(m => m.id === vol.mission_id) : null;

  const canEdit = vol.statut === 'en_attente' && (
    vol.pilote_id === user.id || vol.copilote_id === user.id || vol.chef_escadron_id === user.id
  );
  const canDelete = vol.pilote_id === user.id || vol.copilote_id === user.id || vol.chef_escadron_id === user.id;

  const piloteIdent = vol.pilote ? (Array.isArray(vol.pilote) ? vol.pilote[0]?.identifiant : (vol.pilote as { identifiant: string }).identifiant) : null;
  const copiloteIdent = vol.copilote ? (Array.isArray(vol.copilote) ? vol.copilote[0]?.identifiant : (vol.copilote as { identifiant: string }).identifiant) : null;

  const natureLabel = vol.nature_vol_militaire
    ? (vol.nature_vol_militaire === 'autre'
        ? (vol.nature_vol_militaire_autre || 'Autre')
        : LIB_NATURE[vol.nature_vol_militaire] || vol.nature_vol_militaire)
    : '—';

  const escLabel = vol.escadrille_ou_escadron === 'escadrille'
    ? 'Escadrille'
    : vol.escadrille_ou_escadron === 'escadron'
      ? 'Escadron'
      : vol.escadrille_ou_escadron || '—';

  const statutColor = vol.statut === 'validé' ? 'text-emerald-400 bg-emerald-400/10' : vol.statut === 'refusé' ? 'text-red-400 bg-red-400/10' : 'text-amber-400 bg-amber-400/10';
  const statutLabel = vol.statut === 'validé' ? 'Validé' : vol.statut === 'refusé' ? 'Refusé' : 'En attente';

  return (
    <div className="space-y-6 max-w-3xl">
      <div className="flex items-center gap-4">
        <Link href="/militaire" className="text-slate-400 hover:text-slate-200">
          <ArrowLeft className="h-5 w-5" />
        </Link>
        <h1 className="text-2xl font-semibold text-slate-100">Détail du vol militaire</h1>
        <span className={`ml-auto px-3 py-1 rounded-full text-sm font-medium ${statutColor}`}>
          {statutLabel}
        </span>
      </div>

      {mission && (
        <div className="card border-l-4 border-sky-500">
          <div className="flex items-center gap-2 mb-1">
            <Target className="h-4 w-4 text-sky-400" />
            <h3 className="font-semibold text-slate-200">Mission : {mission.titre}</h3>
          </div>
          <p className="text-sm text-slate-400">{mission.description}</p>
          <div className="flex gap-4 mt-2 text-xs text-slate-500">
            <span>Récompense : {mission.rewardMin.toLocaleString('fr-FR')}–{mission.rewardMax.toLocaleString('fr-FR')} F$</span>
            <span>Cooldown : {mission.cooldownMinutes} min</span>
          </div>
          {vol.mission_reward_final != null && (
            <p className="text-sm text-emerald-400 mt-2 font-medium">
              Récompense obtenue : {vol.mission_reward_final.toLocaleString('fr-FR')} F$
            </p>
          )}
          {vol.mission_status === 'echec' && (
            <p className="text-sm text-red-400 mt-2 font-medium">Mission échouée ({vol.mission_refusals || 0} refus)</p>
          )}
        </div>
      )}

      <div className="card">
        <h2 className="text-lg font-medium text-slate-200 mb-4 flex items-center gap-2">
          <Plane className="h-5 w-5 text-sky-400" />
          Informations du vol
        </h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <InfoRow label="Appareil" value={vol.type_avion_militaire || '—'} />
          <InfoRow label="Callsign" value={vol.callsign || '—'} />
          <InfoRow label="Type" value={escLabel} />
          <InfoRow label="Nature" value={natureLabel} />
        </div>
      </div>

      <div className="card">
        <h2 className="text-lg font-medium text-slate-200 mb-4 flex items-center gap-2">
          <MapPin className="h-5 w-5 text-sky-400" />
          Itinéraire
        </h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <InfoRow label="Départ" value={`${vol.aeroport_depart || '—'} — ${formatTimeUTC(vol.depart_utc)}`} />
          <InfoRow label="Arrivée" value={`${vol.aeroport_arrivee || '—'} ${vol.arrivee_utc ? '— ' + formatTimeUTC(vol.arrivee_utc) : ''}`} />
          <InfoRow label="Date" value={formatDateMediumUTC(vol.depart_utc)} />
          <div className="flex items-center gap-2">
            <Clock className="h-4 w-4 text-slate-500" />
            <div>
              <p className="text-xs text-slate-500">Durée</p>
              <p className="text-sm text-slate-200 font-medium">{formatDuree(vol.duree_minutes || 0)}</p>
            </div>
          </div>
        </div>
      </div>

      <div className="card">
        <h2 className="text-lg font-medium text-slate-200 mb-4 flex items-center gap-2">
          <Users className="h-5 w-5 text-sky-400" />
          Équipage
        </h2>
        <div className="space-y-2">
          <InfoRow label="Commandant de bord" value={vol.commandant_bord || '—'} />
          {piloteIdent && <InfoRow label="Pilote" value={piloteIdent} />}
          {copiloteIdent && <InfoRow label="Co-pilote" value={copiloteIdent} />}
          {chefEscadronIdentifiant && <InfoRow label="Chef d'escadron" value={chefEscadronIdentifiant} />}
          {equipage && equipage.length > 0 && (
            <div>
              <p className="text-xs text-slate-500 mb-1">Membres de l&apos;équipage</p>
              <div className="flex flex-wrap gap-2">
                {equipage.map((e) => {
                  const prof = e.profiles as { identifiant: string } | { identifiant: string }[] | null;
                  const ident = prof ? (Array.isArray(prof) ? prof[0]?.identifiant : prof.identifiant) : e.profile_id;
                  return (
                    <span key={e.profile_id} className="px-2 py-0.5 bg-slate-700/50 rounded text-sm text-slate-300">
                      {ident}
                    </span>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      </div>

      <div className="flex items-center gap-3">
        {canEdit && (
          <Link
            href={`/militaire/modifier/${vol.id}`}
            className="btn-primary inline-flex items-center gap-2"
          >
            <Edit2 className="h-4 w-4" />
            Modifier
          </Link>
        )}
        <VolDeleteButton volId={vol.id} canDelete={canDelete} />
      </div>
    </div>
  );
}

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-xs text-slate-500">{label}</p>
      <p className="text-sm text-slate-200 font-medium">{value}</p>
    </div>
  );
}
