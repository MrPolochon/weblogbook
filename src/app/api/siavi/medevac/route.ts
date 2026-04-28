import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { canAccessSiavi } from '@/lib/siavi/permissions';
import { CODES_OACI_VALIDES } from '@/lib/aeroports-ptfs';
import { randomUUID } from 'crypto';

const ORDRE_DEPART = ['Delivery', 'Clairance', 'Ground', 'Tower', 'DEP', 'APP', 'Center'] as const;
const MAX_SEGMENTS = 5;

type SegmentInput = {
  aeroport_depart: string;
  aeroport_arrivee: string;
  temps_prev_min: number;
  type_vol: 'VFR' | 'IFR';
  intentions_vol?: string;
  sid_depart?: string;
  star_arrivee?: string;
  route_ifr?: string;
  niveau_croisiere?: string;
  strip_route?: string;
};

function validateSegment(seg: unknown, index: number): { ok: true; seg: SegmentInput } | { ok: false; error: string } {
  if (!seg || typeof seg !== 'object') return { ok: false, error: `Segment ${index + 1} invalide.` };
  const s = seg as Record<string, unknown>;
  const ad = String(s.aeroport_depart || '').toUpperCase();
  const aa = String(s.aeroport_arrivee || '').toUpperCase();
  if (!CODES_OACI_VALIDES.has(ad) || !CODES_OACI_VALIDES.has(aa)) {
    return { ok: false, error: `Segment ${index + 1} : aéroports invalides.` };
  }
  if (ad === aa) {
    return { ok: false, error: `Segment ${index + 1} : départ et arrivée identiques.` };
  }
  const t = Number(s.temps_prev_min);
  if (!Number.isFinite(t) || t < 1) {
    return { ok: false, error: `Segment ${index + 1} : temps prévu invalide (≥ 1).` };
  }
  const typeVol = String(s.type_vol || '');
  if (!['VFR', 'IFR'].includes(typeVol)) {
    return { ok: false, error: `Segment ${index + 1} : type VFR ou IFR requis.` };
  }
  if (typeVol === 'VFR' && !String(s.intentions_vol || '').trim()) {
    return { ok: false, error: `Segment ${index + 1} : intentions VFR requises.` };
  }
  if (typeVol === 'IFR') {
    if (!String(s.sid_depart || '').trim()) return { ok: false, error: `Segment ${index + 1} : SID requise.` };
    if (!String(s.star_arrivee || '').trim()) return { ok: false, error: `Segment ${index + 1} : STAR requise.` };
  }
  return {
    ok: true,
    seg: {
      aeroport_depart: ad,
      aeroport_arrivee: aa,
      temps_prev_min: Math.round(t),
      type_vol: typeVol as 'VFR' | 'IFR',
      intentions_vol: typeVol === 'VFR' ? String(s.intentions_vol || '').trim() : undefined,
      sid_depart: typeVol === 'IFR' ? String(s.sid_depart || '').trim() : undefined,
      star_arrivee: typeVol === 'IFR' ? String(s.star_arrivee || '').trim() : undefined,
      route_ifr: typeVol === 'IFR' && s.route_ifr ? String(s.route_ifr).trim() : undefined,
      niveau_croisiere: typeVol === 'IFR' && s.niveau_croisiere ? String(s.niveau_croisiere).trim().replace(/^FL\s*/i, '') : undefined,
      strip_route: s.strip_route ? String(s.strip_route).trim() : undefined,
    },
  };
}

