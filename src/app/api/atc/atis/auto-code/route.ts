import { createClient } from '@/lib/supabase/server';
import { NextRequest, NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

/**
 * PATCH - Activer/désactiver la rotation automatique du code ATIS
 */
export async function PATCH(request: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Non autorisé' }, { status: 401 });

    const { data: profile } = await supabase.from('profiles').select('role, atc').eq('id', user.id).single();
    const canAtc = profile?.role === 'admin' || profile?.role === 'atc' || Boolean(profile?.atc);
    if (!canAtc) return NextResponse.json({ error: 'Accès ATC requis.' }, { status: 403 });

    const body = await request.json();
    const auto_rotate = body.auto_rotate;
    if (typeof auto_rotate !== 'boolean') return NextResponse.json({ error: 'auto_rotate (boolean) requis' }, { status: 400 });

    const { error } = await supabase.from('profiles').update({ atis_code_auto_rotate: auto_rotate }).eq('id', user.id);
    if (error) return NextResponse.json({ error: error.message }, { status: 400 });

    return NextResponse.json({ ok: true, atis_code_auto_rotate: auto_rotate });
  } catch (e) {
    console.error('ATIS auto-code:', e);
    return NextResponse.json({ error: 'Erreur serveur' }, { status: 500 });
  }
}
