import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { NextResponse } from 'next/server';

export async function GET() {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Non autorisé' }, { status: 401 });

    const { data, error } = await supabase
      .from('messages')
      .select('id, titre, contenu, lu, type, created_at, vol_id, plan_vol_id')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false })
      .limit(50);

    if (error) return NextResponse.json({ error: error.message }, { status: 400 });
    return NextResponse.json({ data: data || [] });
  } catch (e) {
    console.error('Messages GET:', e);
    return NextResponse.json({ error: 'Erreur serveur' }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Non autorisé' }, { status: 401 });

    const body = await request.json();
    const { user_id, titre, contenu, type, vol_id, plan_vol_id } = body;

    if (!user_id || !titre || !contenu) {
      return NextResponse.json({ error: 'user_id, titre et contenu requis' }, { status: 400 });
    }

    const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).single();
    if (profile?.role !== 'admin' && user_id !== user.id) {
      return NextResponse.json({ error: 'Réservé aux admins ou à soi-même' }, { status: 403 });
    }

    const admin = createAdminClient();
    const { data, error } = await admin.from('messages').insert({
      user_id,
      titre: String(titre).trim(),
      contenu: String(contenu).trim(),
      type: type || 'info',
      vol_id: vol_id || null,
      plan_vol_id: plan_vol_id || null,
    }).select('id').single();

    if (error) return NextResponse.json({ error: error.message }, { status: 400 });
    return NextResponse.json({ ok: true, id: data.id });
  } catch (e) {
    console.error('Messages POST:', e);
    return NextResponse.json({ error: 'Erreur serveur' }, { status: 500 });
  }
}
