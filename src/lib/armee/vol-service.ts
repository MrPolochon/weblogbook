import { format } from 'date-fns';
import { addMinutes, parseISO } from 'date-fns';
import { createAdminClient } from '@/lib/supabase/admin';
import { CODES_OACI_VALIDES } from '@/lib/aeroports-ptfs';
import { NATURES_VOL_MILITAIRE } from '@/lib/avions-militaires';
import { getGradeById, getGradeForMissionCount, gradeMeetsMinimum } from './grades';
import { countMissionsCompleted } from './stats';
import {
  getMissionById,
  missionPlanMatches,
  rollMissionRewardBase,
} from './missions';
import { canEditVolMilitaire } from './permissions';
import { computeMissionReward, missionLabel, nextMissionStatusOnRefusal, resolveRewardBase } from './rewards';
import { applyStreakBonus, computeOpsStreak, uniqueUtcDatesDesc } from './streaks';
import type {
  AarTag,
  CreateVolMilitaireInput,
  MissionCooldownInfo,
  UpdateVolMilitaireInput,
} from './types';
import { AAR_TAGS, TYPE_VOL_MILITAIRE } from './types';

export type ServiceResult<T> =
  | { ok: true; data: T }
  | { ok: false; status: number; error: string };

function parseDepartUtc(du: string): Date | null {
  const depStr = /Z$/.test(String(du)) ? String(du) : String(du) + 'Z';
  const dep = parseISO(depStr);
  return Number.isNaN(dep.getTime()) ? null : dep;
}

type AdminClient = ReturnType<typeof createAdminClient>;

type ResolveAvionOk = {
  ok: true;
  avionArmee: { id: string; nom_personnalise: string | null };
  typeAvionMilitaire: string;
};
type ResolveAvionErr = { ok: false; error: string };

async function resolveArmeeAvion(
  admin: AdminClient,
  armeeAvionId: string,
): Promise<ResolveAvionOk | ResolveAvionErr> {
  const { data: avionArmee } = await admin
    .from('armee_avions')
    .select('id, nom_personnalise, detruit, types_avion:types_avion(id, nom, est_militaire)')
    .eq('id', armeeAvionId)
    .single();

  if (!avionArmee?.types_avion) {
    return { ok: false, error: 'Avion militaire introuvable.' };
  }
  if (avionArmee.detruit) {
    return { ok: false, error: 'Cet appareil a été détruit et n\'est plus utilisable.' };
  }

  const typeAvion = Array.isArray(avionArmee.types_avion)
    ? avionArmee.types_avion[0]
    : avionArmee.types_avion;
  if (!typeAvion?.est_militaire) {
    return { ok: false, error: 'Cet avion n\'est pas militaire.' };
  }

  const typeAvionMilitaire = (avionArmee.nom_personnalise || typeAvion.nom || '').trim();
  if (!typeAvionMilitaire) {
    return { ok: false, error: 'Type d\'avion militaire invalide.' };
  }

  return { ok: true, avionArmee, typeAvionMilitaire };
}

async function assertArmeeMember(supabase: { from: AdminClient['from'] }, profileId: string, errorMessage: string) {
  const { data } = await supabase.from('profiles').select('id, armee').eq('id', profileId).single();
  if (!data?.armee) return errorMessage;
  return null;
}

/**
 * Cooldown par utilisateur (plus équitable que le cooldown global historique).
 * Un pilote ne peut pas relancer la même mission avant la fin du cooldown
 * après une mission validée (entrée dans armee_missions_log).
 */
