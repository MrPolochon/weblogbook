import { createClient } from '@/lib/supabase/server';
import { NextRequest, NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

/**
 * PATCH - Basculer la visibilité du ticker ATIS (affichage/masquage)
 * Disponible pour tous les ATC
 */
export async function PATCH(request: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Non autorisé' }, { status: 401 });

    const { data: profile } = await supabase.from('profiles').select('role, atc, atis_ticker_visible').eq('id', user.id).single();
    const canAtc = profile?.role === 'admin' || profile?.role === 'atc' || Boolean(profile?.atc);
    if (!canAtc) return NextResponse.json({ error: 'Accès ATC requis.' }, { status: 403 });

    const body = await request.json();
    const visible = body.visible;
    if (typeof visible !== 'boolean') return NextResponse.json({ error: 'visible (boolean) requis' }, { status: 400 });

    const { error } = await supabase.from('profiles').update({ atis_ticker_visible: visible }).eq('id', user.id);
    if (error) return NextResponse.json({ error: error.message }, { status: 400 });

    return NextResponse.json({ ok: true, atis_ticker_visible: visible });
  } catch (e) {
    console.error('ATIS ticker toggle:', e);
    return NextResponse.json({ error: 'Erreur serveur' }, { status: 500 });
  }
}
