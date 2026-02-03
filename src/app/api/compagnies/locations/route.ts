import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const compagnie_id = searchParams.get('compagnie_id');
    if (!compagnie_id) return NextResponse.json({ error: 'compagnie_id requis' }, { status: 400 });

    const admin = createAdminClient();
    const { data, error } = await admin
      .from('compagnie_locations')
      .select('*')
      .or(`loueur_compagnie_id.eq.${compagnie_id},locataire_compagnie_id.eq.${compagnie_id}`)
      .order('created_at', { ascending: false });

    if (error) return NextResponse.json({ error: error.message }, { status: 400 });
    return NextResponse.json(data || []);
  } catch (e) {
    console.error('compagnies locations GET:', e);
    return NextResponse.json({ error: 'Erreur serveur' }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Non autorisé' }, { status: 401 });

    const body = await request.json();
    const { avion_id, locataire_compagnie_id, prix_journalier, pourcentage_revenu_loueur, duree_jours } = body;

    if (!avion_id || !locataire_compagnie_id || !prix_journalier || !pourcentage_revenu_loueur || !duree_jours) {
      return NextResponse.json({ error: 'Champs requis manquants.' }, { status: 400 });
    }

    const admin = createAdminClient();

    const { data: avion } = await admin
      .from('compagnie_avions')
      .select('id, compagnie_id, statut')
      .eq('id', avion_id)
      .single();
    if (!avion) return NextResponse.json({ error: 'Avion introuvable.' }, { status: 404 });
    if (avion.statut === 'in_flight') return NextResponse.json({ error: 'Avion en vol.' }, { status: 400 });

    const { data: compagnieLoueur } = await admin
      .from('compagnies')
      .select('id, pdg_id, nom')
      .eq('id', avion.compagnie_id)
      .single();
    if (!compagnieLoueur) return NextResponse.json({ error: 'Compagnie loueur introuvable.' }, { status: 404 });

    if (compagnieLoueur.pdg_id !== user.id) {
      return NextResponse.json({ error: 'Seul le PDG peut proposer une location.' }, { status: 403 });
    }

    if (compagnieLoueur.id === locataire_compagnie_id) {
      return NextResponse.json({ error: 'Compagnie locataire invalide.' }, { status: 400 });
    }

    const { data: locataire } = await admin
      .from('compagnies')
      .select('id, pdg_id, nom')
      .eq('id', locataire_compagnie_id)
      .single();
    if (!locataire) return NextResponse.json({ error: 'Compagnie locataire introuvable.' }, { status: 404 });

    const { count: existingActive } = await admin
      .from('compagnie_locations')
      .select('*', { count: 'exact', head: true })
      .eq('avion_id', avion_id)
      .in('statut', ['pending', 'active']);
    if (existingActive && existingActive > 0) {
      return NextResponse.json({ error: 'Cet avion est déjà en location ou en attente.' }, { status: 400 });
    }

    const { data: location, error } = await admin
      .from('compagnie_locations')
      .insert({
        avion_id,
        loueur_compagnie_id: compagnieLoueur.id,
        locataire_compagnie_id,
        prix_journalier: parseInt(prix_journalier, 10),
        pourcentage_revenu_loueur: parseInt(pourcentage_revenu_loueur, 10),
        duree_jours: parseInt(duree_jours, 10),
        statut: 'pending'
      })
      .select()
      .single();

    if (error) return NextResponse.json({ error: error.message }, { status: 400 });

    if (locataire.pdg_id) {
      await admin.from('messages').insert({
        destinataire_id: locataire.pdg_id,
        expediteur_id: user.id,
        titre: `Demande de location d'avion (${compagnieLoueur.nom})`,
        contenu: `La compagnie ${compagnieLoueur.nom} propose une location.\n\nPrix/jour: ${parseInt(prix_journalier, 10).toLocaleString('fr-FR')} F$\nDurée: ${parseInt(duree_jours, 10)} jours\nPart de revenu loueur: ${parseInt(pourcentage_revenu_loueur, 10)}%`,
        type_message: 'location_avion'
      });
    }

    return NextResponse.json({ ok: true, location });
  } catch (e) {
    console.error('compagnies locations POST:', e);
    return NextResponse.json({ error: 'Erreur serveur' }, { status: 500 });
  }
}
