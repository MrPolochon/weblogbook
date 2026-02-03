import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { NextResponse } from 'next/server';
import { CODES_OACI_VALIDES, genererTypeCargaison } from '@/lib/aeroports-ptfs';

// Ordre de priorité pour recevoir un nouveau plan de vol
// AÉROPORT DE DÉPART : Delivery → Clairance → Ground → Tower → DEP → Center
const ORDRE_DEPART = ['Delivery', 'Clairance', 'Ground', 'Tower', 'DEP', 'Center'] as const;

// AÉROPORT D'ARRIVÉE (ordre inversé) : Delivery → Center → APP → DEP → Tower → Ground → Clairance
const ORDRE_ARRIVEE = ['Delivery', 'Center', 'APP', 'DEP', 'Tower', 'Ground', 'Clairance'] as const;

export async function POST(request: Request) {
  try {
    // #region agent log
    fetch('http://127.0.0.1:7242/ingest/a721640d-e3c8-4a56-a4cc-d919b111b0c0',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'plans-vol/route.ts:POST:entry',message:'POST /api/plans-vol entry',data:{hasBody:true},timestamp:Date.now(),sessionId:'debug-session',runId:'pre-fix',hypothesisId:'H1'})}).catch(()=>{});
    // #endregion
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
    
    const ad = String(aeroport_depart || '').toUpperCase();
    const aa = String(aeroport_arrivee || '').toUpperCase();
    // #region agent log
    fetch('http://127.0.0.1:7242/ingest/a721640d-e3c8-4a56-a4cc-d919b111b0c0',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'plans-vol/route.ts:POST:inputs',message:'Parsed plan inputs',data:{ad,aa,vol_sans_atc:Boolean(vol_sans_atc),vol_ferry:Boolean(vol_ferry),vol_commercial:Boolean(vol_commercial),hasCompagnieAvion:!!compagnie_avion_id},timestamp:Date.now(),sessionId:'debug-session',runId:'pre-fix',hypothesisId:'H2'})}).catch(()=>{});
    // #endregion
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

    // Utiliser les valeurs calculées côté client (le formulaire valide déjà le taux de remplissage)
    const cargoGenereFinal = cargo_kg_genere ?? 0;
    const revenuBrutFinal = revenue_brut ?? 0;
    const salaireFinal = salaire_pilote ?? 0;
    // Générer un type de cargaison aléatoire pour les vols cargo
    const typeCargaisonFinal = vol_commercial && nature_transport === 'cargo' ? genererTypeCargaison() : null;
    
    // Validation vol ferry
    if (vol_ferry) {
      if (!compagnie_avion_id) {
        return NextResponse.json({ error: 'Un vol ferry nécessite de sélectionner un avion spécifique.' }, { status: 400 });
      }
      if (!compagnie_id) {
        return NextResponse.json({ error: 'Un vol ferry doit être effectué pour une compagnie.' }, { status: 400 });
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
      
      // Vérifier que l'avion appartient à la compagnie sélectionnée
      if ((vol_commercial || vol_ferry) && compagnie_id && avionIndiv.compagnie_id !== compagnie_id) {
        return NextResponse.json({ error: 'Cet avion n\'appartient pas à la compagnie sélectionnée.' }, { status: 400 });
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
        vol_commercial: Boolean(vol_commercial) && !vol_ferry,
        compagnie_id: (vol_commercial || vol_ferry) && compagnie_id ? compagnie_id : null,
        nature_transport: vol_commercial && !vol_ferry && nature_transport ? nature_transport : null,
        inventaire_avion_id: !vol_commercial && inventaire_avion_id ? inventaire_avion_id : null,
        compagnie_avion_id: compagnie_avion_id || null,
        nb_pax_genere: vol_commercial ? (nb_pax_genere || 0) : null,
        cargo_kg_genere: vol_commercial ? cargoGenereFinal : null,
        type_cargaison: vol_commercial && nature_transport === 'cargo' ? typeCargaisonFinal : null,
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

      // Mettre l'avion individuel en vol (le trigger ne fonctionne qu'à l'UPDATE, pas INSERT)
      if (compagnie_avion_id) {
        await admin.from('compagnie_avions')
          .update({ statut: 'in_flight' })
          .eq('id', compagnie_avion_id);
      }

      return NextResponse.json({ ok: true, id: data.id, vol_sans_atc: true });
    }
    
    // Sinon, chercher un ATC pour recevoir le plan
    // D'abord vérifier l'aéroport de départ avec l'ordre DEPART
    // Puis si aucun ATC trouvé, vérifier l'aéroport d'arrivée avec l'ordre ARRIVEE
    let holder: { user_id: string; position: string; aeroport: string } | null = null;
    
    // 1. Chercher à l'aéroport de DÉPART
    for (const pos of ORDRE_DEPART) {
      const { data: s } = await admin.from('atc_sessions').select('user_id').eq('aeroport', ad).eq('position', pos).single();
      if (s?.user_id) { 
        holder = { user_id: s.user_id, position: pos, aeroport: ad }; 
        break; 
      }
    }
    
    // 2. Si aucun ATC au départ et aéroport d'arrivée différent, chercher à l'ARRIVÉE
    if (!holder && aa !== ad) {
      for (const pos of ORDRE_ARRIVEE) {
        const { data: s } = await admin.from('atc_sessions').select('user_id').eq('aeroport', aa).eq('position', pos).single();
        if (s?.user_id) { 
          holder = { user_id: s.user_id, position: pos, aeroport: aa }; 
          break; 
        }
      }
    }

    if (!holder) {
      // #region agent log
      fetch('http://127.0.0.1:7242/ingest/a721640d-e3c8-4a56-a4cc-d919b111b0c0',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'plans-vol/route.ts:POST:no-holder',message:'No ATC holder found',data:{ad,aa},timestamp:Date.now(),sessionId:'debug-session',runId:'pre-fix',hypothesisId:'H3'})}).catch(()=>{});
      // #endregion
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
      vol_commercial: Boolean(vol_commercial) && !vol_ferry,
      compagnie_id: (vol_commercial || vol_ferry) && compagnie_id ? compagnie_id : null,
      nature_transport: vol_commercial && !vol_ferry && nature_transport ? nature_transport : null,
      inventaire_avion_id: !vol_commercial && inventaire_avion_id ? inventaire_avion_id : null,
      compagnie_avion_id: compagnie_avion_id || null,
      nb_pax_genere: vol_commercial ? (nb_pax_genere || 0) : null,
      cargo_kg_genere: vol_commercial ? cargoGenereFinal : null,
      type_cargaison: vol_commercial && nature_transport === 'cargo' ? typeCargaisonFinal : null,
      revenue_brut: vol_commercial ? revenuBrutFinal : null,
      salaire_pilote: vol_commercial ? salaireFinal : null,
      prix_billet_utilise: vol_commercial ? (prix_billet_utilise || 0) : null,
      statut: 'en_attente',
      current_holder_user_id: holder.user_id,
      current_holder_position: holder.position,
      current_holder_aeroport: holder.aeroport,
      vol_sans_atc: false,
      vol_ferry: Boolean(vol_ferry),
    }).select('id').single();

    if (error) return NextResponse.json({ error: error.message }, { status: 400 });

    // #region agent log
    fetch('http://127.0.0.1:7242/ingest/a721640d-e3c8-4a56-a4cc-d919b111b0c0',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'plans-vol/route.ts:POST:inserted',message:'Plan inserted',data:{status:'en_attente',hasHolder:true,ad,aa},timestamp:Date.now(),sessionId:'debug-session',runId:'pre-fix',hypothesisId:'H4'})}).catch(()=>{});
    // #endregion

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
