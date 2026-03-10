import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { NextResponse, NextRequest } from 'next/server';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Non authentifié' }, { status: 401 });

    const { data: profile } = await supabase.from('profiles').select('role, ifsa').eq('id', user.id).single();
    if (!profile?.ifsa && profile?.role !== 'admin') {
      return NextResponse.json({ error: 'Accès réservé à l\'IFSA' }, { status: 403 });
    }

    const { searchParams } = new URL(req.url);
    const immat = searchParams.get('immatriculation')?.trim().toUpperCase();
    if (!immat || immat.length < 2) {
      return NextResponse.json({ error: 'Immatriculation requise (min 2 caractères)' }, { status: 400 });
    }

    const admin = createAdminClient();

    // 1) Chercher dans compagnie_avions
    const { data: compAvion } = await admin
      .from('compagnie_avions')
      .select(`
        id, immatriculation, nom_bapteme, usure_percent, aeroport_actuel, statut,
        detruit, detruit_at, detruit_raison, created_at, updated_at,
        compagnie_id, type_avion_id,
        types_avion:type_avion_id(id, nom, constructeur, prix),
        compagnies:compagnie_id(id, nom, pdg_id)
      `)
      .ilike('immatriculation', immat)
      .maybeSingle();

    // 2) Chercher dans inventaire_avions
    const { data: persAvion } = await admin
      .from('inventaire_avions')
      .select(`
        id, immatriculation, nom_personnalise, usure_percent, aeroport_actuel, statut,
        created_at, proprietaire_id, type_avion_id,
        types_avion:type_avion_id(id, nom, constructeur, prix),
        proprietaire:profiles!proprietaire_id(id, identifiant)
      `)
      .ilike('immatriculation', immat)
      .maybeSingle();

    if (!compAvion && !persAvion) {
      return NextResponse.json({ error: 'Aucun avion trouvé avec cette immatriculation' }, { status: 404 });
    }

    const isCompagnie = !!compAvion;
    const avionId = isCompagnie ? compAvion.id : persAvion!.id;

    // Normaliser les jointures Supabase
    const typeAvionRaw = isCompagnie ? compAvion.types_avion : persAvion!.types_avion;
    const typeAvion = (Array.isArray(typeAvionRaw) ? typeAvionRaw[0] : typeAvionRaw) as { id: string; nom: string; constructeur: string; prix: number } | null;

    // Info propriétaire
    let proprietaire: { type: 'compagnie' | 'personnel'; nom: string; id: string } | null = null;
    if (isCompagnie) {
      const compRaw = compAvion.compagnies;
      const comp = (Array.isArray(compRaw) ? compRaw[0] : compRaw) as { id: string; nom: string; pdg_id: string | null } | null;
      if (comp) {
        proprietaire = { type: 'compagnie', nom: comp.nom, id: comp.id };
      }
    } else {
      const propRaw = persAvion!.proprietaire;
      const prop = (Array.isArray(propRaw) ? propRaw[0] : propRaw) as { id: string; identifiant: string } | null;
      if (prop) {
        proprietaire = { type: 'personnel', nom: prop.identifiant, id: prop.id };
      }
    }

    // 3) Plans de vol liés à cet avion
    const planFilter = isCompagnie ? 'compagnie_avion_id' : 'inventaire_avion_id';
    const { data: plansVol } = await admin
      .from('plans_vol')
      .select(`
        id, numero_vol, statut, aeroport_depart, aeroport_arrivee,
        type_vol, vol_commercial, vol_ferry, vol_militaire,
        heure_depart_estimee, heure_depart_reelle, heure_arrivee_estimee, heure_arrivee_reelle,
        duree_estimee_minutes, callsign, nature_transport,
        created_at, updated_at,
        pilote:profiles!plans_vol_pilote_id_fkey(id, identifiant),
        copilote:profiles!plans_vol_copilote_id_fkey(id, identifiant),
        compagnie:compagnies!plans_vol_compagnie_id_fkey(id, nom)
      `)
      .eq(planFilter, avionId)
      .order('created_at', { ascending: false })
      .limit(200);

    // Séparer plans non clôturés
    const plansNonClotures = (plansVol || []).filter(p =>
      !['cloture', 'refuse', 'annule'].includes(p.statut)
    );
    const plansClotures = (plansVol || []).filter(p =>
      ['cloture'].includes(p.statut)
    );

    // 4) Calculer heures de vol depuis les plans clôturés
    let totalMinutesVol = 0;
    for (const p of plansClotures) {
      if (p.heure_depart_reelle && p.heure_arrivee_reelle) {
        const dep = new Date(p.heure_depart_reelle).getTime();
        const arr = new Date(p.heure_arrivee_reelle).getTime();
        if (arr > dep) {
          totalMinutesVol += Math.round((arr - dep) / 60000);
        }
      } else if (p.duree_estimee_minutes) {
        totalMinutesVol += p.duree_estimee_minutes;
      }
    }

    // 5) Historique réparations (depuis transactions Felitz)
    let reparations: Array<{ id: string; libelle: string; montant: number; type: string; created_at: string }> = [];
    if (isCompagnie && compAvion.immatriculation) {
      const { data: txReparations } = await admin
        .from('felitz_transactions')
        .select('id, libelle, montant, type, created_at')
        .or(`libelle.ilike.%${compAvion.immatriculation}%répar%,libelle.ilike.%répar%${compAvion.immatriculation}%,libelle.ilike.%${compAvion.immatriculation}%technicien%,libelle.ilike.%technicien%${compAvion.immatriculation}%,libelle.ilike.%${compAvion.immatriculation}%maintenance%,libelle.ilike.%${compAvion.immatriculation}%détruit%,libelle.ilike.%tentative%${compAvion.immatriculation}%`)
        .order('created_at', { ascending: false })
        .limit(50);
      reparations = txReparations || [];
    }

    // Construire la réponse
    const avionData = isCompagnie ? {
      id: compAvion.id,
      immatriculation: compAvion.immatriculation,
      nom_bapteme: compAvion.nom_bapteme,
      usure_percent: compAvion.usure_percent,
      aeroport_actuel: compAvion.aeroport_actuel,
      statut: compAvion.statut,
      detruit: compAvion.detruit || false,
      detruit_at: compAvion.detruit_at || null,
      detruit_raison: compAvion.detruit_raison || null,
      created_at: compAvion.created_at,
      updated_at: compAvion.updated_at,
      source: 'compagnie' as const,
    } : {
      id: persAvion!.id,
      immatriculation: persAvion!.immatriculation,
      nom_bapteme: persAvion!.nom_personnalise,
      usure_percent: persAvion!.usure_percent ?? 100,
      aeroport_actuel: persAvion!.aeroport_actuel || 'IRFD',
      statut: persAvion!.statut || 'ground',
      detruit: false,
      detruit_at: null,
      detruit_raison: null,
      created_at: persAvion!.created_at,
      updated_at: null,
      source: 'personnel' as const,
    };

    return NextResponse.json({
      avion: avionData,
      typeAvion: typeAvion,
      proprietaire,
      plansVol: (plansVol || []).map(p => ({
        ...p,
        pilote: Array.isArray(p.pilote) ? p.pilote[0] : p.pilote,
        copilote: Array.isArray(p.copilote) ? p.copilote[0] : p.copilote,
        compagnie: Array.isArray(p.compagnie) ? p.compagnie[0] : p.compagnie,
      })),
      plansNonClotures: plansNonClotures.map(p => ({
        ...p,
        pilote: Array.isArray(p.pilote) ? p.pilote[0] : p.pilote,
        copilote: Array.isArray(p.copilote) ? p.copilote[0] : p.copilote,
        compagnie: Array.isArray(p.compagnie) ? p.compagnie[0] : p.compagnie,
      })),
      totalMinutesVol,
      reparations,
    });
  } catch (e) {
    console.error('IFSA avion GET:', e);
    return NextResponse.json({ error: 'Erreur serveur' }, { status: 500 });
  }
}
