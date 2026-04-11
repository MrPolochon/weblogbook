import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { INSTRUCTION_LICENCE_CODES } from '@/lib/instruction-programs';

const STATUTS_PLANS_OUVERTS = ['depose', 'en_attente', 'accepte', 'en_cours', 'automonitoring', 'en_attente_cloture'];

function canManageInstruction(role: string | null | undefined): boolean {
  return role === 'instructeur' || role === 'admin';
}

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: eleveId } = await params;
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Non autorisé' }, { status: 401 });

    const admin = createAdminClient();
    const { data: me } = await admin.from('profiles').select('role').eq('id', user.id).single();
    if (!canManageInstruction(me?.role)) {
      return NextResponse.json({ error: 'Réservé aux instructeurs.' }, { status: 403 });
    }

    const { data: eleve } = await admin
      .from('profiles')
      .select('id, instructeur_referent_id, formation_instruction_active')
      .eq('id', eleveId)
      .single();
    if (!eleve) return NextResponse.json({ error: 'Élève introuvable.' }, { status: 404 });
    if (eleve.instructeur_referent_id !== user.id && me?.role !== 'admin') {
      return NextResponse.json({ error: 'Cet élève n’est pas rattaché à vous.' }, { status: 403 });
    }

    const body = await request.json();
    const action = String(body.action || '').trim();
    if (action !== 'terminer_formation' && action !== 'set_licence') {
      return NextResponse.json({ error: 'Action inconnue.' }, { status: 400 });
    }

    if (action === 'set_licence') {
      const licenceCode = String(body.licence_code || '').trim();
      if (!INSTRUCTION_LICENCE_CODES.includes(licenceCode)) {
        return NextResponse.json({ error: 'Licence invalide.' }, { status: 400 });
      }
      const { error: setErr } = await admin
        .from('profiles')
        .update({ formation_instruction_licence: licenceCode })
        .eq('id', eleveId);
      if (setErr) return NextResponse.json({ error: setErr.message }, { status: 400 });
      return NextResponse.json({ ok: true });
    }

    const { data: avionsTemp } = await admin
      .from('inventaire_avions')
      .select('id, immatriculation')
      .eq('instruction_actif', true)
      .eq('instruction_eleve_id', eleveId);

    const ids = (avionsTemp || []).map((a) => a.id);
    if (ids.length > 0) {
      const { count: plansOuverts } = await admin
        .from('plans_vol')
        .select('*', { count: 'exact', head: true })
        .in('inventaire_avion_id', ids)
        .in('statut', STATUTS_PLANS_OUVERTS);
      if ((plansOuverts ?? 0) > 0) {
        return NextResponse.json({
          error: 'Impossible de terminer la formation: un avion temporaire est utilisé dans un plan de vol en cours.',
        }, { status: 400 });
      }
      await admin.from('inventaire_avions').delete().in('id', ids);
    }

    const { error: profileErr } = await admin
      .from('profiles')
      .update({
        formation_instruction_active: false,
        instructeur_referent_id: null,
      })
      .eq('id', eleveId);

    if (profileErr) return NextResponse.json({ error: profileErr.message }, { status: 400 });
    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error('instruction/eleves/[id] PATCH:', e);
    return NextResponse.json({ error: 'Erreur serveur' }, { status: 500 });
  }
}
