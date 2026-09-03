export const dynamic = 'force-dynamic';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { NextResponse } from 'next/server';
import { calculerUsureFerry } from '@/lib/compagnie-utils';
import { isCoPdg } from '@/lib/co-pdg-utils';
import { getCompteEntrepriseCanonique } from '@/lib/felitz/ensure-comptes';
import { advanceReparationIfFerryArrivedAtHangar, completeReparationReturnFerry } from '@/lib/reparation-after-ferry';

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Non autorisé' }, { status: 401 });

    const body = await request.json();
    const { action, duree_minutes } = body;

    const admin = createAdminClient();
    const { data: vol } = await admin
      .from('vols_ferry')
      .select('*, avion:compagnie_avions(id, usure_percent)')
      .eq('id', id)
      .single();
    if (!vol) return NextResponse.json({ error: 'Vol ferry introuvable.' }, { status: 404 });

    // Vérifier autorisation
    const { data: compagnie } = await admin
      .from('compagnies')
      .select('pdg_id')
      .eq('id', vol.compagnie_id)
      .single();
    const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).single();
    const isPDG = compagnie?.pdg_id === user.id || await isCoPdg(user.id, vol.compagnie_id, admin);
    const isAdmin = profile?.role === 'admin';
    const isPilote = vol.pilote_id === user.id;

    if (!isPDG && !isAdmin && !isPilote) {
      return NextResponse.json({ error: 'Non autorisé' }, { status: 403 });
    }

    if (action === 'cloturer') {
      if (vol.statut === 'completed') {
        return NextResponse.json({ error: 'Ce vol est déjà clôturé.' }, { status: 400 });
      }

      // Calculer l'usure (basée sur une distance estimée)
      const usure = calculerUsureFerry(500); // Distance fixe pour simplifier
      const avionActuel = vol.avion as { id: string; usure_percent: number };
      const nouvelleUsure = Math.max(0, avionActuel.usure_percent - usure);
      const statutAvion = nouvelleUsure === 0 ? 'bloque' : 'ground';

      // Déplacer l'avion et appliquer l'usure
      const { error: avionErr } = await admin
        .from('compagnie_avions')
        .update({
          aeroport_actuel: vol.aeroport_arrivee,
          usure_percent: nouvelleUsure,
          statut: statutAvion,
        })
        .eq('id', vol.avion_id);

      if (avionErr) return NextResponse.json({ error: avionErr.message }, { status: 400 });

      // Clôturer le vol
      const { error } = await admin
        .from('vols_ferry')
        .update({
          statut: 'completed',
          duree_minutes: duree_minutes || null,
          usure_appliquee: usure,
          completed_at: new Date().toISOString(),
        })
        .eq('id', id);

      if (error) return NextResponse.json({ error: error.message }, { status: 400 });

      await advanceReparationIfFerryArrivedAtHangar(admin, vol.avion_id, vol.aeroport_arrivee);
      await completeReparationReturnFerry(admin, vol.avion_id, vol.aeroport_arrivee);

      return NextResponse.json({ ok: true, usure_appliquee: usure, nouvelle_usure: nouvelleUsure });
    }

    if (action === 'annuler') {
      if (vol.statut === 'completed') {
        return NextResponse.json({ error: 'Impossible d\'annuler un vol terminé.' }, { status: 400 });
      }
      if (vol.statut === 'cancelled') {
        return NextResponse.json({ error: 'Ce vol est déjà annulé.' }, { status: 400 });
      }

      const montantRembourse = Math.max(0, Math.round(Number(vol.cout_ferry) || 0));
      if (montantRembourse > 0) {
        const compte = await getCompteEntrepriseCanonique(admin, vol.compagnie_id);
        if (!compte) {
          return NextResponse.json({ error: 'Compte entreprise introuvable, remboursement impossible.' }, { status: 500 });
        }
        const { data: creditOk } = await admin.rpc('crediter_compte_safe', {
          p_compte_id: compte.id,
          p_montant: montantRembourse,
        });
        if (!creditOk) {
          return NextResponse.json({ error: 'Échec du remboursement Felitz.' }, { status: 500 });
        }
        await admin.from('felitz_transactions').insert({
          compte_id: compte.id,
          type: 'credit',
          montant: montantRembourse,
          libelle: `Remboursement vol ferry annulé ${vol.aeroport_depart} → ${vol.aeroport_arrivee}`,
        });
        if (compagnie?.pdg_id) {
          await admin.from('messages').insert({
            destinataire_id: compagnie.pdg_id,
            expediteur_id: null,
            titre: 'Remboursement vol ferry',
            contenu:
              `Le vol ferry ${vol.aeroport_depart} → ${vol.aeroport_arrivee} a été annulé.\n\n` +
              `${montantRembourse.toLocaleString('fr-FR')} F$ (coût + taxes) ont été recrédités sur le compte de la compagnie.`,
            type_message: 'systeme',
          });
        }
      }

      await admin
        .from('compagnie_avions')
        .update({ statut: vol.debloque_pour_ferry ? 'bloque' : 'ground' })
        .eq('id', vol.avion_id);

      const { error } = await admin
        .from('vols_ferry')
        .update({ statut: 'cancelled' })
        .eq('id', id);

      if (error) return NextResponse.json({ error: error.message }, { status: 400 });
      return NextResponse.json({ ok: true, remboursement: montantRembourse });
    }

    return NextResponse.json({ error: 'Action invalide' }, { status: 400 });
  } catch (e) {
    console.error('PATCH compagnies/vols-ferry/[id]:', e);
    return NextResponse.json({ error: 'Erreur serveur' }, { status: 500 });
  }
}
