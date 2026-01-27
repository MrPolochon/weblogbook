import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { NextResponse } from 'next/server';
import { CODES_OACI_VALIDES, getCargaisonInfo, TypeCargaison } from '@/lib/aeroports-ptfs';
import { ATC_POSITIONS } from '@/lib/atc-positions';
import { calculerUsureVol } from '@/lib/compagnie-utils';

const STATUTS_OUVERTS = ['depose', 'en_attente', 'accepte', 'en_cours', 'automonitoring'];
const ORDRE_ACCEPTATION_PLANS = ['Delivery', 'Clairance', 'Ground', 'Tower', 'DEP', 'APP', 'Center'] as const;

/**
 * Calcule le coefficient de ponctualité basé sur l'écart entre temps prévu et temps réel.
 * 
 * Pour les vols cargo, le type de cargaison affecte la sensibilité au retard :
 * - Colis express (⚡) : double pénalité si retard/avance
 * - Denrées périssables (🧊) : double pénalité si retard/avance
 * - Autres types : pénalité normale
 * 
 * @param tempsPrevuMin Temps de vol prévu en minutes
 * @param tempsReelMin Temps de vol réel en minutes
 * @param typeCargaison Type de cargaison (optionnel, pour vols cargo)
 */
function calculerCoefficientPonctualite(
  tempsPrevuMin: number, 
  tempsReelMin: number,
  typeCargaison?: TypeCargaison | null
): number {
  const ecart = Math.abs(tempsReelMin - tempsPrevuMin);
  if (ecart <= 5) return 1.0;
  
  // Multiplicateur de sensibilité pour le cargo
  let sensibilite = 1.0;
  if (typeCargaison) {
    const cargaisonInfo = getCargaisonInfo(typeCargaison);
    sensibilite = cargaisonInfo.sensibiliteRetard;
  }
  
  // Pénalité de base : 3% par minute d'écart au-delà de 5 min
  // Avec sensibilité : express/périssables = 6% par minute (double)
  const penaliteParMinute = 3 * sensibilite;
  const penalitePct = Math.min((ecart - 5) * penaliteParMinute, 50 * sensibilite);
  
  // La pénalité maximale peut aller jusqu'à 100% pour les cargos sensibles
  const penaliteMax = Math.min(penalitePct, 100);
  
  return Math.max(0, 1.0 - (penaliteMax / 100));
}

/**
 * Enregistre qu'un ATC a contrôlé un plan de vol.
 */
async function enregistrerControleATC(
  admin: ReturnType<typeof createAdminClient>,
  planVolId: string,
  userId: string,
  aeroport: string,
  position: string
): Promise<void> {
  try {
    await admin.from('atc_plans_controles').upsert({
      plan_vol_id: planVolId,
      user_id: userId,
      aeroport,
      position
    }, { onConflict: 'plan_vol_id,user_id,aeroport,position' });
  } catch (e) {
    console.error('Erreur enregistrement controle ATC:', e);
  }
}

/**
 * Distribue les taxes aéroportuaires aux ATC qui ont contrôlé le vol.
 * - Si l'ATC est en service : accumule dans atc_taxes_pending (chèque à la fin du service)
 * - Si l'ATC est hors service : envoie le chèque immédiatement
 */
