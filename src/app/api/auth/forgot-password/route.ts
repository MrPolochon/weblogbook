import { createAdminClient } from '@/lib/supabase/admin';
import { NextResponse, NextRequest } from 'next/server';
import { sendPasswordResetLinkEmail } from '@/lib/email';
import { rateLimit } from '@/lib/rate-limit';

const TOKEN_EXPIRY_HOURS = 24;
const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function randomToken(): string {
  const arr = new Uint8Array(32);
  if (typeof crypto !== 'undefined' && crypto.getRandomValues) {
    crypto.getRandomValues(arr);
  } else {
    for (let i = 0; i < 32; i++) arr[i] = Math.floor(Math.random() * 256);
  }
  return Array.from(arr, (b) => b.toString(16).padStart(2, '0')).join('');
}

/**
 * POST body: { identifiant_or_email: string, action: 'send_link' | 'request_admin' }
 * - identifiant_or_email: l'identifiant de connexion ou l'email enregistré sur le compte
 * - send_link: trouve le compte, envoie un lien de réinitialisation à l'email du compte (si présent)
 * - request_admin: crée une demande dans password_reset_requests (visible dans l'admin)
 */
export async function POST(req: NextRequest) {
  try {
    const ip = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || req.headers.get('x-real-ip') || 'unknown';
    const { allowed } = rateLimit(`forgot-password:${ip}`, 5, 15 * 60 * 1000);
    if (!allowed) {
      return NextResponse.json({ error: 'Trop de tentatives. Réessayez dans quelques minutes.' }, { status: 429 });
    }

    const body = await req.json().catch(() => ({}));
    const identifiantOrEmail = typeof body.identifiant_or_email === 'string' ? body.identifiant_or_email.trim() : '';
    const action = body.action === 'request_admin' ? 'request_admin' : 'send_link';
    if (!identifiantOrEmail) {
      return NextResponse.json({ error: 'Indiquez votre identifiant ou l\'email enregistré sur votre compte.' }, { status: 400 });
    }

    const admin = createAdminClient();
    const isEmail = EMAIL_REGEX.test(identifiantOrEmail);
    let userId: string | null = null;
    let profileEmail: string | null = null;
    let identifiant: string | null = null;

    if (isEmail) {
      const { data: p } = await admin.from('profiles').select('id, email, identifiant').eq('email', identifiantOrEmail.toLowerCase()).single();
      if (p) {
        userId = p.id;
        profileEmail = p.email?.trim() || null;
        identifiant = p.identifiant;
      }
    } else {
      const idNorm = identifiantOrEmail.toLowerCase();
      const { data: p } = await admin.from('profiles').select('id, email, identifiant').eq('identifiant', idNorm).single();
      if (p) {
        userId = p.id;
        profileEmail = p.email?.trim() || null;
        identifiant = p.identifiant;
      }
    }

    if (action === 'request_admin') {
      if (userId) {
        await admin.from('password_reset_requests').insert({
          identifiant_or_email: identifiantOrEmail,
          user_id: userId,
          status: 'pending',
        });
      }
      return NextResponse.json({
        ok: true,
        message: 'Si un compte correspondant existe, votre demande a été envoyée aux administrateurs.',
      });
    }

    // Réponse générique uniforme (anti-énumération de comptes) :
    // qu'on ait trouvé ou non un compte avec email, on renvoie le même message
    // et on n'expose plus le drapeau suggest_admin (qui leakait l'existence du compte).
    if (!userId || !profileEmail) {
      return NextResponse.json({
        ok: true,
        message: 'Si un compte avec un email enregistré correspond, un lien de réinitialisation a été envoyé.',
      });
    }

    // Invalide les anciens tokens encore valides pour ce compte avant d'en créer un nouveau.
    try {
      await admin
        .from('password_reset_tokens')
        .delete()
        .eq('user_id', userId)
        .gt('expires_at', new Date().toISOString());
    } catch { /* ignore */ }

    const token = randomToken();
    const expiresAt = new Date(Date.now() + TOKEN_EXPIRY_HOURS * 60 * 60 * 1000);
    const { error: insertErr } = await admin
      .from('password_reset_tokens')
      .insert({ token, user_id: userId, expires_at: expiresAt.toISOString() });
    if (insertErr) {
      console.error('[forgot-password] insert token error:', insertErr);
      return NextResponse.json({ error: 'Erreur serveur, réessayez plus tard.' }, { status: 500 });
    }

    const baseUrl = req.headers.get('x-forwarded-proto') && req.headers.get('x-forwarded-host')
      ? `${req.headers.get('x-forwarded-proto')}://${req.headers.get('x-forwarded-host')}`
      : req.nextUrl?.origin || process.env.NEXT_PUBLIC_APP_URL || 'https://logbook.ptfs.fr';
    const resetUrl = `${baseUrl}/login?reset=${token}`;

    const { ok, error } = await sendPasswordResetLinkEmail(profileEmail, resetUrl);
    if (!ok) {
      console.error('[forgot-password] Email send error:', error);
      // Ne pas laisser un token orphelin : on supprime le token créé et on signale l'échec.
      try { await admin.from('password_reset_tokens').delete().eq('token', token); } catch { /* ignore */ }
      return NextResponse.json(
        { error: "Impossible d'envoyer l'email pour le moment. Réessayez plus tard ou utilisez la demande administrateur." },
        { status: 502 }
      );
    }
    return NextResponse.json({
      ok: true,
      message: 'Si un compte avec un email enregistré correspond, un lien de réinitialisation a été envoyé.',
    });
  } catch (e) {
    console.error('[forgot-password]', e);
    return NextResponse.json({ error: 'Erreur serveur' }, { status: 500 });
  }
}
