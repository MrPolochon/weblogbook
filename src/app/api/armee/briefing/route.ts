export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import {
  canAccessEspaceMilitaire,
  canManageBriefing,
  getActiveBriefing,
  getBriefingForAdmin,
  updateBriefing,
} from '@/lib/armee';

/** GET — briefing actif (pilotes) ou complet (PDG/admin). */
export async function GET() {
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

    const canEdit = await canManageBriefing(user.id, profile);
    if (canEdit) {
      const briefing = await getBriefingForAdmin();
      return NextResponse.json({ briefing, canEdit: true });
    }

    const briefing = await getActiveBriefing();
    return NextResponse.json({ briefing, canEdit: false });
  } catch (e) {
    console.error('GET /api/armee/briefing:', e);
    return NextResponse.json({ error: 'Erreur serveur' }, { status: 500 });
  }
}

/** PUT — publier / modifier le briefing (PDG ou admin). */
export async function PUT(req: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Non authentifié' }, { status: 401 });

    const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).single();
    if (!(await canManageBriefing(user.id, profile))) {
      return NextResponse.json({ error: 'Réservé au PDG militaire ou aux administrateurs' }, { status: 403 });
    }

    const body = await req.json();
    const titre = typeof body.titre === 'string' ? body.titre : 'Briefing opérationnel';
    const contenu = typeof body.contenu === 'string' ? body.contenu : '';
    const actif = Boolean(body.actif);

    const result = await updateBriefing({ titre, contenu, actif }, user.id);
    if (!result.ok) return NextResponse.json({ error: result.error }, { status: 400 });

    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error('PUT /api/armee/briefing:', e);
    return NextResponse.json({ error: 'Erreur serveur' }, { status: 500 });
  }
}
