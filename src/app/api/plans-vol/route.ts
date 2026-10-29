export const dynamic = 'force-dynamic';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { NextResponse } from 'next/server';
import { CODES_OACI_VALIDES } from '@/lib/aeroports-ptfs';
import { FlightSubmissionError, getFlightQuote, submissionError, type FlightQuote } from '@/lib/plans-vol/submission';
import { heureDepartToIso } from '@/lib/heure-depart';
import { getMissionById, getMissionCooldownForUser } from '@/lib/armee';
import { rateLimitShared } from '@/lib/rate-limit-shared';
import { STATUTS_PLAN_OCCUPES, hasOccupiedPlan, isCompanyMember } from '@/lib/plans-vol/crew';
import { notifyUser } from '@/lib/notifications';
import { checkMajorFlight, reservedDeparture, validateBookingFlight, bookingLinkedToPlan } from '@/lib/events/server';

// Ordre de priorité pour recevoir un nouveau plan de vol (uniquement à l’aéroport de départ)
// Delivery → Clairance → Ground → Tower → DEP → APP → Center
const ORDRE_DEPART = ['Delivery', 'Clairance', 'Ground', 'Tower', 'DEP', 'APP', 'Center'] as const;

export async function POST(request: Request) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Non autorisé' }, { status: 401 });
    const rl = await rateLimitShared(`plans-vol-post:${user.id}`, 8, 60_000);
    if (!rl.allowed) {
      return NextResponse.json({ error: 'Trop de dépôts. Réessayez dans une minute.' }, { status: 429 });
    }
    const { data: profile } = await supabase.from('profiles').select('role, armee, sanction_blocage_vol, sanction_blocage_motif, sanction_blocage_jusqu_au').eq('id', user.id).single();
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
      heure_depart,
      intentions_vol, niveau_croisiere, sid_depart, star_arrivee, route_ifr, strip_route, note_atc,
      vol_commercial, compagnie_id, nature_transport: natureTransportRaw, inventaire_avion_id,
      compagnie_avion_id,
      vol_sans_atc, vol_ferry, bria_conversation,
      copilote_id: copiloteIdRaw,
    } = body;
    const nature_transport = vol_commercial && !vol_ferry ? (natureTransportRaw || 'passagers') : null;
    let heureDepartIso = heureDepartToIso(typeof heure_depart === 'string' ? heure_depart : null);
    if (!heureDepartIso) {
      return NextResponse.json({ error: 'L\'heure de départ (UTC) est obligatoire.' }, { status: 400 });
    }
    
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

    const armeeAvionRaw = body.armee_avion_id;
    const missionIdPlan = body.mission_id != null && String(body.mission_id).trim() !== '' ? String(body.mission_id).trim() : null;
    const isMilitaryPlan = armeeAvionRaw != null && String(armeeAvionRaw).trim() !== '';

    const admin = createAdminClient();
    if (body.event_reservation_id) {
      heureDepartIso = await reservedDeparture(user.id, body.event_reservation_id, heure_depart);
      if (!heureDepartIso) return NextResponse.json({ error: 'Réservation pilote introuvable ou horaire invalide.' }, { status: 400 });
    }
    const slotError = await checkMajorFlight(user.id,ad,aa,heureDepartIso,t,String(numero_vol));
    if (slotError) return NextResponse.json({ error: slotError, booking_url: '/calendrier' }, { status: 409 });
    if(typeof body.event_reservation_id==='string') {
      const bookingError=await validateBookingFlight(user.id,body.event_reservation_id,ad,aa,heureDepartIso,t,String(numero_vol));
      if(bookingError) return NextResponse.json({error:bookingError},{status:409});
    }

    let armeeAvionId: string | null = null;
    let armeeMissionId: string | null = null;

    if (isMilitaryPlan) {
      if (!profile?.armee && profile?.role !== 'admin') {
        return NextResponse.json({ error: 'Dépôt d’un plan militaire réservé aux comptes Armée (ou admin).' }, { status: 403 });
      }
      if (vol_commercial || compagnie_id || compagnie_avion_id || vol_ferry || inventaire_avion_id) {
        return NextResponse.json({ error: 'Un plan militaire ne peut pas combiner compagnie, ferry, inventaire perso ou vol commercial.' }, { status: 400 });
      }
      const uuidArmee = String(armeeAvionRaw).trim();
      if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(uuidArmee)) {
        return NextResponse.json({ error: 'Identifiant d’avion militaire invalide.' }, { status: 400 });
      }
      const { data: avionArmee } = await admin.from('armee_avions')
        .select('id, detruit, types_avion(id, est_militaire)')
        .eq('id', uuidArmee)
        .single();
      if (!avionArmee) {
        return NextResponse.json({ error: 'Avion militaire introuvable.' }, { status: 404 });
      }
      if ((avionArmee as { detruit?: boolean }).detruit) {
        return NextResponse.json({ error: 'Cet appareil est déclaré détruit.' }, { status: 400 });
      }
      const ta = Array.isArray((avionArmee as { types_avion?: unknown }).types_avion)
        ? (avionArmee as { types_avion: { est_militaire?: boolean }[] }).types_avion[0]
        : (avionArmee as { types_avion?: { est_militaire?: boolean } | null }).types_avion;
      if (!ta?.est_militaire) {
        return NextResponse.json({ error: 'Cet appareil n’est pas un type militaire.' }, { status: 400 });
      }
      armeeAvionId = uuidArmee;

      if (missionIdPlan) {
        const mission = getMissionById(missionIdPlan);
        if (!mission) {
          return NextResponse.json({ error: 'Mission militaire introuvable.' }, { status: 404 });
        }
        if (
          ad !== mission.aeroport_depart ||
          aa !== mission.aeroport_arrivee ||
          t !== mission.duree_minutes
        ) {
          return NextResponse.json({ error: 'Le plan ne correspond pas à la mission (liaison ou durée).' }, { status: 400 });
        }
        const cooldown = await getMissionCooldownForUser(admin, mission.id, user.id, mission.cooldownMinutes);
        if (!cooldown.available) {
          return NextResponse.json({
            error: `Mission indisponible pour vous (cooldown ${mission.cooldownMinutes} min, encore ${cooldown.remainingMinutes} min).`,
          }, { status: 400 });
        }
        armeeMissionId = mission.id;
      }

      const { count: plansArmee } = await admin
        .from('plans_vol')
        .select('*', { count: 'exact', head: true })
        .eq('armee_avion_id', armeeAvionId)
        .in('statut', [...STATUTS_PLAN_OCCUPES]);

      if (plansArmee && plansArmee > 0) {
        return NextResponse.json({ error: 'Cet appareil militaire a déjà un plan de vol en cours.' }, { status: 400 });
      }
    }

    // ── Normaliser le numéro de vol avec le code OACI de la compagnie ──
    let numeroVolFinal = String(numero_vol).trim().toUpperCase();
    if (!isMilitaryPlan && compagnie_id && body.callsign_manual !== true) {
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

    // Server snapshot of the current economy; client quantities and prices are ignored.
    let flightQuote: FlightQuote | null = null;
    if (!isMilitaryPlan) flightQuote = await getFlightQuote(admin, user.id, body);
    const nbPaxFinal = flightQuote?.nb_pax_genere ?? 0;
    const cargoGenereFinal = flightQuote?.cargo_kg_genere ?? 0;
    const revenuBrutFinal = flightQuote?.revenue_brut ?? 0;
    const salaireFinal = flightQuote?.salaire_pilote ?? 0;
    const prixBilletFinal = flightQuote?.prix_billet_utilise ?? 0;
    const typeCargaisonFinal = flightQuote?.type_cargaison ?? null;
    const typeCargaisonLibelleFinal = flightQuote?.type_cargaison_libelle ?? null;
    const persistPlan = async (plan: Record<string, unknown>) => {
      if (isMilitaryPlan) return admin.from('plans_vol').insert(plan).select('id').single();
      const { data, error } = await admin.rpc('submit_flight_plan_integrity', {
        p_actor: user.id, p_plan: plan, p_quote: flightQuote!.quote_id,
      });
      if (error || !data?.id) throw submissionError(error);
      return { data: { id: data.id as string }, error: null };
    };

    // Validation vol ferry
    if (vol_ferry && isMilitaryPlan) {
      return NextResponse.json({ error: 'Vol ferry indisponible pour un plan militaire.' }, { status: 400 });
    }
    if (vol_ferry) {
      if (!compagnie_avion_id) {
        return NextResponse.json({ error: 'Un vol ferry nécessite de sélectionner un avion spécifique.' }, { status: 400 });
      }
      if (!compagnie_id) {
        return NextResponse.json({ error: 'Un vol ferry doit être effectué pour une compagnie.' }, { status: 400 });
      }
    }

    // Validation avion individuel (si utilisé)
    if (!isMilitaryPlan && compagnie_avion_id) {
      const { data: avionIndiv } = await admin
        .from('compagnie_avions')
        .select('id, compagnie_id, aeroport_actuel, statut, usure_percent, immatriculation, detruit, bloque_incident')
        .eq('id', compagnie_avion_id)
        .single();
      
      if (!avionIndiv) {
        return NextResponse.json({ error: 'Avion individuel introuvable.' }, { status: 400 });
      }
      if ((avionIndiv as any).detruit) {
        return NextResponse.json({ error: `L'avion ${avionIndiv.immatriculation} est detruit.` }, { status: 400 });
      }
      if ((avionIndiv as any).bloque_incident) {
        return NextResponse.json({ error: `L'avion ${avionIndiv.immatriculation} est bloque suite a un incident, en attente d'examen staff.` }, { status: 400 });
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
      if (avionIndiv.statut === 'en_reparation') {
        return NextResponse.json({
          error: `L'avion ${avionIndiv.immatriculation} est en réparation professionnelle.`
        }, { status: 400 });
      }
      
      // Vérifier qu'il n'y a pas déjà un plan de vol en cours pour cet avion
      const { count: plansEnCours } = await admin
        .from('plans_vol')
        .select('*', { count: 'exact', head: true })
        .eq('compagnie_avion_id', compagnie_avion_id)
        .in('statut', [...STATUTS_PLAN_OCCUPES]);
      
      if (plansEnCours && plansEnCours > 0) {
        return NextResponse.json({ 
          error: `L'avion ${avionIndiv.immatriculation} a déjà un plan de vol en cours.` 
        }, { status: 400 });
      }

      // Interdire tout plan de vol quand l'avion est engagé dans un cycle de réparation actif
      const { data: activeRepair } = await admin
        .from('reparation_demandes')
        .select('id, statut')
        .eq('avion_id', compagnie_avion_id)
        .in('statut', ['acceptee', 'en_transit', 'en_reparation', 'mini_jeux', 'terminee', 'facturee', 'payee', 'retour_transit'])
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();

      if (activeRepair) {
        return NextResponse.json({
          error: `L'avion ${avionIndiv.immatriculation} est engagé en réparation (${activeRepair.statut}). Aucun plan de vol n'est autorisé tant que l'entreprise de réparation ne l'a pas libéré.`
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

    const copiloteId =
      typeof copiloteIdRaw === 'string' && copiloteIdRaw.trim()
        ? copiloteIdRaw.trim()
        : null;
    if (copiloteId) {
      if (isMilitaryPlan) {
        return NextResponse.json({ error: 'Le copilote n’est pas disponible sur un plan militaire.' }, { status: 400 });
      }
      if (!compagnie_id) {
        return NextResponse.json({ error: 'Un vol avec copilote doit être rattaché à une compagnie.' }, { status: 400 });
      }
      if (copiloteId === user.id) {
        return NextResponse.json({ error: 'Vous ne pouvez pas vous désigner comme copilote.' }, { status: 400 });
      }
      if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(copiloteId)) {
        return NextResponse.json({ error: 'Copilote invalide.' }, { status: 400 });
      }
      const [picMember, copiloteMember, copiloteBusy] = await Promise.all([
        isCompanyMember(admin, user.id, compagnie_id),
        isCompanyMember(admin, copiloteId, compagnie_id),
        hasOccupiedPlan(admin, copiloteId),
      ]);
      if (!picMember || !copiloteMember) {
        return NextResponse.json({ error: 'Le copilote doit appartenir à la même compagnie.' }, { status: 400 });
      }
      if (copiloteBusy) {
        return NextResponse.json({ error: 'Ce copilote a déjà un plan de vol en cours.' }, { status: 400 });
      }
    }

    const locationFieldsEarly = compagnie_avion_id && compagnie_id
      ? await admin.from('compagnie_locations')
          .select('*')
          .eq('avion_id', compagnie_avion_id)
          .eq('locataire_compagnie_id', compagnie_id)
          .eq('statut', 'active')
          .lte('start_at', new Date().toISOString())
          .gte('end_at', new Date().toISOString())
          .maybeSingle()
      : { data: null };

    const planBaseFields = {
      pilote_id: user.id,
      aeroport_depart: ad,
      aeroport_arrivee: aa,
      numero_vol: numeroVolFinal,
      porte: (porte != null && String(porte).trim() !== '') ? String(porte).trim() : null,
      temps_prev_min: t,
      heure_depart_estimee: heureDepartIso,
      type_vol: String(type_vol),
      intentions_vol: type_vol === 'VFR' ? String(intentions_vol).trim() : null,
      sid_depart: type_vol === 'IFR' ? String(sid_depart).trim() : null,
      star_arrivee: type_vol === 'IFR' ? String(star_arrivee).trim() : null,
      route_ifr: (type_vol === 'IFR' && route_ifr) ? String(route_ifr).trim() : null,
      strip_sid_atc: type_vol === 'IFR' && sid_depart ? String(sid_depart).trim() : null,
      strip_star: type_vol === 'IFR' && star_arrivee ? String(star_arrivee).trim() : null,
      strip_route: strip_route && String(strip_route).trim() ? String(strip_route).trim() : null,
      strip_fl: type_vol === 'IFR' && niveau_croisiere ? String(niveau_croisiere).trim().replace(/^FL\s*/i, '') : null,
      strip_fl_unit: 'FL',
      niveau_croisiere: type_vol === 'IFR' && niveau_croisiere ? String(niveau_croisiere).trim().replace(/^FL\s*/i, '') : null,
      vol_commercial: Boolean(vol_commercial) && !vol_ferry,
      compagnie_id: compagnie_id || null,
      nature_transport: vol_commercial && !vol_ferry && nature_transport ? nature_transport : null,
      inventaire_avion_id: !vol_commercial && inventaire_avion_id ? inventaire_avion_id : null,
      compagnie_avion_id: compagnie_avion_id || null,
      nb_pax_genere: vol_commercial ? nbPaxFinal : null,
      cargo_kg_genere: vol_commercial ? cargoGenereFinal : null,
      type_cargaison: vol_commercial && (nature_transport === 'cargo' || (nature_transport === 'passagers' && cargoGenereFinal > 0)) ? typeCargaisonFinal : null,
      type_cargaison_libelle: typeCargaisonLibelleFinal,
      revenue_brut: vol_commercial ? revenuBrutFinal : null,
      salaire_pilote: vol_commercial ? salaireFinal : null,
      prix_billet_utilise: vol_commercial ? prixBilletFinal : null,
      vol_ferry: Boolean(vol_ferry),
      location_id: locationFieldsEarly.data?.id || null,
      location_loueur_compagnie_id: locationFieldsEarly.data?.loueur_compagnie_id || null,
      location_pourcentage_revenu_loueur: locationFieldsEarly.data?.pourcentage_revenu_loueur || null,
      location_prix_journalier: locationFieldsEarly.data?.prix_journalier || null,
      bria_conversation: bria_conversation || null,
      armee_avion_id: armeeAvionId,
      armee_mission_id: armeeMissionId,
      copilote_id: copiloteId,
    };

    if (copiloteId) {
      const { data, error } = await persistPlan({
        ...planBaseFields,
        note_atc: note_atc ? String(note_atc).trim() : null,
        statut: 'en_attente_copilote',
        current_holder_user_id: null,
        current_holder_position: null,
        current_holder_aeroport: null,
        vol_sans_atc: false,
        automonitoring: false,
        copilote_vol_sans_atc: Boolean(vol_sans_atc),
      });

      if (error) {
        console.error('plans-vol POST INSERT (copilote):', JSON.stringify(error));
        return NextResponse.json({ error: `Erreur lors de la création : ${error.message || error.code || 'erreur base de données'}` }, { status: 400 });
      }

      const { data: picProfile } = await admin.from('profiles').select('identifiant').eq('id', user.id).maybeSingle();
      await notifyUser(copiloteId, {
        type: 'plan_copilote',
        title: `Plan ${numeroVolFinal} à valider`,
        body: `${picProfile?.identifiant || 'Un pilote'} vous a désigné copilote sur ${numeroVolFinal} (${ad} → ${aa}). Validez le plan pour l’envoyer à l’ATC ou confirmer le vol sans ATC.`,
        link: '/logbook/plans-vol',
      });

      return NextResponse.json({ ok: true, id: data.id, statut: 'en_attente_copilote', event_registration_confirmed:await bookingLinkedToPlan(user.id,body.event_reservation_id,data.id) });
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
      const { data, error } = await persistPlan({
        pilote_id: user.id,
        aeroport_depart: ad,
        aeroport_arrivee: aa,
        numero_vol: numeroVolFinal,
        porte: (porte != null && String(porte).trim() !== '') ? String(porte).trim() : null,
        temps_prev_min: t,
        heure_depart_estimee: heureDepartIso,
        type_vol: String(type_vol),
        intentions_vol: type_vol === 'VFR' ? String(intentions_vol).trim() : null,
        sid_depart: type_vol === 'IFR' ? String(sid_depart).trim() : null,
        star_arrivee: type_vol === 'IFR' ? String(star_arrivee).trim() : null,
        route_ifr: (type_vol === 'IFR' && route_ifr) ? String(route_ifr).trim() : null,
        strip_sid_atc: type_vol === 'IFR' && sid_depart ? String(sid_depart).trim() : null,
        strip_star: type_vol === 'IFR' && star_arrivee ? String(star_arrivee).trim() : null,
        strip_route: strip_route && String(strip_route).trim() ? String(strip_route).trim() : null,
        strip_fl: type_vol === 'IFR' && niveau_croisiere ? String(niveau_croisiere).trim().replace(/^FL\s*/i, '') : null,
        strip_fl_unit: 'FL',
        niveau_croisiere: type_vol === 'IFR' && niveau_croisiere ? String(niveau_croisiere).trim().replace(/^FL\s*/i, '') : null,
        note_atc: null,
        vol_commercial: Boolean(vol_commercial) && !vol_ferry,
        compagnie_id: compagnie_id || null,
        nature_transport: vol_commercial && !vol_ferry && nature_transport ? nature_transport : null,
        inventaire_avion_id: !vol_commercial && inventaire_avion_id ? inventaire_avion_id : null,
        compagnie_avion_id: compagnie_avion_id || null,
        nb_pax_genere: vol_commercial ? nbPaxFinal : null,
        cargo_kg_genere: vol_commercial ? cargoGenereFinal : null,
        type_cargaison: vol_commercial && (nature_transport === 'cargo' || (nature_transport === 'passagers' && cargoGenereFinal > 0)) ? typeCargaisonFinal : null,
        type_cargaison_libelle: typeCargaisonLibelleFinal,
        revenue_brut: vol_commercial ? revenuBrutFinal : null,
        salaire_pilote: vol_commercial ? salaireFinal : null,
        prix_billet_utilise: vol_commercial ? prixBilletFinal : null,
        statut: 'accepte',
        accepted_at: new Date().toISOString(),
        automonitoring: true,
        current_holder_user_id: null,
        current_holder_position: null,
        current_holder_aeroport: null,
        vol_sans_atc: true,
        vol_ferry: Boolean(vol_ferry),
        location_id: locationFields.data?.id || null,
        location_loueur_compagnie_id: locationFields.data?.loueur_compagnie_id || null,
        location_pourcentage_revenu_loueur: locationFields.data?.pourcentage_revenu_loueur || null,
        location_prix_journalier: locationFields.data?.prix_journalier || null,
        bria_conversation: bria_conversation || null,
        armee_avion_id: armeeAvionId,
        armee_mission_id: armeeMissionId,
      });

      if (error) {
        console.error('plans-vol POST INSERT (vol_sans_atc):', JSON.stringify(error));
        return NextResponse.json({ error: `Erreur lors de la création : ${error.message || error.code || 'erreur base de données'}` }, { status: 400 });
      }

      return NextResponse.json({ ok: true, id: data.id, statut: 'accepte', vol_sans_atc: true, event_registration_confirmed:await bookingLinkedToPlan(user.id,body.event_reservation_id,data.id) });
    }
    
    // Sinon, assigner le plan à un ATC du départ uniquement (pas d’acceptation/refus par l’arrivée)
    let holder: { user_id: string; position: string; aeroport: string } | null = null;

    const { data: allSessions } = await admin
      .from('atc_sessions')
      .select('user_id, position, aeroport')
      .eq('aeroport', ad);

    if (allSessions && allSessions.length > 0) {
      for (const pos of ORDRE_DEPART) {
        const session = allSessions.find(s => s.aeroport === ad && s.position === pos);
        if (session?.user_id) {
          holder = { user_id: session.user_id, position: pos, aeroport: ad };
          break;
        }
      }
    }

    if (!holder) {
      return NextResponse.json({ error: 'Aucune fréquence ATC à votre aéroport de départ n\'est en ligne. Cochez "Voler sans ATC" pour effectuer ce vol en autosurveillance.' }, { status: 400 });
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

    const { data, error } = await persistPlan({
      pilote_id: user.id,
      aeroport_depart: ad,
      aeroport_arrivee: aa,
      numero_vol: numeroVolFinal,
      porte: (porte != null && String(porte).trim() !== '') ? String(porte).trim() : null,
      temps_prev_min: t,
      heure_depart_estimee: heureDepartIso,
      type_vol: String(type_vol),
      intentions_vol: type_vol === 'VFR' ? String(intentions_vol).trim() : null,
      sid_depart: type_vol === 'IFR' ? String(sid_depart).trim() : null,
      star_arrivee: type_vol === 'IFR' ? String(star_arrivee).trim() : null,
      route_ifr: (type_vol === 'IFR' && route_ifr) ? String(route_ifr).trim() : null,
        strip_sid_atc: type_vol === 'IFR' && sid_depart ? String(sid_depart).trim() : null,
        strip_star: type_vol === 'IFR' && star_arrivee ? String(star_arrivee).trim() : null,
        strip_route: strip_route && String(strip_route).trim() ? String(strip_route).trim() : null,
        strip_fl: type_vol === 'IFR' && niveau_croisiere ? String(niveau_croisiere).trim().replace(/^FL\s*/i, '') : null,
        strip_fl_unit: 'FL',
        niveau_croisiere: type_vol === 'IFR' && niveau_croisiere ? String(niveau_croisiere).trim().replace(/^FL\s*/i, '') : null,
        note_atc: note_atc ? String(note_atc).trim() : null,
      vol_commercial: Boolean(vol_commercial) && !vol_ferry,
      compagnie_id: compagnie_id || null,
      nature_transport: vol_commercial && !vol_ferry && nature_transport ? nature_transport : null,
      inventaire_avion_id: !vol_commercial && inventaire_avion_id ? inventaire_avion_id : null,
      compagnie_avion_id: compagnie_avion_id || null,
      nb_pax_genere: vol_commercial ? nbPaxFinal : null,
      cargo_kg_genere: vol_commercial ? cargoGenereFinal : null,
      type_cargaison: vol_commercial && (nature_transport === 'cargo' || (nature_transport === 'passagers' && cargoGenereFinal > 0)) ? typeCargaisonFinal : null,
      type_cargaison_libelle: typeCargaisonLibelleFinal,
      revenue_brut: vol_commercial ? revenuBrutFinal : null,
      salaire_pilote: vol_commercial ? salaireFinal : null,
      prix_billet_utilise: vol_commercial ? prixBilletFinal : null,
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
      bria_conversation: bria_conversation || null,
      armee_avion_id: armeeAvionId,
      armee_mission_id: armeeMissionId,
    });

    if (error) {
      console.error('plans-vol POST INSERT:', JSON.stringify(error));
      return NextResponse.json({ error: `Erreur lors de la création : ${error.message || error.code || 'erreur base de données'}` }, { status: 400 });
    }

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

    // Infos pour le BRIA : nom ATC, position, fréquence (ex: "Contactez Jean-Marie ITKO Tour sur 118 décimal 750")
    const { data: holderProfile } = await admin.from('profiles').select('identifiant').eq('id', holder.user_id).single();
    const { data: vhfFreq } = await admin.from('vhf_position_frequencies')
      .select('frequency')
      .eq('aeroport', holder.aeroport)
      .eq('position', holder.position)
      .maybeSingle();
    const POSITION_LABELS: Record<string, string> = {
      Delivery: 'Livraison', Clairance: 'Clairance', Ground: 'Sol', Tower: 'Tour',
      DEP: 'Départs', APP: 'Approche', Center: 'Centre', AFIS: 'AFIS',
    };
    const posLabel = POSITION_LABELS[holder.position] || holder.position;
    const atcContact = {
      nom: holderProfile?.identifiant || 'Contrôleur',
      position: `${holder.aeroport} ${posLabel}`,
      aeroport: holder.aeroport,
      frequence: vhfFreq?.frequency ? String(vhfFreq.frequency).replace('.', ' décimal ') : '',
    };

    return NextResponse.json({ ok: true, id: data.id, statut: 'en_attente', atc_contact: atcContact, event_registration_confirmed:await bookingLinkedToPlan(user.id,body.event_reservation_id,data.id) });
  } catch (e) {
    if (e instanceof FlightSubmissionError) return NextResponse.json({ error: e.message }, { status: e.status });
    console.error('plans-vol POST:', e);
    return NextResponse.json({ error: 'Erreur serveur' }, { status: 500 });
  }
}
