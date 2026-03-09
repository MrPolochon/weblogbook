import { createAdminClient } from '@/lib/supabase/admin';
import { NextResponse, NextRequest } from 'next/server';
import { sendPasswordResetLinkEmail } from '@/lib/email';

const TOKEN_EXPIRY_HOURS = 1;
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

    if (!userId) {
      return NextResponse.json(
        { error: 'Aucun compte trouvé avec cet identifiant ou cette adresse email.' },
        { status: 404 }
      );
    }

    if (action === 'request_admin') {
      await admin.from('password_reset_requests').insert({
        identifiant_or_email: identifiantOrEmail,
        user_id: userId,
        status: 'pending',
      });
      return NextResponse.json({
        ok: true,
        message: 'Votre demande a été envoyée aux administrateurs. Vous serez contacté ou pourrez vous reconnecter une fois le mot de passe réinitialisé.',
      });
    }

    if (!profileEmail) {
      return NextResponse.json(
        {
          error: 'Aucun email enregistré sur ce compte. Vous pouvez faire une demande aux administrateurs (bouton ci-dessous).',
          suggest_admin: true,
        },
        { status: 400 }
      );
    }

    const token = randomToken();
    const expiresAt = new Date(Date.now() + TOKEN_EXPIRY_HOURS * 60 * 60 * 1000);
    await admin.from('password_reset_tokens').insert({ token, user_id: userId, expires_at: expiresAt.toISOString() });

    const baseUrl = req.headers.get('x-forwarded-proto') && req.headers.get('x-forwarded-host')
      ? `${req.headers.get('x-forwarded-proto')}://${req.headers.get('x-forwarded-host')}`
      : req.nextUrl?.origin || process.env.NEXT_PUBLIC_APP_URL || 'https://logbook.ptfs.fr';
    const resetUrl = `${baseUrl}/login?reset=${token}`;

    const { ok, error } = await sendPasswordResetLinkEmail(profileEmail, resetUrl);
    if (!ok) {
      return NextResponse.json({ error: error || 'Impossible d\'envoyer l\'email.' }, { status: 502 });
    }
    return NextResponse.json({
      ok: true,
      message: 'Un lien de réinitialisation a été envoyé à l\'adresse enregistrée sur votre compte.',
    });
  } catch (e) {
    console.error('[forgot-password]', e);
    return NextResponse.json({ error: 'Erreur serveur' }, { status: 500 });
  }
}
