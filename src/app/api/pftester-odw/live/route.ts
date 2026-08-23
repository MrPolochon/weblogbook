import { NextResponse } from 'next/server';
import { requirePfTesterAdmin } from '@/lib/pftester-odw-auth';
import { PF_TRAFFIC_HEADERS, PF_TRAFFIC_URL } from '@/lib/pftester-odw';

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
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const upstream = await fetch(PF_TRAFFIC_URL, {
        headers: PF_TRAFFIC_HEADERS,
        cache: 'no-store',
      });
      lastStatus = upstream.status;
      if (upstream.ok) {
        const body = await upstream.arrayBuffer();
        if (body.byteLength >= 8) {
          return new NextResponse(body, {
            headers: {
              ...NO_STORE,
              'Content-Type': 'application/octet-stream',
              'X-Pf-Fetched-At': String(Date.now()),
            },
          });
        }
      }
      if (!RETRY_STATUS.has(upstream.status)) break;
    } catch {
      lastStatus = 0;
    }
    await new Promise((resolve) => setTimeout(resolve, 150 * (attempt + 1)));
  }

  return new NextResponse(`Flux trafic indisponible (${lastStatus})`, {
    status: 502,
    headers: NO_STORE,
  });
}
