import { NextRequest, NextResponse } from 'next/server';
import { deliverDueCalendarAnnounces } from '@/lib/calendrier/announce';

export const dynamic = 'force-dynamic';

function cronOk(request: NextRequest): boolean {
  const secret =
    request.headers.get('x-cron-secret') ||
    request.headers.get('authorization')?.replace(/^Bearer\s+/i, '');
  return Boolean(secret && secret === process.env.CRON_SECRET);
}

export async function GET(request: NextRequest) {
  if (!cronOk(request)) return NextResponse.json({ error: 'Non autorise' }, { status: 401 });
  try {
    const result = await deliverDueCalendarAnnounces();
    return NextResponse.json({ ok: true, ...result });
  } catch (e) {
    console.error('cron calendrier-announce:', e);
    return NextResponse.json({ error: 'Erreur serveur' }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  return GET(request);
}
