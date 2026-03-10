import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { NextResponse } from 'next/server';
import { CODES_OACI_VALIDES, genererTypeCargaison, genererTypeCargaisonComplementaire, getCargaisonInfo, getMarchandiseRareAleatoire } from '@/lib/aeroports-ptfs';
import { COUT_VOL_FERRY } from '@/lib/compagnie-utils';

// Ordre de priorité pour recevoir un nouveau plan de vol
// AÉROPORT DE DÉPART : Delivery → Clairance → Ground → Tower → DEP → APP → Center
const ORDRE_DEPART = ['Delivery', 'Clairance', 'Ground', 'Tower', 'DEP', 'APP', 'Center'] as const;

// AÉROPORT D'ARRIVÉE (priorité APP avant Center)
const ORDRE_ARRIVEE = ['Delivery', 'APP', 'DEP', 'Tower', 'Ground', 'Clairance', 'Center'] as const;

export async function POST(request: Request) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Non autorisé' }, { status: 401 });
    const { data: profile } = await supabase.from('profiles').select('role, sanction_blocage_vol, sanction_blocage_motif, sanction_blocage_jusqu_au').eq('id', user.id).single();
    if (profile?.role === 'atc') return NextResponse.json({ error: 'Compte ATC uniquement : dépôt de plan depuis l\'espace pilote impossible.' }, { status: 403 });
    
    // Vérifier si le pilote est bloqué par une sanction IFSA
    if (profile?.sanction_blocage_vol) {
      const blocageJusquAu = profile.sanction_blocage_jusqu_au ? new Date(profile.sanction_blocage_jusqu_au) : null;
      const maintenant = new Date();
      
      // Si le blocage a une date de fin et qu'elle est dépassée, le blocage n'est plus actif
      if (blocageJusquAu && blocageJusquAu < maintenant) {
        // Le blocage est expiré, on pourrait le lever ici mais on laisse le système de cron le faire
      } else {
        const motifLabels: Record<string, string> = {
          'suspension_temporaire': 'Suspension temporaire de licence',
          'suspension_licence': 'Suspension de licence',
          'retrait_licence': 'Retrait de licence'
        };
        const motifLabel = motifLabels[profile.sanction_blocage_motif || ''] || 'Sanction IFSA';
        const finBloc = blocageJusquAu ? ` jusqu'au ${blocageJusquAu.toLocaleDateString('fr-FR')}` : ' (durée indéterminée)';
        return NextResponse.json({ 
          error: `🚫 Vous êtes interdit de vol suite à une sanction IFSA : ${motifLabel}${finBloc}. Contactez l'IFSA pour plus d'informations.` 
        }, { status: 403 });
      }
    }

    const body = await request.json();
    const { 
      aeroport_depart, aeroport_arrivee, numero_vol, porte, temps_prev_min, type_vol, 
      intentions_vol, sid_depart, star_arrivee, route_ifr, note_atc,
      vol_commercial, compagnie_id, nature_transport, inventaire_avion_id,
      compagnie_avion_id, // Avion individuel avec localisation
      nb_pax_genere, cargo_kg_genere, revenue_brut, salaire_pilote, prix_billet_utilise,
      vol_sans_atc, vol_ferry
    } = body;
    const prixBilletUtilise = typeof prix_billet_utilise === 'number' ? prix_billet_utilise : parseInt(String(prix_billet_utilise || 0), 10) || 0;
    
    const ad = String(aeroport_depart || '').toUpperCase();
    const aa = String(aeroport_arrivee || '').toUpperCase();
    if (!CODES_OACI_VALIDES.has(ad) || !CODES_OACI_VALIDES.has(aa)) return NextResponse.json({ error: 'Aéroports invalides.' }, { status: 400 });
    if (!numero_vol || typeof numero_vol !== 'string' || !String(numero_vol).trim()) return NextResponse.json({ error: 'Numéro de vol requis.' }, { status: 400 });
    const t = parseInt(String(temps_prev_min), 10);
    if (isNaN(t) || t < 1) return NextResponse.json({ error: 'Temps prévu invalide (minutes ≥ 1).' }, { status: 400 });
    if (!type_vol || !['VFR', 'IFR'].includes(String(type_vol))) return NextResponse.json({ error: 'Type de vol VFR ou IFR requis.' }, { status: 400 });
    if (String(type_vol) === 'VFR' && (!intentions_vol || !String(intentions_vol).trim())) return NextResponse.json({ error: 'Intentions de vol requises pour VFR.' }, { status: 400 });
    if (String(type_vol) === 'IFR') {
      if (!sid_depart || !String(sid_depart).trim()) return NextResponse.json({ error: 'SID de départ requise pour IFR.' }, { status: 400 });
      if (!star_arrivee || !String(star_arrivee).trim()) return NextResponse.json({ error: 'STAR d\'arrivée requise pour IFR.' }, { status: 400 });
    }

    const admin = createAdminClient();

    // ── Normaliser le numéro de vol avec le code OACI de la compagnie ──
    let numeroVolFinal = String(numero_vol).trim().toUpperCase();
    if (compagnie_id) {
      const { data: compagnieData } = await admin.from('compagnies')
        .select('code_oaci')
        .eq('id', compagnie_id)
        .single();
      const prefix = compagnieData?.code_oaci?.toUpperCase();
      if (prefix) {
        // Retirer les séparateurs
        const cleaned = numeroVolFinal.replace(/[\s\-_./]+/g, '');
        if (cleaned.startsWith(prefix)) {
          // Commence déjà par le préfixe (ex: LUF2425) → garder tel quel
          numeroVolFinal = cleaned;
        } else if (/^\d+$/.test(cleaned)) {
          // Purement numérique (ex: 2425) → ajouter le préfixe
          numeroVolFinal = prefix + cleaned;
        } else {
          // Callsign mot/phrase (RAIDER, HAVOC 21, ZENITH...) → ne rien ajouter
          numeroVolFinal = cleaned;
        }
      }
    }

    // Utiliser les valeurs calculées côté client (le formulaire valide déjà le taux de remplissage)
    const cargoGenereFinal = cargo_kg_genere ?? 0;
    let revenuBrutFinal = revenue_brut ?? 0;
    let salaireFinal = salaire_pilote ?? 0;
    let typeCargaisonFinal: string | null = null;
    let typeCargaisonLibelleFinal: string | null = null;
    // Vol cargo : type de cargaison classique
    if (vol_commercial && nature_transport === 'cargo') {
      typeCargaisonFinal = genererTypeCargaison();
    }
    // Vol passagers avec cargo complémentaire : 1% chance marchandise rare (+30% sur part cargo)
    if (vol_commercial && nature_transport === 'passagers' && cargoGenereFinal > 0 && compagnie_id) {
      typeCargaisonFinal = genererTypeCargaisonComplementaire();
      if (typeCargaisonFinal === 'marchandise_rare') {
        typeCargaisonLibelleFinal = getMarchandiseRareAleatoire();
      }
      const { data: comp } = await admin.from('compagnies').select('prix_kg_cargo, pourcentage_salaire').eq('id', compagnie_id).single();
      const prixKgCargo = comp?.prix_kg_cargo ?? 0;
      const nbPax = Math.max(0, parseInt(String(nb_pax_genere || 0), 10) || 0);
      let revenuPax = nbPax * prixBilletUtilise;
      let revenuCargo = cargoGenereFinal * prixKgCargo;
      if (typeCargaisonFinal === 'marchandise_rare') {
        const bonus = getCargaisonInfo('marchandise_rare').bonusRevenu;
        revenuCargo = Math.round(revenuCargo * (1 + bonus / 100));
      }
      revenuBrutFinal = revenuPax + revenuCargo;
      salaireFinal = Math.floor(revenuBrutFinal * ((comp?.pourcentage_salaire ?? 0) / 100));
    }
    
    // Validation vol ferry
    if (vol_ferry) {
      if (!compagnie_avion_id) {
        return NextResponse.json({ error: 'Un vol ferry nécessite de sélectionner un avion spécifique.' }, { status: 400 });
      }
      if (!compagnie_id) {
        return NextResponse.json({ error: 'Un vol ferry doit être effectué pour une compagnie.' }, { status: 400 });
      }
    }

    // Coût vol ferry : débiter la compagnie à la création du plan
    let ferryCoutTotal = 0;
    if (vol_ferry && compagnie_id) {
      // Coût de base
      const coutBase = COUT_VOL_FERRY; // 10 000 F$
      // Taxes aéroportuaires sur l'arrivée
      const { data: taxesData } = await admin.from('taxes_aeroport')
        .select('taxe_pourcent')
        .eq('code_oaci', aa)
        .single();
      const tauxTaxe = taxesData?.taxe_pourcent || 2;
      const taxesFerry = Math.round(coutBase * tauxTaxe / 100);
      ferryCoutTotal = coutBase + taxesFerry;

      // Vérifier le solde
      const { data: compteFerry } = await admin
        .from('felitz_comptes')
        .select('id, solde')
        .eq('compagnie_id', compagnie_id)
        .eq('type', 'entreprise')
        .single();

      if (!compteFerry) {
        return NextResponse.json({ error: 'Compte entreprise introuvable.' }, { status: 500 });
      }
      if (compteFerry.solde < ferryCoutTotal) {
        return NextResponse.json({
          error: `Solde insuffisant pour le vol ferry. Coût : ${coutBase.toLocaleString('fr-FR')} F$ + ${taxesFerry.toLocaleString('fr-FR')} F$ de taxes = ${ferryCoutTotal.toLocaleString('fr-FR')} F$.`
        }, { status: 400 });
      }

      const { data: ferryDebitOk } = await admin.rpc('debiter_compte_safe', { p_compte_id: compteFerry.id, p_montant: ferryCoutTotal });
      if (!ferryDebitOk) {
        return NextResponse.json({ error: 'Solde insuffisant (transaction concurrente)' }, { status: 400 });
      }

      // Transaction pour le coût de base
      await admin.from('felitz_transactions').insert({
        compte_id: compteFerry.id,
        type: 'debit',
        montant: coutBase,
        libelle: `Vol ferry ${ad} → ${aa}`,
      });

      // Transaction pour les taxes
      if (taxesFerry > 0) {
        await admin.from('felitz_transactions').insert({
          compte_id: compteFerry.id,
          type: 'debit',
          montant: taxesFerry,
          libelle: `Taxes aéroportuaires ${aa} (vol ferry)`,
        });
      }
    }

    // Validation avion individuel (si utilisé)
    if (compagnie_avion_id) {
      const { data: avionIndiv } = await admin
        .from('compagnie_avions')
        .select('id, compagnie_id, aeroport_actuel, statut, usure_percent, immatriculation')
        .eq('id', compagnie_avion_id)
        .single();
      
      if (!avionIndiv) {
        return NextResponse.json({ error: 'Avion individuel introuvable.' }, { status: 400 });
      }
      
      const nowIso = new Date().toISOString();
      let locationActive: any = null;

      if (compagnie_id && avionIndiv.compagnie_id !== compagnie_id) {
        const { data: loc } = await admin
          .from('compagnie_locations')
          .select('*')
          .eq('avion_id', compagnie_avion_id)
          .eq('locataire_compagnie_id', compagnie_id)
          .eq('statut', 'active')
          .lte('start_at', nowIso)
          .gte('end_at', nowIso)
          .maybeSingle();
        locationActive = loc;
        if (!locationActive) {
          return NextResponse.json({ error: 'Cet avion n\'appartient pas à la compagnie sélectionnée.' }, { status: 400 });
        }
      } else if (compagnie_id && avionIndiv.compagnie_id === compagnie_id) {
        const { data: leasedOut } = await admin
          .from('compagnie_locations')
          .select('id')
          .eq('avion_id', compagnie_avion_id)
          .eq('statut', 'active')
          .lte('start_at', nowIso)
          .gte('end_at', nowIso)
          .neq('locataire_compagnie_id', compagnie_id)
          .maybeSingle();
        if (leasedOut) {
          return NextResponse.json({ error: 'Cet avion est actuellement loué à une autre compagnie.' }, { status: 400 });
        }
      }

      // Si location active, débiter le loyer journalier dû
      if (locationActive) {
        const lastBilledAt = locationActive.last_billed_at || locationActive.start_at;
        const last = lastBilledAt ? new Date(lastBilledAt).getTime() : new Date().getTime();
        const now = new Date().getTime();
        const daysDue = Math.floor((now - last) / (24 * 60 * 60 * 1000));
        if (daysDue > 0) {
          const totalDue = daysDue * (locationActive.prix_journalier || 0);
          if (totalDue > 0) {
            const { data: compteLocataire } = await admin
              .from('felitz_comptes')
              .select('id, solde')
              .eq('compagnie_id', compagnie_id)
              .eq('type', 'entreprise')
              .single();
            if (!compteLocataire) {
              return NextResponse.json({ error: 'Compte entreprise locataire introuvable.' }, { status: 400 });
            }
            if (compteLocataire.solde < totalDue) {
              return NextResponse.json({ error: 'Solde insuffisant pour payer le loyer journalier.' }, { status: 400 });
            }
            const { data: loyerDebitOk } = await admin.rpc('debiter_compte_safe', { p_compte_id: compteLocataire.id, p_montant: totalDue });
            if (!loyerDebitOk) {
              return NextResponse.json({ error: 'Solde insuffisant pour le loyer (transaction concurrente)' }, { status: 400 });
            }
            await admin.from('felitz_transactions').insert({
              compte_id: compteLocataire.id,
              type: 'debit',
              montant: totalDue,
              libelle: `Loyer avion (${daysDue}j)`
            });
            await admin.from('compagnie_locations')
              .update({ last_billed_at: new Date(last + daysDue * 24 * 60 * 60 * 1000).toISOString() })
              .eq('id', locationActive.id);
          }
        }
      }
      
      // Vérifier que l'avion est à l'aéroport de départ
      if (avionIndiv.aeroport_actuel !== ad) {
        return NextResponse.json({ 
          error: `L'avion ${avionIndiv.immatriculation} se trouve actuellement à ${avionIndiv.aeroport_actuel}, pas à ${ad}. Vous devez effectuer un vol ferry pour le déplacer.` 
        }, { status: 400 });
      }
      
      // Vérifier que l'avion n'est pas déjà en vol ou bloqué
      if (avionIndiv.statut === 'in_flight') {
        return NextResponse.json({ 
          error: `L'avion ${avionIndiv.immatriculation} est actuellement en vol.` 
        }, { status: 400 });
      }
      if (avionIndiv.statut === 'bloque') {
        return NextResponse.json({ 
          error: `L'avion ${avionIndiv.immatriculation} est bloqué (0% d'usure). Faites-le réparer avant de voler.` 
        }, { status: 400 });
      }
      if (avionIndiv.statut === 'maintenance') {
        return NextResponse.json({ 
          error: `L'avion ${avionIndiv.immatriculation} est en maintenance.` 
        }, { status: 400 });
      }
      
      // Vérifier qu'il n'y a pas déjà un plan de vol en cours pour cet avion
      const { count: plansEnCours } = await admin
        .from('plans_vol')
        .select('*', { count: 'exact', head: true })
        .eq('compagnie_avion_id', compagnie_avion_id)
        .in('statut', ['depose', 'en_attente', 'accepte', 'en_cours', 'automonitoring', 'en_attente_cloture']);
      
      if (plansEnCours && plansEnCours > 0) {
        return NextResponse.json({ 
          error: `L'avion ${avionIndiv.immatriculation} a déjà un plan de vol en cours.` 
        }, { status: 400 });
      }

      // Vérifier qu'il n'y a pas de vol ferry en cours pour cet avion
      const { count: ferrysEnCours } = await admin
        .from('vols_ferry')
        .select('*', { count: 'exact', head: true })
        .eq('avion_id', compagnie_avion_id)
        .in('statut', ['planned', 'in_progress']);
      
      if (ferrysEnCours && ferrysEnCours > 0) {
        return NextResponse.json({ 
          error: `L'avion ${avionIndiv.immatriculation} a un vol ferry en cours. Attendez sa clôture.` 
        }, { status: 400 });
      }
    }
    
    // Si vol sans ATC, accepter automatiquement et mettre en autosurveillance
    if (vol_sans_atc) {
      const locationFields = compagnie_avion_id && compagnie_id
        ? await admin.from('compagnie_locations')
            .select('*')
            .eq('avion_id', compagnie_avion_id)
            .eq('locataire_compagnie_id', compagnie_id)
            .eq('statut', 'active')
            .lte('start_at', new Date().toISOString())
            .gte('end_at', new Date().toISOString())
            .maybeSingle()
        : { data: null };
      const { data, error } = await admin.from('plans_vol').insert({
        pilote_id: user.id,
        aeroport_depart: ad,
        aeroport_arrivee: aa,
        numero_vol: numeroVolFinal,
        porte: (porte != null && String(porte).trim() !== '') ? String(porte).trim() : null,
        temps_prev_min: t,
        type_vol: String(type_vol),
        intentions_vol: type_vol === 'VFR' ? String(intentions_vol).trim() : null,
        sid_depart: type_vol === 'IFR' ? String(sid_depart).trim() : null,
        star_arrivee: type_vol === 'IFR' ? String(star_arrivee).trim() : null,
        route_ifr: (type_vol === 'IFR' && route_ifr) ? String(route_ifr).trim() : null,
        note_atc: null, // Pas de note ATC pour les vols sans ATC
        vol_commercial: Boolean(vol_commercial) && !vol_ferry,
        compagnie_id: (vol_commercial || vol_ferry) && compagnie_id ? compagnie_id : null,
        nature_transport: vol_commercial && !vol_ferry && nature_transport ? nature_transport : null,
        inventaire_avion_id: !vol_commercial && inventaire_avion_id ? inventaire_avion_id : null,
        compagnie_avion_id: compagnie_avion_id || null,
        nb_pax_genere: vol_commercial ? (nb_pax_genere || 0) : null,
        cargo_kg_genere: vol_commercial ? cargoGenereFinal : null,
        type_cargaison: vol_commercial && (nature_transport === 'cargo' || (nature_transport === 'passagers' && cargoGenereFinal > 0)) ? typeCargaisonFinal : null,
        type_cargaison_libelle: typeCargaisonLibelleFinal,
        revenue_brut: vol_commercial ? revenuBrutFinal : null,
        salaire_pilote: vol_commercial ? salaireFinal : null,
        prix_billet_utilise: vol_commercial ? (prix_billet_utilise || 0) : null,
        statut: 'accepte', // Directement accepté
        accepted_at: new Date().toISOString(), // Accepter automatiquement
        automonitoring: true, // Directement en autosurveillance
        current_holder_user_id: null,
        current_holder_position: null,
        current_holder_aeroport: null,
        vol_sans_atc: true,
        vol_ferry: Boolean(vol_ferry),
        location_id: locationFields.data?.id || null,
        location_loueur_compagnie_id: locationFields.data?.loueur_compagnie_id || null,
        location_pourcentage_revenu_loueur: locationFields.data?.pourcentage_revenu_loueur || null,
        location_prix_journalier: locationFields.data?.prix_journalier || null,
      }).select('id').single();

      if (error) return NextResponse.json({ error: error.message }, { status: 400 });

      // Consommer les passagers de l'aéroport de départ si vol commercial avec passagers
      if (vol_commercial && nb_pax_genere && nb_pax_genere > 0) {
        try {
          await admin.rpc('consommer_passagers_aeroport', { p_code_oaci: ad, p_passagers: nb_pax_genere });
        } catch (e) {
          // Si la fonction n'existe pas, faire manuellement
          const { data: current } = await admin.from('aeroport_passagers').select('passagers_disponibles').eq('code_oaci', ad).single();
          if (current) {
            const newValue = Math.max(0, current.passagers_disponibles - nb_pax_genere);
            await admin.from('aeroport_passagers').update({ passagers_disponibles: newValue, updated_at: new Date().toISOString() }).eq('code_oaci', ad);
          }
        }
      }

      // Consommer le cargo de l'aéroport de départ si vol commercial cargo ou passagers avec cargo complémentaire
      if (vol_commercial && cargoGenereFinal > 0 && (nature_transport === 'cargo' || nature_transport === 'passagers')) {
        try {
          await admin.rpc('consommer_cargo', { p_code_oaci: ad, p_quantite: cargoGenereFinal });
        } catch (e) {
          const { data: currentCargo } = await admin
            .from('aeroport_cargo')
            .select('cargo_disponible')
            .eq('code_oaci', ad)
            .single();
          if (currentCargo) {
            const newValue = Math.max(0, currentCargo.cargo_disponible - cargoGenereFinal);
            await admin.from('aeroport_cargo')
              .update({ cargo_disponible: newValue, updated_at: new Date().toISOString() })
              .eq('code_oaci', ad);
          }
        }
      }

      // Mettre l'avion individuel en vol (le trigger ne fonctionne qu'à l'UPDATE, pas INSERT)
      if (compagnie_avion_id) {
        await admin.from('compagnie_avions')
          .update({ statut: 'in_flight' })
          .eq('id', compagnie_avion_id);
      }

      return NextResponse.json({ ok: true, id: data.id, vol_sans_atc: true });
    }
    
    // Sinon, chercher un ATC pour recevoir le plan
    // OPTIMISÉ : Une seule requête pour récupérer toutes les sessions ATC actives
    let holder: { user_id: string; position: string; aeroport: string } | null = null;
    
    // Récupérer toutes les sessions ATC des deux aéroports en UNE SEULE requête
    const aeroportsCibles = aa !== ad ? [ad, aa] : [ad];
    const { data: allSessions } = await admin
      .from('atc_sessions')
      .select('user_id, position, aeroport')
      .in('aeroport', aeroportsCibles);
    
    if (allSessions && allSessions.length > 0) {
      // 1. Chercher à l'aéroport de DÉPART en priorité
      for (const pos of ORDRE_DEPART) {
        const session = allSessions.find(s => s.aeroport === ad && s.position === pos);
        if (session?.user_id) {
          holder = { user_id: session.user_id, position: pos, aeroport: ad };
          break;
        }
      }
      
      // 2. Si aucun ATC au départ et aéroport d'arrivée différent, chercher à l'ARRIVÉE
      if (!holder && aa !== ad) {
        for (const pos of ORDRE_ARRIVEE) {
          const session = allSessions.find(s => s.aeroport === aa && s.position === pos);
          if (session?.user_id) {
            holder = { user_id: session.user_id, position: pos, aeroport: aa };
            break;
          }
        }
      }
    }

    if (!holder) {
      return NextResponse.json({ error: 'Aucune fréquence ATC de votre aéroport de départ ou d\'arrivée est en ligne. Cochez "Voler sans ATC" pour effectuer ce vol en autosurveillance.' }, { status: 400 });
    }

    const locationFields = compagnie_avion_id && compagnie_id
      ? await admin.from('compagnie_locations')
          .select('*')
          .eq('avion_id', compagnie_avion_id)
          .eq('locataire_compagnie_id', compagnie_id)
          .eq('statut', 'active')
          .lte('start_at', new Date().toISOString())
          .gte('end_at', new Date().toISOString())
          .maybeSingle()
      : { data: null };

    const { data, error } = await admin.from('plans_vol').insert({
      pilote_id: user.id,
      aeroport_depart: ad,
      aeroport_arrivee: aa,
      numero_vol: numeroVolFinal,
      porte: (porte != null && String(porte).trim() !== '') ? String(porte).trim() : null,
      temps_prev_min: t,
      type_vol: String(type_vol),
      intentions_vol: type_vol === 'VFR' ? String(intentions_vol).trim() : null,
      sid_depart: type_vol === 'IFR' ? String(sid_depart).trim() : null,
      star_arrivee: type_vol === 'IFR' ? String(star_arrivee).trim() : null,
      route_ifr: (type_vol === 'IFR' && route_ifr) ? String(route_ifr).trim() : null,
      note_atc: note_atc ? String(note_atc).trim() : null,
      vol_commercial: Boolean(vol_commercial) && !vol_ferry,
      compagnie_id: (vol_commercial || vol_ferry) && compagnie_id ? compagnie_id : null,
      nature_transport: vol_commercial && !vol_ferry && nature_transport ? nature_transport : null,
      inventaire_avion_id: !vol_commercial && inventaire_avion_id ? inventaire_avion_id : null,
      compagnie_avion_id: compagnie_avion_id || null,
      nb_pax_genere: vol_commercial ? (nb_pax_genere || 0) : null,
      cargo_kg_genere: vol_commercial ? cargoGenereFinal : null,
      type_cargaison: vol_commercial && (nature_transport === 'cargo' || (nature_transport === 'passagers' && cargoGenereFinal > 0)) ? typeCargaisonFinal : null,
      type_cargaison_libelle: typeCargaisonLibelleFinal,
      revenue_brut: vol_commercial ? revenuBrutFinal : null,
      salaire_pilote: vol_commercial ? salaireFinal : null,
      prix_billet_utilise: vol_commercial ? (prix_billet_utilise || 0) : null,
      statut: 'en_attente',
      current_holder_user_id: holder.user_id,
      current_holder_position: holder.position,
      current_holder_aeroport: holder.aeroport,
      vol_sans_atc: false,
      vol_ferry: Boolean(vol_ferry),
      location_id: locationFields.data?.id || null,
      location_loueur_compagnie_id: locationFields.data?.loueur_compagnie_id || null,
      location_pourcentage_revenu_loueur: locationFields.data?.pourcentage_revenu_loueur || null,
      location_prix_journalier: locationFields.data?.prix_journalier || null,
    }).select('id').single();

    if (error) return NextResponse.json({ error: error.message }, { status: 400 });

    // Vérification de secours : si la session ATC a disparu juste après l'assignation
    if (holder) {
      const { data: sessionAtc } = await admin.from('atc_sessions')
        .select('id')
        .eq('user_id', holder.user_id)
        .eq('aeroport', holder.aeroport)
        .eq('position', holder.position)
        .maybeSingle();
      if (!sessionAtc) {
        await admin.from('plans_vol').update({
          current_holder_user_id: null,
          current_holder_position: null,
          current_holder_aeroport: null,
        }).eq('id', data.id);
      }
    }


    // Enregistrer que cet ATC a contrôlé ce plan de vol
    try {
      await admin.from('atc_plans_controles').upsert({
        plan_vol_id: data.id,
        user_id: holder.user_id,
        aeroport: holder.aeroport,
        position: holder.position
      }, { onConflict: 'plan_vol_id,user_id,aeroport,position' });
    } catch (e) {
      console.error('Erreur enregistrement controle ATC initial:', e);
    }

    // Consommer les passagers de l'aéroport de départ si vol commercial avec passagers
    if (vol_commercial && nb_pax_genere && nb_pax_genere > 0) {
      try {
        await admin.rpc('consommer_passagers_aeroport', { p_code_oaci: ad, p_passagers: nb_pax_genere });
      } catch (e) {
        // Si la fonction n'existe pas, faire manuellement
        const { data: current } = await admin.from('aeroport_passagers').select('passagers_disponibles').eq('code_oaci', ad).single();
        if (current) {
          const newValue = Math.max(0, current.passagers_disponibles - nb_pax_genere);
          await admin.from('aeroport_passagers').update({ passagers_disponibles: newValue, updated_at: new Date().toISOString() }).eq('code_oaci', ad);
        }
      }
    }

    // Consommer le cargo de l'aéroport de départ si vol commercial cargo ou passagers avec cargo complémentaire
    if (vol_commercial && cargoGenereFinal > 0 && (nature_transport === 'cargo' || nature_transport === 'passagers')) {
      try {
        await admin.rpc('consommer_cargo', { p_code_oaci: ad, p_quantite: cargoGenereFinal });
      } catch (e) {
        const { data: currentCargo } = await admin
          .from('aeroport_cargo')
          .select('cargo_disponible')
          .eq('code_oaci', ad)
          .single();
        if (currentCargo) {
          const newValue = Math.max(0, currentCargo.cargo_disponible - cargoGenereFinal);
          await admin.from('aeroport_cargo')
            .update({ cargo_disponible: newValue, updated_at: new Date().toISOString() })
            .eq('code_oaci', ad);
        }
      }
    }

    return NextResponse.json({ ok: true, id: data.id });
  } catch (e) {
    console.error('plans-vol POST:', e);
    return NextResponse.json({ error: 'Erreur serveur' }, { status: 500 });
  }
}
