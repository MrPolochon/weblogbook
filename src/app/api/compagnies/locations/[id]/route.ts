import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Non autorisé' }, { status: 401 });

    const body = await request.json();
    const { action } = body;
    if (!action) return NextResponse.json({ error: 'Action requise.' }, { status: 400 });

    const admin = createAdminClient();
    const { data: location } = await admin
      .from('compagnie_locations')
      .select('*')
      .eq('id', id)
      .single();
    if (!location) return NextResponse.json({ error: 'Location introuvable.' }, { status: 404 });

    const { data: loueur } = await admin
      .from('compagnies')
      .select('id, pdg_id, nom')
      .eq('id', location.loueur_compagnie_id)
      .single();
    const { data: locataire } = await admin
      .from('compagnies')
      .select('id, pdg_id, nom')
      .eq('id', location.locataire_compagnie_id)
      .single();

    const isLoueurPdg = loueur?.pdg_id === user.id;
    const isLocatairePdg = locataire?.pdg_id === user.id;

    if (action === 'accept') {
      if (!isLocatairePdg) return NextResponse.json({ error: 'Seul le PDG locataire peut accepter.' }, { status: 403 });
      if (location.statut !== 'pending') return NextResponse.json({ error: 'Location non en attente.' }, { status: 400 });

      const start = new Date();
      const end = new Date(start.getTime() + location.duree_jours * 24 * 60 * 60 * 1000);

      const { error } = await admin.from('compagnie_locations').update({
        statut: 'active',
        accepted_at: start.toISOString(),
        start_at: start.toISOString(),
        end_at: end.toISOString(),
        last_billed_at: start.toISOString()
      }).eq('id', id);
      if (error) return NextResponse.json({ error: error.message }, { status: 400 });

      if (loueur?.pdg_id) {
        await admin.from('messages').insert({
          destinataire_id: loueur.pdg_id,
          expediteur_id: user.id,
          titre: `Location acceptée (${locataire?.nom || 'Compagnie'})`,
          contenu: `La compagnie ${locataire?.nom || ''} a accepté la location.`,
          type_message: 'location_avion'
        });
      }

      return NextResponse.json({ ok: true });
    }

    if (action === 'refuse') {
      if (!isLocatairePdg) return NextResponse.json({ error: 'Seul le PDG locataire peut refuser.' }, { status: 403 });
      if (location.statut !== 'pending') return NextResponse.json({ error: 'Location non en attente.' }, { status: 400 });

      const { error } = await admin.from('compagnie_locations').update({
        statut: 'refused',
        cancelled_at: new Date().toISOString(),
        cancelled_by: 'locataire'
      }).eq('id', id);
      if (error) return NextResponse.json({ error: error.message }, { status: 400 });
      return NextResponse.json({ ok: true });
    }

    if (action === 'cancel') {
      if (!isLoueurPdg && !isLocatairePdg) return NextResponse.json({ error: 'Non autorisé.' }, { status: 403 });
      if (!['pending', 'active'].includes(location.statut)) return NextResponse.json({ error: 'Location non annulable.' }, { status: 400 });

      const { error } = await admin.from('compagnie_locations').update({
        statut: 'cancelled',
        cancelled_at: new Date().toISOString(),
        cancelled_by: isLoueurPdg ? 'loueur' : 'locataire',
        end_at: new Date().toISOString()
      }).eq('id', id);
      if (error) return NextResponse.json({ error: error.message }, { status: 400 });
      return NextResponse.json({ ok: true });
    }

    return NextResponse.json({ error: 'Action inconnue.' }, { status: 400 });
  } catch (e) {
    console.error('compagnies locations PATCH:', e);
    return NextResponse.json({ error: 'Erreur serveur' }, { status: 500 });
  }
}
