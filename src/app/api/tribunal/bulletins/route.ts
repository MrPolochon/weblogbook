import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { validateBulletin } from '@/lib/tribunal-bulletins';

export async function POST(request: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Connexion requise.' }, { status: 401 });
  const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).single();
  if (profile?.role !== 'admin') return NextResponse.json({ error: 'Publication réservée aux administrateurs.' }, { status: 403 });
  const payload = validateBulletin(await request.json().catch(() => null));
  if (!payload) return NextResponse.json({ error: 'Indiquez une catégorie, un titre de 3 à 200 caractères et un texte de 10 à 50 000 caractères.' }, { status: 400 });
  const { data: id, error } = await supabase.rpc('publish_tribunal_bulletin', { p_title: payload.title, p_category: payload.category, p_content: payload.content });
  if (error) return NextResponse.json({ error: 'Publication impossible. Réessayez dans quelques instants.' }, { status: 503 });
  return NextResponse.json({ id }, { status: 201 });
}
