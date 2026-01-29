import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { NextResponse } from 'next/server';
import { COUT_AFFRETER_TECHNICIENS, calculerDureeMaintenance } from '@/lib/compagnie-utils';

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
    const { data: avion } = await admin
      .from('compagnie_avions')
      .select('id, compagnie_id, statut, usure_percent, aeroport_actuel, maintenance_fin_at')
      .eq('id', id)
      .single();
    if (!avion) return NextResponse.json({ error: 'Avion introuvable.' }, { status: 404 });

    // Vérifier si l'avion est déjà en maintenance
    if (avion.statut === 'maintenance' && avion.maintenance_fin_at) {
      const maintenanceFin = new Date(avion.maintenance_fin_at);
      const maintenant = new Date();
      
      if (maintenant >= maintenanceFin) {
        // La maintenance est terminée, réparer l'avion
        const { error: avionErr } = await admin
          .from('compagnie_avions')
          .update({
            usure_percent: 100,
            statut: 'ground',
            maintenance_fin_at: null,
          })
          .eq('id', id);

        if (avionErr) {
          return NextResponse.json({ error: 'Erreur lors de la réparation.' }, { status: 500 });
        }

        return NextResponse.json({ ok: true, repare: true, message: 'Avion réparé avec succès !' });
      } else {
        // Maintenance en cours, retourner le temps restant
        const tempsRestantMs = maintenanceFin.getTime() - maintenant.getTime();
        const tempsRestantMin = Math.ceil(tempsRestantMs / 60000);
        return NextResponse.json({ 
          error: `Techniciens en cours de travail. Temps restant : ${tempsRestantMin} min.`,
          maintenance_fin_at: avion.maintenance_fin_at,
          temps_restant_min: tempsRestantMin
        }, { status: 400 });
      }
    }

    if (avion.statut !== 'bloque' && avion.usure_percent !== 0) {
      return NextResponse.json({ error: 'L\'avion n\'est pas bloqué à 0% d\'usure.' }, { status: 400 });
    }

    const { data: compagnie } = await admin
      .from('compagnies')
      .select('id, pdg_id')
      .eq('id', avion.compagnie_id)
      .single();
    const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).single();
    
    if (compagnie?.pdg_id !== user.id && profile?.role !== 'admin') {
      return NextResponse.json({ error: 'Seul le PDG peut affréter des techniciens.' }, { status: 403 });
    }

    // Vérifier le solde
    const { data: compte } = await admin
      .from('felitz_comptes')
      .select('id, solde')
      .eq('compagnie_id', avion.compagnie_id)
      .eq('type', 'entreprise')
      .single();
    
    if (!compte) {
      return NextResponse.json({ error: 'Compte entreprise introuvable.' }, { status: 500 });
    }
    if (compte.solde < COUT_AFFRETER_TECHNICIENS) {
      return NextResponse.json({ 
        error: `Solde insuffisant. Coût : ${COUT_AFFRETER_TECHNICIENS.toLocaleString('fr-FR')} F$.` 
      }, { status: 400 });
    }

    // Débiter le compte
    const nouveauSolde = compte.solde - COUT_AFFRETER_TECHNICIENS;
    const { error: debitErr } = await admin
      .from('felitz_comptes')
      .update({ solde: nouveauSolde })
      .eq('id', compte.id);
    
    if (debitErr) {
      return NextResponse.json({ error: 'Erreur lors du débit.' }, { status: 500 });
    }

    // Créer une transaction
    await admin.from('felitz_transactions').insert({
      compte_id: compte.id,
      type: 'debit',
      montant: COUT_AFFRETER_TECHNICIENS,
      libelle: `Affrètement techniciens pour ${avion.aeroport_actuel}`,
    });

    // Calculer la durée de maintenance (aléatoire entre 30 et 90 min)
    const dureeMaintenance = calculerDureeMaintenance();
    
    // Mettre l'avion en maintenance avec un délai
    const maintenanceFinAt = new Date(Date.now() + dureeMaintenance * 60 * 1000);
    const { error: avionErr } = await admin
      .from('compagnie_avions')
      .update({
        statut: 'maintenance',
        maintenance_fin_at: maintenanceFinAt.toISOString(),
      })
      .eq('id', id);

    if (avionErr) {
      // Rollback : rembourser
      await admin.from('felitz_comptes').update({ solde: compte.solde }).eq('id', compte.id);
      return NextResponse.json({ error: 'Erreur lors de la mise en maintenance.' }, { status: 500 });
    }

    // Formater la durée pour l'affichage
    const heures = Math.floor(dureeMaintenance / 60);
    const minutes = dureeMaintenance % 60;
    const dureeText = heures > 0 
      ? `${heures}h${minutes > 0 ? minutes.toString().padStart(2, '0') : ''}` 
      : `${minutes} minutes`;

    return NextResponse.json({ 
      ok: true, 
      cout: COUT_AFFRETER_TECHNICIENS,
      maintenance_fin_at: maintenanceFinAt.toISOString(),
      temps_attente_min: dureeMaintenance,
      message: `Techniciens affrétés. L'avion sera réparé dans ${dureeText}.`
    });
  } catch (e) {
    console.error('POST compagnies/avions/affreter-techniciens:', e);
    return NextResponse.json({ error: 'Erreur serveur' }, { status: 500 });
  }
}
