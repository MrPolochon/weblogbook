/**
 * PFtesterODW — enregistreur de positions.
 *
 * Service permanent (Railway) qui interroge Project Flight chaque seconde et
 * écrit les positions du serveur privé dans Supabase. La carte n'a donc plus
 * besoin d'un navigateur ouvert pour construire les traces : elle relit
 * l'historique du vol en cours. Écrit en TypeScript pour réutiliser tel quel le
 * décodeur protobuf du site, seule source de vérité du format PF.
 */
import { createClient } from '@supabase/supabase-js';
import {
  PF_TRAFFIC_HEADERS,
  PF_TRAFFIC_URL,
  PF_TRAIL_MAX_STEP,
  PF_TRAIL_MIN_STEP,
  configuredServerId,
  decodeMultiPlanes,
  filterByServer,
  looksLikeProtobuf,
  pfFlightKey,
  type PfLiveAircraft,
} from '../src/lib/pftester-odw';

const POLL_MS = Number(process.env.PF_WORKER_POLL_MS || 1000);
const PURGE_EVERY_MS = 60_000;
/** Un vol sans position depuis ce délai est terminé : sa trace est supprimée. */
const FLIGHT_IDLE_SEC = Number(process.env.PF_WORKER_IDLE_SEC || 120);
const SUPABASE_URL = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || '';
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || '';

if (!SUPABASE_URL || !SERVICE_KEY) {
  console.error('[pf-worker] SUPABASE_URL et SUPABASE_SERVICE_ROLE_KEY sont requis.');
  process.exit(1);
}

const db = createClient(SUPABASE_URL, SERVICE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});

const serverId = configuredServerId();

type LastPoint = { x: number; y: number };
const lastByFlight = new Map<string, LastPoint>();

function flightKey(p: PfLiveAircraft): string {
  return pfFlightKey(p.robloxUsername || p.serverId, p.callsign);
}

async function fetchPlanes(): Promise<PfLiveAircraft[]> {
  const res = await fetch(PF_TRAFFIC_URL, { headers: PF_TRAFFIC_HEADERS, cache: 'no-store' });
  if (!res.ok) throw new Error(`amont ${res.status}`);
  const bytes = new Uint8Array(await res.arrayBuffer());
  if (!looksLikeProtobuf(bytes)) throw new Error('reponse amont non-protobuf');
  return filterByServer(decodeMultiPlanes(bytes), serverId);
}

/** Reprend le dernier point connu de chaque vol pour ne pas dupliquer après un redémarrage. */
async function primeFromDatabase(): Promise<void> {
  const { data, error } = await db
    .from('pf_odw_positions')
    .select('flight_key, map_x, map_y, recorded_at')
    .order('recorded_at', { ascending: false })
    .limit(2000);
  if (error) {
    console.error('[pf-worker] reprise impossible', error.message);
    return;
  }
  for (const row of data ?? []) {
    if (!lastByFlight.has(row.flight_key)) {
      lastByFlight.set(row.flight_key, { x: row.map_x, y: row.map_y });
    }
  }
  console.log(`[pf-worker] reprise de ${lastByFlight.size} vol(s) en cours`);
}

async function recordOnce(): Promise<void> {
  const planes = await fetchPlanes();
  const rows: Record<string, unknown>[] = [];
  const presence: Record<string, unknown>[] = [];
  const seen = new Set<string>();

  for (const p of planes) {
    const key = flightKey(p);
    seen.add(key);
    // La présence est notée à chaque relevé, même sans mouvement : un appareil
    // immobile est toujours en vol, et sa trace ne doit pas être purgée.
    presence.push({
      flight_key: key,
      server_id: p.serverId,
      roblox_username: p.robloxUsername || '',
      callsign: p.callsign || '',
      last_seen_at: new Date().toISOString(),
    });
    const last = lastByFlight.get(key);
    const moved = last ? Math.hypot(p.mapX - last.x, p.mapY - last.y) : Infinity;
    // Un appareil immobile au parking n'a pas besoin d'un point par seconde.
    if (last && moved < PF_TRAIL_MIN_STEP) continue;
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
      gap: Number.isFinite(moved) && moved > PF_TRAIL_MAX_STEP,
    });
    lastByFlight.set(key, { x: p.mapX, y: p.mapY });
  }

  for (const key of lastByFlight.keys()) {
    if (!seen.has(key)) lastByFlight.delete(key);
  }

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
}

async function purge(): Promise<void> {
  const { data, error } = await db.rpc('pf_odw_purge_finished_flights', {
    max_idle_seconds: FLIGHT_IDLE_SEC,
  });
  if (error) {
    console.error('[pf-worker] purge impossible', error.message);
    return;
  }
  if (typeof data === 'number' && data > 0) {
    console.log(`[pf-worker] ${data} point(s) supprime(s) (vols termines)`);
  }
}

async function main(): Promise<void> {
  console.log(`[pf-worker] demarrage · serveur ${serverId} · ${POLL_MS} ms`);
  await primeFromDatabase();

  let running = true;
  let consecutiveErrors = 0;
  const stop = (signal: string) => {
    console.log(`[pf-worker] arret sur ${signal}`);
    running = false;
  };
  process.on('SIGTERM', () => stop('SIGTERM'));
  process.on('SIGINT', () => stop('SIGINT'));

  let lastPurge = 0;
  while (running) {
    const started = Date.now();
    try {
      await recordOnce();
      if (consecutiveErrors) {
        console.log('[pf-worker] flux rétabli');
        consecutiveErrors = 0;
      }
    } catch (e) {
      consecutiveErrors++;
      // Un flux amont instable ne doit jamais arrêter le service ni noyer les logs.
      if (consecutiveErrors <= 3 || consecutiveErrors % 60 === 0) {
        console.error(
          `[pf-worker] echec ${consecutiveErrors}`,
          e instanceof Error ? e.message : e,
        );
      }
    }

    if (started - lastPurge > PURGE_EVERY_MS) {
      lastPurge = started;
      await purge().catch(() => undefined);
    }

    const elapsed = Date.now() - started;
    const wait = Math.max(100, POLL_MS - elapsed);
    await new Promise((resolve) => setTimeout(resolve, wait));
  }

  console.log('[pf-worker] arrete');
  process.exit(0);
}

main().catch((e) => {
  console.error('[pf-worker] erreur fatale', e);
  process.exit(1);
});
