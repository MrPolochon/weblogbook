import { NextResponse } from 'next/server';
import { requirePfTesterAdmin } from '@/lib/pftester-odw-auth';
import { createAdminClient } from '@/lib/supabase/admin';
import { PF_DEFAULT_SERVER_ID } from '@/lib/pftester-odw';

export const dynamic = 'force-dynamic';

const NO_STORE = {
  'Cache-Control': 'no-store, no-cache, must-revalidate, max-age=0',
  'CDN-Cache-Control': 'no-store',
  'Vercel-CDN-Cache-Control': 'no-store',
};

const FRESH_MS = 45_000;

type FlightRow = {
  flight_key: string;
  server_id: string;
  roblox_username: string;
  callsign: string;
  last_seen_at: string;
  map_x: number | null;
  map_y: number | null;
  game_x: number | null;
  game_y: number | null;
  altitude: number | null;
  speed: number | null;
  heading: number | null;
  model: string | null;
  livery: string | null;
};

type PosRow = {
  flight_key: string;
  map_x: number;
  map_y: number;
  altitude: number;
  speed: number;
  heading: number;
  recorded_at: string;
};

/**
 * Dernier snapshot Mixou déjà en base (worker 24/7). Réponse légère pour
 * rafraîchir la carte chaque seconde, sans retélécharger le protobuf mondial.
 */
export async function GET() {
  const auth = await requirePfTesterAdmin();
  if (!auth.ok) return auth.response;

  try {
    const db = createAdminClient();
    const cutoff = new Date(Date.now() - FRESH_MS).toISOString();
    const { data, error } = await db
      .from('pf_odw_flights')
      .select(
        'flight_key, server_id, roblox_username, callsign, last_seen_at, map_x, map_y, game_x, game_y, altitude, speed, heading, model, livery',
      )
      .gte('last_seen_at', cutoff)
      .order('last_seen_at', { ascending: false });

    if (error) throw new Error(error.message);

    const rows = (data ?? []) as FlightRow[];
    const keys = rows.map((r) => r.flight_key);
    const latestPos = new Map<string, PosRow>();
    if (keys.length) {
      const { data: pts, error: posErr } = await db
        .from('pf_odw_positions')
        .select('flight_key, map_x, map_y, altitude, speed, heading, recorded_at')
        .in('flight_key', keys)
        .order('recorded_at', { ascending: false })
        .limit(Math.max(24, keys.length * 8));
      if (posErr) throw new Error(posErr.message);
      for (const p of (pts ?? []) as PosRow[]) {
        if (!latestPos.has(p.flight_key)) latestPos.set(p.flight_key, p);
      }
    }

    const aircraft = rows.flatMap((r) => {
      const pos = latestPos.get(r.flight_key);
      const mapX = typeof r.map_x === 'number' ? r.map_x : pos?.map_x;
      const mapY = typeof r.map_y === 'number' ? r.map_y : pos?.map_y;
      if (typeof mapX !== 'number' || typeof mapY !== 'number') return [];
      const alt = typeof r.altitude === 'number' ? r.altitude : (pos?.altitude ?? 0);
      const speed = typeof r.speed === 'number' ? r.speed : (pos?.speed ?? 0);
      const heading = typeof r.heading === 'number' ? r.heading : (pos?.heading ?? 0);
      return [
        {
          id: r.roblox_username ? `${r.roblox_username}:${r.callsign}` : r.flight_key,
          serverId: r.server_id || PF_DEFAULT_SERVER_ID,
          callsign: r.callsign,
          robloxUsername: r.roblox_username,
          heading: Math.round(heading),
          altitude: Math.round(alt),
          speed: Math.round(speed),
          model: r.model || '',
          livery: r.livery || '',
          x: r.game_x ?? undefined,
          y: r.game_y ?? undefined,
          mapX,
          mapY,
        },
      ];
    });

    const newest = rows[0]?.last_seen_at ? new Date(rows[0].last_seen_at).getTime() : Date.now();

    return NextResponse.json(
      {
        serverId: aircraft[0]?.serverId || PF_DEFAULT_SERVER_ID,
        count: aircraft.length,
        fetchedAt: newest,
        aircraft,
      },
      { headers: NO_STORE },
    );
  } catch (err) {
    console.error('[pftester-odw/now]', err);
    return NextResponse.json(
      { error: 'Snapshot trafic indisponible.' },
      { status: 502, headers: NO_STORE },
    );
  }
}
