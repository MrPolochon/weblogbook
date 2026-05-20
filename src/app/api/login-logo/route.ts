import { createAdminClient } from '@/lib/supabase/admin';
import { NextResponse } from 'next/server';

// Désactive le cache statique Next.js App Router — chaque appel doit être dynamique
export const dynamic = 'force-dynamic';

/** Images publiques locales utilisées en fallback si aucune image Supabase. */
const FALLBACK_IMAGES = ['/mixou-bg.png', '/ptfs-logo.jpg', '/ptfs-map.png'];

function pickRandom<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

function extractUrls(data: Record<string, unknown>[] | null, key: string): string[] {
  return (data ?? [])
    .map((r) => r[key] as string | null)
    .filter((u): u is string => typeof u === 'string' && u.startsWith('http'));
}

/**
 * GET /api/login-logo
 * Agrège TOUTES les images stockées dans Supabase :
 *   • compagnie_avions.avion_image_url  — photos d'avions
 *   • compagnies.logo_url               — logos de compagnies
 *   • alliances.logo_url                — logos d'alliances
 *   • cartes_identite.photo_url         — photos de profil
 *
 * Route publique (sans auth) — utilisée sur la page de login uniquement.
 */
export async function GET() {
  try {
    const admin = createAdminClient();

    const [avions, compagnies, alliances, cartes] = await Promise.all([
      admin
        .from('compagnie_avions')
        .select('avion_image_url')
        .not('avion_image_url', 'is', null)
        .limit(200),
      admin
        .from('compagnies')
        .select('logo_url')
        .not('logo_url', 'is', null)
        .limit(200),
      admin
        .from('alliances')
        .select('logo_url')
        .not('logo_url', 'is', null)
        .limit(100),
      admin
        .from('cartes_identite')
        .select('photo_url')
        .not('photo_url', 'is', null)
        .limit(200),
    ]);

    const pool = [
      ...extractUrls(avions.data as Record<string, unknown>[] | null, 'avion_image_url'),
      ...extractUrls(compagnies.data as Record<string, unknown>[] | null, 'logo_url'),
      ...extractUrls(alliances.data as Record<string, unknown>[] | null, 'logo_url'),
      ...extractUrls(cartes.data as Record<string, unknown>[] | null, 'photo_url'),
    ];

    const noCache = { 'Cache-Control': 'no-store, no-cache, must-revalidate' };

    if (pool.length === 0) {
      return NextResponse.json({ url: pickRandom(FALLBACK_IMAGES), source: 'fallback' }, { headers: noCache });
    }

    return NextResponse.json(
      { url: pickRandom(pool), source: 'supabase', total: pool.length },
      { headers: noCache },
    );
  } catch {
    const noCache = { 'Cache-Control': 'no-store, no-cache, must-revalidate' };
    return NextResponse.json({ url: pickRandom(FALLBACK_IMAGES), source: 'error' }, { headers: noCache });
  }
}
