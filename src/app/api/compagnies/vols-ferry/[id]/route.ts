import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { NextResponse } from 'next/server';
import { calculerUsureFerry } from '@/lib/compagnie-utils';

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
    const { action, duree_minutes } = body;

    const admin = createAdminClient();
    const { data: vol } = await admin
      .from('vols_ferry')
      .select('*, avion:compagnie_avions(id, usure_percent)')
      .eq('id', id)
      .single();
    if (!vol) return NextResponse.json({ error: 'Vol ferry introuvable.' }, { status: 404 });

    // Vérifier autorisation
    const { data: compagnie } = await admin
      .from('compagnies')
      .select('pdg_id')
      .eq('id', vol.compagnie_id)
      .single();
    const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).single();
    const isPDG = compagnie?.pdg_id === user.id;
    const isAdmin = profile?.role === 'admin';
    const isPilote = vol.pilote_id === user.id;

    if (!isPDG && !isAdmin && !isPilote) {
      return NextResponse.json({ error: 'Non autorisé' }, { status: 403 });
    }

    if (action === 'cloturer') {
      if (vol.statut === 'completed') {
        return NextResponse.json({ error: 'Ce vol est déjà clôturé.' }, { status: 400 });
      }

      // Calculer l'usure (basée sur une distance estimée)
      const usure = calculerUsureFerry(500); // Distance fixe pour simplifier
      const avionActuel = vol.avion as { id: string; usure_percent: number };
      const nouvelleUsure = Math.max(0, avionActuel.usure_percent - usure);
      const statutAvion = nouvelleUsure === 0 ? 'bloque' : 'ground';

      // Déplacer l'avion et appliquer l'usure
      const { error: avionErr } = await admin
        .from('compagnie_avions')
        .update({
          aeroport_actuel: vol.aeroport_arrivee,
          usure_percent: nouvelleUsure,
          statut: statutAvion,
        })
        .eq('id', vol.avion_id);

      if (avionErr) return NextResponse.json({ error: avionErr.message }, { status: 400 });

      // Clôturer le vol
      const { error } = await admin
        .from('vols_ferry')
        .update({
          statut: 'completed',
          duree_minutes: duree_minutes || null,
          usure_appliquee: usure,
          completed_at: new Date().toISOString(),
        })
        .eq('id', id);

      if (error) return NextResponse.json({ error: error.message }, { status: 400 });
      return NextResponse.json({ ok: true, usure_appliquee: usure, nouvelle_usure: nouvelleUsure });
    }

    if (action === 'annuler') {
      if (vol.statut === 'completed') {
        return NextResponse.json({ error: 'Impossible d\'annuler un vol terminé.' }, { status: 400 });
      }

      // Remettre l'avion au sol
      await admin
        .from('compagnie_avions')
        .update({ statut: vol.debloque_pour_ferry ? 'bloque' : 'ground' })
        .eq('id', vol.avion_id);

      const { error } = await admin
        .from('vols_ferry')
        .update({ statut: 'cancelled' })
        .eq('id', id);

      if (error) return NextResponse.json({ error: error.message }, { status: 400 });
      return NextResponse.json({ ok: true });
    }

    return NextResponse.json({ error: 'Action invalide' }, { status: 400 });
  } catch (e) {
    console.error('PATCH compagnies/vols-ferry/[id]:', e);
    return NextResponse.json({ error: 'Erreur serveur' }, { status: 500 });
  }
}
