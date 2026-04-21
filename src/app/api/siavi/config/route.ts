import { NextResponse, NextRequest } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { isChefDeBrigade } from '@/lib/siavi/permissions';

export async function GET() {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Non authentifié' }, { status: 401 });

    const admin = createAdminClient();
    const { data } = await admin.from('siavi_config').select('*').eq('id', 1).single();

    return NextResponse.json(data);
  } catch (e) {
    console.error('SIAVI config GET:', e);
    return NextResponse.json({ error: 'Erreur serveur' }, { status: 500 });
  }
}

export async function PATCH(req: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Non authentifié' }, { status: 401 });

    const admin = createAdminClient();
    const chefOk = await isChefDeBrigade(admin, user.id);
    if (!chefOk) {
      return NextResponse.json({ error: 'Réservé au Chef de brigade SIAVI' }, { status: 403 });
    }

    const body = await req.json();
    const updates: Record<string, unknown> = { updated_by: user.id, updated_at: new Date().toISOString() };

    if (body.pourcentage_salaire_pilote !== undefined) {
      const pct = Number(body.pourcentage_salaire_pilote);
      if (isNaN(pct) || pct < 0 || pct > 100) {
        return NextResponse.json({ error: 'Pourcentage invalide (0-100)' }, { status: 400 });
      }
      updates.pourcentage_salaire_pilote = pct;
    }

    const { error } = await admin.from('siavi_config').update(updates).eq('id', 1);
    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error('SIAVI config PATCH:', e);
    return NextResponse.json({ error: 'Erreur serveur' }, { status: 500 });
  }
}
