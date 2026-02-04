import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { NextResponse } from 'next/server';
import { finaliserCloturePlan } from '@/lib/plans-vol/closure';

/**
 * DELETE - Déconnecter de force un ATC (admin uniquement)
 */
export async function DELETE(
  request: Request,
  { params }: { params: { user_id: string } }
) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Non autorisé' }, { status: 401 });

    // Vérifier que l'utilisateur est admin
    const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).single();
    if (profile?.role !== 'admin') {
      return NextResponse.json({ error: 'Accès admin requis.' }, { status: 403 });
    }

    const targetUserId = params.user_id;
    if (!targetUserId) {
      return NextResponse.json({ error: 'User ID requis.' }, { status: 400 });
    }

    const admin = createAdminClient();

    // Récupérer la session de l'ATC cible
    const { data: session } = await admin
      .from('atc_sessions')
      .select('id, started_at, aeroport, position, user_id')
      .eq('user_id', targetUserId)
      .single();

    if (!session) {
      return NextResponse.json({ error: 'Aucune session active pour cet ATC.' }, { status: 400 });
    }

    // Mettre à jour le temps total de service (comme lors d'une déconnexion normale)
    if (session.started_at) {
      const durationMinutes = Math.max(0, Math.floor((Date.now() - new Date(session.started_at).getTime()) / 60_000));
      const { data: prof } = await admin.from('profiles').select('atc_temps_total_minutes').eq('id', targetUserId).single();
      const prev = (prof?.atc_temps_total_minutes ?? 0) | 0;
      await admin.from('profiles').update({ atc_temps_total_minutes: prev + durationMinutes }).eq('id', targetUserId);
    }

    // Sécuriser les plans contrôlés par cet ATC
    const { data: plansSousControle } = await admin
      .from('plans_vol')
      .select('id, statut, pilote_id, vol_commercial, compagnie_id, revenue_brut, salaire_pilote, temps_prev_min, accepted_at, numero_vol, aeroport_arrivee, type_vol, demande_cloture_at, nature_transport, type_cargaison, compagnie_avion_id, location_loueur_compagnie_id, location_pourcentage_revenu_loueur')
      .eq('current_holder_user_id', targetUserId)
      .in('statut', ['depose', 'en_attente', 'accepte', 'en_cours', 'en_attente_cloture']);

    const plansACloturer = (plansSousControle || []).filter((p) => p.statut === 'en_attente_cloture');
    for (const plan of plansACloturer) {
      const confirmationAt = new Date();
      const result = await finaliserCloturePlan(admin, plan, confirmationAt);
      if (!result.success) {
        console.error('Cloture auto (deconnexion forcee) echouee:', result.error);
      }
    }

    // Passer en autosurveillance les vols acceptés/en cours, libérer les autres en attente
    await admin.from('plans_vol').update({
      current_holder_user_id: null,
      current_holder_position: null,
      current_holder_aeroport: null,
      pending_transfer_aeroport: null,
      pending_transfer_position: null,
      pending_transfer_at: null,
      automonitoring: true,
    }).eq('current_holder_user_id', targetUserId).in('statut', ['accepte', 'en_cours']);

    await admin.from('plans_vol').update({
      current_holder_user_id: null,
      current_holder_position: null,
      current_holder_aeroport: null,
      pending_transfer_aeroport: null,
      pending_transfer_position: null,
      pending_transfer_at: null,
    }).eq('current_holder_user_id', targetUserId).in('statut', ['depose', 'en_attente']);

    // Récupérer et traiter les taxes accumulées pendant cette session
    const { data: taxesPending } = await admin.from('atc_taxes_pending')
      .select('id, montant, aeroport, description, plan_vol_id')
      .eq('session_id', session.id);

    let chequeMontant = 0;
    let chequeEnvoye = false;

    if (taxesPending && taxesPending.length > 0) {
      // Calculer le total des taxes
      chequeMontant = taxesPending.reduce((sum, t) => sum + (t.montant || 0), 0);

      if (chequeMontant > 0) {
        // Récupérer le compte personnel de l'ATC
        const { data: compteAtc } = await admin.from('felitz_comptes')
          .select('id')
          .eq('proprietaire_id', targetUserId)
          .eq('type', 'personnel')
          .single();

        if (compteAtc) {
          // Construire le détail des vols
          const nbVols = taxesPending.length;
          const aeroportsConcernes = Array.from(new Set(taxesPending.map(t => t.aeroport))).join(', ');
          
          // Envoyer un seul chèque avec le total
          await admin.from('messages').insert({
            destinataire_id: targetUserId,
            expediteur_id: null,
            titre: `Salaire ATC - ${session.aeroport} ${session.position} (Déconnexion forcée)`,
            contenu: `Votre session sur ${session.aeroport} - ${session.position} a été fermée par un administrateur.\n\nVous avez contrôlé ${nbVols} vol(s) sur les aéroports: ${aeroportsConcernes}.\n\nTotal des taxes perçues: ${chequeMontant.toLocaleString('fr-FR')} F$\n\nMerci pour votre service !`,
            type_message: 'cheque_taxes_atc',
            cheque_montant: chequeMontant,
            cheque_encaisse: false,
            cheque_destinataire_compte_id: compteAtc.id,
            cheque_libelle: `Salaire ATC - ${session.aeroport} ${session.position} (${nbVols} vols)`,
            cheque_pour_compagnie: false
          });
          chequeEnvoye = true;
        }
      }

      // Supprimer les taxes pending traitées
      await admin.from('atc_taxes_pending').delete().eq('session_id', session.id);
    }

    // Supprimer la session
    const { error } = await admin.from('atc_sessions').delete().eq('user_id', targetUserId);
    if (error) return NextResponse.json({ error: error.message }, { status: 400 });
    
    return NextResponse.json({ 
      ok: true, 
      chequeEnvoye, 
      montant: chequeMontant,
      message: `Session de l'ATC déconnectée avec succès.` 
    });
  } catch (e) {
    console.error('ATC session force disconnect:', e);
    return NextResponse.json({ error: 'Erreur serveur' }, { status: 500 });
  }
}
