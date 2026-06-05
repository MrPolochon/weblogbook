import { NextResponse } from 'next/server';
import { ARME_MISSIONS } from '@/lib/armee-missions';

// Données 100% statiques compilées à la build — cache 1 heure côté CDN/navigateur.
export const dynamic = 'force-static';

export async function GET() {
  return NextResponse.json(ARME_MISSIONS, {
    headers: { 'Cache-Control': 'public, max-age=3600, stale-while-revalidate=86400' },
  });
}
