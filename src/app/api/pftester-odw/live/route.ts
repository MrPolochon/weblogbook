import { NextResponse } from 'next/server';
import { persistPfTracks } from '@/lib/pf-odw-persist';
import {
  PF_TRAFFIC_HEADERS,
  PF_TRAFFIC_URL,
  configuredServerId,
  decodeMultiPlanes,
  filterByServer,
  looksLikeProtobuf,
} from '@/lib/pftester-odw';

export const dynamic = 'force-dynamic';
export const fetchCache = 'force-no-store';

const NO_STORE = {
  'Cache-Control': 'no-store, no-cache, must-revalidate, max-age=0',
  'CDN-Cache-Control': 'no-store',
  'Vercel-CDN-Cache-Control': 'no-store',
};

const RETRY_STATUS = new Set([408, 425, 429, 500, 502, 503, 504]);

export async function GET() {
  let lastStatus = 0;
  let lastBodyHint = '';
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 8_000);
      let upstream: Response;
      try {
        upstream = await fetch(PF_TRAFFIC_URL, {
          headers: PF_TRAFFIC_HEADERS,
          cache: 'no-store',
          signal: controller.signal,
        });
      } finally {
        clearTimeout(timer);
      }
      lastStatus = upstream.status;
      if (upstream.ok) {
        const body = await upstream.arrayBuffer();
        const bytes = new Uint8Array(body);
        // Un 200 ne garantit rien : l'amont peut répondre une page anti-bot ou une
        // erreur JSON. Relayer ces octets ferait décoder « 0 avion » sans erreur.
        if (looksLikeProtobuf(bytes)) {
          const serverId = configuredServerId();
          const all = decodeMultiPlanes(bytes);
          const mine = filterByServer(all, serverId);
          persistPfTracks(mine);
          console.log('[pftester-odw/live]', {
            serverId,
            bytes: bytes.byteLength,
            decoded: all.length,
            onServer: mine.length,
            callsigns: mine.map((p) => `${p.callsign}/${p.robloxUsername}`),
          });
          return NextResponse.json(
            {
              serverId,
              count: mine.length,
              decoded: all.length,
              fetchedAt: Date.now(),
              aircraft: mine.map((p) => ({
                id: p.id,
                serverId: p.serverId,
                callsign: p.callsign,
                robloxUsername: p.robloxUsername,
                heading: Math.round(p.heading),
                altitude: Math.round(p.altitude),
                speed: Math.round(p.speed),
                model: p.model,
                livery: p.livery,
                x: p.x,
                y: p.y,
                mapX: p.mapX,
                mapY: p.mapY,
              })),
            },
            { headers: NO_STORE },
          );
        }
        lastBodyHint = new TextDecoder().decode(bytes.subarray(0, 180)).replace(/\s+/g, ' ').trim();
        console.error('[pftester-odw/live] reponse amont non-protobuf', {
          status: upstream.status,
          bytes: bytes.byteLength,
          contentType: upstream.headers.get('content-type'),
          cfRay: upstream.headers.get('cf-ray'),
          server: upstream.headers.get('server'),
          hint: lastBodyHint,
        });
      } else {
        console.error('[pftester-odw/live] amont en erreur', {
          status: upstream.status,
          server: upstream.headers.get('server'),
          cfRay: upstream.headers.get('cf-ray'),
        });
        if (!RETRY_STATUS.has(upstream.status)) break;
      }
    } catch (e) {
      lastStatus = 0;
      lastBodyHint = e instanceof Error ? e.message : 'fetch echoue';
      console.error('[pftester-odw/live] fetch amont impossible', lastBodyHint);
    }
    await new Promise((resolve) => setTimeout(resolve, 150 * (attempt + 1)));
  }

  return NextResponse.json(
    {
      error: `Flux trafic indisponible (${lastStatus})`,
      detail: lastBodyHint || null,
    },
    { status: 502, headers: NO_STORE },
  );
}
