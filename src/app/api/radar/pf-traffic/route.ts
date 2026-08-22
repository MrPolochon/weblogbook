import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { ATC_POSITIONS } from '@/lib/atc-positions';
import { getPfAirport } from '@/lib/pf-airports';
import { aircraftInScope, scopeForPosition } from '@/lib/pf-radar';
import { requireRadarUnlock } from '@/lib/radar-access';
import {
  configuredServerId,
  fetchLiveTraffic,
  filterByServer,
  normalizeServerId,
} from '@/lib/pftester-odw';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  const auth = await requireRadarUnlock();
  if (!auth.ok) return auth.response;

  const supabase = await createClient();
  const { data: session } = await supabase
    .from('atc_sessions')
    .select('aeroport, position')
    .eq('user_id', auth.userId)
    .maybeSingle();

  const requestedAirport = (request.nextUrl.searchParams.get('airport') || '').toUpperCase();
  const requestedPosition = request.nextUrl.searchParams.get('position') || '';
  const serverId = request.nextUrl.searchParams.get('serverId')
    ? normalizeServerId(request.nextUrl.searchParams.get('serverId'))
    : configuredServerId();

  const sessionAirport = getPfAirport(session?.aeroport);
  const airport = getPfAirport(requestedAirport) ?? sessionAirport ?? getPfAirport('MDPC')!;
  const position = (ATC_POSITIONS as readonly string[]).includes(requestedPosition)
    ? requestedPosition
    : session?.position ?? 'Tower';
  const scope = scopeForPosition(position);

  try {
    const all = await fetchLiveTraffic();
    const live = filterByServer(all, serverId);
    const aircraft = live
      .filter((p) =>
        aircraftInScope({
          mapX: p.mapX,
          mapY: p.mapY,
          altitude: p.altitude,
          speed: p.speed,
          airportX: airport.mapX,
          airportY: airport.mapY,
          scope,
        }),
      )
      .map((p) => ({
        id: p.id,
        serverId: p.serverId,
        callsign: p.callsign,
        robloxUsername: p.robloxUsername,
        heading: Math.round(p.heading),
        altitude: Math.round(p.altitude),
        speed: Math.round(p.speed),
        model: p.model,
        livery: p.livery,
        mapX: p.mapX,
        mapY: p.mapY,
        onGround: p.altitude <= 80 || (p.altitude < 1500 && p.speed < 45),
      }));

    return NextResponse.json({
      serverId,
      airport: { code: airport.code, name: airport.name, mapX: airport.mapX, mapY: airport.mapY },
      position,
      scope,
      session: session
        ? { aeroport: session.aeroport, position: session.position, isPfAirport: Boolean(sessionAirport) }
        : null,
      count: aircraft.length,
      updatedAt: new Date().toISOString(),
      aircraft,
    });
  } catch (err) {
    console.error('[radar/pf-traffic]', err);
    return NextResponse.json({ error: 'Impossible de récupérer le trafic Project Flight.' }, { status: 502 });
  }
}
