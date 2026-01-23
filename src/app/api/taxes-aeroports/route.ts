import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { NextResponse } from 'next/server';

export async function GET() {
  try {
    const supabase = await createClient();
    const { data, error } = await supabase
      .from('taxes_aeroports')
      .select('code_aeroport, taxe_base_pourcent, taxe_vfr_pourcent')
      .order('code_aeroport');

    if (error) return NextResponse.json({ error: error.message }, { status: 400 });
    return NextResponse.json({ data: data || [] });
  } catch (e) {
    console.error('Taxes aéroports GET:', e);
    return NextResponse.json({ error: 'Erreur serveur' }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Non autorisé' }, { status: 401 });

    const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).single();
    if (profile?.role !== 'admin') return NextResponse.json({ error: 'Réservé aux admins' }, { status: 403 });

    const body = await request.json();
    const { code_aeroport, taxe_base_pourcent, taxe_vfr_pourcent } = body;

    if (!code_aeroport || taxe_base_pourcent === undefined || taxe_vfr_pourcent === undefined) {
      return NextResponse.json({ error: 'Paramètres requis' }, { status: 400 });
    }

    const admin = createAdminClient();
    const { data: existing } = await admin.from('taxes_aeroports').select('id').eq('code_aeroport', code_aeroport).single();

    if (existing) {
      const { error } = await admin.from('taxes_aeroports').update({
        taxe_base_pourcent: Number(taxe_base_pourcent),
        taxe_vfr_pourcent: Number(taxe_vfr_pourcent),
        updated_at: new Date().toISOString(),
      }).eq('id', existing.id);
      if (error) return NextResponse.json({ error: error.message }, { status: 400 });
    } else {
      const { error } = await admin.from('taxes_aeroports').insert({
        code_aeroport: String(code_aeroport).toUpperCase().trim(),
        taxe_base_pourcent: Number(taxe_base_pourcent),
        taxe_vfr_pourcent: Number(taxe_vfr_pourcent),
      });
      if (error) return NextResponse.json({ error: error.message }, { status: 400 });
    }

    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error('Taxes aéroports POST:', e);
    return NextResponse.json({ error: 'Erreur serveur' }, { status: 500 });
  }
}
