import { createClient } from '@/lib/supabase/server';
import { NextResponse } from 'next/server';

export async function POST(request: Request) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Non autorisé' }, { status: 401 });
    const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).single();
    if (profile?.role !== 'admin') return NextResponse.json({ error: 'Réservé aux admins' }, { status: 403 });

    const body = await request.json();
    const { nom } = body;
    if (!nom || typeof nom !== 'string' || !nom.trim()) {
      return NextResponse.json({ error: 'Nom requis' }, { status: 400 });
    }

    const { data, error } = await supabase.from('compagnies').insert({ nom: nom.trim() }).select('id').single();
    if (error) return NextResponse.json({ error: error.message }, { status: 400 });
    return NextResponse.json({ ok: true, id: data.id });
  } catch (e) {
    console.error('Compagnie create error:', e);
    return NextResponse.json({ error: 'Erreur serveur' }, { status: 500 });
  }
}
