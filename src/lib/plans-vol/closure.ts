import { createAdminClient } from '@/lib/supabase/admin';
import { getCargaisonInfo, TypeCargaison } from '@/lib/aeroports-ptfs';
import { calculerUsureVol, TAUX_PRELEVEMENT_PRET } from '@/lib/compagnie-utils';

type AdminClient = ReturnType<typeof createAdminClient>;

type PlanPaiement = {
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
  location_loueur_compagnie_id?: string | null;
  location_pourcentage_revenu_loueur?: number | null;
  compagnie_avion_id?: string | null;
  current_afis_user_id?: string | null;
};

/**
 * Calcule le coefficient de ponctualité basé sur l'écart entre temps prévu et temps réel.
 * 
 * Règle business :
 * - 0 à 1 min d'écart => 100%
 * - Au-delà => décroissance exponentielle, peut atteindre 0
 */
function calculerCoefficientPonctualite(
  tempsPrevuMin: number,
  tempsReelMin: number,
  typeCargaison?: TypeCargaison | null
): number {
  const ecart = Math.abs(tempsReelMin - tempsPrevuMin);
  if (ecart <= 1) return 1.0;

  // Multiplicateur de sensibilité pour le cargo
  let sensibilite = 1.0;
  if (typeCargaison) {
    const cargaisonInfo = getCargaisonInfo(typeCargaison);
    sensibilite = cargaisonInfo.sensibiliteRetard;
  }

  // Décroissance exponentielle après 1 minute
  const k = 0.07 * sensibilite;
  const coeff = Math.exp(-k * (ecart - 1));
  const coeffArrondi = coeff < 0.01 ? 0 : coeff;

  return Math.max(0, Math.min(1, coeffArrondi));
}

/**
 * Distribue les taxes à l'AFIS qui surveille le vol (si applicable).
 * L'AFIS reçoit ses taxes immédiatement via un chèque.
 */
async function distribuerTaxesAFIS(
  admin: AdminClient,
  planVolId: string,
  afisUserId: string,
  taxesTotales: number,
  aeroportArrivee: string,
  numeroVol: string
): Promise<boolean> {
  if (taxesTotales <= 0) return false;

  // Vérifier si l'AFIS est en mode AFIS (pas pompier seul)
  const { data: afisSession } = await admin.from('afis_sessions')
    .select('id, est_afis, aeroport')
    .eq('user_id', afisUserId)
    .single();

  // Les pompiers seuls ne reçoivent pas de taxes, seulement les primes d'intervention
  if (!afisSession || !afisSession.est_afis) {
    return false;
  }

  // Récupérer le compte de l'AFIS
  const { data: compteAfis } = await admin.from('felitz_comptes')
    .select('id')
    .eq('proprietaire_id', afisUserId)
    .eq('type', 'personnel')
    .single();

  if (!compteAfis) return false;

  // Envoyer le chèque via la fonction SQL
  await admin.rpc('pay_siavi_taxes', {
    p_afis_user_id: afisUserId,
    p_vol_id: planVolId,
    p_aeroport: aeroportArrivee,
    p_montant: taxesTotales
  });

  return true;
}

/**
 * Distribue les taxes aéroportuaires aux ATC qui ont contrôlé le vol.
 * - Si l'ATC est en service : accumule dans atc_taxes_pending (chèque à la fin du service)
 * - Si l'ATC est hors service : envoie le chèque immédiatement
 */
