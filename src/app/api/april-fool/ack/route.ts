import { createClient } from '@/lib/supabase/server';
import { NextResponse } from 'next/server';
import { getParisCalendarYear } from '@/lib/paris-date';

export const dynamic = 'force-dynamic';

/**
 * POST — enregistre que l’utilisateur connecté a terminé la blague du 1er avril (idempotent par année).
 */
export async function POST(req: Request) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Non autorisé' }, { status: 401 });

    let year = getParisCalendarYear();
    try {
      const body = await req.json();
      if (typeof body?.year === 'number' && body.year >= 2020 && body.year <= 2100) {
        year = body.year;
      }
    } catch {
      /* corps vide ou JSON invalide : année Paris par défaut */
    }

    const { error } = await supabase.from('april_fool_ack').upsert(
      { user_id: user.id, year, ack_at: new Date().toISOString() },
      { onConflict: 'user_id,year' },
    );

    if (error) {
      console.error('april_fool_ack upsert:', error.message);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ ok: true, year });
  } catch (e) {
    console.error('april-fool ack:', e);
    return NextResponse.json({ error: 'Erreur serveur' }, { status: 500 });
  }
}
