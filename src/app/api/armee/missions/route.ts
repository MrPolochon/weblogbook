export const dynamic = 'force-dynamic';

import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { ARME_MISSIONS, canAccessEspaceMilitaire, listMissionsWithCooldown } from '@/lib/armee';

/**
 * GET — catalogue des missions + état de cooldown pour l'utilisateur connecté.
 * Sans session : catalogue statique (compatibilité dépôts publics / cache).
 */
export async function GET() {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json(ARME_MISSIONS, {
        headers: { 'Cache-Control': 'public, max-age=300, stale-while-revalidate=3600' },
      });
    }

    const { data: profile } = await supabase
      .from('profiles')
      .select('armee, role')
      .eq('id', user.id)
      .single();

    if (!canAccessEspaceMilitaire(profile)) {
      return NextResponse.json({ error: 'Accès réservé à l\'armée' }, { status: 403 });
    }

    const missions = await listMissionsWithCooldown(user.id);
    return NextResponse.json(missions, {
      headers: { 'Cache-Control': 'private, no-store' },
    });
  } catch (e) {
    console.error('GET /api/armee/missions:', e);
    return NextResponse.json({ error: 'Erreur serveur' }, { status: 500 });
  }
}
