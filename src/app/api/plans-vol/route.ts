import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { NextResponse } from 'next/server';
import { CODES_OACI_VALIDES, calculerCargoReel, getAeroportInfo } from '@/lib/aeroports-ptfs';

// Ordre de priorité pour recevoir un nouveau plan de vol (par aéroport) :
// Delivery et Clairance d'abord ; si les deux sont hors ligne, Ground peut accepter ;
// si Ground est hors ligne, Tower ; puis DEP, APP, Center.
const ORDRE_ACCEPTATION_PLANS = ['Delivery', 'Clairance', 'Ground', 'Tower', 'DEP', 'APP', 'Center'] as const;

export async function POST(request: Request) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Non autorisé' }, { status: 401 });
    const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).single();
    if (profile?.role === 'atc') return NextResponse.json({ error: 'Compte ATC uniquement : dépôt de plan depuis l\'espace pilote impossible.' }, { status: 403 });

    const body = await request.json();
    const { 
      aeroport_depart, aeroport_arrivee, numero_vol, porte, temps_prev_min, type_vol, 
      intentions_vol, sid_depart, star_arrivee, route_ifr, note_atc,
      vol_commercial, compagnie_id, nature_transport, flotte_avion_id, inventaire_avion_id,
      nb_pax_genere, cargo_kg_genere, revenue_brut, salaire_pilote, prix_billet_utilise,
      vol_sans_atc
    } = body;
    
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

    // Pré-calcul serveur pour les vols cargo (évite revenus à 0)
    let cargoGenereCalc: number | null = null;
    let revenuBrutCalc: number | null = null;
    let salaireCalc: number | null = null;

    if (vol_commercial && nature_transport === 'cargo' && compagnie_id && flotte_avion_id) {
      const { data: compagnie } = await admin
        .from('compagnies')
        .select('prix_kg_cargo, pourcentage_salaire')
        .eq('id', compagnie_id)
        .single();

      const { data: flotte } = await admin
        .from('compagnie_flotte')
        .select('capacite_cargo_custom, types_avion(capacite_cargo_kg)')
        .eq('id', flotte_avion_id)
        .single();

      const flotteData = (flotte ?? null) as unknown as {
        capacite_cargo_custom?: number | null;
        types_avion?: { capacite_cargo_kg?: number | null } | { capacite_cargo_kg?: number | null }[] | null;
      } | null;
      const capaciteCargoBase = Array.isArray(flotteData?.types_avion)
        ? flotteData?.types_avion?.[0]?.capacite_cargo_kg
        : flotteData?.types_avion?.capacite_cargo_kg;
      const capaciteCargo = flotteData?.capacite_cargo_custom ?? capaciteCargoBase ?? 0;
      const prixKg = compagnie?.prix_kg_cargo ?? 0;
      const pourcentageSalaire = compagnie?.pourcentage_salaire ?? 0;

      let cargoDisponible = 0;
      const aeroportInfo = getAeroportInfo(ad);
      const fallbackCargoMax = aeroportInfo?.cargoMax ?? 0;
      try {
        const { data: cargoRow, error: cargoError } = await admin
          .from('aeroport_cargo')
          .select('cargo_disponible, cargo_max')
          .eq('code_oaci', ad)
          .single();
        if (cargoError) {
          cargoDisponible = fallbackCargoMax;
        } else {
          cargoDisponible = cargoRow?.cargo_disponible ?? fallbackCargoMax;
        }
      } catch {
        cargoDisponible = fallbackCargoMax;
      }

      if (capaciteCargo > 0 && prixKg > 0) {
        const calc = calculerCargoReel(ad, aa, prixKg, capaciteCargo, cargoDisponible);
        cargoGenereCalc = calc.cargo;
        revenuBrutCalc = calc.revenus;
        salaireCalc = Math.floor(calc.revenus * pourcentageSalaire / 100);
      } else {
        cargoGenereCalc = 0;
        revenuBrutCalc = 0;
        salaireCalc = 0;
      }
    }

    const cargoGenereFinal = cargoGenereCalc ?? cargo_kg_genere ?? 0;
    const revenuBrutFinal = revenuBrutCalc ?? revenue_brut ?? 0;
    const salaireFinal = salaireCalc ?? salaire_pilote ?? 0;
    
    // Validation taux de remplissage minimum (25%) pour les vols commerciaux
    if (vol_commercial && flotte_avion_id) {
      const { data: flotte } = await admin
        .from('compagnie_flotte')
        .select('capacite_pax_custom, capacite_cargo_custom, types_avion(capacite_pax, capacite_cargo_kg)')
        .eq('id', flotte_avion_id)
        .single();
      
      if (flotte) {
        const flotteData = flotte as unknown as {
          capacite_pax_custom?: number | null;
          capacite_cargo_custom?: number | null;
          types_avion?: { capacite_pax?: number | null; capacite_cargo_kg?: number | null } | { capacite_pax?: number | null; capacite_cargo_kg?: number | null }[] | null;
        };
        
        const capacitePaxBase = Array.isArray(flotteData?.types_avion)
          ? flotteData?.types_avion?.[0]?.capacite_pax
          : flotteData?.types_avion?.capacite_pax;
        const capacitePaxMax = flotteData?.capacite_pax_custom ?? capacitePaxBase ?? 0;
        
        const capaciteCargoBase = Array.isArray(flotteData?.types_avion)
          ? flotteData?.types_avion?.[0]?.capacite_cargo_kg
          : flotteData?.types_avion?.capacite_cargo_kg;
        const capaciteCargoMax = flotteData?.capacite_cargo_custom ?? capaciteCargoBase ?? 0;
        
        const remplissageMinRequis = 0.25; // 25% minimum
        
        if (nature_transport === 'passagers') {
          const nbPaxFinal = nb_pax_genere || 0;
          const tauxRemplissage = capacitePaxMax > 0 ? (nbPaxFinal / capacitePaxMax) : 0;
          if (tauxRemplissage < remplissageMinRequis) {
            return NextResponse.json({ 
              error: `Le vol ne peut pas être effectué : l'avion doit être rempli à au moins 25% de sa capacité. Actuellement : ${nbPaxFinal}/${capacitePaxMax} passagers (${Math.round(tauxRemplissage * 100)}%)` 
            }, { status: 400 });
          }
        } else if (nature_transport === 'cargo') {
          const tauxRemplissage = capaciteCargoMax > 0 ? (cargoGenereFinal / capaciteCargoMax) : 0;
          if (tauxRemplissage < remplissageMinRequis) {
            return NextResponse.json({ 
              error: `Le vol ne peut pas être effectué : l'avion doit être rempli à au moins 25% de sa capacité cargo. Actuellement : ${cargoGenereFinal.toLocaleString('fr-FR')}/${capaciteCargoMax.toLocaleString('fr-FR')} kg (${Math.round(tauxRemplissage * 100)}%)` 
            }, { status: 400 });
          }
        }
      }
    }
    
    // Si vol sans ATC, accepter automatiquement et mettre en autosurveillance
    if (vol_sans_atc) {
      const { data, error } = await admin.from('plans_vol').insert({
        pilote_id: user.id,
        aeroport_depart: ad,
        aeroport_arrivee: aa,
        numero_vol: String(numero_vol).trim(),
        porte: (porte != null && String(porte).trim() !== '') ? String(porte).trim() : null,
        temps_prev_min: t,
        type_vol: String(type_vol),
        intentions_vol: type_vol === 'VFR' ? String(intentions_vol).trim() : null,
        sid_depart: type_vol === 'IFR' ? String(sid_depart).trim() : null,
        star_arrivee: type_vol === 'IFR' ? String(star_arrivee).trim() : null,
        route_ifr: (type_vol === 'IFR' && route_ifr) ? String(route_ifr).trim() : null,
        note_atc: null, // Pas de note ATC pour les vols sans ATC
        vol_commercial: Boolean(vol_commercial),
        compagnie_id: vol_commercial && compagnie_id ? compagnie_id : null,
        nature_transport: vol_commercial && nature_transport ? nature_transport : null,
        flotte_avion_id: vol_commercial && flotte_avion_id ? flotte_avion_id : null,
        inventaire_avion_id: !vol_commercial && inventaire_avion_id ? inventaire_avion_id : null,
        nb_pax_genere: vol_commercial ? (nb_pax_genere || 0) : null,
        cargo_kg_genere: vol_commercial ? cargoGenereFinal : null,
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

      // Consommer le cargo de l'aéroport de départ si vol commercial cargo
      if (vol_commercial && nature_transport === 'cargo' && cargoGenereFinal > 0) {
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

      return NextResponse.json({ ok: true, id: data.id, vol_sans_atc: true });
    }
    
    // Sinon, chercher un ATC pour recevoir le plan
    const airportsToCheck = ad === aa ? [ad] : [ad, aa];
    let holder: { user_id: string; position: string; aeroport: string } | null = null;
    for (const apt of airportsToCheck) {
      for (const pos of ORDRE_ACCEPTATION_PLANS) {
        const { data: s } = await admin.from('atc_sessions').select('user_id').eq('aeroport', apt).eq('position', pos).single();
        if (s?.user_id) { holder = { user_id: s.user_id, position: pos, aeroport: apt }; break; }
      }
      if (holder) break;
    }

    if (!holder) {
      return NextResponse.json({ error: 'Aucune fréquence ATC de votre aéroport de départ ou d\'arrivée est en ligne. Cochez "Voler sans ATC" pour effectuer ce vol en autosurveillance.' }, { status: 400 });
    }

    const { data, error } = await admin.from('plans_vol').insert({
      pilote_id: user.id,
      aeroport_depart: ad,
      aeroport_arrivee: aa,
      numero_vol: String(numero_vol).trim(),
      porte: (porte != null && String(porte).trim() !== '') ? String(porte).trim() : null,
      temps_prev_min: t,
      type_vol: String(type_vol),
      intentions_vol: type_vol === 'VFR' ? String(intentions_vol).trim() : null,
      sid_depart: type_vol === 'IFR' ? String(sid_depart).trim() : null,
      star_arrivee: type_vol === 'IFR' ? String(star_arrivee).trim() : null,
      route_ifr: (type_vol === 'IFR' && route_ifr) ? String(route_ifr).trim() : null,
      note_atc: note_atc ? String(note_atc).trim() : null,
      vol_commercial: Boolean(vol_commercial),
      compagnie_id: vol_commercial && compagnie_id ? compagnie_id : null,
      nature_transport: vol_commercial && nature_transport ? nature_transport : null,
      flotte_avion_id: vol_commercial && flotte_avion_id ? flotte_avion_id : null,
      inventaire_avion_id: !vol_commercial && inventaire_avion_id ? inventaire_avion_id : null,
      nb_pax_genere: vol_commercial ? (nb_pax_genere || 0) : null,
      cargo_kg_genere: vol_commercial ? cargoGenereFinal : null,
      revenue_brut: vol_commercial ? revenuBrutFinal : null,
      salaire_pilote: vol_commercial ? salaireFinal : null,
      prix_billet_utilise: vol_commercial ? (prix_billet_utilise || 0) : null,
      statut: 'en_attente',
      current_holder_user_id: holder.user_id,
      current_holder_position: holder.position,
      current_holder_aeroport: holder.aeroport,
      vol_sans_atc: false,
    }).select('id').single();

    if (error) return NextResponse.json({ error: error.message }, { status: 400 });

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

    // Consommer le cargo de l'aéroport de départ si vol commercial cargo
    if (vol_commercial && nature_transport === 'cargo' && cargoGenereFinal > 0) {
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
