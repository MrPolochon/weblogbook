export const dynamic = 'force-dynamic';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { NextResponse } from 'next/server';
import { loadAllAtcAccessRules, validateRuleTarget } from '@/lib/atc-grade-restrictions';

export async function GET() {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Non autorisé' }, { status: 401 });
    const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).single();
    if (profile?.role !== 'admin') return NextResponse.json({ error: 'Réservé aux admins.' }, { status: 403 });

    const { data, error } = await supabase
      .from('atc_grade_forbidden')
      .select('id, grade_id, aeroport, position, applies_to_lower_grades, created_at')
      .order('created_at', { ascending: true });
    if (error) return NextResponse.json({ error: error.message }, { status: 400 });
    return NextResponse.json(data ?? []);
  } catch (e) {
    console.error('ATC forbidden GET:', e);
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
    const { grade_id, applies_to_lower_grades } = body;
    if (!grade_id || typeof grade_id !== 'string') {
      return NextResponse.json({ error: 'Grade requis.' }, { status: 400 });
    }

    const admin = createAdminClient();
    const accessRules = await loadAllAtcAccessRules(admin);
    const target = validateRuleTarget(body, accessRules.airportOptions);
    if ('error' in target) return NextResponse.json({ error: target.error }, { status: 400 });

    const { data, error } = await supabase
      .from('atc_grade_forbidden')
      .insert({
        grade_id,
        aeroport: target.aeroport,
        position: target.position,
        applies_to_lower_grades: applies_to_lower_grades !== false,
      })
      .select('id')
      .single();

    if (error) {
      if (error.code === '23505') return NextResponse.json({ error: 'Cette interdiction existe déjà.' }, { status: 400 });
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
    return NextResponse.json({ ok: true, id: data.id });
  } catch (e) {
    console.error('ATC forbidden POST:', e);
    return NextResponse.json({ error: 'Erreur serveur' }, { status: 500 });
  }
}
