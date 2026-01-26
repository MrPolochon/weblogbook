import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { NextResponse } from 'next/server';

// GET - Récupérer un message spécifique
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Non authentifié' }, { status: 401 });

    const admin = createAdminClient();
    const { data: message, error } = await admin.from('messages')
      .select('*, expediteur:profiles!expediteur_id(identifiant)')
      .eq('id', id)
      .single();

    if (error || !message) return NextResponse.json({ error: 'Message introuvable' }, { status: 404 });
    
    // Vérifier que l'utilisateur est le destinataire ou l'expéditeur
    if (message.destinataire_id !== user.id && message.expediteur_id !== user.id) {
      return NextResponse.json({ error: 'Non autorisé' }, { status: 403 });
    }

    // Marquer comme lu si c'est le destinataire
    if (message.destinataire_id === user.id && !message.lu) {
      await admin.from('messages').update({ lu: true }).eq('id', id);
    }

    return NextResponse.json(message);
  } catch (e) {
    console.error('Message GET:', e);
    return NextResponse.json({ error: 'Erreur serveur' }, { status: 500 });
  }
}

// PATCH - Modifier un message (marquer lu, encaisser chèque)
export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Non authentifié' }, { status: 401 });

    const body = await request.json();
    const { action } = body;

    const admin = createAdminClient();
    const { data: message, error: fetchError } = await admin.from('messages')
      .select('*')
      .eq('id', id)
      .single();

    if (fetchError || !message) return NextResponse.json({ error: 'Message introuvable' }, { status: 404 });
    if (message.destinataire_id !== user.id) return NextResponse.json({ error: 'Non autorisé' }, { status: 403 });

    if (action === 'marquer_lu') {
      await admin.from('messages').update({ lu: true }).eq('id', id);
      return NextResponse.json({ ok: true });
    }

    if (action === 'marquer_invitation_repondue') {
      // Mettre à jour le metadata du message pour indiquer que l'invitation a été répondue
      const currentMetadata = message.metadata || {};
      await admin.from('messages').update({
        metadata: { ...currentMetadata, invitation_repondue: true },
        lu: true
      }).eq('id', id);
      return NextResponse.json({ ok: true });
    }

    if (action === 'encaisser') {
      // Vérifier que c'est un chèque non encaissé
      if (!['cheque_salaire', 'cheque_revenu_compagnie', 'cheque_taxes_atc'].includes(message.type_message)) {
        return NextResponse.json({ error: 'Ce message n\'est pas un chèque' }, { status: 400 });
      }
      if (message.cheque_encaisse) {
        return NextResponse.json({ error: 'Ce chèque a déjà été encaissé' }, { status: 400 });
      }
      if (!message.cheque_montant || message.cheque_montant <= 0) {
        return NextResponse.json({ error: 'Montant du chèque invalide' }, { status: 400 });
      }

      // Trouver le compte à créditer
      let compteId = message.cheque_destinataire_compte_id;
      
      if (!compteId) {
        // Chercher le compte personnel de l'utilisateur
        const { data: compte } = await admin.from('felitz_comptes')
          .select('id')
          .eq('proprietaire_id', user.id)
          .eq('type', 'personnel')
          .single();
        
        if (!compte) return NextResponse.json({ error: 'Compte Felitz introuvable' }, { status: 404 });
        compteId = compte.id;
      }

      // Récupérer le solde actuel
      const { data: compteData } = await admin.from('felitz_comptes')
        .select('id, solde')
        .eq('id', compteId)
        .single();

      if (!compteData) return NextResponse.json({ error: 'Compte introuvable' }, { status: 404 });

      // Créditer le compte
      await admin.from('felitz_comptes')
        .update({ solde: compteData.solde + message.cheque_montant })
        .eq('id', compteId);

      // Créer la transaction
      await admin.from('felitz_transactions').insert({
        compte_id: compteId,
        type: 'credit',
        montant: message.cheque_montant,
        libelle: message.cheque_libelle || `Encaissement chèque vol ${message.cheque_numero_vol || ''}`
      });

      // Marquer le chèque comme encaissé
      await admin.from('messages').update({
        cheque_encaisse: true,
        cheque_encaisse_at: new Date().toISOString(),
        lu: true
      }).eq('id', id);

      return NextResponse.json({ ok: true, montant: message.cheque_montant });
    }

    return NextResponse.json({ error: 'Action inconnue' }, { status: 400 });
  } catch (e) {
    console.error('Message PATCH:', e);
    return NextResponse.json({ error: 'Erreur serveur' }, { status: 500 });
  }
}

// DELETE - Supprimer un message
export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Non authentifié' }, { status: 401 });

    const admin = createAdminClient();
    const { data: message } = await admin.from('messages')
      .select('destinataire_id, expediteur_id, type_message, cheque_encaisse')
      .eq('id', id)
      .single();

    if (!message) return NextResponse.json({ error: 'Message introuvable' }, { status: 404 });
    
    // Ne pas permettre de supprimer les chèques non encaissés
    if (['cheque_salaire', 'cheque_revenu_compagnie', 'cheque_taxes_atc'].includes(message.type_message) && !message.cheque_encaisse) {
      return NextResponse.json({ error: 'Vous devez d\'abord encaisser ce chèque' }, { status: 400 });
    }
    
    // Vérifier que l'utilisateur est le destinataire
    if (message.destinataire_id !== user.id) {
      return NextResponse.json({ error: 'Non autorisé' }, { status: 403 });
    }

    await admin.from('messages').delete().eq('id', id);
    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error('Message DELETE:', e);
    return NextResponse.json({ error: 'Erreur serveur' }, { status: 500 });
  }
}
