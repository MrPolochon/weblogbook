import { NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';

export const dynamic = 'force-dynamic';

const NO_STORE = {
  'Cache-Control': 'no-store, no-cache, must-revalidate, max-age=0',
  'CDN-Cache-Control': 'no-store',
  'Vercel-CDN-Cache-Control': 'no-store',
};

/** Garde-fou : au-delà, la carte n'a pas besoin de plus de détail pour un vol. */
const MAX_POINTS = 40_000;

type Row = {
  flight_key: string;
  map_x: number;
  map_y: number;
  altitude: number;
  gap: boolean;
  recorded_at: string;
};

/**
 * Traces des vols en cours, telles qu'enregistrées par le worker. Permet à la
 * carte d'afficher le trajet déjà parcouru sans qu'un navigateur soit resté ouvert.
 */
export async function GET() {
  try {
    const db = createAdminClient();
    const { data, error } = await db
      .from('pf_odw_positions')
      .select('flight_key, map_x, map_y, altitude, gap, recorded_at')
      .order('recorded_at', { ascending: true })
      .limit(MAX_POINTS);

    if (error) throw new Error(error.message);

    const tracks: Record<string, { x: number; y: number; alt: number; at: number; gap?: true }[]> = {};
    for (const row of (data ?? []) as Row[]) {
      const list = tracks[row.flight_key] ?? (tracks[row.flight_key] = []);
      list.push({
        x: row.map_x,
        y: row.map_y,
        alt: row.altitude,
        at: new Date(row.recorded_at).getTime(),
        ...(row.gap ? { gap: true as const } : {}),
      });
    }

    return NextResponse.json({ tracks, points: data?.length ?? 0 }, { headers: NO_STORE });
  } catch (err) {
    console.error('[pftester-odw/tracks]', err);
    return NextResponse.json(
      { error: 'Historique des traces indisponible.' },
      { status: 502, headers: NO_STORE },
    );
  }
}
