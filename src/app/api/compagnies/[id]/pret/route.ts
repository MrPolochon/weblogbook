import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { NextResponse, NextRequest } from 'next/server';
import { OPTIONS_PRETS, calculerMontantTotalPret, TAUX_PRELEVEMENT_PRET } from '@/lib/compagnie-utils';

// GET - Récupérer le prêt actif de la compagnie
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Non authentifié' }, { status: 401 });

    const admin = createAdminClient();

    // Vérifier que l'utilisateur est PDG ou admin
    const { data: compagnie } = await admin
      .from('compagnies')
      .select('id, pdg_id, nom')
      .eq('id', id)
      .single();

    if (!compagnie) {
      return NextResponse.json({ error: 'Compagnie introuvable' }, { status: 404 });
    }

    const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).single();
    const isAdmin = profile?.role === 'admin';
    const isPdg = compagnie.pdg_id === user.id;

    if (!isPdg && !isAdmin) {
      return NextResponse.json({ error: 'Accès réservé au PDG' }, { status: 403 });
    }

    // Récupérer le prêt actif
    const { data: pret } = await admin
      .from('prets_bancaires')
      .select('*')
      .eq('compagnie_id', id)
      .eq('statut', 'actif')
      .maybeSingle();

    // Récupérer l'historique des prêts remboursés
    const { data: historique } = await admin
      .from('prets_bancaires')
      .select('*')
      .eq('compagnie_id', id)
      .eq('statut', 'rembourse')
      .order('rembourse_at', { ascending: false })
      .limit(10);

    return NextResponse.json({
      pretActif: pret || null,
      historique: historique || [],
      optionsPrets: OPTIONS_PRETS,
      tauxPrelevement: TAUX_PRELEVEMENT_PRET,
    });
  } catch (e) {
    console.error('GET pret compagnie:', e);
    return NextResponse.json({ error: 'Erreur serveur' }, { status: 500 });
  }
}

// POST - Demander un nouveau prêt
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Non authentifié' }, { status: 401 });

    const body = await request.json();
    const { montant } = body;

    // Vérifier que le montant est valide
    const optionPret = OPTIONS_PRETS.find(p => p.montant === montant);
    if (!optionPret) {
      return NextResponse.json({ 
        error: `Montant invalide. Options disponibles: ${OPTIONS_PRETS.map(p => p.montant.toLocaleString('fr-FR')).join(', ')} F$` 
      }, { status: 400 });
    }

    const admin = createAdminClient();

    // Vérifier que l'utilisateur est PDG ou admin
    const { data: compagnie } = await admin
      .from('compagnies')
      .select('id, pdg_id, nom')
      .eq('id', id)
      .single();

    if (!compagnie) {
      return NextResponse.json({ error: 'Compagnie introuvable' }, { status: 404 });
    }

    const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).single();
    const isAdmin = profile?.role === 'admin';
    const isPdg = compagnie.pdg_id === user.id;

    if (!isPdg && !isAdmin) {
      return NextResponse.json({ error: 'Seul le PDG peut demander un prêt' }, { status: 403 });
    }

    // Vérifier qu'il n'y a pas déjà un prêt actif
    const { data: pretExistant } = await admin
      .from('prets_bancaires')
      .select('id, montant_emprunte, montant_total_du, montant_rembourse')
      .eq('compagnie_id', id)
      .eq('statut', 'actif')
      .maybeSingle();

    if (pretExistant) {
      const resteARembourser = pretExistant.montant_total_du - pretExistant.montant_rembourse;
      return NextResponse.json({ 
        error: `Un prêt est déjà en cours. Il reste ${resteARembourser.toLocaleString('fr-FR')} F$ à rembourser.` 
      }, { status: 400 });
    }

    // Calculer le montant total à rembourser
    const montantTotalDu = calculerMontantTotalPret(optionPret.montant, optionPret.tauxInteret);

    // Créer le prêt
    const { data: nouveauPret, error: pretError } = await admin
      .from('prets_bancaires')
      .insert({
        compagnie_id: id,
        demandeur_id: user.id,
        montant_emprunte: optionPret.montant,
        taux_interet: optionPret.tauxInteret,
        montant_total_du: montantTotalDu,
        montant_rembourse: 0,
        statut: 'actif',
      })
      .select()
      .single();

    if (pretError) {
      console.error('Erreur création prêt:', pretError);
      return NextResponse.json({ error: 'Erreur lors de la création du prêt' }, { status: 500 });
    }

    // Créditer le compte de la compagnie
    const { data: compteCompagnie } = await admin
      .from('felitz_comptes')
      .select('id, solde')
      .eq('compagnie_id', id)
      .eq('type', 'business')
      .single();

    if (!compteCompagnie) {
      // Rollback: supprimer le prêt créé
      await admin.from('prets_bancaires').delete().eq('id', nouveauPret.id);
      return NextResponse.json({ error: 'Compte de la compagnie introuvable' }, { status: 404 });
    }

    // Créditer le montant emprunté
    const { error: creditError } = await admin
      .from('felitz_comptes')
      .update({ solde: compteCompagnie.solde + optionPret.montant })
      .eq('id', compteCompagnie.id);

    if (creditError) {
      // Rollback
      await admin.from('prets_bancaires').delete().eq('id', nouveauPret.id);
      return NextResponse.json({ error: 'Erreur lors du crédit' }, { status: 500 });
    }

    // Enregistrer la transaction
    await admin.from('felitz_transactions').insert({
      compte_id: compteCompagnie.id,
      type: 'credit',
      montant: optionPret.montant,
      description: `Prêt bancaire - ${optionPret.montant.toLocaleString('fr-FR')} F$ à ${optionPret.tauxInteret}%`,
      reference: `LOAN-${nouveauPret.id.slice(0, 8)}`,
    });

    const interets = montantTotalDu - optionPret.montant;

    return NextResponse.json({
      ok: true,
      message: `💰 Prêt de ${optionPret.montant.toLocaleString('fr-FR')} F$ accordé ! Taux: ${optionPret.tauxInteret}%. À rembourser: ${montantTotalDu.toLocaleString('fr-FR')} F$ (dont ${interets.toLocaleString('fr-FR')} F$ d'intérêts). ${TAUX_PRELEVEMENT_PRET}% des revenus de vols seront prélevés automatiquement.`,
      pret: nouveauPret,
    });
  } catch (e) {
    console.error('POST pret compagnie:', e);
    return NextResponse.json({ error: 'Erreur serveur' }, { status: 500 });
  }
}
