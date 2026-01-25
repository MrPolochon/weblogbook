import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';

// GET - Récupérer la config du Hangar Market
export async function GET() {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Non authentifié' }, { status: 401 });

    const admin = createAdminClient();
    const { data, error } = await admin.from('hangar_market_config')
      .select('*')
      .single();

    if (error && error.code !== 'PGRST116') {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }

    return NextResponse.json(data || { taxe_vente_pourcent: 5 });
  } catch (e) {
    console.error('Hangar Market Config GET:', e);
    return NextResponse.json({ error: 'Erreur serveur' }, { status: 500 });
  }
}

// PATCH - Modifier la config (admin uniquement)
export async function PATCH(request: Request) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Non authentifié' }, { status: 401 });

    // Vérifier admin
    const { data: profile } = await supabase.from('profiles')
      .select('role')
      .eq('id', user.id)
      .single();

    if (profile?.role !== 'admin') {
      return NextResponse.json({ error: 'Accès refusé' }, { status: 403 });
    }

    const body = await request.json();
    const { taxe_vente_pourcent } = body;

    if (taxe_vente_pourcent === undefined || taxe_vente_pourcent < 0 || taxe_vente_pourcent > 100) {
      return NextResponse.json({ error: 'Taxe invalide (0-100%)' }, { status: 400 });
    }

    const admin = createAdminClient();

    // Récupérer l'ID existant ou créer une nouvelle config
    const { data: existing } = await admin.from('hangar_market_config')
      .select('id')
      .single();

    if (existing) {
      const { error } = await admin.from('hangar_market_config')
        .update({ taxe_vente_pourcent })
        .eq('id', existing.id);

      if (error) return NextResponse.json({ error: error.message }, { status: 400 });
    } else {
      const { error } = await admin.from('hangar_market_config')
        .insert({ taxe_vente_pourcent });

      if (error) return NextResponse.json({ error: error.message }, { status: 400 });
    }

    return NextResponse.json({ ok: true, taxe_vente_pourcent });
  } catch (e) {
    console.error('Hangar Market Config PATCH:', e);
    return NextResponse.json({ error: 'Erreur serveur' }, { status: 500 });
  }
}
