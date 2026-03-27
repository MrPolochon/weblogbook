import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import {
  DEFAULT_POSITIONS,
  toSVG,
  interpolatePosition,
  calculateHeading,
  type RadarTarget,
} from '@/lib/radar-utils';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Non autorisé' }, { status: 401 });

    const { data: profile } = await supabase
      .from('profiles')
      .select('role, radar_beta')
      .eq('id', user.id)
      .single();

    if (!profile) return NextResponse.json({ error: 'Profil introuvable' }, { status: 403 });
    if (profile.role !== 'admin' && !profile.radar_beta) {
      return NextResponse.json({ error: 'Accès radar non autorisé' }, { status: 403 });
    }

    const admin = createAdminClient();
    const now = Date.now();

    const [{ data: plansVol }, { data: ingested }] = await Promise.all([
      admin
        .from('plans_vol')
        .select(`
          id, numero_vol, type_vol,
          aeroport_depart, aeroport_arrivee,
          temps_prev_min, accepted_at,
          strip_fl, strip_fl_unit,
          code_transpondeur,
          route_ifr, strip_route, strip_sid_atc, sid_depart, star_arrivee, strip_star,
          current_holder_user_id, current_holder_position, current_holder_aeroport,
          pilote_id,
          profiles!plans_vol_pilote_id_fkey ( identifiant, callsign )
        `)
        .in('statut', ['en_cours', 'automonitoring']),
      admin
        .from('radar_ingested_positions')
        .select('matched_plan_vol_id, position_x, position_y, confidence')
        .gt('created_at', new Date(now - 15000).toISOString())
        .order('created_at', { ascending: false }),
    ]);

    const ingestedByPlan = new Map<string, { x: number; y: number; confidence: number }>();
    if (ingested) {
      for (const row of ingested) {
        if (row.matched_plan_vol_id && !ingestedByPlan.has(row.matched_plan_vol_id)) {
          ingestedByPlan.set(row.matched_plan_vol_id, {
            x: row.position_x,
            y: row.position_y,
            confidence: row.confidence ?? 0,
          });
        }
      }
    }

    let dataSource: 'interpolation' | 'capture' | 'mixed' = 'interpolation';
    if (ingestedByPlan.size > 0) dataSource = 'mixed';

    const targets: RadarTarget[] = [];

    for (const pv of plansVol ?? []) {
      const depPos = DEFAULT_POSITIONS[pv.aeroport_depart];
      const arrPos = DEFAULT_POSITIONS[pv.aeroport_arrivee];
      if (!depPos || !arrPos) continue;

      const depSVG = toSVG(depPos);
      const arrSVG = toSVG(arrPos);

      const capturedPos = ingestedByPlan.get(pv.id);
      let position: { x: number; y: number };
      let progress: number;
      let source: 'interpolation' | 'capture' = 'interpolation';

      if (capturedPos && capturedPos.confidence > 0.3) {
        position = { x: capturedPos.x, y: capturedPos.y };
        source = 'capture';
        if (dataSource === 'interpolation') dataSource = 'mixed';
        const totalDist = Math.sqrt(
          (arrSVG.x - depSVG.x) ** 2 + (arrSVG.y - depSVG.y) ** 2,
        );
        const coveredDist = Math.sqrt(
          (position.x - depSVG.x) ** 2 + (position.y - depSVG.y) ** 2,
        );
        progress = totalDist > 0 ? Math.min(1, coveredDist / totalDist) : 0;
      } else {
        const acceptedAt = pv.accepted_at ? new Date(pv.accepted_at).getTime() : now;
        const elapsedMs = now - acceptedAt;
        const totalMs = (pv.temps_prev_min || 30) * 60 * 1000;
        progress = Math.max(0, Math.min(1, elapsedMs / totalMs));
        position = interpolatePosition(depSVG, arrSVG, progress);
      }

      const heading = calculateHeading(depSVG, arrSVG);
      const profileData = pv.profiles as { identifiant?: string; callsign?: string } | null;

      targets.push({
        id: pv.id,
        callsign: profileData?.callsign || pv.numero_vol,
        numero_vol: pv.numero_vol,
        type_vol: pv.type_vol,
        aeroport_depart: pv.aeroport_depart,
        aeroport_arrivee: pv.aeroport_arrivee,
        position,
        heading,
        progress,
        altitude: pv.strip_fl ?? null,
        altitude_unit: pv.strip_fl_unit ?? 'FL',
        squawk: pv.code_transpondeur ?? null,
        route: pv.strip_route || pv.route_ifr || null,
        sid: pv.strip_sid_atc || pv.sid_depart || null,
        star: pv.strip_star || pv.star_arrivee || null,
        assumed_by: pv.current_holder_user_id ?? null,
        assumed_position: pv.current_holder_position ?? null,
        assumed_aeroport: pv.current_holder_aeroport ?? null,
        on_ground: progress < 0.05 || progress > 0.95,
        source,
        temps_prev_min: pv.temps_prev_min,
        pilote_identifiant: profileData?.identifiant ?? null,
      });
    }

    if (targets.length > 0 && ingestedByPlan.size >= targets.length) {
      dataSource = 'capture';
    }

    return NextResponse.json({ targets, timestamp: now, source: dataSource });
  } catch (err) {
    console.error('Radar targets error:', err);
    return NextResponse.json({ error: 'Erreur serveur' }, { status: 500 });
  }
}
