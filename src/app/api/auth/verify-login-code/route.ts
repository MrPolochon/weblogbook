import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { NextResponse, NextRequest } from 'next/server';

/**
 * Vérifie le code à 6 chiffres saisi par l'utilisateur.
 * Si valide, supprime le code et retourne ok (le client pourra alors retirer le cookie pending_verification).
 */
export async function POST(req: NextRequest) {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Non authentifié' }, { status: 401 });

    const body = await req.json().catch(() => ({}));
    const code = typeof body.code === 'string' ? body.code.trim().replace(/\s/g, '') : '';
    if (code.length !== 6 || !/^\d{6}$/.test(code)) {
      return NextResponse.json({ error: 'Code invalide (6 chiffres requis).' }, { status: 400 });
    }

    const admin = createAdminClient();
    const { data: row } = await admin
      .from('login_verification_codes')
      .select('user_id, pending_email')
      .eq('user_id', user.id)
      .eq('code', code)
      .gt('expires_at', new Date().toISOString())
      .single();

    if (!row) {
      return NextResponse.json({ error: 'Code incorrect ou expiré.' }, { status: 400 });
    }

    if (row.pending_email) {
      await admin.from('profiles').update({ email: row.pending_email }).eq('id', user.id);
    }

    await admin.from('login_verification_codes').delete().eq('user_id', user.id);

    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error('[verify-login-code]', e);
    return NextResponse.json({ error: 'Erreur serveur' }, { status: 500 });
  }
}
