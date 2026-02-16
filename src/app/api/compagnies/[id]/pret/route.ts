import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { NextResponse, NextRequest } from 'next/server';
import { OPTIONS_PRETS, calculerMontantTotalPret, TAUX_PRELEVEMENT_PRET } from '@/lib/compagnie-utils';

// PATCH - Rembourser manuellement une partie du prêt
export async function PATCH(
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

    if (!montant || montant <= 0) {
      return NextResponse.json({ error: 'Montant invalide' }, { status: 400 });
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
      return NextResponse.json({ error: 'Seul le PDG peut rembourser le prêt' }, { status: 403 });
    }

    // Récupérer le prêt actif
    const { data: pret } = await admin
      .from('prets_bancaires')
      .select('*')
      .eq('compagnie_id', id)
      .eq('statut', 'actif')
      .maybeSingle();

    if (!pret) {
      return NextResponse.json({ error: 'Aucun prêt actif à rembourser' }, { status: 404 });
    }

    const resteARembourser = pret.montant_total_du - pret.montant_rembourse;
    const montantEffectif = Math.min(montant, resteARembourser);

    if (montantEffectif <= 0) {
      return NextResponse.json({ error: 'Le prêt est déjà entièrement remboursé' }, { status: 400 });
    }

    // Vérifier le solde du compte de la compagnie
    const { data: compteCompagnie } = await admin
      .from('felitz_comptes')
      .select('id, solde')
      .eq('compagnie_id', id)
      .eq('type', 'entreprise')
      .single();

    if (!compteCompagnie) {
      return NextResponse.json({ error: 'Compte de la compagnie introuvable' }, { status: 404 });
    }

    if (compteCompagnie.solde < montantEffectif) {
      return NextResponse.json({ 
        error: `Solde insuffisant. Disponible: ${compteCompagnie.solde.toLocaleString('fr-FR')} F$, requis: ${montantEffectif.toLocaleString('fr-FR')} F$` 
      }, { status: 400 });
    }

    // Débiter le compte avec vérification atomique
    const { data: debitResult, error: debitError } = await admin
      .from('felitz_comptes')
      .update({ solde: compteCompagnie.solde - montantEffectif })
      .eq('id', compteCompagnie.id)
      .gte('solde', montantEffectif)
      .select('id');

    if (debitError || !debitResult || debitResult.length === 0) {
      return NextResponse.json({ error: 'Solde insuffisant ou compte modifié' }, { status: 400 });
    }

    // Mettre à jour le prêt
    const nouveauMontantRembourse = pret.montant_rembourse + montantEffectif;
    const pretRembourse = nouveauMontantRembourse >= pret.montant_total_du;

    const { error: updateError } = await admin
      .from('prets_bancaires')
      .update({
        montant_rembourse: nouveauMontantRembourse,
        ...(pretRembourse && {
          statut: 'rembourse',
          rembourse_at: new Date().toISOString(),
        }),
      })
      .eq('id', pret.id);

    if (updateError) {
      // Rollback: rembourser le compte
      await admin.from('felitz_comptes')
        .update({ solde: compteCompagnie.solde })
        .eq('id', compteCompagnie.id);
      return NextResponse.json({ error: 'Erreur lors de la mise à jour du prêt' }, { status: 500 });
    }

    // Enregistrer la transaction
    await admin.from('felitz_transactions').insert({
      compte_id: compteCompagnie.id,
      type: 'debit',
      montant: montantEffectif,
      libelle: `Remboursement prêt bancaire — ${montantEffectif.toLocaleString('fr-FR')} F$`,
    });

    const nouveauReste = pret.montant_total_du - nouveauMontantRembourse;

    return NextResponse.json({
      ok: true,
      message: pretRembourse 
        ? `🎉 Prêt intégralement remboursé ! Félicitations !`
        : `✅ Remboursement de ${montantEffectif.toLocaleString('fr-FR')} F$ effectué. Reste à payer: ${nouveauReste.toLocaleString('fr-FR')} F$`,
      montantRembourse: montantEffectif,
      resteARembourser: nouveauReste,
      pretRembourse,
    });
  } catch (e) {
    console.error('PATCH pret compagnie:', e);
    return NextResponse.json({ error: 'Erreur serveur' }, { status: 500 });
  }
}

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
      .eq('type', 'entreprise')
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
    const libellePret = `Prêt bancaire - ${optionPret.montant.toLocaleString('fr-FR')} F$ à ${optionPret.tauxInteret}%`;
    await admin.from('felitz_transactions').insert({
      compte_id: compteCompagnie.id,
      type: 'credit',
      montant: optionPret.montant,
      libelle: libellePret,
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
