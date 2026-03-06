import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { NextResponse, NextRequest } from 'next/server';
import { sendSuperadminAccessCodeEmail } from '@/lib/email';

const CODE_EXPIRY_MINUTES = 30;

function generateSixDigitCode(): string {
  const n = Math.floor(Math.random() * 1_000_000);
  return n.toString().padStart(6, '0');
}

/**
 * POST - Étape 1 : vérifier le mot de passe superadmin et envoyer le code par email.
 * Réservé aux admins.
 */
export async function POST(req: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Non authentifié' }, { status: 401 });

    const admin = createAdminClient();
    const { data: profile } = await admin.from('profiles').select('role, email, identifiant').eq('id', user.id).single();
    if (profile?.role !== 'admin') return NextResponse.json({ error: 'Réservé aux admins' }, { status: 403 });

    const expectedPassword = process.env.SUPERADMIN_PASSWORD;
    if (!expectedPassword || expectedPassword.length < 8) {
      return NextResponse.json({ error: 'Accès liste IP non configuré (SUPERADMIN_PASSWORD manquant).' }, { status: 503 });
    }

    const body = await req.json().catch(() => ({}));
    const password = typeof body.password === 'string' ? body.password : '';
    if (password !== expectedPassword) {
      return NextResponse.json({ error: 'Mot de passe superadmin incorrect.' }, { status: 400 });
    }

    const email = profile.email?.trim();
    if (!email) {
      return NextResponse.json({ error: 'Aucun email associé à votre compte. Définissez-le dans votre profil ou dans Admin > Pilotes.' }, { status: 400 });
    }

    const code = generateSixDigitCode();
    const expiresAt = new Date(Date.now() + CODE_EXPIRY_MINUTES * 60 * 1000);
    await admin.from('superadmin_access_codes').upsert(
      { user_id: user.id, code, expires_at: expiresAt.toISOString() },
      { onConflict: 'user_id' }
    );

    const { ok, error } = await sendSuperadminAccessCodeEmail(email, code);
    if (!ok) {
      return NextResponse.json({ error: error || 'Impossible d\'envoyer l\'email.' }, { status: 502 });
    }

    // Masquer l'email pour l'affichage (ex: "ab***@domain.com")
    const at = email.indexOf('@');
    const local = email.slice(0, at);
    const domain = email.slice(at);
    const emailMasked = local.length <= 2
      ? local.slice(0, 1) + '***' + domain
      : local.slice(0, 2) + '***' + domain;

    return NextResponse.json({
      ok: true,
      emailMasked,
      identifiant: profile?.identifiant ?? '',
    });
  } catch (e) {
    console.error('[superadmin request-access]', e);
    return NextResponse.json({ error: 'Erreur serveur' }, { status: 500 });
  }
}
