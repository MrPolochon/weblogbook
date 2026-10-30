export const dynamic = 'force-dynamic';
import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { FlightSubmissionError, submissionError } from '@/lib/plans-vol/submission';
import { itineraryUuid } from '@/lib/company-itineraries/input';
import { rateLimitShared } from '@/lib/rate-limit-shared';
export async function POST(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    if (!itineraryUuid.test(id)) return NextResponse.json({ error: 'Itinéraire invalide.' }, { status: 400 });
    const { data: { user } } = await (await createClient()).auth.getUser();
    if (!user) return NextResponse.json({ error: 'Non authentifié.' }, { status: 401 });
    if (!(await rateLimitShared(`company-itinerary-cancel:${user.id}`, 12, 60_000)).allowed) return NextResponse.json({ error: 'Veuillez patienter.' }, { status: 429 });
    const { data, error } = await createAdminClient().rpc('cancel_company_itinerary', { p_actor: user.id, p_itinerary: id });
    if (error || !data) throw submissionError(error);
    return NextResponse.json(data);
  } catch (error) {
    return NextResponse.json({ error: error instanceof FlightSubmissionError ? error.message : 'Annulation indisponible.' }, { status: error instanceof FlightSubmissionError ? error.status : 503 });
  }
}
