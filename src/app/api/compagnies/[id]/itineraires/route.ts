export const dynamic = 'force-dynamic';
import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { FlightSubmissionError, submissionError } from '@/lib/plans-vol/submission';
import { itineraryInput, itineraryUuid } from '@/lib/company-itineraries/input';
import { companyItineraries } from '@/lib/company-itineraries/server';
import { rateLimitShared } from '@/lib/rate-limit-shared';

const failure = (error: unknown) => error instanceof FlightSubmissionError
  ? NextResponse.json({ error: error.message }, { status: error.status })
  : NextResponse.json({ error: 'Itinéraires indisponibles. Réessayez.' }, { status: error instanceof SyntaxError ? 400 : 503 });
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    if (!itineraryUuid.test(id)) throw new FlightSubmissionError('Compagnie invalide.');
    const { data: { user } } = await (await createClient()).auth.getUser();
    if (!user) return NextResponse.json({ error: 'Non authentifié.' }, { status: 401 });
    return NextResponse.json(await companyItineraries(user.id, id));
  } catch (error) { return failure(error); }
}
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    if (!itineraryUuid.test(id)) throw new FlightSubmissionError('Compagnie invalide.');
    const { data: { user } } = await (await createClient()).auth.getUser();
    if (!user) return NextResponse.json({ error: 'Non authentifié.' }, { status: 401 });
    if (!(await rateLimitShared(`company-itinerary-create:${user.id}`, 12, 60_000)).allowed) return NextResponse.json({ error: 'Veuillez patienter avant un nouvel itinéraire.' }, { status: 429 });
    const input = itineraryInput(await request.json());
    const { data, error } = await createAdminClient().rpc('create_company_itinerary', { p_actor: user.id, p_company: id, p_input: input });
    if (error || !data) throw submissionError(error);
    return NextResponse.json(data);
  } catch (error) { return failure(error); }
}
