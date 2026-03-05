import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { NextResponse } from 'next/server';

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * PATCH: met à jour le profil (email pour tous ; armee pour les admins).
 */
export async function PATCH(request: Request) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Non autorisé' }, { status: 401 });

    const body = await request.json().catch(() => ({}));
    const admin = createAdminClient();

    if (typeof body.email === 'string') {
      const email = body.email.trim().toLowerCase();
      if (!email) return NextResponse.json({ error: 'Adresse email requise.' }, { status: 400 });
      if (!EMAIL_REGEX.test(email)) return NextResponse.json({ error: 'Adresse email invalide.' }, { status: 400 });
      const { error } = await admin.from('profiles').update({ email }).eq('id', user.id);
      if (error) return NextResponse.json({ error: error.message }, { status: 400 });
      return NextResponse.json({ ok: true });
    }

    const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).single();
    if (profile?.role !== 'admin') return NextResponse.json({ error: 'Réservé aux admins.' }, { status: 403 });

    const { armee } = body;
    if (typeof armee !== 'boolean') return NextResponse.json({ error: 'armee doit être true ou false.' }, { status: 400 });

    const { error } = await admin.from('profiles').update({ armee }).eq('id', user.id);
    if (error) return NextResponse.json({ error: error.message }, { status: 400 });
    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error('Compte PATCH error:', e);
    return NextResponse.json({ error: 'Erreur serveur' }, { status: 500 });
  }
}
