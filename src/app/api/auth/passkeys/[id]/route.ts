export const dynamic = 'force-dynamic';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { NextResponse, NextRequest } from 'next/server';

/** Supprime une passkey de l'utilisateur connecté. */
export async function DELETE(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Non authentifié' }, { status: 401 });

    const passkeyId = params.id;
    if (!passkeyId) {
      return NextResponse.json({ error: 'Identifiant manquant.' }, { status: 400 });
    }

    const admin = createAdminClient();
    const { data, error } = await admin
      .from('user_passkeys')
      .delete()
      .eq('id', passkeyId)
      .eq('user_id', user.id)
      .select('id')
      .maybeSingle();

    if (error) {
      console.error('[passkeys DELETE]', error);
      return NextResponse.json({ error: 'Erreur serveur' }, { status: 500 });
    }

    if (!data) {
      return NextResponse.json({ error: 'Passkey introuvable.' }, { status: 404 });
    }

    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error('[passkeys DELETE]', e);
    return NextResponse.json({ error: 'Erreur serveur' }, { status: 500 });
  }
}
