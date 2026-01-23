import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { NextResponse } from 'next/server';

export async function GET() {
  try {
    const supabase = await createClient();
    const { data, error } = await supabase
      .from('marketplace_avions')
      .select('type_avion_id, prix, capacite_cargo_kg, types_avion(nom, constructeur)')
      .order('types_avion(nom)');

    if (error) return NextResponse.json({ error: error.message }, { status: 400 });
    return NextResponse.json({ data: data || [] });
  } catch (e) {
    console.error('Marketplace prix GET:', e);
    return NextResponse.json({ error: 'Erreur serveur' }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Non autorisé' }, { status: 401 });

    const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).single();
    if (profile?.role !== 'admin') return NextResponse.json({ error: 'Réservé aux admins' }, { status: 403 });

    const body = await request.json();
    const { type_avion_id, prix, version_cargo, capacite_cargo_kg } = body;

    if (!type_avion_id || prix === undefined || prix < 0) {
      return NextResponse.json({ error: 'Paramètres invalides' }, { status: 400 });
    }

    const admin = createAdminClient();
    const { data: existing } = await admin.from('marketplace_avions').select('type_avion_id').eq('type_avion_id', type_avion_id).single();

    if (existing) {
      const { error } = await admin.from('marketplace_avions').update({
        prix: Number(prix),
        version_cargo: Boolean(version_cargo),
        capacite_cargo_kg: version_cargo && capacite_cargo_kg ? Number(capacite_cargo_kg) : null,
        updated_at: new Date().toISOString(),
      }).eq('type_avion_id', type_avion_id);
      if (error) return NextResponse.json({ error: error.message }, { status: 400 });
    } else {
      const { error } = await admin.from('marketplace_avions').insert({
        type_avion_id,
        prix: Number(prix),
        version_cargo: Boolean(version_cargo),
        capacite_cargo_kg: version_cargo && capacite_cargo_kg ? Number(capacite_cargo_kg) : null,
      });
      if (error) return NextResponse.json({ error: error.message }, { status: 400 });
    }

    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error('Marketplace prix POST:', e);
    return NextResponse.json({ error: 'Erreur serveur' }, { status: 500 });
  }
}
