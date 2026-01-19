import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { NextResponse } from 'next/server';
import { addMinutes, parseISO } from 'date-fns';
import { CODES_OACI_VALIDES } from '@/lib/aeroports-ptfs';

export async function POST(request: Request) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Non autorisé' }, { status: 401 });

    const { data: profile } = await supabase.from('profiles').select('id, role, blocked_until').eq('id', user.id).single();
    if (!profile) return NextResponse.json({ error: 'Profil introuvable' }, { status: 403 });
    if (profile.blocked_until && new Date(profile.blocked_until) > new Date()) {
      return NextResponse.json({ error: 'Vous ne pouvez pas ajouter de vol pour le moment.' }, { status: 403 });
    }

    const body = await request.json();
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
      created_by_admin,
      pilote_id: piloteIdBody,
      copilote_id: copiloteIdBody,
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
    return NextResponse.json({ ok: true, id: data.id });
  } catch (e) {
    console.error('Vol create error:', e);
    return NextResponse.json({ error: 'Erreur serveur' }, { status: 500 });
  }
}
