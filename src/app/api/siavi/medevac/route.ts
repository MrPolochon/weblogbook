import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { canAccessSiavi } from '@/lib/siavi/permissions';
import { CODES_OACI_VALIDES } from '@/lib/aeroports-ptfs';

const ORDRE_DEPART = ['Delivery', 'Clairance', 'Ground', 'Tower', 'DEP', 'APP', 'Center'] as const;
const ORDRE_ARRIVEE = ['Delivery', 'APP', 'DEP', 'Tower', 'Ground', 'Clairance', 'Center'] as const;

export async function POST(request: Request) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Non autorisé' }, { status: 401 });

    const admin = createAdminClient();
    const ok = await canAccessSiavi(admin, user.id);
    if (!ok) return NextResponse.json({ error: 'Accès SIAVI requis' }, { status: 403 });

    const body = await request.json();
    const {
      aeroport_depart, aeroport_arrivee, numero_vol, temps_prev_min,
      type_vol, intentions_vol, sid_depart, star_arrivee, route_ifr,
      strip_route, niveau_croisiere, siavi_avion_id, vol_sans_atc
    } = body;

    // -- Validations --
    const ad = String(aeroport_depart || '').toUpperCase();
    const aa = String(aeroport_arrivee || '').toUpperCase();
    if (!CODES_OACI_VALIDES.has(ad) || !CODES_OACI_VALIDES.has(aa)) {
      return NextResponse.json({ error: 'Aéroports invalides.' }, { status: 400 });
    }
    if (!numero_vol || !/^\d+$/.test(String(numero_vol).trim())) {
      return NextResponse.json({ error: 'Numéro de vol requis (chiffres uniquement).' }, { status: 400 });
    }
    const t = parseInt(String(temps_prev_min), 10);
    if (isNaN(t) || t < 1) {
      return NextResponse.json({ error: 'Temps prévu invalide (minutes ≥ 1).' }, { status: 400 });
    }
    if (!type_vol || !['VFR', 'IFR'].includes(String(type_vol))) {
      return NextResponse.json({ error: 'Type de vol VFR ou IFR requis.' }, { status: 400 });
    }
    if (String(type_vol) === 'VFR' && (!intentions_vol || !String(intentions_vol).trim())) {
      return NextResponse.json({ error: 'Intentions de vol requises pour VFR.' }, { status: 400 });
    }
    if (String(type_vol) === 'IFR') {
      if (!sid_depart || !String(sid_depart).trim()) return NextResponse.json({ error: 'SID requise pour IFR.' }, { status: 400 });
      if (!star_arrivee || !String(star_arrivee).trim()) return NextResponse.json({ error: 'STAR requise pour IFR.' }, { status: 400 });
    }

    const numeroVolFinal = `MEDEVAC${String(numero_vol).trim()}`;

    // -- Vérifier plan actif existant pour cet agent --
    const { count: plansActifs } = await admin.from('plans_vol')
      .select('*', { count: 'exact', head: true })
      .eq('pilote_id', user.id)
      .in('statut', ['depose', 'en_attente', 'accepte', 'en_cours', 'automonitoring', 'en_attente_cloture']);

    if (plansActifs && plansActifs > 0) {
      return NextResponse.json({ error: 'Vous avez déjà un plan de vol actif.' }, { status: 400 });
    }

    // -- Vérifier avion SIAVI --
    if (!siavi_avion_id) {
      return NextResponse.json({ error: 'Sélectionnez un avion de la flotte SIAVI.' }, { status: 400 });
    }

    const { data: avion } = await admin.from('siavi_avions')
      .select('id, aeroport_actuel, statut, usure_percent, immatriculation')
      .eq('id', siavi_avion_id)
      .single();

    if (!avion) {
      return NextResponse.json({ error: 'Avion SIAVI introuvable.' }, { status: 400 });
    }
    if (avion.aeroport_actuel !== ad) {
      return NextResponse.json({
        error: `L'avion ${avion.immatriculation} se trouve à ${avion.aeroport_actuel}, pas à ${ad}.`
      }, { status: 400 });
    }
    if (avion.statut !== 'ground') {
      const msgs: Record<string, string> = {
        in_flight: 'est déjà en vol',
        bloque: 'est bloqué (0% usure)',
        en_reparation: 'est en réparation',
        maintenance: 'est en maintenance',
      };
      return NextResponse.json({
        error: `L'avion ${avion.immatriculation} ${msgs[avion.statut] || 'n\'est pas disponible'}.`
      }, { status: 400 });
    }

    const { count: plansAvion } = await admin.from('plans_vol')
      .select('*', { count: 'exact', head: true })
      .eq('siavi_avion_id', siavi_avion_id)
      .in('statut', ['depose', 'en_attente', 'accepte', 'en_cours', 'automonitoring', 'en_attente_cloture']);

    if (plansAvion && plansAvion > 0) {
      return NextResponse.json({ error: `L'avion ${avion.immatriculation} a déjà un plan de vol en cours.` }, { status: 400 });
    }

    // -- Recherche ATC (identique au flux pilote) --
    const buildPlanInsert = (holderFields: Record<string, unknown>) => ({
      pilote_id: user.id,
      aeroport_depart: ad,
      aeroport_arrivee: aa,
      numero_vol: numeroVolFinal,
      temps_prev_min: t,
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
      vol_commercial: false,
      compagnie_id: null,
      siavi_avion_id,
      vol_ferry: false,
      vol_sans_atc: Boolean(vol_sans_atc),
      ...holderFields,
    });

    if (vol_sans_atc) {
      const { data, error } = await admin.from('plans_vol')
        .insert(buildPlanInsert({
          statut: 'accepte',
          accepted_at: new Date().toISOString(),
          automonitoring: true,
          current_holder_user_id: null,
          current_holder_position: null,
          current_holder_aeroport: null,
        }))
        .select('id')
        .single();

      if (error) return NextResponse.json({ error: 'Erreur lors de la création' }, { status: 400 });

      await admin.from('siavi_avions')
        .update({ statut: 'in_flight' })
        .eq('id', siavi_avion_id);

      return NextResponse.json({ ok: true, id: data.id, statut: 'accepte', vol_sans_atc: true });
    }

    // Chercher un ATC
    let holder: { user_id: string; position: string; aeroport: string } | null = null;
    const aeroportsCibles = aa !== ad ? [ad, aa] : [ad];
    const { data: allSessions } = await admin.from('atc_sessions')
      .select('user_id, position, aeroport')
      .in('aeroport', aeroportsCibles);

    if (allSessions && allSessions.length > 0) {
      for (const pos of ORDRE_DEPART) {
        const session = allSessions.find(s => s.aeroport === ad && s.position === pos);
        if (session?.user_id) { holder = { user_id: session.user_id, position: pos, aeroport: ad }; break; }
      }
      if (!holder && aa !== ad) {
        for (const pos of ORDRE_ARRIVEE) {
          const session = allSessions.find(s => s.aeroport === aa && s.position === pos);
          if (session?.user_id) { holder = { user_id: session.user_id, position: pos, aeroport: aa }; break; }
        }
      }
    }

    if (!holder) {
      return NextResponse.json({
        error: 'Aucun ATC en ligne sur le départ ou l\'arrivée. Cochez "Vol sans ATC" pour l\'autosurveillance.'
      }, { status: 400 });
    }

    const { data, error } = await admin.from('plans_vol')
      .insert(buildPlanInsert({
        statut: 'en_attente',
        current_holder_user_id: holder.user_id,
        current_holder_position: holder.position,
        current_holder_aeroport: holder.aeroport,
        automonitoring: false,
      }))
      .select('id')
      .single();

    if (error) return NextResponse.json({ error: 'Erreur lors de la création' }, { status: 400 });

    try {
      await admin.from('atc_plans_controles').upsert({
        plan_vol_id: data.id,
        user_id: holder.user_id,
        aeroport: holder.aeroport,
        position: holder.position
      }, { onConflict: 'plan_vol_id,user_id,aeroport,position' });
    } catch (e) {
      console.error('Erreur enregistrement controle ATC initial MEDEVAC:', e);
    }

    await admin.from('siavi_avions')
      .update({ statut: 'in_flight' })
      .eq('id', siavi_avion_id);

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

    return NextResponse.json({
      ok: true,
      id: data.id,
      statut: 'en_attente',
      atc_contact: {
        nom: holderProfile?.identifiant || 'Contrôleur',
        position: `${holder.aeroport} ${posLabel}`,
        aeroport: holder.aeroport,
        frequence: vhfFreq?.frequency ? String(vhfFreq.frequency).replace('.', ' décimal ') : '',
      }
    });
  } catch (e) {
    console.error('SIAVI medevac POST:', e);
    return NextResponse.json({ error: 'Erreur serveur' }, { status: 500 });
  }
}
