import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { NextResponse } from 'next/server';

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const compagnie_id = searchParams.get('compagnie_id');
    if (!compagnie_id) return NextResponse.json({ error: 'compagnie_id requis' }, { status: 400 });

    const admin = createAdminClient();
    
    // Charger les avions
    const { data: avions, error } = await admin
      .from('compagnie_avions')
      .select('*')
      .eq('compagnie_id', compagnie_id)
      .order('immatriculation');

    if (error) return NextResponse.json({ error: error.message }, { status: 400 });

    // Enrichir avec les types d'avion
    const avionsEnrichis = await Promise.all((avions || []).map(async (avion) => {
      let types_avion = null;
      if (avion.type_avion_id) {
        const { data: typeData } = await admin
          .from('types_avion')
          .select('id, nom, constructeur')
          .eq('id', avion.type_avion_id)
          .single();
        types_avion = typeData;
      }
      return { ...avion, types_avion };
    }));

    return NextResponse.json(avionsEnrichis);
  } catch (e) {
    console.error('GET compagnies/avions:', e);
    return NextResponse.json({ error: 'Erreur serveur' }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Non autorisé' }, { status: 401 });

    const body = await request.json();
    const { compagnie_id, type_avion_id, immatriculation, nom_bapteme, aeroport_initial } = body;
    const immat = String(immatriculation || '').trim().toUpperCase();

    if (!compagnie_id || !type_avion_id || !immat) {
      return NextResponse.json({ error: 'compagnie_id, type_avion_id et immatriculation requis' }, { status: 400 });
    }

    const admin = createAdminClient();

    // Vérifier que l'utilisateur est PDG ou admin
    const { data: compagnie } = await admin
      .from('compagnies')
      .select('id, pdg_id')
      .eq('id', compagnie_id)
      .single();
    
    if (!compagnie) return NextResponse.json({ error: 'Compagnie introuvable' }, { status: 404 });
    
    const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).single();
    if (compagnie.pdg_id !== user.id && profile?.role !== 'admin') {
      return NextResponse.json({ error: 'Seul le PDG peut gérer les avions' }, { status: 403 });
    }

    // Trouver le hub principal pour l'aéroport initial
    let aeroportActuel = aeroport_initial?.trim().toUpperCase();
    if (!aeroportActuel) {
      const { data: hubPrincipal } = await admin
        .from('compagnie_hubs')
        .select('aeroport_code')
        .eq('compagnie_id', compagnie_id)
        .eq('est_hub_principal', true)
        .maybeSingle();
      aeroportActuel = hubPrincipal?.aeroport_code || 'IRFD';
    }

    const { data: avion, error } = await admin
      .from('compagnie_avions')
      .insert({
        compagnie_id,
        type_avion_id,
        immatriculation: immat,
        nom_bapteme: nom_bapteme?.trim() || null,
        aeroport_actuel: aeroportActuel,
        usure_percent: 100,
        statut: 'ground',
      })
      .select('id')
      .single();

    if (error) {
      if (error.code === '23505') {
        return NextResponse.json({ error: 'Cette immatriculation existe déjà.' }, { status: 400 });
      }
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
    return NextResponse.json({ ok: true, id: avion.id });
  } catch (e) {
    console.error('POST compagnies/avions:', e);
    return NextResponse.json({ error: 'Erreur serveur' }, { status: 500 });
  }
}