async function distribuerTaxesATC(
  admin: ReturnType<typeof createAdminClient>,
  planVolId: string,
  revenuBrut: number,
  aeroportArrivee: string,
  typeVol: string,
  numeroVol: string
): Promise<{ taxesTotales: number; atcPayes: number }> {
  // Récupérer les taxes de l'aéroport d'arrivée
  const { data: taxesData } = await admin.from('taxes_aeroport')
    .select('taxe_pourcent, taxe_vfr_pourcent')
    .eq('code_oaci', aeroportArrivee)
    .single();

  // Taux par défaut si pas configuré
  const tauxTaxe = typeVol === 'VFR' 
    ? (taxesData?.taxe_vfr_pourcent || 5) 
    : (taxesData?.taxe_pourcent || 2);

  const taxesTotales = Math.round(revenuBrut * tauxTaxe / 100);
  if (taxesTotales <= 0) return { taxesTotales: 0, atcPayes: 0 };

  // Récupérer tous les ATC qui ont contrôlé ce vol
  const { data: controles } = await admin.from('atc_plans_controles')
    .select('user_id, aeroport, position')
    .eq('plan_vol_id', planVolId);

  if (!controles || controles.length === 0) {
    return { taxesTotales, atcPayes: 0 };
  }

  // Grouper par aéroport pour partager équitablement
  const parAeroport: Record<string, { user_id: string; position: string }[]> = {};
  for (const c of controles) {
    if (!parAeroport[c.aeroport]) parAeroport[c.aeroport] = [];
    parAeroport[c.aeroport].push({ user_id: c.user_id, position: c.position });
  }

  const nbAeroports = Object.keys(parAeroport).length;
  const taxesParAeroport = Math.round(taxesTotales / nbAeroports);

  let atcPayes = 0;

  for (const [aeroport, positions] of Object.entries(parAeroport)) {
    const taxesParPosition = Math.round(taxesParAeroport / positions.length);
    if (taxesParPosition <= 0) continue;

    for (const { user_id } of positions) {
      // Vérifier si l'ATC est actuellement en service
      const { data: sessionAtc } = await admin.from('atc_sessions')
        .select('id')
        .eq('user_id', user_id)
        .single();

      if (sessionAtc) {
        // ATC en service → accumuler les taxes (chèque envoyé à la fin du service)
        await admin.from('atc_taxes_pending').insert({
          user_id,
          session_id: sessionAtc.id,
          plan_vol_id: planVolId,
          montant: taxesParPosition,
          aeroport,
          description: `Taxes vol ${numeroVol} - ${tauxTaxe}%`
        });
        atcPayes++;
      } else {
        // ATC hors service → envoyer le chèque immédiatement
        const { data: compteAtc } = await admin.from('felitz_comptes')
          .select('id')
          .eq('proprietaire_id', user_id)
          .eq('type', 'personnel')
          .single();

        if (!compteAtc) continue;

        await admin.from('messages').insert({
          destinataire_id: user_id,
          expediteur_id: null,
          titre: `Taxes aéroportuaires - Vol ${numeroVol}`,
          contenu: `Vous avez contrôlé le vol ${numeroVol} sur l'aéroport ${aeroport}.\n\nTaxe de ${tauxTaxe}% sur le revenu du vol.\nMontant de votre part: ${taxesParPosition.toLocaleString('fr-FR')} F$\n\nMerci pour votre service !`,
          type_message: 'cheque_taxes_atc',
          cheque_montant: taxesParPosition,
          cheque_encaisse: false,
          cheque_destinataire_compte_id: compteAtc.id,
          cheque_libelle: `Taxes vol ${numeroVol} (${aeroport})`,
          cheque_numero_vol: numeroVol,
          cheque_pour_compagnie: false
        });
        atcPayes++;
      }
    }
  }

  return { taxesTotales, atcPayes };
}

/**
 * Envoie des chèques lors de la clôture d'un vol commercial.
 */
