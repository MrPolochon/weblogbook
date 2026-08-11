export const dynamic = 'force-dynamic';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { NextResponse, NextRequest } from 'next/server';
import { generateAuthenticationOptions } from '@simplewebauthn/server';
import { storeWebAuthnChallenge } from '@/lib/webauthn/challenges';
import { getWebAuthnRpId } from '@/lib/webauthn/config';
import {
  getLastEmailVerificationAt,
  userHasPasskeys,
} from '@/lib/auth/complete-login-verification';
import { needsMonthlyEmailVerification } from '@/lib/webauthn/config';

/** Options d'authentification passkey (pendant pending_login_verification). */
export async function POST(req: NextRequest) {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Non authentifié' }, { status: 401 });

    const admin = createAdminClient();
    const lastEmailAt = await getLastEmailVerificationAt(admin, user.id);
    if (needsMonthlyEmailVerification(lastEmailAt)) {
      return NextResponse.json(
        {
          error:
            'Reconnexion mensuelle obligatoire : utilisez le code email pour valider votre identité.',
          forceEmail: true,
        },
        { status: 403 }
      );
    }

    const hasPasskeys = await userHasPasskeys(admin, user.id);
    if (!hasPasskeys) {
      return NextResponse.json({ error: 'Aucune passkey enregistrée.' }, { status: 404 });
    }

    const { data: passkeys } = await admin
      .from('user_passkeys')
      .select('credential_id')
      .eq('user_id', user.id);

    // internal = biométrie locale ; hybrid = QR → téléphone (caBLE).
    const allowCredentials = (passkeys ?? []).map((p) => ({
      id: p.credential_id as string,
      transports: ['internal', 'hybrid'] as ('internal' | 'hybrid')[],
    }));

    const options = await generateAuthenticationOptions({
      rpID: getWebAuthnRpId(req),
      allowCredentials,
      userVerification: 'required',
    });

    await storeWebAuthnChallenge(admin, user.id, options.challenge, 'authentication');

    return NextResponse.json({
      ...options,
      hints: ['client-device', 'hybrid'],
    });
  } catch (e) {
    console.error('[passkeys/authenticate/options]', e);
    return NextResponse.json({ error: 'Erreur serveur' }, { status: 500 });
  }
}
