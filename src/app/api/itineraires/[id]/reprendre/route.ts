export const dynamic = 'force-dynamic';
import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { FlightSubmissionError } from '@/lib/plans-vol/submission';
import { itineraryUuid } from '@/lib/company-itineraries/input';
import { itineraryDetail } from '@/lib/company-itineraries/server';
import { POST as submitFlightPlan } from '@/app/api/plans-vol/route';

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    if (!itineraryUuid.test(id)) return NextResponse.json({ error: 'Itinéraire invalide.' }, { status: 400 });
    const { data: { user } } = await (await createClient()).auth.getUser();
    if (!user) return NextResponse.json({ error: 'Non authentifié.' }, { status: 401 });
    const detail = await itineraryDetail(user.id, id);
    if (detail.itinerary.pilot_id !== user.id) throw new FlightSubmissionError('Seul le pilote affecté peut reprendre cet itinéraire.', 403);
    const input = await request.json();
    if (!input || typeof input !== 'object' || Array.isArray(input) || JSON.stringify(input).length > 20_000 || !itineraryUuid.test(String(input.leg_id || ''))) throw new FlightSubmissionError('Tronçon invalide.');
    const leg = detail.legs.find(leg => leg.id === input.leg_id);
    if (!leg) throw new FlightSubmissionError('Tronçon introuvable.', 404);
    if (leg.plan_id) return NextResponse.json({ ok: true, id: leg.plan_id, itinerary_id: id, replayed: true });
    if (!['planned', 'paused'].includes(detail.itinerary.status) || leg.id !== detail.next_leg?.id) throw new FlightSubmissionError(detail.itinerary.status === 'diverted' ? 'Après une déroute, annulez les tronçons restants et replanifiez depuis l’arrivée réelle.' : 'Clôturez le tronçon en cours avant de reprendre.', 409);
    const body = { ...leg.preparation, ...input, itinerary_id: id, itinerary_leg_id: leg.id,
      compagnie_id: detail.itinerary.company_id, compagnie_avion_id: detail.itinerary.aircraft_id,
      numero_vol: detail.itinerary.flight_number, aeroport_depart: leg.origin, aeroport_arrivee: leg.destination,
      nature_transport: detail.itinerary.nature_transport, vol_commercial: true, vol_ferry: false,
      inventaire_avion_id: null, armee_avion_id: null, mission_id: null,
    };
    // The normal handler retains sanctions, events, ATC, demand, crew and quotes.
    return submitFlightPlan(new Request(request.url, { method: 'POST', headers: request.headers, body: JSON.stringify(body) }));
  } catch (error) {
    return NextResponse.json({ error: error instanceof FlightSubmissionError ? error.message : 'Reprise indisponible.' }, { status: error instanceof FlightSubmissionError ? error.status : error instanceof SyntaxError ? 400 : 503 });
  }
}
