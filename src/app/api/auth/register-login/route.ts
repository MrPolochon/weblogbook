export const dynamic = 'force-dynamic';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { NextResponse, NextRequest } from 'next/server';
import { getClientIp, normalizeIp } from '@/lib/ip-utils';
import {
  getLastEmailVerificationAt,
  userHasPasskeys,
} from '@/lib/auth/complete-login-verification';
import { needsMonthlyEmailVerification } from '@/lib/webauthn/config';

/**
 * Enregistre la connexion et indique si une vérification est requise.
 * - IP différente ou première connexion → requireCode true
 * - Même IP → requireCode false
 * - forceEmail true si reconnexion mensuelle obligatoire (> 30 jours sans OTP email)
 * - hasPasskeys true si l'utilisateur a enregistré au moins une passkey
 */
export async function POST(req: NextRequest) {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Non authentifié' }, { status: 401 });

    const ip = getClientIp(req);
    const admin = createAdminClient();

    const { data: tracking } = await admin
      .from('user_login_tracking')
      .select('last_login_ip, last_email_verification_at')
      .eq('user_id', user.id)
      .maybeSingle();

    const previousIp = tracking?.last_login_ip ? normalizeIp(tracking.last_login_ip) : null;
    const requireCode = !previousIp || (ip != null && ip !== previousIp);

    const lastEmailAt =
      (tracking?.last_email_verification_at as string | null | undefined) ??
      (await getLastEmailVerificationAt(admin, user.id));
    const forceEmail = requireCode && needsMonthlyEmailVerification(lastEmailAt);
    const hasPasskeys = await userHasPasskeys(admin, user.id);

    if (!requireCode) {
      const loginIp = ip ?? previousIp ?? null;
      await admin.from('user_login_tracking').upsert(
        {
          user_id: user.id,
          last_login_ip: loginIp,
          last_login_at: new Date().toISOString(),
        },
        { onConflict: 'user_id' }
      );

      try {
        await admin
          .from('profiles')
          .update({
            inactivity_warning_status: null,
            inactivity_warning_error: null,
            inactivity_warned_at: null,
            inactivity_delete_after: null,
          })
          .eq('id', user.id)
          .not('inactivity_warning_status', 'is', null);
      } catch {
        // Migration add_inactivity_warnings.sql peut ne pas être appliquée
      }
    }

    return NextResponse.json({ ok: true, requireCode, forceEmail, hasPasskeys });
  } catch (e) {
    console.error('[register-login]', e);
    return NextResponse.json({ error: 'Erreur serveur' }, { status: 500 });
  }
}
