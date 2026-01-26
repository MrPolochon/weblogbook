import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { NextResponse, NextRequest } from 'next/server';

export const dynamic = 'force-dynamic';

// GET - Récupérer les invitations (pour un pilote ou pour une compagnie si PDG)
export async function GET(req: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Non authentifié' }, { status: 401 });

    const admin = createAdminClient();
    const { searchParams } = new URL(req.url);
    const type = searchParams.get('type'); // 'recues' ou 'envoyees'
    const compagnieId = searchParams.get('compagnie_id');

    if (type === 'envoyees' && compagnieId) {
      // Vérifier que l'utilisateur est PDG de cette compagnie
      const { data: compagnie } = await admin.from('compagnies')
        .select('id, pdg_id')
        .eq('id', compagnieId)
        .single();

      if (!compagnie || compagnie.pdg_id !== user.id) {
        return NextResponse.json({ error: 'Non autorisé' }, { status: 403 });
      }

      // Récupérer les invitations envoyées par cette compagnie
      const { data, error } = await admin.from('compagnie_invitations')
        .select('*, pilote:profiles!pilote_id(id, identifiant)')
        .eq('compagnie_id', compagnieId)
        .order('created_at', { ascending: false });

      if (error) return NextResponse.json({ error: error.message }, { status: 400 });
      return NextResponse.json(data);
    } else {
      // Récupérer les invitations reçues par le pilote
      const { data, error } = await admin.from('compagnie_invitations')
        .select('*, compagnie:compagnies!compagnie_id(id, nom, code_oaci)')
        .eq('pilote_id', user.id)
        .eq('statut', 'en_attente')
        .order('created_at', { ascending: false });

      if (error) return NextResponse.json({ error: error.message }, { status: 400 });
      return NextResponse.json(data);
    }
  } catch (e) {
    console.error('Recrutement GET:', e);
    return NextResponse.json({ error: 'Erreur serveur' }, { status: 500 });
  }
}

// POST - Envoyer une invitation de recrutement
export async function POST(req: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Non authentifié' }, { status: 401 });

    const body = await req.json();
    const { compagnie_id, pilote_id, message_invitation } = body;

    if (!compagnie_id || !pilote_id) {
      return NextResponse.json({ error: 'Compagnie et pilote requis' }, { status: 400 });
    }

    const admin = createAdminClient();

    // Vérifier que l'utilisateur est PDG de cette compagnie
    const { data: compagnie } = await admin.from('compagnies')
      .select('id, nom, pdg_id')
      .eq('id', compagnie_id)
      .single();

    if (!compagnie || compagnie.pdg_id !== user.id) {
      return NextResponse.json({ error: 'Vous n\'êtes pas PDG de cette compagnie' }, { status: 403 });
    }

    // Vérifier que le pilote existe
    const { data: pilote } = await admin.from('profiles')
      .select('id, identifiant')
      .eq('id', pilote_id)
      .single();

    if (!pilote) {
      return NextResponse.json({ error: 'Pilote introuvable' }, { status: 404 });
    }

    // Vérifier si le pilote n'est pas déjà employé
    const { data: existingEmploye } = await admin.from('compagnie_employes')
      .select('id')
      .eq('compagnie_id', compagnie_id)
      .eq('pilote_id', pilote_id)
      .single();

    if (existingEmploye) {
      return NextResponse.json({ error: 'Ce pilote est déjà employé dans votre compagnie' }, { status: 400 });
    }

    // Vérifier si une invitation en attente existe déjà
    const { data: existingInvitation } = await admin.from('compagnie_invitations')
      .select('id')
      .eq('compagnie_id', compagnie_id)
      .eq('pilote_id', pilote_id)
      .eq('statut', 'en_attente')
      .single();

    if (existingInvitation) {
      return NextResponse.json({ error: 'Une invitation est déjà en attente pour ce pilote' }, { status: 400 });
    }

    // Créer l'invitation
    const { data: invitation, error: invError } = await admin.from('compagnie_invitations')
      .insert({
        compagnie_id,
        pilote_id,
        message_invitation: message_invitation || null,
        statut: 'en_attente'
      })
      .select()
      .single();

    if (invError) return NextResponse.json({ error: invError.message }, { status: 400 });

    // Récupérer l'identifiant du PDG
    const { data: pdgProfile } = await admin.from('profiles')
      .select('identifiant')
      .eq('id', user.id)
      .single();

    // Envoyer un message au pilote
    const { error: msgError } = await admin.from('messages').insert({
      expediteur_id: user.id,
      destinataire_id: pilote_id,
      titre: `🎉 Offre d'emploi - ${compagnie.nom}`,
      contenu: `Bonjour,\n\nLa compagnie **${compagnie.nom}** vous propose de rejoindre son équipe !\n\n${message_invitation ? `Message du PDG:\n"${message_invitation}"\n\n` : ''}Rendez-vous dans votre messagerie, onglet "Recrutement" pour accepter ou refuser cette offre.\n\nCordialement,\n${pdgProfile?.identifiant || 'Le PDG'}`,
      type_message: 'recrutement',
      metadata: { invitation_id: invitation.id, compagnie_id, compagnie_nom: compagnie.nom }
    });

    if (msgError) {
      console.error('Erreur envoi message recrutement:', msgError);
      // Essayer sans metadata si ça échoue (colonne peut ne pas exister)
      const { error: msgError2 } = await admin.from('messages').insert({
        expediteur_id: user.id,
        destinataire_id: pilote_id,
        titre: `🎉 Offre d'emploi - ${compagnie.nom}`,
        contenu: `Bonjour,\n\nLa compagnie **${compagnie.nom}** vous propose de rejoindre son équipe !\n\n${message_invitation ? `Message du PDG:\n"${message_invitation}"\n\n` : ''}Rendez-vous dans votre messagerie, onglet "Recrutement" pour accepter ou refuser cette offre.\n\nCordialement,\n${pdgProfile?.identifiant || 'Le PDG'}`,
        type_message: 'recrutement'
      });
      if (msgError2) {
        console.error('Erreur envoi message recrutement (sans metadata):', msgError2);
      }
    }

    return NextResponse.json({ 
      ok: true, 
      message: `Invitation envoyée à ${pilote.identifiant}`,
      invitation 
    });
  } catch (e) {
    console.error('Recrutement POST:', e);
    return NextResponse.json({ error: 'Erreur serveur' }, { status: 500 });
  }
}

