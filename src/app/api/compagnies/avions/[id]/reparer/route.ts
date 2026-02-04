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
      .select('id, compagnie_id, aeroport_actuel, statut, usure_percent')
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

    const compagnieCibleId = locationActive?.locataire_compagnie_id || avion.compagnie_id;
    const { data: compagnie } = await admin
      .from('compagnies')
      .select('id, pdg_id')
      .eq('id', compagnieCibleId)
      .single();
    const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).single();
    
    if (compagnie?.pdg_id !== user.id && profile?.role !== 'admin') {
      if (locationActive) {
        return NextResponse.json({ error: 'Avion en location : le PDG locataire gère la maintenance.' }, { status: 403 });
      }
      return NextResponse.json({ error: 'Seul le PDG peut réparer les avions.' }, { status: 403 });
    }

    // Vérifier que l'avion est à un hub
    const { data: hub } = await admin
      .from('compagnie_hubs')
      .select('id')
      .eq('compagnie_id', compagnieCibleId)
      .eq('aeroport_code', avion.aeroport_actuel)
      .maybeSingle();
    
    if (!hub) {
      return NextResponse.json({ error: 'L\'avion doit être à un hub pour être réparé.' }, { status: 400 });
    }

    if (avion.statut === 'in_flight') {
      return NextResponse.json({ error: 'Impossible de réparer un avion en vol.' }, { status: 400 });
    }
    if (avion.usure_percent >= 100) {
      return NextResponse.json({ error: 'L\'avion est déjà à 100% de santé.' }, { status: 400 });
    }

    // Réparer : remettre à 100% et débloquer si nécessaire
    const { error } = await admin
      .from('compagnie_avions')
      .update({
        usure_percent: 100,
        statut: avion.statut === 'maintenance' || avion.statut === 'bloque' ? 'ground' : avion.statut,
      })
      .eq('id', id);

    if (error) return NextResponse.json({ error: error.message }, { status: 400 });
    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error('POST compagnies/avions/reparer:', e);
    return NextResponse.json({ error: 'Erreur serveur' }, { status: 500 });
  }
}
