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
    const { compagnie_id, user_id } = body;

    if (!compagnie_id || !user_id) return NextResponse.json({ error: 'compagnie_id et user_id requis' }, { status: 400 });

    const admin = createAdminClient();
    const { data, error } = await admin.from('compagnies_employes').insert({
      compagnie_id,
      user_id,
      heures_vol_compagnie_minutes: 0,
    }).select('compagnie_id, user_id').single();

    if (error) {
      if (error.code === '23505') return NextResponse.json({ error: 'Cet employé est déjà dans cette compagnie' }, { status: 400 });
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
    return NextResponse.json({ ok: true, user_id: data?.user_id });
  } catch (e) {
    console.error('Compagnies employés POST:', e);
    return NextResponse.json({ error: 'Erreur serveur' }, { status: 500 });
  }
}

export async function DELETE(request: Request) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Non autorisé' }, { status: 401 });

    const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).single();
    if (profile?.role !== 'admin') return NextResponse.json({ error: 'Réservé aux admins' }, { status: 403 });

    const { searchParams } = new URL(request.url);
    const compagnieId = searchParams.get('compagnie_id');
    const userId = searchParams.get('user_id');

    if (!compagnieId || !userId) return NextResponse.json({ error: 'compagnie_id et user_id requis' }, { status: 400 });

    const admin = createAdminClient();
    const { error } = await admin.from('compagnies_employes').delete().eq('compagnie_id', compagnieId).eq('user_id', userId);
    if (error) return NextResponse.json({ error: error.message }, { status: 400 });
    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error('Compagnies employés DELETE:', e);
    return NextResponse.json({ error: 'Erreur serveur' }, { status: 500 });
  }
}
