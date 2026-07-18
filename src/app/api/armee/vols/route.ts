export const dynamic = 'force-dynamic';

import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import {
  canSubmitVolMilitaire,
  createVolMilitaire,
  type CreateVolMilitaireInput,
} from '@/lib/armee';

/** POST — déposer un vol militaire (carnet). */
export async function POST(request: Request) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Non authentifié' }, { status: 401 });

    const { data: profile } = await supabase
      .from('profiles')
      .select('id, role, blocked_until, armee')
      .eq('id', user.id)
      .single();

    if (!profile) return NextResponse.json({ error: 'Profil introuvable' }, { status: 403 });
    if (!canSubmitVolMilitaire(profile)) {
      if (!profile.armee && profile.role !== 'admin') {
        return NextResponse.json({ error: 'Réservé aux utilisateurs avec le rôle Armée (ou aux admins).' }, { status: 403 });
      }
      return NextResponse.json({ error: 'Vous ne pouvez pas ajouter de vol pour le moment.' }, { status: 403 });
    }

    const body = (await request.json()) as CreateVolMilitaireInput;
    const result = await createVolMilitaire(body, { userId: user.id, supabase });
    if (!result.ok) return NextResponse.json({ error: result.error }, { status: result.status });

    return NextResponse.json({ ok: true, id: result.data.id });
  } catch (e) {
    console.error('POST /api/armee/vols:', e);
    return NextResponse.json({ error: 'Erreur serveur' }, { status: 500 });
  }
}
