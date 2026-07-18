import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { redirect, notFound } from 'next/navigation';
import Link from 'next/link';
import { ArrowLeft, Clock, MapPin, Plane, Users, Target, Edit2 } from 'lucide-react';
import { formatDuree } from '@/lib/utils';
import { formatDateMediumUTC, formatTimeUTC } from '@/lib/date-utils';
import {
  canAccessEspaceMilitaire,
  canDeleteVolMilitaire,
  canEditVolMilitaire,
  canValidateVolMilitaire,
  getMissionById,
  LIB_AAR_TAG,
  LIB_STATUT,
  libEscadrille,
  libNatureVol,
} from '@/lib/armee';
import VolDeleteButton from '@/components/VolDeleteButton';
import VolMilitaireActions from '../../components/VolMilitaireActions';

export default async function VolMilitaireDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const { data: profile } = await supabase.from('profiles').select('armee, role').eq('id', user.id).single();
  if (!canAccessEspaceMilitaire(profile)) redirect('/logbook');

  const isAdminUser = profile?.role === 'admin';
  const admin = createAdminClient();
  const { data: vol } = await admin
    .from('vols')
    .select(`
      id, pilote_id, copilote_id, chef_escadron_id, duree_minutes, depart_utc, arrivee_utc,
      statut, type_vol, type_avion_militaire, role_pilote, callsign, commandant_bord,
      escadrille_ou_escadron, nature_vol_militaire, nature_vol_militaire_autre,
      aeroport_depart, aeroport_arrivee, mission_id, mission_status,
      mission_reward_final, mission_refusals, mission_delay_minutes,
      mission_aar_notes, mission_aar_tags, mission_streak_days, mission_streak_bonus,
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

  const mission = getMissionById(vol.mission_id);
  const canEdit = canEditVolMilitaire(vol, user.id, Boolean(isAdminUser));
  const canDelete = canDeleteVolMilitaire(vol, user.id, Boolean(isAdminUser));
  const canValidate = await canValidateVolMilitaire(user.id, profile);
  const canSubmitAar =
    Boolean(isAdminUser) ||
    vol.pilote_id === user.id ||
    vol.copilote_id === user.id ||
    vol.chef_escadron_id === user.id;
  const aarTags = Array.isArray(vol.mission_aar_tags) ? (vol.mission_aar_tags as string[]) : [];

  const piloteIdent = vol.pilote
    ? Array.isArray(vol.pilote)
      ? vol.pilote[0]?.identifiant
      : (vol.pilote as { identifiant: string }).identifiant
    : null;
  const copiloteIdent = vol.copilote
    ? Array.isArray(vol.copilote)
      ? vol.copilote[0]?.identifiant
      : (vol.copilote as { identifiant: string }).identifiant
    : null;

  const statutMeta = LIB_STATUT[vol.statut] || LIB_STATUT.en_attente;

  return (
    <div className="space-y-6 max-w-3xl mx-auto animate-page-reveal">
      <div className="flex flex-wrap items-center gap-4">
        <Link href="/militaire?tab=carnet" className="p-2 rounded-lg text-slate-400 hover:text-slate-200 hover:bg-slate-800/60 transition-colors">
          <ArrowLeft className="h-5 w-5" />
        </Link>
        <h1 className="text-2xl font-semibold text-slate-100">Détail du vol</h1>
        <span className={`ml-auto px-3 py-1 rounded-full text-sm font-medium border ${statutMeta.bg} ${statutMeta.color}`}>
          {statutMeta.label}
        </span>
      </div>

      {mission && (
        <div className="rounded-xl border border-l-4 border-l-red-500 border-slate-700/50 bg-slate-800/30 p-5">
          <div className="flex items-center gap-2 mb-1">
            <Target className="h-4 w-4 text-red-400" />
            <h3 className="font-semibold text-slate-200">Mission : {mission.titre}</h3>
          </div>
          <p className="text-sm text-slate-400">{mission.description}</p>
          <div className="flex flex-wrap gap-4 mt-2 text-xs text-slate-500">
            <span>
              Récompense : {mission.rewardMin.toLocaleString('fr-FR')}–{mission.rewardMax.toLocaleString('fr-FR')} F$
            </span>
            <span>Cooldown : {mission.cooldownMinutes} min / pilote</span>
          </div>
          {vol.mission_reward_final != null && (
            <p className="text-sm text-emerald-400 mt-2 font-medium">
              Récompense obtenue : {vol.mission_reward_final.toLocaleString('fr-FR')} F$
              {vol.mission_delay_minutes != null && vol.mission_delay_minutes > 0 && (
                <span className="text-slate-500 font-normal"> (retard {vol.mission_delay_minutes} min)</span>
              )}
              {vol.mission_streak_bonus != null && vol.mission_streak_bonus > 0 && (
                <span className="text-amber-400/90 font-normal">
                  {' '}(+{vol.mission_streak_bonus.toLocaleString('fr-FR')} F$ série {vol.mission_streak_days}j)
                </span>
              )}
            </p>
          )}
          {vol.mission_status === 'echec' && (
            <p className="text-sm text-red-400 mt-2 font-medium">
              Mission échouée ({vol.mission_refusals || 0} refus)
            </p>
          )}
          {(vol.mission_aar_notes || aarTags.length > 0) && (
            <div className="mt-3 pt-3 border-t border-slate-700/50 space-y-2">
              <p className="text-xs font-medium text-slate-400">Rapport après action</p>
              {vol.mission_aar_notes && (
                <p className="text-sm text-slate-300 whitespace-pre-wrap">{vol.mission_aar_notes}</p>
              )}
              {aarTags.length > 0 && (
                <div className="flex flex-wrap gap-1.5">
                  {aarTags.map((t) => (
                    <span key={t} className="text-xs px-2 py-0.5 rounded-md bg-sky-500/10 border border-sky-500/20 text-sky-300">
                      {LIB_AAR_TAG[t] || t}
                    </span>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      )}

      <div className="rounded-xl border border-slate-700/50 bg-slate-800/30 p-5">
        <h2 className="text-lg font-medium text-slate-200 mb-4 flex items-center gap-2">
          <Plane className="h-5 w-5 text-red-400" />
          Informations du vol
        </h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <InfoRow label="Appareil" value={vol.type_avion_militaire || '—'} />
          <InfoRow label="Callsign" value={vol.callsign || '—'} />
          <InfoRow label="Type" value={libEscadrille(vol.escadrille_ou_escadron)} />
          <InfoRow
            label="Nature"
            value={libNatureVol(vol.nature_vol_militaire, vol.nature_vol_militaire_autre)}
          />
        </div>
      </div>

      <div className="rounded-xl border border-slate-700/50 bg-slate-800/30 p-5">
        <h2 className="text-lg font-medium text-slate-200 mb-4 flex items-center gap-2">
          <MapPin className="h-5 w-5 text-sky-400" />
          Itinéraire
        </h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <InfoRow label="Départ" value={`${vol.aeroport_depart || '—'} — ${formatTimeUTC(vol.depart_utc)}`} />
          <InfoRow
            label="Arrivée"
            value={`${vol.aeroport_arrivee || '—'} ${vol.arrivee_utc ? '— ' + formatTimeUTC(vol.arrivee_utc) : ''}`}
          />
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

      <div className="rounded-xl border border-slate-700/50 bg-slate-800/30 p-5">
        <h2 className="text-lg font-medium text-slate-200 mb-4 flex items-center gap-2">
          <Users className="h-5 w-5 text-amber-400" />
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
                  const ident = prof
                    ? Array.isArray(prof)
                      ? prof[0]?.identifiant
                      : prof.identifiant
                    : e.profile_id;
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

      <VolMilitaireActions
        volId={vol.id}
        canValidate={canValidate}
        canSubmitAar={canSubmitAar}
        statut={vol.statut}
        hasMission={Boolean(vol.mission_id)}
        initialNotes={vol.mission_aar_notes}
        initialTags={aarTags}
      />

      <div className="flex items-center gap-3">
        {canEdit && (
          <Link href={`/militaire/modifier/${vol.id}`} className="btn-primary inline-flex items-center gap-2">
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
