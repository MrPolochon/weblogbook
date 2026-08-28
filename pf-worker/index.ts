/**
 * PFtesterODW — enregistreur 24/7.
 *
 * Un seul WebSocket Mixou, gardé ouvert. Les frames vides sont des
 * heartbeats, pas des échecs. Le protobuf n'arrive pas forcément à
 * l'ouverture : on attend. Le snapshot HTTP (10 s) reste la source
 * fiable dès que le WS ne livre pas d'avions.
 */
import { createClient } from '@supabase/supabase-js';
import WebSocket from 'ws';
import { writeIngest, type PfTrailCursor } from '../src/lib/pf-odw-ingest';
import { upsertPfOdwHealth } from '../src/lib/pf-odw-health';
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

const SNAPSHOT_MS = 10_000;
const HEALTH_MS = 10_000;
const PURGE_EVERY_MS = 60_000;
const WS_BACKOFF_MIN_MS = 1_000;
const WS_BACKOFF_MAX_MS = 30_000;
const HTTP_IF_WS_STALE_MS = 4_000;
const SILENCE_LOG_MS = 60_000;
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
let lastWroteCount = 0;
let lastAircraft = 0;
let lastTickMs = 0;
let lastSource = 'boot';
let windowHits = 0;
let windowMiss = 0;
let windowStarted = Date.now();
let wsFailTotal = 0;
let lastSilenceLog = 0;
let activeWs: WebSocket | null = null;
let interruptSleep: (() => void) | null = null;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => {
    const timer = setTimeout(() => {
      if (interruptSleep === wake) interruptSleep = null;
      resolve();
    }, ms);
    const wake = () => {
      clearTimeout(timer);
      if (interruptSleep === wake) interruptSleep = null;
      resolve();
    };
    interruptSleep = wake;
  });
}

function openMixouWs(): WebSocket {
  return new WebSocket(pfTrafficServerWsUrl(serverId), {
    headers: PF_TRAFFIC_HEADERS,
    perMessageDeflate: false,
  });
}

function messageBytes(data: WebSocket.RawData): Uint8Array {
  if (data instanceof ArrayBuffer) return new Uint8Array(data);
  if (ArrayBuffer.isView(data)) {
    return new Uint8Array(data.buffer, data.byteOffset, data.byteLength);
  }
  if (Buffer.isBuffer(data)) return new Uint8Array(data);
  return new Uint8Array();
}

function planesFromBytes(bytes: Uint8Array): PfLiveAircraft[] | null {
  if (bytes.byteLength < 8) return null;
  const all = decodeMultiPlanes(bytes);
  if (!all.length && !looksLikeProtobuf(bytes)) return null;
  return filterByServer(all, serverId);
}

function enqueueIngest(planes: PfLiveAircraft[], source: string): void {
  lastAircraft = planes.length;
  lastSource = source;
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
        lastWroteCount = wrote;
        lastAircraft = job.planes.length;
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

async function fetchHttpSnapshot(): Promise<PfLiveAircraft[]> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 8_000);
  let res: Response;
  try {
    res = await fetch(PF_TRAFFIC_URL, {
      headers: PF_TRAFFIC_HEADERS,
      cache: 'no-store',
      signal: controller.signal,
    });
  } finally {
    clearTimeout(timer);
  }
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

async function writeHealth(): Promise<void> {
  try {
    await upsertPfOdwHealth(db, {
      last_source: lastSource,
      last_tick_ms: lastTickMs,
      last_aircraft: lastAircraft,
      last_points: lastWroteCount,
      last_ws_at: lastWsAt ? new Date(lastWsAt).toISOString() : null,
      last_write_at: lastWroteAt ? new Date(lastWroteAt).toISOString() : null,
      ws_ok_30s: windowHits,
      ws_miss_30s: windowMiss,
      ws_fail_total: wsFailTotal,
    });
  } catch (e) {
    console.error('[pf-worker] health', e instanceof Error ? e.message : e);
  }
  if (Date.now() - windowStarted >= 30_000) {
    windowHits = 0;
    windowMiss = 0;
    windowStarted = Date.now();
  }
}

function handleWsPayload(bytes: Uint8Array): void {
  if (bytes.byteLength < 8) return;
  const planes = planesFromBytes(bytes);
  if (!planes) return;
  if (planes.length) {
    windowHits += 1;
    lastWsAt = Date.now();
    enqueueIngest(planes, 'ws');
    return;
  }
  windowMiss += 1;
  lastAircraft = 0;
  lastSource = 'ws';
}

