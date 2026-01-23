import { NextResponse, NextRequest } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';

// GET - Flotte d'une compagnie
export async function GET(req: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Non authentifié' }, { status: 401 });

    const { searchParams } = new URL(req.url);
    const compagnieId = searchParams.get('compagnie_id');

    const admin = createAdminClient();
    let query = admin.from('compagnie_flotte')
      .select('*, types_avion(id, nom, code_oaci, capacite_pax, capacite_cargo_kg), compagnies(nom)');

    if (compagnieId) {
      query = query.eq('compagnie_id', compagnieId);
    }

    const { data, error } = await query;
    if (error) return NextResponse.json({ error: error.message }, { status: 400 });

    // Calculer disponibilité (avions en vol)
    const flotteWithAvailability = await Promise.all((data || []).map(async (item) => {
      const { count: enVol } = await admin.from('plans_vol')
        .select('*', { count: 'exact', head: true })
        .eq('flotte_avion_id', item.id)
        .in('statut', ['depose', 'en_attente', 'accepte', 'en_cours', 'automonitoring', 'en_attente_cloture']);

      return {
        ...item,
        en_vol: enVol || 0,
        disponibles: item.quantite - (enVol || 0)
      };
    }));

    return NextResponse.json(flotteWithAvailability);
  } catch (e) {
    console.error('Compagnie flotte GET:', e);
    return NextResponse.json({ error: 'Erreur serveur' }, { status: 500 });
  }
}

// POST - Ajouter un avion à la flotte (admin ou PDG)
export async function POST(req: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Non authentifié' }, { status: 401 });

    const body = await req.json();
    const { compagnie_id, type_avion_id, quantite, nom_personnalise, capacite_pax_custom, capacite_cargo_custom } = body;

    if (!compagnie_id || !type_avion_id) {
      return NextResponse.json({ error: 'compagnie_id et type_avion_id requis' }, { status: 400 });
    }

    const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).single();
    const isAdmin = profile?.role === 'admin';

    // Vérifier si PDG
    const { data: compagnie } = await supabase.from('compagnies').select('pdg_id').eq('id', compagnie_id).single();
    const isPdg = compagnie?.pdg_id === user.id;

    if (!isAdmin && !isPdg) {
      return NextResponse.json({ error: 'Non autorisé' }, { status: 403 });
    }

    const admin = createAdminClient();
    const { data, error } = await admin.from('compagnie_flotte').insert({
      compagnie_id,
      type_avion_id,
      quantite: quantite || 1,
      nom_personnalise,
      capacite_pax_custom,
      capacite_cargo_custom
    }).select('*, types_avion(nom)').single();

    if (error) return NextResponse.json({ error: error.message }, { status: 400 });

    return NextResponse.json(data);
  } catch (e) {
    console.error('Compagnie flotte POST:', e);
    return NextResponse.json({ error: 'Erreur serveur' }, { status: 500 });
  }
}

// PATCH - Modifier quantité/nom (admin ou PDG)
export async function PATCH(req: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Non authentifié' }, { status: 401 });

    const body = await req.json();
    const { id, quantite, nom_personnalise, capacite_pax_custom, capacite_cargo_custom } = body;

    if (!id) return NextResponse.json({ error: 'id requis' }, { status: 400 });

    const admin = createAdminClient();
    
    // Vérifier accès
    const { data: flotte } = await admin.from('compagnie_flotte')
      .select('compagnie_id, compagnies(pdg_id)')
      .eq('id', id)
      .single();

    if (!flotte) return NextResponse.json({ error: 'Non trouvé' }, { status: 404 });

    const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).single();
    const isAdmin = profile?.role === 'admin';
    const compagniesData = flotte.compagnies;
    const compagnieObj = compagniesData ? (Array.isArray(compagniesData) ? compagniesData[0] : compagniesData) : null;
    const isPdg = (compagnieObj as { pdg_id: string | null } | null)?.pdg_id === user.id;

    if (!isAdmin && !isPdg) {
      return NextResponse.json({ error: 'Non autorisé' }, { status: 403 });
    }

    const updates: Record<string, unknown> = {};
    if (quantite !== undefined) updates.quantite = quantite;
    if (nom_personnalise !== undefined) updates.nom_personnalise = nom_personnalise;
    if (capacite_pax_custom !== undefined) updates.capacite_pax_custom = capacite_pax_custom;
    if (capacite_cargo_custom !== undefined) updates.capacite_cargo_custom = capacite_cargo_custom;

    const { data, error } = await admin.from('compagnie_flotte')
      .update(updates)
      .eq('id', id)
      .select()
      .single();

    if (error) return NextResponse.json({ error: error.message }, { status: 400 });

    return NextResponse.json(data);
  } catch (e) {
    console.error('Compagnie flotte PATCH:', e);
    return NextResponse.json({ error: 'Erreur serveur' }, { status: 500 });
  }
}

// DELETE - Retirer un avion de la flotte (admin uniquement)
export async function DELETE(req: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Non authentifié' }, { status: 401 });

    const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).single();
    if (profile?.role !== 'admin') return NextResponse.json({ error: 'Non autorisé' }, { status: 403 });

    const { searchParams } = new URL(req.url);
    const id = searchParams.get('id');

    if (!id) return NextResponse.json({ error: 'id requis' }, { status: 400 });

    const admin = createAdminClient();
    const { error } = await admin.from('compagnie_flotte').delete().eq('id', id);

    if (error) return NextResponse.json({ error: error.message }, { status: 400 });

    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error('Compagnie flotte DELETE:', e);
    return NextResponse.json({ error: 'Erreur serveur' }, { status: 500 });
  }
}
