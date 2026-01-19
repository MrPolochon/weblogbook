import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { NextResponse } from 'next/server';

/**
 * PATCH: permet à un admin de s'auto-attribuer le rôle Armée (Espace militaire).
 */
export async function PATCH(request: Request) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Non autorisé' }, { status: 401 });

    const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).single();
    if (profile?.role !== 'admin') return NextResponse.json({ error: 'Réservé aux admins.' }, { status: 403 });

    const body = await request.json();
    const { armee } = body;
    if (typeof armee !== 'boolean') return NextResponse.json({ error: 'armee doit être true ou false.' }, { status: 400 });

    const admin = createAdminClient();
    const { error } = await admin.from('profiles').update({ armee }).eq('id', user.id);
    if (error) return NextResponse.json({ error: error.message }, { status: 400 });
    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error('Compte PATCH error:', e);
    return NextResponse.json({ error: 'Erreur serveur' }, { status: 500 });
  }
}