function holdMixouWs(): Promise<void> {
  return new Promise((resolve) => {
    const ws = openMixouWs();
    activeWs = ws;
    ws.binaryType = 'arraybuffer';

    let settled = false;
    let sawMessage = false;
    let countedFail = false;
    let pingTimer: ReturnType<typeof setInterval> | null = null;
    const noteFail = (why: string) => {
      if (countedFail) return;
      countedFail = true;
      wsFailTotal += 1;
      console.error('[pf-worker] websocket', why);
    };
    const finish = () => {
      if (settled) return;
      settled = true;
      if (pingTimer) clearInterval(pingTimer);
      if (activeWs === ws) activeWs = null;
      try {
        if (ws.readyState === WebSocket.OPEN || ws.readyState === WebSocket.CONNECTING) {
          ws.close(1000, 'shutdown');
        }
      } catch {
        /* ignore */
      }
      resolve();
    };

    ws.on('open', () => {
      console.log('[pf-worker] websocket ouvert');
      pingTimer = setInterval(() => {
        if (ws.readyState === WebSocket.OPEN) {
          try {
            ws.ping();
          } catch {
            /* ignore */
          }
        }
      }, 25_000);
    });

    ws.on('message', (data) => {
      sawMessage = true;
      try {
        handleWsPayload(messageBytes(data));
      } catch (e) {
        console.error('[pf-worker] frame', e instanceof Error ? e.message : e);
      }
      if (!lastWsAt && Date.now() - lastSilenceLog >= SILENCE_LOG_MS) {
        lastSilenceLog = Date.now();
        console.log('[pf-worker] websocket connecte, heartbeat seulement');
      }
    });

    ws.on('unexpected-response', (_req, res) => {
      noteFail(`http ${res.statusCode}`);
      res.resume();
      finish();
    });

    ws.on('error', (err) => {
      noteFail(err instanceof Error ? err.message : String(err));
    });

    ws.on('close', (code, reason) => {
      if (!sawMessage && running) noteFail(`fermeture ${code} sans frame`);
      const why = reason?.toString?.() || '';
      if (running) console.log(`[pf-worker] websocket ferme (${code}${why ? ` ${why}` : ''})`);
      finish();
    });

    if (!running) finish();
  });
}

async function wsLoop(): Promise<void> {
  let backoff = WS_BACKOFF_MIN_MS;
  while (running) {
    const opened = Date.now();
    try {
      await holdMixouWs();
      if (lastWsAt >= opened) backoff = WS_BACKOFF_MIN_MS;
      else backoff = Math.min(backoff * 2, WS_BACKOFF_MAX_MS);
    } catch (e) {
      wsFailTotal += 1;
      console.error('[pf-worker] websocket', e instanceof Error ? e.message : e);
      backoff = Math.min(backoff * 2, WS_BACKOFF_MAX_MS);
    }
    if (!running) break;
    await sleep(backoff);
  }
}

async function snapshotLoop(): Promise<void> {
  while (running) {
    const started = Date.now();
    if (Date.now() - lastWsAt >= HTTP_IF_WS_STALE_MS) {
      try {
        const planes = await fetchHttpSnapshot();
        lastTickMs = Date.now() - started;
        lastAircraft = planes.length;
        lastSource = 'http';
        if (planes.length) enqueueIngest(planes, 'http');
        await writeHealth();
      } catch (e) {
        lastTickMs = Date.now() - started;
        console.error('[pf-worker] snapshot', e instanceof Error ? e.message : e);
      }
    }
    await sleep(SNAPSHOT_MS);
  }
}

async function healthLoop(): Promise<void> {
  await writeHealth();
  while (running) {
    await sleep(HEALTH_MS);
    if (running) await writeHealth();
  }
}

async function purgeLoop(): Promise<void> {
  while (running) {
    await sleep(PURGE_EVERY_MS);
    if (running) await purge().catch((e) => {
      console.error('[pf-worker] purge', e instanceof Error ? e.message : e);
    });
  }
}

async function main(): Promise<void> {
  console.log(`[pf-worker] demarrage · serveur ${serverId} · ws durable · http ${SNAPSHOT_MS} ms`);
  await primeFromDatabase();
  wsFailTotal = 0;
  lastSource = 'boot';
  await writeHealth();

  const stop = (signal: string) => {
    if (!running) return;
    console.log(`[pf-worker] arret sur ${signal}`);
    running = false;
    interruptSleep?.();
    try {
      activeWs?.close(1000, 'shutdown');
    } catch {
      /* ignore */
    }
    setTimeout(() => process.exit(0), 3_000).unref();
  };
  process.on('SIGTERM', () => stop('SIGTERM'));
  process.on('SIGINT', () => stop('SIGINT'));
  process.on('uncaughtException', (e) => {
    console.error('[pf-worker] uncaught', e);
  });
  process.on('unhandledRejection', (e) => {
    console.error('[pf-worker] rejection', e);
  });

  await Promise.all([wsLoop(), snapshotLoop(), healthLoop(), purgeLoop()]);
  await flushIngest();
  await writeHealth();
  console.log('[pf-worker] arrete · dernier point', lastWroteAt ? new Date(lastWroteAt).toISOString() : 'aucun');
  process.exit(0);
}

main().catch((e) => {
  console.error('[pf-worker] erreur fatale', e);
  process.exit(1);
});
