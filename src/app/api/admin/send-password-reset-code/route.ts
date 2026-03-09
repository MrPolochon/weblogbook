import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { NextResponse, NextRequest } from 'next/server';
import { sendAdminPasswordResetCodeEmail } from '@/lib/email';

const CODE_EXPIRY_MINUTES = 10;

function generateSixDigitCode(): string {
  const n = Math.floor(Math.random() * 1_000_000);
  return n.toString().padStart(6, '0');
}

/**
 * Envoie un code de vérification à l'email du compte dont l'admin souhaite réinitialiser le mot de passe.
 * POST body: { user_id: string }
 */
export async function POST(req: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Non autorisé' }, { status: 401 });
    const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).single();
    if (profile?.role !== 'admin') return NextResponse.json({ error: 'Réservé aux administrateurs.' }, { status: 403 });

    const body = await req.json().catch(() => ({}));
    const targetUserId = typeof body.user_id === 'string' ? body.user_id.trim() : null;
    if (!targetUserId) return NextResponse.json({ error: 'user_id requis.' }, { status: 400 });

    const admin = createAdminClient();
    const { data: target } = await admin.from('profiles').select('id, email, identifiant').eq('id', targetUserId).single();
    if (!target) return NextResponse.json({ error: 'Compte introuvable.' }, { status: 404 });

    const toEmail = target.email?.trim();
    if (!toEmail) {
      return NextResponse.json(
        { error: 'Aucune adresse email enregistrée pour ce compte. L\'utilisateur doit renseigner son email dans Mon compte.' },
        { status: 400 }
      );
    }

    const code = generateSixDigitCode();
    const expiresAt = new Date(Date.now() + CODE_EXPIRY_MINUTES * 60 * 1000);
    await admin.from('admin_password_reset_codes').upsert(
      { user_id: targetUserId, code, expires_at: expiresAt.toISOString() },
      { onConflict: 'user_id' }
    );

    const { ok, error } = await sendAdminPasswordResetCodeEmail(toEmail, code);
    if (!ok) {
      return NextResponse.json({ error: error || 'Impossible d\'envoyer l\'email.' }, { status: 502 });
    }
    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error('[send-password-reset-code]', e);
    return NextResponse.json({ error: 'Erreur serveur' }, { status: 500 });
  }
}
