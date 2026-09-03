export const dynamic = 'force-dynamic';
import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { canAccessSiavi } from '@/lib/siavi/permissions';

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Non authentifié' }, { status: 401 });

    const admin = createAdminClient();

    if (!(await canAccessSiavi(admin, user.id))) {
      return NextResponse.json({ error: 'Espace SIAVI en cours de maintenance.' }, { status: 503 });
    }

    const { data: rapport, error } = await admin.from('siavi_rapports_medevac')
      .select(`
        *,
        plan_vol:plan_vol_id(
          id, numero_vol, aeroport_depart, aeroport_arrivee,
          temps_prev_min, type_vol, accepted_at, cloture_at,
          statut
        ),
        auteur:created_by(identifiant)
      `)
      .eq('id', id)
      .single();

    if (error || !rapport) {
      return NextResponse.json({ error: 'Rapport introuvable' }, { status: 404 });
    }

    return NextResponse.json(rapport);
  } catch (e) {
    console.error('SIAVI rapport GET:', e);
    return NextResponse.json({ error: 'Erreur serveur' }, { status: 500 });
  }
}
