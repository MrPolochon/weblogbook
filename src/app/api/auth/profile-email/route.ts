import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { NextResponse, NextRequest } from 'next/server';

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * Met à jour l'adresse email du profil de l'utilisateur connecté (pour la vérification à chaque connexion).
 */
export async function PATCH(req: NextRequest) {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Non authentifié' }, { status: 401 });

    const body = await req.json().catch(() => ({}));
    const email = typeof body.email === 'string' ? body.email.trim().toLowerCase() : '';
    if (!email) return NextResponse.json({ error: 'Adresse email requise.' }, { status: 400 });
    if (!EMAIL_REGEX.test(email)) return NextResponse.json({ error: 'Adresse email invalide.' }, { status: 400 });

    const admin = createAdminClient();
    const { error } = await admin.from('profiles').update({ email }).eq('id', user.id);
    if (error) return NextResponse.json({ error: error.message }, { status: 400 });

    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error('[profile-email]', e);
    return NextResponse.json({ error: 'Erreur serveur' }, { status: 500 });
  }
}
