import { NextResponse } from 'next/server';

/** Tuiles immuables (CDN PF `?v=1`) : cache navigateur + CDN, pas de force-dynamic. */
export const revalidate = 86400;
export const fetchCache = 'force-cache';

const PF_TILE_ORIGIN = 'https://cdn.project-flight.com/tiles';
const PF_TILE_REFERER = 'https://tracker.project-flight.com/';
const TILE_CACHE =
  'public, max-age=86400, s-maxage=2592000, stale-while-revalidate=2592000, immutable';

function parseIndex(raw: string, maxDigits: number): number | null {
  if (!new RegExp(`^\\d{1,${maxDigits}}$`).test(raw)) return null;
  return Number(raw);
}

export async function GET(
  _request: Request,
  { params }: { params: { z: string; x: string; y: string } },
) {
  const z = parseIndex(params.z, 1);
  const x = parseIndex(params.x, 3);
  const y = parseIndex(params.y, 3);
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
      next: { revalidate: 86400 },
    });
    if (!upstream.ok) {
      return new NextResponse('Tuile introuvable', { status: 404 });
    }
    const body = await upstream.arrayBuffer();
    return new NextResponse(body, {
      headers: {
        'Content-Type': upstream.headers.get('Content-Type') || 'image/webp',
        'Cache-Control': TILE_CACHE,
        'CDN-Cache-Control': TILE_CACHE,
        'Vercel-CDN-Cache-Control': TILE_CACHE,
      },
    });
  } catch {
    return new NextResponse('Tuile indisponible', { status: 502 });
  }
}
