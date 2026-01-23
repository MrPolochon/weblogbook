import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { NextResponse } from 'next/server';

export async function GET(request: Request) {
  try {
    const supabase = await createClient();
    const { searchParams } = new URL(request.url);
    const compagnieId = searchParams.get('compagnie_id');

    const query = supabase
      .from('compagnies_avions')
      .select('id, compagnie_id, type_avion_id, quantite, capacite_passagers, capacite_cargo_kg, nom_avion, prix_billet_base, prix_cargo_kg, types_avion(nom, constructeur)')
      .order('created_at', { ascending: false });

    if (compagnieId) query.eq('compagnie_id', compagnieId);

    const { data, error } = await query;
    if (error) return NextResponse.json({ error: error.message }, { status: 400 });
    return NextResponse.json({ data: data || [] });
  } catch (e) {
    console.error('Compagnies avions GET:', e);
    return NextResponse.json({ error: 'Erreur serveur' }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Non autorisé' }, { status: 401 });

    const body = await request.json();
    const { compagnie_id, type_avion_id, quantite } = body;

    if (!compagnie_id || !type_avion_id || !quantite || quantite < 1) {
      return NextResponse.json({ error: 'Paramètres invalides' }, { status: 400 });
    }

    const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).single();
    const isAdmin = profile?.role === 'admin';

    if (!isAdmin) {
      const { data: compagnie } = await supabase.from('compagnies').select('pdg_id').eq('id', compagnie_id).single();
      if (compagnie?.pdg_id !== user.id) return NextResponse.json({ error: 'Réservé aux PDG ou admins' }, { status: 403 });
    }

    const admin = createAdminClient();
    const { data: existing } = await admin.from('compagnies_avions').select('id, quantite').eq('compagnie_id', compagnie_id).eq('type_avion_id', type_avion_id).single();

    if (existing) {
      const { error } = await admin.from('compagnies_avions').update({ quantite: existing.quantite + quantite }).eq('id', existing.id);
      if (error) return NextResponse.json({ error: error.message }, { status: 400 });
      return NextResponse.json({ ok: true, id: existing.id });
    }

    const { data, error } = await admin.from('compagnies_avions').insert({
      compagnie_id,
      type_avion_id,
      quantite,
    }).select('id').single();

    if (error) return NextResponse.json({ error: error.message }, { status: 400 });
    return NextResponse.json({ ok: true, id: data.id });
  } catch (e) {
    console.error('Compagnies avions POST:', e);
    return NextResponse.json({ error: 'Erreur serveur' }, { status: 500 });
  }
}
