import { NextResponse, NextRequest } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';

// GET - Inventaire personnel d'avions
export async function GET(req: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Non authentifié' }, { status: 401 });

    const { searchParams } = new URL(req.url);
    const userId = searchParams.get('user_id');

    const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).single();
    const isAdmin = profile?.role === 'admin';

    const admin = createAdminClient();
    let query = admin.from('inventaire_avions')
      .select('*, types_avion(id, nom, code_oaci, capacite_pax, capacite_cargo_kg)');

    if (isAdmin && userId) {
      query = query.eq('proprietaire_id', userId);
    } else {
      query = query.eq('proprietaire_id', user.id);
    }

    const { data, error } = await query.order('created_at', { ascending: false });
    if (error) return NextResponse.json({ error: error.message }, { status: 400 });

    // Vérifier disponibilité (pas en vol)
    const inventoryWithAvailability = await Promise.all((data || []).map(async (item) => {
      const { count: enVol } = await admin.from('plans_vol')
        .select('*', { count: 'exact', head: true })
        .eq('inventaire_avion_id', item.id)
        .in('statut', ['depose', 'en_attente', 'accepte', 'en_cours', 'automonitoring', 'en_attente_cloture']);

      return {
        ...item,
        en_vol: (enVol || 0) > 0,
        disponible: (enVol || 0) === 0
      };
    }));

    return NextResponse.json(inventoryWithAvailability);
  } catch (e) {
    console.error('Inventaire GET:', e);
    return NextResponse.json({ error: 'Erreur serveur' }, { status: 500 });
  }
}

// PATCH - Renommer un avion
export async function PATCH(req: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Non authentifié' }, { status: 401 });

    const body = await req.json();
    const { id, nom_personnalise } = body;

    if (!id) return NextResponse.json({ error: 'id requis' }, { status: 400 });

    const admin = createAdminClient();
    
    // Vérifier propriété
    const { data: avion } = await admin.from('inventaire_avions')
      .select('proprietaire_id')
      .eq('id', id)
      .single();

    if (!avion) return NextResponse.json({ error: 'Non trouvé' }, { status: 404 });

    const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).single();
    const isAdmin = profile?.role === 'admin';

    if (!isAdmin && avion.proprietaire_id !== user.id) {
      return NextResponse.json({ error: 'Non autorisé' }, { status: 403 });
    }

    const { data, error } = await admin.from('inventaire_avions')
      .update({ nom_personnalise })
      .eq('id', id)
      .select()
      .single();

    if (error) return NextResponse.json({ error: error.message }, { status: 400 });

    return NextResponse.json(data);
  } catch (e) {
    console.error('Inventaire PATCH:', e);
    return NextResponse.json({ error: 'Erreur serveur' }, { status: 500 });
  }
}
