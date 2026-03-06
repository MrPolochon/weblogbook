import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { NextResponse, NextRequest } from 'next/server';

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * PATCH - Définit ou met à jour l'adresse email du profil (admin uniquement).
 * Utilisé pour la vérification par email à chaque connexion.
 */
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: profileId } = await params;
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Non authentifié' }, { status: 401 });

    const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).single();
    if (profile?.role !== 'admin') return NextResponse.json({ error: 'Réservé aux admins' }, { status: 403 });

    const body = await req.json().catch(() => ({}));
    const email = typeof body.email === 'string' ? body.email.trim().toLowerCase() : '';
    if (!email) return NextResponse.json({ error: 'Adresse email requise.' }, { status: 400 });
    if (!EMAIL_REGEX.test(email)) return NextResponse.json({ error: 'Adresse email invalide.' }, { status: 400 });

    const admin = createAdminClient();
    const { error } = await admin.from('profiles').update({ email }).eq('id', profileId);
    if (error) return NextResponse.json({ error: error.message }, { status: 400 });

    return NextResponse.json({ ok: true, email });
  } catch (e) {
    console.error('[admin/profiles/email]', e);
    return NextResponse.json({ error: 'Erreur serveur' }, { status: 500 });
  }
}