export async function POST(request: Request) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Non autorisé' }, { status: 401 });

    const admin = createAdminClient();
    const ok = await canAccessSiavi(admin, user.id);
    if (!ok) return NextResponse.json({ error: 'Accès SIAVI requis' }, { status: 403 });

    const body = await request.json();
    const { aeroport_depart, numero_vol, siavi_avion_id, vol_sans_atc, segments } = body;

    // -- Validations globales --
    const ad0 = String(aeroport_depart || '').toUpperCase();
    if (!CODES_OACI_VALIDES.has(ad0)) {
      return NextResponse.json({ error: 'Aéroport de départ invalide.' }, { status: 400 });
    }
    if (!numero_vol || !/^\d+$/.test(String(numero_vol).trim())) {
      return NextResponse.json({ error: 'Numéro de vol requis (chiffres uniquement).' }, { status: 400 });
    }
    if (!siavi_avion_id) {
      return NextResponse.json({ error: 'Sélectionnez un avion de la flotte SIAVI.' }, { status: 400 });
    }
    if (!Array.isArray(segments) || segments.length < 1) {
      return NextResponse.json({ error: 'Au moins un segment est requis.' }, { status: 400 });
    }
    if (segments.length > MAX_SEGMENTS) {
      return NextResponse.json({ error: `Maximum ${MAX_SEGMENTS} segments.` }, { status: 400 });
    }

    const segmentsValidated: SegmentInput[] = [];
    for (let i = 0; i < segments.length; i++) {
      const res = validateSegment(segments[i], i);
      if (!res.ok) return NextResponse.json({ error: res.error }, { status: 400 });
      segmentsValidated.push(res.seg);
    }

    // Chaînage des segments : le départ du segment N+1 doit être l'arrivée du segment N
    if (segmentsValidated[0].aeroport_depart !== ad0) {
      return NextResponse.json({ error: 'Le départ du 1er segment doit correspondre à l\'aéroport de départ initial.' }, { status: 400 });
    }
    for (let i = 1; i < segmentsValidated.length; i++) {
      if (segmentsValidated[i].aeroport_depart !== segmentsValidated[i - 1].aeroport_arrivee) {
        return NextResponse.json({
          error: `Segment ${i + 1} : le départ doit correspondre à l'arrivée du segment ${i} (${segmentsValidated[i - 1].aeroport_arrivee}).`
        }, { status: 400 });
      }
    }

    const numeroVolFinal = `MEDEVAC${String(numero_vol).trim()}`;

    // -- Vérifier plan actif existant pour cet agent --
    // On inclut 'planifie_suivant' et 'en_pause' : une mission MEDEVAC multi-segments en cours
    // bloque la création d'une nouvelle mission.
    const { count: plansActifs } = await admin.from('plans_vol')
      .select('*', { count: 'exact', head: true })
      .eq('pilote_id', user.id)
      .in('statut', ['depose', 'en_attente', 'accepte', 'en_cours', 'automonitoring', 'en_attente_cloture', 'planifie_suivant', 'en_pause']);

    if (plansActifs && plansActifs > 0) {
      return NextResponse.json({ error: 'Vous avez déjà un plan de vol actif.' }, { status: 400 });
    }

    // -- Vérifier avion SIAVI --
    const { data: avion } = await admin.from('siavi_avions')
      .select('id, aeroport_actuel, statut, usure_percent, immatriculation')
      .eq('id', siavi_avion_id)
      .single();

    if (!avion) {
      return NextResponse.json({ error: 'Avion SIAVI introuvable.' }, { status: 400 });
    }
    if (avion.aeroport_actuel !== ad0) {
      return NextResponse.json({
        error: `L'avion ${avion.immatriculation} se trouve à ${avion.aeroport_actuel}, pas à ${ad0}.`
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
      .in('statut', ['depose', 'en_attente', 'accepte', 'en_cours', 'automonitoring', 'en_attente_cloture', 'planifie_suivant', 'en_pause']);

    if (plansAvion && plansAvion > 0) {
      return NextResponse.json({ error: `L'avion ${avion.immatriculation} a déjà un plan de vol en cours.` }, { status: 400 });
    }

    // -- Recherche ATC pour le premier segment uniquement --
    const seg0 = segmentsValidated[0];
    const buildInsertFromSegment = (seg: SegmentInput, holderFields: Record<string, unknown>, mission: { id: string | null; index: number | null; total: number | null }) => ({
      pilote_id: user.id,
      aeroport_depart: seg.aeroport_depart,
      aeroport_arrivee: seg.aeroport_arrivee,
      numero_vol: numeroVolFinal,
      temps_prev_min: seg.temps_prev_min,
      type_vol: seg.type_vol,
      intentions_vol: seg.type_vol === 'VFR' ? seg.intentions_vol || null : null,
      sid_depart: seg.type_vol === 'IFR' ? seg.sid_depart || null : null,
      star_arrivee: seg.type_vol === 'IFR' ? seg.star_arrivee || null : null,
      route_ifr: seg.type_vol === 'IFR' && seg.route_ifr ? seg.route_ifr : null,
      strip_sid_atc: seg.type_vol === 'IFR' && seg.sid_depart ? seg.sid_depart : null,
      strip_star: seg.type_vol === 'IFR' && seg.star_arrivee ? seg.star_arrivee : null,
      strip_route: seg.strip_route || null,
      strip_fl: seg.type_vol === 'IFR' && seg.niveau_croisiere ? seg.niveau_croisiere : null,
      strip_fl_unit: 'FL',
      niveau_croisiere: seg.type_vol === 'IFR' && seg.niveau_croisiere ? seg.niveau_croisiere : null,
      vol_commercial: false,
      compagnie_id: null,
      siavi_avion_id,
      vol_ferry: false,
      vol_sans_atc: Boolean(vol_sans_atc),
      medevac_mission_id: mission.id,
      medevac_segment_index: mission.index,
      medevac_total_segments: mission.total,
      ...holderFields,
    });

    const isMultiSegment = segmentsValidated.length > 1;
    const missionId = isMultiSegment ? randomUUID() : null;
    const mission = (idx: number) => ({
      id: missionId,
      index: isMultiSegment ? idx + 1 : null,
      total: isMultiSegment ? segmentsValidated.length : null,
    });

    // -- Mode vol sans ATC : segment 1 en 'accepte' + automonitoring, suivants en 'planifie_suivant' --
    if (vol_sans_atc) {
      const firstInsert = buildInsertFromSegment(seg0, {
        statut: 'accepte',
        accepted_at: new Date().toISOString(),
        automonitoring: true,
        current_holder_user_id: null,
        current_holder_position: null,
        current_holder_aeroport: null,
      }, mission(0));

      const { data: firstPlan, error: firstErr } = await admin.from('plans_vol')
        .insert(firstInsert)
        .select('id')
        .single();

      if (firstErr || !firstPlan) return NextResponse.json({ error: 'Erreur lors de la création' }, { status: 400 });

      // Créer les segments suivants en 'planifie_suivant'
      const nextIds: string[] = [];
      for (let i = 1; i < segmentsValidated.length; i++) {
        const seg = segmentsValidated[i];
        const insert = buildInsertFromSegment(seg, {
          statut: 'planifie_suivant',
          automonitoring: false,
          current_holder_user_id: null,
          current_holder_position: null,
          current_holder_aeroport: null,
        }, mission(i));
        const { data: p, error } = await admin.from('plans_vol').insert(insert).select('id').single();
        if (error || !p) {
          // rollback
          await admin.from('plans_vol').delete().eq('id', firstPlan.id);
          for (const id of nextIds) await admin.from('plans_vol').delete().eq('id', id);
          return NextResponse.json({ error: 'Erreur lors de la création des segments suivants' }, { status: 400 });
        }
        nextIds.push(p.id);
      }

      // Linker les segments via medevac_next_plan_id (1 -> 2 -> 3 ...)
      const allIds = [firstPlan.id, ...nextIds];
      for (let i = 0; i < allIds.length - 1; i++) {
        await admin.from('plans_vol').update({ medevac_next_plan_id: allIds[i + 1] }).eq('id', allIds[i]);
      }

      await admin.from('siavi_avions')
        .update({ statut: 'in_flight' })
        .eq('id', siavi_avion_id);

      return NextResponse.json({ ok: true, id: firstPlan.id, mission_id: missionId, statut: 'accepte', vol_sans_atc: true, segments: allIds.length });
    }

    // -- Chercher un ATC pour le 1er segment (départ uniquement ; pas d’acceptation initiale par l’arrivée) --
    let holder: { user_id: string; position: string; aeroport: string } | null = null;
    const { data: allSessions } = await admin.from('atc_sessions')
      .select('user_id, position, aeroport')
      .eq('aeroport', seg0.aeroport_depart);

    if (allSessions && allSessions.length > 0) {
      for (const pos of ORDRE_DEPART) {
        const session = allSessions.find(s => s.aeroport === seg0.aeroport_depart && s.position === pos);
        if (session?.user_id) { holder = { user_id: session.user_id, position: pos, aeroport: seg0.aeroport_depart }; break; }
      }
    }

    if (!holder) {
      return NextResponse.json({
        error: 'Aucun ATC en ligne à l\'aéroport de départ. Cochez "Vol sans ATC" pour l\'autosurveillance.'
      }, { status: 400 });
    }

    // Créer le 1er segment en 'en_attente'
    const firstInsert = buildInsertFromSegment(seg0, {
      statut: 'en_attente',
      current_holder_user_id: holder.user_id,
      current_holder_position: holder.position,
      current_holder_aeroport: holder.aeroport,
      automonitoring: false,
    }, mission(0));

    const { data: firstPlan, error: firstErr } = await admin.from('plans_vol')
      .insert(firstInsert)
      .select('id')
      .single();

    if (firstErr || !firstPlan) return NextResponse.json({ error: 'Erreur lors de la création' }, { status: 400 });

    // Créer les segments suivants en 'planifie_suivant' (pas d'ATC assigné)
    const nextIds: string[] = [];
    for (let i = 1; i < segmentsValidated.length; i++) {
      const seg = segmentsValidated[i];
      const insert = buildInsertFromSegment(seg, {
        statut: 'planifie_suivant',
        automonitoring: false,
        current_holder_user_id: null,
        current_holder_position: null,
        current_holder_aeroport: null,
      }, mission(i));
      const { data: p, error } = await admin.from('plans_vol').insert(insert).select('id').single();
      if (error || !p) {
        await admin.from('plans_vol').delete().eq('id', firstPlan.id);
        for (const id of nextIds) await admin.from('plans_vol').delete().eq('id', id);
        return NextResponse.json({ error: 'Erreur lors de la création des segments suivants' }, { status: 400 });
      }
      nextIds.push(p.id);
    }

    const allIds = [firstPlan.id, ...nextIds];
    for (let i = 0; i < allIds.length - 1; i++) {
      await admin.from('plans_vol').update({ medevac_next_plan_id: allIds[i + 1] }).eq('id', allIds[i]);
    }

    try {
      await admin.from('atc_plans_controles').upsert({
        plan_vol_id: firstPlan.id,
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
      id: firstPlan.id,
      mission_id: missionId,
      statut: 'en_attente',
      segments: allIds.length,
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
