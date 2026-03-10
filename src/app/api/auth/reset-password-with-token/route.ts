import { createAdminClient } from '@/lib/supabase/admin';
import { NextResponse, NextRequest } from 'next/server';
import { rateLimit } from '@/lib/rate-limit';

/**
 * POST body: { token: string, new_password: string }
 * Vérifie le token (mot de passe oublié), met à jour le mot de passe du compte.
 */
export async function POST(req: NextRequest) {
  try {
    const ip = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || req.headers.get('x-real-ip') || 'unknown';
    const { allowed } = rateLimit(`reset-pwd:${ip}`, 5, 15 * 60 * 1000);
    if (!allowed) {
      return NextResponse.json({ error: 'Trop de tentatives. Réessayez dans quelques minutes.' }, { status: 429 });
    }

    const body = await req.json().catch(() => ({}));
    const token = typeof body.token === 'string' ? body.token.trim() : '';
    const newPassword = typeof body.new_password === 'string' ? body.new_password : '';
    if (!token) return NextResponse.json({ error: 'Lien invalide ou expiré.' }, { status: 400 });
    if (newPassword.length < 8) return NextResponse.json({ error: 'Le mot de passe doit faire au moins 8 caractères.' }, { status: 400 });

    const admin = createAdminClient();
    const { data: row } = await admin
      .from('password_reset_tokens')
      .select('user_id')
      .eq('token', token)
      .gt('expires_at', new Date().toISOString())
      .single();

    if (!row) {
      return NextResponse.json({ error: 'Lien invalide ou expiré.' }, { status: 400 });
    }

    const { error } = await admin.auth.admin.updateUserById(row.user_id, { password: newPassword });
    if (error) return NextResponse.json({ error: error.message || 'Erreur lors de la mise à jour.' }, { status: 400 });
    await admin.from('password_reset_tokens').delete().eq('token', token);
    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error('[reset-password-with-token]', e);
    return NextResponse.json({ error: 'Erreur serveur' }, { status: 500 });
  }
}