async function envoyerChequesVol(
  admin: ReturnType<typeof createAdminClient>,
  plan: {
    id: string;
    pilote_id: string;
    vol_commercial: boolean;
    compagnie_id: string | null;
    revenue_brut: number | null;
    salaire_pilote: number | null;
    temps_prev_min: number;
    accepted_at: string | null;
    demande_cloture_at?: string | null;
    numero_vol?: string;
    aeroport_arrivee?: string;
    type_vol?: string;
    nature_transport?: string | null;
    type_cargaison?: string | null;
  },
  dateFinVol: Date // Date de fin du vol pour le calcul (demande_cloture_at, pas confirmation ATC)
): Promise<{ success: boolean; message?: string; revenus?: { brut: number; net: number; salaire: number; taxes: number; coefficient: number; tempsReel: number; bonusCargaison?: number } }> {
  if (!plan.vol_commercial || !plan.compagnie_id || !plan.revenue_brut || plan.revenue_brut <= 0) {
    return { success: true, message: 'Vol non commercial ou sans revenus' };
  }

  // Sécurité : vérifier que le plan a été accepté avant de payer
  // Note: Les vols en autosurveillance (vol_sans_atc) sont créés avec statut 'accepte' et accepted_at défini
  // Cette vérification est une sécurité supplémentaire
  if (!plan.accepted_at) {
    return { success: false, message: 'Le plan de vol doit être accepté avant le paiement.' };
  }

  // Calculer le temps réel depuis l'acceptation jusqu'à la demande de clôture par le pilote
  // On utilise dateFinVol qui correspond à demande_cloture_at (pas la confirmation ATC)
  let tempsReelMin = plan.temps_prev_min;
  if (plan.accepted_at) {
    const acceptedAt = new Date(plan.accepted_at);
    const diffMs = dateFinVol.getTime() - acceptedAt.getTime();
    tempsReelMin = Math.max(1, Math.round(diffMs / 60000));
  }

  // Pour les vols cargo, utiliser le type de cargaison pour le calcul de ponctualité
  const typeCargaison = plan.nature_transport === 'cargo' && plan.type_cargaison 
    ? plan.type_cargaison as TypeCargaison 
    : null;
  
  const coefficient = calculerCoefficientPonctualite(plan.temps_prev_min, tempsReelMin, typeCargaison);
  
  // Calculer le bonus de cargaison (matières dangereuses, surdimensionné = +1%)
  let bonusCargaison = 0;
  if (typeCargaison) {
    const cargaisonInfo = getCargaisonInfo(typeCargaison);
    bonusCargaison = cargaisonInfo.bonusRevenu;
  }
  
  // Revenu avec coefficient de ponctualité + bonus cargaison
  const revenuAvecCoef = Math.round(plan.revenue_brut * coefficient);
  const montantBonus = Math.round(revenuAvecCoef * bonusCargaison / 100);
  const revenuEffectif = revenuAvecCoef + montantBonus;
  
  // Distribuer les taxes aux ATC
  const numeroVol = plan.numero_vol || 'N/A';
  const { taxesTotales } = await distribuerTaxesATC(
    admin,
    plan.id,
    revenuEffectif,
    plan.aeroport_arrivee || '',
    plan.type_vol || 'IFR',
    numeroVol
  );

  // Revenu après taxes
  const revenuApresTaxes = revenuEffectif - taxesTotales;
  const salaireEffectif = Math.round((plan.salaire_pilote || 0) * coefficient);
  const revenuCompagnie = Math.max(0, revenuApresTaxes - salaireEffectif);

  const { data: compagnie } = await admin.from('compagnies')
    .select('nom, pdg_id')
    .eq('id', plan.compagnie_id)
    .single();

  if (!compagnie) {
    return { success: false, message: 'Compagnie introuvable' };
  }

  const { data: comptePilote } = await admin.from('felitz_comptes')
    .select('id')
    .eq('proprietaire_id', plan.pilote_id)
    .eq('type', 'personnel')
    .single();

  if (!comptePilote) {
    return { success: false, message: 'Compte Felitz du pilote introuvable' };
  }

  const { data: compteCompagnie } = await admin.from('felitz_comptes')
    .select('id')
    .eq('compagnie_id', plan.compagnie_id)
    .eq('type', 'entreprise')
    .single();

  if (!compteCompagnie) {
    return { success: false, message: 'Compte Felitz de la compagnie introuvable' };
  }

  const coeffPct = Math.round(coefficient * 100);

  // Chèque salaire pilote
  if (salaireEffectif > 0) {
    await admin.from('messages').insert({
      destinataire_id: plan.pilote_id,
      expediteur_id: null,
      titre: `Salaire vol ${numeroVol}`,
      contenu: `Félicitations pour votre vol ${numeroVol} effectué pour ${compagnie.nom} !\n\nTemps prévu: ${plan.temps_prev_min} min\nTemps réel: ${tempsReelMin} min\nCoefficient de ponctualité: ${coeffPct}%\nTaxes aéroportuaires: ${taxesTotales.toLocaleString('fr-FR')} F$\n\nVeuillez encaisser votre chèque de salaire ci-dessous.`,
      type_message: 'cheque_salaire',
      cheque_montant: salaireEffectif,
      cheque_encaisse: false,
      cheque_destinataire_compte_id: comptePilote.id,
      cheque_libelle: `Salaire vol ${numeroVol} (coef. ${coeffPct}%)`,
      cheque_numero_vol: numeroVol,
      cheque_compagnie_nom: compagnie.nom,
      cheque_pour_compagnie: false
    });
  }

  // Chèque revenu compagnie
  if (revenuCompagnie > 0 && compagnie.pdg_id) {
    await admin.from('messages').insert({
      destinataire_id: compagnie.pdg_id,
      expediteur_id: null,
      titre: `Revenu vol ${numeroVol} - ${compagnie.nom}`,
      contenu: `Le vol ${numeroVol} a été effectué avec succès !\n\nRevenu brut: ${plan.revenue_brut.toLocaleString('fr-FR')} F$\nCoefficient ponctualité: ${coeffPct}%\nTaxes aéroportuaires: ${taxesTotales.toLocaleString('fr-FR')} F$\nSalaire pilote: ${salaireEffectif.toLocaleString('fr-FR')} F$\nRevenu net: ${revenuCompagnie.toLocaleString('fr-FR')} F$\n\nVeuillez encaisser le chèque ci-dessous.`,
      type_message: 'cheque_revenu_compagnie',
      cheque_montant: revenuCompagnie,
      cheque_encaisse: false,
      cheque_destinataire_compte_id: compteCompagnie.id,
      cheque_libelle: `Revenu vol ${numeroVol} (coef. ${coeffPct}%)`,
      cheque_numero_vol: numeroVol,
      cheque_compagnie_nom: compagnie.nom,
      cheque_pour_compagnie: true
    });
  }

  return { 
    success: true, 
    revenus: { 
      brut: plan.revenue_brut, 
      net: revenuCompagnie, 
      salaire: salaireEffectif, 
      taxes: taxesTotales,
      coefficient,
      tempsReel: tempsReelMin,
      bonusCargaison: montantBonus > 0 ? montantBonus : undefined
    } 
  };
}

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Non autorise' }, { status: 401 });

    const body = await request.json();
    const { action } = body;

    const admin = createAdminClient();
    const { data: plan } = await admin.from('plans_vol')
      .select('id, pilote_id, statut, current_holder_user_id, current_holder_position, current_holder_aeroport, automonitoring, pending_transfer_aeroport, pending_transfer_position, pending_transfer_at, vol_commercial, compagnie_id, revenue_brut, salaire_pilote, temps_prev_min, accepted_at, numero_vol, aeroport_arrivee, type_vol, demande_cloture_at, vol_sans_atc, nature_transport, type_cargaison, compagnie_avion_id')
      .eq('id', id)
      .single();
    if (!plan) return NextResponse.json({ error: 'Plan de vol introuvable.' }, { status: 404 });

    if (action === 'cloture') {
      const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).single();
      if (profile?.role === 'atc') return NextResponse.json({ error: 'Cloture reservee au pilote.' }, { status: 403 });
      if (plan.pilote_id !== user.id) return NextResponse.json({ error: 'Ce plan de vol ne vous appartient pas.' }, { status: 403 });
      if (plan.statut === 'refuse' || plan.statut === 'cloture') return NextResponse.json({ error: 'Ce plan ne peut pas etre cloture.' }, { status: 400 });
      if (!STATUTS_OUVERTS.includes(plan.statut)) return NextResponse.json({ error: 'Statut invalide pour cloture.' }, { status: 400 });

      // Vérifier que le plan a été accepté avant de permettre la clôture avec paiement
      // Exception : autosurveillance (vol sans ATC) peut être clôturé directement
      const planAccepte = plan.accepted_at !== null || plan.automonitoring === true || plan.vol_sans_atc === true;
      
      // Si le plan n'a jamais été accepté et n'est pas en autosurveillance, on ne peut pas le clôturer
      if (!planAccepte && plan.statut !== 'automonitoring') {
        return NextResponse.json({ 
          error: 'Ce plan de vol n\'a jamais été accepté par un ATC. Vous ne pouvez pas le clôturer. Contactez un administrateur si nécessaire.' 
        }, { status: 400 });
      }

      // Clôture directe uniquement si :
      // - Autosurveillance (vol sans ATC ou automonitoring)
      // - Pas d'ATC assigné ET plan accepté (ATC déconnecté)
      // 
      // Si un ATC contrôle le vol (current_holder_user_id défini), 
      // le pilote doit demander la clôture et l'ATC doit confirmer
      const isAutoSurveillance = plan.automonitoring === true || plan.vol_sans_atc === true;
      const pasAtcAssigne = !plan.current_holder_user_id;
      const closDirect = isAutoSurveillance || (pasAtcAssigne && planAccepte);
      
      const newStatut = closDirect ? 'cloture' : 'en_attente_cloture';
      const demandeClotureAt = new Date();
      const payload: { statut: string; cloture_at?: string; demande_cloture_at: string } = { 
        statut: newStatut,
        demande_cloture_at: demandeClotureAt.toISOString() // Toujours enregistrer quand le pilote demande
      };
      
      let paiementResult = null;
      let usureAppliquee = 0;
      
      if (newStatut === 'cloture') {
        payload.cloture_at = demandeClotureAt.toISOString();
        // Utiliser demande_cloture_at pour le calcul du temps réel
        paiementResult = await envoyerChequesVol(admin, { ...plan, demande_cloture_at: demandeClotureAt.toISOString() }, demandeClotureAt);
        if (!paiementResult.success) {
          console.error('Erreur paiement vol:', paiementResult.message);
        }
        
        // Appliquer l'usure à l'avion individuel si utilisé
        if ((plan as any).compagnie_avion_id) {
          const { data: avion } = await admin
            .from('compagnie_avions')
            .select('id, usure_percent')
            .eq('id', (plan as any).compagnie_avion_id)
            .single();
          
          if (avion) {
            // Calculer le temps réel de vol
            let tempsReelMin = plan.temps_prev_min;
            if (plan.accepted_at) {
              const acceptedAt = new Date(plan.accepted_at);
              const diffMs = demandeClotureAt.getTime() - acceptedAt.getTime();
              tempsReelMin = Math.max(1, Math.round(diffMs / 60000));
            }
            
            // Calculer et appliquer l'usure
            usureAppliquee = calculerUsureVol(tempsReelMin);
            const nouvelleUsure = Math.max(0, avion.usure_percent - usureAppliquee);
            const nouveauStatut = nouvelleUsure === 0 ? 'bloque' : 'ground';
            
            await admin
              .from('compagnie_avions')
              .update({
                usure_percent: nouvelleUsure,
                aeroport_actuel: plan.aeroport_arrivee,
                statut: nouveauStatut,
              })
              .eq('id', avion.id);
          }
        }
      }

      const { error } = await admin.from('plans_vol').update(payload).eq('id', id);
      if (error) return NextResponse.json({ error: error.message }, { status: 400 });
      return NextResponse.json({ ok: true, statut: newStatut, direct: closDirect, paiement: paiementResult, usure_appliquee: usureAppliquee });
    }

    if (action === 'confirmer_cloture') {
      const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).single();
      const isAdmin = profile?.role === 'admin';
      const isHolder = plan.current_holder_user_id === user.id;
      const canAtc = isAdmin || isHolder;
      if (!canAtc) return NextResponse.json({ error: 'Seul l\'ATC qui detient le plan ou un admin peut confirmer la cloture.' }, { status: 403 });
      if (plan.statut !== 'en_attente_cloture') return NextResponse.json({ error: 'Aucune demande de cloture en attente.' }, { status: 400 });

      const confirmationAt = new Date();
      // IMPORTANT: Utiliser demande_cloture_at pour le calcul du temps réel, pas la date de confirmation
      // Cela évite que le retard de l'ATC à confirmer pénalise le pilote
      const dateCalculTemps = plan.demande_cloture_at ? new Date(plan.demande_cloture_at) : confirmationAt;
      
      const paiementResult = await envoyerChequesVol(admin, plan, dateCalculTemps);
      if (!paiementResult.success) {
        console.error('Erreur paiement vol:', paiementResult.message);
      }

      // Appliquer l'usure à l'avion individuel si utilisé
      let usureAppliquee = 0;
      if ((plan as any).compagnie_avion_id) {
        const { data: avion } = await admin
          .from('compagnie_avions')
          .select('id, usure_percent')
          .eq('id', (plan as any).compagnie_avion_id)
          .single();
        
        if (avion) {
          // Calculer le temps réel de vol (depuis accepted_at jusqu'à demande_cloture_at)
          let tempsReelMin = plan.temps_prev_min;
          if (plan.accepted_at && plan.demande_cloture_at) {
            const acceptedAt = new Date(plan.accepted_at);
            const demandeCloture = new Date(plan.demande_cloture_at);
            const diffMs = demandeCloture.getTime() - acceptedAt.getTime();
            tempsReelMin = Math.max(1, Math.round(diffMs / 60000));
          }
          
          // Calculer et appliquer l'usure
          usureAppliquee = calculerUsureVol(tempsReelMin);
          const nouvelleUsure = Math.max(0, avion.usure_percent - usureAppliquee);
          const nouveauStatut = nouvelleUsure === 0 ? 'bloque' : 'ground';
          
          await admin
            .from('compagnie_avions')
            .update({
              usure_percent: nouvelleUsure,
              aeroport_actuel: plan.aeroport_arrivee,
              statut: nouveauStatut,
            })
            .eq('id', avion.id);
        }
      }

      const { error } = await admin.from('plans_vol').update({ statut: 'cloture', cloture_at: confirmationAt.toISOString() }).eq('id', id);
      if (error) return NextResponse.json({ error: error.message }, { status: 400 });
      return NextResponse.json({ ok: true, paiement: paiementResult, usure_appliquee: usureAppliquee });
    }

    if (action === 'accepter') {
      const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).single();
      const isAdmin = profile?.role === 'admin';
      const isHolder = plan.current_holder_user_id === user.id;
      const canAtc = isAdmin || isHolder;
      if (!canAtc) return NextResponse.json({ error: 'Seul l\'ATC qui detient le plan ou un admin peut accepter.' }, { status: 403 });
      if (plan.statut !== 'en_attente' && plan.statut !== 'depose') return NextResponse.json({ error: 'Ce plan n\'est pas en attente.' }, { status: 400 });

      // Enregistrer que cet ATC a contrôlé ce vol
      if (plan.current_holder_user_id && plan.current_holder_aeroport && plan.current_holder_position) {
        await enregistrerControleATC(admin, id, plan.current_holder_user_id, plan.current_holder_aeroport, plan.current_holder_position);
      }

      const { error } = await admin.from('plans_vol').update({ statut: 'accepte', accepted_at: new Date().toISOString() }).eq('id', id);
      if (error) return NextResponse.json({ error: error.message }, { status: 400 });
      return NextResponse.json({ ok: true });
    }

    if (action === 'refuser') {
      const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).single();
      const isAdmin = profile?.role === 'admin';
      const isHolder = plan.current_holder_user_id === user.id;
      const canAtc = isAdmin || isHolder;
      if (!canAtc) return NextResponse.json({ error: 'Seul l\'ATC qui detient le plan ou un admin peut refuser.' }, { status: 403 });
      if (plan.statut !== 'en_attente' && plan.statut !== 'depose') return NextResponse.json({ error: 'Ce plan n\'est pas en attente.' }, { status: 400 });
      const reason = body.refusal_reason != null ? String(body.refusal_reason).trim() : '';
      if (!reason) return NextResponse.json({ error: 'La raison du refus est obligatoire.' }, { status: 400 });

      const { error } = await admin.from('plans_vol').update({ statut: 'refuse', refusal_reason: reason }).eq('id', id);
      if (error) return NextResponse.json({ error: error.message }, { status: 400 });
      return NextResponse.json({ ok: true });
    }

    if (action === 'modifier_et_renvoyer') {
      const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).single();
      if (profile?.role === 'atc') return NextResponse.json({ error: 'Reserve au pilote.' }, { status: 403 });
      if (plan.pilote_id !== user.id) return NextResponse.json({ error: 'Ce plan de vol ne vous appartient pas.' }, { status: 403 });
      if (plan.statut !== 'refuse') return NextResponse.json({ error: 'Seul un plan refuse peut etre modifie et renvoye.' }, { status: 400 });

      const { aeroport_depart, aeroport_arrivee, numero_vol, porte, temps_prev_min, type_vol, intentions_vol, sid_depart, star_arrivee } = body;
      const ad = String(aeroport_depart || '').toUpperCase();
      const aa = String(aeroport_arrivee || '').toUpperCase();
      if (!CODES_OACI_VALIDES.has(ad) || !CODES_OACI_VALIDES.has(aa)) return NextResponse.json({ error: 'Aeroports invalides.' }, { status: 400 });
      if (!numero_vol || typeof numero_vol !== 'string' || !String(numero_vol).trim()) return NextResponse.json({ error: 'Numero de vol requis.' }, { status: 400 });
      const t = parseInt(String(temps_prev_min), 10);
      if (isNaN(t) || t < 1) return NextResponse.json({ error: 'Temps prevu invalide (minutes >= 1).' }, { status: 400 });
      if (!type_vol || !['VFR', 'IFR'].includes(String(type_vol))) return NextResponse.json({ error: 'Type de vol VFR ou IFR requis.' }, { status: 400 });
      if (String(type_vol) === 'VFR' && (!intentions_vol || !String(intentions_vol).trim())) return NextResponse.json({ error: 'Intentions de vol requises pour VFR.' }, { status: 400 });
      if (String(type_vol) === 'IFR') {
        if (!sid_depart || !String(sid_depart).trim()) return NextResponse.json({ error: 'SID de depart requise pour IFR.' }, { status: 400 });
        if (!star_arrivee || !String(star_arrivee).trim()) return NextResponse.json({ error: 'STAR d\'arrivee requise pour IFR.' }, { status: 400 });
      }

      const airportsToCheck = ad === aa ? [ad] : [ad, aa];
      let holder: { user_id: string; position: string; aeroport: string } | null = null;
      for (const apt of airportsToCheck) {
        for (const pos of ORDRE_ACCEPTATION_PLANS) {
          const { data: s } = await admin.from('atc_sessions').select('user_id').eq('aeroport', apt).eq('position', pos).single();
          if (s?.user_id) { holder = { user_id: s.user_id, position: pos, aeroport: apt }; break; }
        }
        if (holder) break;
      }
      if (!holder) return NextResponse.json({ error: 'Aucune frequence ATC de votre aeroport de depart ou d\'arrivee est en ligne. Reessayez plus tard.' }, { status: 400 });

      // Enregistrer le nouvel ATC qui reçoit le plan
      await enregistrerControleATC(admin, id, holder.user_id, holder.aeroport, holder.position);

      const { error: err } = await admin.from('plans_vol').update({
        aeroport_depart: ad,
        aeroport_arrivee: aa,
        numero_vol: String(numero_vol).trim(),
        porte: (porte != null && String(porte).trim() !== '') ? String(porte).trim() : null,
        temps_prev_min: t,
        type_vol: String(type_vol),
        intentions_vol: type_vol === 'VFR' ? String(intentions_vol).trim() : null,
        sid_depart: type_vol === 'IFR' ? String(sid_depart).trim() : null,
        star_arrivee: type_vol === 'IFR' ? String(star_arrivee).trim() : null,
        statut: 'en_attente',
        refusal_reason: null,
        instructions: null,
        current_holder_user_id: holder.user_id,
        current_holder_position: holder.position,
        current_holder_aeroport: holder.aeroport,
        automonitoring: false,
      }).eq('id', id);
      if (err) return NextResponse.json({ error: err.message }, { status: 400 });
      return NextResponse.json({ ok: true });
    }

    if (action === 'instructions') {
      const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).single();
      const isAdmin = profile?.role === 'admin';
      const isHolder = plan.current_holder_user_id === user.id;
      const canEdit = (isAdmin || isHolder) && !plan.automonitoring;
      if (!canEdit) return NextResponse.json({ error: 'Seul le detenteur du plan ou un admin peut modifier les instructions (pas en autosurveillance).' }, { status: 403 });
      if (plan.statut !== 'accepte' && plan.statut !== 'en_cours') return NextResponse.json({ error: 'Plan non accepte ou non en cours.' }, { status: 400 });
      const instructions = body.instructions != null ? String(body.instructions) : '';
      const { error: err } = await admin.from('plans_vol').update({ instructions: instructions.trim() || null }).eq('id', id);
      if (err) return NextResponse.json({ error: err.message }, { status: 400 });
      return NextResponse.json({ ok: true });
    }

    if (action === 'transferer') {
      const { data: profile } = await supabase.from('profiles').select('role, atc').eq('id', user.id).single();
      const isAdmin = profile?.role === 'admin';
      const isHolder = plan.current_holder_user_id === user.id;
      const canAtc = isAdmin || profile?.role === 'atc' || Boolean(profile?.atc);
      const canTransfer = isAdmin || isHolder || (plan.automonitoring && canAtc);
      if (!canTransfer) return NextResponse.json({ error: 'Seul le detenteur du plan, un admin, ou un ATC (si autosurveillance) peut transferer.' }, { status: 403 });
      const canTransferByStatut = ['accepte', 'en_cours'].includes(plan.statut) || plan.automonitoring
        || (['depose', 'en_attente'].includes(plan.statut) && (isHolder || isAdmin));
      if (!canTransferByStatut) return NextResponse.json({ error: 'Plan non accepte, non en cours ou non en autosurveillance.' }, { status: 400 });
      if (plan.automonitoring && !isAdmin) {
        const { data: atcSess } = await supabase.from('atc_sessions').select('id').eq('user_id', user.id).single();
        if (!atcSess) return NextResponse.json({ error: 'Mettez-vous en service pour prendre ou transferer un plan en autosurveillance.' }, { status: 403 });
      }

      if (body.automonitoring === true) {
        if (['depose', 'en_attente'].includes(plan.statut)) return NextResponse.json({ error: 'Impossible de mettre en autosurveillance un plan non encore accepte.' }, { status: 400 });
        const { error: err } = await admin.from('plans_vol').update({
          current_holder_user_id: null,
          current_holder_position: null,
          current_holder_aeroport: null,
          automonitoring: true,
          pending_transfer_aeroport: null,
          pending_transfer_position: null,
          pending_transfer_at: null,
        }).eq('id', id);
        if (err) return NextResponse.json({ error: err.message }, { status: 400 });
        return NextResponse.json({ ok: true });
      }

      const aeroport = String(body.aeroport || '').toUpperCase();
      const position = body.position;
      if (!aeroport || !position) return NextResponse.json({ error: 'Aeroport et position requis (ou automonitoring: true).' }, { status: 400 });
      if (!CODES_OACI_VALIDES.has(aeroport)) return NextResponse.json({ error: 'Aeroport invalide.' }, { status: 400 });
      if (!(ATC_POSITIONS as readonly string[]).includes(String(position))) return NextResponse.json({ error: 'Position invalide.' }, { status: 400 });
      if (plan.pending_transfer_aeroport != null) return NextResponse.json({ error: 'Un transfert est deja en attente d\'acceptation. Attendez 1 min ou l\'acceptation par la position cible.' }, { status: 400 });

      const { data: sess } = await admin.from('atc_sessions').select('user_id').eq('aeroport', aeroport).eq('position', String(position)).single();
      if (!sess?.user_id) return NextResponse.json({ error: 'Aucun ATC en ligne a cette position pour cet aeroport.' }, { status: 400 });

      const { error: err } = await admin.from('plans_vol').update({
        pending_transfer_aeroport: aeroport,
        pending_transfer_position: String(position),
        pending_transfer_at: new Date().toISOString(),
      }).eq('id', id);
      if (err) return NextResponse.json({ error: err.message }, { status: 400 });
      return NextResponse.json({ ok: true });
    }

    if (action === 'accepter_transfert') {
      const { data: sess } = await supabase.from('atc_sessions').select('aeroport, position').eq('user_id', user.id).single();
      if (!sess) return NextResponse.json({ error: 'Mettez-vous en service pour accepter un transfert.' }, { status: 403 });
      if (!plan.pending_transfer_aeroport || plan.pending_transfer_position !== sess.position || plan.pending_transfer_aeroport !== sess.aeroport)
        return NextResponse.json({ error: 'Ce transfert ne vous est pas destine ou a expire.' }, { status: 403 });
      const oneMinAgo = new Date(Date.now() - 60000).toISOString();
      if (plan.pending_transfer_at && plan.pending_transfer_at < oneMinAgo) return NextResponse.json({ error: 'Ce transfert a expire (1 min).' }, { status: 400 });

      // Enregistrer que cet ATC a contrôlé ce vol
      await enregistrerControleATC(admin, id, user.id, sess.aeroport, sess.position);

      const { error: err } = await admin.from('plans_vol').update({
        current_holder_user_id: user.id,
        current_holder_position: sess.position,
        current_holder_aeroport: sess.aeroport,
        automonitoring: false,
        pending_transfer_aeroport: null,
        pending_transfer_position: null,
        pending_transfer_at: null,
      }).eq('id', id);
      if (err) return NextResponse.json({ error: err.message }, { status: 400 });
      return NextResponse.json({ ok: true });
    }

    return NextResponse.json({ error: 'Action inconnue.' }, { status: 400 });
  } catch (e) {
    console.error('plans-vol PATCH:', e);
    return NextResponse.json({ error: 'Erreur serveur' }, { status: 500 });
  }
}

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Non autorise' }, { status: 401 });

    const admin = createAdminClient();
    const { data: plan } = await admin.from('plans_vol').select('id, pilote_id, statut').eq('id', id).single();
    if (!plan) return NextResponse.json({ error: 'Plan de vol introuvable.' }, { status: 404 });
    if (plan.pilote_id !== user.id) return NextResponse.json({ error: 'Ce plan ne vous appartient pas.' }, { status: 403 });
    if (plan.statut !== 'cloture') return NextResponse.json({ error: 'Seul un plan cloture peut etre supprime ainsi (ne pas enregistrer).' }, { status: 400 });

    const { error } = await admin.from('plans_vol').delete().eq('id', id);
    if (error) return NextResponse.json({ error: error.message }, { status: 400 });
    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error('plans-vol DELETE:', e);
    return NextResponse.json({ error: 'Erreur serveur' }, { status: 500 });
  }
}