export async function getMissionCooldownForUser(
  admin: AdminClient,
  missionId: string,
  userId: string,
  cooldownMinutes: number,
): Promise<MissionCooldownInfo> {
  const { data: last } = await admin
    .from('armee_missions_log')
    .select('created_at')
    .eq('mission_id', missionId)
    .eq('user_id', userId)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (!last?.created_at) {
    return { missionId, available: true, remainingMinutes: 0, lastCompletedAt: null };
  }

  const elapsedMs = Date.now() - new Date(last.created_at).getTime();
  const cooldownMs = cooldownMinutes * 60_000;
  if (elapsedMs >= cooldownMs) {
    return { missionId, available: true, remainingMinutes: 0, lastCompletedAt: last.created_at };
  }

  const remainingMinutes = Math.ceil((cooldownMs - elapsedMs) / 60_000);
  return {
    missionId,
    available: false,
    remainingMinutes,
    lastCompletedAt: last.created_at,
  };
}

export async function listMissionsWithCooldown(userId: string | null) {
  const { ARME_MISSIONS } = await import('./missions');
  if (!userId) {
    return ARME_MISSIONS.map((m) => ({
      ...m,
      cooldown: { missionId: m.id, available: true, remainingMinutes: 0, lastCompletedAt: null } as MissionCooldownInfo,
      gradeLocked: false,
      userGradeLabel: null as string | null,
      requiredGradeLabel: getGradeById(m.minGrade).label,
    }));
  }

  const admin = createAdminClient();
  const missionsDone = await countMissionsCompleted(userId);
  const userGrade = getGradeForMissionCount(missionsDone);

  return Promise.all(
    ARME_MISSIONS.map(async (m) => {
      const cooldown = await getMissionCooldownForUser(admin, m.id, userId, m.cooldownMinutes);
      const gradeOk = gradeMeetsMinimum(userGrade, m.minGrade);
      return {
        ...m,
        cooldown: gradeOk ? cooldown : { ...cooldown, available: false },
        gradeLocked: !gradeOk,
        userGradeLabel: userGrade.label,
        requiredGradeLabel: getGradeById(m.minGrade).label,
      };
    }),
  );
}

