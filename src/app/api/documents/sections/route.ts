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
    const { nom, parent_id } = body;
    if (!nom || typeof nom !== 'string' || !nom.trim()) return NextResponse.json({ error: 'Nom requis' }, { status: 400 });

    const query = supabase.from('document_sections').select('ordre').order('ordre', { ascending: false }).limit(1);
    if (parent_id) query.eq('parent_id', parent_id);
    else query.is('parent_id', null);
    const { data: sections } = await query;
    const ordre = (sections?.[0]?.ordre ?? 0) + 1;

    const insert: Record<string, unknown> = { nom: nom.trim(), ordre };
    if (parent_id) insert.parent_id = parent_id;

    const { data, error } = await supabase.from('document_sections').insert(insert).select('id').single();
    if (error) return NextResponse.json({ error: error.message }, { status: 400 });
    return NextResponse.json({ ok: true, id: data.id });
  } catch (e) {
    console.error('Section create error:', e);
    return NextResponse.json({ error: 'Erreur serveur' }, { status: 500 });
  }
}
