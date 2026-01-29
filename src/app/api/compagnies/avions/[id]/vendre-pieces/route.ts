import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { NextResponse } from 'next/server';

// Montant récupéré pour la vente des pièces détachées
const PRIX_PIECES_MIN = 5_000;
const PRIX_PIECES_MAX = 15_000;

// POST - Vendre les pièces détachées d'un avion détruit
export async function POST(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Non autorisé' }, { status: 401 });

    const admin = createAdminClient();

    // Récupérer l'avion
    const { data: avion } = await admin
      .from('compagnie_avions')
      .select('id, compagnie_id, immatriculation, nom_bapteme, detruit, detruit_raison')
      .eq('id', id)
      .single();

    if (!avion) {
      return NextResponse.json({ error: 'Avion introuvable' }, { status: 404 });
    }

    // Vérifier que l'avion est bien détruit
    if (!avion.detruit) {
      return NextResponse.json({ error: 'Seul un avion détruit peut être vendu en pièces détachées' }, { status: 400 });
    }

    // Vérifier que l'utilisateur est PDG ou admin
    const { data: compagnie } = await admin
      .from('compagnies')
      .select('id, pdg_id, nom')
      .eq('id', avion.compagnie_id)
      .single();

    if (!compagnie) {
      return NextResponse.json({ error: 'Compagnie introuvable' }, { status: 404 });
    }

    const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).single();
    const isAdmin = profile?.role === 'admin';
    const isPdg = compagnie.pdg_id === user.id;

    if (!isPdg && !isAdmin) {
      return NextResponse.json({ error: 'Seul le PDG peut vendre les pièces détachées' }, { status: 403 });
    }

    // Calculer le montant récupéré (aléatoire entre min et max)
    const montant = Math.floor(Math.random() * (PRIX_PIECES_MAX - PRIX_PIECES_MIN + 1)) + PRIX_PIECES_MIN;

    // Récupérer le compte de la compagnie
    const { data: compteCompagnie } = await admin
      .from('felitz_comptes')
      .select('id, solde')
      .eq('compagnie_id', avion.compagnie_id)
      .eq('type', 'entreprise')
      .single();

    if (!compteCompagnie) {
      return NextResponse.json({ error: 'Compte de la compagnie introuvable' }, { status: 404 });
    }

    // Créditer le compte de la compagnie
    const { error: creditError } = await admin
      .from('felitz_comptes')
      .update({ solde: compteCompagnie.solde + montant })
      .eq('id', compteCompagnie.id);

    if (creditError) {
      return NextResponse.json({ error: 'Erreur lors du crédit' }, { status: 500 });
    }

    // Enregistrer la transaction
    await admin.from('felitz_transactions').insert({
      compte_id: compteCompagnie.id,
      type: 'credit',
      montant: montant,
      description: `Vente pièces détachées ${avion.immatriculation}${avion.nom_bapteme ? ` "${avion.nom_bapteme}"` : ''}`,
      reference: `SCRAP-${avion.id.slice(0, 8)}`,
    });

    // Supprimer l'avion de la base de données
    const { error: deleteError } = await admin
      .from('compagnie_avions')
      .delete()
      .eq('id', id);

    if (deleteError) {
      // Rollback du crédit si échec de suppression
      await admin
        .from('felitz_comptes')
        .update({ solde: compteCompagnie.solde })
        .eq('id', compteCompagnie.id);
      return NextResponse.json({ error: 'Erreur lors de la suppression de l\'avion' }, { status: 500 });
    }

    return NextResponse.json({
      ok: true,
      message: `🔧 L'épave de ${avion.immatriculation}${avion.nom_bapteme ? ` "${avion.nom_bapteme}"` : ''} a été vendue en pièces détachées pour ${montant.toLocaleString('fr-FR')} F$.`,
      montant: montant,
    });
  } catch (e) {
    console.error('Vendre pièces avion détruit:', e);
    return NextResponse.json({ error: 'Erreur serveur' }, { status: 500 });
  }
}
