import { NextResponse } from 'next/server';
import { requirePfTesterAdmin } from '@/lib/pftester-odw-auth';
import { PF_TRAFFIC_HEADERS, PF_TRAFFIC_URL, looksLikeProtobuf } from '@/lib/pftester-odw';

export const dynamic = 'force-dynamic';
export const fetchCache = 'force-no-store';

const NO_STORE = {
  'Cache-Control': 'no-store, no-cache, must-revalidate, max-age=0',
  'CDN-Cache-Control': 'no-store',
  'Vercel-CDN-Cache-Control': 'no-store',
};

const RETRY_STATUS = new Set([408, 425, 429, 500, 502, 503, 504]);

export async function GET() {
  const auth = await requirePfTesterAdmin();
  if (!auth.ok) return auth.response;

  let lastStatus = 0;
  let lastBodyHint = '';
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const upstream = await fetch(PF_TRAFFIC_URL, {
        headers: PF_TRAFFIC_HEADERS,
        cache: 'no-store',
      });
      lastStatus = upstream.status;
      if (upstream.ok) {
        const body = await upstream.arrayBuffer();
        const bytes = new Uint8Array(body);
        // Un 200 ne garantit rien : l'amont peut répondre une page anti-bot ou une
        // erreur JSON. Relayer ces octets ferait décoder « 0 avion » sans erreur.
        if (looksLikeProtobuf(bytes)) {
          return new NextResponse(body, {
            headers: {
              ...NO_STORE,
              'Content-Type': 'application/octet-stream',
              'X-Pf-Fetched-At': String(Date.now()),
            },
          });
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
