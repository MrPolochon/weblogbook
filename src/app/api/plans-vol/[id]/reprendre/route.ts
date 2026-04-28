import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { joinSidStarRoute, buildRouteWithManual, stripRouteBrackets } from '@/lib/utils';

const ORDRE_DEPART = ['Delivery', 'Clairance', 'Ground', 'Tower', 'DEP', 'APP', 'Center'] as const;

/**
 * Active le segment suivant d'une mission MEDEVAC multi-segments.
 *
 * POST /api/plans-vol/[id]/reprendre
 * Body (VFR): { intentions_vol }
 * Body (IFR): { sid_depart, star_arrivee, route_ifr?, niveau_croisiere? }
 *
 * Flux :
 * 1. Vérifie que le plan est bien en statut 'planifie_suivant' et qu'il appartient au pilote
 * 2. Vérifie que le segment précédent est 'en_pause' ou 'cloture' (finalise 'en_pause' → 'cloture')
 * 3. Met à jour les infos de navigation (SID/STAR ou intentions)
 * 4. Cherche un ATC pour ce segment, ou active en autosurveillance
 * 5. Passe le segment en 'en_attente' (avec ATC) ou 'accepte' (vol sans ATC)
 */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Non autorisé' }, { status: 401 });

    const admin = createAdminClient();
    const body = await request.json();
    const {
      sid_depart,
      star_arrivee,
      route_ifr,
      niveau_croisiere,
      intentions_vol,
      selected_sid_route,
      selected_star_route,
      manual_route_part,
    } = body || {};

    // Charger le segment à reprendre
    const { data: segment, error: segErr } = await admin.from('plans_vol')
      .select('id, pilote_id, statut, aeroport_depart, aeroport_arrivee, type_vol, numero_vol, siavi_avion_id, medevac_mission_id, medevac_segment_index, medevac_total_segments, medevac_next_plan_id, vol_sans_atc, temps_prev_min')
      .eq('id', id)
      .single();

    if (segErr || !segment) {
      return NextResponse.json({ error: 'Segment introuvable.' }, { status: 404 });
    }
    if (segment.pilote_id !== user.id) {
      return NextResponse.json({ error: 'Ce segment ne vous appartient pas.' }, { status: 403 });
    }
    if (segment.statut !== 'planifie_suivant') {
      return NextResponse.json({ error: 'Ce segment n\'est pas en attente d\'activation.' }, { status: 400 });
    }
    if (!segment.medevac_mission_id) {
      return NextResponse.json({ error: 'Ce segment n\'appartient pas à une mission MEDEVAC multi-segments.' }, { status: 400 });
    }

    // Trouver le segment précédent (celui qui pointe vers celui-ci)
    const { data: segmentPrec } = await admin.from('plans_vol')
      .select('id, statut, aeroport_arrivee')
      .eq('medevac_next_plan_id', id)
      .maybeSingle();

    if (!segmentPrec) {
      return NextResponse.json({ error: 'Segment précédent introuvable pour cette mission.' }, { status: 400 });
    }
    if (segmentPrec.statut !== 'en_pause' && segmentPrec.statut !== 'cloture') {
      return NextResponse.json({
        error: `Le segment précédent doit être clôturé avant de reprendre (statut actuel: ${segmentPrec.statut}).`
      }, { status: 400 });
    }

    // Vérification cohérence aéroport : l'arrivée du segment précédent
    // doit correspondre au départ de ce segment.
    if (segmentPrec.aeroport_arrivee !== segment.aeroport_depart) {
      return NextResponse.json({
        error: `Incohérence d'aéroport : le segment précédent est arrivé à ${segmentPrec.aeroport_arrivee} mais ce segment part de ${segment.aeroport_depart}.`
      }, { status: 400 });
    }

    // Validation des nouveaux paramètres de navigation
    const typeVol = segment.type_vol;
    if (typeVol === 'IFR') {
      if (!String(sid_depart || '').trim() || !String(star_arrivee || '').trim()) {
        return NextResponse.json({ error: 'SID et STAR sont requises pour ce segment IFR.' }, { status: 400 });
      }
    } else if (typeVol === 'VFR') {
      if (!String(intentions_vol || '').trim()) {
        return NextResponse.json({ error: 'Les intentions de vol sont requises pour ce segment VFR.' }, { status: 400 });
      }
    }

    // Construire le patch de navigation à appliquer au segment
    const nav: Record<string, unknown> = {};
    if (typeVol === 'IFR') {
      const sid = String(sid_depart).trim();
      const star = String(star_arrivee).trim();
      const routeFree = String(route_ifr || '').trim();
      const manual = String(manual_route_part || '').trim();
      const selSid = selected_sid_route ? String(selected_sid_route) : null;
      const selStar = selected_star_route ? String(selected_star_route) : null;

      const routeCalculee = buildRouteWithManual(selSid, manual, selStar);
      const routeFinale = stripRouteBrackets(routeFree || routeCalculee).trim();
      const stripRoute = routeFinale
        || (selSid && selStar ? joinSidStarRoute(selSid, selStar) : [selSid, selStar].filter(Boolean).join(' '))
        || 'RADAR VECTORS DCT';

      nav.sid_depart = sid;
      nav.star_arrivee = star;
      nav.route_ifr = routeFinale || null;
      nav.strip_sid_atc = sid;
      nav.strip_star = star;
      nav.strip_route = stripRoute;
      if (niveau_croisiere && String(niveau_croisiere).trim()) {
        const fl = String(niveau_croisiere).trim().replace(/^FL\s*/i, '');
        nav.niveau_croisiere = fl;
        nav.strip_fl = fl;
        nav.strip_fl_unit = 'FL';
      }
    } else {
      nav.intentions_vol = String(intentions_vol).trim();
    }

    // Finaliser le segment précédent (en_pause → cloture)
    if (segmentPrec.statut === 'en_pause') {
      await admin.from('plans_vol')
        .update({ statut: 'cloture' })
        .eq('id', segmentPrec.id)
        .eq('statut', 'en_pause');
    }

    // Choisir le mode d'activation : ATC ou autosurveillance
    const volSansAtc = Boolean(segment.vol_sans_atc);

    if (volSansAtc) {
      const { error: actErr } = await admin.from('plans_vol')
        .update({
          ...nav,
          statut: 'accepte',
          accepted_at: new Date().toISOString(),
          automonitoring: true,
          current_holder_user_id: null,
          current_holder_position: null,
          current_holder_aeroport: null,
        })
        .eq('id', id)
        .eq('statut', 'planifie_suivant');

      if (actErr) {
        return NextResponse.json({ error: 'Erreur lors de l\'activation du segment.' }, { status: 500 });
      }

      return NextResponse.json({ ok: true, statut: 'accepte', vol_sans_atc: true });
    }

    // Chercher un ATC en ligne au départ du segment uniquement
    const { data: allSessions } = await admin.from('atc_sessions')
      .select('user_id, position, aeroport')
      .eq('aeroport', segment.aeroport_depart);

    let holder: { user_id: string; position: string; aeroport: string } | null = null;
    if (allSessions && allSessions.length > 0) {
      for (const pos of ORDRE_DEPART) {
        const session = allSessions.find(s => s.aeroport === segment.aeroport_depart && s.position === pos);
        if (session?.user_id) { holder = { user_id: session.user_id, position: pos, aeroport: segment.aeroport_depart }; break; }
      }
    }

    const forceSansAtc = Boolean(body.force_sans_atc);

    if (!holder && !forceSansAtc) {
      return NextResponse.json({
        error: 'Aucun ATC en ligne à l\'aéroport de départ de ce segment. Activez "Continuer sans ATC" pour l\'autosurveillance.'
      }, { status: 400 });
    }

    if (!holder && forceSansAtc) {
      const { error: actErr } = await admin.from('plans_vol')
        .update({
          ...nav,
          statut: 'accepte',
          accepted_at: new Date().toISOString(),
          automonitoring: true,
          vol_sans_atc: true,
          current_holder_user_id: null,
          current_holder_position: null,
          current_holder_aeroport: null,
        })
        .eq('id', id)
        .eq('statut', 'planifie_suivant');

      if (actErr) {
        return NextResponse.json({ error: 'Erreur lors de l\'activation du segment.' }, { status: 500 });
      }
      return NextResponse.json({ ok: true, statut: 'accepte', vol_sans_atc: true });
    }

    // Activer avec ATC
    const { error: actErr } = await admin.from('plans_vol')
      .update({
        ...nav,
        statut: 'en_attente',
        current_holder_user_id: holder!.user_id,
        current_holder_position: holder!.position,
        current_holder_aeroport: holder!.aeroport,
        automonitoring: false,
      })
      .eq('id', id)
      .eq('statut', 'planifie_suivant');

    if (actErr) {
      return NextResponse.json({ error: 'Erreur lors de l\'activation du segment.' }, { status: 500 });
    }

    try {
      await admin.from('atc_plans_controles').upsert({
        plan_vol_id: id,
        user_id: holder!.user_id,
        aeroport: holder!.aeroport,
        position: holder!.position,
      }, { onConflict: 'plan_vol_id,user_id,aeroport,position' });
    } catch (e) {
      console.error('Erreur enregistrement controle ATC reprendre:', e);
    }

    const { data: holderProfile } = await admin.from('profiles').select('identifiant').eq('id', holder!.user_id).single();
    const { data: vhfFreq } = await admin.from('vhf_position_frequencies')
      .select('frequency')
      .eq('aeroport', holder!.aeroport)
      .eq('position', holder!.position)
      .maybeSingle();

    const POSITION_LABELS: Record<string, string> = {
      Delivery: 'Livraison', Clairance: 'Clairance', Ground: 'Sol', Tower: 'Tour',
      DEP: 'Départs', APP: 'Approche', Center: 'Centre', AFIS: 'AFIS',
    };
    const posLabel = POSITION_LABELS[holder!.position] || holder!.position;

    return NextResponse.json({
      ok: true,
      statut: 'en_attente',
      atc_contact: {
        nom: holderProfile?.identifiant || 'Contrôleur',
        position: `${holder!.aeroport} ${posLabel}`,
        aeroport: holder!.aeroport,
        frequence: vhfFreq?.frequency ? String(vhfFreq.frequency).replace('.', ' décimal ') : '',
      }
    });
  } catch (e) {
    console.error('Erreur reprendre segment MEDEVAC:', e);
    return NextResponse.json({ error: 'Erreur serveur' }, { status: 500 });
  }
}