export async function createVolMilitaire(
  input: CreateVolMilitaireInput,
  ctx: { userId: string; supabase: { from: AdminClient['from'] } },
): Promise<ServiceResult<{ id: string }>> {
  const admin = createAdminClient();
  const {
    armee_avion_id: armeeAvionId,
    mission_id: missionIdBody,
    escadrille_ou_escadron: eoe,
    nature_vol_militaire: nvm,
    nature_vol_militaire_autre: nvma,
    aeroport_depart: ad,
    aeroport_arrivee: aa,
    duree_minutes: dm,
    depart_utc: du,
    commandant_bord: cb,
    role_pilote: rp,
    pilote_id: pidB,
    copilote_id: cidB,
    callsign: csB,
    equipage_ids: equipageIdsBody,
  } = input;

  if (!armeeAvionId) return { ok: false, status: 400, error: 'Avion militaire requis.' };
  if (!['escadrille', 'escadron', 'autre'].includes(String(eoe))) {
    return { ok: false, status: 400, error: 'Indiquez si le vol était en escadrille, en escadron ou autre.' };
  }
  if (eoe === 'autre') {
    if (!nvm || !(NATURES_VOL_MILITAIRE as readonly string[]).includes(String(nvm))) {
      return { ok: false, status: 400, error: 'Nature du vol militaire requise (entraînement, escorte, sauvetage, reconnaissance ou autre).' };
    }
    if (nvm === 'autre' && (!nvma || !String(nvma).trim())) {
      return { ok: false, status: 400, error: 'Précisez la nature du vol (champ autre).' };
    }
  }
  if (!ad || !CODES_OACI_VALIDES.has(String(ad).toUpperCase()) || !aa || !CODES_OACI_VALIDES.has(String(aa).toUpperCase())) {
    return { ok: false, status: 400, error: 'Aéroports de départ et d\'arrivée requis (code OACI valide).' };
  }
  const dmNum = typeof dm === 'number' ? dm : parseInt(String(dm), 10);
  if (isNaN(dmNum) || dmNum < 1 || !du || !cb) {
    return { ok: false, status: 400, error: 'Champs requis manquants ou invalides.' };
  }

  const avionRes = await resolveArmeeAvion(admin, armeeAvionId);
  if (!avionRes.ok) return { ok: false, status: 400, error: avionRes.error };

  const mission = getMissionById(missionIdBody ? String(missionIdBody) : null);
  if (missionIdBody && !mission) return { ok: false, status: 404, error: 'Mission introuvable.' };

  if (mission) {
    if (!nvm) return { ok: false, status: 400, error: 'Nature de mission requise.' };
    if (
      !missionPlanMatches(mission, {
        aeroport_depart: String(ad),
        aeroport_arrivee: String(aa),
        duree_minutes: dmNum,
        escadrille_ou_escadron: String(eoe),
        nature_vol_militaire: String(nvm),
      })
    ) {
      return { ok: false, status: 400, error: 'Le plan de vol ne correspond pas à la mission sélectionnée.' };
    }

    const cooldown = await getMissionCooldownForUser(admin, mission.id, ctx.userId, mission.cooldownMinutes);
    if (!cooldown.available) {
      return {
        ok: false,
        status: 400,
        error: `Mission indisponible pour vous (cooldown ${mission.cooldownMinutes} min, encore ${cooldown.remainingMinutes} min).`,
      };
    }

    const missionsDone = await countMissionsCompleted(ctx.userId);
    const userGrade = getGradeForMissionCount(missionsDone);
    if (!gradeMeetsMinimum(userGrade, mission.minGrade)) {
      const required = getGradeById(mission.minGrade);
      return {
        ok: false,
        status: 403,
        error: `Grade insuffisant : ${required.label} requis (vous êtes ${userGrade.label}).`,
      };
    }
  }

  const missionRewardBase = mission ? rollMissionRewardBase(mission) : null;
  const isEscadrilleOuEscadron = eoe === 'escadrille' || eoe === 'escadron';
  let targetPiloteId: string;
  let targetCopiloteId: string | null = null;
  let rolePiloteVal: string;

  if (isEscadrilleOuEscadron) {
    targetPiloteId = ctx.userId;
    targetCopiloteId = null;
    rolePiloteVal = 'Pilote';
    const equipageIds: string[] = Array.isArray(equipageIdsBody)
      ? equipageIdsBody.filter((x): x is string => typeof x === 'string' && x.length > 0)
      : [];
    for (const eid of equipageIds) {
      if (eid === ctx.userId) continue;
      const err = await assertArmeeMember(ctx.supabase, eid, 'Tous les pilotes de l\'équipage doivent avoir le rôle Armée.');
      if (err) return { ok: false, status: 400, error: err };
    }
  } else {
    if (!rp || !['Pilote', 'Co-pilote'].includes(String(rp))) {
      return { ok: false, status: 400, error: 'Rôle pilote requis.' };
    }
    rolePiloteVal = String(rp);
    if (rp === 'Co-pilote') {
      if (!pidB) return { ok: false, status: 400, error: 'Qui était le pilote (commandant) ?' };
      if (pidB === ctx.userId) return { ok: false, status: 400, error: 'Vous ne pouvez pas être pilote et co-pilote.' };
      const err = await assertArmeeMember(ctx.supabase, pidB, 'Le pilote doit avoir le rôle Armée.');
      if (err) return { ok: false, status: 400, error: err };
      targetPiloteId = pidB;
      targetCopiloteId = ctx.userId;
    } else {
      targetPiloteId = ctx.userId;
      if (cidB) {
        if (cidB === ctx.userId) return { ok: false, status: 400, error: 'Vous ne pouvez pas être pilote et co-pilote.' };
        const err = await assertArmeeMember(ctx.supabase, cidB, 'Le co-pilote doit avoir le rôle Armée.');
        if (err) return { ok: false, status: 400, error: err };
        targetCopiloteId = cidB;
      }
    }
  }

  const dep = parseDepartUtc(String(du));
  if (!dep) return { ok: false, status: 400, error: 'Heure de départ invalide.' };
  const arrivee = addMinutes(dep, dmNum);

  const row = {
    pilote_id: targetPiloteId,
    copilote_id: targetCopiloteId,
    copilote_confirme_par_pilote: false,
    type_avion_id: null,
    compagnie_id: null,
    compagnie_libelle: TYPE_VOL_MILITAIRE,
    type_avion_militaire: avionRes.typeAvionMilitaire,
    armee_avion_id: avionRes.avionArmee.id,
    mission_id: mission?.id || null,
    mission_titre: mission?.titre || null,
    mission_reward_base: missionRewardBase,
    mission_status: mission ? 'en_attente' : null,
    mission_refusals: mission ? 0 : 0,
    escadrille_ou_escadron: String(eoe),
    chef_escadron_id: eoe === 'escadron' ? ctx.userId : null,
    nature_vol_militaire: mission ? String(nvm) : eoe === 'autre' ? String(nvm) : null,
    nature_vol_militaire_autre:
      mission ? null : eoe === 'autre' && nvm === 'autre' && nvma ? String(nvma).trim() : null,
    aeroport_depart: String(ad).toUpperCase(),
    aeroport_arrivee: String(aa).toUpperCase(),
    duree_minutes: dmNum,
    depart_utc: dep.toISOString(),
    arrivee_utc: arrivee.toISOString(),
    type_vol: TYPE_VOL_MILITAIRE,
    instructeur_id: null,
    instruction_type: null,
    commandant_bord: String(cb).trim(),
    role_pilote: rolePiloteVal,
    callsign: csB != null && String(csB).trim() ? String(csB).trim() : null,
    statut: 'en_attente',
    created_by_admin: false,
    created_by_user_id: null,
  };

  const { data, error } = await admin.from('vols').insert(row).select('id').single();
  if (error) return { ok: false, status: 400, error: error.message };

  if (isEscadrilleOuEscadron) {
    const equipageIds: string[] = Array.isArray(equipageIdsBody)
      ? equipageIdsBody.filter((x): x is string => typeof x === 'string' && x.length > 0)
      : [];
    const tous = Array.from(new Set([ctx.userId, ...equipageIds]));
    if (tous.length > 0) {
      await admin.from('vols_equipage_militaire').insert(tous.map((pid) => ({ vol_id: data.id, profile_id: pid })));
    }
  }

  return { ok: true, data: { id: data.id } };
}

