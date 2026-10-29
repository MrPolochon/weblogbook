export const dynamic = 'force-dynamic';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { NextResponse } from 'next/server';
import { addMinutes, parseISO } from 'date-fns';
import { CODES_OACI_VALIDES } from '@/lib/aeroports-ptfs';
import { canSubmitVolMilitaire, createVolMilitaire } from '@/lib/armee';
import { isQualifiedFlightInstructorInLogbook } from '@/lib/instruction-permissions';

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

    // --- Vol militaire (délègue au service armée ; préférer POST /api/armee/vols) ---
    if (type_vol === 'Vol militaire') {
      if (!canSubmitVolMilitaire(profile)) {
        return NextResponse.json({ error: 'Réservé aux utilisateurs avec le rôle Armée (ou aux admins).' }, { status: 403 });
      }
      const result = await createVolMilitaire(body, { userId: user.id, supabase });
      if (!result.ok) return NextResponse.json({ error: result.error }, { status: result.status });
      return NextResponse.json({ ok: true, id: result.data.id });
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
    const planIdAlias = body.plan_vol_id;
    if ((planIdBody != null && typeof planIdBody !== 'string') || (planIdAlias != null && typeof planIdAlias !== 'string')) {
      return NextResponse.json({ error: 'Référence du plan de vol invalide.' }, { status: 400 });
    }
    const suppliedPlanId = typeof planIdBody === 'string' ? planIdBody.trim() : '';
    const aliasPlanId = typeof planIdAlias === 'string' ? planIdAlias.trim() : '';
    if (suppliedPlanId && aliasPlanId && suppliedPlanId !== aliasPlanId) {
      return NextResponse.json({ error: 'Les références du plan de vol ne correspondent pas.' }, { status: 400 });
    }
    const planIdToUse = suppliedPlanId || aliasPlanId || null;
    if (planIdToUse && !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(planIdToUse)) {
      return NextResponse.json({ error: 'Référence du plan de vol invalide.' }, { status: 400 });
    }

    const isAdmin = profile.role === 'admin';
    let targetPiloteId: string;
    let targetCopiloteId: string | null = null;
    let copiloteConfirme = false;

    if (role_pilote === 'Co-pilote') {
      if (isAdmin && created_by_admin) {
        if (!piloteIdBody || !copiloteIdBody) return NextResponse.json({ error: 'Vol Co-pilote : pilote et copilote requis.' }, { status: 400 });
        const [{ data: p1 }, { data: p2 }] = await Promise.all([
          supabase.from('profiles').select('id').eq('id', piloteIdBody).single(),
          supabase.from('profiles').select('id').eq('id', copiloteIdBody).single(),
        ]);
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

    if (!type_avion_id || !compagnie_libelle || !Number.isInteger(duree_minutes) || duree_minutes < 1 ||
        !depart_utc || !['IFR', 'VFR', 'Instruction'].includes(type_vol) || !commandant_bord || !['Pilote', 'Co-pilote'].includes(role_pilote)) {
      return NextResponse.json({ error: 'Champs requis manquants ou invalides' }, { status: 400 });
    }
    if (!aeroport_depart || !CODES_OACI_VALIDES.has(String(aeroport_depart).toUpperCase()) ||
        !aeroport_arrivee || !CODES_OACI_VALIDES.has(String(aeroport_arrivee).toUpperCase())) {
      return NextResponse.json({ error: 'Aéroport de départ et d\'arrivée requis (code OACI PTFS valide)' }, { status: 400 });
    }
    if (type_vol === 'Instruction') {
      if (!body.instructeur_id || !body.instruction_type || typeof body.instruction_type !== 'string' || !String(body.instruction_type).trim()) {
        return NextResponse.json({ error: 'Vol d\'instruction : instructeur et type d\'instruction requis.' }, { status: 400 });
      }
      const adminV = createAdminClient();
      const { data: inst } = await adminV.from('profiles').select('id, role').eq('id', body.instructeur_id).single();
      if (!inst) return NextResponse.json({ error: 'Instructeur introuvable.' }, { status: 400 });
      const instOk = await isQualifiedFlightInstructorInLogbook(adminV, inst.id, inst.role);
      if (!instOk) {
        return NextResponse.json(
          { error: 'L’instructeur de vol doit être administrateur, instructeur, ou titulaire de la licence FI (Flight instructor).' },
          { status: 400 },
        );
      }
    }

    const depStr = /(?:Z|[+-]\d{2}:\d{2})$/i.test(String(depart_utc)) ? String(depart_utc) : String(depart_utc) + 'Z';
    const dep = parseISO(depStr);
    if (!Number.isFinite(dep.getTime())) return NextResponse.json({ error: 'Heure de départ invalide.' }, { status: 400 });
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

    // The plan link, duplicate guard and processed marker must commit together.
    // Pending/refused entries are already in the logbook and are never reinserted.
    const { data, error } = await createAdminClient().rpc('register_logbook_flight', {
      p_actor: user.id,
      p_row: row,
      p_plan_id: planIdToUse,
    });
    if (error) {
      console.error('Enregistrement atomique du carnet:', error.code);
      const missingMigration = ['PGRST202', '42883', '42703', '42P01'].includes(error.code ?? '');
      return NextResponse.json({ error: missingMigration
        ? 'L’enregistrement des vols nécessite une mise à jour du site. Aucun nouveau vol n’a été enregistré ; réessayez après sa mise en place.'
        : 'Le vol n’a pas pu être enregistré. Aucun nouvel enregistrement n’a été confirmé ; réessayez sans recréer le vol.' }, { status: missingMigration ? 503 : 500 });
    }
    if (!data || typeof data !== 'object' || Array.isArray(data)) {
      return NextResponse.json({ error: 'La confirmation d’enregistrement est indisponible. Consultez votre carnet avant de réessayer.' }, { status: 500 });
    }
    if (data.ok !== true) {
      const status = [400, 403, 404, 409, 422].includes(Number(data.status)) ? Number(data.status) : 400;
      return NextResponse.json({ error: typeof data.error === 'string' ? data.error : 'Le vol ne peut pas être enregistré.' }, { status });
    }
    if (typeof data.id !== 'string' || !data.id) {
      return NextResponse.json({ error: 'La confirmation d’enregistrement est incomplète. Consultez votre carnet avant de réessayer.' }, { status: 500 });
    }
    return NextResponse.json({ ok: true, id: data.id, already_registered: data.duplicate === true, statut: data.statut ?? null });
  } catch (e) {
    console.error('Vol create error:', e);
    return NextResponse.json({ error: 'Erreur serveur' }, { status: 500 });
  }
}
