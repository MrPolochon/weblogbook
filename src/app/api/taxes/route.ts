export const dynamic = 'force-dynamic';
import { NextResponse, NextRequest } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';

// GET - Liste des taxes aéroportuaires
export async function GET(req: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Non authentifié' }, { status: 401 });

    const { searchParams } = new URL(req.url);
    const codeOaci = searchParams.get('code_oaci');

    const admin = createAdminClient();
    let query = admin.from('taxes_aeroport').select('*');

    if (codeOaci) {
      query = query.eq('code_oaci', codeOaci);
    }

    const { data, error } = await query.order('code_oaci');
    if (error) return NextResponse.json({ error: error.message }, { status: 400 });

    return NextResponse.json(data);
  } catch (e) {
    console.error('Taxes GET:', e);
    return NextResponse.json({ error: 'Erreur serveur' }, { status: 500 });
  }
}

// POST - Créer/Modifier une taxe (admin uniquement)
export async function POST(req: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Non authentifié' }, { status: 401 });

    const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).single();
    if (profile?.role !== 'admin') return NextResponse.json({ error: 'Non autorisé' }, { status: 403 });

    const body = await req.json();
    const { code_oaci, taxe_pourcent, taxe_vfr_pourcent } = body;

    if (typeof code_oaci !== 'string' || !/^[A-Z0-9]{4}$/.test(code_oaci.trim().toUpperCase())) {
      return NextResponse.json({ error: 'Code OACI à quatre caractères requis.' }, { status: 400 });
    }
    const ifr = taxe_pourcent ?? 2;
    const vfr = taxe_vfr_pourcent ?? 5;
    if ([ifr, vfr].some(rate => typeof rate !== 'number' || !Number.isFinite(rate) || rate < 0 || rate > 100)) return NextResponse.json({ error: 'Les taxes doivent être des nombres compris entre 0 et 100 %.' }, { status: 400 });

    const admin = createAdminClient();

    // Upsert
    const { data, error } = await admin.from('taxes_aeroport').upsert({
      code_oaci: code_oaci.trim().toUpperCase(),
      taxe_pourcent: ifr,
      taxe_vfr_pourcent: vfr
    }, { onConflict: 'code_oaci' }).select().single();

    if (error) return NextResponse.json({ error: error.message }, { status: 400 });

    return NextResponse.json(data);
  } catch (e) {
    console.error('Taxes POST:', e);
    return NextResponse.json({ error: 'Erreur serveur' }, { status: 500 });
  }
}

// DELETE - Supprimer une taxe (admin uniquement)
export async function DELETE(req: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Non authentifié' }, { status: 401 });

    const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).single();
    if (profile?.role !== 'admin') return NextResponse.json({ error: 'Non autorisé' }, { status: 403 });

    const { searchParams } = new URL(req.url);
    const id = searchParams.get('id');

    if (!id) return NextResponse.json({ error: 'id requis' }, { status: 400 });

    const admin = createAdminClient();
    const { error } = await admin.from('taxes_aeroport').delete().eq('id', id);

    if (error) return NextResponse.json({ error: error.message }, { status: 400 });

    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error('Taxes DELETE:', e);
    return NextResponse.json({ error: 'Erreur serveur' }, { status: 500 });
  }
}
