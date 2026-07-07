import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { NextResponse } from 'next/server';
import { finaliserCloturePlan } from '@/lib/plans-vol/closure';
import { stopAtisIfController } from '@/lib/atis-bot-api';
import { ATC_TAUX_PAR_MINUTE } from '@/lib/atc-salaire';
import { ensureComptePersonnel, getComptePersonnelCanonique } from '@/lib/felitz/ensure-comptes';

/**
 * DELETE - Déconnecter de force un ATC (admin uniquement)
 */
export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ user_id: string }> }
) {
  try {
    const { user_id: targetUserId } = await params;
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Non autorisé' }, { status: 401 });

    const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).single();
    if (profile?.role !== 'admin') {
      return NextResponse.json({ error: 'Accès admin requis.' }, { status: 403 });
    }
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

    let durationMinutes = 0;
    if (session.started_at) {
      durationMinutes = Math.max(0, Math.floor((Date.now() - new Date(session.started_at).getTime()) / 60_000));
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

    const tauxMinute = ATC_TAUX_PAR_MINUTE[session.position] ?? 0;
    const salaireMinute = durationMinutes * tauxMinute;

    const { data: taxesPending } = await admin.from('atc_taxes_pending')
      .select('id, montant, aeroport, description, plan_vol_id')
      .eq('session_id', session.id);

    const totalTaxes = taxesPending?.reduce((sum, t) => sum + (t.montant || 0), 0) ?? 0;
    const chequeMontant = salaireMinute + totalTaxes;
    let chequeEnvoye = false;

    if (chequeMontant > 0) {
      let compteAtc = await getComptePersonnelCanonique(admin, targetUserId);
      if (!compteAtc) compteAtc = await ensureComptePersonnel(admin, targetUserId);

      if (compteAtc) {
        const nbVols = taxesPending?.length ?? 0;
        const aeroportsConcernes = Array.from(new Set((taxesPending || []).map(t => t.aeroport))).join(', ');

        let contenu = `Votre session sur ${session.aeroport} - ${session.position} a été fermée par un administrateur.\n\n`;
        contenu += `Durée de service : ${durationMinutes} min\n`;
        contenu += `Salaire à la minute (${durationMinutes} min × ${tauxMinute.toLocaleString('fr-FR')} F$/min) : ${salaireMinute.toLocaleString('fr-FR')} F$\n`;
        if (nbVols > 0) {
          contenu += `Taxes aéroportuaires perçues (${nbVols} vol(s) sur ${aeroportsConcernes}) : ${totalTaxes.toLocaleString('fr-FR')} F$\n`;
        }
        contenu += `\nTotal : ${chequeMontant.toLocaleString('fr-FR')} F$\n\nMerci pour votre service !`;

        await admin.from('messages').insert({
          destinataire_id: targetUserId,
          expediteur_id: null,
          titre: `Salaire ATC - ${session.aeroport} ${session.position} (Déconnexion forcée)`,
          contenu,
          type_message: 'cheque_taxes_atc',
          cheque_montant: chequeMontant,
          cheque_encaisse: false,
          cheque_destinataire_compte_id: compteAtc.id,
          cheque_libelle: `Salaire ATC - ${session.aeroport} ${session.position} (${durationMinutes} min)`,
          cheque_pour_compagnie: false
        });
        chequeEnvoye = true;
      }
    }

    if (taxesPending && taxesPending.length > 0) {
      await admin.from('atc_taxes_pending').delete().eq('session_id', session.id);
    }

    // Message obligatoire : informer le contrôleur qu'il a été déconnecté de force
    await admin.from('messages').insert({
      destinataire_id: targetUserId,
      expediteur_id: null,
      titre: 'Déconnexion forcée par un administrateur',
      contenu: `Votre session sur ${session.aeroport} - ${session.position} a été fermée par un administrateur.\n\n⚠️ N'oubliez pas de vous mettre hors service la prochaine fois pour éviter de bloquer la position pour les autres contrôleurs.`,
      type_message: 'systeme',
    });

    // Si cet ATC contrôlait l'ATIS, l'arrêter automatiquement
    await stopAtisIfController(targetUserId);

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
