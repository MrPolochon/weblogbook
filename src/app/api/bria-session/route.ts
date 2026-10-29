export const dynamic = 'force-dynamic';
import { createClient } from '@/lib/supabase/server';
import { NextResponse } from 'next/server';

const capabilities = {
  mode: 'guided',
  remainingMs: 0,
  until: null,
  requiresMicrophone: false,
  canSubmitPlan: false,
  briefingUrl: '/logbook/depot-plan-vol',
};

export async function GET() {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Non autorisé' }, { status: 401 });
    return NextResponse.json(capabilities);
  } catch {
    return NextResponse.json({ error: 'Impossible de vérifier votre session.' }, { status: 500 });
  }
}

/** Old voice-session callers receive a useful migration response, without any quota or provider call. */
export async function POST() {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Non autorisé' }, { status: 401 });
    return NextResponse.json({
      ...capabilities,
      error: 'Le BRIA est désormais disponible en briefing guidé dans le formulaire de dépôt.',
    }, { status: 410 });
  } catch {
    return NextResponse.json({ error: 'Impossible de vérifier votre session.' }, { status: 500 });
  }
}
