import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { NextResponse } from 'next/server';

export async function POST(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Non autorisé' }, { status: 401 });

    const admin = createAdminClient();
    const { data: avion } = await admin
      .from('compagnie_avions')
      .select('id, compagnie_id, statut, usure_percent')
      .eq('id', id)
      .single();
    if (!avion) return NextResponse.json({ error: 'Avion introuvable.' }, { status: 404 });

    const nowIso = new Date().toISOString();
    const { data: locationActive } = await admin
      .from('compagnie_locations')
      .select('id, loueur_compagnie_id, locataire_compagnie_id, start_at, end_at, statut')
      .eq('avion_id', id)
      .eq('statut', 'active')
      .lte('start_at', nowIso)
      .gte('end_at', nowIso)
      .maybeSingle();

    if (avion.statut !== 'bloque') {
      return NextResponse.json({ error: 'L\'avion n\'est pas bloqué.' }, { status: 400 });
    }
    if (avion.usure_percent !== 0) {
      return NextResponse.json({ error: 'L\'avion n\'est pas à 0% d\'usure.' }, { status: 400 });
    }

    const { data: compagnie } = await admin
      .from('compagnies')
      .select('id, pdg_id')
      .eq('id', avion.compagnie_id)
      .single();
    const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).single();
    
    if (locationActive && profile?.role !== 'admin') {
      return NextResponse.json({ error: 'Avion en location : débloquage interdit pour le loueur.' }, { status: 403 });
    }

    if (compagnie?.pdg_id !== user.id && profile?.role !== 'admin') {
      return NextResponse.json({ error: 'Seul le PDG peut débloquer un avion.' }, { status: 403 });
    }

    // Débloquer : passer à 'ground' pour permettre un vol ferry
    const { error } = await admin.from('compagnie_avions').update({ statut: 'ground' }).eq('id', id);
    if (error) return NextResponse.json({ error: error.message }, { status: 400 });
    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error('POST compagnies/avions/debloquer:', e);
    return NextResponse.json({ error: 'Erreur serveur' }, { status: 500 });
  }
}
