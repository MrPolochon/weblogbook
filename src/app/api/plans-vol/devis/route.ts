export const dynamic = 'force-dynamic';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { NextResponse } from 'next/server';
import { FlightSubmissionError, getFlightQuote } from '@/lib/plans-vol/submission';
import { rateLimitShared } from '@/lib/rate-limit-shared';

export async function POST(request: Request) {
  try {
    const client = await createClient();
    const { data: { user } } = await client.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Non autorisé' }, { status: 401 });
    if (!(await rateLimitShared(`flight-quote:${user.id}`, 60, 60_000)).allowed) return NextResponse.json({ error: 'Veuillez patienter avant de recalculer le chargement.' }, { status: 429 });
    return NextResponse.json(await getFlightQuote(createAdminClient(), user.id, await request.json()));
  } catch (error) {
    if (error instanceof FlightSubmissionError) return NextResponse.json({ error: error.message }, { status: error.status });
    if (error instanceof SyntaxError) return NextResponse.json({ error: 'Demande invalide.' }, { status: 400 });
    console.error('Flight quote:', error);
    return NextResponse.json({ error: 'Chargement indisponible.' }, { status: 503 });
  }
}
