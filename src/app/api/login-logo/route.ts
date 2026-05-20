import { createAdminClient } from '@/lib/supabase/admin';
import { NextResponse } from 'next/server';

/** Images publiques locales utilisées en fallback si aucune image Supabase. */
const FALLBACK_IMAGES = ['/mixou-bg.png', '/ptfs-logo.jpg', '/ptfs-map.png'];

function pickRandom<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

/**
 * GET /api/login-logo
 * Retourne une URL d'image aléatoire parmi les photos d'avions de compagnie
 * enregistrées dans Supabase (compagnie_avions.avion_image_url).
 * Pas d'authentification requise — route publique utilisée sur la page de login.
 */
export async function GET() {
  try {
    const admin = createAdminClient();

    const { data, error } = await admin
      .from('compagnie_avions')
      .select('avion_image_url')
      .not('avion_image_url', 'is', null)
      .limit(100);

    if (error) throw error;

    const urls = (data ?? [])
      .map((r) => r.avion_image_url as string)
      .filter((u) => typeof u === 'string' && u.startsWith('http'));

    if (urls.length === 0) {
      return NextResponse.json({ url: pickRandom(FALLBACK_IMAGES), source: 'fallback' });
    }

    return NextResponse.json({ url: pickRandom(urls), source: 'supabase', total: urls.length });
  } catch {
    return NextResponse.json({ url: pickRandom(FALLBACK_IMAGES), source: 'error' });
  }
}
