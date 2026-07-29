export const dynamic = 'force-dynamic';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { NextResponse } from 'next/server';
import { loadAtcAccessContext, serializeAccessContext } from '@/lib/atc-grade-restrictions';

/** GET — règles d'accès applicables à l'utilisateur courant (pour le sélecteur de position) */
export async function GET() {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Non autorisé' }, { status: 401 });

    const { data: profile } = await supabase.from('profiles').select('role, atc').eq('id', user.id).single();
    const canAtc = profile?.role === 'admin' || profile?.role === 'atc' || profile?.atc;
    if (!canAtc) return NextResponse.json({ error: 'Accès ATC requis.' }, { status: 403 });

    const admin = createAdminClient();
    const ctx = await loadAtcAccessContext(admin, user.id);
    return NextResponse.json(serializeAccessContext(ctx));
  } catch (e) {
    console.error('ATC access-rules GET:', e);
    return NextResponse.json({ error: 'Erreur serveur' }, { status: 500 });
  }
}