// PATCH - Répondre à une invitation (accepter/refuser)
export async function PATCH(req: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Non authentifié' }, { status: 401 });

    const body = await req.json();
    const { invitation_id, action } = body; // action: 'accepter' ou 'refuser'

    if (!invitation_id || !['accepter', 'refuser'].includes(action)) {
      return NextResponse.json({ error: 'Invitation et action requises' }, { status: 400 });
    }

    const admin = createAdminClient();

    // Récupérer l'invitation
    const { data: invitation } = await admin.from('compagnie_invitations')
      .select('*, compagnie:compagnies!compagnie_id(id, nom, pdg_id)')
      .eq('id', invitation_id)
      .eq('pilote_id', user.id)
      .eq('statut', 'en_attente')
      .single();

    if (!invitation) {
      return NextResponse.json({ error: 'Invitation introuvable ou déjà traitée' }, { status: 404 });
    }

    const compagnie = Array.isArray(invitation.compagnie) ? invitation.compagnie[0] : invitation.compagnie;

    if (action === 'accepter') {
      // Mettre à jour l'invitation
      await admin.from('compagnie_invitations')
        .update({ statut: 'acceptee', repondu_at: new Date().toISOString() })
        .eq('id', invitation_id);

      // Ajouter le pilote comme employé
      await admin.from('compagnie_employes').insert({
        compagnie_id: invitation.compagnie_id,
        pilote_id: user.id
      });

      // Récupérer l'identifiant du pilote
      const { data: piloteProfile } = await admin.from('profiles')
        .select('identifiant')
        .eq('id', user.id)
        .single();

      // Notifier le PDG
      await admin.from('messages').insert({
        expediteur_id: user.id,
        destinataire_id: compagnie.pdg_id,
        titre: `✅ Recrutement accepté - ${piloteProfile?.identifiant}`,
        contenu: `Bonne nouvelle !\n\n**${piloteProfile?.identifiant}** a accepté votre offre d'emploi et rejoint désormais l'équipe de **${compagnie.nom}** !\n\nBienvenue à votre nouveau membre !`,
        type_message: 'normal'
      });

      return NextResponse.json({ 
        ok: true, 
        message: `Vous avez rejoint ${compagnie.nom} !` 
      });
    } else {
      // Refuser l'invitation
      await admin.from('compagnie_invitations')
        .update({ statut: 'refusee', repondu_at: new Date().toISOString() })
        .eq('id', invitation_id);

      // Récupérer l'identifiant du pilote
      const { data: piloteProfile } = await admin.from('profiles')
        .select('identifiant')
        .eq('id', user.id)
        .single();

      // Notifier le PDG
      await admin.from('messages').insert({
        expediteur_id: user.id,
        destinataire_id: compagnie.pdg_id,
        titre: `❌ Recrutement refusé - ${piloteProfile?.identifiant}`,
        contenu: `**${piloteProfile?.identifiant}** a décliné votre offre d'emploi pour **${compagnie.nom}**.\n\nN'hésitez pas à proposer à d'autres pilotes de rejoindre votre équipe.`,
        type_message: 'normal'
      });

      return NextResponse.json({ 
        ok: true, 
        message: 'Invitation refusée' 
      });
    }
  } catch (e) {
    console.error('Recrutement PATCH:', e);
    return NextResponse.json({ error: 'Erreur serveur' }, { status: 500 });
  }
}

// DELETE - Annuler une invitation (par le PDG)
export async function DELETE(req: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Non authentifié' }, { status: 401 });

    const { searchParams } = new URL(req.url);
    const invitationId = searchParams.get('id');

    if (!invitationId) {
      return NextResponse.json({ error: 'ID invitation requis' }, { status: 400 });
    }

    const admin = createAdminClient();

    // Récupérer l'invitation avec la compagnie
    const { data: invitation } = await admin.from('compagnie_invitations')
      .select('*, compagnie:compagnies!compagnie_id(id, pdg_id)')
      .eq('id', invitationId)
      .eq('statut', 'en_attente')
      .single();

    if (!invitation) {
      return NextResponse.json({ error: 'Invitation introuvable' }, { status: 404 });
    }

    const compagnie = Array.isArray(invitation.compagnie) ? invitation.compagnie[0] : invitation.compagnie;

    if (compagnie.pdg_id !== user.id) {
      return NextResponse.json({ error: 'Non autorisé' }, { status: 403 });
    }

    await admin.from('compagnie_invitations')
      .update({ statut: 'annulee' })
      .eq('id', invitationId);

    return NextResponse.json({ ok: true, message: 'Invitation annulée' });
  } catch (e) {
    console.error('Recrutement DELETE:', e);
    return NextResponse.json({ error: 'Erreur serveur' }, { status: 500 });
  }
}