export async function updateVolMilitaire(
  volId: string,
  input: UpdateVolMilitaireInput,
  ctx: { userId: string; isAdmin: boolean },
): Promise<ServiceResult<{ id: string }>> {
  const admin = createAdminClient();
  const { data: volMil } = await admin
    .from('vols')
    .select('id, pilote_id, copilote_id, chef_escadron_id, statut, type_vol, mission_id')
    .eq('id', volId)
    .single();

  if (!volMil) return { ok: false, status: 404, error: 'Vol introuvable' };
  if (volMil.type_vol !== TYPE_VOL_MILITAIRE) {
    return { ok: false, status: 400, error: 'Ce vol n\'est pas un vol militaire.' };
  }
  if (!canEditVolMilitaire(volMil, ctx.userId, ctx.isAdmin)) {
    return { ok: false, status: 403, error: 'Non autorisé' };
  }

  const {
    armee_avion_id,
    aeroport_depart: milDep,
    aeroport_arrivee: milArr,
    duree_minutes: milDuree,
    depart_utc: milDepUtc,
    escadrille_ou_escadron: milEsc,
    nature_vol_militaire: milNature,
    nature_vol_militaire_autre: milNatureAutre,
    commandant_bord: milCmdt,
    callsign: milCallsign,
    copilote_id: milCopiloteId,
    chef_escadron_id: milChefId,
    equipage_ids: milEquipageIds,
  } = input;

  if (!milDep || !milArr || typeof milDuree !== 'number' || milDuree < 1 || !milDepUtc || !milCmdt) {
    return { ok: false, status: 400, error: 'Champs requis manquants.' };
  }
  if (!CODES_OACI_VALIDES.has(String(milDep).toUpperCase()) || !CODES_OACI_VALIDES.has(String(milArr).toUpperCase())) {
    return { ok: false, status: 400, error: 'Codes OACI invalides.' };
  }

  if (volMil.mission_id) {
    const mission = getMissionById(volMil.mission_id);
    if (mission) {
      const esc = milEsc || mission.escadrille_ou_escadron;
      const nature = milNature || mission.nature_vol_militaire;
      if (
        !missionPlanMatches(mission, {
          aeroport_depart: String(milDep),
          aeroport_arrivee: String(milArr),
          duree_minutes: milDuree,
          escadrille_ou_escadron: String(esc),
          nature_vol_militaire: String(nature),
        })
      ) {
        return { ok: false, status: 400, error: 'Le plan de vol doit correspondre à la mission.' };
      }
    }
  }

  let typeAvionMil: string | null = null;
  if (armee_avion_id) {
    const avionRes = await resolveArmeeAvion(admin, armee_avion_id);
    if (!avionRes.ok) return { ok: false, status: 400, error: avionRes.error };
    typeAvionMil = avionRes.typeAvionMilitaire;
  }

  const milDepDate = parseDepartUtc(String(milDepUtc));
  if (!milDepDate) return { ok: false, status: 400, error: 'Heure de départ invalide.' };
  const milArrDate = addMinutes(milDepDate, milDuree);

  const milUpdates: Record<string, unknown> = {
    aeroport_depart: String(milDep).toUpperCase(),
    aeroport_arrivee: String(milArr).toUpperCase(),
    duree_minutes: milDuree,
    depart_utc: milDepDate.toISOString(),
    arrivee_utc: milArrDate.toISOString(),
    commandant_bord: String(milCmdt).trim(),
    callsign: milCallsign ? String(milCallsign).trim() : null,
  };

  if (armee_avion_id) {
    milUpdates.armee_avion_id = armee_avion_id;
    milUpdates.type_avion_militaire = typeAvionMil;
  }
  if (milEsc) milUpdates.escadrille_ou_escadron = milEsc;
  if (milNature !== undefined) milUpdates.nature_vol_militaire = milNature;
  if (milNatureAutre !== undefined) milUpdates.nature_vol_militaire_autre = milNatureAutre || null;
  if (milCopiloteId !== undefined) milUpdates.copilote_id = milCopiloteId || null;
  if (milChefId !== undefined) milUpdates.chef_escadron_id = milChefId || null;

  const { error: milErr } = await admin.from('vols').update(milUpdates).eq('id', volId);
  if (milErr) return { ok: false, status: 400, error: milErr.message };

  if (milEquipageIds !== undefined) {
    await admin.from('vols_equipage_militaire').delete().eq('vol_id', volId);
    const ids = Array.isArray(milEquipageIds)
      ? Array.from(new Set(milEquipageIds.filter((x): x is string => typeof x === 'string' && x.length > 0)))
      : [];
    if (ids.length > 0) {
      await admin.from('vols_equipage_militaire').insert(ids.map((pid) => ({ vol_id: volId, profile_id: pid })));
    }
  }

  return { ok: true, data: { id: volId } };
}

