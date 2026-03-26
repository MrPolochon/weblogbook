import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { NextResponse } from 'next/server';

export async function POST(request: Request) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Non autorisé' }, { status: 401 });
    const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).single();
    if (profile?.role !== 'admin') return NextResponse.json({ error: 'Réservé aux admins' }, { status: 403 });

    const body = await request.json();
    const { nom, pdg_id } = body;
    const nomTrim = typeof nom === 'string' ? nom.trim() : '';
    if (!nomTrim) {
      return NextResponse.json({ error: 'Nom requis' }, { status: 400 });
    }

    const admin = createAdminClient();
    const { data, error } = await admin.from('compagnies').insert({
      nom: nomTrim,
      pdg_id: pdg_id || null
    }).select('id').single();

    if (error) {
      if (error.code === '23505' || /unique|duplicate/i.test(error.message ?? '')) {
        return NextResponse.json({ error: 'Une compagnie avec ce nom existe déjà' }, { status: 409 });
      }
      return NextResponse.json({ error: 'Erreur lors de la création' }, { status: 400 });
    }
    return NextResponse.json({ ok: true, id: data.id });
  } catch (e) {
    console.error('Compagnie create error:', e);
    return NextResponse.json({ error: 'Erreur serveur' }, { status: 500 });
  }
}

export async function GET() {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Non autorisé' }, { status: 401 });

    const { data, error } = await supabase.from('compagnies')
      .select('id, nom, pdg_id')
      .order('nom');

    if (error) return NextResponse.json({ error: 'Erreur lors du chargement' }, { status: 400 });
    return NextResponse.json(data);
  } catch (e) {
    console.error('Compagnies GET:', e);
    return NextResponse.json({ error: 'Erreur serveur' }, { status: 500 });
  }
}
