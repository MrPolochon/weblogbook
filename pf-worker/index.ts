/**
 * PFtesterODW — enregistreur de positions.
 *
 * PFTracker ne construit pas la trace dans l'onglet : il s'abonne au WebSocket
 * du serveur (`/v3/traffic/server/ws/{id}`) et complète par un snapshot HTTP
 * toutes les 10 s. On fait la même chose ici, en écrivant dans Supabase, pour
 * que la carte ait le trajet même si personne n'a /carte-atc d'ouvert.
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
  pfTrafficServerWsUrl,
  type PfLiveAircraft,
} from '../src/lib/pftester-odw';

const FETCH_MS = 10_000;
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
let running = true;
let ingestChain = Promise.resolve();
let lastWroteAt = 0;

function messageBytes(data: unknown): Uint8Array {
  if (data instanceof ArrayBuffer) return new Uint8Array(data);
  if (ArrayBuffer.isView(data)) {
    return new Uint8Array(data.buffer, data.byteOffset, data.byteLength);
  }
  if (typeof Buffer !== 'undefined' && Buffer.isBuffer(data)) return new Uint8Array(data);
  return new Uint8Array();
}

function planesFromBytes(bytes: Uint8Array): PfLiveAircraft[] | null {
  if (!looksLikeProtobuf(bytes)) return null;
  return filterByServer(decodeMultiPlanes(bytes), serverId);
}

function enqueueIngest(planes: PfLiveAircraft[], source: string): void {
  ingestChain = ingestChain
    .then(async () => {
      const wrote = await writeIngest(db, planes, cursors);
      if (wrote > 0) {
        lastWroteAt = Date.now();
        console.log(`[pf-worker] ${source} · ${planes.length} avion(s) · ${wrote} point(s)`);
      }
    })
    .catch((e) => {
      console.error('[pf-worker] ingest', e instanceof Error ? e.message : e);
    });
}

async function fetchSnapshot(): Promise<PfLiveAircraft[]> {
  const res = await fetch(PF_TRAFFIC_URL, { headers: PF_TRAFFIC_HEADERS, cache: 'no-store' });
  if (!res.ok) throw new Error(`amont ${res.status}`);
  const bytes = new Uint8Array(await res.arrayBuffer());
  const planes = planesFromBytes(bytes);
  if (!planes) throw new Error('reponse amont non-protobuf');
  return planes;
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

function connectWs(): Promise<void> {
  return new Promise((resolve) => {
    const url = pfTrafficServerWsUrl(serverId);
    const ws = new WebSocket(url);
    ws.binaryType = 'arraybuffer';
    let opened = false;
    const timer = setInterval(() => {
      if (!running) ws.close();
    }, 2000);

    ws.addEventListener('open', () => {
      opened = true;
      console.log('[pf-worker] websocket connecte', url);
    });
    ws.addEventListener('message', (ev) => {
      const bytes = messageBytes(ev.data);
      // Les frames vides sont des heartbeats, pas « 0 avion ».
      if (bytes.byteLength < 8) return;
      const planes = planesFromBytes(bytes);
      if (!planes) return;
      enqueueIngest(planes, 'ws');
    });
    ws.addEventListener('error', () => {
      /* close suivra */
    });
    ws.addEventListener('close', () => {
      clearInterval(timer);
      console.log('[pf-worker] websocket ferme', opened ? 'apres session' : 'avant handshake');
      resolve();
    });
  });
}

async function wsLoop(): Promise<void> {
  let delay = 1000;
  while (running) {
    const started = Date.now();
    await connectWs();
    if (!running) break;
    if (Date.now() - started > 15_000) delay = 1000;
    console.log(`[pf-worker] reconnexion websocket dans ${delay} ms`);
    await new Promise((r) => setTimeout(r, delay));
    delay = Math.min(15_000, delay * 2);
  }
}

async function snapshotLoop(): Promise<void> {
  while (running) {
    try {
      const planes = await fetchSnapshot();
      enqueueIngest(planes, 'http');
    } catch (e) {
      console.error('[pf-worker] snapshot', e instanceof Error ? e.message : e);
    }
    await new Promise((r) => setTimeout(r, FETCH_MS));
  }
}

async function purgeLoop(): Promise<void> {
  while (running) {
    await new Promise((r) => setTimeout(r, PURGE_EVERY_MS));
    if (running) await purge().catch(() => undefined);
  }
}

async function main(): Promise<void> {
  console.log(`[pf-worker] demarrage · serveur ${serverId}`);
  await primeFromDatabase();

  const stop = (signal: string) => {
    console.log(`[pf-worker] arret sur ${signal}`);
    running = false;
  };
  process.on('SIGTERM', () => stop('SIGTERM'));
  process.on('SIGINT', () => stop('SIGINT'));

  await Promise.all([wsLoop(), snapshotLoop(), purgeLoop()]);
  await ingestChain;
  console.log('[pf-worker] arrete · dernier point', lastWroteAt ? new Date(lastWroteAt).toISOString() : 'aucun');
  process.exit(0);
}

main().catch((e) => {
  console.error('[pf-worker] erreur fatale', e);
  process.exit(1);
});
