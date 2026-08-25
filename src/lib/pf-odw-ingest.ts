import type { SupabaseClient } from '@supabase/supabase-js';
import { isTrailGap, pfFlightKey, type PfLiveAircraft } from './pftester-odw';

export type PfTrailCursor = { x: number; y: number; alt: number; at: number };

/** Plus petit que l'ancien seuil : on veut chaque palier PF, pas seulement les gros déplacements. */
const MOVE_STEP = 0.002;
const ALT_STEP = 12;

export function pfPlaneKey(p: PfLiveAircraft): string {
  return pfFlightKey(p.robloxUsername || p.serverId, p.callsign);
}

export function collectIngestRows(
  planes: PfLiveAircraft[],
  cursors: Map<string, PfTrailCursor>,
): { rows: Record<string, unknown>[]; presence: Record<string, unknown>[]; seen: Set<string> } {
  const rows: Record<string, unknown>[] = [];
  const presence: Record<string, unknown>[] = [];
  const seen = new Set<string>();
  const now = Date.now();

  for (const p of planes) {
    const key = pfPlaneKey(p);
    seen.add(key);
    presence.push({
      flight_key: key,
      server_id: p.serverId,
      roblox_username: p.robloxUsername || '',
      callsign: p.callsign || '',
      last_seen_at: new Date(now).toISOString(),
      map_x: p.mapX,
      map_y: p.mapY,
      game_x: p.x,
      game_y: p.y,
      altitude: p.altitude,
      speed: p.speed,
      heading: p.heading,
      model: p.model || '',
      livery: p.livery || '',
    });

    const last = cursors.get(key);
    const moved = last ? Math.hypot(p.mapX - last.x, p.mapY - last.y) : Infinity;
    const altDelta = last ? Math.abs(p.altitude - last.alt) : Infinity;
    if (last && moved < MOVE_STEP && altDelta < ALT_STEP) continue;

    const dt = last ? (now - last.at) / 1000 : 1;
    rows.push({
      flight_key: key,
      server_id: p.serverId,
      roblox_username: p.robloxUsername || '',
      callsign: p.callsign || '',
      map_x: p.mapX,
      map_y: p.mapY,
      altitude: p.altitude,
      speed: p.speed,
      heading: p.heading,
      gap: Number.isFinite(moved) && isTrailGap(moved, dt),
    });
    cursors.set(key, { x: p.mapX, y: p.mapY, alt: p.altitude, at: now });
  }

  for (const key of [...cursors.keys()]) {
    if (!seen.has(key)) cursors.delete(key);
  }

  return { rows, presence, seen };
}

export async function writeIngest(
  db: SupabaseClient,
  planes: PfLiveAircraft[],
  cursors: Map<string, PfTrailCursor>,
): Promise<number> {
  const { rows, presence } = collectIngestRows(planes, cursors);

  if (presence.length) {
    const { error } = await db
      .from('pf_odw_flights')
      .upsert(presence, { onConflict: 'flight_key', ignoreDuplicates: false });
    if (error) throw new Error(`presence: ${error.message}`);
  }

  if (rows.length) {
    const { error } = await db.from('pf_odw_positions').insert(rows);
    if (error) throw new Error(`insertion: ${error.message}`);
  }

  return rows.length;
}

export async function loadCursors(
  db: SupabaseClient,
  keys: string[],
): Promise<Map<string, PfTrailCursor>> {
  const cursors = new Map<string, PfTrailCursor>();
  if (!keys.length) return cursors;
  const { data, error } = await db
    .from('pf_odw_positions')
    .select('flight_key, map_x, map_y, altitude, recorded_at')
    .in('flight_key', keys)
    .order('recorded_at', { ascending: false })
    .limit(Math.max(50, keys.length * 8));
  if (error) throw new Error(`cursors: ${error.message}`);
  for (const row of data ?? []) {
    if (cursors.has(row.flight_key)) continue;
    cursors.set(row.flight_key, {
      x: row.map_x,
      y: row.map_y,
      alt: row.altitude,
      at: new Date(row.recorded_at).getTime(),
    });
  }
  return cursors;
}
