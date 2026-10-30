export const dynamic = 'force-dynamic';
import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { FlightSubmissionError } from '@/lib/plans-vol/submission';
import { itineraryUuid } from '@/lib/company-itineraries/input';
import { itineraryDetail } from '@/lib/company-itineraries/server';
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    if (!itineraryUuid.test(id)) return NextResponse.json({ error: 'Itinéraire invalide.' }, { status: 400 });
    const { data: { user } } = await (await createClient()).auth.getUser();
    if (!user) return NextResponse.json({ error: 'Non authentifié.' }, { status: 401 });
    return NextResponse.json(await itineraryDetail(user.id, id));
  } catch (error) {
    return NextResponse.json({ error: error instanceof FlightSubmissionError ? error.message : 'Itinéraire indisponible.' }, { status: error instanceof FlightSubmissionError ? error.status : 503 });
  }
}
