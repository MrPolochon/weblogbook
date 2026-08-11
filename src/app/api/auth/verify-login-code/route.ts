export const dynamic = 'force-dynamic';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { NextResponse, NextRequest } from 'next/server';
import { rateLimit } from '@/lib/rate-limit';
import { completeLoginVerification } from '@/lib/auth/complete-login-verification';

/**
 * Vérifie le code à 6 chiffres saisi par l'utilisateur.
 * Met à jour last_email_verification_at (reconnexion mensuelle).
 */
export async function POST(req: NextRequest) {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Non authentifié' }, { status: 401 });

    const { allowed } = rateLimit(`verify-code:${user.id}`, 10, 15 * 60 * 1000);
    if (!allowed) {
      return NextResponse.json({ error: 'Trop de tentatives. Réessayez dans quelques minutes.' }, { status: 429 });
    }

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

    const result = await completeLoginVerification(admin, user.id, req, {
      pendingEmail: row.pending_email,
      recordEmailVerification: true,
    });

    if (!result.ok) {
      return NextResponse.json({ error: result.error }, { status: result.status });
    }

    return NextResponse.json({ ok: true, offerPasskey: true });
  } catch (e) {
    console.error('[verify-login-code]', e);
    return NextResponse.json({ error: 'Erreur serveur' }, { status: 500 });
  }
}
