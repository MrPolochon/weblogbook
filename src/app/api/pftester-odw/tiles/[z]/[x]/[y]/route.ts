import { NextRequest, NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

const PF_TILE_ORIGIN = 'https://cdn.project-flight.com/tiles';
const PF_TILE_REFERER = 'https://tracker.project-flight.com/';

function parseIndex(raw: string): number | null {
  if (!/^\d{1,2}$/.test(raw)) return null;
  return Number(raw);
}

export async function GET(
  _request: NextRequest,
  { params }: { params: { z: string; x: string; y: string } },
) {
  const z = parseIndex(params.z);
  const x = parseIndex(params.x);
  const y = parseIndex(params.y);
  if (z === null || x === null || y === null || z < 1 || z > 8) {
    return new NextResponse('Tuile invalide', { status: 400 });
  }
  const n = 2 ** z;
  if (x >= n || y >= n) {
    return new NextResponse('Tuile hors grille', { status: 400 });
  }

  try {
    const upstream = await fetch(`${PF_TILE_ORIGIN}/${z}/${x}/${y}.webp?v=1`, {
      headers: {
        Accept: 'image/webp,image/png,image/*;q=0.8',
        Referer: PF_TILE_REFERER,
        'User-Agent': 'Mozilla/5.0',
      },
      cache: 'force-cache',
    });
    if (!upstream.ok) {
      return new NextResponse('Tuile introuvable', { status: 404 });
    }
    const body = await upstream.arrayBuffer();
    return new NextResponse(body, {
      headers: {
        'Content-Type': upstream.headers.get('Content-Type') || 'image/webp',
        'Cache-Control': 'public, max-age=86400, stale-while-revalidate=604800',
      },
    });
  } catch {
    return new NextResponse('Tuile indisponible', { status: 502 });
  }
}
