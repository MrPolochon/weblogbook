import { createClient } from '@/lib/supabase/server';
import { NextResponse } from 'next/server';

export async function PATCH(request: Request, { params }: { params: { id: string } }) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Non autorisé' }, { status: 401 });

    const body = await request.json();
    const { lu } = body;

    const { data: message } = await supabase.from('messages').select('user_id').eq('id', params.id).single();
    if (!message) return NextResponse.json({ error: 'Message introuvable' }, { status: 404 });
    if (message.user_id !== user.id) return NextResponse.json({ error: 'Non autorisé' }, { status: 403 });

    const { error } = await supabase.from('messages').update({ lu: Boolean(lu) }).eq('id', params.id);
    if (error) return NextResponse.json({ error: error.message }, { status: 400 });
    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error('Messages PATCH:', e);
    return NextResponse.json({ error: 'Erreur serveur' }, { status: 500 });
  }
}
