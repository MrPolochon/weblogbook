export const dynamic = 'force-dynamic';
import { createClient } from '@/lib/supabase/server';
import { NextResponse } from 'next/server';
import { validateRuleTarget } from '@/lib/atc-grade-restrictions';

export async function GET() {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Non autorisé' }, { status: 401 });
    const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).single();
    if (profile?.role !== 'admin') return NextResponse.json({ error: 'Réservé aux admins.' }, { status: 403 });

    const { data, error } = await supabase
      .from('atc_position_min_grades')
      .select('id, aeroport, position, min_grade_id, created_at')
      .order('created_at', { ascending: true });
    if (error) return NextResponse.json({ error: error.message }, { status: 400 });
    return NextResponse.json(data ?? []);
  } catch (e) {
    console.error('ATC min-grades GET:', e);
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
    const { min_grade_id } = body;
    if (!min_grade_id || typeof min_grade_id !== 'string') {
      return NextResponse.json({ error: 'Grade minimum requis.' }, { status: 400 });
    }

    const target = validateRuleTarget(body);
    if ('error' in target) return NextResponse.json({ error: target.error }, { status: 400 });

    const { data, error } = await supabase
      .from('atc_position_min_grades')
      .insert({
        aeroport: target.aeroport,
        position: target.position,
        min_grade_id,
      })
      .select('id')
      .single();

    if (error) {
      if (error.code === '23505') return NextResponse.json({ error: 'Cette exigence existe déjà.' }, { status: 400 });
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
    return NextResponse.json({ ok: true, id: data.id });
  } catch (e) {
    console.error('ATC min-grades POST:', e);
    return NextResponse.json({ error: 'Erreur serveur' }, { status: 500 });
  }
}
