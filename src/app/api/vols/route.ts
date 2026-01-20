import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { NextResponse } from 'next/server';
import { addMinutes, parseISO } from 'date-fns';
import { CODES_OACI_VALIDES } from '@/lib/aeroports-ptfs';
import { AVIONS_MILITAIRES, NATURES_VOL_MILITAIRE } from '@/lib/avions-militaires';

export async function POST(request: Request) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Non autorisé' }, { status: 401 });

    const { data: profile } = await supabase.from('profiles').select('id, role, blocked_until, armee').eq('id', user.id).single();
    if (!profile) return NextResponse.json({ error: 'Profil introuvable' }, { status: 403 });
    if (profile.blocked_until && new Date(profile.blocked_until) > new Date()) {
      return NextResponse.json({ error: 'Vous ne pouvez pas ajouter de vol pour le moment.' }, { status: 403 });
    }

    const body = await request.json();
    const type_vol = body.type_vol;

    // --- Vol militaire ---
    if (type_vol === 'Vol militaire') {
      if (!profile.armee && profile.role !== 'admin') return NextResponse.json({ error: 'Réservé aux utilisateurs avec le rôle Armée (ou aux admins).' }, { status: 403 });
      const {
        type_avion_militaire: tam,
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
      } = body;
      if (!tam || !(AVIONS_MILITAIRES as readonly string[]).includes(String(tam).trim())) {
        return NextResponse.json({ error: 'Type d\'avion militaire invalide.' }, { status: 400 });
      }
      if (!['escadrille', 'escadron', 'autre'].includes(String(eoe))) {
        return NextResponse.json({ error: 'Indiquez si le vol était en escadrille, en escadron ou autre.' }, { status: 400 });
      }
      if (eoe === 'autre') {
        if (!nvm || !(NATURES_VOL_MILITAIRE as readonly string[]).includes(String(nvm))) {
          return NextResponse.json({ error: 'Nature du vol militaire requise (entraînement, escorte, sauvetage, reconnaissance ou autre).' }, { status: 400 });
        }
        if (nvm === 'autre' && (!nvma || !String(nvma).trim())) {
          return NextResponse.json({ error: 'Précisez la nature du vol (champ autre).' }, { status: 400 });
        }
      }
      if (!ad || !CODES_OACI_VALIDES.has(String(ad).toUpperCase()) || !aa || !CODES_OACI_VALIDES.has(String(aa).toUpperCase())) {
        return NextResponse.json({ error: 'Aéroports de départ et d\'arrivée requis (code OACI valide).' }, { status: 400 });
      }
      if (typeof dm !== 'number' || dm < 1 || !du || !cb) {
        return NextResponse.json({ error: 'Champs requis manquants ou invalides.' }, { status: 400 });
      }

      const isEscadrilleOuEscadron = eoe === 'escadrille' || eoe === 'escadron';
      let targetPiloteId: string;
      let targetCopiloteId: string | null = null;
      let rolePiloteVal: string;

      if (isEscadrilleOuEscadron) {
        targetPiloteId = user.id;
        targetCopiloteId = null;
        rolePiloteVal = 'Pilote';
        const equipageIds: string[] = Array.isArray(equipageIdsBody) ? equipageIdsBody.filter((x): x is string => typeof x === 'string' && x.length > 0) : [];
        for (const eid of equipageIds) {
          if (eid === user.id) continue;
          const { data: ep } = await supabase.from('profiles').select('id, armee').eq('id', eid).single();
          if (!ep || !ep.armee) return NextResponse.json({ error: 'Tous les pilotes de l\'équipage doivent avoir le rôle Armée.' }, { status: 400 });
        }
      } else {
        if (!rp || !['Pilote', 'Co-pilote'].includes(String(rp))) {
          return NextResponse.json({ error: 'Rôle pilote requis.' }, { status: 400 });
        }
        rolePiloteVal = String(rp);
        if (rp === 'Co-pilote') {
          if (!pidB) return NextResponse.json({ error: 'Qui était le pilote (commandant) ?' }, { status: 400 });
          if (pidB === user.id) return NextResponse.json({ error: 'Vous ne pouvez pas être pilote et co-pilote.' }, { status: 400 });
          const { data: pp } = await supabase.from('profiles').select('id, armee').eq('id', pidB).single();
          if (!pp || !pp.armee) return NextResponse.json({ error: 'Le pilote doit avoir le rôle Armée.' }, { status: 400 });
          targetPiloteId = pidB;
          targetCopiloteId = user.id;
        } else {
          targetPiloteId = user.id;
          if (cidB) {
            if (cidB === user.id) return NextResponse.json({ error: 'Vous ne pouvez pas être pilote et co-pilote.' }, { status: 400 });
            const { data: cp } = await supabase.from('profiles').select('id, armee').eq('id', cidB).single();
            if (!cp || !cp.armee) return NextResponse.json({ error: 'Le co-pilote doit avoir le rôle Armée.' }, { status: 400 });
            targetCopiloteId = cidB;
          }
        }
      }

      const depStr = /Z$/.test(String(du)) ? String(du) : String(du) + 'Z';
      const dep = parseISO(depStr);
      const arrivee = addMinutes(dep, dm);
      const row = {
        pilote_id: targetPiloteId,
        copilote_id: targetCopiloteId,
        copilote_confirme_par_pilote: false,
        type_avion_id: null,
        compagnie_id: null,
        compagnie_libelle: 'Vol militaire',
        type_avion_militaire: String(tam).trim(),
        escadrille_ou_escadron: String(eoe),
        chef_escadron_id: eoe === 'escadron' ? user.id : null,
        nature_vol_militaire: eoe === 'autre' ? String(nvm) : null,
        nature_vol_militaire_autre: eoe === 'autre' && nvm === 'autre' && nvma ? String(nvma).trim() : null,
        aeroport_depart: String(ad).toUpperCase(),
        aeroport_arrivee: String(aa).toUpperCase(),
        duree_minutes: dm,
        depart_utc: dep.toISOString(),
        arrivee_utc: arrivee.toISOString(),
        type_vol: 'Vol militaire',
        instructeur_id: null,
        instruction_type: null,
        commandant_bord: String(cb).trim(),
        role_pilote: rolePiloteVal,
        callsign: csB != null && String(csB).trim() ? String(csB).trim() : null,
        statut: 'en_attente',
        created_by_admin: false,
        created_by_user_id: null,
      };
      const { data, error } = await supabase.from('vols').insert(row).select('id').single();
      if (error) return NextResponse.json({ error: error.message }, { status: 400 });

      if (isEscadrilleOuEscadron) {
        const equipageIds: string[] = Array.isArray(equipageIdsBody) ? equipageIdsBody.filter((x): x is string => typeof x === 'string' && x.length > 0) : [];
        const tous = Array.from(new Set([user.id, ...equipageIds]));
        if (tous.length > 0) {
          const admin = createAdminClient();
          await admin.from('vols_equipage_militaire').insert(tous.map((pid) => ({ vol_id: data.id, profile_id: pid })));
        }
      }

      return NextResponse.json({ ok: true, id: data.id });
    }

    const {
      type_avion_id,
      compagnie_id,
      compagnie_libelle,
      aeroport_depart,
      aeroport_arrivee,
      duree_minutes,
      depart_utc,
      instructeur_id: instructeurId,
      instruction_type: instructionType,
      commandant_bord,
      role_pilote,
      created_by_admin,
      pilote_id: piloteIdBody,
      copilote_id: copiloteIdBody,
      callsign: callsignBody,
      plan_id: planIdBody,
    } = body;

    const isAdmin = profile.role === 'admin';
    let targetPiloteId: string;
    let targetCopiloteId: string | null = null;
    let copiloteConfirme = false;

    if (role_pilote === 'Co-pilote') {
      if (isAdmin && created_by_admin) {
        if (!piloteIdBody || !copiloteIdBody) return NextResponse.json({ error: 'Vol Co-pilote : pilote et copilote requis.' }, { status: 400 });
        const { data: p1 } = await supabase.from('profiles').select('id').eq('id', piloteIdBody).single();
        const { data: p2 } = await supabase.from('profiles').select('id').eq('id', copiloteIdBody).single();
        if (!p1 || !p2) return NextResponse.json({ error: 'Pilote ou copilote introuvable.' }, { status: 400 });
        targetPiloteId = piloteIdBody;
        targetCopiloteId = copiloteIdBody;
        copiloteConfirme = true;
      } else {
        if (!piloteIdBody) return NextResponse.json({ error: 'Qui était le pilote (commandant de bord) ?' }, { status: 400 });
        if (type_vol !== 'Instruction' && piloteIdBody === user.id) return NextResponse.json({ error: 'Vous ne pouvez pas être le pilote et le copilote.' }, { status: 400 });
        const { data: p } = await supabase.from('profiles').select('id').eq('id', piloteIdBody).single();
        if (!p) return NextResponse.json({ error: 'Pilote introuvable.' }, { status: 400 });
        targetPiloteId = piloteIdBody;
        targetCopiloteId = user.id;
        copiloteConfirme = false;
      }
    } else {
      targetPiloteId = (isAdmin && piloteIdBody) ? piloteIdBody : profile.id;
      if (isAdmin && piloteIdBody) {
        const { data: target } = await supabase.from('profiles').select('id').eq('id', piloteIdBody).single();
        if (!target) return NextResponse.json({ error: 'Pilote introuvable' }, { status: 400 });
      }
      if (!isAdmin && piloteIdBody) return NextResponse.json({ error: 'Non autorisé' }, { status: 403 });
      if (copiloteIdBody && type_vol !== 'Instruction') {
        if (copiloteIdBody === user.id) return NextResponse.json({ error: 'Vous ne pouvez pas être le pilote et le copilote.' }, { status: 400 });
        const { data: co } = await supabase.from('profiles').select('id').eq('id', copiloteIdBody).single();
        if (!co) return NextResponse.json({ error: 'Co-pilote introuvable.' }, { status: 400 });
        targetCopiloteId = copiloteIdBody;
        copiloteConfirme = false;
      }
    }

    if (!type_avion_id || !compagnie_libelle || typeof duree_minutes !== 'number' || duree_minutes < 1 ||
        !depart_utc || !['IFR', 'VFR', 'Instruction'].includes(type_vol) || !commandant_bord || !['Pilote', 'Co-pilote'].includes(role_pilote)) {
      return NextResponse.json({ error: 'Champs requis manquants ou invalides' }, { status: 400 });
    }
    if (!aeroport_depart || !CODES_OACI_VALIDES.has(String(aeroport_depart).toUpperCase()) ||
        !aeroport_arrivee || !CODES_OACI_VALIDES.has(String(aeroport_arrivee).toUpperCase())) {
      return NextResponse.json({ error: 'Aéroport de départ et d\'arrivée requis (code OACI PTFS valide)' }, { status: 400 });
    }
    if (type_vol === 'Instruction') {
      if (!body.instructeur_id || !body.instruction_type || typeof body.instruction_type !== 'string' || !String(body.instruction_type).trim()) {
        return NextResponse.json({ error: 'Vol d\'instruction : instructeur (admin) et type d\'instruction requis.' }, { status: 400 });
      }
      const { data: inst } = await supabase.from('profiles').select('id').eq('id', body.instructeur_id).eq('role', 'admin').single();
      if (!inst) return NextResponse.json({ error: 'L\'instructeur doit être un administrateur.' }, { status: 400 });
    }

    const depStr = /Z$/.test(String(depart_utc)) ? String(depart_utc) : String(depart_utc) + 'Z';
    const dep = parseISO(depStr);
    const arrivee = addMinutes(dep, duree_minutes);

    const row = {
      pilote_id: targetPiloteId,
      copilote_id: targetCopiloteId,
      copilote_confirme_par_pilote: copiloteConfirme,
      type_avion_id,
      compagnie_id: compagnie_id || null,
      compagnie_libelle: String(compagnie_libelle).trim() || 'Pour moi-même',
      aeroport_depart: String(aeroport_depart).toUpperCase(),
      aeroport_arrivee: String(aeroport_arrivee).toUpperCase(),
      duree_minutes,
      depart_utc: dep.toISOString(),
      arrivee_utc: arrivee.toISOString(),
      type_vol,
      instructeur_id: type_vol === 'Instruction' ? (instructeurId ?? null) : null,
      instruction_type: type_vol === 'Instruction' && instructionType ? String(instructionType).trim() : null,
      commandant_bord: String(commandant_bord).trim(),
      role_pilote,
      callsign: callsignBody != null && String(callsignBody).trim() ? String(callsignBody).trim() : null,
      statut: isAdmin && created_by_admin
        ? 'validé'
        : role_pilote === 'Co-pilote' && !isAdmin
          ? 'en_attente_confirmation_pilote'
          : targetCopiloteId
            ? 'en_attente_confirmation_copilote'
            : type_vol === 'Instruction'
              ? 'en_attente_confirmation_instructeur'
              : 'en_attente',
      created_by_admin: Boolean(created_by_admin && isAdmin),
      created_by_user_id: isAdmin && created_by_admin ? user.id : null,
    };

    const insertClient = (role_pilote === 'Co-pilote' && !isAdmin) || (isAdmin && created_by_admin)
      ? createAdminClient()
      : supabase;
    const { data, error } = await insertClient.from('vols').insert(row).select('id').single();
    if (error) return NextResponse.json({ error: error.message }, { status: 400 });

    const planIdToUse = (typeof planIdBody === 'string' && planIdBody.trim()) ? planIdBody.trim() : null;
    if (planIdToUse) {
      const admin = createAdminClient();
      const { data: plan } = await admin.from('plans_vol').select('id, pilote_id, statut').eq('id', planIdToUse).single();
      if (plan && plan.pilote_id === user.id && plan.statut === 'cloture') {
        await admin.from('plans_vol').delete().eq('id', planIdToUse);
      }
    }

    return NextResponse.json({ ok: true, id: data.id });
  } catch (e) {
    console.error('Vol create error:', e);
    return NextResponse.json({ error: 'Erreur serveur' }, { status: 500 });
  }
}
