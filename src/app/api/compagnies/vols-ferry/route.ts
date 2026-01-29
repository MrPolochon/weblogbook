import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { NextResponse } from 'next/server';
import { COUT_VOL_FERRY, calculerVolFerryAuto, calculerUsureFerry } from '@/lib/compagnie-utils';

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const compagnie_id = searchParams.get('compagnie_id');
    if (!compagnie_id) return NextResponse.json({ error: 'compagnie_id requis' }, { status: 400 });

    const supabase = await createClient();
    const admin = createAdminClient();
    
    // Auto-compléter les vols ferry automatiques terminés
    const maintenant = new Date();
    const { data: volsACompleter } = await admin
      .from('vols_ferry')
      .select('id, avion_id, aeroport_arrivee, automatique')
      .eq('compagnie_id', compagnie_id)
      .eq('automatique', true)
      .in('statut', ['planned', 'in_progress'])
      .not('fin_prevue_at', 'is', null)
      .lt('fin_prevue_at', maintenant.toISOString());
    
    // Compléter automatiquement les vols ferry terminés
    for (const vol of volsACompleter || []) {
      // Mettre à jour le vol ferry
      await admin.from('vols_ferry')
        .update({ statut: 'completed', completed_at: maintenant.toISOString() })
        .eq('id', vol.id);
      
      // Mettre à jour l'avion (position + usure + statut)
      const { data: avion } = await admin
        .from('compagnie_avions')
        .select('usure_percent')
        .eq('id', vol.avion_id)
        .single();
      
      if (avion) {
        // L'usure pour un vol ferry auto est fixe à 5%
        const nouvelleUsure = Math.max(0, avion.usure_percent - 5);
        const nouveauStatut = nouvelleUsure === 0 ? 'bloque' : 'ground';
        
        await admin.from('compagnie_avions')
          .update({ 
            aeroport_actuel: vol.aeroport_arrivee,
            usure_percent: nouvelleUsure,
            statut: nouveauStatut 
          })
          .eq('id', vol.avion_id);
      }
    }
    
    // Charger les vols ferry
    const { data: vols, error } = await supabase
      .from('vols_ferry')
      .select('*')
      .eq('compagnie_id', compagnie_id)
      .order('created_at', { ascending: false });

    if (error) return NextResponse.json({ error: error.message }, { status: 400 });

    // Enrichir avec les infos avion et pilote
    const volsEnrichis = await Promise.all((vols || []).map(async (vol) => {
      let avion = null;
      let pilote = null;
      
      if (vol.avion_id) {
        const { data: avionData } = await admin
          .from('compagnie_avions')
          .select('id, immatriculation, nom_bapteme')
          .eq('id', vol.avion_id)
          .single();
        avion = avionData;
      }
      
      if (vol.pilote_id) {
        const { data: piloteData } = await admin
          .from('profiles')
          .select('id, identifiant')
          .eq('id', vol.pilote_id)
          .single();
        pilote = piloteData;
      }
      
      return { ...vol, avion, pilote };
    }));

    return NextResponse.json(volsEnrichis);
  } catch (e) {
    console.error('GET compagnies/vols-ferry:', e);
    return NextResponse.json({ error: 'Erreur serveur' }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Non autorisé' }, { status: 401 });

    const body = await request.json();
    const { compagnie_id, avion_id, aeroport_arrivee, automatique } = body;
    const aa = String(aeroport_arrivee || '').trim().toUpperCase();
    const isAuto = automatique === true;

    if (!compagnie_id || !avion_id || !aa) {
      return NextResponse.json({ error: 'compagnie_id, avion_id et aeroport_arrivee requis' }, { status: 400 });
    }

    const admin = createAdminClient();

    // Vérifier que l'utilisateur est PDG ou admin
    const { data: compagnie } = await admin
      .from('compagnies')
      .select('id, pdg_id')
      .eq('id', compagnie_id)
      .single();
    
    if (!compagnie) return NextResponse.json({ error: 'Compagnie introuvable' }, { status: 404 });
    
    const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).single();
    if (compagnie.pdg_id !== user.id && profile?.role !== 'admin') {
      return NextResponse.json({ error: 'Seul le PDG peut créer des vols ferry' }, { status: 403 });
    }

    // Vérifier que l'arrivée est un hub
    const { data: hub } = await admin
      .from('compagnie_hubs')
      .select('id')
      .eq('compagnie_id', compagnie_id)
      .eq('aeroport_code', aa)
      .maybeSingle();
    
    if (!hub) {
      return NextResponse.json({ error: 'L\'aéroport d\'arrivée doit être un hub de la compagnie.' }, { status: 400 });
    }

    // Vérifier l'avion
    const { data: avion } = await admin
      .from('compagnie_avions')
      .select('id, compagnie_id, aeroport_actuel, statut, usure_percent')
      .eq('id', avion_id)
      .single();
    
    if (!avion || avion.compagnie_id !== compagnie_id) {
      return NextResponse.json({ error: 'Avion invalide.' }, { status: 400 });
    }
    if (avion.statut === 'in_flight') {
      return NextResponse.json({ error: 'L\'avion est déjà en vol.' }, { status: 400 });
    }
    if (avion.aeroport_actuel === aa) {
      return NextResponse.json({ error: 'L\'avion est déjà à cet aéroport.' }, { status: 400 });
    }

    // Règles de vol ferry :
    // 1. Un avion au sol (ground) peut faire un vol ferry normalement
    // 2. Un avion bloqué (bloque) à 0% d'usure peut faire un vol ferry SI le PDG l'a débloqué (statut devient 'ground')
    // 3. Un avion bloqué (bloque) ne peut PAS faire de vol ferry (il faut d'abord le débloquer)
    // 4. Un avion en maintenance ne peut pas faire de vol ferry
    
    if (avion.statut === 'bloque') {
      return NextResponse.json({ 
        error: 'L\'avion est bloqué à 0% d\'usure. Débloquez-le d\'abord (bouton "Débloquer" dans la flotte) ou affrétez des techniciens.' 
      }, { status: 400 });
    }
    
    if (avion.statut === 'maintenance') {
      return NextResponse.json({ 
        error: 'L\'avion est en maintenance. Attendez la fin de la réparation.' 
      }, { status: 400 });
    }

    // Vérifier qu'il n'y a pas de plan de vol en cours pour cet avion
    const { count: plansEnCours } = await admin
      .from('plans_vol')
      .select('*', { count: 'exact', head: true })
      .eq('compagnie_avion_id', avion_id)
      .in('statut', ['depose', 'en_attente', 'accepte', 'en_cours', 'automonitoring', 'en_attente_cloture']);
    
    if (plansEnCours && plansEnCours > 0) {
      return NextResponse.json({ 
        error: 'Cet avion a un plan de vol en cours. Attendez la clôture du vol avant de créer un vol ferry.' 
      }, { status: 400 });
    }

    // Vérifier qu'il n'y a pas déjà un vol ferry en cours pour cet avion
    const { count: ferrysEnCours } = await admin
      .from('vols_ferry')
      .select('*', { count: 'exact', head: true })
      .eq('avion_id', avion_id)
      .in('statut', ['planned', 'in_progress']);
    
    if (ferrysEnCours && ferrysEnCours > 0) {
      return NextResponse.json({ 
        error: 'Cet avion a déjà un vol ferry en cours.' 
      }, { status: 400 });
    }
    
    // Si l'avion est au sol à 0% d'usure, c'est qu'il a été débloqué pour ferry
    const debloquePourFerry = avion.usure_percent === 0;

    // Calculer le coût selon le type de vol ferry
    let coutBase: number;
    let dureeMin: number | null = null;
    let finPrevueAt: string | null = null;

    if (isAuto) {
      // Vol ferry AUTOMATIQUE : coût et durée aléatoires
      const ferryAuto = calculerVolFerryAuto();
      coutBase = ferryAuto.cout;
      dureeMin = ferryAuto.dureeMin;
      finPrevueAt = new Date(Date.now() + dureeMin * 60 * 1000).toISOString();
    } else {
      // Vol ferry MANUEL : coût fixe 10K
      coutBase = COUT_VOL_FERRY;
    }

    // Récupérer les taxes de l'aéroport d'arrivée
    const { data: taxesData } = await admin.from('taxes_aeroport')
      .select('taxe_pourcent')
      .eq('code_oaci', aa)
      .single();
    
    // Taxe forfaitaire pour vol ferry (pas de revenu, donc calcul sur le coût de base)
    const tauxTaxe = taxesData?.taxe_pourcent || 2;
    const taxesAeroportuaires = Math.round(coutBase * tauxTaxe / 100);
    const coutTotal = coutBase + taxesAeroportuaires;

    // Vérifier le solde
    const { data: compte } = await admin
      .from('felitz_comptes')
      .select('id, solde')
      .eq('compagnie_id', compagnie_id)
      .eq('type', 'entreprise')
      .single();
    
    if (!compte) {
      return NextResponse.json({ error: 'Compte entreprise introuvable.' }, { status: 500 });
    }
    if (compte.solde < coutTotal) {
      return NextResponse.json({ 
        error: `Solde insuffisant. Coût du vol ferry : ${coutBase.toLocaleString('fr-FR')} F$ + ${taxesAeroportuaires.toLocaleString('fr-FR')} F$ de taxes = ${coutTotal.toLocaleString('fr-FR')} F$.` 
      }, { status: 400 });
    }

    // Créer le vol ferry
    const { data: vol, error } = await admin
      .from('vols_ferry')
      .insert({
        compagnie_id,
        avion_id,
        aeroport_depart: avion.aeroport_actuel,
        aeroport_arrivee: aa,
        pilote_id: isAuto ? null : user.id, // Pas de pilote pour les vols auto
        statut: isAuto ? 'in_progress' : 'planned', // Auto = directement en cours
        cout_ferry: coutTotal,
        debloque_pour_ferry: debloquePourFerry,
        automatique: isAuto,
        duree_prevue_min: dureeMin,
        fin_prevue_at: finPrevueAt,
      })
      .select('id')
      .single();

    if (error) return NextResponse.json({ error: error.message }, { status: 400 });

    // Débiter le compte
    const nouveauSolde = compte.solde - coutTotal;
    const { error: debitErr } = await admin
      .from('felitz_comptes')
      .update({ solde: nouveauSolde })
      .eq('id', compte.id);
    
    if (debitErr) {
      await admin.from('vols_ferry').delete().eq('id', vol.id);
      return NextResponse.json({ error: 'Erreur lors du débit.' }, { status: 500 });
    }

    // Créer une transaction pour le vol ferry
    const typeVol = isAuto ? 'Vol ferry automatique' : 'Vol ferry';
    await admin.from('felitz_transactions').insert({
      compte_id: compte.id,
      type: 'debit',
      montant: coutBase,
      libelle: `${typeVol} ${avion.aeroport_actuel} → ${aa}`,
    });

    // Créer une transaction pour les taxes
    if (taxesAeroportuaires > 0) {
      await admin.from('felitz_transactions').insert({
        compte_id: compte.id,
        type: 'debit',
        montant: taxesAeroportuaires,
        libelle: `Taxes aéroportuaires ${aa} (${typeVol.toLowerCase()})`,
      });
    }

    // Mettre l'avion en vol
    await admin.from('compagnie_avions').update({ statut: 'in_flight' }).eq('id', avion_id);

    // Formater la durée pour l'affichage
    let dureeText = '';
    if (dureeMin) {
      const heures = Math.floor(dureeMin / 60);
      const minutes = dureeMin % 60;
      dureeText = heures > 0 
        ? `${heures}h${minutes > 0 ? minutes.toString().padStart(2, '0') : ''}` 
        : `${minutes} min`;
    }

    return NextResponse.json({ 
      ok: true, 
      id: vol.id, 
      cout: coutTotal, 
      taxes: taxesAeroportuaires,
      automatique: isAuto,
      duree_min: dureeMin,
      duree_text: dureeText,
      fin_prevue_at: finPrevueAt,
      message: isAuto 
        ? `Vol ferry automatique lancé ! Coût : ${coutTotal.toLocaleString('fr-FR')} F$. L'avion arrivera à ${aa} dans ${dureeText}.`
        : `Vol ferry créé. Coût : ${coutTotal.toLocaleString('fr-FR')} F$.`
    });
  } catch (e) {
    console.error('POST compagnies/vols-ferry:', e);
    return NextResponse.json({ error: 'Erreur serveur' }, { status: 500 });
  }
}
