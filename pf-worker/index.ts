/**
 * PFtesterODW — enregistreur 24/7.
 *
 * Mixou n'envoie le protobuf qu'à l'ouverture du WebSocket, puis des
 * heartbeats vides. Un socket long n'avance donc plus. On se reconnecte
 * chaque seconde, on prend le snapshot, on écrit dans Supabase. La carte
 * ne fait que lire : aucun onglet n'a besoin d'être ouvert.
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

const TICK_MS = Number(process.env.PF_WORKER_POLL_MS || 1000);
const SNAPSHOT_MS = 10_000;
const PURGE_EVERY_MS = 60_000;
const WS_WAIT_MS = 2_500;
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
let pending: { planes: PfLiveAircraft[]; source: string } | null = null;
let ingestBusy = false;
let lastWsAt = 0;
let lastWroteAt = 0;
let ticks = 0;
let hits = 0;

function openMixouWs(): WebSocket {
  const url = pfTrafficServerWsUrl(serverId);
  const WS = WebSocket as unknown as new (
    u: string,
    opts?: { headers?: Record<string, string> },
  ) => WebSocket;
  try {
    return new WS(url, { headers: PF_TRAFFIC_HEADERS });
  } catch {
    return new WebSocket(url);
  }
}

async function messageBytes(data: unknown): Promise<Uint8Array> {
  if (data instanceof ArrayBuffer) return new Uint8Array(data);
  if (ArrayBuffer.isView(data)) {
    return new Uint8Array(data.buffer, data.byteOffset, data.byteLength);
  }
  if (typeof Buffer !== 'undefined' && Buffer.isBuffer(data)) return new Uint8Array(data);
  if (typeof Blob !== 'undefined' && data instanceof Blob) {
    return new Uint8Array(await data.arrayBuffer());
  }
  return new Uint8Array();
}

function planesFromBytes(bytes: Uint8Array): PfLiveAircraft[] | null {
  if (bytes.byteLength < 8) return null;
  const all = decodeMultiPlanes(bytes);
  if (!all.length && !looksLikeProtobuf(bytes)) return null;
  return filterByServer(all, serverId);
}

function enqueueIngest(planes: PfLiveAircraft[], source: string): void {
  if (!planes.length) return;
  pending = { planes, source };
  void flushIngest();
}

async function flushIngest(): Promise<void> {
  if (ingestBusy) return;
  ingestBusy = true;
  try {
    while (pending && running) {
      const job = pending;
      pending = null;
      try {
        const wrote = await writeIngest(db, job.planes, cursors);
        lastWroteAt = Date.now();
        if (wrote > 0) {
          console.log(`[pf-worker] ${job.source} · ${job.planes.length} avion(s) · ${wrote} point(s)`);
        }
      } catch (e) {
        console.error('[pf-worker] ingest', e instanceof Error ? e.message : e);
      }
    }
  } finally {
    ingestBusy = false;
    if (pending) void flushIngest();
  }
}

function snapshotFromWs(): Promise<PfLiveAircraft[] | null> {
  return new Promise((resolve) => {
    let settled = false;
    const ws = openMixouWs();
    ws.binaryType = 'arraybuffer';
    const done = (planes: PfLiveAircraft[] | null) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      try {
        ws.close();
      } catch {
        /* ignore */
      }
      resolve(planes);
    };
    const timer = setTimeout(() => done(null), WS_WAIT_MS);
    ws.addEventListener('message', (ev) => {
      void messageBytes(ev.data).then((bytes) => {
        if (bytes.byteLength < 8) return;
        const planes = planesFromBytes(bytes);
        if (planes?.length) done(planes);
      });
    });
    ws.addEventListener('error', () => done(null));
    ws.addEventListener('close', () => {
      if (!settled) done(null);
    });
  });
}

async function fetchHttpSnapshot(): Promise<PfLiveAircraft[]> {
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

async function wsLoop(): Promise<void> {
  let misses = 0;
  while (running) {
    const started = Date.now();
    ticks += 1;
    const planes = await snapshotFromWs();
    if (planes?.length) {
      misses = 0;
      hits += 1;
      lastWsAt = Date.now();
      enqueueIngest(planes, 'ws');
    } else {
      misses += 1;
      if (misses === 1 || misses % 15 === 0) {
        console.log(`[pf-worker] websocket sans trafic (${misses})`);
      }
    }
    if (ticks % 30 === 0) {
      console.log(`[pf-worker] 30 s · ${hits} snapshot(s) Mixou · dernier point ${lastWroteAt ? `${Math.round((Date.now() - lastWroteAt) / 1000)} s` : 'aucun'}`);
      hits = 0;
    }
    const wait = Math.max(0, TICK_MS - (Date.now() - started));
    if (wait) await new Promise((r) => setTimeout(r, wait));
  }
}

async function snapshotLoop(): Promise<void> {
  while (running) {
    await new Promise((r) => setTimeout(r, SNAPSHOT_MS));
    if (!running) break;
    if (Date.now() - lastWsAt < 4_000) continue;
    try {
      const planes = await fetchHttpSnapshot();
      if (planes.length) enqueueIngest(planes, 'http');
    } catch (e) {
      console.error('[pf-worker] snapshot', e instanceof Error ? e.message : e);
    }
  }
}

async function purgeLoop(): Promise<void> {
  while (running) {
    await new Promise((r) => setTimeout(r, PURGE_EVERY_MS));
    if (running) await purge().catch(() => undefined);
  }
}

async function main(): Promise<void> {
  console.log(`[pf-worker] demarrage · serveur ${serverId} · tick ${TICK_MS} ms`);
  await primeFromDatabase();

  const stop = (signal: string) => {
    console.log(`[pf-worker] arret sur ${signal}`);
    running = false;
  };
  process.on('SIGTERM', () => stop('SIGTERM'));
  process.on('SIGINT', () => stop('SIGINT'));

  await Promise.all([wsLoop(), snapshotLoop(), purgeLoop()]);
  await flushIngest();
  console.log('[pf-worker] arrete · dernier point', lastWroteAt ? new Date(lastWroteAt).toISOString() : 'aucun');
  process.exit(0);
}

main().catch((e) => {
  console.error('[pf-worker] erreur fatale', e);
  process.exit(1);
});
