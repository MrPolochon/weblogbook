import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import {
  DEFAULT_POSITIONS,
  toSVG,
  interpolatePosition,
  calculateDistance,
} from '@/lib/radar-utils';
import { createHash } from 'crypto';

export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest) {
  try {
    const authHeader = request.headers.get('authorization');
    if (!authHeader?.startsWith('Bearer ')) {
      return NextResponse.json({ error: 'Token manquant' }, { status: 401 });
    }
    const token = authHeader.slice(7);
    const tokenHash = createHash('sha256').update(token).digest('hex');

    const admin = createAdminClient();

    const { data: tokenRow } = await admin
      .from('radar_api_tokens')
      .select('id, user_id')
      .eq('token_hash', tokenHash)
      .single();

    if (!tokenRow) {
      return NextResponse.json({ error: 'Token invalide' }, { status: 401 });
    }

    await admin
      .from('radar_api_tokens')
      .update({ last_used_at: new Date().toISOString() })
      .eq('id', tokenRow.id);

    const body = await request.json();
    const positions: { x: number; y: number; cluster_id: number }[] = body.positions;

    if (!Array.isArray(positions) || positions.length === 0) {
      return NextResponse.json({ error: 'Aucune position fournie' }, { status: 400 });
    }

    if (positions.length > 50) {
      return NextResponse.json({ error: 'Trop de positions (max 50)' }, { status: 400 });
    }

    const now = Date.now();
    const { data: activePlans } = await admin
      .from('plans_vol')
      .select('id, aeroport_depart, aeroport_arrivee, temps_prev_min, accepted_at')
      .in('statut', ['en_cours', 'automonitoring']);

    const interpolated = (activePlans ?? []).map((pv) => {
      const dep = DEFAULT_POSITIONS[pv.aeroport_depart];
      const arr = DEFAULT_POSITIONS[pv.aeroport_arrivee];
      if (!dep || !arr) return null;
      const depSVG = toSVG(dep);
      const arrSVG = toSVG(arr);
      const acceptedAt = pv.accepted_at ? new Date(pv.accepted_at).getTime() : now;
      const elapsedMs = now - acceptedAt;
      const totalMs = (pv.temps_prev_min || 30) * 60 * 1000;
      const progress = Math.max(0, Math.min(1, elapsedMs / totalMs));
      const pos = interpolatePosition(depSVG, arrSVG, progress);
      return { id: pv.id, position: pos };
    }).filter(Boolean) as { id: string; position: { x: number; y: number } }[];

    const MATCH_THRESHOLD = 60;
    const rows = positions.map((p) => {
      let bestMatch: string | null = null;
      let bestDist = Infinity;
      let bestConfidence = 0;

      for (const plan of interpolated) {
        const dist = calculateDistance(p, plan.position);
        if (dist < bestDist && dist < MATCH_THRESHOLD) {
          bestDist = dist;
          bestMatch = plan.id;
          bestConfidence = Math.max(0, 1 - dist / MATCH_THRESHOLD);
        }
      }

      return {
        submitted_by: tokenRow.user_id,
        cluster_id: p.cluster_id,
        position_x: p.x,
        position_y: p.y,
        matched_plan_vol_id: bestMatch,
        confidence: bestConfidence,
      };
    });

    await admin
      .from('radar_ingested_positions')
      .delete()
      .eq('submitted_by', tokenRow.user_id)
      .lt('created_at', new Date(now - 30000).toISOString());

    const { error } = await admin.from('radar_ingested_positions').insert(rows);
    if (error) throw error;

    const matched = rows.filter((r) => r.matched_plan_vol_id).length;
    return NextResponse.json({
      ok: true,
      ingested: rows.length,
      matched,
      unmatched: rows.length - matched,
    });
  } catch (err) {
    console.error('Radar ingest error:', err);
    return NextResponse.json({ error: 'Erreur serveur' }, { status: 500 });
  }
}
