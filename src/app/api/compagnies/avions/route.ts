import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { NextResponse } from 'next/server';

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const compagnie_id = searchParams.get('compagnie_id');
    if (!compagnie_id) return NextResponse.json({ error: 'compagnie_id requis' }, { status: 400 });

    const admin = createAdminClient();
    
    const nowIso = new Date().toISOString();

    // Charger les locations actives (loueur ou locataire)
    const { data: locations } = await admin
      .from('compagnie_locations')
      .select('id, avion_id, loueur_compagnie_id, locataire_compagnie_id, prix_journalier, pourcentage_revenu_loueur, start_at, end_at, statut')
      .or(`loueur_compagnie_id.eq.${compagnie_id},locataire_compagnie_id.eq.${compagnie_id}`)
      .eq('statut', 'active')
      .lte('start_at', nowIso)
      .gte('end_at', nowIso);

    const leasedOut = (locations || []).filter((l) => l.loueur_compagnie_id === compagnie_id);
    const leasedIn = (locations || []).filter((l) => l.locataire_compagnie_id === compagnie_id);
    const leasedOutIds = new Set(leasedOut.map((l) => l.avion_id));
    const leasedInIds = new Set(leasedIn.map((l) => l.avion_id));

    // Charger les avions possédés par la compagnie
    const { data: avions, error } = await admin
      .from('compagnie_avions')
      .select('*')
      .eq('compagnie_id', compagnie_id)
      .order('immatriculation');

    if (error) return NextResponse.json({ error: error.message }, { status: 400 });

    // Charger les avions loués à la compagnie (locataire)
    let avionsLoues: any[] = [];
    if (leasedInIds.size > 0) {
      const { data: loues } = await admin
        .from('compagnie_avions')
        .select('*')
        .in('id', Array.from(leasedInIds));
      avionsLoues = loues || [];
    }

    // Enrichir avec les types d'avion
    const avionsEnrichis = await Promise.all(([...(avions || []), ...avionsLoues]).map(async (avion) => {
      let types_avion = null;
      if (avion.type_avion_id) {
        const { data: typeData } = await admin
          .from('types_avion')
          .select('id, nom, constructeur')
          .eq('id', avion.type_avion_id)
          .single();
        types_avion = typeData;
      }
      const location =
        leasedOutIds.has(avion.id)
          ? leasedOut.find((l) => l.avion_id === avion.id)
          : leasedInIds.has(avion.id)
            ? leasedIn.find((l) => l.avion_id === avion.id)
            : null;
      const location_status = leasedOutIds.has(avion.id)
        ? 'leased_out'
        : leasedInIds.has(avion.id)
          ? 'leased_in'
          : null;
      return {
        ...avion,
        types_avion,
        location_status,
        location_id: location?.id || null,
        location_loueur_compagnie_id: location?.loueur_compagnie_id || null,
        location_locataire_compagnie_id: location?.locataire_compagnie_id || null,
        location_prix_journalier: location?.prix_journalier || null,
        location_pourcentage_revenu_loueur: location?.pourcentage_revenu_loueur || null,
      };
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
