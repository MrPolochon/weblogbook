import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { NextResponse } from 'next/server';

export async function POST(request: Request) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Non autorisé' }, { status: 401 });

    const body = await request.json();
    const { compte_emetteur_id, destinataire_vban, montant, libelle } = body;

    if (!compte_emetteur_id || !destinataire_vban || !montant) {
      return NextResponse.json({ error: 'Champs requis manquants' }, { status: 400 });
    }

    const montantNum = parseFloat(String(montant));
    if (isNaN(montantNum) || montantNum <= 0) {
      return NextResponse.json({ error: 'Montant invalide' }, { status: 400 });
    }

    const admin = createAdminClient();

    // Vérifier que le compte émetteur appartient à l'utilisateur
    const { data: compteEmetteur } = await admin
      .from('felitz_comptes')
      .select('id, solde, user_id')
      .eq('id', compte_emetteur_id)
      .single();

    if (!compteEmetteur) {
      return NextResponse.json({ error: 'Compte émetteur introuvable' }, { status: 404 });
    }

    if (compteEmetteur.user_id !== user.id) {
      return NextResponse.json({ error: 'Non autorisé' }, { status: 403 });
    }

    if (Number(compteEmetteur.solde) < montantNum) {
      return NextResponse.json({ error: 'Solde insuffisant' }, { status: 400 });
    }

    // Vérifier que le VBAN destinataire existe
    const { data: compteDestinataire } = await admin
      .from('felitz_comptes')
      .select('id, vban')
      .eq('vban', String(destinataire_vban).trim())
      .single();

    if (!compteDestinataire) {
      return NextResponse.json({ error: 'VBAN destinataire introuvable' }, { status: 404 });
    }

    if (compteDestinataire.id === compte_emetteur_id) {
      return NextResponse.json({ error: 'Impossible de virer vers son propre compte' }, { status: 400 });
    }

    // Effectuer le virement (transaction atomique)
    const { error: virementErr } = await admin.from('felitz_virements').insert({
      compte_emetteur_id,
      compte_destinataire_vban: compteDestinataire.vban,
      montant: montantNum,
      libelle: libelle ? String(libelle).trim() : null,
    });

    if (virementErr) return NextResponse.json({ error: virementErr.message }, { status: 400 });

    // Débiter le compte émetteur
    const { error: debitErr } = await admin
      .from('felitz_comptes')
      .update({ solde: Number(compteEmetteur.solde) - montantNum })
      .eq('id', compte_emetteur_id);

    if (debitErr) return NextResponse.json({ error: 'Erreur débit' }, { status: 500 });

    // Créditer le compte destinataire
    const { data: compteDest } = await admin.from('felitz_comptes').select('solde').eq('id', compteDestinataire.id).single();
    if (compteDest) {
      const { error: creditErr } = await admin
        .from('felitz_comptes')
        .update({ solde: Number(compteDest.solde) + montantNum })
        .eq('id', compteDestinataire.id);

      if (creditErr) return NextResponse.json({ error: 'Erreur crédit' }, { status: 500 });
    }

    // Créer les transactions
    await Promise.all([
      admin.from('felitz_transactions').insert({
        compte_id: compte_emetteur_id,
        type: 'virement',
        montant: -montantNum,
        titre: `Virement vers ${compteDestinataire.vban}`,
        description: libelle || null,
      }),
      admin.from('felitz_transactions').insert({
        compte_id: compteDestinataire.id,
        type: 'virement',
        montant: montantNum,
        titre: `Virement reçu de ${compteEmetteur.user_id ? 'utilisateur' : 'compagnie'}`,
        description: libelle || null,
      }),
    ]);

    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error('Felitz virements POST:', e);
    return NextResponse.json({ error: 'Erreur serveur' }, { status: 500 });
  }
}
