export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { canAccessEspaceMilitaire, getHonorBoard, getPilotMilitaryStats } from '@/lib/armee';

/** GET — stats pilote + tableau d'honneur. ?period=week|month */
export async function GET(req: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Non authentifié' }, { status: 401 });

    const { data: profile } = await supabase
      .from('profiles')
      .select('armee, role')
      .eq('id', user.id)
      .single();

    if (!canAccessEspaceMilitaire(profile)) {
      return NextResponse.json({ error: 'Accès réservé à l\'armée' }, { status: 403 });
    }

    const periodParam = req.nextUrl.searchParams.get('period');
    const period = periodParam === 'month' ? 'month' : 'week';

    const [pilot, honor] = await Promise.all([
      getPilotMilitaryStats(user.id),
      getHonorBoard(period),
    ]);

    return NextResponse.json({ pilot, honor }, {
      headers: { 'Cache-Control': 'private, no-store' },
    });
  } catch (e) {
    console.error('GET /api/armee/stats:', e);
    return NextResponse.json({ error: 'Erreur serveur' }, { status: 500 });
  }
}
