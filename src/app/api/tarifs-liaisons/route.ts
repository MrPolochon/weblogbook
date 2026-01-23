import { NextResponse, NextRequest } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';

// GET - Liste des tarifs pour une compagnie
export async function GET(req: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Non authentifié' }, { status: 401 });

    const { searchParams } = new URL(req.url);
    const compagnieId = searchParams.get('compagnie_id');

    if (!compagnieId) {
      return NextResponse.json({ error: 'compagnie_id requis' }, { status: 400 });
    }

    const admin = createAdminClient();
    const { data, error } = await admin
      .from('tarifs_liaisons')
      .select('*')
      .eq('compagnie_id', compagnieId)
      .order('aeroport_depart');

    if (error) return NextResponse.json({ error: error.message }, { status: 400 });

    return NextResponse.json(data);
  } catch (e) {
    console.error('Tarifs liaisons GET:', e);
    return NextResponse.json({ error: 'Erreur serveur' }, { status: 500 });
  }
}

// POST - Créer ou modifier un tarif
export async function POST(req: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Non authentifié' }, { status: 401 });

    const body = await req.json();
    const { compagnie_id, aeroport_depart, aeroport_arrivee, prix_billet, bidirectionnel } = body;

    if (!compagnie_id || !aeroport_depart || !aeroport_arrivee) {
      return NextResponse.json({ error: 'Données incomplètes' }, { status: 400 });
    }

    // Vérifier que l'utilisateur est PDG de cette compagnie
    const admin = createAdminClient();
    const { data: compagnie } = await admin
      .from('compagnies')
      .select('pdg_id')
      .eq('id', compagnie_id)
      .single();

    if (!compagnie || compagnie.pdg_id !== user.id) {
      // Vérifier si admin
      const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).single();
      if (profile?.role !== 'admin') {
        return NextResponse.json({ error: 'Non autorisé' }, { status: 403 });
      }
    }

    // Upsert le tarif principal
    const { data: tarif1, error: error1 } = await admin
      .from('tarifs_liaisons')
      .upsert({
        compagnie_id,
        aeroport_depart,
        aeroport_arrivee,
        prix_billet: prix_billet || 100,
        bidirectionnel: bidirectionnel || false,
      }, { onConflict: 'compagnie_id,aeroport_depart,aeroport_arrivee' })
      .select()
      .single();

    if (error1) return NextResponse.json({ error: error1.message }, { status: 400 });

    // Si bidirectionnel, créer/mettre à jour le tarif inverse
    if (bidirectionnel) {
      await admin
        .from('tarifs_liaisons')
        .upsert({
          compagnie_id,
          aeroport_depart: aeroport_arrivee,
          aeroport_arrivee: aeroport_depart,
          prix_billet: prix_billet || 100,
          bidirectionnel: true,
        }, { onConflict: 'compagnie_id,aeroport_depart,aeroport_arrivee' });
    }

    return NextResponse.json(tarif1);
  } catch (e) {
    console.error('Tarifs liaisons POST:', e);
    return NextResponse.json({ error: 'Erreur serveur' }, { status: 500 });
  }
}

// DELETE - Supprimer un tarif
export async function DELETE(req: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Non authentifié' }, { status: 401 });

    const { searchParams } = new URL(req.url);
    const id = searchParams.get('id');
    const deleteBoth = searchParams.get('delete_both') === 'true';

    if (!id) return NextResponse.json({ error: 'id requis' }, { status: 400 });

    const admin = createAdminClient();

    // Récupérer le tarif pour vérifier les droits
    const { data: tarif } = await admin
      .from('tarifs_liaisons')
      .select('*, compagnies(pdg_id)')
      .eq('id', id)
      .single();

    if (!tarif) return NextResponse.json({ error: 'Tarif non trouvé' }, { status: 404 });

    const compagnieData = tarif.compagnies as { pdg_id: string } | null;
    if (!compagnieData || compagnieData.pdg_id !== user.id) {
      const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).single();
      if (profile?.role !== 'admin') {
        return NextResponse.json({ error: 'Non autorisé' }, { status: 403 });
      }
    }

    // Si deleteBoth et bidirectionnel, supprimer aussi le tarif inverse
    if (deleteBoth && tarif.bidirectionnel) {
      await admin
        .from('tarifs_liaisons')
        .delete()
        .eq('compagnie_id', tarif.compagnie_id)
        .eq('aeroport_depart', tarif.aeroport_arrivee)
        .eq('aeroport_arrivee', tarif.aeroport_depart);
    }

    // Supprimer le tarif principal
    const { error } = await admin.from('tarifs_liaisons').delete().eq('id', id);
    if (error) return NextResponse.json({ error: error.message }, { status: 400 });

    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error('Tarifs liaisons DELETE:', e);
    return NextResponse.json({ error: 'Erreur serveur' }, { status: 500 });
  }
}
