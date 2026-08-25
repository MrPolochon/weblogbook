/**
 * PFtesterODW — enregistreur de positions.
 *
 * Service permanent (Railway) : interroge Project Flight chaque seconde et
 * écrit dans Supabase, que quelqu'un ait /carte-atc d'ouvert ou non.
 */
import { createClient } from '@supabase/supabase-js';
import { writeIngest, type PfTrailCursor } from '../src/lib/pf-odw-ingest';
import {
  PF_TRAFFIC_HEADERS,
  PF_TRAFFIC_URL,
  configuredServerId,
  decodeMultiPlanes,
  filterByServer,
  looksLikeProtobuf,
} from '../src/lib/pftester-odw';

const POLL_MS = Number(process.env.PF_WORKER_POLL_MS || 1000);
const PURGE_EVERY_MS = 60_000;
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
const cursors = new Map<string, PfTrailCursor>();

async function fetchPlanes() {
  const res = await fetch(PF_TRAFFIC_URL, { headers: PF_TRAFFIC_HEADERS, cache: 'no-store' });
  if (!res.ok) throw new Error(`amont ${res.status}`);
  const bytes = new Uint8Array(await res.arrayBuffer());
  if (!looksLikeProtobuf(bytes)) throw new Error('reponse amont non-protobuf');
  return filterByServer(decodeMultiPlanes(bytes), serverId);
}

async function primeFromDatabase(): Promise<void> {
  const { data, error } = await db
    .from('pf_odw_positions')
    .select('flight_key, map_x, map_y, altitude, recorded_at')
    .order('recorded_at', { ascending: false })
    .limit(2000);
  if (error) {
    console.error('[pf-worker] reprise impossible', error.message);
    return;
  }
  for (const row of data ?? []) {
    if (cursors.has(row.flight_key)) continue;
    cursors.set(row.flight_key, {
      x: row.map_x,
      y: row.map_y,
      alt: row.altitude,
      at: new Date(row.recorded_at).getTime(),
    });
  }
  console.log(`[pf-worker] reprise de ${cursors.size} vol(s) en cours`);
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
  let lastLog = 0;
  while (running) {
    const started = Date.now();
    try {
      const planes = await fetchPlanes();
      const wrote = await writeIngest(db, planes, cursors);
      if (consecutiveErrors) {
        console.log('[pf-worker] flux rétabli');
        consecutiveErrors = 0;
      }
      if (wrote > 0 || started - lastLog > 30_000) {
        lastLog = started;
        console.log(
          `[pf-worker] ${planes.length} avion(s) · ${wrote} point(s) · ${cursors.size} vol(s) suivis`,
        );
      }
    } catch (e) {
      consecutiveErrors++;
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
    await new Promise((resolve) => setTimeout(resolve, Math.max(100, POLL_MS - elapsed)));
  }

  console.log('[pf-worker] arrete');
  process.exit(0);
}

main().catch((e) => {
  console.error('[pf-worker] erreur fatale', e);
  process.exit(1);
});
