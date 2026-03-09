import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { NextResponse, NextRequest } from 'next/server';
import { sendLoginCodeEmail } from '@/lib/email';

const CODE_EXPIRY_MINUTES = 10;
const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function getClientIp(request: NextRequest): string | null {
  const forwarded = request.headers.get('x-forwarded-for');
  if (forwarded) {
    const first = forwarded.split(',')[0]?.trim();
    if (first) return first;
  }
  const realIp = request.headers.get('x-real-ip');
  if (realIp) return realIp.trim();
  return null;
}

function generateSixDigitCode(): string {
  const n = Math.floor(Math.random() * 1_000_000);
  return n.toString().padStart(6, '0');
}

/**
 * Génère un code à 6 chiffres, le stocke en base et l'envoie par email.
 * Envoi du code à l'adresse mail uniquement si l'IP actuelle est différente de
 * l'IP enregistrée lors de la précédente connexion (sinon retourne skipCode: true).
 * - Si le profil a déjà un email : envoi du code à cet email.
 * - Si le profil n'a pas d'email : le body peut contenir { email }. On envoie le code à cet email
 *   et on stocke pending_email ; après vérification du code, l'email sera enregistré dans le profil.
 */
export async function POST(req: NextRequest) {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Non authentifié' }, { status: 401 });

    const admin = createAdminClient();
    const currentIp = getClientIp(req);
    const { data: tracking } = await admin
      .from('user_login_tracking')
      .select('last_login_ip')
      .eq('user_id', user.id)
      .maybeSingle();
    const previousIp = tracking?.last_login_ip ?? null;

    // Même IP que la précédente connexion : pas d'envoi de code par email
    if (previousIp != null && currentIp != null && previousIp === currentIp) {
      await admin.from('user_login_tracking').upsert(
        { user_id: user.id, last_login_ip: currentIp, last_login_at: new Date().toISOString() },
        { onConflict: 'user_id' }
      );
      return NextResponse.json({ ok: true, skipCode: true });
    }

    const { data: profile } = await admin
      .from('profiles')
      .select('email')
      .eq('id', user.id)
      .single();

    const profileEmail = profile?.email?.trim() || null;
    const body = await req.json().catch(() => ({}));
    const bodyEmail = typeof body.email === 'string' ? body.email.trim().toLowerCase() : null;

    let email: string;
    let pendingEmail: string | null = null;

    if (profileEmail) {
      email = profileEmail;
    } else if (bodyEmail && EMAIL_REGEX.test(bodyEmail)) {
      email = bodyEmail;
      pendingEmail = bodyEmail;
    } else {
      return NextResponse.json(
        { error: 'Aucune adresse email. Indiquez votre email pour recevoir le code de vérification.' },
        { status: 400 }
      );
    }

    const code = generateSixDigitCode();
    const expiresAt = new Date(Date.now() + CODE_EXPIRY_MINUTES * 60 * 1000);

    await admin.from('login_verification_codes').upsert(
      {
        user_id: user.id,
        code,
        expires_at: expiresAt.toISOString(),
        pending_email: pendingEmail ?? null,
      },
      { onConflict: 'user_id' }
    );

    const { ok, error } = await sendLoginCodeEmail(email, code);
    if (!ok) {
      return NextResponse.json(
        { error: error || "Impossible d'envoyer l'email. Réessayez ou contactez l'administrateur." },
        { status: 502 }
      );
    }

    return NextResponse.json({ ok: true, emailMasked: maskEmail(email) });
  } catch (e) {
    console.error('[send-login-code]', e);
    return NextResponse.json({ error: 'Erreur serveur' }, { status: 500 });
  }
}

function maskEmail(email: string): string {
  const [local, domain] = email.split('@');
  if (!domain) return '***';
  const first = local[0] ?? '*';
  return `${first}***...@${domain}`;
}
