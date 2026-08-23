import { NextResponse } from 'next/server';
import { PF_TRAFFIC_HEADERS, PF_TRAFFIC_URL } from '@/lib/pftester-odw';

export const revalidate = 2;

export async function GET() {
  try {
    const upstream = await fetch(PF_TRAFFIC_URL, {
      headers: PF_TRAFFIC_HEADERS,
      next: { revalidate: 2 },
    });
    if (!upstream.ok) {
      return new NextResponse('Flux trafic indisponible', {
        status: 502,
        headers: { 'Cache-Control': 'no-store' },
      });
    }
    const body = await upstream.arrayBuffer();
    if (body.byteLength < 8) {
      return new NextResponse('Flux trafic vide', {
        status: 502,
        headers: { 'Cache-Control': 'no-store' },
      });
    }
    return new NextResponse(body, {
      headers: {
        'Content-Type': 'application/octet-stream',
        'Cache-Control': 'public, s-maxage=2, stale-while-revalidate=15',
      },
    });
  } catch {
    return new NextResponse('Flux trafic indisponible', { status: 502 });
  }
}