type VolForValidation = {
  id: string;
  pilote_id: string;
  type_vol: string;
  mission_id: string | null;
  mission_titre: string | null;
  mission_reward_base: number | null;
  mission_reward_final: number | null;
  mission_refusals: number | null;
  arrivee_utc: string | null;
};

/**
 * Applique les effets mission lors d'une validation/refus (admin ou PDG militaire).
 * Retourne les champs à merger dans l'update `vols`.
 */
export async function applyMissionOnAdminDecision(
  vol: VolForValidation,
  decision: 'validé' | 'refusé',
): Promise<ServiceResult<Record<string, unknown>>> {
  if (vol.type_vol !== TYPE_VOL_MILITAIRE || !vol.mission_id) {
    return { ok: true, data: {} };
  }

  if (decision === 'refusé') {
    const next = nextMissionStatusOnRefusal(vol.mission_refusals ?? 0);
    return { ok: true, data: next };
  }

  // déjà payé
  if (vol.mission_reward_final) return { ok: true, data: {} };

  const admin = createAdminClient();
  const base = resolveRewardBase(vol.mission_id, vol.mission_reward_base);
  const { finalReward: rewardAfterDelay, delayMinutes } = computeMissionReward(base, vol.arrivee_utc);

  const { data: priorLogs } = await admin
    .from('armee_missions_log')
    .select('created_at')
    .eq('user_id', vol.pilote_id)
    .order('created_at', { ascending: false });

  const today = format(new Date(), 'yyyy-MM-dd');
  const dates = uniqueUtcDatesDesc((priorLogs || []).map((l) => l.created_at as string));
  const streakDays = computeOpsStreak(dates, today);
  const streak = applyStreakBonus(rewardAfterDelay, streakDays);
  const finalReward = streak.finalReward;

  const { data: compteMilitaire } = await admin
    .from('felitz_comptes')
    .select('id, solde')
    .eq('type', 'militaire')
    .single();

  if (!compteMilitaire) {
    return { ok: false, status: 400, error: 'Compte militaire introuvable (mission non payée).' };
  }

  await admin.rpc('crediter_compte_safe', { p_compte_id: compteMilitaire.id, p_montant: finalReward });

  const mission = getMissionById(vol.mission_id);
  const streakNote =
    streak.streakBonusAmount > 0
      ? ` (+${streak.streakBonusPercent}% série ${streak.streakDays}j)`
      : '';
  await admin.from('felitz_transactions').insert({
    compte_id: compteMilitaire.id,
    type: 'credit',
    montant: finalReward,
    libelle: `Mission militaire: ${missionLabel(mission, vol.mission_titre || vol.mission_id)}${streakNote}`,
  });

  await admin.from('armee_missions_log').insert({
    mission_id: vol.mission_id,
    user_id: vol.pilote_id,
    reward: finalReward,
    streak_bonus: streak.streakBonusAmount,
  });

  return {
    ok: true,
    data: {
      mission_reward_final: finalReward,
      mission_delay_minutes: delayMinutes,
      mission_status: 'valide',
      mission_streak_days: streak.streakDays,
      mission_streak_bonus: streak.streakBonusAmount,
    },
  };
}

