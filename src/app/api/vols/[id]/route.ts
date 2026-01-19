import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { NextResponse } from 'next/server';
import { addMinutes, parseISO } from 'date-fns';
import { CODES_OACI_VALIDES } from '@/lib/aeroports-ptfs';

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
      const { data: vol } = await supabase.from('vols').select('id, pilote_id, statut').eq('id', id).single();
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
        return NextResponse.json({ error: 'Vol d\'instruction : instructeur (admin) et type d\'instruction requis.' }, { status: 400 });
      }
      const { data: inst } = await supabase.from('profiles').select('id').eq('id', instructeurId).eq('role', 'admin').single();
      if (!inst) return NextResponse.json({ error: 'L\'instructeur doit être un administrateur.' }, { status: 400 });
    }

    let piloteId = vol.pilote_id;
    let copiloteId = vol.copilote_id;
    if (role_pilote === 'Co-pilote') {
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
      piloteId = user.id;
      copiloteId = copiloteIdBody ?? null;
    }

    const depStr = /Z$/.test(String(depart_utc)) ? String(depart_utc) : String(depart_utc) + 'Z';
    const dep = parseISO(depStr);
    const arrivee = addMinutes(dep, duree_minutes);

    const isConfirmingByPilote = vol.statut === 'en_attente_confirmation_pilote' && vol.pilote_id === user.id;
    const isConfirmingByCopilote = vol.statut === 'en_attente_confirmation_copilote' && vol.copilote_id === user.id;

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

    const { data: vol } = await supabase.from('vols').select('pilote_id, copilote_id').eq('id', id).single();
    if (!vol) return NextResponse.json({ error: 'Vol introuvable' }, { status: 404 });

    const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).single();
    const isAdmin = profile?.role === 'admin';
    const isPiloteOrCopilote = vol.pilote_id === user.id || vol.copilote_id === user.id;

    if (!isAdmin && !isPiloteOrCopilote) {
      return NextResponse.json({ error: 'Vous ne pouvez supprimer que vos propres vols.' }, { status: 403 });
    }

    const { error } = await createAdminClient().from('vols').delete().eq('id', id);
    if (error) return NextResponse.json({ error: error.message }, { status: 400 });
    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error('Vol DELETE error:', e);
    return NextResponse.json({ error: 'Erreur serveur' }, { status: 500 });
  }
}