async function distribuerTaxesATC(
  admin: AdminClient,
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
export async function envoyerChequesVol(
  admin: AdminClient,
  plan: PlanPaiement,
  dateFinVol: Date // Date de fin du vol pour le calcul (demande_cloture_at, pas confirmation ATC)
): Promise<{ success: boolean; message?: string; revenus?: { brut: number; net: number; salaire: number; taxes: number; coefficient: number; tempsReel: number; bonusCargaison?: number; remboursementPret?: number } }> {
  if (!plan.vol_commercial || !plan.compagnie_id || !plan.revenue_brut || plan.revenue_brut <= 0) {
    return { success: true, message: 'Vol non commercial ou sans revenus' };
  }

  // Sécurité : vérifier que le plan a été accepté avant de payer
  if (!plan.accepted_at) {
    return { success: false, message: 'Le plan de vol doit être accepté avant le paiement.' };
  }

  // Calculer le temps réel depuis l'acceptation jusqu'à la demande de clôture par le pilote
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

  // Distribuer les taxes aux ATC et/ou AFIS
  const numeroVol = plan.numero_vol || 'N/A';
  const baseTaxes = coefficient === 0 ? plan.revenue_brut : revenuEffectif;
  
  // D'abord distribuer aux ATC
  const { taxesTotales } = await distribuerTaxesATC(
    admin,
    plan.id,
    baseTaxes,
    plan.aeroport_arrivee || '',
    plan.type_vol || 'IFR',
    numeroVol
  );

  // Si un AFIS surveille ce vol et qu'aucun ATC n'a perçu les taxes, les donner à l'AFIS
  if (plan.current_afis_user_id && taxesTotales > 0) {
    // Vérifier si des ATC ont contrôlé ce vol
    const { data: controles } = await admin.from('atc_plans_controles')
      .select('id')
      .eq('plan_vol_id', plan.id)
      .limit(1);
    
    // Si aucun ATC n'a contrôlé, l'AFIS reçoit les taxes
    if (!controles || controles.length === 0) {
      await distribuerTaxesAFIS(
        admin,
        plan.id,
        plan.current_afis_user_id,
        taxesTotales,
        plan.aeroport_arrivee || '',
        numeroVol
      );
    }
  }

  // Revenu après taxes
  const revenuApresTaxes = revenuEffectif - taxesTotales;

  // Part loueur avant salaire (si location)
  const locationPct = plan.location_pourcentage_revenu_loueur || 0;
  const revenuLoueurBrut = plan.location_loueur_compagnie_id && locationPct > 0
    ? Math.max(0, Math.round(revenuApresTaxes * locationPct / 100))
    : 0;
  const revenuLocataireAvantSalaire = Math.max(0, revenuApresTaxes - revenuLoueurBrut);

  // Salaire payé par la compagnie locataire
  let salaireEffectif = Math.round((plan.salaire_pilote || 0) * coefficient);
  if (salaireEffectif > revenuLocataireAvantSalaire) {
    salaireEffectif = revenuLocataireAvantSalaire;
  }
  const revenuCompagnie = Math.max(0, revenuLocataireAvantSalaire - salaireEffectif);

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

  // Si ponctualité = 0 : le vol n'est pas rentable, débiter les taxes directement
  if (coefficient === 0 && taxesTotales > 0) {
    const { data: compteSolde } = await admin.from('felitz_comptes')
      .select('id, solde')
      .eq('id', compteCompagnie.id)
      .single();

    if (compteSolde) {
      const nouveauSolde = (compteSolde.solde || 0) - taxesTotales;
      await admin.from('felitz_comptes')
        .update({ solde: nouveauSolde })
        .eq('id', compteCompagnie.id);

      await admin.from('felitz_transactions').insert({
        compte_id: compteCompagnie.id,
        type: 'debit',
        montant: taxesTotales,
        description: `Taxes aéroportuaires (ponctualité 0) - Vol ${numeroVol}`,
        reference: `TAX-${plan.id.slice(0, 8)}`
      });

      if (compagnie.pdg_id) {
        await admin.from('messages').insert({
          destinataire_id: compagnie.pdg_id,
          expediteur_id: null,
          titre: `Taxes aéroportuaires - Vol ${numeroVol}`,
          contenu: `Le vol ${numeroVol} a un coefficient de ponctualité de 0%.\n\nLes taxes aéroportuaires (${taxesTotales.toLocaleString('fr-FR')} F$) ont été déduites directement du compte de la compagnie.`,
          type_message: 'notification'
        });
      }
    }
  }

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

  // Vérifier si la compagnie a un prêt actif
  let remboursementPret = 0;
  let pretInfo: { id: string; montant_total_du: number; montant_rembourse: number } | null = null;

  const { data: pretActif } = await admin
    .from('prets_bancaires')
    .select('id, montant_total_du, montant_rembourse')
    .eq('compagnie_id', plan.compagnie_id)
    .eq('statut', 'actif')
    .maybeSingle();

  if (pretActif && revenuCompagnie > 0) {
    pretInfo = pretActif;
    const resteARembourser = pretActif.montant_total_du - pretActif.montant_rembourse;

    if (resteARembourser > 0) {
      // Prélever TAUX_PRELEVEMENT_PRET% des revenus pour rembourser le prêt
      const prelevementMax = Math.round(revenuCompagnie * TAUX_PRELEVEMENT_PRET / 100);
      remboursementPret = Math.min(prelevementMax, resteARembourser);

      // Mettre à jour le prêt
      const nouveauMontantRembourse = pretActif.montant_rembourse + remboursementPret;
      const pretRembourse = nouveauMontantRembourse >= pretActif.montant_total_du;

      await admin.from('prets_bancaires')
        .update({
          montant_rembourse: nouveauMontantRembourse,
          statut: pretRembourse ? 'rembourse' : 'actif',
          rembourse_at: pretRembourse ? new Date().toISOString() : null,
        })
        .eq('id', pretActif.id);

      // Enregistrer la transaction de remboursement
      const libelleRemboursement = `Remboursement prêt - Vol ${numeroVol}`;
      await admin.from('felitz_transactions').insert({
        compte_id: compteCompagnie.id,
        type: 'debit',
        montant: remboursementPret,
        libelle: libelleRemboursement,
        description: libelleRemboursement,
        reference: `LOAN-PAY-${pretActif.id.slice(0, 8)}`,
      });
    }
  }

  // Revenu compagnie après remboursement prêt
  const revenuCompagnieNet = revenuCompagnie - remboursementPret;

  // Partage avec le loueur si avion en location
  let revenuLoueur = revenuLoueurBrut;
  let revenuLocataire = revenuCompagnieNet;
  let loueurInfo: { id: string; nom: string; pdg_id: string | null } | null = null;
  if (plan.location_loueur_compagnie_id && plan.location_pourcentage_revenu_loueur) {
    revenuLocataire = Math.max(0, revenuCompagnieNet);
    const { data: loueur } = await admin.from('compagnies')
      .select('id, nom, pdg_id')
      .eq('id', plan.location_loueur_compagnie_id)
      .single();
    loueurInfo = loueur || null;
  }

  // Chèque revenu compagnie
  if (revenuLocataire > 0 && compagnie.pdg_id) {
    let contenuMessage = `Le vol ${numeroVol} a été effectué avec succès !\n\nRevenu brut: ${plan.revenue_brut.toLocaleString('fr-FR')} F$\nCoefficient ponctualité: ${coeffPct}%\nTaxes aéroportuaires: ${taxesTotales.toLocaleString('fr-FR')} F$\nSalaire pilote: ${salaireEffectif.toLocaleString('fr-FR')} F$`;

    if (remboursementPret > 0) {
      const resteApres = (pretInfo?.montant_total_du || 0) - (pretInfo?.montant_rembourse || 0) - remboursementPret;
      contenuMessage += `\n\nRemboursement prêt: -${remboursementPret.toLocaleString('fr-FR')} F$ (${TAUX_PRELEVEMENT_PRET}%)`;
      if (resteApres <= 0) {
        contenuMessage += `\nPrêt intégralement remboursé !`;
      } else {
        contenuMessage += `\nReste à rembourser: ${resteApres.toLocaleString('fr-FR')} F$`;
      }
    }

    if (revenuLoueur > 0 && loueurInfo) {
      contenuMessage += `\n\nPart loueur (${plan.location_pourcentage_revenu_loueur}%): -${revenuLoueur.toLocaleString('fr-FR')} F$ (${loueurInfo.nom})`;
    }
    contenuMessage += `\n\nRevenu net: ${revenuLocataire.toLocaleString('fr-FR')} F$\n\nVeuillez encaisser le chèque ci-dessous.`;

    await admin.from('messages').insert({
      destinataire_id: compagnie.pdg_id,
      expediteur_id: null,
      titre: `Revenu vol ${numeroVol} - ${compagnie.nom}`,
      contenu: contenuMessage,
      type_message: 'cheque_revenu_compagnie',
      cheque_montant: revenuLocataire,
      cheque_encaisse: false,
      cheque_destinataire_compte_id: compteCompagnie.id,
      cheque_libelle: `Revenu vol ${numeroVol} (coef. ${coeffPct}%)${remboursementPret > 0 ? ' - après prêt' : ''}`,
      cheque_numero_vol: numeroVol,
      cheque_compagnie_nom: compagnie.nom,
      cheque_pour_compagnie: true
    });
  }

  if (revenuLoueur > 0 && loueurInfo?.pdg_id) {
    const { data: compteLoueur } = await admin.from('felitz_comptes')
      .select('id')
      .eq('compagnie_id', loueurInfo.id)
      .eq('type', 'entreprise')
      .single();
    if (compteLoueur) {
      await admin.from('messages').insert({
        destinataire_id: loueurInfo.pdg_id,
        expediteur_id: null,
        titre: `Revenu location - Vol ${numeroVol} (${compagnie.nom})`,
        contenu: `Part loueur: ${revenuLoueur.toLocaleString('fr-FR')} F$\n\nVol ${numeroVol} effectué par ${compagnie.nom}.`,
        type_message: 'cheque_revenu_compagnie',
        cheque_montant: revenuLoueur,
        cheque_encaisse: false,
        cheque_destinataire_compte_id: compteLoueur.id,
        cheque_libelle: `Location vol ${numeroVol}`,
        cheque_numero_vol: numeroVol,
        cheque_compagnie_nom: loueurInfo.nom,
        cheque_pour_compagnie: true
      });
    }
  } else if (remboursementPret > 0 && compagnie.pdg_id) {
    // Si tout le revenu est parti dans le remboursement, informer le PDG
    const resteApres = (pretInfo?.montant_total_du || 0) - (pretInfo?.montant_rembourse || 0) - remboursementPret;
    await admin.from('messages').insert({
      destinataire_id: compagnie.pdg_id,
      expediteur_id: null,
      titre: `Remboursement prêt - Vol ${numeroVol}`,
      contenu: `Le vol ${numeroVol} a été effectué.\n\nRevenu compagnie: ${revenuCompagnie.toLocaleString('fr-FR')} F$\nPrélevé pour le prêt: ${remboursementPret.toLocaleString('fr-FR')} F$ (${TAUX_PRELEVEMENT_PRET}%)\n\n${resteApres <= 0 ? 'Prêt intégralement remboursé !' : `Reste à rembourser: ${resteApres.toLocaleString('fr-FR')} F$`}`,
      type_message: 'notification',
    });
  }

  return {
    success: true,
    revenus: {
      brut: plan.revenue_brut,
      net: revenuCompagnieNet,
      salaire: salaireEffectif,
      taxes: taxesTotales,
      coefficient,
      tempsReel: tempsReelMin,
      bonusCargaison: montantBonus > 0 ? montantBonus : undefined,
      remboursementPret: remboursementPret > 0 ? remboursementPret : undefined
    }
  };
}

export async function finaliserCloturePlan(
  admin: AdminClient,
  plan: PlanPaiement,
  confirmationAt: Date
): Promise<{ success: boolean; paiementResult: Awaited<ReturnType<typeof envoyerChequesVol>>; usureAppliquee: number; error?: string }> {
  const dateCalculTemps = plan.demande_cloture_at ? new Date(plan.demande_cloture_at) : confirmationAt;

  const paiementResult = await envoyerChequesVol(admin, plan, dateCalculTemps);
  if (!paiementResult.success) {
    console.error('Erreur paiement vol:', paiementResult.message);
  }

  let usureAppliquee = 0;
  if (plan.compagnie_avion_id) {
    const { data: avion } = await admin
      .from('compagnie_avions')
      .select('id, usure_percent')
      .eq('id', plan.compagnie_avion_id)
      .single();

    if (avion) {
      let tempsReelMin = plan.temps_prev_min;
      if (plan.accepted_at && plan.demande_cloture_at) {
        const acceptedAt = new Date(plan.accepted_at);
        const demandeCloture = new Date(plan.demande_cloture_at);
        const diffMs = demandeCloture.getTime() - acceptedAt.getTime();
        tempsReelMin = Math.max(1, Math.round(diffMs / 60000));
      }

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

  const { error } = await admin.from('plans_vol').update({
    statut: 'cloture',
    cloture_at: confirmationAt.toISOString()
  }).eq('id', plan.id);

  if (error) {
    return { success: false, paiementResult, usureAppliquee, error: error.message };
  }

  return { success: true, paiementResult, usureAppliquee };
}
