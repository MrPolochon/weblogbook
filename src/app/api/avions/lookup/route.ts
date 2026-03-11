import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { NextResponse } from 'next/server';

export async function GET(request: Request) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Non autorisé' }, { status: 401 });

    const { searchParams } = new URL(request.url);
    const immat = searchParams.get('immatriculation')?.trim().toUpperCase();
    if (!immat) return NextResponse.json({ error: 'Immatriculation requise' }, { status: 400 });

    const admin = createAdminClient();

    // Chercher dans les avions de compagnie
    const { data: compAvion } = await admin.from('compagnie_avions')
      .select('id, compagnie_id, immatriculation, nom_bapteme, aeroport_actuel, statut, usure_percent, types_avion(id, nom, constructeur, code_oaci, capacite_pax, capacite_cargo_kg)')
      .ilike('immatriculation', immat)
      .maybeSingle();

    if (compAvion) {
      // Vérifier que l'user est PDG ou employé de la compagnie
      const { data: comp } = await admin.from('compagnies')
        .select('id, nom, code_oaci, pdg_id, prix_billet, prix_kg_cargo, pourcentage_salaire')
        .eq('id', compAvion.compagnie_id)
        .single();

      let authorized = comp?.pdg_id === user.id;
      if (!authorized) {
        const { data: emploi } = await admin.from('compagnie_employes')
          .select('id')
          .eq('pilote_id', user.id)
          .eq('compagnie_id', compAvion.compagnie_id)
          .maybeSingle();
        authorized = Boolean(emploi);
      }

      // Vérifier aussi les locations actives
      if (!authorized) {
        const nowIso = new Date().toISOString();
        const { data: loc } = await admin.from('compagnie_locations')
          .select('locataire_compagnie_id')
          .eq('avion_id', compAvion.id)
          .eq('statut', 'active')
          .lte('start_at', nowIso)
          .gte('end_at', nowIso);

        if (loc && loc.length > 0) {
          for (const l of loc) {
            const { data: locComp } = await admin.from('compagnies')
              .select('pdg_id').eq('id', l.locataire_compagnie_id).single();
            if (locComp?.pdg_id === user.id) { authorized = true; break; }
            const { data: locEmploi } = await admin.from('compagnie_employes')
              .select('id').eq('pilote_id', user.id).eq('compagnie_id', l.locataire_compagnie_id).maybeSingle();
            if (locEmploi) { authorized = true; break; }
          }
        }
      }

      if (!authorized) return NextResponse.json({ error: 'Cet avion ne vous appartient pas.' }, { status: 403 });

      const ta = Array.isArray(compAvion.types_avion) ? compAvion.types_avion[0] : compAvion.types_avion;
      return NextResponse.json({
        source: 'compagnie',
        compagnie_avion_id: compAvion.id,
        compagnie_id: compAvion.compagnie_id,
        compagnie_nom: comp?.nom || null,
        compagnie_code_oaci: comp?.code_oaci || null,
        immatriculation: compAvion.immatriculation,
        nom_bapteme: compAvion.nom_bapteme,
        aeroport_actuel: compAvion.aeroport_actuel,
        statut: compAvion.statut,
        usure_percent: compAvion.usure_percent,
        type_avion_nom: ta?.nom || null,
        type_avion_code_oaci: ta?.code_oaci || null,
        type_avion_constructeur: ta?.constructeur || null,
        capacite_pax: ta?.capacite_pax || 0,
        capacite_cargo_kg: ta?.capacite_cargo_kg || 0,
        prix_billet: comp?.prix_billet ?? 0,
        prix_kg_cargo: comp?.prix_kg_cargo ?? 0,
        pourcentage_salaire: comp?.pourcentage_salaire ?? 0,
      });
    }

    // Chercher dans l'inventaire personnel
    const { data: persoAvion } = await admin.from('inventaire_avions')
      .select('id, proprietaire_id, immatriculation, nom_personnalise, aeroport_actuel, statut, usure_percent, types_avion(id, nom, constructeur, code_oaci, capacite_pax, capacite_cargo_kg)')
      .ilike('immatriculation', immat)
      .maybeSingle();

    if (persoAvion) {
      if (persoAvion.proprietaire_id !== user.id) {
        return NextResponse.json({ error: 'Cet avion ne vous appartient pas.' }, { status: 403 });
      }
      const ta = Array.isArray(persoAvion.types_avion) ? persoAvion.types_avion[0] : persoAvion.types_avion;
      return NextResponse.json({
        source: 'personnel',
        inventaire_avion_id: persoAvion.id,
        immatriculation: persoAvion.immatriculation,
        nom_personnalise: persoAvion.nom_personnalise,
        aeroport_actuel: persoAvion.aeroport_actuel,
        statut: persoAvion.statut,
        usure_percent: persoAvion.usure_percent,
        type_avion_nom: ta?.nom || null,
        type_avion_code_oaci: ta?.code_oaci || null,
        type_avion_constructeur: ta?.constructeur || null,
        capacite_pax: ta?.capacite_pax || 0,
        capacite_cargo_kg: ta?.capacite_cargo_kg || 0,
      });
    }

    return NextResponse.json({ error: 'Aucun avion trouvé avec cette immatriculation.' }, { status: 404 });
  } catch (e) {
    console.error('avions/lookup:', e);
    return NextResponse.json({ error: 'Erreur serveur' }, { status: 500 });
  }
}
