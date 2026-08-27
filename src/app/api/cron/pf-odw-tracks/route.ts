import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { loadCursors, pfPlaneKey, writeIngest } from '@/lib/pf-odw-ingest';
import { upsertPfOdwHealth } from '@/lib/pf-odw-health';
import {
  PF_TRAFFIC_HEADERS,
  PF_TRAFFIC_URL,
  configuredServerId,
  decodeMultiPlanes,
  filterByServer,
  looksLikeProtobuf,
} from '@/lib/pftester-odw';

export const dynamic = 'force-dynamic';
/** Filet seulement : rester loin du plafond Vercel 60 s. */
export const maxDuration = 20;

function cronOk(request: NextRequest): boolean {
  const secret =
    request.headers.get('x-cron-secret') ||
    request.headers.get('authorization')?.replace(/^Bearer\s+/i, '');
  return Boolean(secret && secret === process.env.CRON_SECRET);
}

const WORKER_FRESH_MS = 90_000;
const UPSTREAM_TIMEOUT_MS = 10_000;
const BUDGET_MS = 18_000;

function remaining(started: number): number {
  return BUDGET_MS - (Date.now() - started);
}

/**
 * Filet de sécurité si le worker Railway est à l'arrêt : une passe par minute.
 * La source principale reste le worker à 1 Hz.
 */
export async function GET(request: NextRequest) {
  if (!cronOk(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const started = Date.now();
  const db = createAdminClient();
  const log = (payload: Record<string, unknown>) => {
    console.log(JSON.stringify({ evt: 'pf-odw-cron', ms: Date.now() - started, ...payload }));
  };

  try {
    const { data: latest } = await db
      .from('pf_odw_flights')
      .select('last_seen_at')
      .order('last_seen_at', { ascending: false })
      .limit(1)
      .maybeSingle();
    const lastSeen = latest?.last_seen_at ? new Date(latest.last_seen_at).getTime() : 0;
    if (lastSeen && Date.now() - lastSeen < WORKER_FRESH_MS) {
      const ms = Date.now() - started;
      await upsertPfOdwHealth(db, {
        cron_last_at: new Date().toISOString(),
        cron_last_ms: ms,
        cron_last_status: 'worker-alive',
      });
      log({ skipped: 'worker-alive', lastSeenAt: latest?.last_seen_at });
      return NextResponse.json({ ok: true, skipped: 'worker-alive', ms, lastSeenAt: latest?.last_seen_at });
    }

    if (remaining(started) < UPSTREAM_TIMEOUT_MS + 1_500) {
      const ms = Date.now() - started;
      await upsertPfOdwHealth(db, {
        cron_last_at: new Date().toISOString(),
        cron_last_ms: ms,
        cron_last_status: 'budget',
      });
      log({ skipped: 'budget' });
      return NextResponse.json({ ok: true, skipped: 'budget', ms });
    }

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), Math.min(UPSTREAM_TIMEOUT_MS, remaining(started) - 1_000));
    let upstream: Response;
    try {
      upstream = await fetch(PF_TRAFFIC_URL, {
        headers: PF_TRAFFIC_HEADERS,
        cache: 'no-store',
        signal: controller.signal,
      });
    } catch (err) {
      const aborted = err instanceof Error && err.name === 'AbortError';
      const ms = Date.now() - started;
      const status = aborted ? 'amont-timeout' : 'amont-injoignable';
      await upsertPfOdwHealth(db, {
        cron_last_at: new Date().toISOString(),
        cron_last_ms: ms,
        cron_last_status: status,
      });
      log({ error: status });
      return NextResponse.json({ ok: false, error: status, ms });
    } finally {
      clearTimeout(timer);
    }
    if (!upstream.ok) {
      const ms = Date.now() - started;
      const status = `amont-${upstream.status}`;
      await upsertPfOdwHealth(db, {
        cron_last_at: new Date().toISOString(),
        cron_last_ms: ms,
        cron_last_status: status,
      });
      log({ error: status });
      return NextResponse.json({ ok: false, error: status, ms });
    }
    const bytes = new Uint8Array(await upstream.arrayBuffer());
    if (!looksLikeProtobuf(bytes)) {
      const ms = Date.now() - started;
      await upsertPfOdwHealth(db, {
        cron_last_at: new Date().toISOString(),
        cron_last_ms: ms,
        cron_last_status: 'amont-non-protobuf',
      });
      log({ error: 'amont-non-protobuf' });
      return NextResponse.json({ ok: false, error: 'amont-non-protobuf', ms });
    }
    const serverId = configuredServerId();
    const planes = filterByServer(decodeMultiPlanes(bytes), serverId);

    let wrote = 0;
    if (remaining(started) > 2_500) {
      const cursors = await loadCursors(db, planes.map(pfPlaneKey));
      if (remaining(started) > 1_200) {
        wrote = await writeIngest(db, planes, cursors);
      }
    }

    const ms = Date.now() - started;
    await upsertPfOdwHealth(db, {
      last_source: 'cron',
      last_tick_ms: ms,
      last_aircraft: planes.length,
      last_points: wrote,
      last_write_at: wrote ? new Date().toISOString() : undefined,
      cron_last_at: new Date().toISOString(),
      cron_last_ms: ms,
      cron_last_status: 'ok',
      cron_last_aircraft: planes.length,
      cron_last_points: wrote,
    });
    log({ ok: true, serverId, aircraft: planes.length, wrote });
    return NextResponse.json({ ok: true, serverId, aircraft: planes.length, wrote, ms });
  } catch (err) {
    const ms = Date.now() - started;
    console.error('[cron/pf-odw-tracks]', err);
    await upsertPfOdwHealth(db, {
      cron_last_at: new Date().toISOString(),
      cron_last_ms: ms,
      cron_last_status: 'ingest-error',
    }).catch(() => undefined);
    return NextResponse.json({ ok: false, error: 'ingest impossible', ms });
  }
}
