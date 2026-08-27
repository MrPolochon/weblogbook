export const dynamic = 'force-dynamic';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { NextResponse, NextRequest } from 'next/server';
import { verifyAuthenticationResponse } from '@simplewebauthn/server';
import { rateLimit } from '@/lib/rate-limit';
import { consumeWebAuthnChallenge } from '@/lib/webauthn/challenges';
import {
  desktopPlatformAuthenticatorError,
  getWebAuthnOrigin,
  getWebAuthnRpId,
  nodeBase64urlToBuffer,
  needsMonthlyEmailVerification,
} from '@/lib/webauthn/config';
import {
  completeLoginVerification,
  getLastEmailVerificationAt,
} from '@/lib/auth/complete-login-verification';

/** Vérifie une authentification passkey — même effet que verify-login-code. */
export async function POST(req: NextRequest) {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Non authentifié' }, { status: 401 });

    const { allowed } = rateLimit(`verify-passkey:${user.id}`, 10, 15 * 60 * 1000);
    if (!allowed) {
      return NextResponse.json({ error: 'Trop de tentatives. Réessayez dans quelques minutes.' }, { status: 429 });
    }

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

    const body = await req.json().catch(() => ({}));
    const response = body.response;
    if (!response?.id) {
      return NextResponse.json({ error: 'Réponse WebAuthn manquante.' }, { status: 400 });
    }

    const platformError = desktopPlatformAuthenticatorError(req, response);
    if (platformError) {
      return NextResponse.json({ error: platformError }, { status: 400 });
    }

    const expectedChallenge = await consumeWebAuthnChallenge(admin, user.id, 'authentication');
    if (!expectedChallenge) {
      return NextResponse.json({ error: 'Challenge expiré. Réessayez.' }, { status: 400 });
    }

    const credentialId =
      typeof response.id === 'string' ? response.id : Buffer.from(response.id).toString('base64url');

    const { data: passkey } = await admin
      .from('user_passkeys')
      .select('id, credential_id, public_key, counter')
      .eq('user_id', user.id)
      .eq('credential_id', credentialId)
      .maybeSingle();

    if (!passkey) {
      return NextResponse.json({ error: 'Passkey inconnue.' }, { status: 400 });
    }

    const publicKeyBytes = new Uint8Array(nodeBase64urlToBuffer(passkey.public_key as string));

    const verification = await verifyAuthenticationResponse({
      response,
      expectedChallenge,
      expectedOrigin: getWebAuthnOrigin(req),
      expectedRPID: getWebAuthnRpId(req),
      requireUserVerification: true,
      credential: {
        id: passkey.credential_id as string,
        publicKey: publicKeyBytes,
        counter: Number(passkey.counter) || 0,
      },
    });

    if (!verification.verified || !verification.authenticationInfo.userVerified) {
      return NextResponse.json(
        { error: 'Vérification biométrique obligatoire. Réessayez avec empreinte, Face ID ou PIN appareil.' },
        { status: 400 }
      );
    }

    const newCounter = verification.authenticationInfo.newCounter;
    await admin
      .from('user_passkeys')
      .update({ counter: newCounter })
      .eq('id', passkey.id);

    const result = await completeLoginVerification(admin, user.id, req, {
      recordEmailVerification: false,
    });

    if (!result.ok) {
      return NextResponse.json({ error: result.error }, { status: result.status });
    }

    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error('[passkeys/authenticate/verify]', e);
    const msg = e instanceof Error ? e.message : '';
    if (/user verification|userVerified|UV/i.test(msg)) {
      return NextResponse.json(
        { error: 'Vérification biométrique obligatoire. Réessayez avec empreinte, Face ID ou PIN appareil.' },
        { status: 400 }
      );
    }
    return NextResponse.json({ error: 'Erreur serveur' }, { status: 500 });
  }
}