/**
 * Rapport après action (AAR) — pilote / co-pilote / chef d'escadron sur un vol mission.
 */
export async function submitMissionAar(
  volId: string,
  input: { notes?: string | null; tags?: string[] | null },
  ctx: { userId: string; isAdmin: boolean },
): Promise<ServiceResult<{ id: string }>> {
  const admin = createAdminClient();
  const { data: vol } = await admin
    .from('vols')
    .select('id, pilote_id, copilote_id, chef_escadron_id, type_vol, mission_id, statut')
    .eq('id', volId)
    .single();

  if (!vol) return { ok: false, status: 404, error: 'Vol introuvable' };
  if (vol.type_vol !== TYPE_VOL_MILITAIRE || !vol.mission_id) {
    return { ok: false, status: 400, error: 'Un AAR n\'est disponible que pour les vols de mission.' };
  }

  const allowed =
    ctx.isAdmin ||
    vol.pilote_id === ctx.userId ||
    vol.copilote_id === ctx.userId ||
    vol.chef_escadron_id === ctx.userId;
  if (!allowed) return { ok: false, status: 403, error: 'Non autorisé' };

  const notes = input.notes != null ? String(input.notes).trim().slice(0, 2000) : null;
  const rawTags = Array.isArray(input.tags) ? input.tags : [];
  const tags = rawTags
    .filter((t): t is AarTag => typeof t === 'string' && (AAR_TAGS as readonly string[]).includes(t))
    .slice(0, 6);

  const { error } = await admin
    .from('vols')
    .update({
      mission_aar_notes: notes || null,
      mission_aar_tags: tags.length > 0 ? tags : null,
    })
    .eq('id', volId);

  if (error) return { ok: false, status: 400, error: error.message };
  return { ok: true, data: { id: volId } };
}
