import { createClient } from '@/lib/supabase/server';
import { NextResponse } from 'next/server';

export async function GET() {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Non autorisé' }, { status: 401 });
    const { data: profile } = await supabase.from('profiles').select('role, atc').eq('id', user.id).single();
    const can = profile?.role === 'admin' || profile?.atc;
    if (!can) return NextResponse.json({ error: 'Accès ATC requis.' }, { status: 403 });
    const { data, error } = await supabase.from('atc_grades').select('id, nom, ordre').order('ordre', { ascending: true });
    if (error) return NextResponse.json({ error: error.message }, { status: 400 });
    return NextResponse.json(data || []);
  } catch (e) {
    console.error('ATC grades GET:', e);
    return NextResponse.json({ error: 'Erreur serveur' }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Non autorisé' }, { status: 401 });
    const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).single();
    if (profile?.role !== 'admin') return NextResponse.json({ error: 'Réservé aux admins.' }, { status: 403 });
    const body = await request.json();
    const { nom } = body;
    if (!nom || typeof nom !== 'string' || !String(nom).trim()) return NextResponse.json({ error: 'Nom du grade requis.' }, { status: 400 });
    const { data: max } = await supabase.from('atc_grades').select('ordre').order('ordre', { ascending: false }).limit(1).single();
    const ordre = (max?.ordre ?? 0) + 1;
    const { data, error } = await supabase.from('atc_grades').insert({ nom: String(nom).trim(), ordre }).select('id').single();
    if (error) return NextResponse.json({ error: error.message }, { status: 400 });
    return NextResponse.json({ ok: true, id: data.id });
  } catch (e) {
    console.error('ATC grades POST:', e);
    return NextResponse.json({ error: 'Erreur serveur' }, { status: 500 });
  }
}
