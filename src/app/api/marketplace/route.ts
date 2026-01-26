import { NextResponse, NextRequest } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';

// GET - Liste des avions disponibles à l'achat
export async function GET() {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Non authentifié' }, { status: 401 });

    const admin = createAdminClient();
    const { data, error } = await admin.from('types_avion')
      .select('*')
      .gt('prix', 0)
      .order('prix', { ascending: true });

    if (error) return NextResponse.json({ error: error.message }, { status: 400 });

    return NextResponse.json(data);
  } catch (e) {
    console.error('Marketplace GET:', e);
    return NextResponse.json({ error: 'Erreur serveur' }, { status: 500 });
  }
}

// POST - Acheter un avion
export async function POST(req: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Non authentifié' }, { status: 401 });

    const body = await req.json();
    const { type_avion_id, pour_compagnie_id, nom_personnalise } = body;

    if (!type_avion_id) {
      return NextResponse.json({ error: 'type_avion_id requis' }, { status: 400 });
    }

    const admin = createAdminClient();

    // Récupérer le prix de l'avion
    const { data: avion } = await admin.from('types_avion')
      .select('id, nom, prix')
      .eq('id', type_avion_id)
      .single();

    if (!avion || avion.prix <= 0) {
      return NextResponse.json({ error: 'Avion non disponible à la vente' }, { status: 400 });
    }

    let compteId: string;
    let compagnieNom: string | null = null;

    if (pour_compagnie_id) {
      // Achat pour une compagnie - vérifier que l'utilisateur est PDG
      const { data: compagnie } = await admin.from('compagnies')
        .select('id, nom, pdg_id')
        .eq('id', pour_compagnie_id)
        .single();

      if (!compagnie) {
        return NextResponse.json({ error: 'Compagnie introuvable' }, { status: 404 });
      }

      if (compagnie.pdg_id !== user.id) {
        return NextResponse.json({ error: 'Seul le PDG peut acheter pour la compagnie' }, { status: 403 });
      }

      // Récupérer le compte entreprise
      const { data: compteEntreprise } = await admin.from('felitz_comptes')
        .select('id, solde')
        .eq('compagnie_id', pour_compagnie_id)
        .eq('type', 'entreprise')
        .single();

      if (!compteEntreprise) {
        return NextResponse.json({ error: 'Compte entreprise introuvable' }, { status: 404 });
      }

      if (compteEntreprise.solde < avion.prix) {
        return NextResponse.json({ error: 'Solde entreprise insuffisant' }, { status: 400 });
      }

      compteId = compteEntreprise.id;
      compagnieNom = compagnie.nom;

      // Débiter
      await admin.from('felitz_comptes')
        .update({ solde: compteEntreprise.solde - avion.prix })
        .eq('id', compteId);

      // Générer une immatriculation unique
      const { data: immatData } = await admin.rpc('generer_immatriculation', { prefixe: 'F-' });
      const immatriculation = immatData || `F-${Math.random().toString(36).substring(2, 6).toUpperCase()}`;

      // Trouver le hub principal pour l'aéroport initial
      const { data: hubPrincipal } = await admin
        .from('compagnie_hubs')
        .select('aeroport_code')
        .eq('compagnie_id', pour_compagnie_id)
        .eq('est_hub_principal', true)
        .maybeSingle();
      const aeroportInitial = hubPrincipal?.aeroport_code || 'IRFD';

      // Créer l'avion individuel
      await admin.from('compagnie_avions').insert({
        compagnie_id: pour_compagnie_id,
        type_avion_id,
        immatriculation,
        nom_bapteme: nom_personnalise || null,
        aeroport_actuel: aeroportInitial,
        usure_percent: 100,
        statut: 'ground'
      });

      // Transaction
      await admin.from('felitz_transactions').insert({
        compte_id: compteId,
        type: 'debit',
        montant: avion.prix,
        libelle: `Achat ${avion.nom}`
      });

    } else {
      // Achat personnel
      const { data: comptePerso } = await admin.from('felitz_comptes')
        .select('id, solde')
        .eq('proprietaire_id', user.id)
        .eq('type', 'personnel')
        .single();

      if (!comptePerso) {
        return NextResponse.json({ error: 'Compte personnel introuvable' }, { status: 404 });
      }

      if (comptePerso.solde < avion.prix) {
        return NextResponse.json({ error: 'Solde insuffisant' }, { status: 400 });
      }

      compteId = comptePerso.id;

      // Débiter
      await admin.from('felitz_comptes')
        .update({ solde: comptePerso.solde - avion.prix })
        .eq('id', compteId);

      // Ajouter à l'inventaire personnel
      await admin.from('inventaire_avions').insert({
        proprietaire_id: user.id,
        type_avion_id,
        nom_personnalise
      });

      // Transaction
      await admin.from('felitz_transactions').insert({
        compte_id: compteId,
        type: 'debit',
        montant: avion.prix,
        libelle: `Achat ${avion.nom}`
      });
    }

    return NextResponse.json({ 
      ok: true, 
      message: pour_compagnie_id 
        ? `${avion.nom} ajouté à la flotte de ${compagnieNom}` 
        : `${avion.nom} ajouté à votre inventaire`
    });
  } catch (e) {
    console.error('Marketplace POST:', e);
    return NextResponse.json({ error: 'Erreur serveur' }, { status: 500 });
  }
}
