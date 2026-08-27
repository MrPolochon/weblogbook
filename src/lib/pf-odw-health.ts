import type { SupabaseClient } from '@supabase/supabase-js';

export type PfOdwHealthRow = {
  id: number;
  updated_at: string;
  last_source: string | null;
  last_tick_ms: number;
  last_aircraft: number;
  last_points: number;
  last_ws_at: string | null;
  last_write_at: string | null;
  ws_ok_30s: number;
  ws_miss_30s: number;
  ws_fail_total: number;
  cron_last_at: string | null;
  cron_last_ms: number | null;
  cron_last_status: string | null;
  cron_last_aircraft: number | null;
  cron_last_points: number | null;
};

export type PfOdwHealthPublic = {
  source: string | null;
  tickMs: number;
  aircraft: number;
  points: number;
  wsOk30s: number;
  wsMiss30s: number;
  wsFailTotal: number;
  lastWsAt: string | null;
  lastWriteAt: string | null;
  workerFresh: boolean;
  cronLastAt: string | null;
  cronLastMs: number | null;
  cronLastStatus: string | null;
};

const WORKER_FRESH_MS = 8_000;

export function toPublicHealth(row: PfOdwHealthRow | null): PfOdwHealthPublic | null {
  if (!row) return null;
  const wsAt = row.last_ws_at ? new Date(row.last_ws_at).getTime() : 0;
  const writeAt = row.last_write_at ? new Date(row.last_write_at).getTime() : 0;
  const newest = Math.max(wsAt, writeAt);
  return {
    source: row.last_source,
    tickMs: row.last_tick_ms,
    aircraft: row.last_aircraft,
    points: row.last_points,
    wsOk30s: row.ws_ok_30s,
    wsMiss30s: row.ws_miss_30s,
    wsFailTotal: Number(row.ws_fail_total) || 0,
    lastWsAt: row.last_ws_at,
    lastWriteAt: row.last_write_at,
    workerFresh: newest > 0 && Date.now() - newest < WORKER_FRESH_MS,
    cronLastAt: row.cron_last_at,
    cronLastMs: row.cron_last_ms,
    cronLastStatus: row.cron_last_status,
  };
}

export async function readPfOdwHealth(db: SupabaseClient): Promise<PfOdwHealthRow | null> {
  const { data, error } = await db.from('pf_odw_health').select('*').eq('id', 1).maybeSingle();
  if (error) {
    console.error('[pf-odw-health] lecture', error.message);
    return null;
  }
  return (data as PfOdwHealthRow | null) ?? null;
}

export async function upsertPfOdwHealth(
  db: SupabaseClient,
  patch: Partial<Omit<PfOdwHealthRow, 'id'>>,
): Promise<void> {
  const { error } = await db.from('pf_odw_health').upsert(
    { id: 1, ...patch, updated_at: new Date().toISOString() },
    { onConflict: 'id' },
  );
  if (error) console.error('[pf-odw-health] écriture', error.message);
}
