import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { processDueEntrepriseTransits, processDueRetourTransits } from '@/lib/reparation-transit';

export const dynamic = 'force-dynamic';

/** Finalise les transits automatiques réparation (vers hangar après demande transfert entreprise ; retour base après livraison). */
export async function POST(request: NextRequest) {
  try {
    const secret = request.headers.get('x-cron-secret') || request.headers.get('authorization')?.replace('Bearer ', '');
    if (!secret || secret !== process.env.CRON_SECRET) {
      return NextResponse.json({ error: 'Non autorise' }, { status: 401 });
    }

    const admin = createAdminClient();
    const entrepriseDone = await processDueEntrepriseTransits(admin);
    const retourDone = await processDueRetourTransits(admin);

    return NextResponse.json({
      ok: true,
      entreprise_transits: entrepriseDone,
      retours_base: retourDone,
    });
  } catch (e) {
    console.error('cron reparation-transit:', e);
    return NextResponse.json({ error: 'Erreur serveur' }, { status: 500 });
  }
}
