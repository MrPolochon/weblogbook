import { NextResponse } from 'next/server';
import { requirePfTesterAdmin } from '@/lib/pftester-odw-auth';
import { configuredServerId, fetchLiveTrafficResult, filterByServer } from '@/lib/pftester-odw';

export const dynamic = 'force-dynamic';

export async function GET() {
  const auth = await requirePfTesterAdmin();
  if (!auth.ok) return auth.response;

  const serverId = configuredServerId();

  try {
    const { planes: all, fetchedAt, decoded } = await fetchLiveTrafficResult();
    const aircraft = filterByServer(all, serverId).map((p) => ({
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
    }));

    return NextResponse.json(
      {
        serverId,
        count: aircraft.length,
        decoded,
        fetchedAt,
        updatedAt: new Date().toISOString(),
        aircraft,
      },
      {
        headers: {
          'Cache-Control': 'no-store, no-cache, must-revalidate',
          'CDN-Cache-Control': 'no-store',
          'Vercel-CDN-Cache-Control': 'no-store',
        },
      },
    );
  } catch (err) {
    console.error('[pftester-odw/flights]', err);
    return NextResponse.json(
      { error: 'Impossible de récupérer le trafic du serveur privé.' },
      { status: 502 },
    );
  }
}
