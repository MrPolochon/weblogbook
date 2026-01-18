import { createClient } from '@/lib/supabase/server';
import { NextResponse } from 'next/server';
import { addMinutes, parseISO } from 'date-fns';

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
      duree_minutes,
      depart_utc,
      type_vol,
      commandant_bord,
      role_pilote,
      created_by_admin,
      pilote_id,
    } = body;

    const isAdmin = profile.role === 'admin';
    const targetPiloteId = isAdmin && pilote_id ? pilote_id : profile.id;
    if (isAdmin && pilote_id && pilote_id !== profile.id) {
      const { data: target } = await supabase.from('profiles').select('id').eq('id', pilote_id).single();
      if (!target) return NextResponse.json({ error: 'Pilote introuvable' }, { status: 400 });
    } else if (!isAdmin && pilote_id) {
      return NextResponse.json({ error: 'Non autorisé' }, { status: 403 });
    }

    if (!type_avion_id || !compagnie_libelle || typeof duree_minutes !== 'number' || duree_minutes < 1 ||
        !depart_utc || !['IFR', 'VFR'].includes(type_vol) || !commandant_bord || !['Pilote', 'Co-pilote'].includes(role_pilote)) {
      return NextResponse.json({ error: 'Champs requis manquants ou invalides' }, { status: 400 });
    }

    const depStr = /Z$/.test(String(depart_utc)) ? String(depart_utc) : String(depart_utc) + 'Z';
    const dep = parseISO(depStr);
    const arrivee = addMinutes(dep, duree_minutes);

    const row = {
      pilote_id: targetPiloteId,
      type_avion_id,
      compagnie_id: compagnie_id || null,
      compagnie_libelle: String(compagnie_libelle).trim() || 'Pour moi-même',
      duree_minutes,
      depart_utc: dep.toISOString(),
      arrivee_utc: arrivee.toISOString(),
      type_vol,
      commandant_bord: String(commandant_bord).trim(),
      role_pilote,
      statut: isAdmin && created_by_admin ? 'validé' : 'en_attente',
      created_by_admin: Boolean(created_by_admin && isAdmin),
      created_by_user_id: isAdmin && created_by_admin ? user.id : null,
    };

    const { data, error } = await supabase.from('vols').insert(row).select('id').single();
    if (error) return NextResponse.json({ error: error.message }, { status: 400 });
    return NextResponse.json({ ok: true, id: data.id });
  } catch (e) {
    console.error('Vol create error:', e);
    return NextResponse.json({ error: 'Erreur serveur' }, { status: 500 });
  }
}
