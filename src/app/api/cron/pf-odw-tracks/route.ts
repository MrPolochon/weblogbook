import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { loadCursors, pfPlaneKey, writeIngest } from '@/lib/pf-odw-ingest';
import {
  PF_TRAFFIC_HEADERS,
  PF_TRAFFIC_URL,
  configuredServerId,
  decodeMultiPlanes,
  filterByServer,
  looksLikeProtobuf,
} from '@/lib/pftester-odw';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

function cronOk(request: NextRequest): boolean {
  const secret =
    request.headers.get('x-cron-secret') ||
    request.headers.get('authorization')?.replace(/^Bearer\s+/i, '');
  return Boolean(secret && secret === process.env.CRON_SECRET);
}

/**
 * Filet de sécurité si le worker Railway est à l'arrêt : une passe par minute.
 * La source principale reste le worker à 1 Hz.
 */
export async function GET(request: NextRequest) {
  if (!cronOk(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const upstream = await fetch(PF_TRAFFIC_URL, {
      headers: PF_TRAFFIC_HEADERS,
      cache: 'no-store',
    });
    if (!upstream.ok) {
      return NextResponse.json({ error: `amont ${upstream.status}` }, { status: 502 });
    }
    const bytes = new Uint8Array(await upstream.arrayBuffer());
    if (!looksLikeProtobuf(bytes)) {
      return NextResponse.json({ error: 'amont non-protobuf' }, { status: 502 });
    }
    const serverId = configuredServerId();
    const planes = filterByServer(decodeMultiPlanes(bytes), serverId);
    const db = createAdminClient();
    const cursors = await loadCursors(db, planes.map(pfPlaneKey));
    const wrote = await writeIngest(db, planes, cursors);
    return NextResponse.json({ ok: true, serverId, aircraft: planes.length, wrote });
  } catch (err) {
    console.error('[cron/pf-odw-tracks]', err);
    return NextResponse.json({ error: 'ingest impossible' }, { status: 500 });
  }
}
