import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { NextResponse } from 'next/server';

// Coût de la tentative de réparation d'un avion détruit
const COUT_TENTATIVE_REPARATION = 1_000_000; // 1 million F$

// Probabilité de succès (0.5% = 0.005)
const PROBABILITE_SUCCES = 0.005;

// POST - Tenter de réparer un avion détruit
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
      .select('id, compagnie_id, immatriculation, detruit, detruit_raison')
      .eq('id', id)
      .single();

    if (!avion) {
      return NextResponse.json({ error: 'Avion introuvable' }, { status: 404 });
    }

    // Vérifier que l'avion est bien détruit
    if (!avion.detruit) {
      return NextResponse.json({ error: 'Cet avion n\'est pas détruit' }, { status: 400 });
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
      return NextResponse.json({ error: 'Seul le PDG peut tenter de réparer un avion détruit' }, { status: 403 });
    }

    // Vérifier le solde de la compagnie
    const { data: compteCompagnie } = await admin
      .from('felitz_comptes')
      .select('id, solde')
      .eq('compagnie_id', avion.compagnie_id)
      .eq('type', 'business')
      .single();

    if (!compteCompagnie || compteCompagnie.solde < COUT_TENTATIVE_REPARATION) {
      return NextResponse.json({ 
        error: `Solde insuffisant. La tentative de réparation coûte ${COUT_TENTATIVE_REPARATION.toLocaleString('fr-FR')} F$` 
      }, { status: 400 });
    }

    // Débiter le compte de la compagnie
    const { error: debitError } = await admin
      .from('felitz_comptes')
      .update({ solde: compteCompagnie.solde - COUT_TENTATIVE_REPARATION })
      .eq('id', compteCompagnie.id);

    if (debitError) {
      return NextResponse.json({ error: 'Erreur lors du paiement' }, { status: 500 });
    }

    // Enregistrer la transaction
    await admin.from('felitz_transactions').insert({
      compte_id: compteCompagnie.id,
      type: 'debit',
      montant: COUT_TENTATIVE_REPARATION,
      description: `Tentative de réparation avion détruit ${avion.immatriculation}`,
      reference: `REPAIR-ATTEMPT-${avion.id.slice(0, 8)}`,
    });

    // Tirer au sort : 0.5% de chance de succès
    const random = Math.random();
    const succes = random < PROBABILITE_SUCCES;

    if (succes) {
      // MIRACLE ! L'avion est réparé !
      await admin
        .from('compagnie_avions')
        .update({
          detruit: false,
          detruit_at: null,
          detruit_par_id: null,
          detruit_raison: null,
          usure_percent: 50, // Réparé mais pas neuf
          statut: 'ground',
        })
        .eq('id', id);

      return NextResponse.json({
        ok: true,
        succes: true,
        message: `🎉 MIRACLE ! L'avion ${avion.immatriculation} a été réparé contre toute attente ! Il est de retour avec 50% d'usure.`,
      });
    } else {
      // Échec (99.5% des cas)
      return NextResponse.json({
        ok: true,
        succes: false,
        message: `❌ La tentative de réparation de ${avion.immatriculation} a échoué. L'avion reste détruit. ${COUT_TENTATIVE_REPARATION.toLocaleString('fr-FR')} F$ perdus.`,
        probabilite: `${(PROBABILITE_SUCCES * 100).toFixed(1)}%`,
      });
    }
  } catch (e) {
    console.error('Tenter réparation avion détruit:', e);
    return NextResponse.json({ error: 'Erreur serveur' }, { status: 500 });
  }
}
