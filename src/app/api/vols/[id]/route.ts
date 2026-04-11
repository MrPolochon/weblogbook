import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { NextResponse } from 'next/server';
import { addMinutes, parseISO } from 'date-fns';
import { CODES_OACI_VALIDES } from '@/lib/aeroports-ptfs';
import { ARME_MISSIONS } from '@/lib/armee-missions';

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Non autorisé' }, { status: 401 });

    const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).single();
    const isAdmin = profile?.role === 'admin';

    const body = await request.json();

    if (body.statut === 'validé' || body.statut === 'refusé') {
      if (!isAdmin) return NextResponse.json({ error: 'Réservé aux admins' }, { status: 403 });
      const { data: vol } = await supabase.from('vols')
        .select('id, pilote_id, statut, type_vol, mission_id, mission_titre, mission_reward_base, mission_reward_final, mission_refusals, depart_utc, arrivee_utc')
        .eq('id', id)
        .single();
      if (!vol) return NextResponse.json({ error: 'Vol introuvable' }, { status: 404 });
      const updates: Record<string, unknown> = {
        statut: body.statut,
        editing_by_pilot_id: null,
        editing_started_at: null,
      };
      if (body.statut === 'refusé') {
        updates.refusal_reason = body.refusal_reason ?? null;
        const { data: v } = await supabase.from('vols').select('refusal_count').eq('id', id).single();
        updates.refusal_count = (v?.refusal_count ?? 0) + 1;
        if (vol.type_vol === 'Vol militaire' && vol.mission_id) {
          const nextRefusals = (vol.mission_refusals ?? 0) + 1;
          updates.mission_refusals = nextRefusals;
          if (nextRefusals >= 3) {
            updates.mission_status = 'echec';
          }
        }
      }
      if (body.statut === 'validé' && vol.type_vol === 'Vol militaire' && vol.mission_id && !vol.mission_reward_final) {
        const mission = ARME_MISSIONS.find((m) => m.id === vol.mission_id);
        const base = vol.mission_reward_base ?? (mission ? Math.round((mission.rewardMin + mission.rewardMax) / 2) : 0);
        const now = Date.now();
        const arrivee = vol.arrivee_utc ? new Date(vol.arrivee_utc).getTime() : now;
        const delayMinutes = Math.max(0, Math.round((now - arrivee) / 60000));
        const coeff = Math.max(0.2, 1 - delayMinutes * 0.01);
        const finalReward = Math.max(0, Math.round(base * coeff));

        updates.mission_reward_final = finalReward;
        updates.mission_delay_minutes = delayMinutes;
        updates.mission_status = 'valide';

        const adminClient = createAdminClient();
        const { data: compteMilitaire } = await adminClient.from('felitz_comptes')
          .select('id, solde')
          .eq('type', 'militaire')
          .single();
        if (!compteMilitaire) {
          return NextResponse.json({ error: 'Compte militaire introuvable (mission non payée).' }, { status: 400 });
        }

        await adminClient.rpc('crediter_compte_safe', { p_compte_id: compteMilitaire.id, p_montant: finalReward });

        await adminClient.from('felitz_transactions').insert({
          compte_id: compteMilitaire.id,
          type: 'credit',
          montant: finalReward,
          libelle: `Mission militaire: ${vol.mission_titre || vol.mission_id}`
        });

        await adminClient.from('armee_missions_log').insert({
          mission_id: vol.mission_id,
          user_id: vol.pilote_id,
          reward: finalReward
        });
      }

      const { error } = await supabase.from('vols').update(updates).eq('id', id);
      if (error) return NextResponse.json({ error: error.message }, { status: 400 });
      return NextResponse.json({ ok: true });
    }

    if (body.refuser_copilote === true) {
      const { data: vol } = await supabase.from('vols').select('pilote_id, copilote_id, statut').eq('id', id).single();
      if (!vol) return NextResponse.json({ error: 'Vol introuvable' }, { status: 404 });
      if (vol.copilote_id !== user.id) return NextResponse.json({ error: 'Seul le co-pilote indiqué peut refuser.' }, { status: 403 });
      if (vol.statut !== 'en_attente_confirmation_copilote') return NextResponse.json({ error: 'Ce vol n\'est pas en attente de votre confirmation.' }, { status: 400 });
      const { error } = await createAdminClient().from('vols').update({ statut: 'refuse_par_copilote' }).eq('id', id);
      if (error) return NextResponse.json({ error: error.message }, { status: 400 });
      return NextResponse.json({ ok: true });
    }

    if (body.confirmer_instructeur === true) {
      const { data: vol } = await supabase.from('vols').select('instructeur_id, statut').eq('id', id).single();
      if (!vol) return NextResponse.json({ error: 'Vol introuvable' }, { status: 404 });
      if (vol.instructeur_id !== user.id) return NextResponse.json({ error: 'Seul l\'instructeur indiqué peut confirmer.' }, { status: 403 });
      if (vol.statut !== 'en_attente_confirmation_instructeur') return NextResponse.json({ error: 'Ce vol n\'est pas en attente de votre confirmation.' }, { status: 400 });
      const { error } = await createAdminClient().from('vols').update({ statut: 'validé', refusal_reason: null, editing_by_pilot_id: null, editing_started_at: null }).eq('id', id);
      if (error) return NextResponse.json({ error: error.message }, { status: 400 });
      return NextResponse.json({ ok: true });
    }

    if (body.refuser_instructeur === true) {
      const { data: vol } = await supabase.from('vols').select('instructeur_id, statut, refusal_count').eq('id', id).single();
      if (!vol) return NextResponse.json({ error: 'Vol introuvable' }, { status: 404 });
      if (vol.instructeur_id !== user.id) return NextResponse.json({ error: 'Seul l\'instructeur indiqué peut refuser.' }, { status: 403 });
      if (vol.statut !== 'en_attente_confirmation_instructeur') return NextResponse.json({ error: 'Ce vol n\'est pas en attente de votre confirmation.' }, { status: 400 });
      const updates: Record<string, unknown> = { statut: 'refusé', refusal_reason: body.refusal_reason ?? null, refusal_count: (vol.refusal_count ?? 0) + 1, editing_by_pilot_id: null, editing_started_at: null };
      const { error } = await createAdminClient().from('vols').update(updates).eq('id', id);
      if (error) return NextResponse.json({ error: error.message }, { status: 400 });
      return NextResponse.json({ ok: true });
    }

    // ===== Branche modification vol militaire =====
    if (body.type_vol === 'Vol militaire' || body._edit_militaire) {
      const adminMil = createAdminClient();
      const { data: volMil } = await adminMil.from('vols')
        .select('id, pilote_id, copilote_id, chef_escadron_id, statut, type_vol, mission_id')
        .eq('id', id).single();
      if (!volMil) return NextResponse.json({ error: 'Vol introuvable' }, { status: 404 });
      if (volMil.type_vol !== 'Vol militaire') return NextResponse.json({ error: 'Ce vol n\'est pas un vol militaire.' }, { status: 400 });
      if (volMil.statut !== 'en_attente' && !isAdmin) return NextResponse.json({ error: 'Seuls les vols en attente peuvent être modifiés.' }, { status: 400 });

      const isMilAuthorized = volMil.pilote_id === user.id || volMil.copilote_id === user.id || volMil.chef_escadron_id === user.id || isAdmin;
      if (!isMilAuthorized) return NextResponse.json({ error: 'Non autorisé' }, { status: 403 });

      const {
        armee_avion_id, aeroport_depart: milDep, aeroport_arrivee: milArr, duree_minutes: milDuree,
        depart_utc: milDepUtc, escadrille_ou_escadron: milEsc, nature_vol_militaire: milNature,
        nature_vol_militaire_autre: milNatureAutre, commandant_bord: milCmdt,
        callsign: milCallsign, copilote_id: milCopiloteId, chef_escadron_id: milChefId,
        equipage_ids: milEquipageIds,
      } = body;

      if (!milDep || !milArr || typeof milDuree !== 'number' || milDuree < 1 || !milDepUtc || !milCmdt) {
        return NextResponse.json({ error: 'Champs requis manquants.' }, { status: 400 });
      }

      if (volMil.mission_id) {
        const mission = ARME_MISSIONS.find(m => m.id === volMil.mission_id);
        if (mission) {
          if (milDep !== mission.aeroport_depart || milArr !== mission.aeroport_arrivee) {
            return NextResponse.json({ error: 'Le plan de vol doit correspondre à la mission.' }, { status: 400 });
          }
        }
      }

      let typeAvionMil: string | null = null;
      if (armee_avion_id) {
        const { data: inv } = await adminMil.from('armee_avions')
          .select('id, nom_personnalise, types_avion(nom, code_oaci)')
          .eq('id', armee_avion_id).single();
        if (!inv) return NextResponse.json({ error: 'Avion militaire introuvable.' }, { status: 400 });
        const t = inv.types_avion ? (Array.isArray(inv.types_avion) ? inv.types_avion[0] : inv.types_avion) : null;
        typeAvionMil = inv.nom_personnalise || t?.nom || 'Avion militaire';
      }

      const milDepStr = /Z$/.test(String(milDepUtc)) ? String(milDepUtc) : String(milDepUtc) + 'Z';
      const milDepDate = parseISO(milDepStr);
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

      const { error: milErr } = await adminMil.from('vols').update(milUpdates).eq('id', id);
      if (milErr) return NextResponse.json({ error: milErr.message }, { status: 400 });

      if (milEquipageIds !== undefined) {
        await adminMil.from('vols_equipage_militaire').delete().eq('vol_id', id);
        if (Array.isArray(milEquipageIds) && milEquipageIds.length > 0) {
          await adminMil.from('vols_equipage_militaire').insert(
            milEquipageIds.map((pid: string) => ({ vol_id: id, profile_id: pid }))
          );
        }
      }

      return NextResponse.json({ ok: true });
    }

    const { data: vol } = await supabase.from('vols').select('pilote_id, copilote_id, copilote_confirme_par_pilote, instructeur_id, statut, refusal_count').eq('id', id).single();
    if (!vol) return NextResponse.json({ error: 'Vol introuvable' }, { status: 404 });
    const isPiloteOrCopilote = vol.pilote_id === user.id || vol.copilote_id === user.id;
    const isInstructeurEnAttente = vol.instructeur_id === user.id && vol.statut === 'en_attente_confirmation_instructeur';
    if (!isPiloteOrCopilote && !isAdmin && !isInstructeurEnAttente) return NextResponse.json({ error: 'Non autorisé' }, { status: 403 });
    if (vol.statut === 'validé' && !isAdmin) return NextResponse.json({ error: 'Impossible de modifier un vol validé' }, { status: 400 });
    if (vol.statut === 'refusé' && (vol.refusal_count ?? 0) >= 3 && !isAdmin) {
      return NextResponse.json({ error: 'Ce vol a été refusé 3 fois. Veuillez en créer un nouveau.' }, { status: 400 });
    }

    const {
      type_avion_id,
      compagnie_id,
      compagnie_libelle,
      aeroport_depart,
      aeroport_arrivee,
      duree_minutes,
      depart_utc,
      type_vol,
      instructeur_id: instructeurId,
      instruction_type: instructionType,
      commandant_bord,
      role_pilote,
      pilote_id: piloteIdBody,
      copilote_id: copiloteIdBody,
      callsign: callsignBody,
    } = body;

    if (!type_avion_id || !compagnie_libelle || typeof duree_minutes !== 'number' || duree_minutes < 1 ||
        !depart_utc || !['IFR', 'VFR', 'Instruction'].includes(type_vol) || !commandant_bord || !['Pilote', 'Co-pilote'].includes(role_pilote)) {
      return NextResponse.json({ error: 'Champs requis manquants ou invalides' }, { status: 400 });
    }
    if (!aeroport_depart || !CODES_OACI_VALIDES.has(String(aeroport_depart).toUpperCase()) ||
        !aeroport_arrivee || !CODES_OACI_VALIDES.has(String(aeroport_arrivee).toUpperCase())) {
      return NextResponse.json({ error: 'Aéroport de départ et d\'arrivée requis (code OACI PTFS valide)' }, { status: 400 });
    }
    if (type_vol === 'Instruction') {
      if (!instructeurId || !instructionType || typeof instructionType !== 'string' || !String(instructionType).trim()) {
        return NextResponse.json({ error: 'Vol d\'instruction : instructeur et type d\'instruction requis.' }, { status: 400 });
      }
      const { data: inst } = await supabase.from('profiles').select('id').eq('id', instructeurId).in('role', ['admin', 'instructeur']).single();
      if (!inst) return NextResponse.json({ error: 'L\'instructeur doit avoir le rôle instructeur ou administrateur.' }, { status: 400 });
    }

    const isConfirmingByPilote = vol.statut === 'en_attente_confirmation_pilote' && vol.pilote_id === user.id;
    const isConfirmingByCopilote = vol.statut === 'en_attente_confirmation_copilote' && vol.copilote_id === user.id;

    let piloteId = vol.pilote_id;
    let copiloteId = vol.copilote_id;
    if (isConfirmingByPilote || isConfirmingByCopilote) {
      piloteId = vol.pilote_id;
      copiloteId = vol.copilote_id;
    } else if (type_vol === 'Instruction') {
      if (role_pilote === 'Pilote') {
        piloteId = user.id;
        copiloteId = null;
      } else if (vol.copilote_id === user.id) {
        piloteId = instructeurId;
        copiloteId = user.id;
      } else if (vol.pilote_id === user.id) {
        piloteId = user.id;
        copiloteId = vol.copilote_id;
      } else if (isAdmin) {
        piloteId = vol.pilote_id;
        copiloteId = vol.copilote_id;
      }
    } else if (role_pilote === 'Co-pilote') {
      if (vol.copilote_id === user.id) {
        if (!piloteIdBody) return NextResponse.json({ error: 'Qui était le pilote (commandant) ?' }, { status: 400 });
        if (piloteIdBody === user.id) return NextResponse.json({ error: 'Le pilote ne peut pas être vous-même.' }, { status: 400 });
        const { data: p } = await supabase.from('profiles').select('id').eq('id', piloteIdBody).single();
        if (!p) return NextResponse.json({ error: 'Pilote introuvable.' }, { status: 400 });
        piloteId = piloteIdBody;
        copiloteId = user.id;
      } else if (vol.pilote_id === user.id) {
        if (!copiloteIdBody) return NextResponse.json({ error: 'Qui était le copilote ?' }, { status: 400 });
        if (copiloteIdBody === user.id) return NextResponse.json({ error: 'Le copilote ne peut pas être vous-même.' }, { status: 400 });
        const { data: p } = await supabase.from('profiles').select('id').eq('id', copiloteIdBody).single();
        if (!p) return NextResponse.json({ error: 'Copilote introuvable.' }, { status: 400 });
        piloteId = user.id;
        copiloteId = copiloteIdBody;
      } else if (isAdmin) {
        if (!piloteIdBody || !copiloteIdBody) return NextResponse.json({ error: 'Pilote et copilote requis.' }, { status: 400 });
        piloteId = piloteIdBody;
        copiloteId = copiloteIdBody;
      }
    } else {
      if (isAdmin) {
        piloteId = vol.pilote_id;
        copiloteId = vol.copilote_id ?? null;
      } else {
        piloteId = user.id;
        copiloteId = copiloteIdBody ?? null;
      }
    }

    const depStr = /Z$/.test(String(depart_utc)) ? String(depart_utc) : String(depart_utc) + 'Z';
    const dep = parseISO(depStr);
    const arrivee = addMinutes(dep, duree_minutes);

    let statutFinal: string;
    if (vol.statut === 'refuse_par_copilote' && vol.pilote_id === user.id) {
      statutFinal = copiloteId ? 'en_attente_confirmation_copilote' : 'en_attente';
    } else if (isConfirmingByPilote || isConfirmingByCopilote) {
      statutFinal = 'en_attente';
    } else if (vol.statut === 'en_attente_confirmation_pilote' || vol.statut === 'en_attente_confirmation_copilote') {
      statutFinal = vol.statut;
    } else if (type_vol === 'Instruction' && instructeurId) {
      statutFinal = 'en_attente_confirmation_instructeur';
    } else {
      statutFinal = 'en_attente';
    }

    const updates: Record<string, unknown> = {
      type_avion_id,
      compagnie_id: compagnie_id || null,
      compagnie_libelle: String(compagnie_libelle).trim() || 'Pour moi-même',
      aeroport_depart: String(aeroport_depart).toUpperCase(),
      aeroport_arrivee: String(aeroport_arrivee).toUpperCase(),
      duree_minutes,
      depart_utc: dep.toISOString(),
      arrivee_utc: arrivee.toISOString(),
      type_vol,
      instructeur_id: type_vol === 'Instruction' ? instructeurId : null,
      instruction_type: type_vol === 'Instruction' && instructionType ? String(instructionType).trim() : null,
      commandant_bord: String(commandant_bord).trim(),
      role_pilote,
      callsign: callsignBody != null && String(callsignBody).trim() ? String(callsignBody).trim() : null,
      pilote_id: piloteId,
      copilote_id: copiloteId ?? null,
      copilote_confirme_par_pilote: isConfirmingByPilote
        ? true
        : role_pilote === 'Co-pilote' && copiloteId
          ? (piloteId === vol.pilote_id && copiloteId === vol.copilote_id ? (vol.copilote_confirme_par_pilote ?? false) : false)
          : false,
      statut: statutFinal,
      refusal_reason: null,
      editing_by_pilot_id: null,
      editing_started_at: null,
    };

    const adminClient = createAdminClient();
    const { error } = await adminClient.from('vols').update(updates).eq('id', id);
    if (error) return NextResponse.json({ error: error.message }, { status: 400 });
    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error('Vol PATCH error:', e);
    return NextResponse.json({ error: 'Erreur serveur' }, { status: 500 });
  }
}

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Non autorisé' }, { status: 401 });

    const admin = createAdminClient();
    const { data: vol } = await admin.from('vols').select('pilote_id, copilote_id, type_vol, instructeur_id, chef_escadron_id').eq('id', id).single();
    if (!vol) return NextResponse.json({ error: 'Vol introuvable' }, { status: 404 });

    const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).single();
    const isAdmin = profile?.role === 'admin';
    const isPiloteOrCopilote = vol.pilote_id === user.id || vol.copilote_id === user.id;
    const isInstructeur = vol.instructeur_id === user.id;
    const isChefEscadron = vol.chef_escadron_id === user.id;
    const isVolInstruction = vol.type_vol === 'Instruction' && vol.instructeur_id;
    const isVolMilitaire = vol.type_vol === 'Vol militaire';

    if (isVolInstruction) {
      if (!isAdmin && !isInstructeur) return NextResponse.json({ error: 'Pour un vol d\'instruction, seul l\'instructeur peut supprimer le vol.' }, { status: 403 });
    } else if (isVolMilitaire) {
      if (!isAdmin && !isPiloteOrCopilote && !isChefEscadron) return NextResponse.json({ error: 'Vous ne pouvez supprimer que vos propres vols militaires.' }, { status: 403 });
    } else {
      if (!isAdmin && !isPiloteOrCopilote) return NextResponse.json({ error: 'Vous ne pouvez supprimer que vos propres vols.' }, { status: 403 });
    }

    const { error } = await admin.from('vols').delete().eq('id', id);
    if (error) return NextResponse.json({ error: error.message }, { status: 400 });
    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error('Vol DELETE error:', e);
    return NextResponse.json({ error: 'Erreur serveur' }, { status: 500 });
  }
}
